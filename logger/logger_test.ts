// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

import { assert, assertEquals } from "@std/assert";
import { levelName, LogLevel, parseLevel } from "./common/enums.ts";
import { formatterFor, jsonFormatter, LogFormat, textFormatter } from "./formatter/format.ts";
import { newSanitizer, Sanitizer } from "./sanitizer/sanitizer.ts";
import { disableModeTest, enableModeTest, initLogger } from "./builder/builder.ts";
import { httpLogger } from "./middlewares/http.ts";
import { grpcLogger } from "./middlewares/grpc.ts";

// --- enums ------------------------------------------------------------------

Deno.test("level names and parsing", () => {
  assertEquals(levelName(LogLevel.Debug), "DEBUG");
  assertEquals(levelName(LogLevel.Error), "ERROR");
  assertEquals(levelName(LogLevel.Info), "INFO");
  assertEquals(parseLevel("WARN"), LogLevel.Warn);
  assertEquals(parseLevel("warning"), LogLevel.Warn);
  assertEquals(parseLevel("nonsense"), LogLevel.Info);
});

// --- formatters -------------------------------------------------------------

Deno.test("json and text formatters render records", () => {
  const record = { time: new Date(0), level: LogLevel.Info, message: "hi", attrs: { a: 1 } };
  const json = JSON.parse(jsonFormatter(record));
  assertEquals(json.msg, "hi");
  assertEquals(json.a, 1);
  assert(textFormatter(record).includes("a=1"));
  assertEquals(formatterFor(LogFormat.Text), textFormatter);
});

// --- sanitizer --------------------------------------------------------------

Deno.test("sanitizer redacts sensitive keys recursively", () => {
  const s = newSanitizer(["password", "authorization"]);
  const out = s.details({
    user: "x",
    password: "secret",
    nested: { Authorization: "Bearer t" },
    list: [{ password: "p" }],
  }) as Record<string, unknown>;
  assertEquals(out.user, "x");
  assertEquals(out.password, "[REDACTED]");
  assertEquals((out.nested as Record<string, unknown>).Authorization, "[REDACTED]");
  assertEquals((out.list as Record<string, unknown>[])[0].password, "[REDACTED]");
});

Deno.test("sanitizer handles headers, JSON strings and log lines", () => {
  const s = new Sanitizer(["token"]);
  assertEquals(s.headers({ token: "abc", "x-id": "1" }), { token: "[REDACTED]", "x-id": "1" });
  assertEquals(s.headers(new Headers({ token: "abc" })).token, "[REDACTED]");
  const json = s.value('{"token":"abc","ok":1}') as string;
  assert(json.includes("[REDACTED]"));
  assert(!s.logFormat("plain line").includes("REDACTED"));
  assert(s.logFormat('{"token":"x"}').includes("REDACTED"));
  assertEquals(s.service("plain"), "plain");
});

// --- builder ----------------------------------------------------------------

Deno.test("logger filters by level and emits to a custom sink", () => {
  const lines: string[] = [];
  const log = initLogger({ level: LogLevel.Warn, sink: (l) => lines.push(l) });
  log.debug("d");
  log.info("i");
  log.warn("w");
  log.error("e");
  assertEquals(lines.length, 2);
  assert(lines[0].includes('"msg":"w"'));
});

Deno.test("logger.with adds permanent attributes and sanitizes", () => {
  const lines: string[] = [];
  const log = initLogger({
    sink: (l) => lines.push(l),
    sanitizer: newSanitizer(["password"]),
    service: { name: "svc", version: "1.0" },
  }).with({ requestId: "r1" });
  log.info("evt", { password: "p", ok: true });
  const rec = JSON.parse(lines[0]);
  assertEquals(rec.service, "svc");
  assertEquals(rec.requestId, "r1");
  assertEquals(rec.password, "[REDACTED]");
  assertEquals(rec.ok, true);
});

Deno.test("test mode suppresses all output", () => {
  const lines: string[] = [];
  const log = initLogger({ sink: (l) => lines.push(l) });
  enableModeTest();
  log.error("hidden");
  assert(!log.enabled(LogLevel.Error));
  disableModeTest();
  log.error("shown");
  assertEquals(lines.length, 1);
});

// --- middlewares ------------------------------------------------------------

Deno.test("httpLogger logs success and rethrows on error", async () => {
  const lines: string[] = [];
  const log = initLogger({ sink: (l) => lines.push(l) });
  const ok = httpLogger(log)(() => new Response("ok", { status: 201 }));
  const res = await ok(new Request("http://x/api", { headers: { "x-request-id": "rid" } }));
  assertEquals(res.status, 201);
  assert(lines[0].includes("http.request"));
  assert(lines[0].includes("rid"));

  const boom = httpLogger(log)(() => {
    throw new Error("fail");
  });
  let threw = false;
  try {
    await boom(new Request("http://x/api"));
  } catch {
    threw = true;
  }
  assert(threw);
  assert(lines[1].includes("http.request.error"));
});

Deno.test("grpcLogger logs unary success and error", async () => {
  const lines: string[] = [];
  const log = initLogger({ sink: (l) => lines.push(l) });
  // deno-lint-ignore no-explicit-any
  const ctx = { method: "/svc/M", metadata: {}, call: {}, state: {} } as any;

  await grpcLogger(log)(ctx, () => Promise.resolve("r"));
  assert(lines[0].includes("grpc.request"));

  let threw = false;
  try {
    await grpcLogger(log)(ctx, () => Promise.reject(new Error("x")));
  } catch {
    threw = true;
  }
  assert(threw);
  assert(lines[1].includes("grpc.request.error"));
});
