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

    // Log the event to the database (Fire and forget to not block response)
    dispatcher
      .execute(
        'SYSTEM:log-event',
        {
          tenantId: validatedData.tenantId,
          userId: validatedData.userId,
          command: validatedData.cmd,
          status: 'SUCCESS',
          duration: duration,
          userAgent: req.headers['user-agent'] || 'unknown',
          clientType: req.body.clientType || 'unknown',
        },
        context,
      )
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

    // Log the error event to the database
    dispatcher
      .execute(
        'SYSTEM:log-event',
        {
          tenantId: req.body?.tenantId || 'unknown',
          userId: req.body?.userId || 'unknown',
          command: req.body?.cmd || 'unknown',
          status: 'ERROR',
          duration: duration,
          source: appError.source,
          errorCode: appError.code,
          userAgent: req.headers['user-agent'] || 'unknown',
          clientType: req.body?.clientType || 'unknown',
        },
        context || {
          tenantId: req.body?.tenantId || 'unknown',
          userId: req.body?.userId || 'unknown',
          role: 'unknown',
          plan: 'unknown',
        },
      )
      .catch((err) => console.error('Event logging failed:', err));

    res.status(appError.statusCode).json(formattedResponse);
  }
});

export default app;
