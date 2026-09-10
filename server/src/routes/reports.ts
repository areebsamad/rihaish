import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

router.get(
  '/summary',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const scope = societyId ? { plot: { societyId } } : {};
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [monthBills, overdue, openComplaints, todayStart] = [
      await prisma.bill.findMany({ where: { ...scope, month, year } }),
      await prisma.bill.aggregate({ where: { ...scope, status: 'OVERDUE' }, _sum: { amount: true } }),
      await prisma.complaint.count({
        where: { ...(societyId ? { societyId } : {}), status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      new Date(new Date().setHours(0, 0, 0, 0)),
    ];

    const billed = monthBills.reduce((s, b) => s + b.amount, 0);
    const collected = monthBills.filter((b) => b.status === 'PAID').reduce((s, b) => s + b.amount, 0);

    const visitorsToday = await prisma.visitor.count({
      where: {
        ...(societyId ? { societyId } : {}),
        OR: [{ expectedAt: { gte: todayStart } }, { pass: { entryAt: { gte: todayStart } } }],
      },
    });

    res.json({
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      collectedThisMonth: collected,
      billedThisMonth: billed,
      overdueAmount: overdue._sum.amount || 0,
      openComplaints,
      visitorsToday,
    });
  })
);

router.get(
  '/charts',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const scope = societyId ? { plot: { societyId } } : {};
    const now = new Date();

    // Last 6 months: billed vs collected.
    const collections: { month: string; billed: number; collected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bills = await prisma.bill.findMany({
        where: { ...scope, month: d.getMonth() + 1, year: d.getFullYear() },
      });
      collections.push({
        month: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        billed: bills.reduce((s, b) => s + b.amount, 0),
        collected: bills.filter((b) => b.status === 'PAID').reduce((s, b) => s + b.amount, 0),
      });
    }

    const complaintsByCategory = await prisma.complaint.groupBy({
      by: ['category'],
      where: societyId ? { societyId } : {},
      _count: true,
    });

    const billsByStatus = await prisma.bill.groupBy({
      by: ['status'],
      where: scope,
      _count: true,
    });

    res.json({
      collections,
      complaintsByCategory: complaintsByCategory.map((c) => ({ name: c.category, value: c._count })),
      billsByStatus: billsByStatus.map((b) => ({ name: b.status, value: b._count })),
    });
  })
);

export default router;
