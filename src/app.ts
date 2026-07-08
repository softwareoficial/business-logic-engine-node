import express from 'express';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { dispatcher } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { RequestContext } from './core/RequestContext';
import { ErrorHandler } from './core/ErrorHandler';
import { logger } from './core/Logger';

// --- Validation Schemas ---
const CommandRequestSchema = z.object({
  cmd: z.string(),
  params: z.record(z.string(), z.any()).optional().default({}),
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  role: z.string().default('employee'),
  plan: z.string().default('free'),
});

type CommandRequest = z.infer<typeof CommandRequestSchema>;

const app = express();

app.use(cors());
app.use(express.json());

// --- Endpoints ---

app.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'online',
    db_connected: dbClient.getConnected(),
    db_url: dbClient.getUrl(),
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
