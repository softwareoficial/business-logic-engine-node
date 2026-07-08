export interface RequestContext {
  tenantId: string;
  userId?: string;
  role: string;
  plan: string;
  credentialId?: string;
  // Telemetry Metadata
  userAgent?: string;
  ipAddress?: string;
  appId?: string;
  source: 'FRONTEND' | 'BACKEND' | 'CLIENT_APP';
  requestId: string;
}
