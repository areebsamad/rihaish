import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { getWhatsAppProvider, WaButton } from '../integrations/whatsapp';
import { getPaymentProvider } from '../integrations/payments';
import { generatePassCode, generateQrDataUrl } from '../integrations/qrcode';

/**
 * Structured conversational flows for the WhatsApp resident interface.
 *
 * This is a deterministic state machine (no free-text AI), mirroring how real
 * WhatsApp interactive buttons/lists behave. Inbound events arrive through
 * POST /api/whatsapp/webhook in a normalized shape — the in-browser simulator
 * posts the exact same shape a Meta-webhook adapter would produce, so moving
 * to the real API only means replacing the provider + webhook normalization.
 */

export interface InboundWaEvent {
  from: string; // phone, e.g. 923001234567
  type: 'text' | 'button';
  text?: string;
  buttonId?: string;
}

const MENU_BUTTONS: WaButton[] = [
  { id: 'menu.viewbill', label: '📄 View Bill' },
  { id: 'menu.paybill', label: '💳 Pay Bill' },
  { id: 'menu.visitor', label: '🚪 Request Visitor Pass' },
  { id: 'menu.complaint', label: '🛠 Submit Complaint' },
  { id: 'menu.announcements', label: '📢 Announcements' },
  { id: 'menu.admin', label: '🙋 Talk to Admin' },
];

const CATEGORY_BUTTONS: WaButton[] = [
  { id: 'cat.PLUMBING', label: 'Plumbing' },
  { id: 'cat.ELECTRICITY', label: 'Electricity' },
  { id: 'cat.SECURITY', label: 'Security' },
  { id: 'cat.CLEANLINESS', label: 'Cleanliness' },
  { id: 'cat.NOISE', label: 'Noise' },
  { id: 'cat.OTHER', label: 'Other' },
];

async function send(to: string, text: string, buttons?: WaButton[], imageDataUrl?: string) {
  await getWhatsAppProvider().sendMessage({ to, text, buttons, imageDataUrl });
}

type Conv = NonNullable<Awaited<ReturnType<typeof prisma.waConversation.findUnique>>>;

async function setConv(id: string, data: { state?: string; context?: any; residentId?: string; escalated?: boolean }) {
  return prisma.waConversation.update({ where: { id }, data });
}

function ctx(conv: Conv): any {
  return (conv.context as any) || {};
}

export async function handleInbound(event: InboundWaEvent): Promise<void> {
  const phone = event.from.replace(/[^0-9]/g, '');
  if (!phone) return;

  let conv = await prisma.waConversation.findUnique({ where: { phone } });
  const isNew = !conv;
  if (!conv) {
    conv = await prisma.waConversation.create({ data: { phone, state: 'AWAIT_PLOT' } });
  }

  // Persist the inbound message so it shows in simulator + admin inbox.
  await prisma.waMessage.create({
    data: {
      conversationId: conv.id,
      direction: 'INBOUND',
      type: event.type === 'button' ? 'buttons' : 'text',
      body: event.type === 'button' ? event.buttonId || '' : event.text || '',
    },
  });

  const input = (event.type === 'button' ? event.buttonId : event.text)?.trim() || '';

  // Brand-new number: greet and start registration regardless of what was sent.
  if (isNew) {
    await send(
      phone,
      'Assalam-o-Alaikum! 👋 Welcome to *Rihaish*.\n\nI could not find this WhatsApp number in our records. Let\'s get you registered.\n\nPlease reply with your *plot/flat number* (e.g. A-101).'
    );
    return;
  }

  // Global shortcuts once registered.
  if (conv.residentId) {
    const lower = input.toLowerCase();
    if (lower === 'menu' || lower === 'hi' || lower === 'hello' || lower === 'salam') {
      await sendMenu(conv);
      return;
    }
    if (input.startsWith('pay.')) {
      await handleBillPayment(conv, input.slice(4));
      return;
    }
    if (input.startsWith('ack.')) {
      await handleAnnouncementAck(conv, input.slice(4));
      return;
    }
  }

  switch (conv.state) {
    case 'AWAIT_PLOT':
      return handleAwaitPlot(conv, input);
    case 'AWAIT_CNIC':
      return handleAwaitCnic(conv, input);
    case 'MENU':
      return handleMenu(conv, input);
    case 'VISITOR_NAME':
      return handleVisitorName(conv, input);
    case 'VISITOR_DATETIME':
      return handleVisitorDatetime(conv, input);
    case 'COMPLAINT_CATEGORY':
      return handleComplaintCategory(conv, input);
    case 'COMPLAINT_DESC':
      return handleComplaintDesc(conv, input);
    default:
      await setConv(conv.id, { state: conv.residentId ? 'MENU' : 'AWAIT_PLOT' });
      await send(conv.phone, 'Sorry, something went wrong. Type *menu* to start over.');
  }
}

