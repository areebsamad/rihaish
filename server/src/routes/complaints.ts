import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';
import { notifyComplaintUpdate } from '../whatsapp/notifications';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const { status } = req.query as Record<string, string>;
    const complaints = await prisma.complaint.findMany({
      where: {
        ...(societyId ? { societyId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        resident: { select: { name: true, waPhone: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { updates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(complaints);
  })
);

router.get(
  '/staff',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const users = await prisma.user.findMany({
      where: { OR: [{ societyId }, { societyId: null }] },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        resident: { select: { name: true, phone: true, waPhone: true } },
        assignee: { select: { id: true, name: true } },
        updates: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    res.json(complaint);
  })
);

const createSchema = z.object({
  societyId: z.string().min(1),
  residentId: z.string().optional().nullable(),
  plotNumber: z.string().optional().nullable(),
  category: z.enum(['PLUMBING', 'ELECTRICITY', 'SECURITY', 'CLEANLINESS', 'NOISE', 'OTHER']),
  description: z.string().min(3),
});

router.post(
  '/',
  ah(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const count = await prisma.complaint.count();
    const complaint = await prisma.complaint.create({
      data: {
        ...parsed.data,
        ticketNo: `C-${1001 + count}`,
        source: 'ADMIN',
        updates: {
          create: { authorName: req.user!.name, note: 'Complaint created from dashboard.', statusTo: 'OPEN' },
        },
      },
    });
    await audit({
      societyId: complaint.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'COMPLAINT_CREATED',
      entity: 'Complaint',
      entityId: complaint.id,
      after: { ticketNo: complaint.ticketNo, category: complaint.category },
    });
    res.status(201).json(complaint);
  })
);

const patchSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  assigneeId: z.string().nullable().optional(),
});

router.patch(
  '/:id',
  ah(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const before = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Complaint not found' });

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { assignee: { select: { name: true } } },
    });

    if (parsed.data.status && parsed.data.status !== before.status) {
      await prisma.complaintUpdate.create({
        data: {
          complaintId: complaint.id,
          authorName: req.user!.name,
          note: `Status changed to ${parsed.data.status.replace('_', ' ')}.`,
          statusFrom: before.status,
          statusTo: parsed.data.status,
        },
      });
      // Push status change back to the resident on WhatsApp (if linked).
      await notifyComplaintUpdate(complaint.id, { statusFrom: before.status, statusTo: parsed.data.status });
    }
    if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== before.assigneeId) {
      await prisma.complaintUpdate.create({
        data: {
          complaintId: complaint.id,
          authorName: req.user!.name,
          note: complaint.assignee ? `Assigned to ${complaint.assignee.name}.` : 'Unassigned.',
        },
      });
    }
    await audit({
      societyId: complaint.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'COMPLAINT_UPDATED',
      entity: 'Complaint',
      entityId: complaint.id,
      before: { status: before.status, assigneeId: before.assigneeId },
      after: parsed.data,
    });
    res.json(complaint);
  })
);

router.post(
  '/:id/updates',
  ah(async (req, res) => {
    const note = (req.body?.note as string)?.trim();
    if (!note) return res.status(400).json({ error: 'Note is required' });
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const update = await prisma.complaintUpdate.create({
      data: { complaintId: complaint.id, authorName: req.user!.name, note },
    });
    await audit({
      societyId: complaint.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'COMPLAINT_COMMENTED',
      entity: 'Complaint',
      entityId: complaint.id,
      after: { note },
    });
    await notifyComplaintUpdate(complaint.id, { note });
    res.status(201).json(update);
  })
);

export default router;
