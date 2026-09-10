import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';
import { sendBillReminder } from '../whatsapp/notifications';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const { status, month, year, plotId } = req.query as Record<string, string>;
    const bills = await prisma.bill.findMany({
      where: {
        ...(societyId ? { plot: { societyId } } : {}),
        ...(status ? { status: status as any } : {}),
        ...(month ? { month: Number(month) } : {}),
        ...(year ? { year: Number(year) } : {}),
        ...(plotId ? { plotId } : {}),
      },
      include: {
        plot: { include: { resident: { select: { name: true, waPhone: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { plot: { number: 'asc' } }],
    });
    res.json(bills);
  })
);

const generateSchema = z.object({
  societyId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  amount: z.number().int().positive(),
  description: z.string().default('Monthly maintenance'),
});

// Manual trigger: generate bills for every plot in a society for a given month.
router.post(
  '/generate',
  ah(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { societyId, month, year, amount, description } = parsed.data;

    const plots = await prisma.plot.findMany({ where: { societyId } });
    if (plots.length === 0) return res.status(400).json({ error: 'No plots in this society' });

    const dueDate = new Date(Date.UTC(year, month - 1, 10));
    const result = await prisma.bill.createMany({
      data: plots.map((p) => ({ plotId: p.id, month, year, amount, description, dueDate })),
      skipDuplicates: true, // idempotent per (plot, month, year)
    });
    await audit({
      societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'BILLS_GENERATED',
      entity: 'Bill',
      after: { month, year, amount, created: result.count },
    });
    res.json({ created: result.count, skipped: plots.length - result.count });
  })
);

// "Simulate monthly run": generates current-month bills for all plots and
// flips past-due unpaid bills to OVERDUE — what a cron job would do monthly.
router.post(
  '/run',
  ah(async (req, res) => {
    const societyId = (req.body?.societyId as string) || resolveSocietyId(req);
    if (!societyId) return res.status(400).json({ error: 'societyId is required' });
    const amount = Number(req.body?.amount) > 0 ? Number(req.body.amount) : 5000;

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const plots = await prisma.plot.findMany({ where: { societyId } });
    const created = await prisma.bill.createMany({
      data: plots.map((p) => ({
        plotId: p.id,
        month,
        year,
        amount,
        description: 'Monthly maintenance',
        dueDate: new Date(Date.UTC(year, month - 1, 10)),
      })),
      skipDuplicates: true,
    });
    const overdue = await prisma.bill.updateMany({
      where: { plot: { societyId }, status: 'PENDING', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });
    await audit({
      societyId,
      actorType: 'SYSTEM',
      actorName: 'Monthly billing run',
      action: 'MONTHLY_RUN',
      entity: 'Bill',
      after: { month, year, generated: created.count, markedOverdue: overdue.count },
    });
    res.json({ generated: created.count, markedOverdue: overdue.count });
  })
);

const paymentSchema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'MOCK_WALLET', 'EASYPAISA', 'JAZZCASH']).default('CASH'),
  reference: z.string().optional(),
});

// Record a manual/offline payment against a bill (admin/treasurer action).
router.post(
  '/:id/payments',
  ah(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id }, include: { plot: true } });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (bill.status === 'PAID') return res.status(409).json({ error: 'Bill is already paid' });

    const payment = await prisma.payment.create({
      data: {
        billId: bill.id,
        amount: parsed.data.amount,
        method: parsed.data.method,
        status: 'SUCCESS',
        reference: parsed.data.reference || `MANUAL-${Date.now()}`,
        paidAt: new Date(),
      },
    });
    await prisma.bill.update({ where: { id: bill.id }, data: { status: 'PAID' } });
    await audit({
      societyId: bill.plot.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'PAYMENT_RECORDED',
      entity: 'Bill',
      entityId: bill.id,
      before: { status: bill.status },
      after: { status: 'PAID', amount: payment.amount, method: payment.method },
    });
    res.status(201).json(payment);
  })
);

// Trigger a WhatsApp bill reminder (goes through the provider; mocked in prototype).
router.post(
  '/:id/remind',
  ah(async (req, res) => {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id }, include: { plot: true } });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const sent = await sendBillReminder(bill.id);
    if (!sent) {
      return res.status(400).json({ error: 'Resident has no linked WhatsApp number' });
    }
    await audit({
      societyId: bill.plot.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'BILL_REMINDER_SENT',
      entity: 'Bill',
      entityId: bill.id,
      after: { month: bill.month, year: bill.year, amount: bill.amount },
    });
    res.json({ ok: true });
  })
);

export default router;
