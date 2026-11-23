/**
 * The cart lives in the browser (localStorage) and holds only product ids and
 * quantities. It carries no price: the api prices the cart (`cart.quote`) and
 * checkout sends these lines back, so the server stays the authority.
 *
 * The functions here are pure list operations; `useCart` wires them to
 * localStorage so every component sees the same cart and the nav badge updates.
 */
import { useSyncExternalStore } from "react"

export interface CartItem {
  readonly productId: string
  readonly quantity: number
}

/** The largest quantity of one product in a cart (the contract allows the same). */
export const MAX_QUANTITY = 999

/** Adds `quantity` units of a product, merging with an existing line. */
export function addItem(items: readonly CartItem[], productId: string, quantity = 1): CartItem[] {
  return setQuantity(
    items,
    productId,
    (items.find((i) => i.productId === productId)?.quantity ?? 0) + quantity,
  )
}

/** Sets a line's quantity. A quantity of 0 or less removes the line; a large one is capped. */
export function setQuantity(
  items: readonly CartItem[],
  productId: string,
  quantity: number,
): CartItem[] {
  const rest = items.filter((item) => item.productId !== productId)
  if (!Number.isFinite(quantity) || quantity < 1) return rest
  const capped = Math.min(Math.floor(quantity), MAX_QUANTITY)
  const exists = rest.length !== items.length
  return exists
    ? items.map((item) => (item.productId === productId ? { productId, quantity: capped } : item))
    : [...rest, { productId, quantity: capped }]
}

export function removeItem(items: readonly CartItem[], productId: string): CartItem[] {
  return items.filter((item) => item.productId !== productId)
}

/** The number shown on the cart badge: total units, not distinct products. */
export function itemCount(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

/** Reads a stored cart defensively: anything that is not a valid line is dropped. */
export function parseCart(raw: string | null): CartItem[] {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.flatMap((entry): CartItem[] => {
      const { productId, quantity } = (entry ?? {}) as Record<string, unknown>
      return typeof productId === "string" &&
        typeof quantity === "number" &&
        Number.isInteger(quantity) &&
        quantity >= 1
        ? [{ productId, quantity: Math.min(quantity, MAX_QUANTITY) }]
        : []
    })
  } catch {
    return []
  }
}

const STORAGE_KEY = "demo-shop-cart"
const EMPTY: readonly CartItem[] = []
const listeners = new Set<() => void>()
let current: readonly CartItem[] | undefined

function snapshot(): readonly CartItem[] {
  current ??= parseCart(localStorage.getItem(STORAGE_KEY))
  return current
}

function write(next: readonly CartItem[]): void {
  current = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changed the cart: re-read it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    current = parseCart(event.newValue)
    listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** The shared cart. On the server (and while hydrating) it is empty. */
export function useCart() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY)
  return {
    items,
    count: itemCount(items),
    add: (productId: string, quantity = 1) => write(addItem(snapshot(), productId, quantity)),
    setQuantity: (productId: string, quantity: number) =>
      write(setQuantity(snapshot(), productId, quantity)),
    remove: (productId: string) => write(removeItem(snapshot(), productId)),
    clear: () => write([]),
  }
}
