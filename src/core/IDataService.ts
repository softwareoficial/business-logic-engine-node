export interface ServiceResponse<T = any> {
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

    static error(message: string, code?: string): ServiceResponse {
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
    execute(command: string, payload: Record<string, any>): Promise<ServiceResponse>;
    executeCustom(command: string, payload: Record<string, any>): Promise<ServiceResponse>;
    find(path: string, filter: Record<string, any>, options?: { limit?: number, offset?: number }, context?: { tenantId: string }): Promise<ServiceResponse>;
    push(path: string, item: any, context: { tenantId: string }): Promise<ServiceResponse>;
    write(path: string, value: any, context: { tenantId: string }): Promise<ServiceResponse>;
    read(path?: string, context?: { tenantId: string }): Promise<ServiceResponse>;
}
