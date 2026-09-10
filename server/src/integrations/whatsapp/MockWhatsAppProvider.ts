import { prisma } from '../../lib/prisma';
import { OutboundWaMessage, WhatsAppProvider } from './WhatsAppProvider';

/**
 * Default provider for the prototype.
 *
 * "Sending" a message means persisting it as an OUTBOUND WaMessage row; the
 * in-browser WhatsApp Simulator polls GET /api/whatsapp/messages and renders
 * whatever lands here, so the resident experience is demoable end-to-end
 * without a real WhatsApp account.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'mock';

  async sendMessage(msg: OutboundWaMessage): Promise<void> {
    const conversation = await prisma.waConversation.upsert({
      where: { phone: msg.to },
      create: { phone: msg.to },
      update: {},
    });

    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        type: msg.imageDataUrl ? 'image' : msg.buttons?.length ? 'buttons' : 'text',
        body: msg.text,
        buttons: msg.buttons?.length ? (msg.buttons as any) : undefined,
        imageDataUrl: msg.imageDataUrl,
      },
    });
  }
}
