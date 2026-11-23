import type { Product, Role } from "@demo-shop/domain"
import { Context, type Effect } from "effect"
import type { RepositoryError } from "./errors.ts"

/** The signed-in account as the application layer sees it. */
export interface Session {
  readonly userId: string
  readonly email: string
  readonly name: string
  readonly role: Role
}

/** Port: read access to the product catalog. */
export class ProductRepository extends Context.Service<
  ProductRepository,
  {
    readonly list: () => Effect.Effect<readonly Product[], RepositoryError>
  }
>()("@demo-shop/application/ProductRepository") {}

/**
 * Port: turn the credentials of a request (its cookies, carried in the
 * headers) into a session, or `null` when there is none.
 */
export class SessionReader extends Context.Service<
  SessionReader,
  {
    readonly read: (headers: Headers) => Effect.Effect<Session | null, RepositoryError>
  }
>()("@demo-shop/application/SessionReader") {}
