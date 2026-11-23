import { type Product, type Role, money } from "@demo-shop/domain"
import { Effect, Layer } from "effect"
import {
  type CheckoutTransaction,
  CheckoutStore,
  CouponRepository,
  type CouponRecord,
  type NewOrder,
  OrderRepository,
  ProductRepository,
  type PromotionRecord,
  PromotionRepository,
  type Session,
  SessionReader,
} from "./ports.ts"

/** In-memory catalog for tests. */
export const productRepositoryInMemory = (products: readonly Product[]) =>
  Layer.succeed(ProductRepository, { list: () => Effect.succeed(products) })

/**
 * In-memory session reader for tests: a request is signed in when its
 * `x-test-role` header holds a role.
 */
export const sessionReaderInMemory = () =>
  Layer.succeed(SessionReader, {
    read: (headers) =>
      Effect.sync(() => {
        const role = headers.get("x-test-role")
        if (role !== "admin" && role !== "customer") return null
        return sessionFor(role)
      }),
  })

export function sessionFor(role: Role): Session {
  return { userId: `user-${role}`, email: `${role}@example.com`, name: role, role }
}

/** A tiny fixture catalog. */
export const sampleProducts: readonly Product[] = [
  { id: "p2", name: "Mug", description: "A mug", price: money(1299), stock: 5 },
  { id: "p1", name: "apple", description: "An apple", price: money(150), stock: 100 },
]

function restore<K, V>(target: Map<K, V>, saved: Map<K, V>): void {
  target.clear()
  for (const [key, value] of saved) target.set(key, value)
}

/** What an in-memory shop starts with. */
export interface InMemoryShopSeed {
  readonly products?: readonly Product[]
  readonly promotions?: readonly PromotionRecord[]
  readonly coupons?: readonly CouponRecord[]
}

/**
 * An in-memory shop for use-case tests: every repository port and the
 * `CheckoutStore` over plain maps. `transaction` snapshots the maps and
 * restores them when its body fails, like the SQLite transaction does. Read
 * the maps and `orders` afterwards to check what was stored.
 */
export function inMemoryShop(seed: InMemoryShopSeed = {}) {
  const products = new Map((seed.products ?? []).map((p) => [p.id, p]))
  const promotions = new Map((seed.promotions ?? []).map((p) => [p.id, p]))
  const coupons = new Map((seed.coupons ?? []).map((c) => [c.code, c]))
  const orders: NewOrder[] = []

  const reader = {
    products: (ids: readonly string[]) =>
      Effect.sync(() => ids.flatMap((id) => products.get(id) ?? [])),
    activePromotions: () => Effect.sync(() => [...promotions.values()].filter((p) => p.active)),
    coupon: (code: string) => Effect.sync(() => coupons.get(code)),
  }
  const tx: CheckoutTransaction = {
    ...reader,
    saveStock: (productId, stock) =>
      Effect.sync(() => {
        products.set(productId, { ...products.get(productId)!, stock })
      }),
    saveOrder: (order) => Effect.sync(() => void orders.push(order)),
    saveCouponRedemptions: (code, redemptions) =>
      Effect.sync(() => {
        coupons.set(code, { ...coupons.get(code)!, redemptions })
      }),
    countPromotionRedemptions: (ids) =>
      Effect.sync(() => {
        for (const id of ids) {
          const promotion = promotions.get(id)!
          promotions.set(id, { ...promotion, redemptions: promotion.redemptions + 1 })
        }
      }),
  }

  const layer = Layer.mergeAll(
    Layer.succeed(ProductRepository, {
      list: () => Effect.sync(() => [...products.values()]),
    }),
    Layer.succeed(PromotionRepository, {
      list: () => Effect.sync(() => [...promotions.values()]),
      create: (record) => Effect.sync(() => void promotions.set(record.id, record)),
      update: (id, { name, rule, active }) =>
        Effect.sync(() => {
          const current = promotions.get(id)
          if (current === undefined) return undefined
          const { percent: _stale, ...rest } = current as PromotionRecord & { percent?: number }
          const next = {
            ...(rule === undefined ? current : rest),
            ...rule,
            name: name ?? current.name,
            active: active ?? current.active,
          } as PromotionRecord
          promotions.set(id, next)
          return next
        }),
    }),
    Layer.succeed(CouponRepository, {
      list: () => Effect.sync(() => [...coupons.values()]),
      find: (code) => Effect.sync(() => coupons.get(code)),
      create: (record) => Effect.sync(() => void coupons.set(record.code, record)),
      update: (code, changes) =>
        Effect.sync(() => {
          const current = coupons.get(code)
          if (current === undefined) return undefined
          const next = { ...current, ...changes }
          coupons.set(code, next)
          return next
        }),
    }),
    Layer.succeed(OrderRepository, { count: () => Effect.sync(() => orders.length) }),
    Layer.succeed(CheckoutStore, {
      reader,
      transaction: (body) =>
        Effect.suspend(() => {
          const before = {
            products: new Map(products),
            promotions: new Map(promotions),
            coupons: new Map(coupons),
            orders: orders.length,
          }
          return body(tx).pipe(
            Effect.onError(() =>
              Effect.sync(() => {
                restore(products, before.products)
                restore(promotions, before.promotions)
                restore(coupons, before.coupons)
                orders.length = before.orders
              }),
            ),
          )
        }),
    }),
    sessionReaderInMemory(),
  )

  return { layer, products, promotions, coupons, orders }
}

type InMemoryShop = ReturnType<typeof inMemoryShop>

/** Runs a use case against an in-memory shop and returns its result. */
export const succeedsIn = <A, E>(
  shop: InMemoryShop,
  effect: Effect.Effect<A, E, Layer.Success<InMemoryShop["layer"]>>,
): Promise<A> => Effect.runPromise(Effect.provide(effect, shop.layer))

/** Runs a use case against an in-memory shop and returns the typed error it fails with. */
export const failsIn = <A, E>(
  shop: InMemoryShop,
  effect: Effect.Effect<A, E, Layer.Success<InMemoryShop["layer"]>>,
): Promise<E> => Effect.runPromise(Effect.flip(Effect.provide(effect, shop.layer)))
