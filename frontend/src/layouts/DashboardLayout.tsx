import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Baby, LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

interface Props {
  title: string;
  navItems: NavItem[];
  basePath: string;
  children: ReactNode;
}

export default function DashboardLayout({ title, navItems, basePath, children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white">
          <Baby size={20} />
        </div>
        <div>
          <div className="font-bold text-slate-900">LittleSteps</div>
          <div className="text-xs text-slate-500">{title}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={`${basePath}/${item.to}`}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-brand-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 px-3 py-2">
          <div className="text-sm font-semibold text-slate-900">{user?.fullName}</div>
          <div className="text-xs capitalize text-slate-500">{user?.role}</div>
        </div>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
          <LogOut size={18} /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-100 bg-white lg:block">{sidebar}</aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            {open ? <X /> : <Menu />}
          </button>
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          <div className="text-sm text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
