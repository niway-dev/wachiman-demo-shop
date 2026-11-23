# wachiman-demo-shop

A small shop application used to demo AI code review on real pull requests. It is deliberately
small and stable: a TanStack Start web app, a Hono and oRPC api over a shared contract, use cases
written in Effect, a real login with better-auth, and SQLite through `bun:sqlite`.

This repository is the baseline. It is not a product and it is not deployed.

## Requirements

- [Bun](https://bun.sh) `1.4.5-canary.20261122.1`, pinned exactly. It is a canary build because
  `bun lint` exists only there. Install it with:

  ```sh
  npm install -g bun@1.4.5-canary.20261122.1
  ```

No Docker and no external service. A local settings file with a random secret is generated the
first time you run `bun run dev` or `bun run db:reset`; it is gitignored.

## Commands

| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `bun install`      | Installs the workspace.                                                 |
| `bun run db:reset` | Deletes `data/shop.db`, migrates, and seeds the demo users and catalog. |
| `bun run dev`      | Starts the api on port 3001 and the web app on port 3000.               |
| `bun run build`    | Builds both apps.                                                       |
| `bun test`         | Runs every test.                                                        |
| `bun check`        | Type checks the whole workspace.                                        |
| `bun fmt --check`  | Checks formatting (`bun fmt` writes it).                                |
| `bun lint`         | Lints the workspace.                                                    |

`package.json` defines no `check`, `lint` or `fmt` script on purpose: a script with one of those
names would replace the built-in command.

## Demo users

Created by `bun run db:reset`. The passwords are public and protect nothing.

| Role     | Email                  | Password             |
| -------- | ---------------------- | -------------------- |
| Admin    | `admin@example.com`    | `admin-demo-pass`    |
| Customer | `customer@example.com` | `customer-demo-pass` |

## Layout

```
apps/shop-api         Hono on Bun.serve, oRPC router, session and role checks
apps/shop-web         TanStack Start pages
packages/domain       pure rules and types
packages/application  Effect use cases and repository ports
packages/api-contract oRPC contract shared by web and api
packages/infra-db     drizzle schema, migrations, seed, repositories
packages/infra-auth   better-auth over the same SQLite file
scripts/              db:reset
docs/architecture.md  the layers and what may import what
```

## License

MIT. See [LICENSE](LICENSE).
