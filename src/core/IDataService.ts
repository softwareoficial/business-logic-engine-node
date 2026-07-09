export interface ServiceResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  code?: string;
}

export class ServiceResponseHelper {
  static success<T>(message: string, data?: T): ServiceResponse<T> {
    return {
      success: true,
      message,
      data,
    };
  }

  static error<T = unknown>(message: string, code?: string): ServiceResponse<T> {
    return {
      success: false,
      message,
      code,
    };
  }
}

export interface IDataService {
  /**
   * The primary method to interact with the Infrastructure Engine.
   * All business logic now delegates to this single point of execution.
   */
  execute<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<ServiceResponse<T>>;
  executeCustom<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<ServiceResponse<T>>;
  find<T = unknown>(
    path: string,
    filter: Record<string, unknown>,
    options?: { limit?: number; offset?: number },
    context?: { tenantId: string },
  ): Promise<ServiceResponse<T[]>>;
  push(path: string, item: unknown, context: { tenantId: string }): Promise<ServiceResponse>;
  write(path: string, value: unknown, context: { tenantId: string }): Promise<ServiceResponse>;
  read<T = unknown>(path?: string, context?: { tenantId: string }): Promise<ServiceResponse<T>>;
  ensureClientId(payload: Record<string, unknown>): number;
}
