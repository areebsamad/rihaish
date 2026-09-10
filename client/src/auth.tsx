import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'TREASURER' | 'GUARD';
  societyId: string | null;
}

export interface Society {
  id: string;
  name: string;
  city: string;
  address: string;
  _count?: { plots: number; residents: number };
}

interface AuthCtx {
  user: User | null;
  societies: Society[];
  societyId: string | null; // effective society scope for the current session
  setSocietyId: (id: string) => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refreshSocieties: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('hsms_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [societies, setSocieties] = useState<Society[]>([]);
  const [societyId, setSocietyIdState] = useState<string | null>(
    () => localStorage.getItem('hsms_society') || null
  );

  const setSocietyId = (id: string) => {
    localStorage.setItem('hsms_society', id);
    setSocietyIdState(id);
  };

  const refreshSocieties = async () => {
    const { data } = await api.get<Society[]>('/societies');
    setSocieties(data);
    if (data.length && !data.find((s) => s.id === localStorage.getItem('hsms_society'))) {
      setSocietyId(data[0].id);
    }
  };

  useEffect(() => {
    if (user && user.role !== 'GUARD') refreshSocieties().catch(() => {});
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('hsms_token', data.token);
    localStorage.setItem('hsms_user', JSON.stringify(data.user));
    if (data.user.societyId) localStorage.setItem('hsms_society', data.user.societyId);
    setUser(data.user);
    return data.user as User;
  };

  const logout = () => {
    localStorage.removeItem('hsms_token');
    localStorage.removeItem('hsms_user');
    localStorage.removeItem('hsms_society');
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        societies,
        societyId: user?.societyId ?? societyId,
        setSocietyId,
        login,
        logout,
        refreshSocieties,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
