import { PaymentProvider, PaymentRequest, PaymentResult } from './PaymentProvider';

/**
 * Default provider for the prototype: simulates a gateway that settles after a
 * short delay. Tune via env:
 *   MOCK_PAYMENT_DELAY_MS  (default 1500)
 *   MOCK_PAYMENT_FAIL_RATE (0..1, default 0 so demos are deterministic)
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK_WALLET';

  async initiatePayment(req: PaymentRequest): Promise<PaymentResult> {
    const delay = Number(process.env.MOCK_PAYMENT_DELAY_MS || 1500);
    const failRate = Number(process.env.MOCK_PAYMENT_FAIL_RATE || 0);

    await new Promise((r) => setTimeout(r, delay));

    const reference = `MOCK-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    if (Math.random() < failRate) {
      return {
        success: false,
        reference,
        message: `Mock payment of Rs ${req.amount.toLocaleString()} declined (simulated failure).`,
      };
    }
    return {
      success: true,
      reference,
      message: `Mock payment of Rs ${req.amount.toLocaleString()} settled successfully.`,
    };
  }
}
