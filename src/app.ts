import express from 'express';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { dispatcher, RegisteredCommand } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { RequestContext } from './core/RequestContext';
import { ErrorHandler } from './core/ErrorHandler';
import { logger } from './core/Logger';
import { ExampleGenerator } from './core/ExampleGenerator';

// --- Validation Schemas ---
const CommandRequestSchema = z.object({
  cmd: z.string(),
  params: z.record(z.string(), z.any()).optional().default({}),
  source: z.string().optional().default('FRONTEND'),
  appId: z.string().optional().default('web-client'),
});

const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  nombreCliente: z.string().min(1, 'Business name is required'),
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string | number;
    cliente_id: string | number;
    role_name: string;
    plan: string;
    [key: string]: unknown;
  };
  userToken?: string;
}

const app = express();

app.use(cors());
app.use(express.json());

// --- Security Middlewares ---

const sanitizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeValue = (val: unknown): unknown => {
    if (typeof val === 'string') return sanitizeHtml(val);
    if (Array.isArray(val)) return val.map(sanitizeValue);
    if (typeof val === 'object' && val !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        sanitized[k] = sanitizeValue(v);
      }
      return sanitized;
    }
    return val;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  next();
};

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message:
        'Authentication required. Please provide a valid Bearer token in the Authorization header.',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // We use the Infra Engine to resolve the identity associated with this token.
    // We call 'USER:read' which is the source of truth for user/tenant identity.
    const authRes = await dbClient.execute('USER:read', {
      token,
    });

    if (!authRes.success || !authRes.data) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden. The provided token is not valid.',
        code: 'FORBIDDEN',
      });
    }

    // The Infra Engine returns the user object (id, username, cliente_id, role_id, etc.)
    // We attach this verified identity to the request.
    (req as AuthenticatedRequest).user = authRes.data as AuthenticatedRequest['user'];
    (req as AuthenticatedRequest).userToken = token;
    next();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Security validation failed';
    res
      .status(500)
      .json({ success: false, message: 'Security validation failed', error: errorMessage });
  }
};
// --- Endpoints ---

