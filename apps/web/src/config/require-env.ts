export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See .env.example.`);
  }
  return value;
}
