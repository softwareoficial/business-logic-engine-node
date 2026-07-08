import express from 'express';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { dispatcher } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { RequestContext } from './core/RequestContext';
import { ErrorHandler } from './core/ErrorHandler';
import { logger } from './core/Logger';
import { ExampleGenerator } from './core/ExampleGenerator';

// --- Validation Schemas ---
const CommandRequestSchema = z.object({
  cmd: z.string(),
  params: z.record(z.string(), z.any()).optional().default({}),
  tenantId: z.union([z.string().uuid(), z.string().regex(/^\d+$/)]),
  userId: z.string().uuid().optional(),
  role: z.string().default('employee'),
  plan: z.string().default('free'),
});

const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  nombreCliente: z.string().min(1, 'Business name is required'),
});

type CommandRequest = z.infer<typeof CommandRequestSchema>;
type RegisterRequest = z.infer<typeof RegisterSchema>;

const app = express();

app.use(cors());
app.use(express.json());

// --- Endpoints ---

app.post('/register', async (req: Request, res: Response) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);

    // Call the infrastructure engine directly via dbClient
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
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.issues,
      });
    }
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

app.get('/', (req: Request, res: Response) => {
  const html = `
    <!DOCTYPE html>
    <html lang="es">
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
      <p>Estás conectado al <strong>Business Logic Engine</strong>. Esta API no es un REST tradicional; es un motor de comandos dinámicos diseñado para que puedas iterar la UI sin cambiar el código del servidor.</p>
      
      <h2>🛠️ Endpoints Principales</h2>
      
      <div class="endpoint">
        <span class="method">POST</span> <code>/register</code>
        <p><strong>¡Empieza aquí!</strong> Crea una cuenta nueva para tu negocio. Recibirás tu <code>clienteId</code> y un <code>token</code> de acceso.</p>
      </div>

      <div class="endpoint">
        <span class="method">GET</span> <code>/commands</code>
        <p>El "Mapa del Tesoro". Devuelve todos los comandos disponibles, sus parámetros requeridos y ejemplos reales de uso.</p>
      </div>
      
      <div class="endpoint">
        <span class="method">POST</span> <code>/execute</code>
        <p>El "Motor de Ejecución". Envía cualquier comando aquí para obtener un resultado. Es el único endpoint que necesitarás para la lógica de negocio.</p>
      </div>
      
      <div class="endpoint">
        <span class="method">GET</span> <code>/health</code>
        <p>Verifica que el servidor y la base de datos están online.</p>
      </div>

      <h2>📖 Guía Rápida de Inicio</h2>
      <div class="guide">
        <div class="step">
          <div class="step-number">1</div>
          <div><strong>Regístrate:</strong> Envía un <code>POST /register</code> con tu usuario, contraseña y nombre de empresa.</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div><strong>Obtén tus Credenciales:</strong> Guarda el <code>token</code> y el <code>clienteId</code>. Este ID (ya sea un número o un UUID) es el que usarás como <code>tenantId</code> en tus peticiones.</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div><strong>Descubre:</strong> Haz un <code>GET /commands</code> para ver qué puedes hacer hoy.</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div><strong>Ejecuta:</strong> Envía un JSON a <code>/execute</code> siguiendo este formato:
            <pre style="background: #2c3e50; color: #fff; padding: 1rem; border-radius: 5px; overflow-x: auto;">{
  "cmd": "nombre.del.comando",
  "params": { "clave": "valor" },
  "tenantId": "tu-uuid-aqui"
}</pre>
          </div>
        </div>
        <div class="step">
          <div class="step-number">5</div>
          <div><strong>Aprende:</strong> Si recibes un error, revisa el objeto <code>learning_center</code> en la respuesta para ver el ejemplo correcto.</div>
        </div>
      </div>

      <div class="footer">
        Business Logic Engine &bull; API for Fast Iteration
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
  // We use a hack to access the private registry since it's not exposed
  // In a real production scenario, we would add a getCommands() method to the Dispatcher
  const registry = (dispatcher as any).registry;

  if (!registry) {
    return res.status(500).json({ success: false, message: 'Dispatcher registry not found' });
  }

  const commandsList = Array.from(registry.values()).map((cmd: any) => ({
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

app.post('/execute', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let context: RequestContext | null = null;
  try {
    const validatedData = CommandRequestSchema.parse(req.body);

    context = {
      tenantId: validatedData.tenantId,
      userId: validatedData.userId,
      role: validatedData.role,
      plan: validatedData.plan,
    };

    const result = await dispatcher.execute(validatedData.cmd, validatedData.params, context);

    if (result.success === false) {
      throw result; // Throw the ServiceResponse so it is caught by the ErrorHandler
    }

    const duration = Date.now() - startTime;

    // Use the unified logEvent method (Fire and forget)
    dispatcher
      .logEvent(context, validatedData.cmd, 'SUCCESS', {
        duration,
        userAgent: req.headers['user-agent'] || 'unknown',
        clientType: req.body.clientType || 'unknown',
      })
      .catch((err) => console.error('Event logging failed:', err));

    logger.info(`Command executed successfully: ${validatedData.cmd}`, {
      tenantId: context.tenantId,
      userId: context.userId,
    });

    res.json(result);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const appError = ErrorHandler.handle(error);
    const formattedResponse = ErrorHandler.formatResponse(appError);

    // --- LEARNING CENTER LOGIC ---
    // We provide educational feedback if we can identify the command being attempted
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

    // Use the unified logEvent method for errors (Fire and forget)
    dispatcher
      .logEvent(
        context || {
          tenantId: req.body?.tenantId || 'unknown',
          userId: req.body?.userId || 'unknown',
          role: 'unknown',
          plan: 'unknown',
        },
        req.body?.cmd || 'unknown',
        'ERROR',
        {
          duration,
          source: appError.source,
          errorCode: appError.code,
          userAgent: req.headers['user-agent'] || 'unknown',
          clientType: req.body?.clientType || 'unknown',
        },
      )
      .catch((err) => console.error('Event logging failed:', err));

    res.status(appError.statusCode).json(formattedResponse);
  }
});

export default app;
