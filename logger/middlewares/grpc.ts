// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * gRPC unary logging interceptor.
 *
 * Logs one structured line per RPC with the method, outcome and latency. It is
 * a {@link ServerInterceptor}, so it plugs into a {@link GrpcServer}'s
 * interceptor chain exactly like {@link httpLogger} plugs into the HTTP one.
 *
 * @module
 */

import type { GrpcContext, ServerInterceptor } from "../../config/server/grpc/interceptors.ts";
import type { Logger } from "../builder/builder.ts";

/** Returns an interceptor that logs each unary RPC via `logger`. */
export function grpcLogger(logger: Logger): ServerInterceptor {
  return async (ctx: GrpcContext, next) => {
    const start = performance.now();
    try {
      const res = await next();
      logger.info("grpc.request", {
        method: ctx.method,
        status: "OK",
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
      });
      return res;
    } catch (err) {
      logger.error("grpc.request.error", {
        method: ctx.method,
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };
}
