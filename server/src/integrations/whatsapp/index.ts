import { WhatsAppProvider } from './WhatsAppProvider';
import { MockWhatsAppProvider } from './MockWhatsAppProvider';
import { MetaWhatsAppProvider } from './MetaWhatsAppProvider';

let provider: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (!provider) {
    provider =
      process.env.WHATSAPP_PROVIDER === 'meta'
        ? new MetaWhatsAppProvider()
        : new MockWhatsAppProvider();
    console.log(`[whatsapp] using "${provider.name}" provider`);
  }
  return provider;
}

export * from './WhatsAppProvider';
