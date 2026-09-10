import { prisma } from './prisma';

interface AuditEntry {
  societyId?: string | null;
  actorType: 'USER' | 'RESIDENT' | 'SYSTEM';
  actorId?: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

// Every mutating action in the system goes through this helper.
export async function audit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        societyId: entry.societyId ?? null,
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before === undefined ? undefined : (entry.before as any),
        after: entry.after === undefined ? undefined : (entry.after as any),
      },
    });
  } catch (err) {
    // Audit failures should never break the main flow in the prototype.
    console.error('audit log failed', err);
  }
}
