import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Modal, Badge } from '../components/ui';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const NEXT: Record<string, string | null> = { OPEN: 'IN_PROGRESS', IN_PROGRESS: 'RESOLVED', RESOLVED: 'CLOSED', CLOSED: null };
const PREV: Record<string, string | null> = { OPEN: null, IN_PROGRESS: 'OPEN', RESOLVED: 'IN_PROGRESS', CLOSED: 'RESOLVED' };
const COL_COLORS: Record<string, string> = {
  OPEN: 'border-red-400',
  IN_PROGRESS: 'border-amber-400',
  RESOLVED: 'border-emerald-400',
  CLOSED: 'border-slate-300',
};

export default function Complaints() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [complaints, setComplaints] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [note, setNote] = useState('');

  const load = () => {
    if (!societyId) return;
    api.get('/complaints', { params: { societyId } }).then((r) => setComplaints(r.data));
  };
  useEffect(load, [societyId]);
  useEffect(() => {
    if (societyId) api.get('/complaints/staff', { params: { societyId } }).then((r) => setStaff(r.data));
  }, [societyId]);

  const openDetail = async (id: string) => {
    const { data } = await api.get(`/complaints/${id}`);
    setDetail(data);
  };

  const patch = async (id: string, body: any) => {
    try {
      await api.patch(`/complaints/${id}`, body);
      load();
      if (detail?.id === id) openDetail(id);
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      await api.post(`/complaints/${detail.id}/updates`, { note });
      setNote('');
      openDetail(detail.id);
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const colLabel: Record<string, string> = {
    OPEN: t('complaints.open'),
    IN_PROGRESS: t('complaints.inProgress'),
    RESOLVED: t('complaints.resolved'),
    CLOSED: t('complaints.closed'),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => {
          const items = complaints.filter((c) => c.status === s);
          return (
            <div key={s} className={`rounded-xl border-t-4 ${COL_COLORS[s]} bg-slate-50 p-3`}>
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600">{colLabel[s]}</h3>
                <span className="rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-600">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <div key={c.id} className="cursor-pointer rounded-lg bg-white p-3 shadow-sm hover:shadow" onClick={() => openDetail(c.id)}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-500">{c.ticketNo}</span>
                      <Badge value={c.source} />
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-800 line-clamp-2">{c.description}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{c.category} · {c.plotNumber || '—'}</span>
                      <span>{c.assignee ? `👤 ${c.assignee.name.split(' ')[0]}` : ''}</span>
                    </div>
                    <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {PREV[s] && (
                        <button className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200" onClick={() => patch(c.id, { status: PREV[s] })}>
                          ← {colLabel[PREV[s]!]}
                        </button>
                      )}
                      {NEXT[s] && (
                        <button className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-200" onClick={() => patch(c.id, { status: NEXT[s] })}>
                          {colLabel[NEXT[s]!]} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <Modal title={`${detail.ticketNo} — ${detail.category}`} onClose={() => setDetail(null)} wide>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge value={detail.status} />
                <Badge value={detail.source} />
              </div>
              <p className="text-sm text-slate-700">{detail.description}</p>
              <div className="mt-3 space-y-1 text-sm text-slate-500">
                <div>{t('common.resident')}: {detail.resident?.name || '—'} {detail.resident?.waPhone ? '(WhatsApp linked ✓)' : ''}</div>
                <div>{t('common.plot')}: {detail.plotNumber || '—'}</div>
                <div>{t('common.date')}: {new Date(detail.createdAt).toLocaleString()}</div>
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-600">{t('complaints.assign')}</label>
                <select
                  className="input"
                  value={detail.assignee?.id || ''}
                  onChange={(e) => patch(detail.id, { assigneeId: e.target.value || null })}
                >
                  <option value="">— unassigned —</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Timeline</h4>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {detail.updates.map((u: any) => (
                  <div key={u.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span className="font-medium text-slate-600">{u.authorName}</span>
                      <span>{new Date(u.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-slate-700">{u.note}</div>
                    {u.statusTo && <div className="mt-1 text-xs">{u.statusFrom ? `${u.statusFrom} → ` : ''}<Badge value={u.statusTo} /></div>}
                  </div>
                ))}
              </div>
              <form onSubmit={addNote} className="mt-3 flex gap-2">
                <input className="input" placeholder={t('complaints.addUpdate')} value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn-primary shrink-0">{t('common.save')}</button>
              </form>
              <p className="mt-1 text-xs text-slate-400">Updates are pushed to the resident's WhatsApp if linked.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
