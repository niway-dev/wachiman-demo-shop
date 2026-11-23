import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/**
 * Money and dates are stored as integers: prices in minor units, dates as
 * milliseconds since the Unix epoch (`timestamp_ms` mode maps them to Date).
 * The auth tables below follow the shape better-auth expects; they live in the
 * same file as the shop tables so one migration set creates everything.
 */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["admin", "customer"] })
    .notNull()
    .default("customer"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
})

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
)

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
)

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
)

/** A catalog product. `price_minor` is the unit price in minor units. */
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  priceMinor: integer("price_minor").notNull(),
  stock: integer("stock").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/**
 * A line promotion. `percent` is set only for `percentage`. `redemptions`
 * counts the stored orders it discounted a line of.
 */
export const promotions = sqliteTable("promotions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["percentage", "buyTwoGetOne"] }).notNull(),
  percent: integer("percent"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  redemptions: integer("redemptions").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/**
 * A coupon, keyed by its upper-case code. `percent` is set for `percentage`
 * and `amount_minor` for `fixed`. `redemptions` is compared with `usage_limit`.
 */
export const coupons = sqliteTable("coupons", {
  code: text("code").primaryKey(),
  discountKind: text("discount_kind", { enum: ["percentage", "fixed"] }).notNull(),
  percent: integer("percent"),
  amountMinor: integer("amount_minor"),
  usageLimit: integer("usage_limit").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  redemptions: integer("redemptions").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

/** A stored order. Every amount was computed by the domain's `priceCart` at checkout. */
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    totalMinor: integer("total_minor").notNull(),
    couponCode: text("coupon_code").references(() => coupons.code),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("orders_user_id_idx").on(table.userId)],
)

/** One line of an order, with the unit price and discount it was charged. */
export const orderLines = sqliteTable(
  "order_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    discountMinor: integer("discount_minor").notNull(),
    promotionId: text("promotion_id").references(() => promotions.id),
  },
  (table) => [index("order_lines_order_id_idx").on(table.orderId)],
)
