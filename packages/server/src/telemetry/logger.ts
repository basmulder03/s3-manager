import { Writable } from 'node:stream';
import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import type { Config } from '../config';

type LogRecord = Record<string, unknown>;

const LEVEL_MAP: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const ANSI = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  magenta: '\u001b[35m',
};

const STANDARD_KEYS = new Set([
  'level',
  'time',
  'msg',
  'module',
  'pid',
  'hostname',
  'traceId',
  'spanId',
]);

let rootLogger: PinoLogger | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toLevel = (level: unknown): string => {
  if (typeof level === 'number') {
    return LEVEL_MAP[level] ?? 'INFO';
  }
  if (typeof level === 'string' && level.length > 0) {
    return level.toUpperCase();
  }
  return 'INFO';
};

const toTimestamp = (value: unknown): string => {
  const parsed = typeof value === 'number' || typeof value === 'string' ? new Date(value) : new Date();
  const iso = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  return iso.slice(0, 19).replace('T', ' ');
};

const truncateValue = (value: unknown, currentDepth: number, maxDepth: number): unknown => {
  if (currentDepth >= maxDepth && (Array.isArray(value) || isRecord(value))) {
    return '[Truncated]';
  }

  if (Array.isArray(value)) {
    const limitedItems = value.slice(0, 25).map((item) => truncateValue(item, currentDepth + 1, maxDepth));
    return value.length > 25 ? [...limitedItems, '[Truncated]'] : limitedItems;
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = truncateValue(item, currentDepth + 1, maxDepth);
    }
    return output;
  }

  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}...[Truncated]`;
  }

  return value;
};

const colorize = (value: string, color: string, enabled: boolean): string =>
  enabled ? `${color}${value}${ANSI.reset}` : value;

const levelColor = (level: string): string => {
  switch (level) {
    case 'TRACE':
      return ANSI.dim;
    case 'DEBUG':
      return ANSI.cyan;
    case 'INFO':
      return ANSI.green;
    case 'WARN':
      return ANSI.yellow;
    case 'ERROR':
      return ANSI.red;
    case 'FATAL':
      return ANSI.magenta;
    default:
      return ANSI.reset;
  }
};

const extractPayload = (record: LogRecord): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!STANDARD_KEYS.has(key)) {
      payload[key] = value;
    }
  }
  return payload;
};

const extractStack = (payload: Record<string, unknown>): string | null => {
  const errValue = payload.err;
  if (isRecord(errValue) && typeof errValue.stack === 'string' && errValue.stack.length > 0) {
    return errValue.stack;
  }

  const stackValue = payload.stack;
  if (typeof stackValue === 'string' && stackValue.length > 0) {
    return stackValue;
  }

  return null;
};

const withoutStack = (payload: Record<string, unknown>): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...payload };

  if (isRecord(copy.err)) {
    const errCopy: Record<string, unknown> = { ...copy.err };
    delete errCopy.stack;
    copy.err = errCopy;
  }

  delete copy.stack;
  return copy;
};

const formatHumanLine = (record: LogRecord, enableColor: boolean, maxDepth: number): string => {
  const moduleName = typeof record.module === 'string' && record.module.length > 0 ? record.module : 'App';
  const level = toLevel(record.level);
  const timestamp = toTimestamp(record.time);
  const message = typeof record.msg === 'string' && record.msg.length > 0 ? record.msg : '(no message)';

  const moduleText = colorize(`[${moduleName}]`, ANSI.blue, enableColor);
  const levelText = colorize(`[${level}]`, levelColor(level), enableColor);
  const timestampText = colorize(timestamp, ANSI.dim, enableColor);
  const header = `${moduleText} ${levelText} ${timestampText} ${message}`;

  const payload = truncateValue(extractPayload(record), 0, maxDepth);
  const hasPayload = isRecord(payload) && Object.keys(payload).length > 0;
  const stack = hasPayload ? extractStack(payload) : null;
  const payloadWithoutStack = hasPayload ? withoutStack(payload) : {};
  const hasPayloadWithoutStack = Object.keys(payloadWithoutStack).length > 0;

  if (!hasPayloadWithoutStack && !stack) {
    return header;
  }

  const payloadLines = hasPayloadWithoutStack
    ? `\n${JSON.stringify(payloadWithoutStack, null, 2)
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')}`
    : '';

  const stackLines =
    stack !== null
      ? `\n${stack
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}`
      : '';

  return `${header}${payloadLines}${stackLines}`;
};

class HumanReadableStream extends Writable {
  private readonly useColor: boolean;

  private readonly maxDepth: number;

  constructor(options: { useColor: boolean; maxDepth: number }) {
    super();
    this.useColor = options.useColor;
    this.maxDepth = options.maxDepth;
  }

  override _write(chunk: string | Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      const chunkText = chunk.toString().trim();
      if (chunkText.length === 0) {
        callback();
        return;
      }

      const lines = chunkText.split('\n');
      for (const line of lines) {
        if (line.trim().length === 0) {
          continue;
        }
        try {
          const parsed = JSON.parse(line) as LogRecord;
          process.stdout.write(`${formatHumanLine(parsed, this.useColor, this.maxDepth)}\n`);
        } catch {
          process.stdout.write(`${line}\n`);
        }
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

export const initRootLogger = (config: Config): PinoLogger => {
  if (rootLogger) {
    return rootLogger;
  }

  const isPretty = config.telemetry.logFormat === 'pretty';
  const loggerOptions: LoggerOptions = {
    level: config.telemetry.logLevel,
    base: undefined,
    redact: {
      paths: config.telemetry.redactPaths,
      censor: '[REDACTED]',
      remove: false,
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    mixin() {
      const activeSpan = trace.getActiveSpan();
      if (!activeSpan) {
        return {};
      }
      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    },
  };

  if (isPretty) {
    rootLogger = pino(
      loggerOptions,
      new HumanReadableStream({
        useColor: process.stdout.isTTY === true,
        maxDepth: 3,
      })
    );
    return rootLogger;
  }

  rootLogger = pino(loggerOptions);
  return rootLogger;
};

export const getLogger = (moduleName: string): PinoLogger => {
  if (!rootLogger) {
    rootLogger = pino({
      level: 'info',
      base: undefined,
    });
  }
  return rootLogger.child({ module: moduleName });
};

export const isLoggerInitialized = (): boolean => rootLogger !== null;
