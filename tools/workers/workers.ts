// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Bounded worker loop.
 *
 * A bounded task pool: a FIFO queue with a configurable concurrency limit, so
 * at most `limit` tasks run at once and the rest wait.
 *
 * @module
 */

const DEFAULT_WORKER_LIMIT = 10_000;

/** A unit of work scheduled onto the pool. May be sync or async. */
export type Task = () => void | Promise<void>;

let limit = DEFAULT_WORKER_LIMIT;
let queue: Task[] = [];
let active = 0;
let running = false;

/** Enqueues a task to be executed by the worker loop. */
export function addTask(task: Task): void {
  queue.push(task);
  if (running) pump();
}

/**
 * Sets the maximum number of concurrently running tasks for future runs.
 * Non-positive limits fall back to the default.
 */
export function setWorkersLimit(value: number): void {
  limit = value <= 0 ? DEFAULT_WORKER_LIMIT : value;
  if (running) pump();
}

/** Starts the managed worker loop if one is not already running. */
export function runWorkers(): void {
  if (running) return;
  running = true;
  pump();
}

/** Stops the worker loop. In-flight tasks finish; queued tasks remain. */
export function stopWorkers(): void {
  running = false;
}

/** Stops the worker loop and starts it again. */
export function restartWorkers(): void {
  stopWorkers();
  runWorkers();
}

/** Drains the pending queue and resets the limit. Mainly for tests. */
export function resetWorkers(): void {
  stopWorkers();
  queue = [];
  active = 0;
  limit = DEFAULT_WORKER_LIMIT;
}

/** Pulls tasks off the queue while capacity and the running flag allow it. */
function pump(): void {
  while (running && active < limit && queue.length > 0) {
    const task = queue.shift()!;
    active++;
    Promise.resolve()
      .then(task)
      .catch((err) => console.error("workers: task failed:", err))
      .finally(() => {
        active--;
        if (running) pump();
      });
  }
}
