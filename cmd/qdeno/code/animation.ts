// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A tiny terminal spinner used while scaffolding. Dependency-free; writes to a
 * provided sink so it can be silenced or captured.
 *
 * @module
 */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** A running spinner handle. */
export interface Spinner {
  stop: (finalLine?: string) => void;
}

/** Starts a spinner labelled `text`, ticking every `intervalMs`. */
export function startSpinner(
  text: string,
  write: (s: string) => void = (s) => Deno.stdout.writeSync(new TextEncoder().encode(s)),
  intervalMs = 80,
): Spinner {
  let i = 0;
  const timer = setInterval(() => {
    write(`\r${FRAMES[i = (i + 1) % FRAMES.length]} ${text}`);
  }, intervalMs);
  return {
    stop(finalLine) {
      clearInterval(timer);
      write(`\r${finalLine ?? `✓ ${text}`}\n`);
    },
  };
}
