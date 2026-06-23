/**
 * auto-clear.ts — Auto-clearing of completed tasks.
 *
 * Two modes:
 * - "on_task_complete": each completed task is deleted individually
 * - "on_list_complete": completed tasks are cleared as a batch when ALL tasks are completed
 *
 * By default, clearing happens immediately when completion is tracked.
 */

import type { TaskStore } from "./task-store.js";

export type AutoClearMode = "never" | "on_list_complete" | "on_task_complete";

export class AutoClearManager {
  /** Per-task: turn when task was marked completed (only used when a delay is configured). */
  private completedAtTurn = new Map<string, number>();
  /** Turn when ALL tasks became completed ("on_list_complete" mode). */
  private allCompletedAtTurn: number | null = null;

  constructor(
    private getStore: () => TaskStore,
    private getMode: () => AutoClearMode,
    /** How many turns completed tasks linger before auto-clearing. Defaults to no delay. */
    private clearDelayTurns = 0,
  ) {}

  /** Record a task completion. Call AFTER cascade logic. */
  trackCompletion(taskId: string, currentTurn: number): void {
    const mode = this.getMode();
    if (mode === "never") return;

    if (mode === "on_task_complete") {
      this.completedAtTurn.set(taskId, currentTurn);
    } else if (mode === "on_list_complete") {
      this.checkAllCompleted(currentTurn);
    }

    if (this.clearDelayTurns <= 0) this.onTurnStart(currentTurn);
  }

  /** Check if all tasks are completed and start/reset the batch countdown. */
  private checkAllCompleted(currentTurn: number): void {
    const tasks = this.getStore().list();
    if (tasks.length > 0 && tasks.every(t => t.status === "completed")) {
      if (this.allCompletedAtTurn === null) this.allCompletedAtTurn = currentTurn;
    } else {
      this.allCompletedAtTurn = null;
    }
  }

  /** Reset batch countdown (e.g., when a new task is created or task goes non-completed). */
  resetBatchCountdown(): void {
    this.allCompletedAtTurn = null;
  }

  /** Reset all tracking state (e.g., on new session). */
  reset(): void {
    this.completedAtTurn.clear();
    this.allCompletedAtTurn = null;
  }

  /**
   * Called on each turn start. Deletes tasks that are eligible for auto-clear.
   * Returns true if any tasks were cleared.
   */
  onTurnStart(currentTurn: number): boolean {
    const mode = this.getMode();
    let cleared = false;

    if (mode === "on_task_complete") {
      for (const [taskId, turn] of this.completedAtTurn) {
        const task = this.getStore().get(taskId);
        if (!task || task.status !== "completed") {
          // Task was deleted or reverted — drop stale tracking entry
          this.completedAtTurn.delete(taskId);
        } else if (currentTurn - turn >= this.clearDelayTurns) {
          this.getStore().delete(taskId);
          this.completedAtTurn.delete(taskId);
          cleared = true;
        }
      }
    } else if (mode === "on_list_complete" && this.allCompletedAtTurn !== null) {
      if (currentTurn - this.allCompletedAtTurn >= this.clearDelayTurns) {
        this.getStore().clearCompleted();
        this.allCompletedAtTurn = null;
        cleared = true;
      }
    }

    return cleared;
  }
}
