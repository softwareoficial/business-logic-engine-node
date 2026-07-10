import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { dispatcher, RegisteredCommand } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { RequestContext } from './core/RequestContext';
import { ErrorHandler } from './core/ErrorHandler';
import { logger } from './core/Logger';
import { ExampleGenerator } from './core/ExampleGenerator';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-production-key-12345';

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

// --- Security Middlewares ---

const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json());

// --- Rate Limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increase limit for E2E testing
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    code: 'TOO_MANY_REQUESTS',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 requests per minute per IP for public tracking
  message: {
    success: false,
    message: 'Too many tracking requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Global Error Handler for Malformed JSON ---
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && (err as unknown as Record<string, unknown>)['body']) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload provided.',
      code: 'MALFORMED_JSON',
    });
  }
  next(err);
});

app.use(sanitizationMiddleware);

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // PUBLIC COMMAND WHITELIST: Allow these commands to bypass authentication
  const publicCommands = ['system.analytics.track', 'ANALYTICS:track-visit', 'staff.create'];
  const requestedCmd = (req.body as Record<string, unknown>)?.cmd;

  if (typeof requestedCmd === 'string' && publicCommands.includes(requestedCmd)) {
    return next();
  }

  const token = req.cookies.session_token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. No session cookie found.',
      code: 'UNAUTHORIZED',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    // Verify the session still exists in the DB for instant revocation
    const sessionRes = await dbClient.find('sessions', { token }, { limit: 1 }, { tenantId: '1' });

    const results =
      sessionRes.data && typeof sessionRes.data === 'object' && 'results' in sessionRes.data
        ? (sessionRes.data as Record<string, unknown>).results
        : sessionRes.data;

    if (!sessionRes.success || !results || !Array.isArray(results) || results.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Session expired or invalid.',
        code: 'FORBIDDEN',
      });
    }

    (req as AuthenticatedRequest).user = {
      id: (decoded.userId || decoded.username) as string | number,
      cliente_id: decoded.clienteId as string | number,
      role_name: decoded.role as string,
      plan: decoded.plan as string,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired session.',
      code: 'AUTH_FAILED',
    });
  }
};
// --- Endpoints ---

app.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);

    // 1. Prevent duplicate usernames (search in users collection)
    const userExists = await dbClient.find(
      'users',
      { username: validatedData.username },
      { limit: 1 },
      { tenantId: '1' }, // Use system tenant for global user lookup
    );

    const existingUsers =
      userExists.data && typeof userExists.data === 'object' && 'results' in userExists.data
        ? (userExists.data as Record<string, unknown>).results
        : userExists.data;

    if (userExists.success && Array.isArray(existingUsers) && existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username is already taken. Please choose another one.',
        code: 'USERNAME_TAKEN',
      });
    }

    // 2. Register Business (Client)
    const clientRes = await dbClient.push(
      'clients',
      {
        name: validatedData.nombreCliente,
        created_at: new Date().toISOString(),
      },
      { tenantId: '1' },
    );

    if (!clientRes.success) {
      return res.status(400).json(clientRes);
    }

    const clienteId = (clientRes.data as Record<string, unknown>)?.id || '1';

    // 3. Register User linked to that client
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    const userRes = await dbClient.push(
      'users',
      {
        username: validatedData.username,
        password: hashedPassword,
        clienteId: clienteId,
        role: 'admin',
        plan: 'free',
      },
      { tenantId: clienteId.toString() },
    );

    if (!userRes.success) {
      return res.status(400).json(userRes);
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        username: validatedData.username,
        clienteId: clienteId,
      },
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

app.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Username and password are required' });
    }

    const userRes = await dbClient.find('users', { username }, { limit: 1 }, { tenantId: '1' });

    const results =
      userRes.data && typeof userRes.data === 'object' && 'results' in userRes.data
        ? (userRes.data as Record<string, unknown>).results
        : userRes.data;

    if (!userRes.success || !results || !Array.isArray(results) || results.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_FAILED',
      });
    }

    const user = results[0] as Record<string, unknown>;
    const storedPassword = user?.password as string | undefined;
    if (!storedPassword || !(await bcrypt.compare(password, storedPassword))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        code: 'AUTH_FAILED',
      });
    }

    // Create a signed JWT
    const token = jwt.sign(
      {
        userId: user.userId || user.username,
        clienteId: user.clienteId,
        role: user.role,
        plan: user.plan,
      },
      JWT_SECRET,
      { expiresIn: '24h' },
    );

    // Store in DB for session tracking/revocation
    await dbClient.push(
      'sessions',
      {
        token,
        username: user.username,
        clienteId: user.clienteId,
        role: user.role,
        plan: user.plan,
        created_at: new Date().toISOString(),
      },
      { tenantId: '1' },
    );

    // Set HttpOnly Cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          username: user.username,
          clienteId: user.clienteId,
          role: user.role,
          plan: user.plan,
        },
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'User identity not found' });
    }

    // Attempt to fetch full profile from DB
    const result = await dbClient.execute('USER:get-profile', {
      userId: user.id,
    });

    if (result.success) {
      return res.json({
        success: true,
        data: result.data,
      });
    }

    // Fallback: Return basic identity from token if DB profile fetch fails
    // This ensures the endpoint remains functional for session verification
    res.json({
      success: true,
      data: {
        ...user,
        note: 'Basic profile returned from session token',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ success: false, message: errorMessage });
  }
});

app.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const token = req.cookies.session_token;

    // 1. Remove session from DB
    await dbClient.execute('SESSION:delete', { token });

    // 2. Clear the cookie
    res.clearCookie('session_token');

    res.json({
      success: true,
      message: 'Logged out successfully',
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
        <span class="method">POST</span> <code>/login</code>
        <p>Autentica tu usuario para obtener el token de sesión.</p>
      </div>

      <div class="endpoint">
        <span class="method">GET</span> <code>/me</code>
        <p>Obtén la información de tu perfil y de tu empresa.</p>
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
          <div><strong>Autentícate:</strong> Usa el <code>POST /login</code> para obtener tu token.</div>
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

const conditionalPublicLimiter = (req: Request, res: Response, next: NextFunction) => {
  const requestedCmd = (req.body as Record<string, unknown>)?.cmd;

  if (typeof requestedCmd === 'string' && PUBLIC_COMMANDS.includes(requestedCmd)) {
    return publicApiLimiter(req, res, next);
  }
  next();
};

app.post(
  '/execute',
  sanitizationMiddleware,
  conditionalPublicLimiter,
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
((err) => console.error('Event logging failed:', err));

      res.status(appError.statusCode).json(formattedResponse);
    }
  },
);

export default app;
