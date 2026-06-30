// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * HTTP request/response logging middleware.
 *
 * Targets the native `Request -> Response` handler shape used by `Deno.serve`,
 * so it composes with the {@link Middleware} type from `config/server`. The
 * signature is structural, so no import coupling is needed.
 *
 * @module
 */

import type { Logger } from "../builder/builder.ts";

/** Native Deno request handler. */
export type Handler = (req: Request) => Response | Promise<Response>;
/** Handler wrapper, applied outermost-first. */
export type Middleware = (next: Handler) => Handler;

/** Options for {@link httpLogger}. */
export interface HttpLoggerOptions {
  /** Header carrying a correlation id to surface on each log line. */
  requestIdHeader?: string;
}

/**
 * Returns a middleware that logs one structured line per request with method,
 * path, status and latency in milliseconds. Failures are logged at error level
 * and re-thrown so downstream error handling still runs.
 */
export function httpLogger(logger: Logger, options: HttpLoggerOptions = {}): Middleware {
  const idHeader = options.requestIdHeader ?? "x-request-id";
  return (next) => async (req) => {
    const start = performance.now();
    const url = new URL(req.url);
    const requestId = req.headers.get(idHeader) ?? undefined;
    try {
      const res = await next(req);
      logger.info("http.request", {
        method: req.method,
        path: url.pathname,
        status: res.status,
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
        ...(requestId ? { requestId } : {}),
      });
      return res;
    } catch (err) {
      logger.error("http.request.error", {
        method: req.method,
        path: url.pathname,
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
        error: err instanceof Error ? err.message : String(err),
        ...(requestId ? { requestId } : {}),
      });
      throw err;
    }
  };
}
