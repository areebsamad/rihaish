import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../api';
import { useAuth } from '../auth';
import { StatCard, rupees } from '../components/ui';

const PIE_COLORS = ['#059669', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#64748b'];

export default function Dashboard() {
  const { t } = useTranslation();
  const { societyId } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);

  useEffect(() => {
    if (!societyId) return;
    api.get('/reports/summary', { params: { societyId } }).then((r) => setSummary(r.data));
    api.get('/reports/charts', { params: { societyId } }).then((r) => setCharts(r.data));
  }, [societyId]);

  if (!summary) return <div className="text-slate-400">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.collectionRate')}
          value={`${summary.collectionRate}%`}
          sub={`${rupees(summary.collectedThisMonth)} / ${rupees(summary.billedThisMonth)}`}
          accent="text-emerald-600"
        />
        <StatCard label={t('dashboard.overdueAmount')} value={rupees(summary.overdueAmount)} accent="text-red-600" />
        <StatCard label={t('dashboard.openComplaints')} value={String(summary.openComplaints)} accent="text-amber-600" />
        <StatCard label={t('dashboard.visitorsToday')} value={String(summary.visitorsToday)} />
      </div>

      {charts && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card">
            <h3 className="mb-3 font-semibold text-slate-700">{t('dashboard.collections')}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.collections}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => rupees(v)} />
                <Legend />
                <Bar dataKey="billed" name="Billed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card">
              <h3 className="mb-3 font-semibold text-slate-700">{t('dashboard.complaintsByCategory')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.complaintsByCategory} dataKey="value" nameKey="name" outerRadius={70} label={(e) => e.name} isAnimationActive={false}>
                    {charts.complaintsByCategory.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="mb-3 font-semibold text-slate-700">{t('dashboard.billsByStatus')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.billsByStatus} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label={(e) => e.name} isAnimationActive={false}>
                    {charts.billsByStatus.map((entry: any, i: number) => (
                      <Cell
                        key={i}
                        fill={entry.name === 'PAID' ? '#059669' : entry.name === 'OVERDUE' ? '#ef4444' : '#f59e0b'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
