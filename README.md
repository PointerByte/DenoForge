# DenoForge

A modular toolkit for **Deno** service-oriented applications, with batteries-included cryptography,
structured logging, security/JWT, background jobs & workers and HTTP tooling.

DenoForge is built on the **Web Crypto API** and the **Deno standard library**, so it runs with
essentially zero external runtime dependencies (only BLAKE3 is delegated, see [Notes](#notes)). Each
capability lives in its own module that you can import independently.

> 🇪🇸 [Versión en español](./README.es.md)

## Modules

| Module                    | Import specifier                                 | What it gives you                                                        |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| `encrypt`                 | `@pointerbyte/denoforge/encrypt`                 | AES-GCM, RSA-OAEP, ECDH, Ed25519/RSA signatures, HMAC, SHA-256, BLAKE3   |
| `encrypt/aws-kms`         | `@pointerbyte/denoforge/encrypt/aws-kms`         | AWS KMS-backed encrypt/decrypt/sign/verify + key lifecycle               |
| `encrypt/azure-key-vault` | `@pointerbyte/denoforge/encrypt/azure-key-vault` | Azure Key Vault-backed crypto + key lifecycle                            |
| `encrypt/gcp-kms`         | `@pointerbyte/denoforge/encrypt/gcp-kms`         | Google Cloud KMS-backed crypto + key lifecycle                           |
| `logger`                  | `@pointerbyte/denoforge/logger`                  | leveled JSON logging, sensitive-value sanitizer, HTTP + gRPC middleware  |
| `security`                | `@pointerbyte/denoforge/security`                | JWT (HS256/RS256/PS256/EdDSA), cookie auth, security + gRPC middleware   |
| `tools`                   | `@pointerbyte/denoforge/tools`                   | interval/cron jobs, a bounded worker loop, test-mode flag                |
| `config`                  | `@pointerbyte/denoforge/config`                  | `fetch` REST client, native `Deno.serve` HTTP server, gRPC client/server |

## Requirements

- [Deno](https://deno.com/) **2.x** (developed against 2.9).

## Installation

DenoForge can be consumed **locally** from other Deno projects, with or without publishing to a
registry.

### Option A — local path import map (recommended for local use)

In your project's `deno.json`, point an import alias at the DenoForge folder:

```json
{
  "imports": {
    "@denoforge/": "../DenoForge/"
  }
}
```

Then import per module:

```ts
import { newLocalProvider } from "@denoforge/encrypt/mod.ts";
import { createService } from "@denoforge/security/mod.ts";
```

### Option B — direct relative import

```ts
import { newLocalProvider } from "../DenoForge/encrypt/mod.ts";
```

### Option C — as a JSR package

The package is configured for JSR (`deno.json` `name`/`exports`). Once published you can
`deno add jsr:@pointerbyte/denoforge` and import via the specifiers in the table above.

## Quick start

```ts
import { encrypt, security } from "@pointerbyte/denoforge";

const enc = encrypt.newLocalProvider();
const key = await enc.generateSymmetricKeys({ size: encrypt.SizeSymmetricKey.Key256Bits });
const cipher = await enc.encryptAES({ secretKey: key.keyRef, value: "hello" });

const jwt = security.createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });
const token = await jwt.sign({ sub: "user-1" });
```

> The root entry namespaces every module (`encrypt`, `logger`, `security`, `tools`, `config`) so
> names that repeat across modules — `Service`, `Middleware`, `Handler` — never collide. Prefer the
> per-module specifiers when you want a smaller dependency graph.

## Usage

### `encrypt`

A local cryptographic provider backed by Web Crypto, organized into focused repositories: symmetric,
asymmetric, hashing, signatures and key management.

```ts
import {
  CurveAsymmetricKey,
  newLocalProvider,
  SizeAsymmetricKey,
  SizeSymmetricKey,
} from "@pointerbyte/denoforge/encrypt";

const enc = newLocalProvider();

// AES-GCM (128/256-bit), AAD supported, nonce prepended to ciphertext.
const sym = await enc.generateSymmetricKeys({ size: SizeSymmetricKey.Key256Bits });
const ct = await enc.encryptAES({ secretKey: sym.keyRef, value: "secret", additional: "aad" });
const pt = await enc.decryptAES({ secretKey: sym.keyRef, cipherValue: ct, additional: "aad" });

// RSA-OAEP, ECDH hybrid encryption, Ed25519 / RSA-PSS / RSA-PKCS1v15 signatures.
const rsa = await enc.generateRSAKeys({ size: SizeAsymmetricKey.Key2048Bits });
const ec = await enc.generateECDHCurveKeys({ curve: CurveAsymmetricKey.CurveP256 });
const ed = await enc.generateEd25519Keys();

// Hashing: HMAC-SHA256, SHA-256 hex, BLAKE3.
await enc.sha256Hex("abc");
```

Keys are exchanged as **Base64-encoded DER** (SPKI for public, PKCS#8 for private; raw bytes for
symmetric keys) via the `KeyData` model. Every operation accepts an optional `signal`
(`AbortSignal`) for cancellation.

#### Cloud KMS providers

For keys that never leave a managed HSM, the `aws-kms`, `azure-key-vault` and `gcp-kms` providers
implement a shared `CloudKmsRepository` (encrypt/decrypt, sign/verify, and key lifecycle:
get/rotate/deactivate). Each loads its cloud SDK **lazily on first use**, so they add nothing to
your graph until you import them.

```ts
import { newAwsKmsProvider } from "@pointerbyte/denoforge/encrypt/aws-kms";

const kms = newAwsKmsProvider({ region: "us-east-1" }); // needs @aws-sdk/client-kms + AWS creds
const ciphertext = await kms.encrypt({ keyId: "alias/app", plaintext: "secret" });
const plaintext = await kms.decrypt({ keyId: "alias/app", ciphertext });
const signature = await kms.sign({ keyId: "alias/signing", message: "payload" });
const ok = await kms.verify({ keyId: "alias/signing", message: "payload", signature });
const meta = await kms.getKey({ keyId: "alias/app" });
```

All three accept an injected `api` (the `KmsApi` seam) so you can unit-test provider logic without
any cloud access. Required peer packages: `@aws-sdk/client-kms`, `@azure/keyvault-keys` (+
`@azure/identity`), `@google-cloud/kms`.

### `logger`

Leveled, structured (JSON) logging with a sensitive-value **sanitizer** and an HTTP middleware.

```ts
import { initLogger, LogLevel, newSanitizer } from "@pointerbyte/denoforge/logger";

const log = initLogger({
  level: LogLevel.Debug,
  sanitizer: newSanitizer(["password", "authorization"]),
  service: { name: "api", version: "1.0.0" },
});
log.info("user.login", { userId: 1, password: "x" }); // password -> [REDACTED]
```

Output goes to a pluggable `Sink` (the console by default); supply your own sink to forward records
to a file, a collector or an OpenTelemetry exporter.

### `security`

JWT signing/verification (`HS256`, `RS256`, `PS256`, `EdDSA`, plus a custom strategy), cookie
authentication, and HTTP middleware (`securityHeaders`, `jwtMiddleware`, `cookieMiddleware`).

```ts
import { createService, getClaims, jwtMiddleware } from "@pointerbyte/denoforge/security";

const jwt = createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });
const token = await jwt.sign({ sub: "u1", role: "admin" });
const auth = jwtMiddleware(jwt); // 401s unless a valid Bearer token is present
```

### `tools`

In-process **interval/cron jobs** and a **bounded worker loop**, plus a shared test-mode flag that
suppresses background work during tests.

```ts
import { addTask, job, runWorkers, startJobs } from "@pointerbyte/denoforge/tools";

runWorkers();
addTask(() => doBackgroundWork());

const id = job(() => poll(), 5000); // every 5s
startJobs();
```

### `config`

A `fetch`-based REST client and a native `Deno.serve` HTTP server with middleware, route groups, a
`/health` endpoint and graceful shutdown.

```ts
import { newClientHTTP, newHttpServer } from "@pointerbyte/denoforge/config";

const server = newHttpServer({ port: 8080 });
server.get("/api/ping", () => Response.json({ pong: true }));
server.group("/api/v1").get("/users", listUsers);
server.listen();

const api = newClientHTTP({ baseUrl: "https://example.com", timeoutMs: 5000 });
const { data } = await api.get<{ id: number }>("/users/1");
```

Middleware shares a single `(next) => (req) => Response` shape across `logger`, `security` and
`config`, so the pieces compose freely:

```ts
import { newHttpServer } from "@pointerbyte/denoforge/config";
import { httpLogger, initLogger } from "@pointerbyte/denoforge/logger";
import { createService, jwtMiddleware, securityHeaders } from "@pointerbyte/denoforge/security";

const log = initLogger({ service: { name: "api" } });
const jwt = createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });

const server = newHttpServer({ port: 8080 })
  .use(httpLogger(log))
  .use(securityHeaders());

server.group("/api", jwtMiddleware(jwt))
  .get("/me", (req) => Response.json({ claims: getClaims(req) }));

server.listen();
```

#### gRPC

`config` also ships a gRPC client and server built on `@grpc/grpc-js`, with the same composable
interceptor model. Server interceptors (logging, JWT auth) wrap unary handlers; the client
promisifies unary calls and injects metadata.

```ts
import { GrpcClient, GrpcServer, loadProto } from "@pointerbyte/denoforge/config";
import { grpcLogger, initLogger } from "@pointerbyte/denoforge/logger";
import { createService, grpcClaims, grpcJwtInterceptor } from "@pointerbyte/denoforge/security";

const log = initLogger({ service: { name: "svc" } });
const jwt = createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });

const proto = loadProto(new URL("./proto/methods.proto", import.meta.url));
// deno-lint-ignore no-explicit-any
const Methods = (proto.denoforge as any).v1.Methods;

const server = new GrpcServer({ interceptors: [grpcLogger(log), grpcJwtInterceptor(jwt)] });
server.addService(Methods.service, {
  Echo: (req, ctx) => ({ message: `${grpcClaims(ctx)?.sub}: ${req.message}` }),
  Health: () => ({ status: "ok" }),
});
const port = await server.listen("127.0.0.1:50051");

const client = new GrpcClient(Methods, `127.0.0.1:${port}`);
const res = await client.unary("Echo", { message: "hi" }, {
  bearer: await jwt.sign({ sub: "u1" }),
});
```

## Testing

```sh
deno task test   # run the suite
deno task cov    # run with coverage and print the table
```

The suite covers crypto round-trips, JWT/cookie auth, the sanitizer, jobs & workers, the HTTP
client/server, gRPC interceptors and a gRPC round-trip, plus the KMS providers via an injected fake
`KmsApi` — **~87% line coverage**. The cloud SDK adapters themselves are exercised through the
injectable seam rather than against live cloud services.

## Notes

- **BLAKE3** has no Web Crypto equivalent, so it is the single delegated primitive (provided via
  `@noble/hashes`). Every other algorithm uses the platform `crypto.subtle`.
- **Key management** (`rotateKey`, `getKey`, `deactivateKey`) is provider-backed: the local provider
  throws `UnsupportedOperationError`, while the `aws-kms`, `azure-key-vault` and `gcp-kms` providers
  implement it against their cloud KMS.
- **Cancellation** is expressed with `AbortSignal` (the `signal` field on requests / the `signal`
  argument on helpers).

## Project structure

```text
DenoForge/
├── deno.json              # import map, tasks, exports
├── mod.ts                 # namespaced root barrel
├── encrypt/               # crypto (Web Crypto) + cloud KMS
│   ├── common/{enums,kms}.ts
│   ├── models/models.ts
│   ├── utilities/utilities.ts
│   ├── local/{interface,repository,mod}.ts
│   ├── aws-kms/{interface,repository,mod}.ts
│   ├── azure-key-vault/{interface,repository,mod}.ts
│   ├── gcp-kms/{interface,repository,mod}.ts
│   ├── errors.ts
│   └── mod.ts
├── logger/                # structured logging
│   ├── common/enums.ts
│   ├── formatter/format.ts
│   ├── sanitizer/sanitizer.ts
│   ├── builder/builder.ts
│   ├── middlewares/http.ts
│   └── mod.ts
├── security/              # JWT + cookies + middleware
│   ├── auth/jwt/jwt.ts
│   ├── auth/cookies/cookies.ts
│   ├── middlewares/{context,headers,jwt,cookies}.ts
│   └── mod.ts
├── tools/                 # jobs, workers, mode
│   ├── jobs/jobs.ts
│   ├── workers/workers.ts
│   ├── utilities/mode.ts
│   └── mod.ts
├── config/                # transport bootstrap (HTTP + gRPC)
│   ├── client/http/{interface,models,client}.ts
│   ├── client/grpc/client.ts
│   ├── server/http/server.ts
│   ├── server/grpc/{server,interceptors}.ts
│   ├── proto/{methods.proto,loader.ts}
│   └── mod.ts
└── examples/              # runnable demos
```

## Development

```sh
deno task check          # type-check everything
deno task test           # run tests
deno task example:encrypt
deno task example:jwt
deno task example:logger
deno task example:server # serves on :8080 (task includes --allow-net)
```

## License

Apache-2.0. See [LICENSE](./LICENSE).

> DenoForge's design and module layout are inspired by the GoForge project.
