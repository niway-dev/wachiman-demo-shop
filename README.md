# wachiman-demo-shop

A small shop application used to demo AI code review on real pull requests. It is deliberately
small and stable: a TanStack Start web app, a Hono and oRPC api over a shared contract, use cases
written in Effect, a real login with better-auth, and SQLite through `bun:sqlite`.

This repository is the baseline. It is not a product and it is not deployed.

## What the shop does

- **Customer**: browses the catalog, adds, removes and changes quantities in a cart (kept in the
  browser, with a badge in the nav), logs in, applies one coupon and checks out.
- **Admin**: creates, edits and switches promotions and coupons on or off, and sees the counters:
  units in stock per product, orders placed, and redemptions per promotion and per coupon.
- **Prices**: the server is the authority. The web app sends product ids, quantities and a coupon
  code; the api prices them with the domain's `priceCart`. See
  [cart and checkout](docs/features/checkout.md).

## Requirements

- [Bun](https://bun.sh) `1.4.5-canary.20261122.1`, pinned exactly. It is a canary build because
  `bun lint` exists only there. Install it with:

  ```sh
  npm install -g bun@1.4.5-canary.20261122.1
  ```

No Docker and no external service. A local settings file with a random secret is generated the
first time you run `bun run dev` or `bun run db:reset`; it is gitignored.

## Commands

| Command            | What it does                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `bun install`      | Installs the workspace.                                                                      |
| `bun run db:reset` | Deletes `data/shop.db`, migrates, and seeds the demo users, catalog, promotions and coupons. |
| `bun run dev`      | Starts the api on port 3001 and the web app on port 3000.                                    |
| `bun run build`    | Builds both apps.                                                                            |
| `bun test`         | Runs every test.                                                                             |
| `bun check`        | Type checks the whole workspace.                                                             |
| `bun fmt --check`  | Checks formatting (`bun fmt` writes it).                                                     |
| `bun lint`         | Lints the workspace.                                                                         |

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
scripts/              db:reset, and the scenario tools (docs/scenarios.md)
docs/architecture.md  the layers and what may import what
```

## Review

What Wachiman reports on planted changes, and how to compare two versions of it, is in
[review scenarios](docs/scenarios.md).

[Wachiman](https://github.com/niway-dev/wachiman) reviews pull requests here, in this repository's
CI, on the owner's Claude subscription. It reads each diff and comments on bugs, with extra
attention to the paths in [`.wachiman.yml`](.wachiman.yml): authentication and checkout
(critical) and pricing (high).

The workflow in `.github/workflows/review.yml` reviews every pull request opened from a branch of
this repository. A pull request from a fork gets no review and no secret, because GitHub does not
give secrets to fork pull requests.

To turn it on, the owner adds the repository secret `CLAUDE_CODE_OAUTH_TOKEN` under Settings,
Secrets and variables, Actions. Its value comes from `claude setup-token`. The operator login is
fixed in the workflow, so no repository variable is needed.

## License

MIT. See [LICENSE](LICENSE).
