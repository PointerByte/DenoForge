// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Structured logger and its public builder API.
 *
 * Leveled, structured, sanitizable JSON logging that writes to a pluggable
 * {@link Sink} (the console by default). Forwarding to a file, a collector or
 * an OpenTelemetry exporter is done by passing a custom sink.
 *
 * @module
 */

import { LogLevel } from "../common/enums.ts";
import {
  type Formatter,
  formatterFor,
  jsonFormatter,
  LogFormat,
  type LogRecord,
} from "../formatter/format.ts";
import { Sanitizer } from "../sanitizer/sanitizer.ts";

/** Destination for a formatted log line. */
export type Sink = (line: string) => void;

/** Options accepted by {@link initLogger} / {@link Logger}. */
export interface LoggerOptions {
  /** Minimum level to emit. Defaults to {@link LogLevel.Info}. */
  level?: LogLevel;
  /** Output format. Defaults to JSON. */
  format?: LogFormat;
  /** Optional sanitizer used to redact sensitive attributes. */
  sanitizer?: Sanitizer;
  /** Where formatted lines go. Defaults to `console.log`. */
  sink?: Sink;
  /** Service metadata mixed into every record (like the OTel resource). */
  service?: { name?: string; version?: string };
  /** Attributes attached to every record produced by this logger. */
  base?: Record<string, unknown>;
}

let testMode = false;

/** Enables logger test mode; suppresses all output (mirrors `EnableModeTest`). */
export function enableModeTest(): void {
  testMode = true;
}

/** Disables logger test mode (mirrors `DisableModeTest`). */
export function disableModeTest(): void {
  testMode = false;
}

/** Leveled, structured logger. Create one with {@link initLogger}. */
export class Logger {
  #level: LogLevel;
  #formatter: Formatter;
  #sanitizer?: Sanitizer;
  #sink: Sink;
  #base: Record<string, unknown>;

  constructor(options: LoggerOptions = {}) {
    this.#level = options.level ?? LogLevel.Info;
    this.#formatter = options.format ? formatterFor(options.format) : jsonFormatter;
    this.#sanitizer = options.sanitizer;
    this.#sink = options.sink ?? ((line) => console.log(line));
    this.#base = {
      ...(options.service?.name ? { service: options.service.name } : {}),
      ...(options.service?.version ? { version: options.service.version } : {}),
      ...(options.base ?? {}),
    };
  }

  /** Returns a child logger with additional always-on attributes. */
  with(attrs: Record<string, unknown>): Logger {
    const child = new Logger();
    child.#level = this.#level;
    child.#formatter = this.#formatter;
    child.#sanitizer = this.#sanitizer;
    child.#sink = this.#sink;
    child.#base = { ...this.#base, ...attrs };
    return child;
  }

  debug(message: string, attrs: Record<string, unknown> = {}): void {
    this.#log(LogLevel.Debug, message, attrs);
  }
  info(message: string, attrs: Record<string, unknown> = {}): void {
    this.#log(LogLevel.Info, message, attrs);
  }
  warn(message: string, attrs: Record<string, unknown> = {}): void {
    this.#log(LogLevel.Warn, message, attrs);
  }
  error(message: string, attrs: Record<string, unknown> = {}): void {
    this.#log(LogLevel.Error, message, attrs);
  }

  /** True when a record at `level` would be emitted (mirrors `Enabled`). */
  enabled(level: LogLevel): boolean {
    return !testMode && level >= this.#level;
  }

  #log(level: LogLevel, message: string, attrs: Record<string, unknown>): void {
    if (!this.enabled(level)) return;
    let merged: Record<string, unknown> = { ...this.#base, ...attrs };
    if (this.#sanitizer) merged = this.#sanitizer.details(merged);
    const record: LogRecord = { time: new Date(), level, message, attrs: merged };
    this.#sink(this.#formatter(record));
  }
}

/**
 * Builds and returns a configured {@link Logger} (the Deno analogue of
 * `InitLogger`). Unlike Go it does not return a shutdown handle because there is
 * no OTLP provider to flush; if you supply a buffering sink, flush it yourself.
 */
export function initLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

export { LogFormat, LogLevel };
