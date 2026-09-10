import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const plots = await prisma.plot.findMany({
      where: societyId ? { societyId } : {},
      include: { resident: true, society: { select: { name: true } } },
      orderBy: { number: 'asc' },
    });
    res.json(plots);
  })
);

const plotSchema = z.object({
  societyId: z.string().min(1),
  number: z.string().min(1),
  block: z.string().optional().nullable(),
  type: z.enum(['HOUSE', 'FLAT', 'SHOP']).default('HOUSE'),
  residentId: z.string().optional().nullable(),
});

router.post(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = plotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const plot = await prisma.plot.create({ data: parsed.data });
    await audit({
      societyId: plot.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'PLOT_CREATED',
      entity: 'Plot',
      entityId: plot.id,
      after: parsed.data,
    });
    res.status(201).json(plot);
  })
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = plotSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const before = await prisma.plot.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Plot not found' });
    const plot = await prisma.plot.update({ where: { id: req.params.id }, data: parsed.data });
    await audit({
      societyId: plot.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'PLOT_UPDATED',
      entity: 'Plot',
      entityId: plot.id,
      before: { number: before.number, residentId: before.residentId, type: before.type },
      after: parsed.data,
    });
    res.json(plot);
  })
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const before = await prisma.plot.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Plot not found' });
    try {
      await prisma.plot.delete({ where: { id: req.params.id } });
    } catch {
      return res.status(409).json({ error: 'Plot has related bills/visitors and cannot be deleted in this prototype.' });
    }
    await audit({
      societyId: before.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'PLOT_DELETED',
      entity: 'Plot',
      entityId: before.id,
      before: { number: before.number },
    });
    res.json({ ok: true });
  })
);

export default router;
