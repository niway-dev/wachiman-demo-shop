import type { Contract } from "@demo-shop/api-contract"
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"

/**
 * The typed api client, built from the shared contract. In the browser it calls
 * the web origin (`/rpc`), which forwards to the api so cookies stay same-origin.
 * During server rendering it calls the api directly; those calls are public
 * (the catalog), so no cookie is forwarded.
 */
const link = new RPCLink({
  url: () =>
    typeof window === "undefined"
      ? `${process.env.API_ORIGIN ?? "http://localhost:3001"}/rpc`
      : `${window.location.origin}/rpc`,
})

export const api: ContractRouterClient<Contract> = createORPCClient(link)

/** The HTTP status carried by a failed api call, or undefined for other errors. */
export function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status
    return typeof status === "number" ? status : undefined
  }
  return undefined
}
