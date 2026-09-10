import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('GUARD', 'ADMIN'));

// Look up a pass by scanned/typed code.
router.get(
  '/pass/:code',
  ah(async (req, res) => {
    const pass = await prisma.visitorPass.findUnique({
      where: { code: req.params.code.toUpperCase().trim() },
      include: { visitor: { include: { plot: true, resident: { select: { name: true } } } } },
    });
    if (!pass) return res.status(404).json({ error: 'No pass found for this code' });

    // Lazy-expire approved passes that are past their validity.
    if (pass.status === 'APPROVED' && pass.expiresAt < new Date()) {
      const expired = await prisma.visitorPass.update({
        where: { id: pass.id },
        data: { status: 'EXPIRED' },
      });
      return res.json({ ...pass, status: expired.status });
    }
    res.json(pass);
  })
);

router.post(
  '/pass/:code/entry',
  ah(async (req, res) => {
    const pass = await prisma.visitorPass.findUnique({
      where: { code: req.params.code.toUpperCase().trim() },
      include: { visitor: { include: { plot: true } } },
    });
    if (!pass) return res.status(404).json({ error: 'No pass found for this code' });
    if (pass.status !== 'APPROVED') {
      return res.status(409).json({ error: `Cannot log entry — pass status is ${pass.status}` });
    }
    const updated = await prisma.visitorPass.update({
      where: { id: pass.id },
      data: { status: 'USED', entryAt: new Date() },
    });
    await audit({
      societyId: pass.visitor.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'VISITOR_ENTRY_LOGGED',
      entity: 'VisitorPass',
      entityId: pass.id,
      before: { status: pass.status },
      after: { status: 'USED', visitor: pass.visitor.name, plot: pass.visitor.plot.number },
    });
    res.json(updated);
  })
);

router.post(
  '/pass/:code/exit',
  ah(async (req, res) => {
    const pass = await prisma.visitorPass.findUnique({
      where: { code: req.params.code.toUpperCase().trim() },
      include: { visitor: { include: { plot: true } } },
    });
    if (!pass) return res.status(404).json({ error: 'No pass found for this code' });
    if (!pass.entryAt) return res.status(409).json({ error: 'No entry has been logged for this pass yet' });
    if (pass.exitAt) return res.status(409).json({ error: 'Exit already logged' });
    const updated = await prisma.visitorPass.update({
      where: { id: pass.id },
      data: { exitAt: new Date() },
    });
    await audit({
      societyId: pass.visitor.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'VISITOR_EXIT_LOGGED',
      entity: 'VisitorPass',
      entityId: pass.id,
      after: { visitor: pass.visitor.name, plot: pass.visitor.plot.number },
    });
    res.json(updated);
  })
);

// Today's gate activity.
router.get(
  '/log',
  ah(async (req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const passes = await prisma.visitorPass.findMany({
      where: {
        OR: [{ entryAt: { gte: start } }, { exitAt: { gte: start } }],
        ...(req.user!.societyId ? { visitor: { societyId: req.user!.societyId } } : {}),
      },
      include: { visitor: { include: { plot: true } } },
      orderBy: { entryAt: 'desc' },
    });
    res.json(passes);
  })
);

export default router;
