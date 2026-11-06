import 'server-only';

import { z } from 'zod';

import {
  BFF_BODY_MAX_BYTES,
  BFF_RATE_LIMITS,
  CACHE_CONTROL_HEADER,
  CACHE_CONTROL_NO_STORE,
  CONTENT_LENGTH_HEADER,
  CONTENT_TYPE_HEADER,
  JSON_MEDIA_TYPE,
  ORIGIN_HEADER,
  RATE_LIMIT_MAX_KEYS,
  SEC_FETCH_SITE_HEADER,
  SEC_FETCH_SITE_SAME_ORIGIN,
} from '@/configs/Http.constants';
import { TurnstileAction } from '@/configs/Security.constants';
import { getServerEnv } from '@/configs/Server.env';

import { verifyHumanCheck } from '../restful/Turnstile.client';
import { BffError, bffErrorResponse } from './Bff.errors';
import { visitorIpOf } from './ClientIp.rules';
import { FixedWindowRateLimiter } from './RateLimit.rules';

export type BffMethod = 'GET' | 'POST';
export type BffBucket = keyof typeof BFF_RATE_LIMITS;
export type HumanCheckAction = TurnstileAction;

/** Field of the request body that carries the Turnstile token; never passed to `handle`. */
export const HUMAN_CHECK_TOKEN_FIELD = 'humanCheckToken';

export interface BffContext<TBody> {
  request: Request;
  /** The parsed body without the human-check token; `{}` when the route has no body schema. */
  body: TBody;
  /** Undefined when no trusted address was found. */
  visitorIp: string | undefined;
}

export interface BffRouteOptions<TSchema extends z.ZodObject> {
  methods: readonly BffMethod[];
  bucket: BffBucket;
  /** Applied with `.strict()`: an unknown key is refused. */
  bodySchema?: TSchema;
  /** The route needs a Turnstile token for this action in `humanCheckToken`. */
  humanCheckAction?: HumanCheckAction;
  handle: (context: BffContext<z.output<TSchema>>) => Promise<Response>;
}

type BffHandler = (request: Request) => Promise<Response>;
export type BffRouteHandlers = Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', BffHandler>;

const HANDLED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const STATE_CHANGING_METHODS: readonly string[] = ['POST'];
const UNKNOWN_VISITOR_KEY = 'unknown';
const NO_BODY_SCHEMA = z.object({});

// One limiter per bucket for the whole process: the login routes share `auth`.
const limiters: Record<BffBucket, FixedWindowRateLimiter> = {
  auth: new FixedWindowRateLimiter({ ...BFF_RATE_LIMITS.auth, maxKeys: RATE_LIMIT_MAX_KEYS }),
  read: new FixedWindowRateLimiter({ ...BFF_RATE_LIMITS.read, maxKeys: RATE_LIMIT_MAX_KEYS }),
};

function assertSameOrigin(request: Request, webOrigin: string): void {
  const fetchSite = request.headers.get(SEC_FETCH_SITE_HEADER);
  const isForeignFetch = fetchSite !== null && fetchSite !== SEC_FETCH_SITE_SAME_ORIGIN;
  if (request.headers.get(ORIGIN_HEADER) !== webOrigin || isForeignFetch) {
    throw new BffError('BFF_ORIGIN_NOT_ALLOWED');
  }
}

function assertJsonContentType(request: Request): void {
  const mediaType = request.headers.get(CONTENT_TYPE_HEADER)?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== JSON_MEDIA_TYPE) throw new BffError('BFF_UNSUPPORTED_MEDIA_TYPE');
}

function assertDeclaredLengthWithinCap(request: Request): void {
  const declared = Number(request.headers.get(CONTENT_LENGTH_HEADER));
  if (declared > BFF_BODY_MAX_BYTES) throw new BffError('BFF_BODY_TOO_LARGE');
}

/** Reads the body but stops, whatever Content-Length says, once the cap is passed. */
async function readCappedText(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (reader === undefined) return '';
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    byteCount += value.byteLength;
    if (byteCount > BFF_BODY_MAX_BYTES) {
      await reader.cancel();
      throw new BffError('BFF_BODY_TOO_LARGE');
    }
    text += decoder.decode(value, { stream: true });
  }
}

function consumeRateLimit(bucket: BffBucket, visitorIp: string | undefined): void {
  const decision = limiters[bucket].consume(visitorIp ?? UNKNOWN_VISITOR_KEY);
  if (!decision.isAllowed) throw BffError.rateLimited(decision.retryAfterSeconds);
}

async function parseBody(text: string, schema: z.ZodObject): Promise<Record<string, unknown>> {
  let json: unknown = {};
  if (text.trim() !== '') {
    try {
      json = JSON.parse(text);
    } catch {
      throw new BffError('BFF_INVALID_REQUEST');
    }
  }
  const parsed = await schema.strict().safeParseAsync(json);
  if (!parsed.success) throw new BffError('BFF_INVALID_REQUEST');
  return parsed.data;
}

function withoutHumanCheckToken(body: Record<string, unknown>): Record<string, unknown> {
  const { [HUMAN_CHECK_TOKEN_FIELD]: _token, ...rest } = body;
  return rest;
}

async function runPipeline<TSchema extends z.ZodObject>(
  options: BffRouteOptions<TSchema>,
  request: Request,
): Promise<Response> {
  const env = getServerEnv();
  if (!options.methods.includes(request.method as BffMethod)) {
    throw BffError.methodNotAllowed(options.methods);
  }
  const hasBody = STATE_CHANGING_METHODS.includes(request.method);
  let bodyText = '';
  if (hasBody) {
    assertSameOrigin(request, env.webOrigin);
    assertJsonContentType(request);
    assertDeclaredLengthWithinCap(request);
    bodyText = await readCappedText(request);
  }
  const visitorIp = visitorIpOf(request.headers, env);
  consumeRateLimit(options.bucket, visitorIp);
  const body = hasBody
    ? await parseBody(bodyText, options.bodySchema ?? NO_BODY_SCHEMA)
    : ({} as Record<string, unknown>);
  if (options.humanCheckAction !== undefined) {
    await verifyHumanCheck(body[HUMAN_CHECK_TOKEN_FIELD], options.humanCheckAction, visitorIp);
  }
  return options.handle({
    request,
    body: withoutHumanCheckToken(body) as z.output<TSchema>,
    visitorIp,
  });
}

/** Refusals log the route and code only: no body, token, code, cookie, email or password. */
function logRefusal(request: Request, errorCode: string): void {
  console.warn(`[bff] ${request.method} ${new URL(request.url).pathname} ${errorCode}`);
}

/**
 * Builds the Next route handlers of one BFF route and runs the pipeline of
 * `docs/apps/web/FLOW.md` in order. A route file exports them:
 * `export const { GET, POST, PUT, PATCH, DELETE } = defineBffRoute({ ... })`.
 */
export function defineBffRoute<TSchema extends z.ZodObject = z.ZodObject<Record<string, never>>>(
  options: BffRouteOptions<TSchema>,
): BffRouteHandlers {
  const handler: BffHandler = async (request) => {
    let response: Response;
    try {
      response = await runPipeline(options, request);
    } catch (error) {
      const bffError = error instanceof BffError ? error : new BffError('BFF_UPSTREAM_FAILED');
      logRefusal(request, bffError.errorCode);
      response = bffErrorResponse(bffError);
    }
    response.headers.set(CACHE_CONTROL_HEADER, CACHE_CONTROL_NO_STORE);
    return response;
  };
  return Object.fromEntries(HANDLED_METHODS.map((method) => [method, handler])) as BffRouteHandlers;
}
