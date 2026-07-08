import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';
import crypto from 'crypto';

export interface CommandDefinition {
  name: string;
  description: string;
  paramsModel?: Record<string, string>;
  func: (
    dataService: IDataService,
    context: RequestContext,
    params: any,
  ) => Promise<ServiceResponse>;
  metadata: {
    requiredPlan: string;
  };
}

class SystemCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'system.client.register',
      description: 'Registers a new business client in the infrastructure.',
      paramsModel: { client_name: 'string', owner_email: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { client_name, owner_email } = params;
          return await dataService.executeCustom('APP:client-create', {
            client_name,
            owner_email,
            tenant_id: context.tenantId,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error registering client: ${e.message}`,
            'CLIENT_REG_ERROR',
          );
        }
      },
    },
    {
      name: 'system.client.update_plan',
      description: 'Updates the subscription plan for the current client.',
      paramsModel: { plan: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { plan } = params;
          const allowedPlans = ['free', 'pro', 'enterprise'];
          if (!allowedPlans.includes(plan)) {
            return ServiceResponseHelper.error(
              "Invalid plan. Must be 'free', 'pro', or 'enterprise'.",
              'INVALID_PLAN',
            );
          }

          return await dataService.executeCustom('APP:update-client-plan', {
            clienteId: context.tenantId,
            plan: plan,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error updating plan: ${e.message}`,
            'PLAN_UPDATE_ERROR',
          );
        }
      },
    },
    {
      name: 'system.events.list',
      description: 'Retrieves a list of system events with filtering.',
      paramsModel: { source: 'string', status: 'string', limit: 'int', offset: 'int' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          return await dataService.executeCustom('SYSTEM:events-list', {
            tenant_id: context.tenantId,
            ...params,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error listing events: ${e.message}`,
            'EVENT_LIST_ERROR',
          );
        }
      },
    },
    {
      name: 'system.events.stats',
      description: 'Gets aggregated statistics of system events.',
      paramsModel: { time_period: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          return await dataService.executeCustom('SYSTEM:events-stats', {
            tenant_id: context.tenantId,
            ...params,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error getting stats: ${e.message}`,
            'EVENT_STATS_ERROR',
          );
        }
      },
    },
    {
      name: 'system.events.top_errors',
      description: 'Gets the most frequent errors for the client.',
      paramsModel: { limit: 'int' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          return await dataService.executeCustom('SYSTEM:events-top-errors', {
            tenant_id: context.tenantId,
            ...params,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error getting top errors: ${e.message}`,
            'EVENT_TOP_ERRORS_ERROR',
          );
        }
      },
    },
    {
      name: 'system.events.clear',
      description: 'Clears old system events from the database.',
      paramsModel: { days_to_keep: 'int' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          return await dataService.executeCustom('SYSTEM:events-clear', {
            tenant_id: context.tenantId,
            days_to_keep: params.days_to_keep || 30,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error clearing events: ${e.message}`,
            'EVENT_CLEAR_ERROR',
          );
        }
      },
    },
    {
      name: 'system.audit.get_logs',
      description: 'Retrieves the audit trail for a specific business application.',
      paramsModel: { limit: 'int', offset: 'int', command: 'str' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { limit = 50, offset = 0, command } = params;
          return await dataService.find(
            'audit_logs',
            command ? { command } : {},
            { limit, offset },
            context,
          );
        } catch (e: any) {
          return ServiceResponseHelper.error(`Error: ${e.message}`, 'AUDIT_GET_ERROR');
        }
      },
    },
    {
      name: 'system.users.create',
      description: 'Creates a new employee user in the business database.',
      paramsModel: { username: 'string', password: 'string', role: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { username, password, role = 'employee' } = params;
          return await dataService.executeCustom('CLIENT:user-create', {
            username,
            password,
            role_id: 1,
            clienteId: context.tenantId,
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error creating user: ${e.message}`,
            'USER_CREATE_ERROR',
          );
        }
      },
    },
    {
      name: 'system.users.list',
      description: 'Lists all employees and their assigned permissions.',
      paramsModel: {},
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          return await dataService.executeCustom('CLIENT:user-list', {
            clienteId: (dataService as any).ensureClientId({ tenantId: context.tenantId }),
          });
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error listing users: ${e.message}`,
            'USER_LIST_ERROR',
          );
        }
      },
    },
  ];
}

export const systemCommands = new SystemCommandHandler();
