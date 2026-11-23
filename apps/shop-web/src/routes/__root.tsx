import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Demo shop" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the shop</Link>
      </p>
    </>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <nav>
        <Link to="/">Shop</Link>
        <Link to="/login">Log in</Link>
        <Link to="/me">My account</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
