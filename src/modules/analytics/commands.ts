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

class AnalyticsCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'ANALYTICS:track-visit',
      description: 'Registers a web visit. Publicly accessible.',
      paramsModel: {
        tenantId: 'string',
        visit_data: 'object',
        network_data: 'object',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { tenantId, visit_data = {}, network_data = {} } = params as Record<string, unknown>;

          if (!tenantId) {
            return ServiceResponseHelper.error('Missing required parameter: tenantId', 'MISSING_PARAMS');
          }

          const vData = visit_data as any;
          const nData = network_data as any;

          const validVisitData = {
            type: typeof vData.type === 'string' ? vData.type : 'unknown',
            url: typeof vData.url === 'string' ? vData.url : 'unknown',
            referrer: typeof vData.referrer === 'string' ? vData.referrer : 'unknown',
            userAgent: typeof vData.userAgent === 'string' ? vData.userAgent : context.userAgent,
            language: typeof vData.language === 'string' ? vData.language : 'unknown',
          };

          const validNetworkData = {
            ip: typeof nData.ip === 'string' ? nData.ip : context.ipAddress,
            timestamp: typeof nData.timestamp === 'string' ? nData.timestamp : new Date().toISOString(),
          };

          const visitorIp = context.ipAddress;
          const geoipRes = await dataService.find(
            'geoip_data',
            { ip: visitorIp },
            { limit: 1 },
            { tenantId: '1' },
          );

          const geoData = (geoipRes.success && Array.isArray(geoipRes.data)) 
            ? (geoipRes.data as any[])[0] 
            : null;

          const logEntry = {
            tenantId,
            ...validVisitData,
            ...validNetworkData,
            ip: visitorIp,
            country: geoData?.country || 'Unknown',
            city: geoData?.city || 'Unknown',
            isp: geoData?.isp || 'Unknown',
            timestamp: new Date().toISOString(), // Force server-side timestamp for absolute consistency
            requestId: context.requestId,
          };

          return await dataService.push('analytics_visits', logEntry, { tenantId: '1' });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error tracking visit: ${e instanceof Error ? e.message : 'Unknown error'}`,
            'ANALYTICS_TRACK_ERROR',
          );
        }
      },
    },
  ];
}

export const analyticsCommands = new AnalyticsCommandHandler();
