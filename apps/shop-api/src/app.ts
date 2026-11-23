import { SessionReaderLive, createAuth } from "@demo-shop/infra-auth"
import {
  CheckoutStoreLive,
  CouponRepositoryLive,
  type DatabaseHandle,
  OrderRepositoryLive,
  ProductRepositoryLive,
  PromotionRepositoryLive,
  migrateDatabase,
  openDatabase,
} from "@demo-shop/infra-db"
import { RPCHandler } from "@orpc/server/fetch"
import { Layer } from "effect"
import { Hono } from "hono"
import { type ApiConfig, SHOP_ADMIN_TOKEN, loadConfig } from "./config.ts"
import { createRouter } from "./router.ts"

export interface ShopApp {
  readonly app: Hono
  readonly handle: DatabaseHandle
  readonly auth: ReturnType<typeof createAuth>
  readonly config: ApiConfig
}

/**
 * Builds the api: a Hono app with better-auth mounted at `/api/auth/*` and the
 * oRPC router at `/rpc/*`. Pass a config to build it over a different database
 * (the tests use `:memory:`); without one it reads the environment. It applies
 * pending migrations, which is a no-op after `bun run db:reset`.
 */
export function createApp(config: ApiConfig = loadConfig()): ShopApp {
  const handle = openDatabase(config.databasePath)
  migrateDatabase(handle)

  const auth = createAuth({
    db: handle.db,
    secret: config.secret,
    baseURL: config.webOrigin,
    trustedOrigins: [config.webOrigin, config.apiOrigin],
  })

  const services = Layer.mergeAll(
    ProductRepositoryLive(handle.db),
    PromotionRepositoryLive(handle.db),
    CouponRepositoryLive(handle.db),
    OrderRepositoryLive(handle.db),
    CheckoutStoreLive(handle),
    SessionReaderLive(auth, SHOP_ADMIN_TOKEN),
  )
  const rpc = new RPCHandler(createRouter(services))

  const app = new Hono()
  app.get("/health", (c) => c.json({ ok: true }))
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  app.use("/rpc/*", async (c, next) => {
    const result = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers },
    })
    if (result.matched) return c.newResponse(result.response.body, result.response)
    return next()
  })

  return { app, handle, auth, config }
}
