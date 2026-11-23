import { Effect } from "effect"
import { NotFound } from "./errors.ts"
import { PromotionRepository, type PromotionRule } from "./ports.ts"
import { requireAdmin } from "./session.ts"

/** Use case (admin): every promotion with its switch and its redemption count. */
export const listPromotions = (headers: Headers) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    return yield* (yield* PromotionRepository).list()
  })

/** Use case (admin): creates a promotion with a new id and no redemptions. */
export const createPromotion = (
  headers: Headers,
  input: { readonly name: string; readonly rule: PromotionRule; readonly active: boolean },
) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const repository = yield* PromotionRepository
    const record = {
      ...input.rule,
      id: crypto.randomUUID(),
      name: input.name.trim(),
      active: input.active,
      redemptions: 0,
    }
    yield* repository.create(record)
    return record
  })

/** Use case (admin): renames a promotion or changes its rule. Fails with `NotFound`. */
export const updatePromotion = (
  headers: Headers,
  id: string,
  input: { readonly name: string; readonly rule: PromotionRule },
) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const repository = yield* PromotionRepository
    const updated = yield* repository.update(id, { name: input.name.trim(), rule: input.rule })
    if (updated === undefined) return yield* new NotFound({ kind: "promotion", id })
    return updated
  })

/** Use case (admin): switches a promotion on or off. Checkout only sees the ones that are on. */
export const setPromotionActive = (headers: Headers, id: string, active: boolean) =>
  Effect.gen(function* () {
    yield* requireAdmin(headers)
    const repository = yield* PromotionRepository
    const updated = yield* repository.update(id, { active })
    if (updated === undefined) return yield* new NotFound({ kind: "promotion", id })
    return updated
  })
