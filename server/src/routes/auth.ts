import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { requireAuth, signToken } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post(
  '/login',
  ah(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      societyId: user.societyId,
    };
    res.json({ token: signToken(payload), user: payload });
  })
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
