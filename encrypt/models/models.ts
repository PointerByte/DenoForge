// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Request/response models for the encrypt module.
 *
 * Each model is a TypeScript interface with camelCased field names. The
 * cancellation context that every repository method takes is represented as an
 * optional {@link AbortSignal} on each request (`signal`) so callers can cancel
 * long-running operations.
 */

import type { CurveAsymmetricKey, SizeAsymmetricKey, SizeSymmetricKey } from "../common/enums.ts";

/** Common fields shared by every request: a trace UID and a cancellation signal. */
export interface BaseRequest {
  /** Operator-supplied correlation id. Optional. */
  uid?: string;
  /** Cancellation signal for the operation. */
  signal?: AbortSignal;
}

/** Provider metadata and encoded key material returned by key operations. */
export interface KeyData {
  /** Base64-encoded SPKI public key, when applicable. */
  publicKey: string;
  /** Provider-assigned key id. */
  keyId: string;
  /**
   * Encoded reference to the key material. For the local provider this holds the
   * Base64-encoded PKCS#8 private key (or the raw symmetric key).
   */
  keyRef: string;
  /** Provider name, e.g. `"local"`. */
  provider: string;
}

export interface RotateKeyRequest extends BaseRequest {
  keyId: string;
}

export interface GetKeyRequest extends BaseRequest {
  keyId: string;
}

export interface DeactivateKeyRequest extends BaseRequest {
  keyId: string;
}

export interface GenerateSymmetricKeyRequest extends BaseRequest {
  size: SizeSymmetricKey;
}

export interface EncryptAESRequest extends BaseRequest {
  /** Base64-encoded AES key. */
  secretKey: string;
  /** Plaintext to encrypt. */
  value: string;
  /** Optional additional authenticated data (AAD). */
  additional?: string;
}

export interface DecryptAESRequest extends BaseRequest {
  /** Base64-encoded AES key. */
  secretKey: string;
  /** Base64 ciphertext produced by `encryptAES`. */
  cipherValue: string;
  /** Optional additional authenticated data (AAD); must match encryption. */
  additional?: string;
}

export interface GenerateRSAKeyRequest extends BaseRequest {
  size: SizeAsymmetricKey;
}

export interface GenerateECDHCurveKeyRequest extends BaseRequest {
  curve: CurveAsymmetricKey;
}

export interface RSAOAEPEncodeRequest extends BaseRequest {
  /** Base64-encoded SPKI RSA public key. */
  publicKey: string;
  text: string;
}

export interface RSAOAEPDecodeRequest extends BaseRequest {
  /** Base64-encoded PKCS#8 RSA private key. */
  privateKey: string;
  cipherText: string;
}

export interface ECDHEncodeRequest extends BaseRequest {
  /** Base64-encoded SPKI ECC public key. */
  publicKey: string;
  text: string;
}

export interface ECDHDecodeRequest extends BaseRequest {
  /** Base64-encoded PKCS#8 ECC private key. */
  privateKey: string;
  cipherText: string;
}
