// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared contract for cloud KMS providers (aws-kms, azure-key-vault, gcp-kms).
 *
 * Cloud providers extend the local {@link KeyRepository} (key lifecycle) with
 * provider-backed crypto operations. The key material never leaves the KMS, so
 * these methods address keys by id and exchange Base64-encoded ciphertext and
 * signatures.
 *
 * @module
 */

import type {
  BaseRequest,
  DeactivateKeyRequest,
  GetKeyRequest,
  KeyData,
  RotateKeyRequest,
} from "../models/models.ts";
import { bytesOf, fromBase64, runWithSignal, textOf, toBase64 } from "../utilities/utilities.ts";

export type { DeactivateKeyRequest, GetKeyRequest, KeyData, RotateKeyRequest };

/** Encrypt plaintext under a managed key. */
export interface KmsEncryptRequest extends BaseRequest {
  keyId: string;
  /** UTF-8 plaintext. */
  plaintext: string;
  /** Optional provider algorithm override. */
  algorithm?: string;
}

/** Decrypt Base64 ciphertext produced by {@link CloudKmsRepository.encrypt}. */
export interface KmsDecryptRequest extends BaseRequest {
  keyId: string;
  /** Base64 ciphertext. */
  ciphertext: string;
  algorithm?: string;
}

/** Sign a message with a managed key. */
export interface KmsSignRequest extends BaseRequest {
  keyId: string;
  /** UTF-8 message. */
  message: string;
  algorithm?: string;
}

/** Verify a Base64 signature with a managed key. */
export interface KmsVerifyRequest extends BaseRequest {
  keyId: string;
  message: string;
  /** Base64 signature. */
  signature: string;
  algorithm?: string;
}

/**
 * Provider-backed cryptography plus key lifecycle. Implemented by every cloud
 * KMS provider in this module.
 */
export interface CloudKmsRepository {
  /** Returns provider metadata and public material for a key id. */
  getKey(input: GetKeyRequest): Promise<KeyData>;
  /** Creates a new key version/material for a key id. */
  rotateKey(input: RotateKeyRequest): Promise<KeyData>;
  /** Disables a key (or key version) by id. */
  deactivateKey(input: DeactivateKeyRequest): Promise<void>;
  /** Encrypts plaintext; returns Base64 ciphertext. */
  encrypt(input: KmsEncryptRequest): Promise<string>;
  /** Decrypts Base64 ciphertext; returns UTF-8 plaintext. */
  decrypt(input: KmsDecryptRequest): Promise<string>;
  /** Signs a message; returns a Base64 signature. */
  sign(input: KmsSignRequest): Promise<string>;
  /** Verifies a Base64 signature. */
  verify(input: KmsVerifyRequest): Promise<boolean>;
}

/** Normalized key metadata returned by a provider adapter. */
export interface KmsKeyDescription {
  keyId: string;
  /** Provider reference (ARN, key identifier URL, resource name). */
  keyRef?: string;
  /** Base64 SPKI public key for asymmetric keys, when available. */
  publicKey?: string;
}

/**
 * The thin, byte-oriented seam each provider implements over its cloud SDK.
 * The provider repository maps requests/responses to/from this interface, which
 * makes the repository logic unit-testable with a fake.
 */
export interface KmsApi {
  encrypt(keyId: string, plaintext: Uint8Array): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array, keyId?: string): Promise<Uint8Array>;
  sign(keyId: string, message: Uint8Array, algorithm: string): Promise<Uint8Array>;
  verify(
    keyId: string,
    message: Uint8Array,
    signature: Uint8Array,
    algorithm: string,
  ): Promise<boolean>;
  describeKey(keyId: string): Promise<KmsKeyDescription>;
  disableKey(keyId: string): Promise<void>;
  rotateKey(keyId: string): Promise<void>;
}

/**
 * Shared {@link CloudKmsRepository} logic. Concrete providers supply their
 * provider name, a default signing algorithm and a lazy {@link KmsApi} resolver.
 */
export abstract class KmsRepositoryBase implements CloudKmsRepository {
  #api?: KmsApi;

  protected constructor(
    private readonly provider: string,
    private readonly defaultSigningAlgorithm: string,
    injected?: KmsApi,
  ) {
    this.#api = injected;
  }

  /** Lazily builds the provider's real {@link KmsApi} adapter. */
  protected abstract createApi(): Promise<KmsApi>;

  async #resolveApi(): Promise<KmsApi> {
    if (!this.#api) this.#api = await this.createApi();
    return this.#api;
  }

  #toKeyData(desc: KmsKeyDescription): KeyData {
    return {
      publicKey: desc.publicKey ?? "",
      keyId: desc.keyId,
      keyRef: desc.keyRef ?? desc.keyId,
      provider: this.provider,
    };
  }

  getKey(input: GetKeyRequest): Promise<KeyData> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      return this.#toKeyData(await api.describeKey(input.keyId));
    });
  }

  rotateKey(input: RotateKeyRequest): Promise<KeyData> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      await api.rotateKey(input.keyId);
      return this.#toKeyData(await api.describeKey(input.keyId));
    });
  }

  deactivateKey(input: DeactivateKeyRequest): Promise<void> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      await api.disableKey(input.keyId);
    });
  }

  encrypt(input: KmsEncryptRequest): Promise<string> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      return toBase64(await api.encrypt(input.keyId, bytesOf(input.plaintext)));
    });
  }

  decrypt(input: KmsDecryptRequest): Promise<string> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      return textOf(await api.decrypt(fromBase64(input.ciphertext), input.keyId));
    });
  }

  sign(input: KmsSignRequest): Promise<string> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      const algorithm = input.algorithm ?? this.defaultSigningAlgorithm;
      return toBase64(await api.sign(input.keyId, bytesOf(input.message), algorithm));
    });
  }

  verify(input: KmsVerifyRequest): Promise<boolean> {
    return runWithSignal(input.signal, async () => {
      const api = await this.#resolveApi();
      const algorithm = input.algorithm ?? this.defaultSigningAlgorithm;
      return api.verify(
        input.keyId,
        bytesOf(input.message),
        fromBase64(input.signature),
        algorithm,
      );
    });
  }
}
