// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Server-side unary interceptors and the handler composer.
 *
 * gRPC handlers are wrapped with an interceptor chain analogous to a server
 * middleware stack: each {@link ServerInterceptor} runs around the next one and
 * can short-circuit (e.g. auth) by throwing a {@link GrpcError}. {@link unary}
 * turns a plain `(request, ctx) => response` handler plus interceptors into a
 * `@grpc/grpc-js`-compatible unary handler.
 *
 * @module
 */

import grpc from "@grpc/grpc-js";
import type { handleUnaryCall, Metadata, sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js";

/** Per-call context handed to handlers and interceptors. */
export interface GrpcContext {
  /** Fully-qualified method path, e.g. `/denoforge.v1.Methods/Echo`. */
  readonly method: string;
  /** Inbound request metadata (headers). */
  readonly metadata: Metadata;
  /** The underlying grpc-js call object. */
  readonly call: ServerUnaryCall<unknown, unknown>;
  /** Mutable bag for interceptors to pass data downstream (e.g. JWT claims). */
  readonly state: Record<string, unknown>;
}

/** A unary business handler. */
export type UnaryHandler<Req = unknown, Res = unknown> = (
  request: Req,
  ctx: GrpcContext,
) => Res | Promise<Res>;

/** Wraps the next handler in the chain; throw {@link GrpcError} to fail the call. */
export type ServerInterceptor = (
  ctx: GrpcContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

/** A gRPC error carrying a status code (mirrors a `status.Error`). */
export class GrpcError extends Error {
  override name = "GrpcError";
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/** Convenience codes re-exported so callers don't import grpc-js directly. */
export const status = grpc.status;

/** Maps an arbitrary thrown value to a grpc-js service error. */
function toServiceError(err: unknown): grpc.ServiceError {
  if (err instanceof GrpcError) {
    return Object.assign(new Error(err.message), { code: err.code }) as grpc.ServiceError;
  }
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new Error(message), { code: grpc.status.INTERNAL }) as grpc.ServiceError;
}

/**
 * Composes a unary handler with interceptors into a grpc-js handler. The
 * interceptors run outermost-first, exactly like HTTP middleware.
 */
export function unary<Req, Res>(
  handler: UnaryHandler<Req, Res>,
  ...interceptors: ServerInterceptor[]
): handleUnaryCall<Req, Res> {
  return (call: ServerUnaryCall<Req, Res>, callback: sendUnaryData<Res>) => {
    const ctx: GrpcContext = {
      method: call.getPath?.() ?? "",
      metadata: call.metadata,
      call: call as ServerUnaryCall<unknown, unknown>,
      state: {},
    };
    const invoke = () => Promise.resolve().then(() => handler(call.request, ctx));
    const chain = interceptors.reduceRight<() => Promise<unknown>>(
      (next, interceptor) => () => interceptor(ctx, next),
      invoke,
    );
    // Defer into a microtask so a synchronous throw anywhere in the chain
    // becomes a rejection routed to the callback instead of escaping.
    Promise.resolve().then(chain).then(
      (res) => callback(null, res as Res),
      (err) => callback(toServiceError(err), null),
    );
  };
}
