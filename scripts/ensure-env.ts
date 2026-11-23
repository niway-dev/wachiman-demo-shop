import { existsSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"

const root = join(import.meta.dir, "..")
const envPath = join(root, ".env")

/**
 * Creates a local, gitignored settings file from the committed example when it
 * is missing, with a freshly generated random secret. An existing file is never
 * touched. Returns true when it created one.
 */
export async function ensureEnv(): Promise<boolean> {
  if (existsSync(envPath)) return false
  const example = await Bun.file(join(root, ".env.example")).text()
  const secret = randomBytes(32).toString("hex")
  const content = example.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`)
  await Bun.write(envPath, content)
  return true
}

if (import.meta.main) {
  const created = await ensureEnv()
  console.log(created ? "created local settings file with a generated secret" : "settings file exists")
}
