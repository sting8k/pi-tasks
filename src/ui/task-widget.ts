/**
 * task-widget.ts — Persistent widget showing task list with status icons and progress.
 *
 * Display styles are inspired by pi-droid-styling's task widget:
 * - default: multi-line task list with polished icons/alignment
 * - compact: single-line summary that cycles through active/running tasks
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TaskStore } from "../task-store.js";
import type { TasksConfig } from "../tasks-config.js";
import type { Task } from "../types.js";

// ---- Truncation ----

function truncateFromTop(tasks: Task[], limit: number): Task[] {
  return tasks.slice(-limit);
}

function truncateFromBottom(tasks: Task[], limit: number): Task[] {
  return tasks.slice(0, limit);
}

const TRUNCATE_FNS = { top: truncateFromTop, bottom: truncateFromBottom };

// ---- Types ----

export type Theme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
  strikethrough(text: string): string;
};

export type UICtx = {
  setStatus(key: string, text: string | undefined): void;
  setWidget(
    key: string,
    content: undefined | ((tui: any, theme: Theme) => { render(): string[]; invalidate(): void }),
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
};

/** Star spinner frames for animated active task indicator. */
const SPINNER = ["✳", "✴", "✵", "✶", "✷", "✸", "✹", "✺", "✻", "✼", "✽"];
const DEFAULT_MAX_VISIBLE_TASKS = 10;
const WIDGET_ROW_PREFIX = "   ";
const TASK_CYCLE_MS = 3000;

/** Per-task runtime metrics. */
export interface TaskMetrics {
  startedAt: number;
}

/** Format milliseconds as a human-readable duration (e.g., "2m 49s", "1h 3m"). */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

type Counts = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
};

function countTasks(tasks: Task[]): Counts {
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    pending: tasks.filter(t => t.status === "pending").length,
  };
}

function formatStatusText(counts: Counts): string {
  const parts: string[] = [];
  if (counts.completed > 0) parts.push(`${counts.completed} done`);
  if (counts.inProgress > 0) parts.push(`${counts.inProgress} running`);
  if (counts.pending > 0) parts.push(`${counts.pending} open`);
  return `${counts.total} tasks (${parts.join(", ")})`;
}

function taskCycleBucket(now = Date.now()): number {
  return Math.floor(now / TASK_CYCLE_MS);
}

// ---- Widget ----

export class TaskWidget {
  private uiCtx: UICtx | undefined;
  private widgetFrame = 0;
  private widgetInterval: ReturnType<typeof setInterval> | undefined;
  /** IDs of tasks currently being actively executed (show spinner). */
  private activeTaskIds = new Set<string>();
  /** Per-task runtime metrics keyed by task ID. */
  private metrics = new Map<string, TaskMetrics>();
  /** Cached TUI instance for requestRender() calls. */
  private tui: any | undefined;
  /** Whether the widget callback is currently registered. */
  private widgetRegistered = false;

  constructor(
    private store: TaskStore,
    private config: TasksConfig = {},
  ) {}

  setStore(store: TaskStore) {
    this.store = store;
  }

  setUICtx(ctx: UICtx) {
    this.uiCtx = ctx;
  }

  /** Add or remove a task from the active spinner set. */
  setActiveTask(taskId: string | undefined, active = true) {
    if (taskId && active) {
      this.activeTaskIds.add(taskId);
      if (!this.metrics.has(taskId)) {
        this.metrics.set(taskId, { startedAt: Date.now() });
      }
      this.ensureTimer();
    } else if (taskId) {
      this.activeTaskIds.delete(taskId);
    }
    this.update();
  }

  /** Ensure the widget update timer is running. */
  ensureTimer() {
    if (!this.widgetInterval) {
      this.widgetInterval = setInterval(() => this.update(), 150);
    }
  }

