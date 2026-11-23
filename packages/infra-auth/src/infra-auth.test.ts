import { describe, expect, test } from "bun:test"
import { getSession } from "@demo-shop/application"
import { migrateDatabase, openDatabase } from "@demo-shop/infra-db"
import { Effect } from "effect"
import { createAuth } from "./auth.ts"
import { DEMO_USERS, seedDemoUsers } from "./demo-users.ts"
import { SessionReaderLive } from "./session-reader.ts"

async function setup() {
  const handle = openDatabase(":memory:")
  migrateDatabase(handle)
  const auth = createAuth({
    db: handle.db,
    secret: "test-secret-test-secret-test-secret-123",
    baseURL: "http://localhost:3000",
  })
  await seedDemoUsers(auth, handle.db)
  return { handle, auth }
}

async function signIn(
  auth: Awaited<ReturnType<typeof setup>>["auth"],
  email: string,
  password: string,
) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  return new Headers({ cookie })
}

describe("infra-auth", () => {
  test("seeded users sign in and read back their role", async () => {
    const { auth } = await setup()
    for (const demo of DEMO_USERS) {
      const headers = await signIn(auth, demo.email, demo.password)
      const session = await Effect.runPromise(
        getSession(headers).pipe(Effect.provide(SessionReaderLive(auth))),
      )
      expect(session?.email).toBe(demo.email)
      expect(session?.role).toBe(demo.role)
    }
  })

  test("a visitor has no session", async () => {
    const { auth } = await setup()
    const session = await Effect.runPromise(
      getSession(new Headers()).pipe(Effect.provide(SessionReaderLive(auth))),
    )
    expect(session).toBeNull()
  })

  test("sign-up cannot choose a role", async () => {
    const { auth, handle } = await setup()
    await auth.api.signUpEmail({
      body: {
        name: "Eve",
        email: "eve@example.com",
        password: "a-long-password",
        role: "admin",
      } as never,
    })
    const row = handle.sqlite
      .query<{ role: string }, [string]>("select role from user where email = ?")
      .get("eve@example.com")
    expect(row?.role).toBe("customer")
  })

  test("the better-auth tables live in the shop database", async () => {
    const { handle } = await setup()
    const accounts = handle.sqlite
      .query<{ n: number }, []>("select count(*) as n from account")
      .get()
    expect(accounts?.n).toBe(DEMO_USERS.length)
  })
})
