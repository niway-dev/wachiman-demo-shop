import { Data } from "effect"

/** A repository could not read or write its store. `cause` is the driver error. */
export class RepositoryError extends Data.TaggedError("RepositoryError")<{
  readonly cause: unknown
}> {}

/** The caller has no valid session. The api answers 401. */
export class Unauthenticated extends Data.TaggedError("Unauthenticated") {}

/** The caller is signed in but their role does not allow the action. The api answers 403. */
export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly role: string
}> {}
