import type { ShopDatabase } from "./database.ts"
import { coupons, products, promotions } from "./schema.ts"

/**
 * The demo catalog. Prices are in minor units (1999 is 19.99). The ids are
 * fixed so tests and screenshots can name a product.
 */
export const SEED_PRODUCTS = [
  {
    id: "prod-notebook",
    name: "Notebook",
    description: "A5 notebook, 120 dotted pages.",
    priceMinor: 1299,
    stock: 40,
  },
  {
    id: "prod-pen",
    name: "Gel pen",
    description: "Black gel pen, 0.5 mm.",
    priceMinor: 349,
    stock: 200,
  },
  {
    id: "prod-mug",
    name: "Ceramic mug",
    description: "350 ml mug, dishwasher safe.",
    priceMinor: 1850,
    stock: 25,
  },
  {
    id: "prod-bottle",
    name: "Steel bottle",
    description: "Insulated bottle, 500 ml.",
    priceMinor: 2999,
    stock: 15,
  },
  {
    id: "prod-bag",
    name: "Canvas bag",
    description: "Everyday tote bag.",
    priceMinor: 1999,
    stock: 60,
  },
  {
    id: "prod-lamp",
    name: "Desk lamp",
    description: "LED desk lamp with three brightness levels.",
    priceMinor: 4500,
    stock: 8,
  },
] as const

/** Inserts the demo catalog. Run it once on a freshly migrated database. */
export function seedProducts(db: ShopDatabase, now: Date = new Date()): void {
  db.insert(products)
    .values(SEED_PRODUCTS.map((product) => ({ ...product, createdAt: now })))
    .run()
}

/**
 * The demo promotions. Two are on and one is off, so the admin has a switch
 * to try. There is no fixed-amount promotion: the domain has only percentage
 * and buy-two-get-one line promotions; a fixed amount is a coupon (below).
 * The spend threshold needs no row: it is a rule inside `priceCart`.
 */
export const SEED_PROMOTIONS = [
  { id: "promo-spring-10", name: "Spring sale 10%", kind: "percentage", percent: 10, active: true },
  {
    id: "promo-buy-two",
    name: "Buy two, get one free",
    kind: "buyTwoGetOne",
    percent: null,
    active: true,
  },
  {
    id: "promo-clearance-25",
    name: "Clearance 25%",
    kind: "percentage",
    percent: 25,
    active: false,
  },
] as const

/**
 * The demo coupons. `WELCOME5` is valid (a fixed 5.00 off, a generous limit,
 * expires in 2099); `SAVE15` is a 15% coupon that expired on 2020-01-01.
 */
export const SEED_COUPONS = [
  {
    code: "WELCOME5",
    discountKind: "fixed",
    percent: null,
    amountMinor: 500,
    usageLimit: 1000,
    expiresAt: new Date("2099-12-31T00:00:00Z"),
  },
  {
    code: "SAVE15",
    discountKind: "percentage",
    percent: 15,
    amountMinor: null,
    usageLimit: 100,
    expiresAt: new Date("2020-01-01T00:00:00Z"),
  },
] as const

/** Inserts the demo promotions and coupons. Run it once on a freshly migrated database. */
export function seedPromotionsAndCoupons(db: ShopDatabase, now: Date = new Date()): void {
  db.insert(promotions)
    .values(SEED_PROMOTIONS.map((promotion) => ({ ...promotion, createdAt: now })))
    .run()
  db.insert(coupons)
    .values(SEED_COUPONS.map((coupon) => ({ ...coupon, createdAt: now })))
    .run()
}

/** Seeds the whole demo shop: the catalog, the promotions and the coupons. */
export function seedShop(db: ShopDatabase, now: Date = new Date()): void {
  seedProducts(db, now)
  seedPromotionsAndCoupons(db, now)
}
