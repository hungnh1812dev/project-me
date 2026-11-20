import 'server-only';

import type { MetadataRoute } from 'next';
import { connection } from 'next/server';

import { CRAWLER_FILE_PATHS, CV_PAGE_PATH, SITEMAP_PAGE_PATHS } from '@/configs/Api.endpoints';
import type { AppEnv } from '@/configs/AppEnv.rules';
import { getServerEnv } from '@/configs/Server.env';

const ROBOTS_USER_AGENT_ALL = '*';
const ALLOW_ALL_PATH = '/';
/** Keeps crawlers off the BFF; covers `BFF_BASE_PATH` (`/api/v1`). */
const BFF_DISALLOWED_PREFIX = '/api/';
const DISALLOW_ALL_PATH = '/';

interface CrawlerOrigin {
  webOrigin: string;
}

/** Only the production stack is indexable (PS-4); every other `APP_ENV` disallows the whole site. */
export function buildRobots({
  appEnv,
  webOrigin,
}: CrawlerOrigin & { appEnv: AppEnv }): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots['rules'] =
    appEnv === 'production'
      ? {
          userAgent: ROBOTS_USER_AGENT_ALL,
          allow: ALLOW_ALL_PATH,
          disallow: [BFF_DISALLOWED_PREFIX, CV_PAGE_PATH],
        }
      : { userAgent: ROBOTS_USER_AGENT_ALL, disallow: DISALLOW_ALL_PATH };
  return { rules, sitemap: `${webOrigin}${CRAWLER_FILE_PATHS.SITEMAP}` };
}

function isCvPagePath(pagePath: string): boolean {
  return pagePath === CV_PAGE_PATH || pagePath.startsWith(`${CV_PAGE_PATH}/`);
}

export function buildSitemap({
  webOrigin,
  pagePaths,
}: CrawlerOrigin & { pagePaths: readonly string[] }): MetadataRoute.Sitemap {
  return pagePaths
    .filter((pagePath) => !isCvPagePath(pagePath))
    .map((pagePath) => ({ url: `${webOrigin}${pagePath}` }));
}

/** Per request: the origin and stack come from the runtime env, never from the build. */
export async function readRobots(): Promise<MetadataRoute.Robots> {
  await connection();
  const { appEnv, webOrigin } = getServerEnv();
  return buildRobots({ appEnv, webOrigin });
}

export async function readSitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const { webOrigin } = getServerEnv();
  return buildSitemap({ webOrigin, pagePaths: SITEMAP_PAGE_PATHS });
}
