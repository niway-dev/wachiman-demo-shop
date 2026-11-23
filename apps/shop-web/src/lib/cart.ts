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

/**
 * Reads what the user typed in a quantity box. Returns undefined for an empty or non-positive
 * entry (a mid-edit state), so the caller keeps the line; removal belongs to the Remove button.
 */
export function parseQuantityInput(raw: string): number | undefined {
  const value = Number(raw)
  return raw.trim() === "" || !Number.isFinite(value) || value < 1 ? undefined : value
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
  if (current === undefined) {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage blocked: start with an empty cart rather than break the page.
    }
    current = parseCart(raw)
  }
  return current
}

function write(next: readonly CartItem[]): void {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota or blocked storage: the cart still works for this page view, just not persisted.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab changed the cart: re-read it.
  const onStorage = (event: StorageEvent) => {
    // key === null means another tab called localStorage.clear().
    if (event.key !== null && event.key !== STORAGE_KEY) return
    current = parseCart(event.key === null ? null : event.newValue)
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
