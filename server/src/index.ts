import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import societyRoutes from './routes/societies';
import plotRoutes from './routes/plots';
import residentRoutes from './routes/residents';
import billRoutes from './routes/bills';
import visitorRoutes from './routes/visitors';
import guardRoutes from './routes/guard';
import complaintRoutes from './routes/complaints';
import announcementRoutes from './routes/announcements';
import documentRoutes from './routes/documents';
import reportRoutes from './routes/reports';
import auditRoutes from './routes/audit';
import whatsappRoutes from './routes/whatsapp';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/societies', societyRoutes);
app.use('/api/plots', plotRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/guard', guardRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler — keeps route code clean.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`HSMS API listening on http://localhost:${port}`));
