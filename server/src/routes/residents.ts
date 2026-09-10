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
    const search = (req.query.search as string) || '';
    const residents = await prisma.resident.findMany({
      where: {
        ...(societyId ? { societyId } : {}),
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }
          : {}),
      },
      include: { plots: true, society: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(residents);
  })
);

const residentSchema = z.object({
  societyId: z.string().min(1),
  name: z.string().min(2),
  phone: z.string().min(7),
  cnicLast4: z.string().regex(/^\d{4}$/, 'CNIC last 4 must be exactly 4 digits'),
});

router.post(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = residentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const resident = await prisma.resident.create({ data: parsed.data });
    await audit({
      societyId: resident.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'RESIDENT_CREATED',
      entity: 'Resident',
      entityId: resident.id,
      after: { name: resident.name, phone: resident.phone },
    });
    res.status(201).json(resident);
  })
);

router.put(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const parsed = residentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const before = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Resident not found' });
    const resident = await prisma.resident.update({ where: { id: req.params.id }, data: parsed.data });
    await audit({
      societyId: resident.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'RESIDENT_UPDATED',
      entity: 'Resident',
      entityId: resident.id,
      before: { name: before.name, phone: before.phone },
      after: parsed.data,
    });
    res.json(resident);
  })
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const before = await prisma.resident.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Resident not found' });
    try {
      await prisma.$transaction([
        prisma.plot.updateMany({ where: { residentId: before.id }, data: { residentId: null } }),
        prisma.resident.delete({ where: { id: before.id } }),
      ]);
    } catch {
      return res.status(409).json({ error: 'Resident has related records and cannot be deleted in this prototype.' });
    }
    await audit({
      societyId: before.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'RESIDENT_DELETED',
      entity: 'Resident',
      entityId: before.id,
      before: { name: before.name },
    });
    res.json({ ok: true });
  })
);

export default router;
