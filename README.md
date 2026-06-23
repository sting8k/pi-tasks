# @tintinweb/pi-tasks

A [pi](https://pi.dev) extension that brings **Claude Code-style task tracking and coordination** to pi. Track multi-step work with structured tasks, dependency management, and a persistent visual widget.

> **Status:** Early release.

<img width="600" alt="pi-tasks screenshot" src="https://github.com/tintinweb/pi-tasks/raw/master/media/screenshot.png" />

https://github.com/user-attachments/assets/1d0ee87a-e0a5-4bfa-a9b9-2f9144cb905b



## Features

- **6 LLM-callable tools** — `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop` — matching Claude Code-style task workflow specs and descriptions
- **Persistent widget** — live task list above the editor with default and compact styles, task numbers (`#1`, `#2`, …), strikethrough for completed tasks, active-task spinner, and elapsed time
- **System-reminder injection** — periodic `<system-reminder>` nudges injected into the upcoming LLM request (via the `context` hook, transient and never persisted) when task tools haven't been used recently (matches Claude Code's behavior exactly)
- **Prompt guidelines** — workflow contract encoded in tool descriptions, nudging the LLM at the point of tool use
- **Dependency management** — bidirectional `blocks`/`blockedBy` relationships with warnings for cycles, self-deps, and dangling references
- **Shared task lists** — multiple pi sessions can share a file-backed task list for team coordination
- **File locking** — concurrent access is safe when multiple sessions share a task list
- **Background process tracking** — track spawned processes with output buffering, blocking wait, and graceful stop

## Install

```bash
pi install npm:@tintinweb/pi-tasks
```

Or load directly for development:

```bash
pi -e ./src/index.ts
```

## Widget

The extension renders a persistent widget above the editor:

```
   Tasks · 4 tasks (1 done, 1 running, 2 open)
   ✓ #1  Design the flux capacitor
   ✳ #2  Acquiring plutonium… · 2m 49s
   ○ #3  Install flux capacitor in DeLorean › blocked by #1
   ○ #4  Test time travel at 88 mph › blocked by #2, #3
```

| Icon | Meaning |
|------|---------|
| `✓` | Completed (strikethrough + dim) |
| `●` | In-progress (not actively executing) |
| `○` | Pending |
| `✳`/`✽` | Animated star spinner — actively executing task (shows `activeForm` text and elapsed time) |

### Widget display settings

How tasks are sorted, styled, and limited can be configured via `/tasks` → Settings (saved globally to `~/.pi/agent/pi-tasks-config.json`, scaffolded automatically if missing).

| Setting | Values | Default | Behaviour |
|---------|--------|---------|-----------|
| `sortOrder` | `id` / `status` / `recent` / `oldest` | `id` | `id` = creation order; `status` groups completed → in-progress → pending; `recent`/`oldest` = by last-updated time |
| `maxVisible` | `5`–`100` | `10` | Caps how many task lines the widget shows (ignored when `showAll` is on) |
| `showAll` | `true` / `false` | `false` | When `true`, every task is shown regardless of `maxVisible` |
| `tasksWidgetStyle` | `default` / `compact` | `default` | `default` = polished multi-line list; `compact` = one-line summary that cycles active/running tasks |
| `hiddenAt` | `bottom` / `top` | `bottom` | When the list overflows `maxVisible`, where the `… and N more` collapse happens. `top` pairs well with `sortOrder: status` to keep active work visible and fold completed tasks away |

> Note: the widget's `status` order is completed-first (so finished work collapses at the top with `hiddenAt: top`), which is the reverse of the `TaskList` tool's pending-first order.

## Tools

### `TaskCreate`

Create a structured task. Used proactively for complex multi-step work.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subject` | string | yes | Brief imperative title |
| `description` | string | yes | Detailed context and acceptance criteria |
| `activeForm` | string | no | Present continuous form for spinner (e.g., "Running tests") |
| `metadata` | object | no | Arbitrary key-value pairs |

```
→ Task #1 created successfully: Fix authentication bug
```

### `TaskList`

List all tasks with status, owner, and blocked-by info.

```
#1 [pending] Fix authentication bug
#2 [in_progress] Write unit tests (bean)
#3 [pending] Update docs [blocked by #1, #2]
```

Sort order: pending first, then in-progress, then completed (each group by ID).

### `TaskGet`

Get full details for a specific task.

```
Task #2: Write unit tests
Status: in_progress
Owner: bean
Description: Add tests for the auth module
Blocked by: #1
Blocks: #3
```

Shows owner (if set) and open (non-completed) dependency edges. Non-empty metadata is displayed as JSON.

### `TaskUpdate`

Update task fields, status, metadata, and dependencies.

| Parameter | Type | Description |
|-----------|------|-------------|
| `taskId` | string | Task ID (required) |
| `status` | `pending` / `in_progress` / `completed` / `deleted` | New status |
| `subject` | string | New title |
| `description` | string | New description |
| `activeForm` | string | Spinner text |
| `owner` | string | Owner name |
| `metadata` | object | Shallow merge (null values delete keys) |
| `addBlocks` | string[] | Task IDs this task blocks |
| `addBlockedBy` | string[] | Task IDs that block this task |

```
→ Updated task #1 status
→ Updated task #2 owner, status
→ Updated task #3 blocks
→ Updated task #3 blocks (warning: cycle: #3 and #1 block each other)
→ Updated task #1 deleted
```

Setting `status: "deleted"` permanently removes the task.

Dependencies are bidirectional: `addBlocks: ["3"]` on task 1 also adds `blockedBy: ["1"]` to task 3.

### `TaskOutput`

Retrieve output from a background task process.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `task_id` | string | — | Task ID (required) |
| `block` | boolean | `true` | Wait for completion |
| `timeout` | number | `30000` | Max wait time in ms (max 600000) |

### `TaskStop`

Stop a running background task process. Sends SIGTERM, waits 5 seconds, then SIGKILL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task ID to stop |

## Task Lifecycle

```
pending → in_progress → completed
                      → deleted (permanently removed)
