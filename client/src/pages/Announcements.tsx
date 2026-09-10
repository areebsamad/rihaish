import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Modal, Empty } from '../components/ui';

export default function Announcements() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [target, setTarget] = useState<'ALL' | 'PLOTS'>('ALL');
  const [selectedPlots, setSelectedPlots] = useState<string[]>([]);
  const [acksFor, setAcksFor] = useState<any>(null);
  const [acks, setAcks] = useState<any[]>([]);
  const [notice, setNotice] = useState('');

  const load = () => {
    if (!societyId) return;
    api.get('/announcements', { params: { societyId } }).then((r) => setItems(r.data));
  };
  useEffect(load, [societyId]);
  useEffect(() => {
    if (societyId) api.get('/plots', { params: { societyId } }).then((r) => setPlots(r.data));
  }, [societyId]);

  const compose = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const { data } = await api.post('/announcements', {
        societyId,
        title: String(fd.get('title')),
        body: String(fd.get('body')),
        target,
        plotNumbers: target === 'PLOTS' ? selectedPlots : [],
      });
      setComposeOpen(false);
      setSelectedPlots([]);
      setTarget('ALL');
      setNotice(`Broadcast sent to ${data.whatsappSent} WhatsApp-linked resident(s). Check the simulator!`);
      setTimeout(() => setNotice(''), 5000);
      load();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const viewAcks = async (a: any) => {
    const { data } = await api.get(`/announcements/${a.id}/acks`);
    setAcksFor(a);
    setAcks(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setComposeOpen(true)}>+ {t('announcements.compose')}</button>
      </div>
      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">📢 {a.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{a.body}</p>
                <div className="mt-2 text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString()} · by {a.createdBy?.name || 'system'} ·{' '}
                  {a.target === 'ALL' ? t('announcements.targetAll') : `${t('announcements.targetPlots')}: ${a.plotNumbers.join(', ')}`}
                </div>
              </div>
              <button className="btn-secondary shrink-0" onClick={() => viewAcks(a)}>
                ✔ {a._count.acks}/{a.targeted} {t('announcements.acks')}
              </button>
            </div>
          </div>
        ))}
        {!items.length && <div className="card"><Empty text={t('common.noData')} /></div>}
      </div>

      {composeOpen && (
        <Modal title={t('announcements.compose')} onClose={() => setComposeOpen(false)}>
          <form onSubmit={compose} className="space-y-3">
            <input className="input" name="title" placeholder="Title" required />
            <textarea className="input" name="body" placeholder="Message body" rows={4} required />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={target === 'ALL'} onChange={() => setTarget('ALL')} /> {t('announcements.targetAll')}
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={target === 'PLOTS'} onChange={() => setTarget('PLOTS')} /> {t('announcements.targetPlots')}
              </label>
            </div>
            {target === 'PLOTS' && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {plots.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedPlots.includes(p.number)}
                      onChange={(e) =>
                        setSelectedPlots((prev) => (e.target.checked ? [...prev, p.number] : prev.filter((n) => n !== p.number)))
                      }
                    />
                    {p.number} — {p.resident?.name || 'vacant'}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">Sent as WhatsApp messages (with an Acknowledge button) to linked residents.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setComposeOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('announcements.broadcast')}</button>
            </div>
          </form>
        </Modal>
      )}

      {acksFor && (
        <Modal title={`${t('announcements.acks')} — ${acksFor.title}`} onClose={() => setAcksFor(null)}>
          {acks.length ? (
            <ul className="space-y-2">
              {acks.map((a) => (
                <li key={a.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span>✔ {a.resident.name} ({a.resident.plots.map((p: any) => p.number).join(', ')})</span>
                  <span className="text-xs text-slate-400">{new Date(a.ackAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No acknowledgments yet" />
          )}
        </Modal>
      )}
    </div>
  );
}
