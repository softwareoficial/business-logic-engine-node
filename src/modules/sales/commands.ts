import { IDataService, ServiceResponse, ServiceResponseHelper } from '../../core/IDataService';
import { RequestContext } from '../../core/RequestContext';
import { v4 as uuidv4 } from 'uuid';

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

class SalesCommandHandler {
  public commands: CommandDefinition[] = [
    {
      name: 'sales.cobrar',
      description: 'Processes a sale, updates stock and registers the payment.',
      paramsModel: {
        customer_phone: 'string',
        items: 'list',
        paga_con: 'decimal',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { customer_phone, items, paga_con } = params as Record<string, unknown>;

          // 1. Strict Validation
          if (!items || !Array.isArray(items) || items.length === 0) {
            return ServiceResponseHelper.error(
              'The items list cannot be empty. Please add at least one product to the sale.',
              'VALIDATION_ERROR',
            );
          }

          if ((paga_con as number) < 0) {
            return ServiceResponseHelper.error(
              'Payment amount cannot be negative.',
              'VALIDATION_ERROR',
            );
          }

          // 2. Validate and deduct stock for each item
          const productsList = await dataService.find<Record<string, unknown>>(
            'products',
            {},
            {},
            context,
          );
          if (!productsList.success || !productsList.data) {
            return ServiceResponseHelper.error(
              'Could not retrieve product list',
              'STOCK_LIST_ERROR',
            );
          }

          const productsArray = (Array.isArray(productsList.data)
            ? productsList.data
            : (productsList.data as Record<string, unknown>).results) as Record<string, unknown>[];

          if (!Array.isArray(productsArray)) {
            return ServiceResponseHelper.error('Could not retrieve product list', 'STOCK_LIST_ERROR');
          }

          for (const item of items) {
            const itemData = item as Record<string, unknown>;
            const product = productsArray.find(
              (p: Record<string, unknown>) => p.code === itemData.code,
            );

            if (!product) {
              return ServiceResponseHelper.error(
                `Product ${itemData.code} not found`,
                'STOCK_NOT_FOUND',
              );
            }

            const currentQuantity = parseInt(
              (product.quantity as string) || (product.quantity as number)?.toString() || '0',
            );
            const requestedQuantity = parseInt(
              (itemData.quantity as string) || (itemData.quantity as number)?.toString() || '0',
            );

            if (currentQuantity < requestedQuantity) {
              return ServiceResponseHelper.error(
                `Insufficient stock for product ${itemData.code}. Available: ${currentQuantity}`,
                'INSUFFICIENT_STOCK',
              );
            }

            const newQuantity = currentQuantity - requestedQuantity;
            const productIndex = productsArray.findIndex(
              (p: Record<string, unknown>) => p.code === itemData.code,
            );

            await dataService.write(
              `products.${productIndex}`,
              { ...product, quantity: newQuantity },
              context,
            );
          }

          // 3. Register the sale in the 'sales' array
          const saleRecord = {
            date: new Date().toISOString(),
            customer_phone,
            items,
            total: items.reduce((sum: number, i: unknown) => {
              const item = i as Record<string, unknown>;
              const price = parseFloat(
                (item.price as string) || (item.price as number)?.toString() || '0',
              );
              const qty = parseInt(
                (item.quantity as string) || (item.quantity as number)?.toString() || '0',
              );
              return sum + price * qty;
            }, 0),
            paga_con,
            status: 'completed',
          };

          const saleRes = await dataService.push('sales', saleRecord, context);

          if (!saleRes.success) {
            return ServiceResponseHelper.error(
              'Failed to register sale record',
              'SALE_REGISTRATION_ERROR',
            );
          }

          return ServiceResponseHelper.success('Sale processed successfully.', saleRes.data);
        } catch (e: unknown) {
          const error = e as Error;
          return ServiceResponseHelper.error(
            `Error processing sale: ${error.message || 'Unknown error'}`,
            'SALES_COBRAR_ERROR',
          );
        }
      },
    },
    {
      name: 'sales.create',
      description: 'Creates a sales order and generates a payment link.',
      paramsModel: {
        items: 'list',
        total: 'float',
        account_alias: 'string',
        client_request_id: 'string',
      },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { items, total, account_alias, client_request_id } = params as Record<
            string,
            unknown
          >;

          // 0. Idempotency Check
          if (client_request_id) {
            const res = await dataService.find<Record<string, unknown>>(
              'sales_orders',
              { client_request_id },
              { limit: 1 },
              context,
            );
            if (res.success && res.data && res.data.length > 0) {
              return ServiceResponseHelper.success('Sale already registered.', {
                sale_id: res.data[0].id as string,
              });
            }
          }

          // 1. Credentials
          const resCred = await dataService.find(
            'credentials',
            {
              service_name: 'mercadopago',
              account_alias: account_alias,
            },
            { limit: 1 },
            context,
          );

          if (!resCred.success || !resCred.data || resCred.data.length === 0) {
            return ServiceResponseHelper.error('Payment credentials not found', 'MP_CREDS_ERROR');
          }

          // 2. Sales Order
          const saleId = uuidv4();
          const saleRes = await dataService.push(
            'sales_orders',
            {
              id: saleId,
              total: total,
              payment_status: 'pending',
              client_request_id: client_request_id,
            },
            context,
          );

          if (!saleRes.success) return saleRes;

          // 3. Items
          if (Array.isArray(items)) {
            for (const item of items) {
              const itemData = item as Record<string, unknown>;
              const subtotal =
                parseFloat((itemData.price as string) || '0') *
                parseInt((itemData.quantity as string) || '0');
              await dataService.push(
                'sale_items',
                {
                  sale_id: saleId,
                  product_code: itemData.code,
                  quantity: itemData.quantity,
                  price: itemData.price,
                  subtotal: subtotal,
                },
                context,
              );
            }
          }

          // 4. Mock Payment Link
          const paymentLink = `https://api.payments.com/pay/${saleId}`;

          // 5. Update Order
          await dataService.write(
            `sales_orders[id=${saleId}]`,
            { payment_link: paymentLink },
            context,
          );

          return ServiceResponseHelper.success('Sale created.', {
            payment_link: paymentLink,
            sale_id: saleId,
          });
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            e instanceof Error ? e.message : 'Error creating sale',
            'SALE_CREATE_ERROR',
          );
        }
      },
    },
    {
      name: 'sales.confirm_payment',
      description: 'Confirms a payment and deducts products from stock.',
      paramsModel: { sale_id: 'string' },
      metadata: { requiredPlan: 'free' },
      func: async (dataService, context, params) => {
        try {
          const { sale_id } = params as Record<string, unknown>;
          const res = await dataService.executeCustom('CONFIRM_SALE_PAYMENT', {
            sale_id: sale_id,
            user_id: context.userId,
            tenantId: dataService.ensureClientId({ tenantId: context.tenantId }),
          });

          if (!res.success) {
            return ServiceResponseHelper.error(
              `Payment confirmation failed: ${res.message}`,
              ((res.data as Record<string, unknown>)?.error_code as string) ||
                'CONFIRM_PAYMENT_ERROR',
            );
          }

          return ServiceResponseHelper.success('Payment confirmed and stock updated.');
        } catch (e: unknown) {
          return ServiceResponseHelper.error(
            e instanceof Error ? e.message : 'Error confirming payment',
            'CONFIRM_PAYMENT_ERROR',
          );
        }
      },
    },
  ];
}

export const salesCommands = new SalesCommandHandler();
