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
  user_message: string;
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

    // Determine a user-friendly message based on the error code
    const userMessages: Record<string, string> = {
      VALIDATION_ERROR:
        'Los datos ingresados no son válidos. Por favor, revisa los campos marcados en rojo.',
      UNAUTHORIZED: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
      FORBIDDEN:
        'No tienes permisos suficientes para realizar esta acción. Contacta con tu administrador.',
      INTERNAL_SERVER_ERROR:
        'Ha ocurrido un error interno en nuestro servidor. Estamos trabajando para solucionarlo.',
      INFRA_ERROR:
        'Error de comunicación con la base de datos. Por favor, intenta de nuevo en unos instantes.',
      USERNAME_TAKEN: 'Este nombre de usuario ya está registrado. Prueba con uno diferente.',
      AUTH_FAILED: 'El usuario o la contraseña son incorrectos.',
      MISSING_PARAMS:
        'Faltan datos obligatorios para procesar la solicitud. Por favor, completa todos los campos.',
      PLAN_REQUIRED:
        'Esta funcionalidad no está incluida en tu plan actual. Actualiza tu plan para acceder.',
      RATE_LIMIT_EXCEEDED:
        'Has superado el límite de peticiones permitidas. Por favor, espera un momento.',
      TOO_MANY_REQUESTS:
        'Demasiadas solicitudes en un corto periodo de tiempo. Por favor, reduce la frecuencia de tus peticiones.',
      MISSING_CLIENT_CONTEXT:
        'No se ha detectado un contexto de empresa válido. Asegúrate de estar autenticado y vinculado a una empresa antes de crear empleados.',
    };

    const user_message =
      userMessages[error.code] ||
      'An unexpected error occurred. Please contact support if this persists.';

    // Return a clean, descriptive response for the frontend
    return {
      success: false,
      message: error.message,
      user_message: user_message,
      error: {
        source: error.source,
        code: error.code,
        details: error.details,
      },
    };
  }
}