  /** Build widget lines from current live state. Called from the render callback. */
  private renderWidget(tui: any, theme: Theme): string[] {
    const sortOrder = this.config.sortOrder ?? "id";
    const tasks = this.store.list(sortOrder);
    const width = tui.terminal.columns;
    const truncate = (line: string) => truncateToWidth(line, width);

    if (tasks.length === 0) return [];
    if ((this.config.tasksWidgetStyle ?? "default") === "compact") {
      return this.renderCompactWidget(tasks, theme, truncate);
    }
    return this.renderDefaultWidget(tasks, theme, truncate);
  }

  private renderDefaultWidget(tasks: Task[], theme: Theme, truncate: (line: string) => string): string[] {
    const counts = countTasks(tasks);
    const lines: string[] = [
      truncate(`${WIDGET_ROW_PREFIX}${theme.fg("accent", theme.bold("Tasks"))}${theme.fg("dim", ` · ${formatStatusText(counts)}`)}`),
    ];

    const showAll = this.config.showAll ?? false;
    const limit = this.config.maxVisible ?? DEFAULT_MAX_VISIBLE_TASKS;
    const hiddenAt = this.config.hiddenAt ?? "bottom";
    const visible = showAll ? tasks : TRUNCATE_FNS[hiddenAt](tasks, limit);
    const idWidth = visible.reduce((max, task) => Math.max(max, task.id.length), 1);

    const hiddenCount = tasks.length - visible.length;
    const overflowLine = hiddenCount > 0
      ? truncate(`${WIDGET_ROW_PREFIX}${theme.fg("dim", `⋯ and ${hiddenCount} more`)}`)
      : undefined;

    if (overflowLine && hiddenAt === "top") lines.push(overflowLine);
    for (const task of visible) lines.push(truncate(this.renderTaskRow(task, theme, idWidth)));
    if (overflowLine && hiddenAt !== "top") lines.push(overflowLine);

    return lines;
  }

  private renderCompactWidget(tasks: Task[], theme: Theme, truncate: (line: string) => string): string[] {
    const counts = countTasks(tasks);
    const label = `${WIDGET_ROW_PREFIX}${theme.fg("accent", "●")} ${theme.fg("accent", theme.bold("Tasks"))}`;
    const current = this.pickCompactTask(tasks);
    const blocked = tasks.filter(task => this.openBlockers(task).length > 0).length;
    const allDone = counts.completed === counts.total && counts.total > 0;

    const tailParts: string[] = [];
    if (allDone) {
      tailParts.push(theme.fg("success", " done"));
    } else if (!current) {
      tailParts.push(theme.fg("dim", " idle"));
    }
    const runningText = counts.inProgress > 0 ? ` · ${counts.inProgress} running` : "";
    tailParts.push(theme.fg("dim", ` (${counts.completed}/${counts.total} done${runningText})`));
    if (blocked > 0) tailParts.push(theme.fg("dim", ` ${blocked} blocked`));
    const tail = tailParts.join("");

    if (!current || allDone) return [truncate(`${label}${tail}`)];

    const marker = theme.fg("accent", theme.bold("› "));
    const id = theme.fg("dim", `[${current.id}] `);
    const body = this.compactTaskText(current, theme);
    return [truncate(`${label} ${marker}${id}${body}${tail}`)];
  }

  private pickCompactTask(tasks: Task[]): Task | undefined {
    const active = tasks.filter(task => this.isActive(task));
    const candidates = active.length > 0 ? active : tasks.filter(task => task.status === "in_progress");
    if (candidates.length === 0) return undefined;
    return candidates[taskCycleBucket() % candidates.length];
  }

  private compactCycleCandidateCount(tasks: Task[]): number {
    const activeCount = tasks.filter(task => this.isActive(task)).length;
    return activeCount > 0 ? activeCount : tasks.filter(task => task.status === "in_progress").length;
  }

  private compactTaskText(task: Task, theme: Theme): string {
    const base = this.isActive(task) ? (task.activeForm || task.subject) : task.subject;
    const text = base.replace(/…$/, "");
    const elapsed = this.elapsedText(task);
    return elapsed ? `${text}${theme.fg("dim", ` · ${elapsed}`)}` : text;
  }

