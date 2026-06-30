// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

import { assert, assertEquals } from "@std/assert";
import {
  checkStatusJobs,
  cronJob,
  cronJobWithID,
  job,
  Jobs,
  jobWithID,
  pauseJob,
  restartJobs,
  resumeJob,
  startJobs,
  stopAllJobs,
  stopJob,
} from "./jobs.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("cron job fires when the trigger second matches", async () => {
  const jobs = new Jobs();
  try {
    const target = new Date(Date.now() + 2000);
    let fired = 0;
    jobs.cronJobWithID("cron", () => {
      fired++;
    }, {
      hour: target.getHours(),
      minute: target.getMinutes(),
      second: target.getSeconds(),
    });
    jobs.startJobs();
    await sleep(2600);
    assert(fired >= 1, `expected cron to fire, got ${fired}`);
  } finally {
    jobs.destroy();
  }
});

Deno.test("interval job timeout is reported without crashing", async () => {
  const jobs = new Jobs();
  const original = console.error;
  let logged = false;
  console.error = () => {
    logged = true;
  };
  try {
    jobs.job(
      async () => {
        await sleep(200);
      },
      30,
      10,
    ); // timeout (10ms) shorter than the work (200ms)
    jobs.startJobs();
    await sleep(120);
    assert(logged, "expected a timeout error to be logged");
  } finally {
    console.error = original;
    jobs.destroy();
  }
});

Deno.test("package-level job API drives the default instance", async () => {
  try {
    let n = 0;
    const id = job(() => {
      n++;
    }, 20);
    jobWithID("fixed", () => {}, 1000);
    cronJobWithID("c", () => {}, { hour: 0, minute: 0, second: 0 }, 1000);
    const autoCron = cronJob(() => {}, { hour: 0, minute: 0, second: 0 });
    startJobs();
    await sleep(60);
    assert(n >= 1);

    pauseJob(id);
    resumeJob(id);
    assert(checkStatusJobs().some((s) => s.id === id));

    stopJob("fixed");
    stopJob(autoCron);
    restartJobs();
  } finally {
    stopAllJobs();
  }
});

Deno.test("destroy stops jobs and clears status", () => {
  const jobs = new Jobs();
  jobs.jobWithID("a", () => {}, 1000);
  assertEquals(jobs.checkStatus().length, 1);
  jobs.destroy();
  assertEquals(jobs.checkStatus().length, 0);
});
