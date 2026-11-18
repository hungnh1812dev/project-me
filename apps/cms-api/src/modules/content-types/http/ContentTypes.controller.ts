import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { SLUG_PARAM } from '../../../common/constants/Api.constants';
import { NO_STORE_HEADER } from '../../../common/constants/Http.constants';
import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  type RateLimitRule,
} from '../../../common/constants/Limits.constants';
import { Throttle } from '../../../common/guards/Throttle.guard';
import { parseRequest } from '../../../common/http/RequestParsing.rules';
import { requireOwnerActor } from '../../access';
import { JwtAuthGuard, type AuthenticatedRequest } from '../../identity';
import { ContentTypesService } from '../application/ContentTypes.service';
import {
  DEFINITION_VALIDATION_MODES,
  DefinitionValidationService,
  type DefinitionValidationResult,
} from '../application/DefinitionValidation.service';
import type { ContentTypeView } from '../domain/ContentTypeView.rules';

/** SPEC §9 content types, read-only. `:slug` is a registry slug. */
export const CONTENT_TYPES_ROUTES = {
  ROOT: 'content-types',
  BY_SLUG: ':slug',
  VALIDATE: 'validate',
} as const;

export const CONTENT_TYPES_RATE_LIMIT_POLICIES = {
  /** `POST /content-types/validate` (SB-10, D24): per owner, in memory. */
  DEFINITION_VALIDATE: [
    {
      name: 'definition-validate:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 120,
      windowMs: ONE_MINUTE_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/** `POST /content-types/validate`. Strict: unknown keys are rejected. */
const validateDefinitionSchema = z.strictObject({
  definition: z.record(z.string(), z.unknown()),
  mode: z.enum([DEFINITION_VALIDATION_MODES.CREATE, DEFINITION_VALIDATION_MODES.UPDATE]),
});

/**
 * SPEC §9 content types, read-only. No `@RequirePermission`: the
 * subject is per type, so the service filters by `read` on each slug and
 * answers 404 for a type the caller cannot read.
 */
@Controller(CONTENT_TYPES_ROUTES.ROOT)
@UseGuards(JwtAuthGuard)
export class ContentTypesController {
  constructor(
    private readonly contentTypes: ContentTypesService,
    private readonly definitionValidation: DefinitionValidationService,
  ) {}

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  async list(@Req() req: AuthenticatedRequest): Promise<{ data: ContentTypeView[] }> {
    return { data: await this.contentTypes.list(req.user.actor) };
  }

  @Get(CONTENT_TYPES_ROUTES.BY_SLUG)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  get(@Req() req: AuthenticatedRequest, @Param(SLUG_PARAM) slug: string): Promise<ContentTypeView> {
    return this.contentTypes.get(req.user.actor, slug);
  }

  /** Owner only (SB-10): the rule runs before the body is read, so a bad body is 403 for others. */
  @Post(CONTENT_TYPES_ROUTES.VALIDATE)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(CONTENT_TYPES_RATE_LIMIT_POLICIES.DEFINITION_VALIDATE)
  validate(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<DefinitionValidationResult> {
    requireOwnerActor(req.user.actor);
    return this.definitionValidation.validate(parseRequest(validateDefinitionSchema, body));
  }
}
