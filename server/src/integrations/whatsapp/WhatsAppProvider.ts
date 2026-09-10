// Provider-agnostic WhatsApp messaging contract.
//
// The conversational flow engine (src/whatsapp/flowEngine.ts) only ever talks
// to this interface, so swapping MockWhatsAppProvider for MetaWhatsAppProvider
// requires zero changes to business logic.

export interface WaButton {
  id: string; // machine id sent back when the user taps the button
  label: string; // text shown on the button (max ~20 chars on real WhatsApp)
}

export interface OutboundWaMessage {
  to: string; // phone number in international format, e.g. 923001234567
  text: string;
  // Rendered as WhatsApp interactive reply-buttons (max 3) or list (up to 10).
  buttons?: WaButton[];
  // PNG data-URL (used for QR pass images). Real providers upload media instead.
  imageDataUrl?: string;
}

export interface WhatsAppProvider {
  /** Human-readable provider name for logs. */
  readonly name: string;
  /** Deliver one message to a WhatsApp user. */
  sendMessage(msg: OutboundWaMessage): Promise<void>;
}
