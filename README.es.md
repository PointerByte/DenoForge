# DenoForge

Un conjunto de herramientas modular para aplicaciones orientadas a servicios en **Deno**, con
criptografía, logging estructurado, seguridad/JWT, jobs y workers en segundo plano y utilidades HTTP
incluidas.

DenoForge está construido sobre la **Web Crypto API** y la **librería estándar de Deno**, por lo que
funciona prácticamente sin dependencias externas en tiempo de ejecución (solo BLAKE3 se delega, ver
[Notas](#notas)). Cada capacidad vive en su propio módulo que puedes importar de forma
independiente.

> 🇬🇧 [English version](./README.md)

## Módulos

| Módulo                    | Especificador de import                          | Qué te aporta                                                                  |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `encrypt`                 | `@pointerbyte/denoforge/encrypt`                 | AES-GCM, RSA-OAEP, ECDH, firmas Ed25519/RSA, HMAC, SHA-256, BLAKE3             |
| `encrypt/aws-kms`         | `@pointerbyte/denoforge/encrypt/aws-kms`         | cifrado/firma + ciclo de vida de claves con AWS KMS                            |
| `encrypt/azure-key-vault` | `@pointerbyte/denoforge/encrypt/azure-key-vault` | criptografía + ciclo de vida con Azure Key Vault                               |
| `encrypt/gcp-kms`         | `@pointerbyte/denoforge/encrypt/gcp-kms`         | criptografía + ciclo de vida con Google Cloud KMS                              |
| `logger`                  | `@pointerbyte/denoforge/logger`                  | logging JSON por niveles, sanitizador, middleware HTTP + gRPC                  |
| `security`                | `@pointerbyte/denoforge/security`                | JWT (HS256/RS256/PS256/EdDSA), auth por cookie, middleware HTTP + gRPC         |
| `tools`                   | `@pointerbyte/denoforge/tools`                   | jobs por intervalo/cron, bucle de workers acotado, flag de modo test           |
| `config`                  | `@pointerbyte/denoforge/config`                  | cliente REST `fetch`, servidor HTTP nativo `Deno.serve`, cliente/servidor gRPC |

## Requisitos

- [Deno](https://deno.com/) **2.x** (desarrollado con la 2.9).

## Instalación

DenoForge se puede consumir **localmente** desde otros proyectos Deno, con o sin publicación en un
registro.

### Opción A — import map con ruta local (recomendado para uso local)

En el `deno.json` de tu proyecto, apunta un alias a la carpeta de DenoForge:

```json
{
  "imports": {
    "@denoforge/": "../DenoForge/"
  }
}
```

Y luego importa por módulo:

```ts
import { newLocalProvider } from "@denoforge/encrypt/mod.ts";
import { createService } from "@denoforge/security/mod.ts";
```

### Opción B — import relativo directo

```ts
import { newLocalProvider } from "../DenoForge/encrypt/mod.ts";
```

### Opción C — como paquete JSR

El paquete está configurado para JSR (`name`/`exports` en `deno.json`). Una vez publicado puedes
hacer `deno add jsr:@pointerbyte/denoforge` e importar con los especificadores de la tabla anterior.

## Inicio rápido

```ts
import { encrypt, security } from "@pointerbyte/denoforge";

const enc = encrypt.newLocalProvider();
const key = await enc.generateSymmetricKeys({ size: encrypt.SizeSymmetricKey.Key256Bits });
const cipher = await enc.encryptAES({ secretKey: key.keyRef, value: "hola" });

const jwt = security.createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });
const token = await jwt.sign({ sub: "user-1" });
```

> El punto de entrada raíz usa espacios de nombres por módulo (`encrypt`, `logger`, `security`,
> `tools`, `config`) para que los nombres que se repiten entre módulos —`Service`, `Middleware`,
> `Handler`— nunca colisionen. Usa los especificadores por módulo cuando quieras un grafo de
> dependencias más pequeño.

## Uso

### `encrypt`

Proveedor criptográfico local sobre Web Crypto, organizado en repositorios enfocados: simétrico,
asimétrico, hashing, firmas y gestión de claves.

```ts
import {
  CurveAsymmetricKey,
  newLocalProvider,
  SizeAsymmetricKey,
  SizeSymmetricKey,
} from "@pointerbyte/denoforge/encrypt";

const enc = newLocalProvider();

// AES-GCM (128/256 bits), con AAD; el nonce se antepone al texto cifrado.
const sym = await enc.generateSymmetricKeys({ size: SizeSymmetricKey.Key256Bits });
const ct = await enc.encryptAES({ secretKey: sym.keyRef, value: "secreto", additional: "aad" });
const pt = await enc.decryptAES({ secretKey: sym.keyRef, cipherValue: ct, additional: "aad" });

// RSA-OAEP, cifrado híbrido ECDH, firmas Ed25519 / RSA-PSS / RSA-PKCS1v15.
const rsa = await enc.generateRSAKeys({ size: SizeAsymmetricKey.Key2048Bits });
const ec = await enc.generateECDHCurveKeys({ curve: CurveAsymmetricKey.CurveP256 });
const ed = await enc.generateEd25519Keys();

// Hashing: HMAC-SHA256, SHA-256 hex, BLAKE3.
await enc.sha256Hex("abc");
```

Las claves se intercambian como **DER en Base64** (SPKI para públicas, PKCS#8 para privadas; bytes
crudos para simétricas) mediante el modelo `KeyData`. Cada operación acepta un `signal`
(`AbortSignal`) opcional para cancelación.

#### Proveedores de Cloud KMS

Para claves que nunca salen de un HSM gestionado, los proveedores `aws-kms`, `azure-key-vault` y
`gcp-kms` implementan un `CloudKmsRepository` común (encrypt/decrypt, sign/verify y ciclo de vida:
get/rotate/deactivate). Cada uno carga su SDK de nube **de forma perezosa en el primer uso**, así
que no añaden nada a tu grafo hasta que los importas.

```ts
import { newAwsKmsProvider } from "@pointerbyte/denoforge/encrypt/aws-kms";

const kms = newAwsKmsProvider({ region: "us-east-1" }); // requiere @aws-sdk/client-kms + credenciales AWS
const ciphertext = await kms.encrypt({ keyId: "alias/app", plaintext: "secreto" });
const plaintext = await kms.decrypt({ keyId: "alias/app", ciphertext });
const signature = await kms.sign({ keyId: "alias/signing", message: "payload" });
const ok = await kms.verify({ keyId: "alias/signing", message: "payload", signature });
```

Los tres aceptan un `api` inyectado (la interfaz `KmsApi`) para poder probar la lógica del proveedor
sin acceso a la nube. Paquetes peer requeridos: `@aws-sdk/client-kms`, `@azure/keyvault-keys` (+
`@azure/identity`), `@google-cloud/kms`.

### `logger`

Logging estructurado (JSON) por niveles, con **sanitizador** de valores sensibles y middleware HTTP.

```ts
import { initLogger, LogLevel, newSanitizer } from "@pointerbyte/denoforge/logger";

const log = initLogger({
  level: LogLevel.Debug,
  sanitizer: newSanitizer(["password", "authorization"]),
  service: { name: "api", version: "1.0.0" },
});
log.info("user.login", { userId: 1, password: "x" }); // password -> [REDACTED]
```

La salida va a un `Sink` configurable (la consola por defecto); proporciona tu propio sink para
reenviar registros a un archivo, un colector o un exportador OpenTelemetry.

### `security`

Firma/verificación de JWT (`HS256`, `RS256`, `PS256`, `EdDSA` y una estrategia personalizada),
autenticación por cookie y middleware HTTP (`securityHeaders`, `jwtMiddleware`, `cookieMiddleware`).

```ts
import { createService, getClaims, jwtMiddleware } from "@pointerbyte/denoforge/security";

const jwt = createService({ algorithm: "HS256", hmacSecret: "s3cr3t" });
const token = await jwt.sign({ sub: "u1", role: "admin" });
const auth = jwtMiddleware(jwt); // responde 401 si falta un Bearer válido
```

### `tools`

**Jobs por intervalo/cron** en proceso y un **bucle de workers acotado**, más un flag compartido de
modo test que suprime el trabajo en segundo plano durante los tests.

```ts
import { addTask, job, runWorkers, startJobs } from "@pointerbyte/denoforge/tools";

runWorkers();
addTask(() => trabajoEnSegundoPlano());

const id = job(() => sondear(), 5000); // cada 5s
startJobs();
```

### `config`

Cliente REST basado en `fetch` y servidor HTTP nativo sobre `Deno.serve` con middleware, grupos de
rutas, endpoint `/health` y apagado controlado.

```ts
import { newClientHTTP, newHttpServer } from "@pointerbyte/denoforge/config";

const server = newHttpServer({ port: 8080 });
server.get("/api/ping", () => Response.json({ pong: true }));
server.group("/api/v1").get("/users", listarUsuarios);
server.listen();

const api = newClientHTTP({ baseUrl: "https://example.com", timeoutMs: 5000 });
const { data } = await api.get<{ id: number }>("/users/1");
```

El middleware comparte una única forma `(next) => (req) => Response` entre `logger`, `security` y
`config`, así que las piezas se componen libremente:

```ts
import { newHttpServer } from "@pointerbyte/denoforge/config";
import { httpLogger, initLogger } from "@pointerbyte/denoforge/logger";
import {
  createService,
  getClaims,
  jwtMiddleware,
  securityHeaders,
} from "@pointerbyte/denoforge/security";

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

`config` también incluye cliente y servidor gRPC sobre `@grpc/grpc-js`, con el mismo modelo de
interceptores componibles. Los interceptores de servidor (logging, auth JWT) envuelven los handlers
unarios; el cliente promisifica las llamadas unarias e inyecta metadata.

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

## Herramientas de línea de comandos (`cmd/`)

DenoForge incluye un conjunto de CLIs, ejecutables con `deno run` o con las tareas incluidas:

- **`qdeno`** — genera un nuevo servicio DenoForge (HTTP o gRPC) en un directorio.

  ```sh
  deno task qdeno new http my-api
  deno task qdeno new grpc my-svc --dir ./services/my-svc
  ```

- **`deno-openssl`** — generación de pares de claves, certificados autofirmados y manejo de PEM,
  sobre Web Crypto (los certificados usan `@peculiar/x509`, cargado de forma perezosa).

  ```sh
  deno task deno-openssl keypair --algorithm ed25519 --out id
  deno task deno-openssl cert --name "CN=localhost" --days 365 --out localhost
  deno task deno-openssl pem-info id.key.pem
  ```

- **`example`** — una demo ejecutable que levanta un servidor HTTP **y** uno gRPC con logging +
  seguridad JWT y apagado controlado.

  ```sh
  deno task example
  ```

## Pruebas

```sh
deno task test   # ejecuta la suite
deno task cov    # ejecuta con cobertura e imprime la tabla
```

La suite cubre los round-trips de criptografía, auth JWT/cookie, el sanitizador, jobs y workers, el
cliente/servidor HTTP, los interceptores gRPC y un round-trip gRPC, además de los proveedores KMS
mediante un `KmsApi` falso inyectado — **~87% de cobertura de líneas**. Los adaptadores de los SDK
de nube se ejercitan a través de esa interfaz inyectable, no contra servicios reales.

## Notas

- **BLAKE3** no tiene equivalente en Web Crypto, por lo que es la única primitiva delegada (vía
  `@noble/hashes`). Todo lo demás usa `crypto.subtle` de la plataforma.
- **La gestión de claves** (`rotateKey`, `getKey`, `deactivateKey`) depende del proveedor: el local
  lanza `UnsupportedOperationError`, mientras que `aws-kms`, `azure-key-vault` y `gcp-kms` la
  implementan contra su KMS en la nube.
- **La cancelación** se expresa con `AbortSignal` (el campo `signal` en las peticiones / el
  argumento `signal` en los helpers).

## Estructura del proyecto

```text
DenoForge/
├── deno.json              # import map, tareas, exports
├── mod.ts                 # barrel raíz con espacios de nombres
├── encrypt/               # criptografía (Web Crypto) + cloud KMS
│   ├── common/{enums,kms}.ts
│   ├── models/models.ts
│   ├── utilities/utilities.ts
│   ├── local/{interface,repository,mod}.ts
│   ├── aws-kms/{interface,repository,mod}.ts
│   ├── azure-key-vault/{interface,repository,mod}.ts
│   ├── gcp-kms/{interface,repository,mod}.ts
│   ├── errors.ts
│   └── mod.ts
├── logger/                # logging estructurado
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
├── config/                # bootstrap de transporte (HTTP + gRPC)
│   ├── client/http/{interface,models,client}.ts
│   ├── client/grpc/client.ts
│   ├── server/http/server.ts
│   ├── server/grpc/{server,interceptors}.ts
│   ├── proto/{methods.proto,loader.ts}
│   └── mod.ts
├── cmd/                   # herramientas de línea de comandos
│   ├── qdeno/               # generador de servicios
│   ├── deno-openssl/        # claves/certificados/PEM
│   └── example/           # demo ejecutable HTTP + gRPC
└── examples/              # demos enfocadas por módulo
```

## Desarrollo

```sh
deno task check          # verifica tipos de todo
deno task test           # ejecuta tests
deno task example:encrypt
deno task example:jwt
deno task example:logger
deno task example:server # sirve en :8080 (la tarea incluye --allow-net)
```

## Licencia

Apache-2.0. Ver [LICENSE](./LICENSE).

> El diseño y la organización de módulos de DenoForge están inspirados en el proyecto GoForge.
