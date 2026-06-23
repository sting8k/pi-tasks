// ~/.pi/agent/pi-tasks-config.json — persists extension settings globally across projects

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface TasksConfig {
  taskScope?: "memory" | "session" | "project";  // default: "session"
  autoClearCompleted?: "never" | "on_list_complete" | "on_task_complete";  // default: "on_list_complete"
  showAll?: boolean;                     // default: false
  maxVisible?: number;                   // default: 10
  sortOrder?: "id" | "status" | "recent" | "oldest";  // default: "id"
  hiddenAt?: "top" | "bottom";                         // default: "bottom"
  tasksWidgetStyle?: "default" | "compact";             // default: "default"
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-tasks-config.json");
const LEGACY_CONFIG_PATH = join(process.cwd(), ".pi", "tasks-config.json");

export const DEFAULT_TASKS_CONFIG: Required<TasksConfig> = {
  taskScope: "session",
  autoClearCompleted: "on_list_complete",
  showAll: false,
  maxVisible: 10,
  sortOrder: "id",
  hiddenAt: "bottom",
  tasksWidgetStyle: "default",
};

export function loadTasksConfig(): TasksConfig {
  if (!existsSync(CONFIG_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, "utf-8"));
      saveTasksConfig(legacy);
      return legacy;
    } catch {
      saveTasksConfig(DEFAULT_TASKS_CONFIG);
      return { ...DEFAULT_TASKS_CONFIG };
    }
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch { return { ...DEFAULT_TASKS_CONFIG }; }
}

export function saveTasksConfig(config: TasksConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
