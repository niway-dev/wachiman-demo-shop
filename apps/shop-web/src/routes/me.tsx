import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { api, statusOf } from "../lib/api.ts"
import { authClient } from "../lib/auth-client.ts"

export const Route = createFileRoute("/me")({
  // Needs the browser's session cookie, so it runs only on the client.
  ssr: false,
  loader: async () => {
    try {
      return { user: await api.me() }
    } catch (error) {
      if (statusOf(error) === 401) return { user: null }
      throw error
    }
  },
  component: Me,
})

function Me() {
  const { user } = Route.useLoaderData()
  const router = useRouter()

  if (!user) {
    return (
      <>
        <h1>My account</h1>
        <p>
          You are not logged in. <Link to="/login">Log in</Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1>My account</h1>
      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
      </dl>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut()
          await router.invalidate()
        }}
      >
        Log out
      </button>
    </>
  )
}
