import { PaymentProvider, PaymentRequest, PaymentResult } from './PaymentProvider';

/**
 * JazzCash (Mobilink Microfinance Bank) provider — SCAFFOLD ONLY (not functional).
 *
 * Required env vars (see server/.env.example):
 *   JAZZCASH_MERCHANT_ID     - merchant id from the JazzCash merchant portal
 *   JAZZCASH_PASSWORD        - API password
 *   JAZZCASH_INTEGRITY_SALT  - salt used to compute pp_SecureHash (HMAC-SHA256)
 *   JAZZCASH_API_BASE        - e.g. https://payments.jazzcash.com.pk (or sandbox)
 *
 * Integration outline (v2.0 Mobile Wallet API):
 *  1. Build payload: pp_MerchantID, pp_Password, pp_TxnRefNo, pp_Amount (paisa),
 *     pp_TxnCurrency "PKR", pp_TxnDateTime, pp_MobileNumber, pp_CNIC (last 6),
 *     pp_Description.
 *  2. Compute pp_SecureHash = HMAC-SHA256(sorted values joined by '&',
 *     JAZZCASH_INTEGRITY_SALT).
 *  3. POST {JAZZCASH_API_BASE}/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction
 *  4. Validate pp_ResponseCode ("000" = success) and re-verify the response hash.
 */
export class JazzCashProvider implements PaymentProvider {
  readonly name = 'JAZZCASH';

  async initiatePayment(_req: PaymentRequest): Promise<PaymentResult> {
    // TODO: implement DoMWalletTransaction flow documented above.
    throw new Error('JazzCashProvider is not implemented in this prototype.');
  }
}
