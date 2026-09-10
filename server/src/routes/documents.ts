import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { audit } from '../lib/audit';
import { requireAuth, requireRole, resolveSocietyId } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'TREASURER'));

// Local-disk storage for the prototype.
// S3 SWAP-IN POINT: replace this multer storage with multer-s3 (or presigned
// uploads) and store the S3 key in Document.filename — the rest of the code
// only reads/writes Document rows and streams by filename.
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.get(
  '/',
  ah(async (req, res) => {
    const societyId = resolveSocietyId(req);
    const docs = await prisma.document.findMany({
      where: societyId ? { societyId } : {},
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  })
);

router.post(
  '/',
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A file is required (field name: file)' });
    const societyId = (req.body?.societyId as string) || resolveSocietyId(req);
    if (!societyId) return res.status(400).json({ error: 'societyId is required' });
    const title = (req.body?.title as string)?.trim() || req.file.originalname;

    const doc = await prisma.document.create({
      data: {
        societyId,
        title,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user!.id,
      },
    });
    await audit({
      societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'DOCUMENT_UPLOADED',
      entity: 'Document',
      entityId: doc.id,
      after: { title: doc.title, size: doc.size },
    });
    res.status(201).json(doc);
  })
);

router.get(
  '/:id/download',
  ah(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(UPLOAD_DIR, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'File missing from disk' });
    res.download(filePath, doc.originalName);
  })
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await prisma.document.delete({ where: { id: doc.id } });
    fs.rm(path.join(UPLOAD_DIR, doc.filename), () => {});
    await audit({
      societyId: doc.societyId,
      actorType: 'USER',
      actorId: req.user!.id,
      actorName: req.user!.name,
      action: 'DOCUMENT_DELETED',
      entity: 'Document',
      entityId: doc.id,
      before: { title: doc.title },
    });
    res.json({ ok: true });
  })
);

export default router;