  private renderTaskRow(task: Task, theme: Theme, idWidth: number): string {
    const id = theme.fg("dim", `#${task.id.padStart(idWidth)}`);
    const icon = this.renderTaskIcon(task, theme);
    const text = this.renderTaskText(task, theme);
    const suffix = this.renderBlockedSuffix(task, theme);
    return `${WIDGET_ROW_PREFIX}${icon} ${id}  ${text}${suffix}`;
  }

  private renderTaskIcon(task: Task, theme: Theme): string {
    if (task.status === "completed") return theme.fg("success", "✓");
    if (task.status === "pending") return theme.fg("dim", "○");
    return theme.fg("accent", this.isActive(task) ? SPINNER[this.widgetFrame % SPINNER.length] : "●");
  }

  private renderTaskText(task: Task, theme: Theme): string {
    if (task.status === "completed") return theme.fg("dim", theme.strikethrough(task.subject));
    if (this.isActive(task)) {
      const agentLabel = task.metadata?.agentId ? ` (agent ${task.metadata.agentId.slice(0, 5)})` : "";
      const elapsed = this.elapsedText(task);
      const time = elapsed ? theme.fg("dim", ` · ${elapsed}`) : "";
      return `${theme.fg("accent", `${task.activeForm || task.subject}${agentLabel}…`)}${time}`;
    }
    const agentSuffix = task.status === "in_progress" && task.metadata?.agentId
      ? theme.fg("dim", ` (agent ${task.metadata.agentId.slice(0, 5)})`)
      : "";
    return `${task.subject}${agentSuffix}`;
  }

  private renderBlockedSuffix(task: Task, theme: Theme): string {
    const blockers = this.openBlockers(task);
    if (blockers.length === 0) return "";
    return theme.fg("dim", ` › blocked by ${blockers.map(id => "#" + id).join(", ")}`);
  }

  private openBlockers(task: Task): string[] {
    if (task.status !== "pending") return [];
    return task.blockedBy.filter(bid => {
      const blocker = this.store.get(bid);
      return blocker && blocker.status !== "completed";
    });
  }

  private isActive(task: Task): boolean {
    return this.activeTaskIds.has(task.id) && task.status === "in_progress";
  }

  private elapsedText(task: Task): string {
    const metrics = this.metrics.get(task.id);
    return metrics ? formatDuration(Date.now() - metrics.startedAt) : "";
  }

  /** Force an immediate widget update. */
  update() {
    if (!this.uiCtx) return;
    const tasks = this.store.list();

    // Transition: visible → hidden
    if (tasks.length === 0) {
      if (this.widgetRegistered) {
        this.uiCtx.setWidget("tasks", undefined);
        this.widgetRegistered = false;
      }
      if (this.widgetInterval) {
        clearInterval(this.widgetInterval);
        this.widgetInterval = undefined;
      }
      return;
    }

    // Prune stale active IDs (deleted or no longer in_progress)
    for (const id of this.activeTaskIds) {
      const t = this.store.get(id);
      if (!t || t.status !== "in_progress") {
        this.activeTaskIds.delete(id);
        this.metrics.delete(id);
      }
    }

    // Check if any task needs animation or compact cycling.
    const hasActiveSpinner = tasks.some(t => this.activeTaskIds.has(t.id) && t.status === "in_progress");
    const needsCompactCycle = (this.config.tasksWidgetStyle ?? "default") === "compact" && this.compactCycleCandidateCount(tasks) > 1;
    if (hasActiveSpinner || needsCompactCycle) {
      this.ensureTimer();
    } else if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }

    this.widgetFrame++;

    // Transition: hidden → visible — register widget callback once
    if (!this.widgetRegistered) {
      this.uiCtx.setWidget("tasks", (tui, theme) => {
        this.tui = tui;
        return { render: () => this.renderWidget(tui, theme), invalidate: () => {} };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
    } else if (this.tui) {
      // Widget already registered — just request a re-render
      this.tui.requestRender();
    }
  }

  dispose() {
    if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }
    if (this.uiCtx) {
      this.uiCtx.setWidget("tasks", undefined);
    }
    this.widgetRegistered = false;
    this.tui = undefined;
  }
}
