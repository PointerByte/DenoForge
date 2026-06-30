// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Fixed-interval and cron in-process job scheduling.
 *
 * Uses the event loop with `setInterval` plus per-job control flags. The API
 * is an instance-level {@link Jobs} class and package-level helpers backed by a
 * default instance, plus a global registry so {@link stopAllJobs} can halt
 * every instance.
 *
 * Durations are expressed in **milliseconds**.
 *
 * @module
 */

import { isModeTest } from "../utilities/mode.ts";

/**
 * Specifies when a cron job fires. `null`/`undefined` components mean "any"
 * (wildcard).
 */
export interface CronTrigger {
  /** Specific year, or any year when omitted. */
  year?: number;
  /** Month 1-12, or any month when omitted. */
  month?: number;
  /** Day of month 1-31, or any day when omitted. */
  day?: number;
  /** Hour 0-23. */
  hour: number;
  /** Minute 0-59. */
  minute: number;
  /** Second 0-59. */
  second: number;
}

/** Snapshot of a single job's runtime state. */
export interface JobStatus {
  id: string;
  kind: "interval" | "cron";
  paused: boolean;
  stopped: boolean;
  running: boolean;
}

type JobFn = () => void | Promise<void>;

interface JobControl {
  id: string;
  kind: "interval" | "cron";
  paused: boolean;
  stopped: boolean;
  running: boolean;
  timer?: ReturnType<typeof setInterval>;
  /** Executes one tick honouring pause/stop and optional timeout. */
  tick: () => void;
}

const CRON_RESOLUTION_MS = 1000;

/** Manages the lifecycle of a set of interval/cron jobs. */
export class Jobs {
  readonly #controls = new Map<string, JobControl>();
  #started = false;

  constructor() {
    registry.add(this);
  }

  /** Registers an interval job and returns its generated id. */
  job(fn: JobFn, intervalMs: number, timeoutMs?: number): string {
    const id = crypto.randomUUID();
    this.#registerInterval(id, fn, intervalMs, timeoutMs);
    return id;
  }

  /** Registers an interval job under a caller-supplied id. */
  jobWithID(id: string, fn: JobFn, intervalMs: number, timeoutMs?: number): void {
    if (this.#controls.has(id)) throw new Error(`jobs: duplicate job id: ${id}`);
    this.#registerInterval(id, fn, intervalMs, timeoutMs);
  }

  /** Registers a cron job and returns its generated id. */
  cronJob(fn: JobFn, trigger: CronTrigger, intervalMs = 0): string {
    const id = crypto.randomUUID();
    this.#registerCron(id, fn, trigger, intervalMs);
    return id;
  }

  /** Registers a cron job under a caller-supplied id. */
  cronJobWithID(id: string, fn: JobFn, trigger: CronTrigger, intervalMs = 0): void {
    if (this.#controls.has(id)) throw new Error(`jobs: duplicate job id: ${id}`);
    this.#registerCron(id, fn, trigger, intervalMs);
  }

  /** Starts every registered job. No-op in test mode. */
  startJobs(): void {
    if (this.#started || isModeTest()) return;
    this.#started = true;
    for (const control of this.#controls.values()) this.#arm(control);
  }

  /** Stops and clears a single job. */
  stopJob(id: string): void {
    const control = this.#controls.get(id);
    if (!control) return;
    control.stopped = true;
    this.#disarm(control);
    this.#controls.delete(id);
  }

  /** Pauses a job without discarding its definition. */
  pauseJob(id: string): void {
    const control = this.#controls.get(id);
    if (control) control.paused = true;
  }

  /** Resumes a previously paused job. */
  resumeJob(id: string): void {
    const control = this.#controls.get(id);
    if (control) control.paused = false;
  }

  /** Returns the status of every job on this instance. */
  checkStatus(): JobStatus[] {
    return [...this.#controls.values()].map((c) => ({
      id: c.id,
      kind: c.kind,
      paused: c.paused,
      stopped: c.stopped,
      running: c.running,
    }));
  }

  /** Stops every job and unregisters the instance from the global registry. */
  destroy(): void {
    for (const control of [...this.#controls.values()]) this.stopJob(control.id);
    this.#started = false;
    registry.delete(this);
  }

  // --- internals ----------------------------------------------------------

  #registerInterval(id: string, fn: JobFn, intervalMs: number, timeoutMs?: number): void {
    const control: JobControl = {
      id,
      kind: "interval",
      paused: false,
      stopped: false,
      running: false,
      tick: () => this.#execute(control, fn, timeoutMs),
    };
    this.#controls.set(id, control);
    if (this.#started && !isModeTest()) {
      control.timer = setInterval(control.tick, intervalMs);
    } else {
      control.timer = undefined;
      pendingInterval.set(control, intervalMs);
    }
  }

  #registerCron(id: string, fn: JobFn, trigger: CronTrigger, intervalMs: number): void {
    let lastFired = 0;
    const control: JobControl = {
      id,
      kind: "cron",
      paused: false,
      stopped: false,
      running: false,
      tick: () => {
        const now = new Date();
        if (!matchesTrigger(now, trigger)) return;
        if (intervalMs > 0 && Date.now() - lastFired < intervalMs) return;
        lastFired = Date.now();
        this.#execute(control, fn);
      },
    };
    this.#controls.set(id, control);
    pendingCron.add(control);
    if (this.#started && !isModeTest()) this.#arm(control);
  }

  #arm(control: JobControl): void {
    if (control.timer !== undefined) return;
    if (control.kind === "cron") {
      control.timer = setInterval(control.tick, CRON_RESOLUTION_MS);
    } else {
      const intervalMs = pendingInterval.get(control) ?? 0;
      control.timer = setInterval(control.tick, intervalMs);
    }
  }

  #disarm(control: JobControl): void {
    if (control.timer !== undefined) {
      clearInterval(control.timer);
      control.timer = undefined;
    }
  }

  async #execute(control: JobControl, fn: JobFn, timeoutMs?: number): Promise<void> {
    if (control.paused || control.stopped || control.running) return;
    control.running = true;
    try {
      if (timeoutMs && timeoutMs > 0) {
        await withTimeout(fn, timeoutMs);
      } else {
        await fn();
      }
    } catch (err) {
      console.error(`jobs: job ${control.id} failed:`, err);
    } finally {
      control.running = false;
    }
  }
}

