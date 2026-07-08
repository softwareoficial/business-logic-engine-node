export interface RequestContext {
    tenantId: string;
    userId?: string;
    role: string;
    plan: string;
    credentialId?: string;
}
