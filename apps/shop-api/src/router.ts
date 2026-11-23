import {
  Forbidden,
  ProductRepository,
  RepositoryError,
  SessionReader,
  Unauthenticated,
  listProducts,
  requireAdmin,
  requireSession,
} from "@demo-shop/application"
import { contract } from "@demo-shop/api-contract"
import { ORPCError, implement } from "@orpc/server"
import { Effect, type Layer } from "effect"

/** Everything the router's use cases may ask the environment for. */
export type AppServices = ProductRepository | SessionReader

export interface RequestContext {
  readonly headers: Headers
}

/**
 * Builds the oRPC router for the contract. Handlers only translate: they run a
 * use case from `application` against `services` and map its tagged errors to
 * HTTP errors. Rules live in `domain` and `application`, not here.
 */
export function createRouter(services: Layer.Layer<AppServices>) {
  const os = implement(contract).$context<RequestContext>()

  /** Runs a use case; maps its typed failures to oRPC errors. */
  const run = async <A>(
    effect: Effect.Effect<A, Unauthenticated | Forbidden | RepositoryError, AppServices>,
  ): Promise<A> => {
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
    switch (outcome.error._tag) {
      case "Unauthenticated":
        throw new ORPCError("UNAUTHORIZED")
      case "Forbidden":
        throw new ORPCError("FORBIDDEN")
      case "RepositoryError":
        console.error("repository error", outcome.error.cause)
        throw new ORPCError("INTERNAL_SERVER_ERROR")
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
    me: os.me.handler(async ({ context }) => {
      const session = await run(requireSession(context.headers))
      return { id: session.userId, email: session.email, name: session.name, role: session.role }
    }),
    admin: {
      ping: os.admin.ping.handler(async ({ context }) => {
        const session = await run(requireAdmin(context.headers))
        return { ok: true as const, by: session.email }
      }),
    },
  })
}

export type Router = ReturnType<typeof createRouter>
