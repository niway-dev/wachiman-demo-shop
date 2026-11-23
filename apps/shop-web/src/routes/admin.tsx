import { Link, createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { AdminCoupons } from "../components/AdminCoupons.tsx"
import { AdminPromotions } from "../components/AdminPromotions.tsx"
import { api, statusOf } from "../lib/api.ts"

export const Route = createFileRoute("/admin")({
  // Needs the browser's session cookie, so it runs only on the client.
  ssr: false,
  loader: async () => {
    try {
      const [ping, counters, promotions, coupons] = await Promise.all([
        api.admin.ping(),
        api.admin.counters(),
        api.admin.promotions.list(),
        api.admin.coupons.list(),
      ])
      return { status: 200, ping, counters, promotions, coupons }
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
 * api, on every admin route; hiding this page in the UI would not protect anything.
 */
function Admin() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  if (data.ping === null) {
    return (
      <>
        <h1>Admin</h1>
        {data.status === 401 ? (
          <p>
            You are not logged in. <Link to="/login">Log in</Link>
          </p>
        ) : (
          <p className="error">The api answered 403: your role cannot use admin routes.</p>
        )}
      </>
    )
  }

  const { counters } = data
  const refresh = async () => {
    setError(null)
    await router.invalidate()
  }

  return (
    <>
      <h1>Admin</h1>
      <p>
        Signed in as <strong>{data.ping.by}</strong>. Orders placed:{" "}
        <strong>{counters.orders}</strong>
      </p>
      {error ? <p className="error">{error}</p> : null}

      <section>
        <h2>Stock</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Units in stock</th>
            </tr>
          </thead>
          <tbody>
            {counters.stock.map((row) => (
              <tr key={row.productId}>
                <td>{row.name}</td>
                <td className="num">{row.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <AdminPromotions promotions={data.promotions} refresh={refresh} fail={setError} />
      <AdminCoupons coupons={data.coupons} refresh={refresh} fail={setError} />
    </>
  )
}
