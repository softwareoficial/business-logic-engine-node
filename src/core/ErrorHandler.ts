import { ErrorSource, logger } from './Logger';

export class AppError extends Error {
  public readonly source: ErrorSource;
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    source: ErrorSource,
    code: string,
    statusCode: number = 400,
    details?: unknown,
  ) {
    super(message);
    this.source = source;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export interface FormattedErrorResponse {
  success: boolean;
  message: string;
  error: {
    source: ErrorSource;
    code: string;
    details: unknown;
  };
  learning_center?: unknown;
}

interface AxiosLikeError extends Record<string, unknown> {
  response?: {
    data?: {
      error?: {
        message?: string;
        code?: string;
      };
    };
    status?: number;
  };
  code?: string;
  message?: string;
}

export class ErrorHandler {
  /**
   * Normalizes any error into an AppError to be handled by the global middleware.
   */
  public static handle(error: unknown): AppError {
    // 1. If it's already an AppError, just return it
    if (error instanceof AppError) return error;

    // Ensure error is an object for subsequent checks
    if (!error || typeof error !== 'object') {
      return new AppError(
        (error as Error)?.message || 'An unexpected internal error occurred',
        ErrorSource.BACKEND_LOGIC,
        'INTERNAL_SERVER_ERROR',
        500,
      );
    }

    const err = error as Record<string, unknown>;

    // 2. Handle Infrastructure ServiceResponse errors (success: false)
    if (err.success === false && 'code' in err) {
      return new AppError(
        (err.message as string) || 'Infrastructure Error',
        ErrorSource.INFRASTRUCTURE,
        (err.code as string) || 'INFRA_ERROR',
        400,
      );
    }

    // 3. Handle Axios/Network Errors
    const axiosError = err as AxiosLikeError; // Cast to avoid excessive boilerplate
    if (axiosError.response?.data || (axiosError.code && axiosError.message?.includes('API'))) {
      return new AppError(
        axiosError.response?.data?.error?.message || axiosError.message || 'Infrastructure Error',
        ErrorSource.INFRASTRUCTURE,
        axiosError.response?.data?.error?.code || 'INFRA_ERROR',
        axiosError.response?.status || 502,
      );
    }

    // 4. Handle Zod Validation Errors
    if (err.name === 'ZodError') {
      return new AppError(
        'Invalid request parameters',
        ErrorSource.VALIDATION,
        'VALIDATION_ERROR',
        400,
        (err as Record<string, unknown>).issues,
      );
    }

    // 5. Generic Backend Errors
    return new AppError(
      (err.message as string) || 'An unexpected internal error occurred',
      ErrorSource.BACKEND_LOGIC,
      'INTERNAL_SERVER_ERROR',
      500,
    );
  }

  /**
   * Logs the error to the Event Bus (Logger) and returns a formatted response for the frontend.
   */
  public static formatResponse(error: AppError): FormattedErrorResponse {
    // Log to our internal event bus
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
