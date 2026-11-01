<p align="center">
  <img src="dist/assets/sloy-logo.png" alt="Sloy" width="280">
</p>

<p align="center">
  <strong>From yearly focus to daily action.</strong><br>
  A personal planner for tasks, habits, and reflection.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.ru.md">Русский</a>
</p>

## Plan with context

Sloy connects long-term priorities with everyday work. Organize your areas and projects, choose a focus, and build a realistic plan for today.

- **Journal** — yearly and quarterly project focus, weekly tasks, and daily plans. Lock in a plan to preserve its original snapshot.
- **Today** — work through your plan, capture extra tasks, and track habits in one place.
- **Projects** — areas, projects, subprojects, Kanban boards, recurring tasks, and a Someday list.
- **Habits & reflection** — daily counters, streaks, sleep, well-being, and written reflections.
- **Analytics** — explore productivity and relationships between your recorded metrics.

Light and dark themes, responsive layouts, drag-and-drop planning, and swipe-to-complete on touchscreens.

## Your data, your files

| Version | Storage |
| --- | --- |
| **Native · Tauri 2** | Markdown in an Obsidian vault, with SQLite as a rebuildable local cache. Optional sync through a separately installed Syncthing client. |
| **Browser** | Local browser storage, JSON backups, and manual Markdown import/export. No direct vault connection. |

The native app preserves note prose and unknown YAML fields, checks for conflicting edits, and keeps recovery copies when writes cannot complete safely.

## Get started

For native development, install Node.js 22+, Rust 1.90+, and the platform prerequisites listed in the [setup guide](docs/TAURI.md).

```sh
npm ci
npm run native:dev
```

Select an Obsidian vault in Settings. Use a copy of your vault for initial testing.

For the browser version, serve `dist/` with a local static server. For example, with Python 3:

```sh
python3 -m http.server 8080 --directory dist
```

Then open [localhost:8080](http://localhost:8080).

## Development

Frontend source lives in `dist/`; the native adapter is in `native/`, and the Rust backend is in `src-tauri/`. `.native-web/` is generated — edit the source files instead.

```sh
npm test
npm run test:native
npm run test:rust
npm run native:build -- --no-bundle
```

See the [native guide (Russian)](docs/TAURI.md) for desktop and Android builds, vault layout, Syncthing setup, and recovery behavior.
