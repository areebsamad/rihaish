import { prisma } from '../lib/prisma';
import { getWhatsAppProvider } from '../integrations/whatsapp';

/**
 * Outbound pushes triggered by admin actions (approvals, status changes,
 * broadcasts). All go through the WhatsAppProvider so they work identically
 * with the mock simulator today and Meta's API later.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function residentWaPhone(residentId?: string | null): Promise<string | null> {
  if (!residentId) return null;
  const r = await prisma.resident.findUnique({ where: { id: residentId } });
  return r?.waPhone ?? null;
}

export async function notifyVisitorDecision(visitorId: string, approved: boolean) {
  const visitor = await prisma.visitor.findUnique({
    where: { id: visitorId },
    include: { pass: true, plot: { include: { resident: true } }, resident: true },
  });
  if (!visitor?.pass) return;
  const phone =
    visitor.resident?.waPhone ?? visitor.plot.resident?.waPhone ?? null;
  if (!phone) return;

  const wa = getWhatsAppProvider();
  if (approved) {
    await wa.sendMessage({
      to: phone,
      text: `✅ Visitor pass *approved* for *${visitor.name}* (plot ${visitor.plot.number}).\n\nPass code: *${visitor.pass.code}*\nValid until: ${visitor.pass.expiresAt.toDateString()}\n\nShow this QR code at the gate. 👇`,
      imageDataUrl: visitor.pass.qrDataUrl ?? undefined,
    });
  } else {
    await wa.sendMessage({
      to: phone,
      text: `❌ Your visitor pass request for *${visitor.name}* was *rejected* by the committee. Please contact the society office for details.`,
    });
  }
}

export async function notifyComplaintUpdate(
  complaintId: string,
  opts: { statusFrom?: string; statusTo?: string; note?: string }
) {
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    include: { resident: true },
  });
  const phone = complaint?.resident?.waPhone;
  if (!complaint || !phone) return;

  let text = `🔔 Update on complaint *${complaint.ticketNo}*`;
  if (opts.statusTo && opts.statusTo !== opts.statusFrom) {
    text += `\nStatus: ${opts.statusFrom ?? '—'} → *${opts.statusTo.replace('_', ' ')}*`;
  }
  if (opts.note) text += `\n💬 ${opts.note}`;
  await getWhatsAppProvider().sendMessage({ to: phone, text });
}

/** Broadcasts an announcement to all WhatsApp-linked residents in scope. Returns count sent. */
export async function broadcastAnnouncement(announcementId: string): Promise<number> {
  const a = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!a) return 0;

  const residents = await prisma.resident.findMany({
    where: {
      societyId: a.societyId,
      waPhone: { not: null },
      ...(a.target === 'PLOTS' ? { plots: { some: { number: { in: a.plotNumbers } } } } : {}),
    },
  });

  const wa = getWhatsAppProvider();
  for (const r of residents) {
    await wa.sendMessage({
      to: r.waPhone!,
      text: `📢 *${a.title}*\n\n${a.body}`,
      buttons: [{ id: `ack.${a.id}`, label: '👍 Acknowledge' }],
    });
  }
  return residents.length;
}

/** WhatsApp bill reminder (mocked provider). Returns true if a message was sent. */
export async function sendBillReminder(billId: string): Promise<boolean> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { plot: { include: { resident: true } } },
  });
  const phone = bill?.plot.resident?.waPhone;
  if (!bill || !phone) return false;

  await getWhatsAppProvider().sendMessage({
    to: phone,
    text: `🔔 *Bill reminder*\n\nPlot: ${bill.plot.number}\nPeriod: ${MONTHS[bill.month - 1]} ${bill.year}\nAmount: *Rs ${bill.amount.toLocaleString()}*\nDue date: ${bill.dueDate.toISOString().slice(0, 10)}\nStatus: ${bill.status}\n\nYou can pay right here 👇`,
    buttons: [
      { id: `pay.${bill.id}`, label: `💳 Pay Rs ${bill.amount.toLocaleString()}` },
      { id: 'menu', label: '↩️ Main Menu' },
    ],
  });
  return true;
}