// --- Registration -----------------------------------------------------------

async function handleAwaitPlot(conv: Conv, input: string) {
  if (!input) {
    await send(conv.phone, 'Please reply with your *plot/flat number* (e.g. A-101).');
    return;
  }
  const plot = await prisma.plot.findFirst({
    where: { number: { equals: input, mode: 'insensitive' }, residentId: { not: null } },
    include: { resident: true, society: true },
  });
  if (!plot || !plot.resident) {
    await send(
      conv.phone,
      `I couldn't find plot *${input}* in our records. Please check the plot number and try again, or contact your society office.`
    );
    return;
  }
  await setConv(conv.id, {
    state: 'AWAIT_CNIC',
    context: { plotId: plot.id, residentId: plot.residentId, tries: 0 },
  });
  await send(
    conv.phone,
    `Found plot *${plot.number}* in *${plot.society.name}*. 🏠\n\nTo verify it's you, please reply with the *last 4 digits of your CNIC*.`
  );
}

async function handleAwaitCnic(conv: Conv, input: string) {
  const c = ctx(conv);
  const resident = c.residentId
    ? await prisma.resident.findUnique({ where: { id: c.residentId } })
    : null;
  if (!resident) {
    await setConv(conv.id, { state: 'AWAIT_PLOT', context: {} });
    await send(conv.phone, 'Let\'s start again — please send your *plot number*.');
    return;
  }
  if (input.replace(/\D/g, '') !== resident.cnicLast4) {
    const tries = (c.tries || 0) + 1;
    if (tries >= 3) {
      await setConv(conv.id, { state: 'AWAIT_PLOT', context: {} });
      await send(conv.phone, '❌ Verification failed 3 times. Please send your *plot number* to try again, or contact the society office.');
    } else {
      await setConv(conv.id, { context: { ...c, tries } });
      await send(conv.phone, `That doesn't match our records (attempt ${tries}/3). Please send the *last 4 digits of your CNIC*.`);
    }
    return;
  }

  await prisma.resident.update({ where: { id: resident.id }, data: { waPhone: conv.phone } });
  const updated = await setConv(conv.id, { residentId: resident.id, state: 'MENU', context: {} });
  await audit({
    societyId: resident.societyId,
    actorType: 'RESIDENT',
    actorId: resident.id,
    actorName: resident.name,
    action: 'WHATSAPP_LINKED',
    entity: 'Resident',
    entityId: resident.id,
    after: { waPhone: conv.phone },
  });
  await send(conv.phone, `✅ Verified! Welcome, *${resident.name}*. Your WhatsApp number is now linked.`);
  await sendMenu(updated);
}

// --- Main menu ---------------------------------------------------------------

async function sendMenu(conv: Conv) {
  if (conv.state !== 'MENU') await setConv(conv.id, { state: 'MENU', context: {} });
  await send(conv.phone, 'How can I help you today? 👇', MENU_BUTTONS);
}

