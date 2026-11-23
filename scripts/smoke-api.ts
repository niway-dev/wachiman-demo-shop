/**
 * Starts the BUILT api (`apps/shop-api/dist/main.js`, from `bun run build`) over an
 * in-memory database and a generated secret, waits for the product list to answer 200,
 * then stops it. Source tests run from source and cannot see bundling mistakes such as
 * a migrations folder that resolves to the wrong place; this can.
 */
import { randomBytes } from "node:crypto"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const entry = join(root, "apps", "shop-api", "dist", "main.js")
const port = 4000 + Math.floor(Math.random() * 1000)
const url = `http://127.0.0.1:${port}/rpc/products/list`
const timeoutMs = 20_000

const child = Bun.spawn(["bun", entry], {
  cwd: root,
  env: {
    ...process.env,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    DATABASE_PATH: ":memory:",
    API_PORT: String(port),
  },
  stdout: "inherit",
  stderr: "inherit",
})

let exited = false
void child.exited.then(() => {
  exited = true
})

async function waitForProducts(): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(url, { method: "POST" })
      if (response.status === 200) return true
      console.error(`smoke: ${url} answered ${response.status}`)
    } catch {
      // not listening yet
    }
    await Bun.sleep(250)
  }
  return false
}

const ok = await waitForProducts()
child.kill()
await child.exited
if (!ok) {
  console.error(exited ? "smoke: the built api exited before answering" : "smoke: timed out")
  process.exit(1)
}
console.log("smoke: the built api answered the product list with 200")
