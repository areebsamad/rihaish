// Provider-agnostic payment contract. Business logic (bill payment flows) only
// depends on this interface; EasyPaisa/JazzCash can be swapped in via env var
// without touching the callers.

export interface PaymentRequest {
  billId: string;
  amount: number; // PKR
  payerPhone?: string;
  description?: string;
}

export interface PaymentResult {
  success: boolean;
  reference: string; // gateway transaction reference
  message: string;
}

export interface PaymentProvider {
  /** Human-readable provider name, also stored as Payment.method. */
  readonly name: string;
  /**
   * Initiate and settle a payment. Real gateways are asynchronous
   * (redirect/USSD push + callback); for the prototype the promise resolves
   * when the payment reaches a terminal state.
   */
  initiatePayment(req: PaymentRequest): Promise<PaymentResult>;
}