async function handleMenu(conv: Conv, input: string) {
  if (!conv.residentId) {
    await setConv(conv.id, { state: 'AWAIT_PLOT' });
    await send(conv.phone, 'Please send your *plot number* to register first.');
    return;
  }
  switch (input) {
    case 'menu.viewbill':
      return showBills(conv, false);
    case 'menu.paybill':
      return showBills(conv, true);
    case 'menu.visitor':
      await setConv(conv.id, { state: 'VISITOR_NAME', context: {} });
      await send(conv.phone, 'Sure! What is the *visitor\'s name*?');
      return;
    case 'menu.complaint':
      await setConv(conv.id, { state: 'COMPLAINT_CATEGORY', context: {} });
      await send(conv.phone, 'Please choose a *complaint category*:', CATEGORY_BUTTONS);
      return;
    case 'menu.announcements':
      return showAnnouncements(conv);
    case 'menu.admin':
      return escalate(conv);
    default:
      await sendMenu(conv);
  }
}

// --- Bills -------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function showBills(conv: Conv, payIntent: boolean) {
  const bills = await prisma.bill.findMany({
    where: { plot: { residentId: conv.residentId! }, status: { in: ['PENDING', 'OVERDUE'] } },
    include: { plot: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  if (bills.length === 0) {
    await send(conv.phone, '🎉 Great news — you have *no outstanding bills*. Type *menu* for more options.');
    return;
  }
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const lines = bills.map(
    (b) =>
      `• ${b.plot.number} — ${MONTHS[b.month - 1]} ${b.year}: *Rs ${b.amount.toLocaleString()}* (${b.status === 'OVERDUE' ? '⚠️ overdue' : 'due ' + b.dueDate.toISOString().slice(0, 10)})`
  );
  const buttons: WaButton[] = bills
    .slice(0, 2)
    .map((b) => ({ id: `pay.${b.id}`, label: `Pay Rs ${b.amount.toLocaleString()} (${MONTHS[b.month - 1]})` }));
  buttons.push({ id: 'menu', label: '↩️ Main Menu' });
  await send(
    conv.phone,
    `${payIntent ? 'Here are your payable bills' : 'Your current bill status'}:\n\n${lines.join('\n')}\n\nTotal outstanding: *Rs ${total.toLocaleString()}*`,
    buttons
  );
}

async function handleBillPayment(conv: Conv, billId: string) {
  const bill = await prisma.bill.findFirst({
    where: { id: billId, plot: { residentId: conv.residentId! } },
    include: { plot: { include: { society: true } } },
  });
  if (!bill) {
    await send(conv.phone, 'Sorry, I could not find that bill. Type *menu* to see your bills.');
    return;
  }
  if (bill.status === 'PAID') {
    await send(conv.phone, 'That bill is already paid. ✅ Type *menu* for more options.');
    return;
  }

  await send(conv.phone, `⏳ Processing payment of *Rs ${bill.amount.toLocaleString()}* for ${bill.plot.number} (${MONTHS[bill.month - 1]} ${bill.year}) via mobile wallet...`);

  const provider = getPaymentProvider();
  const payment = await prisma.payment.create({
    data: { billId: bill.id, amount: bill.amount, method: provider.name, status: 'INITIATED' },
  });
  const result = await provider.initiatePayment({
    billId: bill.id,
    amount: bill.amount,
    payerPhone: conv.phone,
    description: `${bill.description} ${MONTHS[bill.month - 1]} ${bill.year}`,
  });

  if (result.success) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', reference: result.reference, paidAt: new Date() },
    });
    const before = { status: bill.status };
    await prisma.bill.update({ where: { id: bill.id }, data: { status: 'PAID' } });
    await audit({
      societyId: bill.plot.societyId,
      actorType: 'RESIDENT',
      actorId: conv.residentId,
      actorName: (await prisma.resident.findUnique({ where: { id: conv.residentId! } }))?.name || 'Resident',
      action: 'BILL_PAID_WHATSAPP',
      entity: 'Bill',
      entityId: bill.id,
      before,
      after: { status: 'PAID', reference: result.reference, amount: bill.amount },
    });
    await send(
      conv.phone,
      `✅ *Payment successful!*\n\nAmount: Rs ${bill.amount.toLocaleString()}\nBill: ${bill.plot.number} — ${MONTHS[bill.month - 1]} ${bill.year}\nReference: ${result.reference}\n\nThank you! 🙏`,
      [{ id: 'menu', label: '↩️ Main Menu' }]
    );
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', reference: result.reference },
    });
    await send(conv.phone, `❌ Payment failed: ${result.message}\nPlease try again later.`, [
      { id: `pay.${bill.id}`, label: '🔁 Retry Payment' },
      { id: 'menu', label: '↩️ Main Menu' },
    ]);
  }
}

