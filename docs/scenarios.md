# Review scenarios

A scenario is a small, fixed change planted on a baseline tag, used to check what Wachiman reports
on it. The set is a regression check: run it on one Wachiman version, run it on the next, and
compare. It is not a benchmark and it produces no score.

## Where the answers live

The scenarios live on the orphan branch `scenarios`, which shares no history with `main`. The
expected answers (what the review should find, and where) are in each `key.yml` on that branch
only. A pull request opened from a scenario is built from the baseline tag plus the planted patch,
so the reviewed branch, its diff, its commit message and its title cannot contain the key. The
scripts on `main` read the key with `git show` on your machine; they never print it into a pull
request and never send it to Wachiman.

## Layout on the `scenarios` branch

```
scenarios/<id>/            id like s-001
  plant.patch              a git patch applied on the baseline tag
  key.yml                  the answer key
  oracle.test.ts           only for defect and repro
```

`key.yml` fields:

| Field           | Meaning                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `kind`          | `defect`, `design`, `routing`, `clean` or `repro` (below).                                                                    |
| `baseline`      | The tag the patch applies to, for example `baseline-v1`.                                                                      |
| `title`         | The neutral pull request title and commit message. Never the kind, "scenario", "bug" or "plant".                              |
| `files`         | The files the patch changes. Must equal the files in `plant.patch`.                                                           |
| `expected`      | `none`, or a list of `{file, lines: [start, end], must_mention}`. `file` must be in `files`. `must_mention` is for the owner. |
| `expected_risk` | Only for `routing`: `critical` or `high`.                                                                                     |
| `oracle_path`   | Optional. Where `validate` copies the oracle in the worktree. Default `scenarios-oracle/<id>.test.ts`.                        |

The kinds:

- **defect**: the patch introduces a real defect. `expected` lists where Wachiman should report it.
  Needs an oracle.
- **design**: the patch is a design or architecture problem (a layer rule broken, say) with no failing
  test. `expected` lists where.
- **routing**: the patch touches paths that `.wachiman.yml` rates critical or high. `expected_risk`
  says which level; `expected` may be `none`.
- **clean**: a harmless change. `expected` is `none`. Any finding of medium or higher is a failure
  (a false positive).
- **repro**: a defect that is already reproduced by a test. Needs an oracle.

An oracle is a `bun:test` file that passes on the baseline and fails once the patch is applied. It
runs from `scenarios-oracle/` at the repository root, so import code by relative path
(`../packages/domain/src/index.ts`); workspace package names do not resolve there.

## Add a scenario

1. Create a throwaway branch from the baseline tag, make the change, and save it with
   `git add -A && git diff --cached > plant.patch` (plain `git diff` omits new files).
2. On the `scenarios` branch, add `scenarios/<id>/plant.patch`, `key.yml` and, for defect and repro,
   `oracle.test.ts`. Pick a neutral `title`.
3. Run `bun scripts/validate.ts <id>` until it passes.
4. Commit to `scenarios`. Never merge that branch into `main`.

## Commands

Every script has `--help`. Run them from `main` (or any branch with the scripts).

| Command                                           | What it does                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun scripts/scenario.ts list`                    | Id, kind and title of every scenario.                                                                                                          |
| `bun scripts/scenario.ts show <id>`               | The key and the changed files. Owner only: it prints the answer.                                                                               |
| `bun scripts/scenario.ts apply <id> [--dry-run]`  | Builds branch `<id>` from the baseline, commits with the neutral title, pushes, opens a PR against main.                                       |
| `bun scripts/validate.ts [ids...]`                | Checks keys, that patches apply, and that oracles pass on the baseline and fail with the patch.                                                |
| `bun scripts/report.ts run --label <name> [ids]`  | Runs `wachiman local` on each scenario and saves the JSON and a summary.                                                                       |
| `bun scripts/report.ts summarize <label>`         | Rebuilds a label's summary and table from its saved JSON. Runs no Wachiman and spends nothing.                                                 |
| `bun scripts/report.ts compare <labelA> <labelB>` | Two runs side by side: time, cost, matched or not, totals.                                                                                     |
| `bun scripts/reset.ts [--force] <tag>`            | Puts this checkout on branch `work/<tag>` at the tag and resets the database. Refuses to drop commits already on that branch unless `--force`. |

`--branch <name>` points a script at another branch of scenarios (default `scenarios`: the local
branch, else `origin/scenarios`).

`apply` uses `git push` and `gh pr create`, so the active `gh` account must be the repository
owner's. `--dry-run` prints the branch, title, changed files and the exact commands and does
nothing outward.

## Running a report

`report.ts run` needs the `wachiman` CLI signed in to your own claude (no `ANTHROPIC_API_KEY` set;
the script unsets it for the child). Each scenario is planted and committed in a temporary
worktree, then reviewed with `wachiman local --base <baseline tag> --format json`. It spends the
budget of that account.

Output goes to `$WACHIMAN_DATA_DIR/demo-shop/<label>/`, by default `.runs/` at the repository root
(gitignored):

- `<id>.json`: the raw Wachiman result, as printed.
- `summary.json`: one row per scenario.

`--label` defaults to the Wachiman version in the JSON. The table shows time, estimated cost,
calls, turns, how many of the key's files were reviewed, how many expected findings were reported,
and the result.

How a finding is matched:

- same file, and its line inside the expected `lines` widened by 3 on each side (line 0, "the whole
  file", matches on the file alone);
- severity medium or higher: `blocker` and `fix` count; `consider` and `info` do not. An unknown
  severity counts as medium or higher and prints a warning. The exception is a `design` scenario:
  design problems are low severity by nature, so an expected finding counts as found at any
  severity, and a match found only at low severity shows as `ok (low)` in the table;
- for a `clean` scenario, any finding of medium or higher fails it.

Findings that matched nothing are listed so you can read them: an unmatched finding may be a real
issue or noise, and only a person can say. For `routing`, the table shows the highest `maxRisk` of
the review's batches and the level it implies (8 or more: high, 6 or more: medium). That is an
approximation read from the JSON, which carries a number and not the level.

The Wachiman command is chosen with `--wachiman <cmd>`, else the environment variable
`WACHIMAN_BIN`, else `wachiman` on PATH. `<cmd>` may contain spaces and is split on whitespace, for
example `--wachiman "bun /path/to/wachiman/bin/wachiman.ts"`. To compare two versions, run one label
per version (each with its own `--wachiman` or `WACHIMAN_BIN`), then `compare` them.

`report.ts summarize <label>` rebuilds `summary.json` and the table from the saved `<id>.json` files
and the keys, without calling Wachiman. Use it to check a change to the matching rules against an
existing run for free.

`summarize` exits 0 only when every row is ok. A scenario whose run failed leaves no `<id>.json`, so
it keeps its failed row from the old `summary.json`; a scenario that `summary.json` listed as ok but
that has no JSON, whose JSON has the wrong shape, or whose key is invalid becomes a failed row and
the rest still summarize. A scenario in neither the JSON files nor `summary.json` gets no row. If
`summary.json` exists but cannot be parsed, `summarize` exits non-zero and writes nothing.

`compare` prints two labels side by side. Read it as a regression check on a small fixed set: a
scenario that went from matched to not matched, or a cost that doubled, is worth a look. It is not
a score.
