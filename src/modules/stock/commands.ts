import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';

export interface CommandDefinition {
  name: string;
  description: string;
  paramsModel?: Record<string, string>;
  func: (
    dataService: IDataService,
    context: RequestContext,
    params: any,
  ) => Promise<ServiceResponse>;
  metadata: {
    requiredPlan: string;
  };
}

class StockCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'products.list',
      description: 'Retrieves all products for the current tenant.',
      paramsModel: {},
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          // Use the new find method: path, filter, options, context
          return await dataService.find('products', {}, {}, context);
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error listing products: ${e.message}`,
            'STOCK_LIST_ERROR',
          );
        }
      },
    },
    {
      name: 'stock.add',
      description: 'Adds or updates a product for the current tenant.',
      paramsModel: {
        code: 'string',
        name: 'string',
        price: 'float',
        quantity: 'int',
        category: 'string',
        is_weight: 'boolean',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { code, name, price, quantity, category, is_weight } = params;
          // Use push to add a new product to the array
          return await dataService.push(
            'products',
            {
              code,
              name,
              price,
              quantity,
              category,
              is_weight,
            },
            context,
          );
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error adding product: ${e.message}`,
            'STOCK_ADD_ERROR',
          );
        }
      },
    },
    {
      name: 'stock.update',
      description: 'Updates variant quantity for the current tenant.',
      paramsModel: { code: 'string', quantity: 'int', reason: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { code, quantity, reason = 'MANUAL' } = params;
          // Use write with a path to update only the quantity of the specific product
          const path = `products[code=${code}].quantity`;
          return await dataService.write(path, quantity, context);
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error updating stock: ${e.message}`,
            'STOCK_UPDATE_ERROR',
          );
        }
      },
    },
    {
      name: 'stock.get',
      description: 'Retrieves product data for the current tenant.',
      paramsModel: { code: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { code } = params;
          // Use find with a filter on the code
          return await dataService.find('products', { code }, {}, context);
        } catch (e: any) {
          return ServiceResponseHelper.error(
            `Error fetching product: ${e.message}`,
            'STOCK_GET_ERROR',
          );
        }
      },
    },
  ];
}

export const stockCommands = new StockCommandHandler();
