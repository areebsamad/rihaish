import QRCode from 'qrcode';

// Real QR generation (not mocked). The QR encodes the pass code; the guard
// interface scans it (or accepts manual entry) and looks the pass up by code.
export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { width: 320, margin: 2 });
}

export function generatePassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `GP-${code}`;
}
