# Review scenarios

This branch holds the review scenarios of the demo shop. It is an orphan branch: it shares no
history with `main`, and it is never merged into it.

Each folder under `scenarios/` is one scenario, a small change that is applied on a tagged
baseline of `main` and then reviewed:

- `plant.patch`: the change, as a git patch against the baseline tag named in `key.yml`;
- `key.yml`: what the scenario is, for the repository owner's comparison of review runs;
- `oracle.test.ts`: only for scenarios that need a test to show the change really behaves
  differently from the baseline.

The pull request built from a scenario carries only the baseline plus the patch, under a neutral
title. The tooling that reads this branch, and the rules for adding a scenario, are in
`docs/scenarios.md` on `main`.
