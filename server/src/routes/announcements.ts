import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';
import { broadcastAnnouncement } from '../whatsapp/notifications';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const announcements = await prisma.announcement.findMany({
      where: societyId ? { societyId } : {},
      include: { _count: { select: { acks: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Attach how many residents each announcement targeted, for ack-rate stats.
    const result = await Promise.all(
      announcements.map(async (a) => {
        const targeted = await prisma.resident.count({
          where: {
            societyId: a.societyId,
            ...(a.target === 'PLOTS' ? { plots: { some: { number: { in: a.plotNumbers } } } } : {}),
          },
        });
        return { ...a, targeted };
      })
    );
    res.json(result);
  })
);

const createSchema = z.object({
  societyId: z.string().min(1),
  title: z.string().min(2),
  body: z.string().min(2),
  target: z.enum(['ALL', 'PLOTS']).default('ALL'),
  plotNumbers: z.array(z.string()).default([]),
});

router.post(
  '/',
  ah(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    if (parsed.data.target === 'PLOTS' && parsed.data.plotNumbers.length === 0) {
      return res.status(400).json({ error: 'Select at least one plot for a targeted announcement' });
    }
    const announcement = await prisma.announcement.create({
      data: { ...parsed.data, createdById: req.user!.id },
    });
    // Broadcast to WhatsApp-linked residents via the provider (mock -> simulator).
    const sent = await broadcastAnnouncement(announcement.id);
    await audit({
      societyId: announcement.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'ANNOUNCEMENT_BROADCAST',
      entity: 'Announcement',
      entityId: announcement.id,
      after: { title: announcement.title, target: announcement.target, whatsappSent: sent },
    });
    res.status(201).json({ ...announcement, whatsappSent: sent });
  })
);

router.get(
  '/:id/acks',
  ah(async (req, res) => {
    const acks = await prisma.announcementAck.findMany({
      where: { announcementId: req.params.id },
      include: { resident: { select: { name: true, plots: { select: { number: true } } } } },
      orderBy: { ackAt: 'desc' },
    });
    res.json(acks);
  })
);

export default router;