// --- Visitor pass ------------------------------------------------------------

async function handleVisitorName(conv: Conv, input: string) {
  if (!input || input.startsWith('menu')) {
    await send(conv.phone, 'Please type the *visitor\'s name*.');
    return;
  }
  await setConv(conv.id, { state: 'VISITOR_DATETIME', context: { visitorName: input } });
  await send(conv.phone, `When is *${input}* expected?`, [
    { id: 'vdate.today', label: 'Today' },
    { id: 'vdate.tomorrow', label: 'Tomorrow' },
  ]);
}

async function handleVisitorDatetime(conv: Conv, input: string) {
  const c = ctx(conv);
  let expectedAt: Date;
  if (input === 'vdate.today') {
    expectedAt = new Date();
  } else if (input === 'vdate.tomorrow') {
    expectedAt = new Date(Date.now() + 24 * 3600 * 1000);
  } else {
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) {
      await send(conv.phone, 'I didn\'t understand that date. Please tap a button or type a date like *2026-07-15 17:00*.', [
        { id: 'vdate.today', label: 'Today' },
        { id: 'vdate.tomorrow', label: 'Tomorrow' },
      ]);
      return;
    }
    expectedAt = parsed;
  }

  const resident = await prisma.resident.findUnique({
    where: { id: conv.residentId! },
    include: { plots: true },
  });
  const plot = resident?.plots[0];
  if (!resident || !plot) {
    await setConv(conv.id, { state: 'MENU', context: {} });
    await send(conv.phone, 'Sorry, no plot is linked to your profile. Please contact the society office.');
    return;
  }

  const code = generatePassCode();
  const qrDataUrl = await generateQrDataUrl(code);
  const visitor = await prisma.visitor.create({
    data: {
      societyId: resident.societyId,
      plotId: plot.id,
      residentId: resident.id,
      name: c.visitorName || 'Visitor',
      expectedAt,
      createdVia: 'WHATSAPP',
      pass: {
        create: {
          code,
          qrDataUrl,
          status: 'PENDING',
          expiresAt: new Date(expectedAt.getTime() + 24 * 3600 * 1000),
        },
      },
    },
    include: { pass: true },
  });
  await audit({
    societyId: resident.societyId,
    actorType: 'RESIDENT',
    actorId: resident.id,
    actorName: resident.name,
    action: 'VISITOR_REQUESTED',
    entity: 'Visitor',
    entityId: visitor.id,
    after: { name: visitor.name, expectedAt, plot: plot.number, passCode: code },
  });
  await setConv(conv.id, { state: 'MENU', context: {} });
  await send(
    conv.phone,
    `📨 Visitor request submitted for *${visitor.name}* (${expectedAt.toDateString()}).\n\nPass code: *${code}* — pending committee approval. You'll receive the QR pass here once approved.`,
    [{ id: 'menu', label: '↩️ Main Menu' }]
  );
}

// --- Complaints ----------------------------------------------------------------

async function handleComplaintCategory(conv: Conv, input: string) {
  if (!input.startsWith('cat.')) {
    await send(conv.phone, 'Please choose a category:', CATEGORY_BUTTONS);
    return;
  }
  const category = input.slice(4);
  await setConv(conv.id, { state: 'COMPLAINT_DESC', context: { category } });
  await send(conv.phone, `Got it — *${category.toLowerCase()}*. Now please *describe the issue* in a message.`);
}

