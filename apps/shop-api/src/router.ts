import {
  type AlreadyExists,
  type CouponRejected,
  type EmptyCart,
  type Forbidden,
  type InsufficientStock,
  type InvalidQuantity,
  type NotFound,
  type ProductNotFound,
  type RepositoryError,
  type Unauthenticated,
  CheckoutStore,
  CouponRepository,
  OrderRepository,
  ProductRepository,
  PromotionRepository,
  SessionReader,
  checkout,
  createCoupon,
  createPromotion,
  getCounters,
  listCoupons,
  listProducts,
  listPromotions,
  quoteCart,
  requireAdmin,
  requireSession,
  setCouponActive,
  setPromotionActive,
  updateCoupon,
  updatePromotion,
} from "@demo-shop/application"
import { contract } from "@demo-shop/api-contract"
import { ORPCError, implement } from "@orpc/server"
import { Effect, type Layer } from "effect"
import { toCouponDiscount, toCouponDto, toOrderDto, toPromotionDto, toQuoteDto } from "./dto.ts"

/** Everything the router's use cases may ask the environment for. */
export type AppServices =
  | ProductRepository
  | PromotionRepository
  | CouponRepository
  | OrderRepository
  | CheckoutStore
  | SessionReader

export interface RequestContext {
  readonly headers: Headers
}

/** Every typed failure a use case can end with. */
type AppError =
  | Unauthenticated
  | Forbidden
  | RepositoryError
  | EmptyCart
  | InvalidQuantity
  | ProductNotFound
  | InsufficientStock
  | CouponRejected
  | NotFound
  | AlreadyExists

/**
 * Builds the oRPC router for the contract. Handlers only translate: they run a
 * use case from `application` against `services` and map its tagged errors to
 * HTTP errors. Rules live in `domain` and `application`, not here.
 */
export function createRouter(services: Layer.Layer<AppServices>) {
  const os = implement(contract).$context<RequestContext>()

  /** Runs a use case; maps its typed failures to oRPC errors. */
  const run = async <A>(effect: Effect.Effect<A, AppError, AppServices>): Promise<A> => {
    const outcome = await Effect.runPromise(
      effect.pipe(
        Effect.provide(services),
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: (value) => ({ ok: true as const, value }),
        }),
      ),
    )
    if (outcome.ok) return outcome.value
    const error = outcome.error
    switch (error._tag) {
      case "Unauthenticated":
        throw new ORPCError("UNAUTHORIZED")
      case "Forbidden":
        throw new ORPCError("FORBIDDEN")
      case "RepositoryError":
        console.error("repository error", error.cause)
        throw new ORPCError("INTERNAL_SERVER_ERROR")
      case "EmptyCart":
        throw new ORPCError("EMPTY_CART", { status: 400 })
      case "InvalidQuantity":
        throw new ORPCError("INVALID_QUANTITY", { status: 400 })
      case "ProductNotFound":
        throw new ORPCError("PRODUCT_NOT_FOUND", {
          status: 404,
          data: { productId: error.productId },
        })
      case "InsufficientStock":
        throw new ORPCError("OUT_OF_STOCK", {
          status: 409,
          data: {
            productId: error.productId,
            available: error.available,
            requested: error.requested,
          },
        })
      case "CouponRejected":
        throw new ORPCError("COUPON_REJECTED", { status: 422, data: { reason: error.reason } })
      case "NotFound":
        throw new ORPCError("NOT_FOUND")
      case "AlreadyExists":
        throw new ORPCError("CONFLICT")
    }
  }

  return os.router({
    products: {
      list: os.products.list.handler(async () => {
        const products = await run(listProducts())
        return products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          priceMinor: product.price,
          stock: product.stock,
        }))
      }),
    },
    cart: {
      quote: os.cart.quote.handler(async ({ input }) => {
        const { cart, priced } = await run(quoteCart(input))
        return toQuoteDto(cart, priced)
      }),
      checkout: os.cart.checkout.handler(async ({ input, context }) => {
        const { order, cart, priced } = await run(checkout(context.headers, input))
        return toOrderDto(order, cart, priced)
      }),
    },
    me: os.me.handler(async ({ context }) => {
      const session = await run(requireSession(context.headers))
      return { id: session.userId, email: session.email, name: session.name, role: session.role }
    }),
    admin: {
      ping: os.admin.ping.handler(async ({ context }) => {
        const session = await run(requireAdmin(context.headers))
        return { ok: true as const, by: session.email }
      }),
      counters: os.admin.counters.handler(({ context }) => run(getCounters(context.headers))),
      promotions: {
        list: os.admin.promotions.list.handler(async ({ context }) =>
          (await run(listPromotions(context.headers))).map(toPromotionDto),
        ),
        create: os.admin.promotions.create.handler(async ({ input, context }) =>
          toPromotionDto(await run(createPromotion(context.headers, input))),
        ),
        update: os.admin.promotions.update.handler(async ({ input, context }) =>
          toPromotionDto(await run(updatePromotion(context.headers, input.id, input))),
        ),
        setActive: os.admin.promotions.setActive.handler(async ({ input, context }) =>
          toPromotionDto(await run(setPromotionActive(context.headers, input.id, input.active))),
        ),
      },
      coupons: {
        list: os.admin.coupons.list.handler(async ({ context }) =>
          (await run(listCoupons(context.headers))).map(toCouponDto),
        ),
        create: os.admin.coupons.create.handler(async ({ input, context }) =>
          toCouponDto(
            await run(
              createCoupon(context.headers, {
                ...input,
                discount: toCouponDiscount(input.discount),
              }),
            ),
          ),
        ),
        update: os.admin.coupons.update.handler(async ({ input, context }) =>
          toCouponDto(
            await run(
              updateCoupon(context.headers, input.code, {
                ...input,
                discount: toCouponDiscount(input.discount),
              }),
            ),
          ),
        ),
        setActive: os.admin.coupons.setActive.handler(async ({ input, context }) =>
          toCouponDto(await run(setCouponActive(context.headers, input.code, input.active))),
        ),
      },
    },
  })
}

export type Router = ReturnType<typeof createRouter>
