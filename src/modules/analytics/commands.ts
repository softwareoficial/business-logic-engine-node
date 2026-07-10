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
      description:
        'Zero-Config Traffic Tracking. Automatically captures IP, Geo-Location, User-Agent, and Timestamp from HTTP headers. No parameters required for basic tracking.',
      paramsModel: {
        tenantId: 'string (optional)',
        visit_data: 'object { type, url, referrer, userAgent, language } (optional)',
        network_data: 'object { ip, timestamp } (optional)',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          // Delegate directly to the Infrastructure Engine's specialized command
          // This leverages the Infra's built-in auto-enrichment and flexibility.
          const res = await dataService.executeCustom('ANALYTICS:track-visit', params);

          return res && typeof res === 'object' && 'success' in res
            ? res
            : ServiceResponseHelper.success('Visit tracked successfully', res);
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
