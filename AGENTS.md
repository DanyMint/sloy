# Repository Guidelines

## Project Structure & Module Organization

Sloy is a browser planner with a Tauri 2 application backed by an Obsidian vault.

- `dist/`: editable HTML, CSS, and JavaScript ES modules; images live in `dist/assets/`. Despite its name, this is frontend source.
- `native/`: vault codec, save/reconciliation engine, runtime adapter, and native styles.
- `src-tauri/src/`: Tauri commands and Android filesystem integration; `src-tauri/core/`: Rust storage, indexing, and Syncthing integration.
- `tests/`, `native/tests/`, and `src-tauri/core/tests/`: frontend, adapter, and Rust tests.
- `scripts/`, `packaging/`, and `.github/workflows/`: build tooling, Arch packaging, and platform workflows. See `docs/TAURI.md` for setup details.

## Build, Test, and Development Commands

Install the pinned tools with `mise install` (Node.js, Rust, and quality gates), plus your platform's Tauri prerequisites.

- `npm ci`: install locked JavaScript dependencies.
- `npm test`: run frontend tests.
- `npm run test:native`: prepare the native frontend and run adapter tests.
- `npm run test:rust`: run the Rust core tests.
- `npm run check`: run static checks and all test suites; require it to pass before finishing a change.
- `npm run native:dev`: prepare assets and launch Tauri locally.
- `npm run native:build -- --no-bundle`: build the desktop executable.
- `npm run android:init`, then `npm run android:debug`: initialize and build Android with the SDK/NDK configured.

`npm run native:prepare` generates the native frontend; edit source files instead of generated output. Its string replacements depend on anchors in `dist/`, so verify preparation after frontend changes.

Install the optional Git hooks with `hk install`: staged-file checks run before commits, and the full `npm run check` suite runs before pushes. CI remains the required gate. Do not disable lint rules to pass a check; any exception must be narrow, explain its reason, and be approved by a maintainer.

## Coding Style & Naming Conventions

Match surrounding code: JavaScript uses compact formatting, single quotes, semicolons, and one- or two-space indentation. Use camelCase identifiers and descriptive kebab-case module names. Rust uses four-space indentation and snake_case functions/modules. `npm run check` enforces Oxlint and formats JSON configuration files with Oxfmt; avoid unrelated reformatting.

## Testing Guidelines

JavaScript uses the `node:test` runner and `node:assert/strict`. Rust uses `#[test]` and temporary filesystem fixtures. Add regression tests for changed behavior, especially Markdown round trips, recurrence, conflicts, and recovery. No coverage threshold is configured. Run all three suites before submitting; manually verify affected desktop/mobile UI and Android filesystem access.

## Commit & Pull Request Guidelines

Project commit history is unavailable in this checkout. Use concise imperative subjects, such as `Preserve task IDs during vault reconciliation`. PRs should explain behavior changes, link relevant issues, report validation commands/results, and include screenshots for UI changes.

## Data & Configuration Safety

Test vault writes against a copy. Preserve unknown YAML, note prose, stable IDs, and conflict/recovery safeguards. Markdown is authoritative; SQLite is a rebuildable cache. Keep Syncthing API keys and personal vault data out of commits.
