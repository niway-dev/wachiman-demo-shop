import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { authClient } from "../lib/auth-client.ts"

export const Route = createFileRoute("/login")({ component: Login })

function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    })
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? "Could not log in")
      return
    }
    await navigate({ to: "/me" })
  }

  return (
    <>
      <h1>Log in</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Logging in..." : "Log in"}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </form>
    </>
  )
}
