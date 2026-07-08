import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';

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

class EmployeeCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'staff.define_business_term',
      description: 'Defines a custom term (permission, goal_type, or task) for the business.',
      paramsModel: { def_type: 'string', def_key: 'string', def_label: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { def_type, def_key, def_label } = params;
          if (!['permission', 'goal_type', 'task'].includes(def_type)) {
            return ServiceResponseHelper.error(
              "Invalid type. Must be 'permission', 'goal_type', or 'task'.",
              'INVALID_TYPE',
            );
          }

          const res = await dataService.push(
            'business_definitions',
            {
              def_type,
              def_key,
              def_label,
            },
            context,
          );

          if (!res.success) return res;
          return ServiceResponseHelper.success(
            `Term ${def_label} (${def_type}) defined successfully.`,
          );
        } catch (e: any) {
          return ServiceResponseHelper.error(e.message || 'Error defining term', 'DEF_TERM_ERROR');
        }
      },
    },
    {
      name: 'staff.create',
      description: 'Creates an employee record (Human or Bot).',
      paramsModel: {
        name: 'string',
        role: 'string',
        type: 'string',
        user_id: 'string',
        bot_profile_id: 'string',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { name, role, type, user_id, bot_profile_id } = params;
          if (!['human', 'bot'].includes(type)) {
            return ServiceResponseHelper.error(
              "Invalid type. Must be 'human' or 'bot'.",
              'INVALID_TYPE',
            );
          }

          const employeeId = crypto.randomUUID();
          const res = await dataService.push(
            'employees',
            {
              id: employeeId,
              user_id: user_id,
              bot_profile_id: bot_profile_id,
              name,
              role,
              type,
            },
            context,
          );

          if (!res.success) return res;
          return ServiceResponseHelper.success(
            `Employee ${name} created successfully as ${type}.`,
            { employee_id: employeeId },
          );
        } catch (e: any) {
          return ServiceResponseHelper.error(
            e.message || 'Error creating employee',
            'STAFF_CREATE_ERROR',
          );
        }
      },
    },
    {
      name: 'staff.set_permission',
      description: 'Grants or revokes a specific permission for an employee.',
      paramsModel: {
        employee_id: 'string',
        permission_key: 'string',
        granted: 'boolean',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { employee_id, permission_key, granted } = params;

          const empRes = await dataService.find('employees', { id: employee_id }, {}, context);
          if (!empRes.success || !empRes.data || empRes.data.length === 0) {
            return ServiceResponseHelper.error('Employee not found', 'EMPLOYEE_NOT_FOUND');
          }

          const defRes = await dataService.find(
            'business_definitions',
            {
              def_type: 'permission',
              def_key: permission_key,
            },
            {},
            context,
          );

          if (!defRes.success || !defRes.data || defRes.data.length === 0) {
            return ServiceResponseHelper.error(
              `Permission '${permission_key}' is not defined for this business.`,
              'UNDEFINED_PERMISSION',
            );
          }

          const res = await dataService.write(
            `employee_permissions[employee_id=${employee_id},permission_key=${permission_key}]`,
            {
              granted,
            },
            context,
          );

          if (!res.success) return res;
          return ServiceResponseHelper.success(
            `Permission ${permission_key} updated for employee.`,
          );
        } catch (e: any) {
          return ServiceResponseHelper.error(
            e.message || 'Error setting permission',
            'PERM_SET_ERROR',
          );
        }
      },
    },
    {
      name: 'staff.set_goal',
      description: 'Sets a performance goal for an employee.',
      paramsModel: {
        employee_id: 'string',
        goal_type: 'string',
        target: 'float',
        start_date: 'string',
        end_date: 'string',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { employee_id, goal_type, target, start_date, end_date } = params;
          const res = await dataService.write(
            `employee_goals[employee_id=${employee_id},goal_type=${goal_type}]`,
            {
              target_value: target,
              start_date,
              end_date,
            },
            context,
          );

          if (!res.success) {
            return ServiceResponseHelper.error(
              `Goal setting failed: ${res.message}`,
              res.data?.error_code || 'GOAL_SET_ERROR',
            );
          }

          return ServiceResponseHelper.success('Performance goal set successfully.');
        } catch (e: any) {
          return ServiceResponseHelper.error(e.message || 'Error setting goal', 'GOAL_SET_ERROR');
        }
      },
    },
    {
      name: 'staff.report',
      description: 'Retrieves the general performance report for all staff.',
      paramsModel: {},
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const res = await dataService.executeCustom('GET_STAFF_PERFORMANCE_REPORT', {
            tenant_id: context.tenantId,
          });
          return res && typeof res === 'object' && 'success' in res
            ? res
            : ServiceResponseHelper.success('Report retrieved', res);
        } catch (e: any) {
          return ServiceResponseHelper.error(e.message || 'Error getting report', 'REPORT_ERROR');
        }
      },
    },
  ];
}

export const employeeCommands = new EmployeeCommandHandler();
