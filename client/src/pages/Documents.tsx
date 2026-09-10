import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Empty } from '../components/ui';

export default function Documents() {
  const { t } = useTranslation();
  const { societyId, user } = useAuth();
  const [docs, setDocs] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (societyId) api.get('/documents', { params: { societyId } }).then((r) => setDocs(r.data));
  };
  useEffect(load, [societyId]);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return alert('Choose a file first');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title || file.name);
    fd.append('societyId', societyId!);
    setBusy(true);
    try {
      await api.post('/documents', fd);
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      alert(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const download = async (doc: any) => {
    const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data);
    a.download = doc.originalName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const del = async (doc: any) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={upload} className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-48">
          <label className="mb-1 block text-sm font-medium text-slate-600">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AGM Minutes June 2026" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">File</label>
          <input ref={fileRef} type="file" className="text-sm" required />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? '...' : '⬆ Upload'}</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Title</th>
              <th className="th">File</th>
              <th className="th">Size</th>
              <th className="th">Uploaded by</th>
              <th className="th">{t('common.date')}</th>
              <th className="th">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="td font-medium">📄 {d.title}</td>
                <td className="td">{d.originalName}</td>
                <td className="td">{(d.size / 1024).toFixed(1)} KB</td>
                <td className="td">{d.uploadedBy?.name || '—'}</td>
                <td className="td">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td className="td space-x-2">
                  <button className="text-blue-600 hover:underline" onClick={() => download(d)}>Download</button>
                  {user?.role === 'ADMIN' && (
                    <button className="text-red-500 hover:underline" onClick={() => del(d)}>{t('common.delete')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!docs.length && <Empty text={t('common.noData')} />}
      </div>
    </div>
  );
}
