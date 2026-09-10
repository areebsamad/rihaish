import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Badge, Empty } from '../components/ui';

// Simplified, mobile-friendly gate interface for the Guard role.
// Scans QR passes with the device camera (jsQR over getUserMedia frames)
// with a manual code-entry fallback.
export default function Guard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'scan' | 'log'>('scan');
  const [manualCode, setManualCode] = useState('');
  const [pass, setPass] = useState<any>(null);
  const [error, setError] = useState('');
  const [log, setLog] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const loadLog = () => api.get('/guard/log').then((r) => setLog(r.data));
  useEffect(() => {
    if (tab === 'log') loadLog();
  }, [tab]);

  const lookup = async (code: string) => {
    setError('');
    try {
      const { data } = await api.get(`/guard/pass/${encodeURIComponent(code.trim())}`);
      setPass(data);
      stopCamera();
    } catch (e) {
      setPass(null);
      setError(errMsg(e));
    }
  };

  const act = async (action: 'entry' | 'exit') => {
    try {
      await api.post(`/guard/pass/${pass.code}/${action}`);
      await lookup(pass.code);
      loadLog();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setScanning(true);
      // Wait for the video element to mount, then attach + scan.
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const tick = () => {
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(img.data, img.width, img.height);
            if (qr?.data) {
              lookup(qr.data);
              return;
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    } catch {
      setError('Camera unavailable — use manual code entry below.');
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };
  useEffect(() => stopCamera, []);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-100 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">🛡 Gate Security</h1>
          <div className="text-xs text-slate-500">{user?.name}</div>
        </div>
        <button className="btn-secondary" onClick={logout}>Logout</button>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button className={tab === 'scan' ? 'btn-primary justify-center py-2' : 'btn-secondary justify-center py-2'} onClick={() => setTab('scan')}>
          📷 Scan Pass
        </button>
        <button className={tab === 'log' ? 'btn-primary justify-center py-2' : 'btn-secondary justify-center py-2'} onClick={() => setTab('log')}>
          📋 Today's Log
        </button>
      </div>

      {tab === 'scan' && (
        <div className="space-y-4">
          <div className="card">
            {scanning ? (
              <div className="space-y-2">
                <video ref={videoRef} className="w-full rounded-lg" playsInline muted />
                <button className="btn-secondary w-full justify-center" onClick={stopCamera}>Stop camera</button>
              </div>
            ) : (
              <button className="btn-primary w-full justify-center py-3" onClick={startCamera}>
                📷 Start QR Scanner
              </button>
            )}
            <div className="my-3 text-center text-xs text-slate-400">— or enter code manually —</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) lookup(manualCode);
              }}
              className="flex gap-2"
            >
              <input
                className="input font-mono uppercase"
                placeholder="GP-XXXXXX"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              />
              <button className="btn-primary shrink-0">Look up</button>
            </form>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {pass && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-slate-800">{pass.visitor.name}</div>
                  <div className="text-sm text-slate-500">
                    Plot {pass.visitor.plot.number} · Host: {pass.visitor.resident?.name || '—'}
                  </div>
                  <div className="font-mono text-xs text-slate-400">{pass.code}</div>
                </div>
                <Badge value={pass.status} />
              </div>
              <div className="text-sm text-slate-500">
                Expected: {new Date(pass.visitor.expectedAt).toLocaleString()}
                <br />
                Valid until: {new Date(pass.expiresAt).toLocaleString()}
              </div>
              {pass.entryAt && <div className="text-sm text-emerald-700">✓ Entry logged {new Date(pass.entryAt).toLocaleTimeString()}</div>}
              {pass.exitAt && <div className="text-sm text-slate-600">✓ Exit logged {new Date(pass.exitAt).toLocaleTimeString()}</div>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="btn-primary justify-center py-3"
                  disabled={pass.status !== 'APPROVED'}
                  onClick={() => act('entry')}
                >
                  ✅ Entry Logged
                </button>
                <button
                  className="btn-secondary justify-center py-3"
                  disabled={!pass.entryAt || !!pass.exitAt}
                  onClick={() => act('exit')}
                >
                  🚪 Exit Logged
                </button>
              </div>
              {pass.status === 'PENDING' && (
                <p className="text-center text-xs text-amber-600">⚠ Pass not approved yet — ask committee to approve.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="card p-0">
          {log.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0">
              <div>
                <div className="text-sm font-medium text-slate-800">{p.visitor.name}</div>
                <div className="text-xs text-slate-500">Plot {p.visitor.plot.number} · {p.code}</div>
              </div>
              <div className="text-right text-xs text-slate-500">
                {p.entryAt && <div className="text-emerald-700">IN {new Date(p.entryAt).toLocaleTimeString()}</div>}
                {p.exitAt && <div>OUT {new Date(p.exitAt).toLocaleTimeString()}</div>}
              </div>
            </div>
          ))}
          {!log.length && <Empty text="No gate activity today" />}
        </div>
      )}
    </div>
  );
}
