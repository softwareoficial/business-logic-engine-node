import express from 'express';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { dispatcher } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { RequestContext } from './core/RequestContext';

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
    try {
        const validatedData = CommandRequestSchema.parse(req.body);
        
        const context: RequestContext = {
            tenantId: validatedData.tenantId,
            userId: validatedData.userId,
            role: validatedData.role,
            plan: validatedData.plan,
        };

        const result = await dispatcher.execute(
            validatedData.cmd,
            validatedData.params,
            context
        );

        res.json(result);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ 
                success: false, 
                message: "Invalid request data", 
                errors: error.issues 
            });

        } else {
            console.error(`Unexpected error executing command:`, error);
            res.status(500).json({ 
                success: false, 
                message: error.message || "Internal server error" 
            });
        }
    }
});

export default app;
