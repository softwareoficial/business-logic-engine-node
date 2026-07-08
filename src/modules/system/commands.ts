import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';
import crypto from 'crypto';

export interface CommandDefinition {
    name: string;
    description: string;
    paramsModel?: Record<string, string>;
    func: (dataService: IDataService, context: RequestContext, params: any) => Promise<ServiceResponse>;
    metadata: {
        requiredPlan: string;
    };
}

class SystemCommandHandler {
    public commands: CommandDefinition[] = [
        {
            name: "system.audit.get_logs",
            description: "Retrieves the audit trail for a specific business application.",
            paramsModel: { limit: "int", offset: "int", command: "str" },
            metadata: { requiredPlan: "free" },
            func: async (dataService, context, params) => {
                try {
                    const { limit = 50, offset = 0, command } = params;
                    return await dataService.find('audit_logs', 
                        command ? { command } : {}, 
                        { limit, offset }, 
                        context
                    );
                } catch (e: any) {
                    return ServiceResponseHelper.error(`Error: ${e.message}`, "AUDIT_GET_ERROR");
                }
            }
        },
        {
            name: "system.users.create",
            description: "Creates a new employee user in the business database.",
            paramsModel: { username: "string", password: "string", role: "string" },
            metadata: { requiredPlan: "free" },
            func: async (dataService, context, params) => {
                try {
                    const { username, password, role = "employee" } = params;
                    return await dataService.executeCustom("CLIENT:user-create", {
                        username,
                        password,
                        role_id: 1,
                        clienteId: context.tenantId
                    });
                } catch (e: any) {
                    return ServiceResponseHelper.error(`Error creating user: ${e.message}`, "USER_CREATE_ERROR");
                }
            }
        },
        {
            name: "system.users.list",
            description: "Lists all employees and their assigned permissions.",
            paramsModel: {},
            metadata: { requiredPlan: "free" },
            func: async (dataService, context, params) => {
                try {
                    return await dataService.executeCustom("CLIENT:user-list", {
                        clienteId: context.tenantId
                    });
                } catch (e: any) {
                    return ServiceResponseHelper.error(`Error listing users: ${e.message}`, "USER_LIST_ERROR");
                }
            }
        }
    ];
}

export const systemCommands = new SystemCommandHandler();
