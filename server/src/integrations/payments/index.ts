import { PaymentProvider } from './PaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';
import { EasyPaisaProvider } from './EasyPaisaProvider';
import { JazzCashProvider } from './JazzCashProvider';

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    switch (process.env.PAYMENT_PROVIDER) {
      case 'easypaisa':
        provider = new EasyPaisaProvider();
        break;
      case 'jazzcash':
        provider = new JazzCashProvider();
        break;
      default:
        provider = new MockPaymentProvider();
    }
    console.log(`[payments] using "${provider.name}" provider`);
  }
  return provider;
}

export * from './PaymentProvider';