```

Tasks are created as `pending`. Mark `in_progress` before starting work, `completed` when done. `deleted` removes entirely — IDs never reset.

## Dependency Management

- **Bidirectional edges:** `addBlocks`/`addBlockedBy` maintain both sides automatically
- **Dependency warnings:** cycles, self-dependencies, and references to non-existent tasks are stored but produce warnings in the tool response
- **Display-time filtering:** `TaskList` only shows non-completed blockers in `[blocked by ...]`
- **Raw data preserved:** `TaskGet` shows ALL edges, including completed blockers
- **Cleanup on deletion:** removing a task cleans up all edges pointing to it

## Task Storage

Task storage is controlled by the `taskScope` setting (`/tasks` → Settings → Task storage):

| Mode | File | Behaviour |
|------|------|-----------|
| `memory` | *(none)* | In-memory only — tasks lost when session ends |
| `session` **(default)** | `<cwd>/.pi/tasks/tasks-<sessionId>.json` | Per-session file — isolated between sessions, survives resume |
| `project` | `<cwd>/.pi/tasks/tasks.json` | Shared across all sessions in the project |

On new session start, if all persisted tasks are completed they are auto-cleared for a clean slate. On session resume, all tasks (including completed) are shown so the user can review progress. Empty session files are automatically deleted when all tasks are cleared.

### Auto-clear completed tasks

The `autoClearCompleted` setting controls automatic cleanup of completed tasks:

| Mode | Behaviour |
|------|-----------|
| `never` | Completed tasks stay visible until manually cleared via `/tasks` → Clear completed |
| `on_list_complete` **(default)** | Cleared immediately after all tasks are done |
| `on_task_complete` | Each completed task cleared individually as soon as it completes |

Settings (`taskScope`, `autoClearCompleted`, plus the [widget display settings](#widget-display-settings) `sortOrder` / `maxVisible` / `showAll` / `hiddenAt` / `tasksWidgetStyle`) are saved globally to `~/.pi/agent/pi-tasks-config.json`. If the file does not exist, pi-tasks scaffolds it with default values automatically.

### Override via environment variables

| Variable | Value | Behaviour |
|----------|-------|-----------|
| `PI_TASKS` | `off` | In-memory only (CI/automation) |
| `PI_TASKS` | `sprint-1` | Named shared list at `~/.pi/tasks/sprint-1.json` |
| `PI_TASKS` | `/abs/path/tasks.json` | Explicit absolute file path |
| `PI_TASKS` | `./tasks.json` | Relative path resolved from cwd |
| *(unset)* | | Uses `taskScope` setting (default: `session`) |

Named and explicit paths use a file-locked store with stale-lock detection — safe for multiple pi sessions coordinating on the same task list.

**CI example** (`.envrc`):
```bash
export PI_TASKS=off
```

**Shared team list** (`.envrc`):
```bash
export PI_TASKS=my-project
```

## `/tasks` Command

Interactive menu:

```
Tasks
├─ View all tasks (4)
├─ Create task
├─ Clear completed (1)
├─ Clear all (4)
└─ Settings
```

- **View all tasks** — select a task to see details and take actions (start, complete, delete)
- **Create task** — input prompts for subject and description
- **Clear completed** — remove all completed tasks
- **Clear all** — remove all tasks regardless of status
- **Settings** — configure task storage, auto-clear completed tasks, and [widget display](#widget-display-settings) (sort order, max visible, show all, hidden position, style) — saved globally to `~/.pi/agent/pi-tasks-config.json`

## Architecture

```
src/
├── index.ts            # Extension entry: 6 tools + /tasks command + widget
├── types.ts            # Task, TaskStatus, BackgroundProcess types
├── task-store.ts       # File-backed store with CRUD, dependencies, locking
├── auto-clear.ts       # Auto-clearing of completed tasks (AutoClearManager)
├── tasks-config.ts     # Global config persistence → ~/.pi/agent/pi-tasks-config.json
├── process-tracker.ts  # Background process output buffering and stop
└── ui/
    ├── task-widget.ts  # Persistent widget with status icons and spinner
    └── settings-menu.ts  # /tasks → Settings panel (SettingsList TUI component)
```

## Future Work

- **Background Bash auto-task creation** — Claude Code auto-creates tasks when `Bash` runs with `run_in_background: true`. Pi's bash tool currently lacks a `run_in_background` parameter (only `command` + `timeout`), so there's nothing to hook into. Once pi adds background execution support to its bash tool, we can use the `tool_call` event to detect it and auto-create tasks via `TaskStore`/`ProcessTracker`.

## Harness

> For agent/human workflow guidance, start with [`HARNESS.md`](./HARNESS.md).

This repo includes Harness docs and CLI conventions for scoped intake, verification, and traceable changes. The canonical operating docs live under `docs/`; the root `HARNESS.md` is the lightweight entrypoint.

## Development

```bash
npm install
npm run typecheck   # TypeScript validation
npm test            # Run unit tests
```

## License

MIT — [tintinweb](https://github.com/tintinweb)
