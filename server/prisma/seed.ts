import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

const prisma = new PrismaClient();

// Demo WhatsApp numbers (also shown on the simulator page / README):
//   923001112222 -> Ahmed Raza (pre-linked, plot A-101)
//   any new number -> registration flow (e.g. plot B-201, CNIC 4455)
const LINKED_PHONE = '923001112222';

function qr(code: string) {
  return QRCode.toDataURL(code, { width: 320, margin: 2 });
}

async function main() {
  // In Docker the seed runs on every container start; don't wipe existing
  // demo state on a restart. `npm run seed` (no flag) still force-reseeds.
  if (process.env.SEED_IF_EMPTY === '1' && (await prisma.society.count()) > 0) {
    console.log('Database already has data — skipping seed.');
    return;
  }
  console.log('Seeding database...');

  // Wipe in FK-safe order so the seed is re-runnable.
  await prisma.$transaction([
    prisma.waMessage.deleteMany(),
    prisma.waConversation.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.announcementAck.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.complaintUpdate.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.visitorPass.deleteMany(),
    prisma.visitor.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bill.deleteMany(),
    prisma.document.deleteMany(),
    prisma.plot.deleteMany(),
    prisma.resident.deleteMany(),
    prisma.user.deleteMany(),
    prisma.society.deleteMany(),
  ]);

  const society1 = await prisma.society.create({
    data: {
      name: 'Gulshan Green Valley',
      city: 'Karachi',
      address: 'Main University Road, Gulshan-e-Iqbal, Karachi',
    },
  });
  const society2 = await prisma.society.create({
    data: {
      name: 'Model Town Residency',
      city: 'Lahore',
      address: 'Block C, Model Town, Lahore',
    },
  });

  // --- Users (demo credentials in README) ---
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  await prisma.user.createMany({
    data: [
      { email: 'admin@demo.pk', passwordHash: hash('admin123'), name: 'Super Admin', role: 'ADMIN', societyId: null },
      { email: 'treasurer@demo.pk', passwordHash: hash('treasurer123'), name: 'Tariq Mehmood (Treasurer)', role: 'TREASURER', societyId: society1.id },
      { email: 'guard@demo.pk', passwordHash: hash('guard123'), name: 'Bashir Khan (Guard)', role: 'GUARD', societyId: society1.id },
    ],
  });
  const guard = await prisma.user.findUniqueOrThrow({ where: { email: 'guard@demo.pk' } });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@demo.pk' } });

  // --- Residents + plots ---
  const soc1Residents = [
    { name: 'Ahmed Raza', phone: '923001112222', cnicLast4: '1234', plot: 'A-101', block: 'A' },
    { name: 'Fatima Siddiqui', phone: '923011234501', cnicLast4: '4455', plot: 'B-201', block: 'B' },
    { name: 'Muhammad Imran', phone: '923011234502', cnicLast4: '7810', plot: 'A-102', block: 'A' },
    { name: 'Ayesha Khan', phone: '923011234503', cnicLast4: '3321', plot: 'A-103', block: 'A' },
    { name: 'Bilal Ashraf', phone: '923011234504', cnicLast4: '9902', plot: 'A-104', block: 'A' },
    { name: 'Sana Javed', phone: '923011234505', cnicLast4: '2178', plot: 'A-105', block: 'A' },
    { name: 'Usman Ghani', phone: '923011234506', cnicLast4: '6543', plot: 'A-106', block: 'A' },
    { name: 'Nadia Hussain', phone: '923011234507', cnicLast4: '8890', plot: 'B-202', block: 'B' },
    { name: 'Kamran Akmal', phone: '923011234508', cnicLast4: '1029', plot: 'B-203', block: 'B' },
    { name: 'Zainab Qureshi', phone: '923011234509', cnicLast4: '5566', plot: 'B-204', block: 'B' },
    { name: 'Hassan Ali', phone: '923011234510', cnicLast4: '7788', plot: 'B-205', block: 'B' },
    { name: 'Mariam Nawaz', phone: '923011234511', cnicLast4: '2340', plot: 'B-206', block: 'B' },
  ];
  const soc2Residents = [
    { name: 'Shahid Afridi', phone: '923021234501', cnicLast4: '1122', plot: 'H-1' },
    { name: 'Rabia Basri', phone: '923021234502', cnicLast4: '3344', plot: 'H-2' },
    { name: 'Faisal Qureshi', phone: '923021234503', cnicLast4: '5567', plot: 'H-3' },
    { name: 'Hina Dilpazeer', phone: '923021234504', cnicLast4: '7789', plot: 'H-4' },
    { name: 'Adnan Sami', phone: '923021234505', cnicLast4: '9911', plot: 'H-5' },
    { name: 'Bushra Ansari', phone: '923021234506', cnicLast4: '2233', plot: 'H-6' },
    { name: 'Javed Sheikh', phone: '923021234507', cnicLast4: '4456', plot: 'H-7' },
    { name: 'Samina Peerzada', phone: '923021234508', cnicLast4: '6678', plot: 'H-8' },
  ];

  const plotByNumber: Record<string, { id: string; residentId: string; societyId: string }> = {};
  for (const [society, list] of [
    [society1, soc1Residents],
    [society2, soc2Residents],
  ] as const) {
    for (const r of list) {
      const resident = await prisma.resident.create({
        data: {
          societyId: society.id,
          name: r.name,
          phone: r.phone,
          cnicLast4: r.cnicLast4,
          waPhone: r.phone === LINKED_PHONE ? LINKED_PHONE : null,
        },
      });
      const plot = await prisma.plot.create({
        data: {
          societyId: society.id,
          number: r.plot,
          block: (r as any).block ?? null,
          type: society.id === society2.id ? 'HOUSE' : r.plot.startsWith('B') ? 'FLAT' : 'HOUSE',
          residentId: resident.id,
        },
      });
      plotByNumber[r.plot] = { id: plot.id, residentId: resident.id, societyId: society.id };
    }
  }

  // Pre-linked WhatsApp conversation for Ahmed Raza so the simulator works instantly.
  const ahmed = await prisma.resident.findFirstOrThrow({ where: { waPhone: LINKED_PHONE } });
  await prisma.waConversation.create({
    data: {
      phone: LINKED_PHONE,
      residentId: ahmed.id,
      state: 'MENU',
      messages: {
        create: [
          {
            direction: 'OUTBOUND',
            type: 'text',
            body: '✅ Your WhatsApp number is linked to plot A-101 (Gulshan Green Valley). Type *menu* to get started.',
          },
        ],
      },
    },
  });

  // --- Bills: last 3 months for every plot ---
  const now = new Date();
  const months: { month: number; year: number; offset: number }[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: d.getMonth() + 1, year: d.getFullYear(), offset: i });
  }

  let billIdx = 0;
  for (const [plotNumber, plot] of Object.entries(plotByNumber)) {
    const amount = plot.societyId === society1.id ? 5000 : 3500;
    for (const m of months) {
      billIdx++;
      const isCurrentMonth = m.offset === 0;
      // Older months mostly PAID; sprinkle some OVERDUE. Current month mostly PENDING.
      let status: 'PENDING' | 'PAID' | 'OVERDUE';
      if (isCurrentMonth) status = billIdx % 4 === 0 ? 'PAID' : 'PENDING';
      else status = billIdx % 5 === 0 ? 'OVERDUE' : 'PAID';

      const bill = await prisma.bill.create({
        data: {
          plotId: plot.id,
          month: m.month,
          year: m.year,
          amount,
          description: 'Monthly maintenance',
          dueDate: new Date(Date.UTC(m.year, m.month - 1, 10)),
          status,
        },
      });
      if (status === 'PAID') {
        await prisma.payment.create({
          data: {
            billId: bill.id,
            amount,
            method: billIdx % 3 === 0 ? 'MOCK_WALLET' : billIdx % 3 === 1 ? 'CASH' : 'BANK_TRANSFER',
            status: 'SUCCESS',
            reference: `SEED-${bill.id.slice(-6).toUpperCase()}`,
            paidAt: new Date(Date.UTC(m.year, m.month - 1, 8)),
          },
        });
      }
    }
    void plotNumber;
  }

  // --- Visitors + passes (society 1) ---
  const mkExpiry = (d: Date) => new Date(d.getTime() + 24 * 3600 * 1000);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);

  const visitorSpecs = [
    { plot: 'A-101', name: 'Kashif Electrician', status: 'PENDING' as const, expectedAt: tomorrow, via: 'WHATSAPP' },
    { plot: 'B-201', name: 'Saima (Guest)', status: 'APPROVED' as const, expectedAt: today, via: 'ADMIN' },
    { plot: 'A-103', name: 'Foodpanda Rider', status: 'USED' as const, expectedAt: today, via: 'ADMIN' },
    { plot: 'B-204', name: 'Salesman Irfan', status: 'REJECTED' as const, expectedAt: today, via: 'WHATSAPP' },
  ];
  const codes = ['GP-SEED01', 'GP-SEED02', 'GP-SEED03', 'GP-SEED04'];
  for (let i = 0; i < visitorSpecs.length; i++) {
    const v = visitorSpecs[i];
    const plot = plotByNumber[v.plot];
    await prisma.visitor.create({
      data: {
        societyId: plot.societyId,
        plotId: plot.id,
        residentId: plot.residentId,
        name: v.name,
        expectedAt: v.expectedAt,
        createdVia: v.via,
        pass: {
          create: {
            code: codes[i],
            qrDataUrl: await qr(codes[i]),
            status: v.status,
            approvedById: v.status === 'PENDING' ? null : admin.id,
            expiresAt: mkExpiry(v.expectedAt),
            entryAt: v.status === 'USED' ? new Date(Date.now() - 2 * 3600 * 1000) : null,
          },
        },
      },
    });
  }

  // --- Complaints ---
  const complaintSpecs = [
    { plot: 'A-102', category: 'PLUMBING', desc: 'Water leakage from the overhead tank into the stairwell.', status: 'OPEN', via: 'WHATSAPP' },
    { plot: 'B-202', category: 'ELECTRICITY', desc: 'Street light outside B-202 has been out for a week.', status: 'IN_PROGRESS', via: 'WHATSAPP' },
    { plot: 'A-105', category: 'CLEANLINESS', desc: 'Garbage not collected from Block A for 3 days.', status: 'IN_PROGRESS', via: 'ADMIN' },
    { plot: 'B-205', category: 'SECURITY', desc: 'Main gate camera appears to be offline at night.', status: 'RESOLVED', via: 'WHATSAPP' },
    { plot: 'A-104', category: 'NOISE', desc: 'Construction noise before 8am on weekends.', status: 'CLOSED', via: 'ADMIN' },
    { plot: 'H-2', category: 'PLUMBING', desc: 'Low water pressure in the entire H block.', status: 'OPEN', via: 'ADMIN' },
  ];
  for (let i = 0; i < complaintSpecs.length; i++) {
    const c = complaintSpecs[i];
    const plot = plotByNumber[c.plot];
    const resident = await prisma.resident.findUnique({ where: { id: plot.residentId } });
    await prisma.complaint.create({
      data: {
        ticketNo: `C-${1001 + i}`,
        societyId: plot.societyId,
        residentId: plot.residentId,
        plotNumber: c.plot,
        category: c.category as any,
        description: c.desc,
        status: c.status as any,
        source: c.via,
        assigneeId: c.status === 'IN_PROGRESS' ? guard.id : null,
        updates: {
          create: [
            { authorName: resident?.name || 'Resident', note: `Complaint submitted via ${c.via === 'WHATSAPP' ? 'WhatsApp' : 'dashboard'}.`, statusTo: 'OPEN' },
            ...(c.status !== 'OPEN'
              ? [{ authorName: 'Super Admin', note: 'Work started.', statusFrom: 'OPEN' as any, statusTo: 'IN_PROGRESS' as any }]
              : []),
            ...(c.status === 'RESOLVED' || c.status === 'CLOSED'
              ? [{ authorName: 'Super Admin', note: 'Issue fixed and verified.', statusFrom: 'IN_PROGRESS' as any, statusTo: 'RESOLVED' as any }]
              : []),
          ],
        },
      },
    });
  }

  // --- Announcements ---
  const a1 = await prisma.announcement.create({
    data: {
      societyId: society1.id,
      title: 'Water supply maintenance',
      body: 'Water supply will be suspended on Sunday 10am-2pm for tank cleaning. Please store water accordingly.',
      target: 'ALL',
      createdById: admin.id,
    },
  });
  await prisma.announcement.create({
    data: {
      societyId: society1.id,
      title: 'Block B parking repainting',
      body: 'Block B parking lines will be repainted on Saturday. Please park in the visitor area.',
      target: 'PLOTS',
      plotNumbers: ['B-201', 'B-202', 'B-203', 'B-204', 'B-205', 'B-206'],
      createdById: admin.id,
    },
  });
  await prisma.announcementAck.create({ data: { announcementId: a1.id, residentId: ahmed.id } });

  // --- Sample document ---
  const uploadDir = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const seedDocName = 'seed-society-bylaws.txt';
  fs.writeFileSync(
    path.join(uploadDir, seedDocName),
    'GULSHAN GREEN VALLEY — SOCIETY BY-LAWS (DEMO DOCUMENT)\n\n1. Monthly maintenance is due by the 10th.\n2. Visitors must carry a valid gate pass.\n3. Quiet hours: 10pm - 7am.\n'
  );
  await prisma.document.create({
    data: {
      societyId: society1.id,
      title: 'Society By-Laws 2026',
      filename: seedDocName,
      originalName: 'society-bylaws.txt',
      mimeType: 'text/plain',
      size: fs.statSync(path.join(uploadDir, seedDocName)).size,
      uploadedById: admin.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorName: 'Seed script',
      action: 'DATABASE_SEEDED',
      entity: 'System',
      after: { societies: 2, residents: 20, note: 'Demo data loaded' },
    },
  });

  console.log('Seed complete.');
  console.log('  Logins: admin@demo.pk/admin123, treasurer@demo.pk/treasurer123, guard@demo.pk/guard123');
  console.log(`  Linked WhatsApp demo number: ${LINKED_PHONE} (Ahmed Raza, plot A-101)`);
  console.log('  Registration demo: any new number -> plot B-201, CNIC last-4 4455 (Fatima Siddiqui)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
