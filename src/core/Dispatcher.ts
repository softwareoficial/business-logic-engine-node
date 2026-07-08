import { RequestContext } from './RequestContext';
import { IDataService, ServiceResponse, ServiceResponseHelper } from './IDataService';

export interface CommandMetadata {
    name: string;
    description: string;
    paramsModel?: Record<string, string>;
    requiredPlan: string;
}

export type CommandFunction = (
    dataService: IDataService,
    context: RequestContext,
    params: any
) => Promise<ServiceResponse>;

interface RegisteredCommand {
    func: CommandFunction;
    metadata: CommandMetadata;
}

class Dispatcher {
    private registry: Map<string, RegisteredCommand> = new Map();
    private dataService: IDataService | null = null;

    public setDataService(dataService: IDataService): void {
        this.dataService = dataService;
    }

    public register(name: string, func: CommandFunction, metadata: CommandMetadata): void {
        this.registry.set(name, { func, metadata });
    }

    public registerHandler(handler: any): void {
        if (handler.commands && Array.isArray(handler.commands)) {
            for (const cmdDef of handler.commands) {
                this.register(cmdDef.name, cmdDef.func.bind(handler), cmdDef.metadata);
            }
        }
    }

    public async execute(
        commandName: string,
        params: any,
        context: RequestContext
    ): Promise<ServiceResponse> {
        if (!this.dataService) {
            return ServiceResponseHelper.error("System data service not initialized", "SYSTEM_ERROR");
        }

        const command = this.registry.get(commandName);
        if (!command) {
            return ServiceResponseHelper.error(`Command ${commandName} not found`, "CMD_NOT_FOUND");
        }

        const { func, metadata } = command;

        if (context.role !== 'superadmin') {
            if (metadata.requiredPlan === 'pro' && context.plan !== 'pro') {
                return ServiceResponseHelper.error("This command requires a PRO plan.", "PLAN_REQUIRED");
            }
        }

        try {
            const result = await func(this.dataService, context, params);
            await this.audit(context, commandName, params);
            return result;
        } catch (e: any) {
            console.error(`Execution error in ${commandName}:`, e);
            return ServiceResponseHelper.error(e.message || "Execution error", "EXECUTION_ERROR");
        }
    }

    private async audit(context: RequestContext, command: string, params: any): Promise<void> {
        try {
            if (!this.dataService) return;

            await this.dataService.execute("USER:write", {
                userId: "system",
                tenantId: context.tenantId,
                data: {
                    command: command,
                    params: params,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (e) {
            console.error(`Audit failed for ${command}:`, e);
        }
    }
}

export const dispatcher = new Dispatcher();
