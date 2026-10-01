import type { Task, TaskCompletion } from './types';
import { addDays, businessDate, weekIndex, weekdayOf } from './dates';

export interface DueTask {
  task: Task;
  dueDate: string;
  done: boolean;
  late: boolean;
}

/** How many days back an unfinished task keeps showing up as "late". */
export const CARRY_OVER_DAYS = 6;

export function completionId(taskId: string, dueDate: string): string {
  return `${dueDate}|${taskId}`;
}

/** Is the task scheduled on this calendar date (weekday + weekly / every-two-weeks cycle)? */
export function isScheduledOn(task: Task, date: string, anchor: string): boolean {
  if (!task.active || task.weekday !== weekdayOf(date)) return false;
  if (task.everyNWeeks === 1) return true;
  const idx = weekIndex(date, anchor);
  return (((idx % 2) + 2) % 2) === task.weekOffset;
}

/**
 * Tasks to show on `today`: everything scheduled for today (done or not), plus tasks from
 * the previous days that were never completed (shown as late). A late task that someone
 * ticked today stays on the list (as done) so it does not vanish under their finger.
 * Days before `startDate` (when the app went into use) are never counted as missed.
 */
export function dueTasks(
  tasks: Task[],
  completions: TaskCompletion[],
  today: string,
  anchor: string,
  startDate: string = anchor,
): DueTask[] {
  const byId = new Map(completions.map((c) => [c.id, c]));
  const result: DueTask[] = [];

  for (let back = CARRY_OVER_DAYS; back >= 0; back--) {
    const date = addDays(today, -back);
    if (date < startDate) continue;
    for (const task of tasks) {
      if (!isScheduledOn(task, date, anchor)) continue;
      const completion = byId.get(completionId(task.id, date));
      const done = completion !== undefined;
      const doneToday = done && businessDate(new Date(completion.at)) === today;
      if (back === 0 || !done || doneToday) result.push({ task, dueDate: date, done, late: back > 0 });
    }
  }

  return result.sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1;
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.task.order - b.task.order;
  });
}
