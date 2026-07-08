import { ErrorSource, logger, LogLevel } from './Logger';
import { ServiceResponse } from './IDataService';

export class AppError extends Error {
  public readonly source: ErrorSource;
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(
    message: string,
    source: ErrorSource,
    code: string,
    statusCode: number = 400,
    details?: any,
  ) {
    super(message);
    this.source = source;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ErrorHandler {
  /**
   * Normalizes any error into an AppError to be handled by the global middleware.
   */
  public static handle(error: any): AppError {
    // 1. If it's already an AppError, just return it
    if (error instanceof AppError) return error;

    // 2. Handle Infrastructure ServiceResponse errors (success: false)
    if (error && typeof error === 'object' && error.success === false && 'code' in error) {
      return new AppError(
        error.message || 'Infrastructure Error',
        ErrorSource.INFRASTRUCTURE,
        error.code || 'INFRA_ERROR',
        400,
      );
    }

    // 3. Handle Axios/Network Errors
    if (error.response?.data || (error.code && error.message?.includes('API'))) {
      return new AppError(
        error.response?.data?.error?.message || error.message || 'Infrastructure Error',
        ErrorSource.INFRASTRUCTURE,
        error.response?.data?.error?.code || 'INFRA_ERROR',
        error.response?.status || 502,
      );
    }

    // 4. Handle Zod Validation Errors
    if (error.name === 'ZodError') {
      return new AppError(
        'Invalid request parameters',
        ErrorSource.VALIDATION,
        'VALIDATION_ERROR',
        400,
        error.issues,
      );
    }

    // 5. Generic Backend Errors
    return new AppError(
      error.message || 'An unexpected internal error occurred',
      ErrorSource.BACKEND_LOGIC,
      'INTERNAL_SERVER_ERROR',
      500,
    );
  }

  /**
   * Logs the error to the Event Bus (Logger) and returns a formatted response for the frontend.
   */
  public static formatResponse(error: AppError) {
    // Log to our internal event bus
    const logLevel = error.statusCode >= 500 ? LogLevel.CRITICAL : LogLevel.ERROR;
    logger.error(error.message, error.source, {
      code: error.code,
      details: error.details,
      status: error.statusCode,
    });

    // Return a clean, descriptive response for the frontend
    return {
      success: false,
      message: error.message,
      error: {
        source: error.source,
        code: error.code,
        details: error.details,
      },
    };
  }
}
