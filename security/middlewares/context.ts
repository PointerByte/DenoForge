// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared middleware types and the authenticated-claims store.
 *
 * Native Deno handlers have no per-request context object, so verified claims
 * are stashed in a `WeakMap` keyed by the `Request` and read back with
 * {@link getClaims}. The {@link Middleware} shape matches the one in `logger`
 * and `config/server`, so all middleware compose freely.
 *
 * @module
 */

/** Native Deno request handler. */
export type Handler = (req: Request) => Response | Promise<Response>;
/** Handler wrapper applied outermost-first. */
export type Middleware = (next: Handler) => Handler;

const claimsStore = new WeakMap<Request, Record<string, unknown>>();

/** Associates verified claims with a request (used by auth middleware). */
export function setClaims(req: Request, claims: Record<string, unknown>): void {
  claimsStore.set(req, claims);
}

/** Returns the verified claims attached to a request, if any. */
export function getClaims<T = Record<string, unknown>>(req: Request): T | undefined {
  return claimsStore.get(req) as T | undefined;
}

/** Builds a JSON error response with the given status. */
export function unauthorized(message: string, status = 401): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
