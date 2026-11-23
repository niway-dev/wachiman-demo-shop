import { seedDemoUsers } from "@demo-shop/infra-auth"
import { seedShop } from "@demo-shop/infra-db"
import { type ShopApp, createApp } from "./app.ts"

let cached: Promise<ShopApp> | undefined

/**
 * The app every api test uses. It is built once per process (the promise is
 * memoized): an in-memory SQLite database, migrated and seeded with the demo
 * catalog, promotions, coupons and the two demo users. Tests must not mutate shared state.
 */
export function getTestApp(): Promise<ShopApp> {
  cached ??= buildTestApp()
  return cached
}

async function buildTestApp(): Promise<ShopApp> {
  const shop = createApp({
    databasePath: ":memory:",
    secret: "test-secret-test-secret-test-secret-123",
    port: 0,
    webOrigin: "http://localhost:3000",
    apiOrigin: "http://localhost:3001",
  })
  seedShop(shop.handle.db)
  await seedDemoUsers(shop.auth, shop.handle.db)
  return shop
}
