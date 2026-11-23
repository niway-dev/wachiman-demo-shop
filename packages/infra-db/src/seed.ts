import type { ShopDatabase } from "./database.ts"
import { products } from "./schema.ts"

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
