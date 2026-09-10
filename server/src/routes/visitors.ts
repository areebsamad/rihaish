import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';
import { generatePassCode, generateQrDataUrl } from '../integrations/qrcode';
import { notifyVisitorDecision } from '../whatsapp/notifications';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const { status, date, search } = req.query as Record<string, string>;
    const dayStart = date ? new Date(`${date}T00:00:00`) : null;
    const dayEnd = date ? new Date(`${date}T23:59:59.999`) : null;
    const visitors = await prisma.visitor.findMany({
      where: {
        ...(societyId ? { societyId } : {}),
        ...(status ? { pass: { status: status as any } } : {}),
        ...(dayStart && dayEnd ? { expectedAt: { gte: dayStart, lte: dayEnd } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { plot: { number: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { plot: true, resident: { select: { name: true } }, pass: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(visitors);
  })
);

const visitorSchema = z.object({
  plotId: z.string().min(1),
  name: z.string().min(2),
  phone: z.string().optional(),
  purpose: z.string().optional(),
  expectedAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date'),
});

// Admin-created visitor: approved immediately (front desk use-case).
router.post(
  '/',
  ah(async (req, res) => {
    const parsed = visitorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const plot = await prisma.plot.findUnique({ where: { id: parsed.data.plotId } });
    if (!plot) return res.status(404).json({ error: 'Plot not found' });

    const expectedAt = new Date(parsed.data.expectedAt);
    const code = generatePassCode();
    const visitor = await prisma.visitor.create({
      data: {
        societyId: plot.societyId,
        plotId: plot.id,
        residentId: plot.residentId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        purpose: parsed.data.purpose,
        expectedAt,
        createdVia: 'ADMIN',
        pass: {
          create: {
            code,
            qrDataUrl: await generateQrDataUrl(code),
            status: 'APPROVED',
            approvedById: req.user!.id,
            expiresAt: new Date(expectedAt.getTime() + 24 * 3600 * 1000),
          },
        },
      },
      include: { pass: true, plot: true },
    });
    await audit({
      societyId: plot.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'VISITOR_CREATED',
      entity: 'Visitor',
      entityId: visitor.id,
      after: { name: visitor.name, plot: plot.number, passCode: code },
    });
    await notifyVisitorDecision(visitor.id, true);
    res.status(201).json(visitor);
  })
);

async function decide(req: any, res: any, approve: boolean) {
  const visitor = await prisma.visitor.findUnique({
    where: { id: req.params.id },
    include: { pass: true, plot: true },
  });
  if (!visitor?.pass) return res.status(404).json({ error: 'Visitor request not found' });
  if (visitor.pass.status !== 'PENDING') {
    return res.status(409).json({ error: `Pass is already ${visitor.pass.status}` });
  }
  const updated = await prisma.visitorPass.update({
    where: { id: visitor.pass.id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: req.user!.id },
  });
  await audit({
    societyId: visitor.societyId,
    actorType: 'USER',
    actorId: req.user!.id,
    actorName: req.user!.name,
    action: approve ? 'VISITOR_APPROVED' : 'VISITOR_REJECTED',
    entity: 'VisitorPass',
    entityId: updated.id,
    before: { status: 'PENDING' },
    after: { status: updated.status, visitor: visitor.name, plot: visitor.plot.number },
  });
  // Push the QR pass (or rejection notice) back to the resident on WhatsApp.
  await notifyVisitorDecision(visitor.id, approve);
  res.json(updated);
}

router.post('/:id/approve', ah(async (req, res) => decide(req, res, true)));
router.post('/:id/reject', ah(async (req, res) => decide(req, res, false)));

export default router;
