import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleInbound } from '../whatsapp/flowEngine';
import { getWhatsAppProvider } from '../integrations/whatsapp';

const router = Router();

// ---------------------------------------------------------------------------
// Webhook (public) — the simulator posts the SAME normalized shape that a
// Meta-webhook adapter would produce, so swapping in the real API later only
// requires translating Meta's payload into this event, not new flow logic.
// ---------------------------------------------------------------------------

const inboundSchema = z.object({
  from: z.string().min(7),
  type: z.enum(['text', 'button']),
  text: z.string().optional(),
  buttonId: z.string().optional(),
});

router.post(
  '/webhook',
  ah(async (req, res) => {
    const parsed = inboundSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid webhook payload' });
    await handleInbound(parsed.data);
    res.json({ ok: true });
  })
);

// Meta webhook verification handshake (used only when WHATSAPP_PROVIDER=meta).
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return res.send(challenge);
  }
  res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// Simulator endpoints (public — prototype only)
// ---------------------------------------------------------------------------

router.get(
  '/messages',
  ah(async (req, res) => {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    const conversation = await prisma.waConversation.findUnique({
      where: { phone },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 100 },
      },
    });
    if (!conversation) return res.json({ conversation: null, messages: [] });
    const resident = conversation.residentId
      ? await prisma.resident.findUnique({
          where: { id: conversation.residentId },
          select: { name: true, plots: { select: { number: true } } },
        })
      : null;
    res.json({
      conversation: {
        id: conversation.id,
        phone: conversation.phone,
        state: conversation.state,
        escalated: conversation.escalated,
        resident,
      },
      messages: conversation.messages,
    });
  })
);

// Demo helper so the simulator page can show which seeded residents to try.
// PROTOTYPE ONLY — remove before anything real.
router.get(
  '/demo-residents',
  ah(async (_req, res) => {
    const residents = await prisma.resident.findMany({
      take: 4,
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        phone: true,
        cnicLast4: true,
        waPhone: true,
        plots: { select: { number: true } },
        society: { select: { name: true } },
      },
    });
    res.json(residents);
  })
);

// ---------------------------------------------------------------------------
// Admin inbox (auth) — escalated conversations + manual replies
// ---------------------------------------------------------------------------

router.get(
  '/conversations',
  requireAuth,
  requireRole('ADMIN', 'TREASURER'),
  ah(async (_req, res) => {
    const conversations = await prisma.waConversation.findMany({
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ escalated: 'desc' }, { updatedAt: 'desc' }],
    });
    const withResidents = await Promise.all(
      conversations.map(async (c) => ({
        id: c.id,
        phone: c.phone,
        state: c.state,
        escalated: c.escalated,
        updatedAt: c.updatedAt,
        lastMessage: c.messages[0] || null,
        resident: c.residentId
          ? await prisma.resident.findUnique({
              where: { id: c.residentId },
              select: { name: true, plots: { select: { number: true } } },
            })
          : null,
      }))
    );
    res.json(withResidents);
  })
);

router.get(
  '/conversations/:id',
  requireAuth,
  requireRole('ADMIN', 'TREASURER'),
  ah(async (req, res) => {
    const conversation = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  })
);

router.post(
  '/conversations/:id/reply',
  requireAuth,
  requireRole('ADMIN', 'TREASURER'),
  ah(async (req, res) => {
    const text = (req.body?.text as string)?.trim();
    if (!text) return res.status(400).json({ error: 'Reply text is required' });
    const conversation = await prisma.waConversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await getWhatsAppProvider().sendMessage({
      to: conversation.phone,
      text: `👤 *${req.user!.name} (Committee)*:\n${text}`,
    });
    await audit({
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'WHATSAPP_ADMIN_REPLY',
      entity: 'WaConversation',
      entityId: conversation.id,
      after: { text },
    });
    res.json({ ok: true });
  })
);

router.post(
  '/conversations/:id/resolve',
  requireAuth,
  requireRole('ADMIN', 'TREASURER'),
  ah(async (req, res) => {
    const conversation = await prisma.waConversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    await prisma.waConversation.update({ where: { id: conversation.id }, data: { escalated: false } });
    await audit({
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'ESCALATION_RESOLVED',
      entity: 'WaConversation',
      entityId: conversation.id,
    });
    res.json({ ok: true });
  })
);

export default router;
