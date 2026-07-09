import { EventEmitter } from 'events';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
  DEBUG = 'DEBUG',
}

export enum ErrorSource {
  INFRASTRUCTURE = 'INFRASTRUCTURE', // API Base de Datos / Infra
  BACKEND_LOGIC = 'BACKEND_LOGIC', // Errores de código en Node.js
  VALIDATION = 'VALIDATION', // Zod / Parámetros incorrectos
  BUSINESS_RULE = 'BUSINESS_RULE', // Errores de lógica de negocio (ej. stock insuficiente)
  UNKNOWN = 'UNKNOWN',
}

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  source: ErrorSource;
  message: string;
  context?: unknown;
  requestId?: string;
}

class Logger extends EventEmitter {
  constructor() {
    super();
    // Default listener for console output
    this.on('log', (event: LogEvent) => {
      const color = this.getColor(event.level);
      console.log(
        `${color}[${event.timestamp}] [${event.level}] [${event.source}] ${event.message}`,
        '\x1b[0m',
      );
      if (event.context) {
        console.dir(event.context, { depth: null, colors: true });
      }
    });
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.INFO:
        return '\x1b[32m'; // Green
      case LogLevel.WARN:
        return '\x1b[33m'; // Yellow
      case LogLevel.ERROR:
        return '\x1b[31m'; // Red
      case LogLevel.CRITICAL:
        return '\x1b[41m\x1b[37m'; // White on Red
      case LogLevel.DEBUG:
        return '\x1b[36m'; // Cyan
      default:
        return '\x1b[0m';
    }
  }

  public info(message: string, context?: unknown) {
    this.emit('log', this.createEvent(LogLevel.INFO, ErrorSource.BACKEND_LOGIC, message, context));
  }

  public warn(message: string, context?: unknown) {
    this.emit('log', this.createEvent(LogLevel.WARN, ErrorSource.BACKEND_LOGIC, message, context));
  }

  public error(message: string, source: ErrorSource, context?: unknown) {
    this.emit('log', this.createEvent(LogLevel.ERROR, source, message, context));
  }

  public critical(message: string, source: ErrorSource, context?: unknown) {
    this.emit('log', this.createEvent(LogLevel.CRITICAL, source, message, context));
  }

  public debug(message: string, context?: unknown) {
    this.emit('log', this.createEvent(LogLevel.DEBUG, ErrorSource.BACKEND_LOGIC, message, context));
  }

  private createEvent(
    level: LogLevel,
    source: ErrorSource,
    message: string,
    context?: unknown,
  ): LogEvent {
    return {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      context,
    };
  }
}

export const logger = new Logger();
