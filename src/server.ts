import 'dotenv/config';
import http from 'http';
import app from './app';
import { dispatcher } from './core/Dispatcher';
import { dbClient } from './core/DbClient';
import { systemCommands } from './modules/system/commands';
import { stockCommands } from './modules/stock/commands';
import { salesCommands } from './modules/sales/commands';
import { employeeCommands } from './modules/employees/commands';

async function bootstrap() {
  try {
    console.log('🚀 Starting Business Logic Engine (Node.js)...');

    // 1. Initialize DB Client
    console.log('Attempting initial DB connection...');
    const connected = await dbClient.initialize();
    if (!connected) {
      console.warn('⚠️ Warning: DB connection could not be established. Some commands may fail.');
    } else {
      console.log('✅ DB Connection established successfully.');
    }

    // 2. Inject DB Client into Dispatcher
    dispatcher.setDataService(dbClient);

    // 3. Register Command Handlers
    console.log('Registering command handlers...');
    dispatcher.registerHandler(systemCommands);
    dispatcher.registerHandler(stockCommands);
    dispatcher.registerHandler(salesCommands);
    dispatcher.registerHandler(employeeCommands);

    // 4. Start Server
    const port = parseInt(process.env.LOGIC_PORT || '9002', 10);
    const server = http.createServer(app);

    server.listen(port, '0.0.0.0', () => {
      console.log(`✅ Server running on http://0.0.0.0:${port}`);
      console.log(`🔗 DB Connected: ${dbClient.getConnected()}`);
    });
  } catch (error) {
    console.error('❌ Critical failure during bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();
