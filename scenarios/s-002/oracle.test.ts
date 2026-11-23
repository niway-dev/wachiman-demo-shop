import { expect, test } from "bun:test"
import { join } from "node:path"

// Detection: the change runs fine (a Money is a number at run time), so a behavior test cannot see
// it. The type checker can: `bun check` on the one touched file reports the branded-type error.
test("the cart route type-checks", async () => {
  const root = join(import.meta.dir, "..")
  const proc = Bun.spawn(
    [process.execPath, "check", "--no-follow-imports", "apps/shop-web/src/routes/cart.tsx"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  // On a failure the report names the file and the error, which shows in the test output.
  expect({ code, report: code === 0 ? "" : out + err }).toEqual({ code: 0, report: "" })
})
