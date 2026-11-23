import type { PromotionDto } from "@demo-shop/api-contract"
import { type FormEvent, useState } from "react"
import { api } from "../lib/api.ts"

type Rule = PromotionDto["rule"]

const describe = (rule: Rule) =>
  rule.kind === "percentage" ? `${rule.percent}% off a line` : "Buy two, get one free"

/** Reads the form's rule fields; the api validates them again. */
function ruleFrom(form: FormData): Rule {
  return form.get("kind") === "buyTwoGetOne"
    ? { kind: "buyTwoGetOne" }
    : { kind: "percentage", percent: Number(form.get("percent")) }
}

function PromotionForm(props: {
  initial?: PromotionDto
  submitLabel: string
  onSubmit: (input: { name: string; rule: Rule }) => Promise<void>
}) {
  const [kind, setKind] = useState<Rule["kind"]>(props.initial?.rule.kind ?? "percentage")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await props.onSubmit({ name: String(form.get("name")), rule: ruleFrom(form) })
  }
  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input name="name" defaultValue={props.initial?.name} required maxLength={80} />
      </label>
      <label>
        Kind
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Rule["kind"])}>
          <option value="percentage">Percentage</option>
          <option value="buyTwoGetOne">Buy two, get one free</option>
        </select>
      </label>
      {kind === "percentage" ? (
        <label>
          Percent (0-100)
          <input
            name="percent"
            type="number"
            min={0}
            max={100}
            defaultValue={
              props.initial?.rule.kind === "percentage" ? props.initial.rule.percent : 10
            }
            required
          />
        </label>
      ) : null}
      <button type="submit">{props.submitLabel}</button>
    </form>
  )
}

/** Admin panel: create, edit and switch promotions. The api checks the admin role on every call. */
export function AdminPromotions(props: {
  promotions: readonly PromotionDto[]
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
      <h2>Promotions</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Rule</th>
            <th>Status</th>
            <th className="num">Redemptions</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.promotions.map((promotion) => (
            <tr key={promotion.id}>
              <td>{promotion.name}</td>
              <td>{describe(promotion.rule)}</td>
              <td>{promotion.active ? "On" : "Off"}</td>
              <td className="num">{promotion.redemptions}</td>
              <td className="actions">
                <button
                  type="button"
                  onClick={() =>
                    attempt(() =>
                      api.admin.promotions.setActive({
                        id: promotion.id,
                        active: !promotion.active,
                      }),
                    )
                  }
                >
                  Switch {promotion.active ? "off" : "on"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(editing === promotion.id ? null : promotion.id)}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.promotions
        .filter((promotion) => promotion.id === editing)
        .map((promotion) => (
          <PromotionForm
            key={promotion.id}
            initial={promotion}
            submitLabel="Save changes"
            onSubmit={(input) =>
              attempt(async () => {
                await api.admin.promotions.update({ id: promotion.id, ...input })
                setEditing(null)
              })
            }
          />
        ))}
      <h3>New promotion</h3>
      <PromotionForm
        submitLabel="Create (starts off)"
        onSubmit={(input) =>
          attempt(() => api.admin.promotions.create({ ...input, active: false }))
        }
      />
    </section>
  )
}
