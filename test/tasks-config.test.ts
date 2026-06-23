import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const fakeHome = join(tmpdir(), `pi-tasks-config-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fakeCwd = join(tmpdir(), `pi-tasks-config-cwd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const configPath = join(fakeHome, ".pi", "agent", "pi-tasks-config.json");
const legacyConfigPath = join(fakeCwd, ".pi", "tasks-config.json");

describe("tasks config", () => {
  beforeEach(() => {
    vi.resetModules();
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(fakeCwd, { recursive: true, force: true });
    mkdirSync(fakeCwd, { recursive: true });
    process.chdir(fakeCwd);
    vi.doMock("node:os", async () => {
      const actual = await vi.importActual<typeof import("node:os")>("node:os");
      return { ...actual, homedir: () => fakeHome };
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.doUnmock("node:os");
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(fakeCwd, { recursive: true, force: true });
  });

  it("scaffolds default settings globally under ~/.pi/agent/pi-tasks-config.json", async () => {
    const { DEFAULT_TASKS_CONFIG, loadTasksConfig } = await import("../src/tasks-config.js");

    expect(loadTasksConfig()).toEqual(DEFAULT_TASKS_CONFIG);
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual(DEFAULT_TASKS_CONFIG);
  });

  it("persists settings globally under ~/.pi/agent/pi-tasks-config.json", async () => {
    const { loadTasksConfig, saveTasksConfig } = await import("../src/tasks-config.js");

    saveTasksConfig({ taskScope: "project", tasksWidgetStyle: "compact", maxVisible: 15 });

    expect(existsSync(configPath)).toBe(true);
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({
      taskScope: "project",
      tasksWidgetStyle: "compact",
      maxVisible: 15,
    });
    expect(loadTasksConfig()).toEqual({
      taskScope: "project",
      tasksWidgetStyle: "compact",
      maxVisible: 15,
    });
  });

  it("migrates a legacy project-local config before scaffolding defaults", async () => {
    mkdirSync(join(fakeCwd, ".pi"), { recursive: true });
    writeFileSync(legacyConfigPath, JSON.stringify({
      taskScope: "project",
      autoClearCompleted: "never",
      tasksWidgetStyle: "compact",
    }));
    const { loadTasksConfig } = await import("../src/tasks-config.js");

    expect(loadTasksConfig()).toEqual({
      taskScope: "project",
      autoClearCompleted: "never",
      tasksWidgetStyle: "compact",
    });
    expect(JSON.parse(readFileSync(configPath, "utf-8"))).toEqual({
      taskScope: "project",
      autoClearCompleted: "never",
      tasksWidgetStyle: "compact",
    });
  });
});
