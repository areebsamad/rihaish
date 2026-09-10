import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Table export helpers (CSV opens in Excel; PDF via jsPDF+autotable).

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleString(), 14, 22);
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map(String)),
    startY: 26,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [5, 150, 105] },
  });
  doc.save(`${filename}.pdf`);
}
