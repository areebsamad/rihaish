import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const { entity, action, q } = req.query as Record<string, string>;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25);

    const where = {
      ...(societyId ? { societyId } : {}),
      ...(entity ? { entity } : {}),
      ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
      ...(q
        ? {
            OR: [
              { actorName: { contains: q, mode: 'insensitive' as const } },
              { action: { contains: q, mode: 'insensitive' as const } },
              { entity: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ total, page, pageSize, logs });
  })
);

export default router;
