import { expect, test } from "bun:test"
import { nextStock } from "../packages/domain/src/index.ts"

test("reserved units in other carts do not reduce the stored stock", () => {
  const next = nextStock as (...args: number[]) => unknown
  expect(next(10, 3, 2)).toEqual({ ok: true, value: 7 })
})
