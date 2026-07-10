import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';

export interface CommandDefinition {
  name: string;
  description: string;
  paramsModel?: Record<string, string>;
  func: (
    dataService: IDataService,
    context: RequestContext,
    params: Record<string, unknown>,
  ) => Promise<ServiceResponse>;
  metadata: {
    requiredPlan: string;
  };
}

class SystemCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'system.analytics.track',
      description: 'Tracks public website traffic data. Accessible without authentication.',
      paramsModel: {
        type: 'string',
        referrer: 'string',
        userAgent: 'string',
        language: 'string',
        url: 'string',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { type, referrer, userAgent, language, url } = params as Record<string, unknown>;

          const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            referrer,
            userAgent,
            language,
            url,
            ip: context.ipAddress,
            requestId: context.requestId,
          };

          await dataService.push('logs_trafico', logEntry, { tenantId: '1' });
          return ServiceResponseHelper.success('Traffic tracked successfully');
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error tracking traffic: ${e instanceof Error ? e.message : 'Unknown error'}`,
            'ANALYTICS_TRACK_ERROR',
          );
        }
      },
    },
    {
      name: 'system.client.register',
      description: 'Registers a new business client in the infrastructure.',
      paramsModel: { client_name: 'string', owner_email: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { client_name, owner_email } = params as Record<string, unknown>;

          const name = client_name as string;
          const email = owner_email as string;

          // 1. Validation: Length limits
          if (!name || name.length < 1 || name.length > 100) {
            return ServiceResponseHelper.error(
              'Client name must be between 1 and 100 characters',
              'INVALID_INPUT',
            );
          }
          if (!email || email.length < 5 || email.length > 255) {
            return ServiceResponseHelper.error('Owner email length is invalid', 'INVALID_INPUT');
          }

          // 2. Validation: Email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            return ServiceResponseHelper.error('Invalid owner email format', 'INVALID_EMAIL');
          }

          return await dataService.executeCustom('APP:client-create', {
            client_name: name,
            owner_email: email,
            tenant_id: context.tenantId,
          });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error registering client: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
          const { plan } = params as Record<string, unknown>;
          const allowedPlans = ['free', 'pro', 'enterprise'];
          if (!allowedPlans.includes(plan as string)) {
            return ServiceResponseHelper.error(
              "Invalid plan. Must be 'free', 'pro', or 'enterprise'.",
              'INVALID_PLAN',
            );
          }

          return await dataService.executeCustom('APP:update-client-plan', {
            clienteId: context.tenantId,
            plan: plan,
          });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error updating plan: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error listing events: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error getting stats: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error getting top errors: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
            days_to_keep: (params as Record<string, unknown>).days_to_keep || 30,
          });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error clearing events: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
          const { limit = 50, offset = 0, command } = params as Record<string, unknown>;
          return await dataService.find(
            'audit_logs',
            command ? { command: command as string } : {},
            { limit: limit as number, offset: offset as number },
            context,
          );
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
            'AUDIT_GET_ERROR',
          );
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
          const {
            username,
            password,
            role: _role = 'employee',
          } = params as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const role_to_use = _role;
          return await dataService.executeCustom('CLIENT:user-create', {
            username: username as string,
            password: password as string,
            role_id: 1,
            clienteId: dataService.ensureClientId({ tenantId: context.tenantId }),
          });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error creating user: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      func: async (dataService, context, _params) => {
        try {
          const result = await dataService.executeCustom('CLIENT:user-list', {
            clienteId: dataService.ensureClientId({ tenantId: context.tenantId }),
          });

          if (
            result.success &&
            result.data &&
            typeof result.data === 'object' &&
            'usuarios' in result.data
          ) {
            return {
              ...result,
              data: {
                results: (result.data as Record<string, unknown>).usuarios,
              },
            };
          }

          return result;
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error listing users: ${e instanceof Error ? e.message : 'Unknown error'}`,
            'USER_LIST_ERROR',
          );
        }
      },
    },
  ];
}

export const systemCommands = new SystemCommandHandler();
