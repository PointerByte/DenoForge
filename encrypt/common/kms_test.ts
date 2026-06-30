// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

import { assert, assertEquals, assertRejects } from "@std/assert";
import type { KmsApi, KmsKeyDescription } from "./kms.ts";
import { newAwsKmsProvider } from "../aws-kms/mod.ts";
import { newAzureKeyVaultProvider } from "../azure-key-vault/mod.ts";
import { createRealApi as azureRealApi } from "../azure-key-vault/repository.ts";
import { newGcpKmsProvider } from "../gcp-kms/mod.ts";

/** A fake KMS adapter that records the algorithm and echoes bytes. */
function fakeApi(overrides: Partial<KmsApi> = {}): { api: KmsApi; calls: string[] } {
  const calls: string[] = [];
  const api: KmsApi = {
    encrypt: (keyId, plaintext) => {
      calls.push(`encrypt:${keyId}`);
      return Promise.resolve(Uint8Array.from([0xff, ...plaintext]));
    },
    decrypt: (ciphertext) => {
      calls.push("decrypt");
      return Promise.resolve(ciphertext.subarray(1));
    },
    sign: (keyId, _message, algorithm) => {
      calls.push(`sign:${algorithm}`);
      return Promise.resolve(Uint8Array.from([1, 2, 3]));
    },
    verify: (_keyId, _message, _signature, algorithm) => {
      calls.push(`verify:${algorithm}`);
      return Promise.resolve(true);
    },
    describeKey: (keyId): Promise<KmsKeyDescription> => {
      calls.push(`describe:${keyId}`);
      return Promise.resolve({ keyId, keyRef: `ref/${keyId}`, publicKey: "PUB" });
    },
    disableKey: (keyId) => {
      calls.push(`disable:${keyId}`);
      return Promise.resolve();
    },
    rotateKey: (keyId) => {
      calls.push(`rotate:${keyId}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { api, calls };
}

Deno.test("KMS base maps getKey to KeyData with provider", async () => {
  const { api } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  const key = await provider.getKey({ keyId: "k1" });
  assertEquals(key, { publicKey: "PUB", keyId: "k1", keyRef: "ref/k1", provider: "aws-kms" });
});

Deno.test("KMS rotateKey rotates then describes", async () => {
  const { api, calls } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  const key = await provider.rotateKey({ keyId: "k1" });
  assertEquals(key.provider, "aws-kms");
  assertEquals(calls, ["rotate:k1", "describe:k1"]);
});

Deno.test("KMS encrypt/decrypt round-trips through the adapter", async () => {
  const { api } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  const ct = await provider.encrypt({ keyId: "k1", plaintext: "hello" });
  assertEquals(await provider.decrypt({ keyId: "k1", ciphertext: ct }), "hello");
});

Deno.test("KMS sign/verify use the default signing algorithm", async () => {
  const { api, calls } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  await provider.sign({ keyId: "k1", message: "m" });
  assert(await provider.verify({ keyId: "k1", message: "m", signature: "AQID" }));
  assert(calls.includes("sign:RSASSA_PSS_SHA_256"));
  assert(calls.includes("verify:RSASSA_PSS_SHA_256"));
});

Deno.test("KMS sign honours an explicit algorithm override", async () => {
  const { api, calls } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  await provider.sign({ keyId: "k1", message: "m", algorithm: "ECDSA_SHA_256" });
  assert(calls.includes("sign:ECDSA_SHA_256"));
});

Deno.test("KMS deactivateKey disables the key", async () => {
  const { api, calls } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  await provider.deactivateKey({ keyId: "k1" });
  assertEquals(calls, ["disable:k1"]);
});

Deno.test("KMS respects an aborted signal", async () => {
  const { api } = fakeApi();
  const provider = newAwsKmsProvider({ api });
  const c = new AbortController();
  c.abort();
  await assertRejects(() => provider.getKey({ keyId: "k1", signal: c.signal }));
});

Deno.test("Azure provider uses its default signing algorithm (PS256)", async () => {
  const { api, calls } = fakeApi();
  const provider = newAzureKeyVaultProvider({ api });
  await provider.sign({ keyId: "k1", message: "m" });
  assert(calls.includes("sign:PS256"));
});

Deno.test("GCP provider uses its default signing algorithm", async () => {
  const { api, calls } = fakeApi();
  const provider = newGcpKmsProvider({ api });
  await provider.sign({ keyId: "k1", message: "m" });
  assert(calls.includes("sign:RSA_SIGN_PSS_2048_SHA256"));
});

Deno.test("Azure real adapter requires vaultUrl and credential", async () => {
  await assertRejects(() => azureRealApi({}), Error, "vaultUrl is required");
  await assertRejects(
    () => azureRealApi({ vaultUrl: "https://v.vault.azure.net" }),
    Error,
    "credential is required",
  );
});
