// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * `encrypt/aws-kms` — AWS KMS-backed cryptography.
 *
 * Requires the `@aws-sdk/client-kms` package (loaded lazily on first use) and
 * AWS credentials resolvable by the SDK. Inject a fake {@link KmsApi} to
 * unit-test without AWS.
 *
 * @module
 */

export * from "./interface.ts";
export { AwsKmsProvider, createRealApi, newAwsKmsProvider } from "./repository.ts";
export type {
  KmsDecryptRequest,
  KmsEncryptRequest,
  KmsSignRequest,
  KmsVerifyRequest,
} from "../common/kms.ts";
