/**
 * The HTTP contract shared by the web app and the api. It is the only thing
 * both apps import for HTTP: the web builds a typed client from it and the api
 * implements it. Schemas are zod (oRPC reads any Standard Schema; zod keeps the
 * contract package free of Effect). Amounts cross the wire as integers in minor
 * units, never as floats.
 */
import { oc } from "@orpc/contract"
import { ROLES } from "@demo-shop/domain"
import { z } from "zod"

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Unit price in minor units. The api is the only source of a price. */
  priceMinor: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
})

export const CurrentUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
})

export const AdminPingSchema = z.object({
  ok: z.literal(true),
  /** The email of the admin who called. */
  by: z.string(),
})

export type ProductDto = z.infer<typeof ProductSchema>
export type CurrentUserDto = z.infer<typeof CurrentUserSchema>
export type AdminPingDto = z.infer<typeof AdminPingSchema>

const base = oc.errors({
  UNAUTHORIZED: { status: 401, message: "Sign in to continue" },
  FORBIDDEN: { status: 403, message: "Your role cannot use this route" },
})

export const contract = {
  products: {
    /** Public: the catalog, no session needed. */
    list: oc.output(z.array(ProductSchema)),
  },
  /** Authenticated: the signed-in account. 401 without a session. */
  me: base.output(CurrentUserSchema),
  admin: {
    /** Admin only: 401 without a session, 403 for a customer. */
    ping: base.output(AdminPingSchema),
  },
}

export type Contract = typeof contract
