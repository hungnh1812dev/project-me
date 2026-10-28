import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { NO_STORE_HEADER } from '../../../common/constants/Http.constants';
import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  TEN_MINUTES_MS,
  type RateLimitRule,
} from '../../../common/constants/Limits.constants';
import { Throttle } from '../../../common/guards/Throttle.guard';
import {
  ClientIpResolver,
  clientMetaOf,
} from '../../../common/http/ClientIp.resolver';
import { parseRequest } from '../../../common/http/RequestParsing.rules';
import { requireOwnerActor } from '../../access';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
  PASSWORD_MAX_LENGTH,
  TOTP,
} from '../../identity';
import {
  BackupsService,
  type BackupListing,
  type DownloadLinkView,
} from '../application/Backups.service';
import { BACKUP_KEY_MAX_LENGTH } from '../domain/Backups.constants';

const BACKUPS_ROUTES = {
  ROOT: 'backups',
  DOWNLOAD_LINKS: 'download-links',
} as const;

export const BACKUPS_RATE_LIMIT_POLICIES = {
  /** `GET /backups`: one bucket listing per call, so a modest per-actor cap. */
  BACKUPS_LIST: [
    {
      name: 'backups-list:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 30,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  /** `POST /backups/download-links`: each try may test a password and a code. */
  BACKUP_LINK: [
    {
      name: 'backup-link:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 10,
      windowMs: TEN_MINUTES_MS,
    },
    {
      name: 'backup-link:actor',
      keySource: RATE_LIMIT_KEY_SOURCES.ACTOR,
      maxHits: 5,
      windowMs: TEN_MINUTES_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/** Shape checks only: the key pattern needs the configured prefix and is checked by the service. */
const downloadLinkSchema = z.object({
  key: z.string().min(1).max(BACKUP_KEY_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: z
    .string()
    .trim()
    .max(TOTP.DIGITS * 2),
});

/** SPEC §9 "Backups" (D20). Owner only, a hard role check no grant can open. */
@Controller(BACKUPS_ROUTES.ROOT)
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get()
  @Throttle(BACKUPS_RATE_LIMIT_POLICIES.BACKUPS_LIST)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  list(@Req() req: AuthenticatedRequest): Promise<BackupListing> {
    requireOwnerActor(req.user.actor);
    return this.backups.list();
  }

  /** 201 with a presigned URL valid for a fixed 60 s; the URL is never stored or logged. */
  @Post(BACKUPS_ROUTES.DOWNLOAD_LINKS)
  @Throttle(BACKUPS_RATE_LIMIT_POLICIES.BACKUP_LINK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard)
  createDownloadLink(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<DownloadLinkView> {
    const actor = requireOwnerActor(req.user.actor);
    return this.backups.createDownloadLink(
      { actor, accountDocumentId: req.user.accountId },
      parseRequest(downloadLinkSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }
}
