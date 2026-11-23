import { join, relative, isAbsolute } from "node:path"

const dataDirectory = join(import.meta.dir, "..", "data")

/**
 * `db:reset` deletes the database file, so it refuses a target that is not a
 * file inside the repository's `data/` directory. `:memory:` is refused too:
 * resetting it would delete a file of that name and seed nothing durable.
 * `allowOutsideData` is the explicit opt-in for another location.
 */
export function assertResettable(path: string, allowOutsideData: boolean): void {
  if (path === ":memory:") {
    throw new Error("db:reset needs a file path; DATABASE_PATH=:memory: cannot be reset.")
  }
  const inside = relative(dataDirectory, path)
  const isInsideData = inside !== "" && !inside.startsWith("..") && !isAbsolute(inside)
  if (!isInsideData && !allowOutsideData) {
    throw new Error(
      `db:reset only deletes files under ${dataDirectory}. Got ${path}. Set DB_RESET_ALLOW_OUTSIDE_DATA=1 to override.`,
    )
  }
}
