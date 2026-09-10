import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { Modal, Badge, Empty, rupees } from '../components/ui';
import { exportCsv, exportPdf } from '../lib/export';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Billing() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [bills, setBills] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  const [payBill, setPayBill] = useState<any>(null);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => {
    if (!societyId) return;
    api
      .get('/bills', { params: { societyId, status: status || undefined, month: month || undefined } })
      .then((r) => setBills(r.data));
  };
  useEffect(load, [societyId, status, month]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const monthlyRun = async () => {
    try {
      const { data } = await api.post('/bills/run', { societyId });
      flash(`Monthly run complete: ${data.generated} bills generated, ${data.markedOverdue} marked overdue.`);
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const generate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const { data } = await api.post('/bills/generate', {
        societyId,
        month: Number(fd.get('month')),
        year: Number(fd.get('year')),
        amount: Number(fd.get('amount')),
        description: String(fd.get('description') || 'Monthly maintenance'),
      });
      setGenOpen(false);
      flash(`${data.created} bills created (${data.skipped} already existed).`);
      load();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const recordPayment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post(`/bills/${payBill.id}/payments`, {
        amount: Number(fd.get('amount')),
        method: String(fd.get('method')),
      });
      setPayBill(null);
      flash('Payment recorded.');
      load();
    } catch (err) {
      alert(errMsg(err));
    }
  };

  const remind = async (bill: any) => {
    setBusyId(bill.id);
    try {
      await api.post(`/bills/${bill.id}/remind`);
      flash(`WhatsApp reminder sent to ${bill.plot.resident?.name}. Check the simulator!`);
    } catch (e) {
      alert(errMsg(e));
    } finally {
      setBusyId('');
    }
  };

  const tableData = () => ({
    headers: ['Plot', 'Resident', 'Period', 'Amount (PKR)', 'Due Date', 'Status'],
    rows: bills.map((b) => [
      b.plot.number,
      b.plot.resident?.name || '',
      `${MONTHS[b.month - 1]} ${b.year}`,
      b.amount,
      b.dueDate.slice(0, 10),
      b.status,
    ]),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')} {t('common.status').toLowerCase()}</option>
            <option value="PENDING">Pending / Due</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
          </select>
          <select className="input w-36" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">{t('common.all')} months</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => { const d = tableData(); exportCsv('bills', d.headers, d.rows); }}>{t('common.exportCsv')}</button>
          <button className="btn-secondary" onClick={() => { const d = tableData(); exportPdf('bills', 'Bills Report', d.headers, d.rows); }}>{t('common.exportPdf')}</button>
          <button className="btn-secondary" onClick={monthlyRun}>⚙️ {t('billing.monthlyRun')}</button>
          <button className="btn-primary" onClick={() => setGenOpen(true)}>+ {t('billing.generate')}</button>
        </div>
      </div>

      {notice && <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">{t('common.plot')}</th>
              <th className="th">{t('common.resident')}</th>
              <th className="th">{t('billing.period')}</th>
              <th className="th">{t('common.amount')}</th>
              <th className="th">{t('billing.dueDate')}</th>
              <th className="th">{t('common.status')}</th>
              <th className="th">Payments</th>
              <th className="th">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bills.map((b) => (
              <tr key={b.id}>
                <td className="td font-medium">{b.plot.number}</td>
                <td className="td">{b.plot.resident?.name || '—'}</td>
                <td className="td">{MONTHS[b.month - 1]} {b.year}</td>
                <td className="td">{rupees(b.amount)}</td>
                <td className="td">{b.dueDate.slice(0, 10)}</td>
                <td className="td"><Badge value={b.status} /></td>
                <td className="td text-xs">
                  {b.payments.length
                    ? b.payments.map((p: any) => (
                        <div key={p.id}>
                          {rupees(p.amount)} · {p.method} · <Badge value={p.status} />
                        </div>
                      ))
                    : '—'}
                </td>
                <td className="td space-x-2 whitespace-nowrap">
                  {b.status !== 'PAID' && (
                    <>
                      <button className="text-emerald-600 hover:underline" onClick={() => setPayBill(b)}>{t('billing.recordPayment')}</button>
                      <button
                        className="text-green-600 hover:underline disabled:opacity-40"
                        disabled={busyId === b.id || !b.plot.resident?.waPhone}
                        title={b.plot.resident?.waPhone ? 'Send WhatsApp reminder' : 'Resident has no linked WhatsApp'}
                        onClick={() => remind(b)}
                      >
                        📱 Remind
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bills.length && <Empty text={t('common.noData')} />}
      </div>

      {genOpen && (
        <Modal title={t('billing.generate')} onClose={() => setGenOpen(false)}>
          <form onSubmit={generate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select className="input" name="month" defaultValue={new Date().getMonth() + 1}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <input className="input" name="year" type="number" defaultValue={new Date().getFullYear()} required />
            </div>
            <input className="input" name="amount" type="number" placeholder="Amount per plot (PKR)" defaultValue={5000} required />
            <input className="input" name="description" placeholder="Description" defaultValue="Monthly maintenance" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setGenOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('billing.generate')}</button>
            </div>
          </form>
        </Modal>
      )}

      {payBill && (
        <Modal title={`${t('billing.recordPayment')} — ${payBill.plot.number} (${MONTHS[payBill.month - 1]} ${payBill.year})`} onClose={() => setPayBill(null)}>
          <form onSubmit={recordPayment} className="space-y-3">
            <input className="input" name="amount" type="number" defaultValue={payBill.amount} required />
            <select className="input" name="method" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="EASYPAISA">EasyPaisa</option>
              <option value="JAZZCASH">JazzCash</option>
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPayBill(null)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
