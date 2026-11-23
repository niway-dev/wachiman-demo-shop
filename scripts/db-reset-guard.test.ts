import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { assertResettable } from "./db-reset-guard.ts"

const inData = join(import.meta.dir, "..", "data", "shop.db")

describe("assertResettable", () => {
  test("accepts a file under data/", () => {
    expect(() => assertResettable(inData, false)).not.toThrow()
  })

  test("refuses a path outside data/ unless explicitly allowed", () => {
    expect(() => assertResettable("/tmp/other.db", false)).toThrow("only deletes files under")
    expect(() => assertResettable("/tmp/other.db", true)).not.toThrow()
  })

  test("refuses a path that climbs out of data/", () => {
    expect(() =>
      assertResettable(join(import.meta.dir, "..", "data", "..", "x.db"), false),
    ).toThrow()
  })

  test("refuses :memory: even when outside paths are allowed", () => {
    expect(() => assertResettable(":memory:", true)).toThrow("cannot be reset")
  })
})
