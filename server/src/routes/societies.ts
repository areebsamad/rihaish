import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  ah(async (req, res) => {
    const where = req.user!.societyId ? { id: req.user!.societyId } : {};
    const societies = await prisma.society.findMany({
      where,
      include: { _count: { select: { plots: true, residents: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(societies);
  })
);

const societySchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  address: z.string().min(2),
});

router.post(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = societySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const society = await prisma.society.create({ data: parsed.data });
    await audit({
      societyId: society.id,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'SOCIETY_CREATED',
      entity: 'Society',
      entityId: society.id,
      after: parsed.data,
    });
    res.status(201).json(society);
  })
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = societySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const before = await prisma.society.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Society not found' });
    const society = await prisma.society.update({ where: { id: req.params.id }, data: parsed.data });
    await audit({
      societyId: society.id,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'SOCIETY_UPDATED',
      entity: 'Society',
      entityId: society.id,
      before: { name: before.name, city: before.city, address: before.address },
      after: parsed.data,
    });
    res.json(society);
  })
);

export default router;
