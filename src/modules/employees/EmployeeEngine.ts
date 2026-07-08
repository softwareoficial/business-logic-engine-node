import { IDataService, ServiceResponseHelper } from '../../core/IDataService';

class EmployeeEngine {
    /**
     * Verifies if an employee has a specific permission granted.
     */
    public async checkPermission(
        dataService: IDataService,
        employeeId: string,
        permissionKey: string
    ): Promise<boolean> {
        try {
            // 1. Verify employee existence and get tenantId
            const empRes = await dataService.find("employees", { id: employeeId }, { limit: 1 });
            if (!empRes.success || !empRes.data || empRes.data.length === 0) {
                console.warn(`Employee ${employeeId} not found`);
                return false;
            }

            const tenantId = empRes.data[0].tenant_id;
            const context = { tenantId };

            // 2. Verify permission exists for that tenant
            const defRes = await dataService.find("business_definitions", {
                def_type: "permission",
                def_key: permissionKey,
            }, { limit: 1 }, context);

            if (!defRes.success || !defRes.data || defRes.data.length === 0) {
                console.warn(`Permission key ${permissionKey} not defined for tenant ${tenantId}`);
                return false;
            }

            // 3. Check if employee has the permission assigned
            const permRes = await dataService.find("employee_permissions", {
                employee_id: employeeId,
                permission_key: permissionKey,
            }, { limit: 1 }, context);

            if (!permRes.success || !permRes.data || permRes.data.length === 0) {
                return false;
            }

            return permRes.data[0].granted === true;
        } catch (e) {
            console.error(`Error checking permission for ${employeeId}:`, e);
            return false;
        }
    }

    /**
     * Adds progress to active goals.
     */
    public async recordAchievement(
        dataService: IDataService,
        employeeId: string,
        amount: number,
        goalType: string,
        tenantId: string
    ): Promise<void> {
        try {
            const context = { tenantId };
            // 1. Verify goal type exists for tenant
            const defRes = await dataService.find("business_definitions", {
                def_type: "goal_type",
                def_key: goalType,
            }, { limit: 1 }, context);

            if (!defRes.success || !defRes.data || defRes.data.length === 0) {
                console.error(`Goal type ${goalType} not defined for tenant ${tenantId}`);
                return;
            }

            // 2. Find active goal
            const goalRes = await dataService.find("employee_goals", {
                employee_id: employeeId,
                goal_type: goalType,
            }, { limit: 1 }, context);

            if (!goalRes.success || !goalRes.data || goalRes.data.length === 0) {
                console.warn(`No active goal of type ${goalType} found for employee ${employeeId}`);
                return;
            }

            const goalId = goalRes.data[0].id;

            // Update progress via executeCustom for atomicity
            await dataService.executeCustom("INCREMENT_FIELD", {
                entity: "employee_goals",
                record_id: goalId,
                field: "current_value",
                value: amount,
                tenant_id: tenantId,
            });
        } catch (e) {
            console.error(`Error recording achievement for ${employeeId}:`, e);
        }
    }

    /**
     * Dynamic report delegating aggregation to the Motor.
     */
    public async getPerformanceReport(
        dataService: IDataService,
        tenantId: string
    ): Promise<any[]> {
        try {
            const res = await dataService.executeCustom("GET_STAFF_PERFORMANCE_REPORT", {
                tenant_id: tenantId,
            });

            return res.success ? (res.data || []) : [];
        } catch (e) {
            console.error(`Error generating performance report:`, e);
            return [];
        }
    }
}

export const employeeEngine = new EmployeeEngine();
