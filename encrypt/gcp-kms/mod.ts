// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * `encrypt/gcp-kms` — Google Cloud KMS-backed cryptography.
 *
 * Requires `@google-cloud/kms` (loaded lazily) and application-default
 * credentials resolvable by the SDK. Inject a fake {@link KmsApi} to unit-test
 * without GCP.
 *
 * @module
 */

export * from "./interface.ts";
export { createRealApi, GcpKmsProvider, newGcpKmsProvider } from "./repository.ts";
export type {
  KmsDecryptRequest,
  KmsEncryptRequest,
  KmsSignRequest,
  KmsVerifyRequest,
} from "../common/kms.ts";
