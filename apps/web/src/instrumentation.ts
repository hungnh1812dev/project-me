/** Runs once when the server starts. */
export async function register(): Promise<void> {
  // The build has no runtime env (docker build only gets NEXT_PUBLIC_*).
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { assertServerEnv } = await import('./InstrumentationNode.setup');
    assertServerEnv();
  }
}
