import { resolveDatabasePath } from "@demo-shop/infra-db"

export interface ApiConfig {
  /** Absolute path of the SQLite file, or ":memory:". */
  readonly databasePath: string
  readonly secret: string
  readonly port: number
  /** Origin of the web app; the browser talks to the api through it. */
  readonly webOrigin: string
  readonly apiOrigin: string
}

/**
 * Reads the api configuration from environment variables. The secret has no
 * default: a missing or short secret fails at startup, never silently signs
 * cookies with a guessable key.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ApiConfig {
  const secret = env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set to at least 32 characters. Run `bun run db:reset` to generate a local .env.",
    )
  }
  const port = Number(env.API_PORT ?? 3001)
  return {
    databasePath: resolveDatabasePath(env.DATABASE_PATH),
    secret,
    port,
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
    apiOrigin: env.API_ORIGIN ?? `http://localhost:${port}`,
  }
}
