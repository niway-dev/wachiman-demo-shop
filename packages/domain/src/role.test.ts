import { describe, expect, test } from "bun:test"
import { canUseAdminRoutes, isRole } from "./role.ts"

describe("role", () => {
  test("isRole accepts only the two roles", () => {
    expect(isRole("admin")).toBe(true)
    expect(isRole("customer")).toBe(true)
    expect(isRole("root")).toBe(false)
    expect(isRole(undefined)).toBe(false)
  })

  test("only an admin may use admin routes", () => {
    expect(canUseAdminRoutes("admin")).toBe(true)
    expect(canUseAdminRoutes("customer")).toBe(false)
    expect(canUseAdminRoutes(undefined)).toBe(false)
  })
})