app.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);

    const result = await dbClient.execute('APP:self-register', {
      username: validatedData.username,
      password: validatedData.password,
      nombreCliente: validatedData.nombreCliente,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: result.data,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues,
      });
    }
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Username and password are required' });
    }

    const result = await dbClient.execute('USER:login', { username, password });

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: result.data,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    // The user token is already verified by authMiddleware.
    // We call 'USER:get-profile' to get the detailed user and company info.
    const result = await dbClient.execute('USER:get-profile', {});

    if (!result.success) {
      return res.status(403).json(result);
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, message: errorMessage });
  }
});
app.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="es">
...
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Business Logic Engine - Developer Portal</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 2rem; background-color: #f4f7f9; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #2980b9; margin-top: 2rem; }
        code { background: #e8eff5; padding: 2px 5px; border-radius: 4px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 0.9em; }
        .endpoint { background: #fff; border-left: 5px solid #3498db; padding: 1rem; margin: 1rem 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-radius: 0 4px 4px 0; }
        .method { font-weight: bold; color: #fff; background: #3498db; padding: 3px 8px; border-radius: 3px; font-size: 0.8em; margin-right: 10px; }
        .guide { background: #fff; padding: 1.5rem; border-radius: 8px; border: 1px solid #d1d9e0; }
        .step { margin-bottom: 1rem; display: flex; align-items: flex-start; }
        .step-number { background: #3498db; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; font-weight: bold; font-size: 0.8em; }
        .footer { margin-top: 3rem; text-align: center; font-size: 0.8em; color: #7f8c8d; }
      </style>
    </head>
    <body>
      <h1>🚀 Bienvenido, Frontend Dev</h1>
      <p>Estás conectado al <strong>Business Logic Engine</strong>. Esta API actúa como un Gateway seguro hacia el motor de infraestructura.</p>
      
      <h2>🛠️ Endpoints Principales</h2>
      
      <div class="endpoint">
        <span class="method">POST</span> <code>/register</code>
        <p><strong>¡Empieza aquí!</strong> Crea una cuenta nueva. Recibirás tu <code>token</code> de acceso.</p>
      </div>

      <div class="endpoint">
        <span class="method">GET</span> <code>/commands</code>
        <p>Devuelve todos los comandos disponibles y ejemplos de uso.</p>
      </div>
      
      <div class="endpoint">
        <span class="method">POST</span> <code>/execute</code>
        <p>Envía comandos de negocio. <strong>Importante:</strong> Debes incluir el token en el header Authorization: <code>Bearer YOUR_TOKEN</code>.</p>
        <div style="margin-top: 10px; font-size: 0.85em; color: #666; background: #f9f9f9; padding: 8px; border-radius: 4px; border: 1px dashed #ccc;">
          <strong>💡 Nota de Seguridad:</strong> Ya no necesitas enviar tenantId o userId. El sistema los resuelve automáticamente desde tu token.
        </div>
      </div>
      
      <div class="endpoint">
        <span class="method">GET</span> <code>/health</code>
        <p>Verifica que el servidor y la base de datos están online.</p>
      </div>

      <h2>📖 Guía Rápida de Inicio</h2>
      <div class="guide">
        <div class="step">
          <div class="step-number">1</div>
          <div><strong>Regístrate:</strong> Envía un <code>POST /register</code>.</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div><strong>Autentícate:</strong> Usa el <code>token</code> recibido en el header <code>Authorization: Bearer TOKEN</code>.</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div><strong>Descubre:</strong> Haz un <code>GET /commands</code>.</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div><strong>Ejecuta:</strong> Envía un JSON a <code>/execute</code>:
            <pre style="background: #2c3e50; color: #fff; padding: 1rem; border-radius: 5px; overflow-x: auto;">{
  "cmd": "nombre.del.comando",
  "params": { "clave": "valor" },
  "source": "web-app"
}</pre>
          </div>
        </div>
      </div>

      <div class="footer">
        Business Logic Engine &bull; Secure Gateway Mode
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'online',
    db_connected: dbClient.getConnected(),
  });
});

app.get('/commands', (req: Request, res: Response) => {
  const registry = (dispatcher as unknown as { registry: Map<string, RegisteredCommand> }).registry;

  if (!registry) {
    return res.status(500).json({ success: false, message: 'Dispatcher registry not found' });
  }

  const commandsList = Array.from(registry.values()).map((cmd: RegisteredCommand) => ({
    name: cmd.metadata.name,
    description: cmd.metadata.description,
    paramsModel: cmd.metadata.paramsModel,
    requiredPlan: cmd.metadata.requiredPlan,
    example: {
      cmd: cmd.metadata.name,
      params: ExampleGenerator.generate(cmd.metadata.paramsModel),
    },
  }));

  res.json({
    success: true,
    total: commandsList.length,
    commands: commandsList,
  });
});

app.post(
  '/execute',
  sanitizationMiddleware,
  authMiddleware,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const validatedData = CommandRequestSchema.parse(req.body);
      const user = (req as AuthenticatedRequest).user;

      // BUILD SECURE CONTEXT
      // We extract identity strictly from the verified user object returned by the Infrastructure Engine
      const context: RequestContext = {
        tenantId: user?.cliente_id?.toString() || 'unknown',
        userId: user?.id?.toString() || 'unknown',
        role: user?.role_name || 'employee',
        plan: user?.plan || 'free',
        source: req.body.source || 'FRONTEND',
        appId: req.body.appId || 'web-client',
        userAgent: req.headers['user-agent'] || 'unknown',
        ipAddress: Array.isArray(req.headers['x-forwarded-for'])
          ? req.headers['x-forwarded-for'][0]
          : ((req.headers['x-forwarded-for'] ||
              req.ip ||
              req.socket.remoteAddress ||
              'unknown') as string),
        requestId: Array.isArray(req.headers['x-request-id'])
          ? req.headers['x-request-id'][0]
          : ((req.headers['x-request-id'] || crypto.randomUUID()) as string),
      };

      const result = await dispatcher.execute(validatedData.cmd, validatedData.params, context);

      if (result.success === false) {
        throw result;
      }

      const duration = Date.now() - startTime;

      dispatcher
        .logEvent(context, validatedData.cmd, 'SUCCESS', {
          duration,
          clientType: req.body.clientType || 'unknown',
        })
        .catch((err) => console.error('Event logging failed:', err));

      logger.info(`Command executed successfully: \${validatedData.cmd}`, {
        tenantId: context.tenantId,
        userId: context.userId,
      });

      res.json(result);
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const appError = ErrorHandler.handle(error);
      const formattedResponse = ErrorHandler.formatResponse(appError);

      const attemptedCmd = req.body?.cmd;
      const metadata = attemptedCmd ? dispatcher.getCommandMetadata(attemptedCmd) : null;

      if (metadata) {
        formattedResponse.learning_center = {
          command: attemptedCmd,
          goal: metadata.description,
          expected_params: metadata.paramsModel,
          correct_example: {
            cmd: attemptedCmd,
            params: ExampleGenerator.generate(metadata.paramsModel),
          },
        };
      }

      const errorContext: RequestContext = {
        tenantId: (req as AuthenticatedRequest).user?.cliente_id?.toString() || 'unknown',
        userId: (req as AuthenticatedRequest).user?.id?.toString() || 'unknown',
        role: (req as AuthenticatedRequest).user?.role_name || 'unknown',
        plan: (req as AuthenticatedRequest).user?.plan || 'unknown',
        source: req.body?.source || 'FRONTEND',
        requestId: crypto.randomUUID(),
      };

      dispatcher
        .logEvent(errorContext, req.body?.cmd || 'unknown', 'ERROR', {
          duration,
          source: appError.source,
          errorCode: appError.code,
        })
        .catch((err) => console.error('Event logging failed:', err));

      res.status(appError.statusCode).json(formattedResponse);
    }
  },
);

export default app;