// Side tables used only while a job is registered but the instance is not
// started yet, so #arm knows each job's cadence.
const pendingInterval = new WeakMap<JobControl, number>();
const pendingCron = new WeakSet<JobControl>();

/** Returns true when `date` satisfies every defined component of `trigger`. */
export function matchesTrigger(date: Date, trigger: CronTrigger): boolean {
  if (trigger.year !== undefined && date.getFullYear() !== trigger.year) return false;
  if (trigger.month !== undefined && date.getMonth() + 1 !== trigger.month) return false;
  if (trigger.day !== undefined && date.getDate() !== trigger.day) return false;
  return (
    date.getHours() === trigger.hour &&
    date.getMinutes() === trigger.minute &&
    date.getSeconds() === trigger.second
  );
}

function withTimeout(fn: JobFn, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("jobs: job timed out")), timeoutMs);
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

// --- Global registry + package-level API -----------------------------------

const registry = new Set<Jobs>();
const defaultJobs = new Jobs();

/** Registers an interval job on the default instance. */
export function job(fn: JobFn, intervalMs: number, timeoutMs?: number): string {
  return defaultJobs.job(fn, intervalMs, timeoutMs);
}

/** Registers an interval job under a fixed id on the default instance. */
export function jobWithID(id: string, fn: JobFn, intervalMs: number, timeoutMs?: number): void {
  defaultJobs.jobWithID(id, fn, intervalMs, timeoutMs);
}

/** Registers a cron job on the default instance. */
export function cronJob(fn: JobFn, trigger: CronTrigger, intervalMs = 0): string {
  return defaultJobs.cronJob(fn, trigger, intervalMs);
}

/** Registers a cron job under a fixed id on the default instance. */
export function cronJobWithID(
  id: string,
  fn: JobFn,
  trigger: CronTrigger,
  intervalMs = 0,
): void {
  defaultJobs.cronJobWithID(id, fn, trigger, intervalMs);
}

/** Starts the default instance's jobs. */
export function startJobs(): void {
  defaultJobs.startJobs();
}

/** Stops then restarts the default instance. */
export function restartJobs(): void {
  defaultJobs.destroy();
  defaultJobs.startJobs();
}

/** Pauses a job on the default instance. */
export function pauseJob(id: string): void {
  defaultJobs.pauseJob(id);
}

/** Resumes a job on the default instance. */
export function resumeJob(id: string): void {
  defaultJobs.resumeJob(id);
}

/** Stops a job on the default instance. */
export function stopJob(id: string): void {
  defaultJobs.stopJob(id);
}

/** Returns the status of every job across every registered instance. */
export function checkStatusJobs(): JobStatus[] {
  return [...registry].flatMap((instance) => instance.checkStatus());
}

/** Stops and destroys every registered {@link Jobs} instance. */
export function stopAllJobs(): void {
  for (const instance of [...registry]) instance.destroy();
}
