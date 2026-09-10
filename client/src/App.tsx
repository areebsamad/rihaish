import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SocietyPage from './pages/Society';
import Billing from './pages/Billing';
import Visitors from './pages/Visitors';
import Complaints from './pages/Complaints';
import Announcements from './pages/Announcements';
import Inbox from './pages/Inbox';
import Documents from './pages/Documents';
import AuditLog from './pages/AuditLog';
import Guard from './pages/Guard';
import WhatsAppSimulator from './pages/WhatsAppSimulator';

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public: the WhatsApp simulator needs no login (residents have no app). */}
      <Route path="/whatsapp-simulator" element={<WhatsAppSimulator />} />
      <Route path="/login" element={user ? <Navigate to={user.role === 'GUARD' ? '/guard' : '/'} /> : <Login />} />

      {!user ? (
        <Route path="*" element={<Navigate to="/login" />} />
      ) : user.role === 'GUARD' ? (
        <>
          <Route path="/guard" element={<Guard />} />
          <Route path="*" element={<Navigate to="/guard" />} />
        </>
      ) : (
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/society" element={<SocietyPage />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/visitors" element={<Visitors />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/guard" element={<Guard />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      )}
    </Routes>
  );
}
