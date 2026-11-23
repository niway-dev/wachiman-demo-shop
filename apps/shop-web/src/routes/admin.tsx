import { Link, createFileRoute } from "@tanstack/react-router"
import { api, statusOf } from "../lib/api.ts"

export const Route = createFileRoute("/admin")({
  // Needs the browser's session cookie, so it runs only on the client.
  ssr: false,
  loader: async () => {
    try {
      return { status: 200, ping: await api.admin.ping() }
    } catch (error) {
      const status = statusOf(error)
      if (status === 401 || status === 403) return { status, ping: null }
      throw error
    }
  },
  component: Admin,
})

/**
 * The page only displays what the api decided. The role check happens on the
 * api; hiding this page in the UI would not protect anything.
 */
function Admin() {
  const { status, ping } = Route.useLoaderData()

  return (
    <>
      <h1>Admin</h1>
      {ping ? (
        <p>
          The api accepted the admin ping from <strong>{ping.by}</strong>.
        </p>
      ) : status === 401 ? (
        <p>
          You are not logged in. <Link to="/login">Log in</Link>
        </p>
      ) : (
        <p className="error">The api answered 403: your role cannot use admin routes.</p>
      )}
    </>
  )
}
