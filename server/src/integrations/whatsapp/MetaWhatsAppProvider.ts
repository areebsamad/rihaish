import { OutboundWaMessage, WhatsAppProvider } from './WhatsAppProvider';

/**
 * Meta WhatsApp Business Cloud API provider — SCAFFOLD ONLY (not functional).
 *
 * Required env vars (see server/.env.example):
 *   META_WHATSAPP_TOKEN        - permanent access token for the WABA system user
 *   META_PHONE_NUMBER_ID       - the business phone-number id (not the number itself)
 *   META_WEBHOOK_VERIFY_TOKEN  - shared secret echoed during webhook verification
 *
 * The Cloud API calls this class will make once implemented:
 *
 * 1. Send free-form text (inside the 24h customer service window):
 *      POST https://graph.facebook.com/v21.0/{META_PHONE_NUMBER_ID}/messages
 *      { messaging_product: "whatsapp", to, type: "text", text: { body } }
 *
 * 2. Send interactive reply buttons (<=3 buttons):
 *      POST .../messages
 *      { messaging_product: "whatsapp", to, type: "interactive",
 *        interactive: { type: "button", body: { text },
 *          action: { buttons: [{ type: "reply", reply: { id, title } }] } } }
 *
 * 3. Send interactive list (4-10 options, used for the main menu / categories):
 *      POST .../messages
 *      { messaging_product: "whatsapp", to, type: "interactive",
 *        interactive: { type: "list", body: { text },
 *          action: { button: "Menu", sections: [{ rows: [{ id, title }] }] } } }
 *
 * 4. Send an image (QR pass). Cloud API needs a media id or public URL:
 *      POST .../{META_PHONE_NUMBER_ID}/media   (multipart upload of the PNG)
 *      then POST .../messages with { type: "image", image: { id: mediaId } }
 *
 * 5. Send template message (outside 24h window - bill reminders, announcements):
 *      POST .../messages
 *      { messaging_product: "whatsapp", to, type: "template",
 *        template: { name: "bill_reminder", language: { code: "en" },
 *                    components: [...] } }
 *
 * 6. Receive webhook (already wired in src/routes/whatsapp.ts):
 *      GET  /api/whatsapp/webhook  -> verification handshake
 *           (echo hub.challenge when hub.verify_token === META_WEBHOOK_VERIFY_TOKEN)
 *      POST /api/whatsapp/webhook  -> inbound messages / button taps; normalize
 *           entry[].changes[].value.messages[] into the InboundWaEvent shape the
 *           flow engine already consumes (see src/whatsapp/flowEngine.ts).
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';

  private token = process.env.META_WHATSAPP_TOKEN;
  private phoneNumberId = process.env.META_PHONE_NUMBER_ID;

  constructor() {
    if (!this.token || !this.phoneNumberId) {
      console.warn(
        '[MetaWhatsAppProvider] META_WHATSAPP_TOKEN / META_PHONE_NUMBER_ID not set - provider will throw on send.'
      );
    }
  }

  async sendMessage(_msg: OutboundWaMessage): Promise<void> {
    // TODO: implement using the Cloud API calls documented above.
    //  - map _msg.buttons (<=3) to interactive "button", (>3) to interactive "list"
    //  - upload _msg.imageDataUrl via the media endpoint before sending
    //  - handle 24h-window errors by falling back to an approved template
    throw new Error('MetaWhatsAppProvider is not implemented in this prototype.');
  }
}
