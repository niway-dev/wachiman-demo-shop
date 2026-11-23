import { createAuthClient } from "better-auth/react"

/** better-auth browser client. Only used on user actions, so it always has a window. */
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
})
