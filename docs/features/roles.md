# Roles

There are two roles, `admin` and `customer`. Code: [`role.ts`](../../packages/domain/src/role.ts);
tests: [`role.test.ts`](../../packages/domain/src/role.test.ts).

- `isRole(value)`: true only for exactly `"admin"` or `"customer"`.
- `canUseAdminRoutes(role)`: true only for `"admin"`. A missing or unknown role is not an admin.
  The api calls this; the UI never decides alone.
