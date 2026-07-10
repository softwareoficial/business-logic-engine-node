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

class StockCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'products.list',
      description: 'Retrieves all products for the current tenant.',
      paramsModel: {},
      metadata: { requiredPlan: 'free' },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      func: async (dataService, context, _params) => {
        try {
          // Use the new find method: path, filter, options, context
          return await dataService.find('products', {}, {}, context);
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error listing products: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
          const { code, name, price, quantity, category, is_weight } = params as Record<
            string,
            unknown
          >;

          // 1. Strict Validation
          if ((price as number) < 0 || (quantity as number) < 0) {
            return ServiceResponseHelper.error(
              'Price and quantity cannot be negative.',
              'VALIDATION_ERROR',
            );
          }

          // Force is_weight to boolean
          const normalizedIsWeight =
            typeof is_weight === 'boolean'
              ? is_weight
              : is_weight === 'true' || is_weight === 'yes' || is_weight === 1;

          // 2. Check if product code already exists for this tenant
          const existingProduct = await dataService.find<Record<string, unknown>>(
            'products',
            { code },
            { limit: 1 },
            context,
          );

          if (existingProduct.success && existingProduct.data && existingProduct.data.length > 0) {
            return ServiceResponseHelper.error(
              `Product with code ${code} already exists. Please use a unique code or update the existing product.`,
              'PRODUCT_EXISTS',
            );
          }

          // 3. Use push to add a new product to the array
          return await dataService.push(
            'products',
            {
              code,
              name,
              price,
              quantity,
              category,
              is_weight: normalizedIsWeight,
            },
            context,
          );
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error adding product: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
          const { code, quantity } = params as Record<string, unknown>;

          // 1. Find the product to get its index in the array
          const search = await dataService.find<Record<string, unknown>>(
            'products',
            { code },
            { limit: 1 },
            context,
          );

          if (!search.success || !search.data || search.data.length === 0) {
            return ServiceResponseHelper.error(
              `Product with code ${code} not found.`,
              'PRODUCT_NOT_FOUND',
            );
          }

          // The Infrastructure Engine expects a path like 'products[index].quantity'
          // We assume the DB client's find returns results in a way we can't easily get the index,
          // but we can use the find result to verify existence.
          // For a more robust update, we should use a specific update-by-filter command if available.
          // Since we only have 'USER:update-path', we must use the index.
          // Let's try to retrieve the full list and find the index manually.
          const allProducts = await dataService.find<Record<string, unknown>>(
            'products',
            {},
            {},
            context,
          );

          let productsArray: Record<string, unknown>[] = [];
          if (allProducts.success && allProducts.data) {
            productsArray = Array.isArray(allProducts.data)
              ? allProducts.data
              : (allProducts.data as Record<string, unknown>).results || [];
          }

          if (!Array.isArray(productsArray)) {
            throw new Error('Could not retrieve product list as an array for indexing');
          }

          const index = productsArray.findIndex((p) => p.code === code);
          if (index === -1) {
            return ServiceResponseHelper.error(
              'Product not found during indexing.',
              'PRODUCT_NOT_FOUND',
            );
          }

          const product = productsArray[index];
          const updatedProduct = { ...product, quantity };

          const path = `products.${index}`;
          return await dataService.write(path, updatedProduct, context);
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error updating stock: ${e instanceof Error ? e.message : 'Unknown error'}`,
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
          const { code } = params as Record<string, unknown>;
          // Use find with a filter on the code
          return await dataService.find('products', { code }, {}, context);
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            `Error fetching product: ${e instanceof Error ? e.message : 'Unknown error'}`,
            'STOCK_GET_ERROR',
          );
        }
      },
    },
  ];
}

export const stockCommands = new StockCommandHandler();
