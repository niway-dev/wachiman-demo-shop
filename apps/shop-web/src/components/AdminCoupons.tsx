import type { CouponDto } from "@demo-shop/api-contract"
import { formatMoney, money } from "@demo-shop/domain"
import { type FormEvent, useState } from "react"
import { api } from "../lib/api.ts"

type Discount = CouponDto["discount"]

const describe = (discount: Discount) =>
  discount.kind === "percentage"
    ? `${discount.percent}% off`
    : `${formatMoney(money(discount.amountMinor))} off`

/** The date input holds a day (YYYY-MM-DD); the coupon expires at the start of that day, UTC. */
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fromDay = (day: string) => new Date(`${day}T00:00:00Z`).getTime()

function CouponForm(props: {
  initial?: CouponDto
  submitLabel: string
  onSubmit: (input: {
    code: string
    discount: Discount
    usageLimit: number
    expiresAt: number
  }) => Promise<void>
}) {
  const [kind, setKind] = useState<Discount["kind"]>(props.initial?.discount.kind ?? "percentage")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const discount: Discount =
      kind === "percentage"
        ? { kind, percent: Number(form.get("value")) }
        : // The admin types 5.00; the api works in minor units.
          { kind, amountMinor: Math.round(Number(form.get("value")) * 100) }
    await props.onSubmit({
      code: props.initial?.code ?? String(form.get("code")),
      discount,
      usageLimit: Number(form.get("usageLimit")),
      expiresAt: fromDay(String(form.get("expires"))),
    })
  }
  const initialValue = props.initial
    ? props.initial.discount.kind === "percentage"
      ? props.initial.discount.percent
      : props.initial.discount.amountMinor / 100
    : 10
  return (
    <form onSubmit={submit}>
      {props.initial ? null : (
        <label>
          Code
          <input name="code" required minLength={2} maxLength={40} />
        </label>
      )}
      <label>
        Discount
        <select value={kind} onChange={(e) => setKind(e.target.value as Discount["kind"])}>
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed amount</option>
        </select>
      </label>
      <label>
        {kind === "percentage" ? "Percent (0-100)" : "Amount (e.g. 5.00)"}
        <input
          name="value"
          type="number"
          min={0}
          step={kind === "percentage" ? 1 : 0.01}
          defaultValue={initialValue}
          required
        />
      </label>
      <label>
        Usage limit
        <input
          name="usageLimit"
          type="number"
          min={1}
          defaultValue={props.initial?.usageLimit ?? 100}
          required
        />
      </label>
      <label>
        Expires (UTC, start of day)
        <input
          name="expires"
          type="date"
          defaultValue={toDay(props.initial?.expiresAt ?? Date.now() + 30 * 86_400_000)}
          required
        />
      </label>
      <button type="submit">{props.submitLabel}</button>
    </form>
  )
}

/** Admin panel: create, edit and switch coupons. The api checks the admin role on every call. */
export function AdminCoupons(props: {
  coupons: readonly CouponDto[]
  refresh: () => Promise<void>
  fail: (message: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)

  async function attempt(action: () => Promise<unknown>) {
    try {
      await action()
      await props.refresh()
    } catch (error) {
      props.fail(error instanceof Error ? error.message : "The request failed")
    }
  }

  return (
    <section>
      <h2>Coupons</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Discount</th>
            <th>Expires</th>
            <th>Status</th>
            <th className="num">Redeemed</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.coupons.map((coupon) => (
            <tr key={coupon.code}>
              <td>{coupon.code}</td>
              <td>{describe(coupon.discount)}</td>
              <td>{toDay(coupon.expiresAt)}</td>
              <td>{coupon.active ? "On" : "Off"}</td>
              <td className="num">
                {coupon.redemptions} / {coupon.usageLimit}
              </td>
              <td className="actions">
                <button
                  type="button"
                  onClick={() =>
                    attempt(() =>
                      api.admin.coupons.setActive({ code: coupon.code, active: !coupon.active }),
                    )
                  }
                >
                  Switch {coupon.active ? "off" : "on"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(editing === coupon.code ? null : coupon.code)}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.coupons
        .filter((coupon) => coupon.code === editing)
        .map((coupon) => (
          <CouponForm
            key={coupon.code}
            initial={coupon}
            submitLabel="Save changes"
            onSubmit={(input) =>
              attempt(async () => {
                await api.admin.coupons.update(input)
                setEditing(null)
              })
            }
          />
        ))}
      <h3>New coupon</h3>
      <CouponForm
        submitLabel="Create (starts off)"
        onSubmit={(input) => attempt(() => api.admin.coupons.create({ ...input, active: false }))}
      />
    </section>
  )
}
