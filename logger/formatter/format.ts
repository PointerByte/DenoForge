// Copyright 2026 PointerByte Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Log record formatting.
 *
 * A {@link LogRecord} is rendered by one of the {@link Formatter} functions;
 * JSON is the default, with a text formatter also available.
 *
 * @module
 */

import { levelName, type LogLevel } from "../common/enums.ts";

/** A structured log entry ready to be formatted. */
export interface LogRecord {
  time: Date;
  level: LogLevel;
  message: string;
  attrs: Record<string, unknown>;
}

/** A function that renders a {@link LogRecord} into a single line. */
export type Formatter = (record: LogRecord) => string;

/** Supported output formats. */
export const LogFormat = {
  JSON: "json",
  Text: "text",
} as const;
export type LogFormat = (typeof LogFormat)[keyof typeof LogFormat];

/** Renders a record as a compact JSON object. */
export const jsonFormatter: Formatter = (record) =>
  JSON.stringify({
    time: record.time.toISOString(),
    level: levelName(record.level),
    msg: record.message,
    ...record.attrs,
  });

/** Renders a record as `time level msg key=value ...`. */
export const textFormatter: Formatter = (record) => {
  const head = `${record.time.toISOString()} ${levelName(record.level)} ${record.message}`;
  const pairs = Object.entries(record.attrs)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return pairs ? `${head} ${pairs}` : head;
};

/** Resolves a {@link Formatter} for the given format name. */
export function formatterFor(format: LogFormat): Formatter {
  return format === LogFormat.Text ? textFormatter : jsonFormatter;
}
