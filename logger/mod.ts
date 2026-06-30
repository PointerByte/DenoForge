// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * `logger` — structured, sanitizable, leveled logging with HTTP middleware.
 *
 * @example
 * ```ts
 * import { initLogger, LogLevel, newSanitizer } from "@pointerbyte/denoforge/logger";
 *
 * const log = initLogger({
 *   level: LogLevel.Debug,
 *   sanitizer: newSanitizer(["password", "authorization"]),
 *   service: { name: "api", version: "1.0.0" },
 * });
 * log.info("user.login", { userId: 42, password: "hunter2" }); // password redacted
 * ```
 *
 * @module
 */

export * from "./common/enums.ts";
export * from "./formatter/format.ts";
export * from "./sanitizer/sanitizer.ts";
export {
  disableModeTest,
  enableModeTest,
  initLogger,
  Logger,
  type LoggerOptions,
  type Sink,
} from "./builder/builder.ts";
export {
  type Handler,
  httpLogger,
  type HttpLoggerOptions,
  type Middleware,
} from "./middlewares/http.ts";
export { grpcLogger } from "./middlewares/grpc.ts";
