export interface Logger {
  debug(category: string, message: string, context?: Readonly<Record<string, unknown>>): void;
  info(category: string, message: string, context?: Readonly<Record<string, unknown>>): void;
  warn(category: string, message: string, context?: Readonly<Record<string, unknown>>): void;
  error(category: string, message: string, context?: Readonly<Record<string, unknown>>): void;
}

export const logger: Logger = {
  debug: (category, message, context) => console.debug(`[${category}] ${message}`, context),
  info: (category, message, context) => console.info(`[${category}] ${message}`, context),
  warn: (category, message, context) => console.warn(`[${category}] ${message}`, context),
  error: (category, message, context) => console.error(`[${category}] ${message}`, context)
};

export function assertUnreachable(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
