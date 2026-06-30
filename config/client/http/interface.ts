// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * REST client contract: a typed REST surface whose generic methods cover
 * both raw and typed responses through TypeScript generics.
 *
 * @module
 */

import type { HttpResponse, RequestOptions } from "./models.ts";

/** A typed REST client (mirrors `IRest` / `IRestGeneric`). */
export interface Rest {
  get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>>;
  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse<T>>;
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
}
