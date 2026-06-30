// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Logger example. Run with: `deno run examples/logger.ts`
 */

import { initLogger, LogLevel, newSanitizer } from "../logger/mod.ts";

const log = initLogger({
  level: LogLevel.Debug,
  sanitizer: newSanitizer(["password", "authorization", "token"]),
  service: { name: "example-api", version: "1.0.0" },
});

log.debug("starting up", { port: 8080 });
log.info("user.login", {
  userId: 42,
  password: "hunter2", // redacted by the sanitizer
  headers: { authorization: "Bearer abc.def.ghi" }, // nested redaction
});

const requestLog = log.with({ requestId: "req-123" });
requestLog.warn("slow.query", { durationMs: 1340 });
requestLog.error("db.error", { code: "ECONN" });
