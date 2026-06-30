// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * `config` — transport bootstrap: a `fetch`-based REST client and a native
 * `Deno.serve` HTTP server, plus a `@grpc/grpc-js`-backed gRPC client/server
 * with an interceptor chain. All come with middleware, graceful shutdown and a
 * shared, composable interceptor/middleware model.
 *
 * @module
 */

// HTTP client (config/client/http)
export type { Rest } from "./client/http/interface.ts";
export {
  type ClientOptions,
  HttpClientError,
  type HttpResponse,
  type RequestOptions,
} from "./client/http/models.ts";
export { ClientHTTP, newClientHTTP } from "./client/http/client.ts";

// HTTP server (config/server/http)
export {
  type Handler,
  HttpServer,
  type HttpServerOptions,
  type Middleware,
  newHttpServer,
  RouteGroup,
} from "./server/http/server.ts";

// Proto loading (config/proto)
export { loadProto, type LoadProtoOptions } from "./proto/loader.ts";

// gRPC server (config/server/grpc)
export {
  type GrpcContext,
  GrpcError,
  type ServerInterceptor,
  status as grpcStatus,
  unary,
  type UnaryHandler,
} from "./server/grpc/interceptors.ts";
export {
  GrpcServer,
  type GrpcServerOptions,
  newGrpcServer,
  type ServiceHandlers,
} from "./server/grpc/server.ts";

// gRPC client (config/client/grpc)
export { type CallOptions, GrpcClient, newGrpcClient } from "./client/grpc/client.ts";
