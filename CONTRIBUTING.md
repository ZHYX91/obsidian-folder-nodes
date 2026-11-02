# Contributing

Use Node 24.19.0 and npm 11.17.0. Install with `npm ci`, make focused changes, add tests, and run `npm run check`.

Core modules must not import Obsidian. Never target an ordinary Vault with fixtures or cleanup tools. Keep pull requests self-contained and use Conventional Commit subjects.

## Lint dependency maintenance

Caller-scoped overrides keep minimatch at 11.0.4 in the development dependency tree.
`npm ci` runs `scripts/prepare-lint-dependencies.mjs` to adapt the legacy callers to its
named exports and `Minimatch.match` API. The script accepts only reviewed package versions
and exact source fragments; it fails if upstream changes invalidate a patch. Review and
remove the corresponding adaptation when upgrading a caller that supports the new API.
These changes do not enter the plugin runtime bundle.

`npm run lint` first reapplies the adaptations idempotently, then runs
`scripts/check-lint-dependencies.mjs`. The check verifies every locked and resolved minimatch
version and exercises matching and nonmatching cases through the installed callers. Rule
probes use each caller's installed ESLint peer; they do not establish compatibility with a
different ESLint major. The normal lint command independently checks the active repository
configuration without disabling rules. If installation used `--ignore-scripts`, run
`npm run prelint` before invoking ESLint directly.
