import { answerUptimeCheck } from '@/features/status/Health.server';

export const dynamic = 'force-dynamic';

export const GET = answerUptimeCheck;
export const HEAD = answerUptimeCheck;
