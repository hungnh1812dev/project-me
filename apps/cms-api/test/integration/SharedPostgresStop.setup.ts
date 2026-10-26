import './SharedPostgresStart.setup';

export default async function globalTeardown(): Promise<void> {
  await globalThis.sharedPostgres?.stop();
}
