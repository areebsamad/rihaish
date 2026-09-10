import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty } from '../components/ui';

export default function AuditLog() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [data, setData] = useState<{ total: number; logs: any[] }>({ total: 0, logs: [] });
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 25;

  useEffect(() => {
    if (!societyId) return;
    api
      .get('/audit', { params: { societyId, q: q || undefined, entity: entity || undefined, page, pageSize } })
      .then((r) => setData(r.data));
  }, [societyId, q, entity, page]);

  const entities = ['Bill', 'VisitorPass', 'Visitor', 'Complaint', 'Announcement', 'Resident', 'Plot', 'Society', 'Document', 'WaConversation'];
  const pages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="input w-64" placeholder={`${t('common.search')} actor / action`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input w-48" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
          <option value="">{t('common.all')} entities</option>
          {entities.map((en) => <option key={en} value={en}>{en}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          {page} / {pages} ({data.total})
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Time</th>
              <th className="th">Actor</th>
              <th className="th">Action</th>
              <th className="th">Entity</th>
              <th className="th">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.logs.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="td whitespace-nowrap text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="td">
                  <span className={`mr-1 rounded px-1 text-xs ${l.actorType === 'RESIDENT' ? 'bg-green-100 text-green-700' : l.actorType === 'SYSTEM' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                    {l.actorType}
                  </span>
                  {l.actorName}
                </td>
                <td className="td font-mono text-xs">{l.action}</td>
                <td className="td">{l.entity}</td>
                <td className="td">
                  {(l.before || l.after) ? (
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                      {expanded === l.id ? 'hide' : 'view'}
                    </button>
                  ) : '—'}
                  {expanded === l.id && (
                    <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[10px] leading-tight">
                      {l.before ? `before: ${JSON.stringify(l.before, null, 1)}\n` : ''}
                      {l.after ? `after: ${JSON.stringify(l.after, null, 1)}` : ''}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.logs.length && <Empty text={t('common.noData')} />}
      </div>
    </div>
  );
}
