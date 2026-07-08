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
  params: any,
) => Promise<ServiceResponse>;

interface RegisteredCommand {
  func: CommandFunction;
  metadata: CommandMetadata;
}

class Dispatcher {
  private registry: Map<string, RegisteredCommand> = new Map();
  private dataService: IDataService | null = null;

  private readonly PLAN_WEIGHTS: Record<string, number> = {
    free: 0,
    pro: 1,
    enterprise: 2,
  };

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

  public async logEvent(
    context: RequestContext,
    command: string,
    status: 'SUCCESS' | 'ERROR',
    details: Record<string, any> = {},
  ): Promise<void> {
    try {
      if (!this.dataService) return;

      // Convert UUID tenantId to numeric ID for the Infrastructure Engine
      const numericTenantId = (this.dataService as any).ensureClientId({
        tenantId: context.tenantId,
      });

      await this.dataService.execute('SYSTEM:log-event', {
        tenantId: numericTenantId,
        status: status,
        source: 'BACKEND',
        command: command,
        userId: context.userId ? 1 : undefined, // Infrastructure expects numeric userId if provided
        ...details,
      });
    } catch (e) {
      console.error(`Event logging failed for ${command}:`, e);
    }
  }

  public async execute(
    commandName: string,
    params: any,
    context: RequestContext,
  ): Promise<ServiceResponse> {
    if (!this.dataService) {
      return ServiceResponseHelper.error('System data service not initialized', 'SYSTEM_ERROR');
    }

    const command = this.registry.get(commandName);
    if (!command) {
      return ServiceResponseHelper.error(`Command ${commandName} not found`, 'CMD_NOT_FOUND');
    }

    const { func, metadata } = command;

    if (context.role !== 'superadmin') {
      const requiredWeight = this.PLAN_WEIGHTS[metadata.requiredPlan] ?? 0;
      const userWeight = this.PLAN_WEIGHTS[context.plan] ?? 0;

      if (userWeight < requiredWeight) {
        return ServiceResponseHelper.error(
          `This command requires a ${metadata.requiredPlan.toUpperCase()} plan.`,
          'PLAN_REQUIRED',
        );
      }
    }

    try {
      const result = await func(this.dataService, context, params);
      await this.logEvent(context, commandName, 'SUCCESS');
      return result;
    } catch (e: any) {
      console.error(`Execution error in ${commandName}:`, e);
      await this.logEvent(context, commandName, 'ERROR', { errorCode: e.message });
      return ServiceResponseHelper.error(e.message || 'Execution error', 'EXECUTION_ERROR');
    }
  }
}

export const dispatcher = new Dispatcher();
