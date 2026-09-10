import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';

// In-browser "WhatsApp" so resident flows are demoable end-to-end without a
// real WhatsApp account. It POSTs the same normalized webhook payload a Meta
// adapter would produce and polls for outbound messages the provider "sent".

interface WaMsg {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  buttons?: { id: string; label: string }[] | null;
  imageDataUrl?: string | null;
  createdAt: string;
}

// *bold* → <b>, _italic_ → <i> (WhatsApp-style formatting, safe subset)
function fmt(text: string) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/\n/g, '<br/>');
}

export default function WhatsAppSimulator() {
  const [phone, setPhone] = useState(localStorage.getItem('wa_sim_phone') || '923001112222');
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMsg[]>([]);
  const [conv, setConv] = useState<any>(null);
  const [input, setInput] = useState('');
  const [hints, setHints] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  useEffect(() => {
    api.get('/whatsapp/demo-residents').then((r) => setHints(r.data)).catch(() => {});
  }, []);

  // Poll for new messages while a chat is open.
  useEffect(() => {
    if (!activePhone) return;
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await api.get('/whatsapp/messages', { params: { phone: activePhone } });
        if (!alive) return;
        setConv(data.conversation);
        setMessages(data.messages);
      } catch {
        /* server restarting; keep polling */
      }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activePhone]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const start = (p?: string) => {
    const num = (p || phone).replace(/[^0-9]/g, '');
    if (!num) return;
    setPhone(num);
    localStorage.setItem('wa_sim_phone', num);
    setMessages([]);
    lastCount.current = 0;
    setActivePhone(num);
  };

  const sendText = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activePhone) return;
    const text = input;
    setInput('');
    await api.post('/whatsapp/webhook', { from: activePhone, type: 'text', text });
  };

  const tapButton = async (buttonId: string) => {
    if (!activePhone) return;
    await api.post('/whatsapp/webhook', { from: activePhone, type: 'button', buttonId });
  };

  const latestOutboundId = [...messages].reverse().find((m) => m.direction === 'OUTBOUND' && m.buttons?.length)?.id;

  return (
    <div className="flex min-h-screen items-start justify-center gap-6 bg-slate-200 p-6">
      {/* Info panel */}
      <div className="hidden w-72 shrink-0 md:block">
        <div className="rounded-xl bg-white p-4 shadow">
          <h2 className="font-bold text-slate-800">📱 WhatsApp Simulator</h2>
          <p className="mt-1 text-xs text-slate-500">
            Residents interact with the society only via WhatsApp. This simulator talks to the backend through the same
            webhook a real WhatsApp integration would use.
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your phone number</label>
            <div className="flex gap-1">
              <input className="input font-mono text-xs" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button className="btn-primary shrink-0" onClick={() => start()}>Open</button>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="font-semibold text-slate-600">Try these seeded residents:</div>
            {hints.map((h) => (
              <button
                key={h.phone}
                className="block w-full rounded-lg bg-slate-50 p-2 text-left hover:bg-emerald-50"
                onClick={() => start(h.phone)}
              >
                <div className="font-medium text-slate-700">{h.name} — {h.plots.map((p: any) => p.number).join(', ')}</div>
                <div className="text-slate-400">
                  +{h.phone} · CNIC •••{h.cnicLast4} {h.waPhone ? '· ✓ already linked' : '· needs registration'}
                </div>
              </button>
            ))}
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
              Tip: open with a brand-new number to walk through the registration flow (plot number → CNIC last 4).
            </div>
          </div>
        </div>
      </div>

      {/* Phone frame */}
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border-8 border-slate-800 bg-[#e5ddd5] shadow-2xl">
        {/* WhatsApp header */}
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-200 text-lg">🏘</div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Rihaish</div>
            <div className="text-[11px] text-emerald-100">
              {activePhone ? (conv?.resident ? `linked: ${conv.resident.name} (${conv.resident.plots?.map((p: any) => p.number).join(',')})` : 'online') : 'enter a number to start'}
            </div>
          </div>
          {conv?.escalated && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px]">escalated 🙋</span>}
        </div>

        {/* Messages */}
        <div className="h-[520px] space-y-2 overflow-y-auto p-3" style={{ backgroundImage: 'linear-gradient(rgba(229,221,213,.93),rgba(229,221,213,.93))' }}>
          {!activePhone && (
            <div className="mt-24 text-center text-sm text-slate-500">
              👋 Enter your phone number and press <b>Open</b>.<br />
              <span className="text-xs">(mobile: use 923001112222 for the pre-linked demo resident)</span>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'INBOUND' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm ${
                  m.direction === 'INBOUND' ? 'bg-[#dcf8c6]' : 'bg-white'
                }`}
              >
                <div dangerouslySetInnerHTML={{ __html: fmt(m.body) }} />
                {m.imageDataUrl && <img src={m.imageDataUrl} alt="attachment" className="mt-1 w-44 rounded" />}
                {m.direction === 'OUTBOUND' && m.buttons && m.buttons.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5">
                    {m.buttons.map((b) => (
                      <button
                        key={b.id}
                        className={`block w-full rounded-md px-2 py-1.5 text-center text-sm font-medium ${
                          m.id === latestOutboundId
                            ? 'bg-[#f0f6f6] text-[#00a5f4] hover:bg-[#e1efef]'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                        onClick={() => tapButton(b.id)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-0.5 text-right text-[10px] text-slate-400">
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {m.direction === 'INBOUND' && ' ✓✓'}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form onSubmit={sendText} className="flex items-center gap-2 bg-[#f0f0f0] p-2">
          <input
            className="flex-1 rounded-full border-0 bg-white px-4 py-2 text-sm focus:outline-none"
            placeholder={activePhone ? 'Type a message ("menu")' : 'Open a chat first...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!activePhone}
          />
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[#075e54] text-white" disabled={!activePhone}>
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
