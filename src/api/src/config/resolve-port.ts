const DEFAULT_PORT = 3000;

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
}

export function resolvePort(env: NodeJS.ProcessEnv): number {
  return parsePort(env.PORT) ?? parsePort(env.API_PORT) ?? DEFAULT_PORT;
}
