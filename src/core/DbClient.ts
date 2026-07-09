import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import path from 'path';
import { IDataService, ServiceResponse, ServiceResponseHelper } from './IDataService';

class DbClient implements IDataService {
  private url: string | null = null;
  private adminToken: string | null = null;
  private isConnected: boolean = false;
  private httpClient: AxiosInstance | null = null;
  private readonly configPath = path.join(process.cwd(), 'admin_config.json');

  constructor() {}

  public async initialize(): Promise<boolean> {
    const envUrl = process.env.DB_URL;
    const envToken = process.env.DB_TOKEN;

    if (envUrl && envToken) {
      return await this.link(envUrl, envToken);
    }

    if (fs.existsSync(this.configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        if (config.url && config.token) {
          return await this.link(config.url, config.token);
        }
      } catch (e) {
        console.error(`Error loading config:`, e);
      }
    }

    console.warn('No DB configuration found. System is DISCONNECTED.');
    return false;
  }

  public async link(url: string, token: string): Promise<boolean> {
    const baseUrl = url.replace(/\/$/, '');
    try {
      const response = await axios.get(`${baseUrl}/health`, {
        headers: { 'x-admin-token': token },
        timeout: 5000,
      });

      if (response.status !== 200) return false;

      this.url = baseUrl;
      this.adminToken = token;
      this.isConnected = true;
      this.httpClient = axios.create({
        baseURL: baseUrl,
        timeout: 10000,
      });
      return true;
    } catch (e) {
      console.error('Connection error:', e);
      return false;
    }
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getUrl(): string | null {
    return this.url;
  }

  public toExternalId(id: number | string): string {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numericId)) return id.toString();
    return `00000000-0000-0000-0000-${numericId.toString().padStart(12, '0')}`;
  }

  private normalizeResponseData(data: unknown): unknown {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
      return data.map((item) => this.normalizeResponseData(item));
    }
    if (typeof data === 'object') {
      const normalized: Record<string, unknown> = {};
      const numericFields = ['price', 'quantity', 'total', 'subtotal', 'amount'];

      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (
          (key === 'clienteId' || key === 'tenantId' || key === 'tenant_id') &&
          typeof value === 'number'
        ) {
          normalized[key] = this.toExternalId(value);
        } else if (numericFields.includes(key)) {
          const numValue = Number(value);
          normalized[key] = isNaN(numValue) ? 0 : numValue;
        } else {
          normalized[key] = this.normalizeResponseData(value);
        }
      }
      return normalized;
    }
    return data;
  }

  async execute<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<ServiceResponse<T>> {
    if (!this.isConnected || !this.httpClient || !this.adminToken) {
      return ServiceResponseHelper.error(
        'DB not configured or disconnected',
        'ERR_DB_NOT_CONFIGURED',
      );
    }

    try {
      const response = await this.httpClient.post('/execute', {
        token: this.adminToken,
        command: command,
        payload: payload,
      });

      const result = response.data;

      // The API returns { status: "success" | "error", data: ..., error: ... }
      if (result.status === 'success') {
        return ServiceResponseHelper.success<T>(
          result.message || 'Operation successful',
          this.normalizeResponseData(result.data) as T,
        );
      } else {
        return ServiceResponseHelper.error(
          result.error?.message || 'API Error',
          result.error?.code || 'API_ERROR',
        );
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        const axiosError = e;
        console.error(
          `API Execution Error [${command}]:`,
          axiosError.response?.data || (e as Error).message,
        );
        return ServiceResponseHelper.error(
          axiosError.response?.data?.error?.message || (e as Error).message || 'Internal API Error',
          axiosError.response?.data?.error?.code || 'INTERNAL_ERROR',
        );
      }
      console.error(`API Execution Error [${command}]:`, (e as Error).message);
      return ServiceResponseHelper.error(
        (e as Error).message || 'Internal API Error',
        'INTERNAL_ERROR',
      );
    }
  }

  public ensureClientId(payload: Record<string, unknown>): number {
    const id = payload.tenantId || payload.clienteId;

    if (!id) {
      throw new Error('Tenant ID is required for database operations');
    }

    if (typeof id === 'number') return id;

    const idStr = id.toString().trim();

    // Security: Reject empty/zero UUIDs to prevent global access leaks
    if (idStr === '00000000-0000-0000-0000-000000000000' || idStr === '0') {
      throw new Error('Invalid Tenant ID: Global access via zero-UUID is forbidden');
    }

    // Check for padded UUID format (id_num_XXXXX)
    if (/^00000000-0000-0000-0000-\d{12}$/.test(idStr)) {
      const parts = idStr.split('-');
      return parseInt(parts[4], 10);
    }

    // If it's a simple numeric string, parse it directly
    if (/^\d+$/.test(idStr)) {
      const parsed = parseInt(idStr, 10);
      return isNaN(parsed) ? 1 : parsed;
    }

    // For UUIDs or other strings, use a simple deterministic hash
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
      const char = idStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }

    return (Math.abs(hash) % 1000000) + 1;
  }

  async read<T = unknown>(
    path?: string,
    context?: { tenantId: string },
  ): Promise<ServiceResponse<T>> {
    if (!context?.tenantId) {
      return ServiceResponseHelper.error('Tenant ID is required', 'MISSING_TENANT');
    }
    const clienteId = this.ensureClientId({ tenantId: context.tenantId });
    const command = path ? 'USER:read-path' : 'USER:read';
    const payload = path ? { clienteId, path } : { clienteId };

    return this.execute<T>(command, payload);
  }

  async write(
    path: string,
    value: unknown,
    context: { tenantId: string },
  ): Promise<ServiceResponse> {
    const clienteId = this.ensureClientId({ tenantId: context.tenantId });
    return this.execute('USER:update-path', { clienteId, path, value });
  }

  async push(path: string, item: unknown, context: { tenantId: string }): Promise<ServiceResponse> {
    const clienteId = this.ensureClientId({ tenantId: context.tenantId });
    return this.execute('USER:push-item', { clienteId, path, item });
  }

  async find<T = unknown>(
    path: string,
    filter: Record<string, unknown>,
    options?: { limit?: number; offset?: number },
    context?: { tenantId: string },
  ): Promise<ServiceResponse<T[]>> {
    if (!context?.tenantId) {
      return ServiceResponseHelper.error('Tenant ID is required', 'MISSING_TENANT');
    }
    const clienteId = this.ensureClientId({ tenantId: context.tenantId });
    const payload: Record<string, unknown> = { clienteId, path, filter };
    if (options?.limit) payload.limit = options.limit;
    if (options?.offset) payload.offset = options.offset;

    return this.execute<T[]>('USER:query-json', payload);
  }

  async executeCustom<T = unknown>(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<ServiceResponse<T>> {
    return this.execute<T>(command, payload);
  }
}

export const dbClient = new DbClient();
