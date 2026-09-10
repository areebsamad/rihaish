import { PaymentProvider, PaymentRequest, PaymentResult } from './PaymentProvider';

/**
 * EasyPaisa (Telenor Pakistan) provider — SCAFFOLD ONLY (not functional).
 *
 * Required env vars (see server/.env.example):
 *   EASYPAISA_STORE_ID  - merchant store id issued by EasyPaisa
 *   EASYPAISA_HASH_KEY  - shared key for request hashing/signature
 *   EASYPAISA_API_BASE  - e.g. https://easypay.easypaisa.com.pk (or sandbox URL)
 *
 * Integration outline (Easypay MA/Direct APIs):
 *  1. Initiate Mobile Account transaction:
 *       POST {EASYPAISA_API_BASE}/easypay-service/rest/v4/initiate-ma-transaction
 *       body: { orderId, storeId, transactionAmount, transactionType: "MA",
 *               mobileAccountNo: payerPhone, emailAddress }
 *       -> customer approves via USSD/app prompt
 *  2. Inquire transaction status (poll or IPN callback):
 *       POST .../inquire-transaction  { orderId, storeId, accountNum }
 *  3. Verify response hash with EASYPAISA_HASH_KEY before trusting status.
 */
export class EasyPaisaProvider implements PaymentProvider {
  readonly name = 'EASYPAISA';

  async initiatePayment(_req: PaymentRequest): Promise<PaymentResult> {
    // TODO: implement initiate + status-inquiry flow documented above.
    throw new Error('EasyPaisaProvider is not implemented in this prototype.');
  }
}
