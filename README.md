# pi-tasks

A [pi](https://pi.dev) extension for Claude Code-style task tracking inside a pi session. It gives the agent structured task tools and keeps a live task widget above the editor.

<img width="600" alt="pi-tasks screenshot" src="https://github.com/sting8k/pi-tasks/raw/master/media/screenshot.png" />

## Features

- **4 task tools**: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`.
- **Live widget** above the editor with task status, active text, elapsed time, and blocked-by hints.
- **Default and compact widget styles** configurable from `/tasks` → Settings.
- **Task dependencies** with `blocks` / `blockedBy` links and cycle warnings.
- **Persistent task storage** per session or project, with safe file locking.
- **Global settings file** at `~/.pi/agent/pi-tasks-config.json`, scaffolded automatically when missing.
- **Automatic cleanup** for completed tasks based on the selected auto-clear mode.

## Installation

```bash
pi install git:github.com/sting8k/pi-tasks
```

For local development:

```bash
pi -e ./src/index.ts
```

## Widget

Default style shows a multi-line task list:

```text
   Tasks · 4 tasks (1 done, 1 running, 2 open)
   ✓ #1  Design the flux capacitor
   ● #2  Acquiring plutonium… · 2m 49s
   ○ #3  Install flux capacitor in DeLorean › blocked by #1
   ○ #4  Test time travel at 88 mph › blocked by #2, #3
```

Compact style shows a one-line summary:

```text
   ● Tasks › [2] Acquiring plutonium · 2m 49s (1/4 done · 1 running) 2 blocked
```

Icons:

| Icon | Meaning |
|------|---------|
| `✓` | Completed |
| `●` | In progress / active |
| `○` | Pending |

Widget settings live under `/tasks` → Settings and are saved globally:

| Setting | Values | Default |
|---------|--------|---------|
| `tasksWidgetStyle` | `default` / `compact` | `default` |
| `sortOrder` | `id` / `status` / `recent` / `oldest` | `id` |
| `maxVisible` | `5`–`100` | `10` |
| `showAll` | `true` / `false` | `false` |
| `hiddenAt` | `bottom` / `top` | `bottom` |