async function handleComplaintDesc(conv: Conv, input: string) {
  if (!input) {
    await send(conv.phone, 'Please describe the issue in a short message.');
    return;
  }
  const c = ctx(conv);
  const resident = await prisma.resident.findUnique({
    where: { id: conv.residentId! },
    include: { plots: true },
  });
  if (!resident) return;

  const count = await prisma.complaint.count();
  const ticketNo = `C-${1001 + count}`;
  const complaint = await prisma.complaint.create({
    data: {
      ticketNo,
      societyId: resident.societyId,
      residentId: resident.id,
      plotNumber: resident.plots[0]?.number,
      category: (c.category || 'OTHER') as any,
      description: input,
      source: 'WHATSAPP',
      updates: {
        create: { authorName: resident.name, note: 'Complaint submitted via WhatsApp.', statusTo: 'OPEN' },
      },
    },
  });
  await audit({
    societyId: resident.societyId,
    actorType: 'RESIDENT',
    actorId: resident.id,
    actorName: resident.name,
    action: 'COMPLAINT_CREATED',
    entity: 'Complaint',
    entityId: complaint.id,
    after: { ticketNo, category: complaint.category, description: input },
  });
  await setConv(conv.id, { state: 'MENU', context: {} });
  await send(
    conv.phone,
    `🎫 Complaint registered!\n\nTicket ID: *${ticketNo}*\nCategory: ${complaint.category}\nStatus: OPEN\n\nWe'll update you here as it progresses.`,
    [{ id: 'menu', label: '↩️ Main Menu' }]
  );
}

// --- Announcements ---------------------------------------------------------------

async function showAnnouncements(conv: Conv) {
  const resident = await prisma.resident.findUnique({
    where: { id: conv.residentId! },
    include: { plots: true },
  });
  if (!resident) return;
  const plotNumbers = resident.plots.map((p) => p.number);
  const announcements = await prisma.announcement.findMany({
    where: {
      societyId: resident.societyId,
      OR: [{ target: 'ALL' }, { target: 'PLOTS', plotNumbers: { hasSome: plotNumbers } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { acks: { where: { residentId: resident.id } } },
  });
  if (announcements.length === 0) {
    await send(conv.phone, 'No announcements right now. Type *menu* for more options.');
    return;
  }
  for (const a of announcements) {
    const acked = a.acks.length > 0;
    await send(
      conv.phone,
      `📢 *${a.title}*\n${a.body}\n_${a.createdAt.toDateString()}_${acked ? '\n\n✔️ Acknowledged' : ''}`,
      acked ? undefined : [{ id: `ack.${a.id}`, label: '👍 Acknowledge' }]
    );
  }
}

async function handleAnnouncementAck(conv: Conv, announcementId: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement || !conv.residentId) {
    await send(conv.phone, 'Sorry, that announcement no longer exists.');
    return;
  }
  await prisma.announcementAck.upsert({
    where: { announcementId_residentId: { announcementId, residentId: conv.residentId } },
    create: { announcementId, residentId: conv.residentId },
    update: {},
  });
  const resident = await prisma.resident.findUnique({ where: { id: conv.residentId } });
  await audit({
    societyId: announcement.societyId,
    actorType: 'RESIDENT',
    actorId: conv.residentId,
    actorName: resident?.name || 'Resident',
    action: 'ANNOUNCEMENT_ACKED',
    entity: 'Announcement',
    entityId: announcementId,
    after: { title: announcement.title },
  });
  await send(conv.phone, `✔️ Thanks! Your acknowledgment for *${announcement.title}* has been recorded.`);
}

// --- Human escalation --------------------------------------------------------------

async function escalate(conv: Conv) {
  await setConv(conv.id, { escalated: true });
  const resident = conv.residentId
    ? await prisma.resident.findUnique({ where: { id: conv.residentId } })
    : null;
  await audit({
    societyId: resident?.societyId,
    actorType: 'RESIDENT',
    actorId: conv.residentId,
    actorName: resident?.name || conv.phone,
    action: 'CONVERSATION_ESCALATED',
    entity: 'WaConversation',
    entityId: conv.id,
  });
  await send(
    conv.phone,
    '🙋 Your conversation has been flagged for the society admin. A committee member will reply to you here shortly.\n\nType *menu* anytime to continue using self-service.'
  );
}
