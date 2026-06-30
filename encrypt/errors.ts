// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/** Base error type for the encrypt module (mirrors Go's wrapped error values). */
export class EncryptError extends Error {
  override name = "EncryptError";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/**
 * Thrown when an operation has no equivalent on the active provider, e.g. the
 * cloud-only key-management methods on the local provider.
 */
export class UnsupportedOperationError extends EncryptError {
  override name = "UnsupportedOperationError";
  constructor(operation: string) {
    super(`encrypt: operation not supported by this provider: ${operation}`);
  }
}
