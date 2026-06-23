import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStore } from "../src/task-store.js";
import { TaskWidget, type Theme, type UICtx } from "../src/ui/task-widget.js";

/** Create a mock theme that returns raw text (no ANSI escapes). */
function mockTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    strikethrough: (text: string) => `~~${text}~~`,
  };
}

/** Create a mock UICtx that captures setWidget calls. */
function mockUICtx() {
  const state: {
    widgets: Map<string, any>;
    statuses: Map<string, string | undefined>;
  } = {
    widgets: new Map(),
    statuses: new Map(),
  };

  const ctx: UICtx = {
    setWidget(key, content, options) {
      state.widgets.set(key, { content, options });
    },
    setStatus(key, text) {
      state.statuses.set(key, text);
    },
  };

  return { ctx, state };
}

/** Render the widget and return its lines. */
function renderWidget(state: ReturnType<typeof mockUICtx>["state"]): string[] {
  const entry = state.widgets.get("tasks");
  if (!entry?.content) return [];
  const theme = mockTheme();
  const tui = { terminal: { columns: 200 }, requestRender() {} };
  const result = entry.content(tui, theme);
  return result.render();
}

describe("TaskWidget", () => {
  let store: TaskStore;
  let widget: TaskWidget;
  let ui: ReturnType<typeof mockUICtx>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TaskStore();
    widget = new TaskWidget(store);
    ui = mockUICtx();
    widget.setUICtx(ui.ctx);
  });

  afterEach(() => {
    widget.dispose();
    vi.useRealTimers();
  });

  it("shows nothing when no tasks exist", () => {
    widget.update();
    const entry = ui.state.widgets.get("tasks");
    expect(entry?.content).toBeUndefined();
  });

  it("renders pending tasks with ○ icon", () => {
    store.create("Do something", "Desc");
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines).toHaveLength(2); // header + 1 task
    expect(lines[0]).toContain("1 tasks");
    expect(lines[0]).toContain("1 open");
    expect(lines[1]).toContain("○");
    expect(lines[1]).toContain("Do something");
  });

  it("renders in-progress tasks with ● icon", () => {
    store.create("Working on it", "Desc");
    store.update("1", { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("●");
    expect(lines[1]).toContain("Working on it");
  });

  it("renders completed tasks with ✓ icon and strikethrough", () => {
    store.create("Done task", "Desc");
    store.update("1", { status: "completed" });
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("✓");
    expect(lines[1]).toContain("~~Done task~~");
  });

  it("renders active tasks with spinner icon", () => {
    store.create("Running thing", "Desc", "Processing data");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    const lines = renderWidget(ui.state);
    // Should show activeForm text with "…" suffix
    expect(lines[1]).toContain("Processing data…");
    // Should NOT show regular running bullet for active task
    expect(lines[1]).not.toContain("●");
  });

  it("shows blocked-by info for pending tasks", () => {
    store.create("Blocker", "Desc");
    store.create("Blocked", "Desc");
    store.update("2", { addBlockedBy: ["1"] });
    widget.update();

    const lines = renderWidget(ui.state);
    const blockedLine = lines.find(l => l.includes("Blocked"));
    expect(blockedLine).toContain("blocked by #1");
  });

  it("hides completed blockers in blocked-by suffix", () => {
    store.create("Blocker", "Desc");
    store.create("Blocked", "Desc");
    store.update("2", { addBlockedBy: ["1"] });
    store.update("1", { status: "completed" });
    widget.update();

    const lines = renderWidget(ui.state);
    const blockedLine = lines.find(l => l.includes("Blocked"));
    expect(blockedLine).not.toContain("blocked by");
  });

  it("shows status summary in header", () => {
    store.create("Task A", "Desc");
    store.create("Task B", "Desc");
    store.create("Task C", "Desc");
    store.update("1", { status: "completed" });
    store.update("2", { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[0]).toContain("3 tasks");
    expect(lines[0]).toContain("1 done");
    expect(lines[0]).toContain("1 running");
    expect(lines[0]).toContain("1 open");
  });

  it("clears widget when all tasks are deleted", () => {
    store.create("Task", "Desc");
    widget.update();
    expect(ui.state.widgets.get("tasks")?.content).toBeDefined();

    store.update("1", { status: "deleted" });
    widget.update();
    expect(ui.state.widgets.get("tasks")?.content).toBeUndefined();
  });

  it("limits visible tasks to MAX_VISIBLE_TASKS", () => {
    for (let i = 0; i < 15; i++) {
      store.create(`Task ${i + 1}`, "Desc");
    }
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 10 tasks + "… and 5 more"
    expect(lines).toHaveLength(12);
    expect(lines[11]).toContain("5 more");
  });

  it("respects maxVisible config", () => {
    widget = new TaskWidget(store, { maxVisible: 5 });
    widget.setUICtx(ui.ctx);
    for (let i = 0; i < 15; i++) {
      store.create(`Task ${i + 1}`, "Desc");
    }
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 5 tasks + "… and 10 more"
    expect(lines).toHaveLength(7);
    expect(lines[6]).toContain("10 more");
  });

  it("shows all tasks when limit exceeds task count", () => {
    widget = new TaskWidget(store, { maxVisible: 10 });
    widget.setUICtx(ui.ctx);
    for (let i = 0; i < 3; i++) {
      store.create(`Task ${i + 1}`, "Desc");
    }
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 3 tasks, no overflow
    expect(lines).toHaveLength(4);
    expect(lines[lines.length - 1]).not.toContain("more");
  });

  it("shows all tasks when showAll is true even with maxVisible set", () => {
    widget = new TaskWidget(store, { showAll: true, maxVisible: 5 });
    widget.setUICtx(ui.ctx);
    for (let i = 0; i < 15; i++) {
      store.create(`Task ${i + 1}`, "Desc");
    }
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 15 tasks, no overflow line
    expect(lines).toHaveLength(16);
    expect(lines[lines.length - 1]).not.toContain("more");
  });

  it("truncates from top when hiddenAt is 'top'", () => {
    widget = new TaskWidget(store, { sortOrder: "status", hiddenAt: "top", showAll: false, maxVisible: 5 });
    widget.setUICtx(ui.ctx);
    // 4 completed, 2 in_progress, 2 pending = 8 total, limit 5
    for (let i = 1; i <= 4; i++) store.create(`Done ${i}`, "Desc");
    for (let i = 1; i <= 2; i++) store.create(`Working ${i}`, "Desc");
    for (let i = 1; i <= 2; i++) store.create(`Todo ${i}`, "Desc");
    for (let i = 1; i <= 4; i++) store.update(String(i), { status: "completed" });
    for (let i = 5; i <= 6; i++) store.update(String(i), { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    // header + overflow line + 5 visible = 7 lines
    expect(lines).toHaveLength(7);
    // overflow at top (after header)
    expect(lines[1]).toContain("3 more");
    // all in_progress and pending visible
    expect(lines.some(l => l.includes("Working 1"))).toBe(true);
    expect(lines.some(l => l.includes("Todo 2"))).toBe(true);
    // only newest completed (#4) visible
    expect(lines.some(l => l.includes("Done 4"))).toBe(true);
    // oldest completed hidden
    expect(lines.some(l => l.includes("Done 1"))).toBe(false);
    expect(lines.some(l => l.includes("Done 3"))).toBe(false);
  });

  it("truncates from bottom by default", () => {
    widget = new TaskWidget(store, { maxVisible: 3 });
    widget.setUICtx(ui.ctx);
    for (let i = 1; i <= 5; i++) store.create(`Task ${i}`, "Desc");
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 3 tasks + overflow at bottom = 5 lines
    expect(lines).toHaveLength(5);
    expect(lines[1]).toContain("Task 1");
    expect(lines[3]).toContain("Task 3");
    expect(lines[4]).toContain("2 more");
    expect(lines.some(l => l.includes("Task 4"))).toBe(false);
  });

  it("sorts tasks by status when sortOrder is 'status'", () => {
    widget = new TaskWidget(store, { sortOrder: "status" });
    widget.setUICtx(ui.ctx);
    store.create("Pending task", "Desc");           // #1
    store.create("Completed task", "Desc");         // #2
    store.create("In progress task", "Desc");       // #3
    store.update("2", { status: "completed" });
    store.update("3", { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    // header + 3 tasks: completed, in_progress, pending
    expect(lines[1]).toContain("Completed task");
    expect(lines[2]).toContain("In progress task");
    expect(lines[3]).toContain("Pending task");
  });

  it("defaults to ID order when sortOrder is unset", () => {
    store.create("Pending task", "Desc");           // #1
    store.create("Completed task", "Desc");         // #2
    store.create("In progress task", "Desc");       // #3
    store.update("2", { status: "completed" });
    store.update("3", { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("Pending task");
    expect(lines[2]).toContain("Completed task");
    expect(lines[3]).toContain("In progress task");
  });

  it("keeps ID order when sortOrder is 'id'", () => {
    widget = new TaskWidget(store, { sortOrder: "id" });
    widget.setUICtx(ui.ctx);
    store.create("Pending task", "Desc");           // #1
    store.create("Completed task", "Desc");         // #2
    store.create("In progress task", "Desc");       // #3
    store.update("2", { status: "completed" });
    store.update("3", { status: "in_progress" });
    widget.update();

    const lines = renderWidget(ui.state);
    // ID order: #1 pending, #2 completed, #3 in_progress
    expect(lines[1]).toContain("Pending task");
    expect(lines[2]).toContain("Completed task");
    expect(lines[3]).toContain("In progress task");
  });

  it("does not render token counters for active tasks", () => {
    store.create("Active task", "Desc", "Running");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    const lines = renderWidget(ui.state);
    const activeLine = lines.find(l => l.includes("Running…"));
    expect(activeLine).not.toContain("↑");
    expect(activeLine).not.toContain("↓");
  });

  it("deactivates a task with setActiveTask(id, false)", () => {
    store.create("Task", "Desc", "Doing work");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    // Should be active (spinner)
    let lines = renderWidget(ui.state);
    expect(lines[1]).toContain("Doing work…");

    widget.setActiveTask("1", false);
    lines = renderWidget(ui.state);
    // Should now show as regular in_progress (●)
    expect(lines[1]).toContain("●");
    expect(lines[1]).not.toContain("Doing work…");
  });

  it("prunes stale active IDs on update", () => {
    store.create("Task", "Desc");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    // Complete the task externally
    store.update("1", { status: "completed" });
    widget.update();

    // Should render as completed, not active
    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("✓");
    expect(lines[1]).toContain("~~Task~~");
  });

  it("supports multiple active tasks simultaneously", () => {
    store.create("Task A", "Desc", "Processing A");
    store.create("Task B", "Desc", "Processing B");
    store.update("1", { status: "in_progress" });
    store.update("2", { status: "in_progress" });
    widget.setActiveTask("1", true);
    widget.setActiveTask("2", true);

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("Processing A…");
    expect(lines[2]).toContain("Processing B…");
  });

  it("renders compact style as a one-line summary", () => {
    widget = new TaskWidget(store, { tasksWidgetStyle: "compact" });
    widget.setUICtx(ui.ctx);
    store.create("Done", "Desc");
    store.create("Current", "Desc", "Doing");
    store.create("Todo", "Desc");
    store.update("1", { status: "completed" });
    store.update("2", { status: "in_progress" });
    widget.setActiveTask("2", true);

    const lines = renderWidget(ui.state);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Tasks");
    expect(lines[0]).toContain("› [2] Doing");
    expect(lines[0]).toContain("(1/3 done · 1 running)");
  });

  it("cycles compact style across active tasks", () => {
    widget = new TaskWidget(store, { tasksWidgetStyle: "compact" });
    widget.setUICtx(ui.ctx);
    vi.setSystemTime(0);
    store.create("Task A", "Desc", "A");
    store.create("Task B", "Desc", "B");
    store.update("1", { status: "in_progress" });
    store.update("2", { status: "in_progress" });
    widget.setActiveTask("1", true);
    widget.setActiveTask("2", true);

    let lines = renderWidget(ui.state);
    expect(lines[0]).toContain("› [1] A");

    vi.setSystemTime(3000);
    widget.update();
    lines = renderWidget(ui.state);
    expect(lines[0]).toContain("› [2] B");
  });

  it("keeps a timer for compact cycling across non-active running tasks", () => {
    widget = new TaskWidget(store, { tasksWidgetStyle: "compact" });
    widget.setUICtx(ui.ctx);
    store.create("Task A", "Desc");
    store.create("Task B", "Desc");
    store.update("1", { status: "in_progress" });
    store.update("2", { status: "in_progress" });

    widget.update();

    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it("dispose clears widget and timer", () => {
    store.create("Task", "Desc");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    widget.dispose();
    expect(ui.state.widgets.get("tasks")?.content).toBeUndefined();
  });

  it("uses subject as fallback when no activeForm", () => {
    store.create("My Subject", "Desc");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("My Subject…");
  });

  it("shows elapsed time but no token arrows when tokens are zero", () => {
    store.create("No tokens", "Desc", "Working");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    // Token counters are intentionally no longer rendered.
    vi.advanceTimersByTime(5000);
    widget.update();

    const lines = renderWidget(ui.state);
    const activeLine = lines.find(l => l.includes("Working…"));
    expect(activeLine).toContain("5s");
    expect(activeLine).not.toContain("↑");
    expect(activeLine).not.toContain("↓");
  });

  it("cleans up elapsed metrics when stale active IDs are pruned", () => {
    store.create("Task", "Desc", "Running");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    // Delete task externally
    store.update("1", { status: "deleted" });
    widget.update();

    // Reactivate a new task — should get fresh metrics
    store.create("Task 2", "Desc", "Running");  // ID 2
    store.update("2", { status: "in_progress" });
    widget.setActiveTask("2", true);

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("Running…");
    expect(lines[1]).toContain("0s");
  });

  it("indents task lines under header", () => {
    store.create("Indented task", "Desc");
    widget.update();

    const lines = renderWidget(ui.state);
    // Task line should start with the shared widget row prefix
    expect(lines[1]).toMatch(/^\s{3}/);
  });

  it("widget is placed aboveEditor", () => {
    store.create("Task", "Desc");
    widget.update();

    const entry = ui.state.widgets.get("tasks");
    expect(entry?.options?.placement).toBe("aboveEditor");
  });
});

describe("formatDuration (via widget rendering)", () => {
  let store: TaskStore;
  let widget: TaskWidget;
  let ui: ReturnType<typeof mockUICtx>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new TaskStore();
    widget = new TaskWidget(store);
    ui = mockUICtx();
    widget.setUICtx(ui.ctx);
  });

  afterEach(() => {
    widget.dispose();
    vi.useRealTimers();
  });

  it("shows seconds for short durations", () => {
    store.create("Quick", "Desc", "Working");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    vi.advanceTimersByTime(30_000); // 30s
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("30s");
  });

  it("shows hours for long durations", () => {
    store.create("Long", "Desc", "Working");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    vi.advanceTimersByTime(3_723_000); // 1h 2m 3s → "1h 2m"
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("1h 2m");
  });

  it("shows exact hours without minutes", () => {
    store.create("Exact", "Desc", "Working");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    vi.advanceTimersByTime(7_200_000); // 2h exactly
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("2h");
  });

  it("shows minutes and seconds", () => {
    store.create("Medium", "Desc", "Working");
    store.update("1", { status: "in_progress" });
    widget.setActiveTask("1", true);

    vi.advanceTimersByTime(169_000); // 2m 49s
    widget.update();

    const lines = renderWidget(ui.state);
    expect(lines[1]).toContain("2m 49s");
  });

});
