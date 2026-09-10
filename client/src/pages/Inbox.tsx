import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { Empty } from '../components/ui';

// Admin view of WhatsApp conversations — escalated ("Talk to Admin") chats
// bubble to the top and can be replied to directly.
export default function Inbox() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => api.get('/whatsapp/conversations').then((r) => setConversations(r.data));
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const open = async (c: any) => {
    setSelected(c);
    const { data } = await api.get(`/whatsapp/conversations/${c.id}`);
    setMessages(data.messages);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
  };

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selected) return;
    try {
      await api.post(`/whatsapp/conversations/${selected.id}/reply`, { text: reply });
      setReply('');
      open(selected);
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const resolve = async () => {
    await api.post(`/whatsapp/conversations/${selected.id}/resolve`);
    load();
    setSelected({ ...selected, escalated: false });
  };

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 gap-4 md:grid-cols-3">
      <div className="card overflow-y-auto p-2">
        <h3 className="px-2 py-1 text-sm font-semibold text-slate-600">{t('nav.inbox')}</h3>
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`mb-1 w-full rounded-lg p-2 text-left text-sm hover:bg-slate-50 ${selected?.id === c.id ? 'bg-emerald-50' : ''}`}
            onClick={() => open(c)}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">
                {c.resident?.name || c.phone}
                {c.resident?.plots?.length ? ` (${c.resident.plots.map((p: any) => p.number).join(',')})` : ''}
              </span>
              {c.escalated && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">🙋 escalated</span>}
            </div>
            <div className="truncate text-xs text-slate-400">
              {c.lastMessage ? `${c.lastMessage.direction === 'INBOUND' ? '→' : '←'} ${c.lastMessage.body}` : '—'}
            </div>
          </button>
        ))}
        {!conversations.length && <Empty text={t('common.noData')} />}
      </div>

      <div className="card flex flex-col md:col-span-2">
        {selected ? (
          <>
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="font-medium text-slate-800">{selected.resident?.name || selected.phone} · +{selected.phone}</div>
              {selected.escalated && (
                <button className="btn-secondary" onClick={resolve}>✓ Mark resolved</button>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'INBOUND' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${m.direction === 'INBOUND' ? 'bg-slate-100 text-slate-800' : 'bg-emerald-100 text-emerald-900'}`}>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    {m.imageDataUrl && <img src={m.imageDataUrl} className="mt-1 w-32 rounded" />}
                    <div className="mt-0.5 text-right text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendReply} className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
              <input className="input" placeholder="Reply as committee..." value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="btn-primary shrink-0">Send</button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
