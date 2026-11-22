import { ReactNode, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Baby, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  group?: string;
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [clockNow, setClockNow] = useState(() => new Date());
  const isAdmin = basePath === '/admin';
  const activeTitle = navItems.find(item => `${basePath}/${item.to}` === location.pathname)?.label ?? title;
  const groups = useMemo(() => {
    const result = new Map<string, NavItem[]>();
    for (const item of navItems) {
      const group = item.group ?? 'Workspace';
      result.set(group, [...(result.get(group) ?? []), item]);
    }
    return [...result.entries()];
  }, [navItems]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [isAdmin]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handlePageSearch = () => {
    const query = pageSearch.trim().toLowerCase();
    if (!query) return;
    const match = navItems.find(item => item.label.toLowerCase().includes(query));
    if (!match) return;
    navigate(`${basePath}/${match.to}`);
    setPageSearch('');
  };

  if (!isAdmin) {
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
          {navItems.map(item => (
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
        <aside className="hidden w-64 shrink-0 border-r border-slate-100 bg-white lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{sidebar}</aside>
          </div>
        )}
        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 lg:px-8">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
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

  const adminSidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-950/40">
          <Baby size={20} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold tracking-tight text-slate-100">LittleSteps</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Safety &amp; monitoring</div>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{group}</div>
            <div className="space-y-1">
              {items.map(item => (
                <NavLink
                  key={item.to}
                  to={`${basePath}/${item.to}`}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition ${
                      isActive
                        ? 'border-blue-500/40 bg-blue-500/10 text-blue-300 shadow-[inset_0_0_18px_rgba(59,130,246,0.06)]'
                        : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/70 hover:text-slate-100'
                    }`
                  }
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <div className="mb-3 flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">
            {user?.fullName?.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-200">{user?.fullName}</div>
            <div className="text-[11px] capitalize text-slate-500">{user?.role} account</div>
          </div>
        </div>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300">
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-theme flex min-h-screen bg-[#080b11] text-slate-200">
      <aside className="hidden w-[228px] shrink-0 border-r border-slate-800 bg-[#090c12] md:block">{adminSidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[280px] border-r border-slate-800 bg-[#090c12] shadow-xl">{adminSidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[62px] items-center gap-3 border-b border-slate-800 bg-[#0c1018]/95 px-4 backdrop-blur-xl lg:px-6">
          <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={19} />
          </button>
          <div className="min-w-[155px]">
            <h1 className="text-sm font-semibold text-slate-100">{activeTitle}</h1>
            <p className="hidden text-[10px] text-slate-500 sm:block">Real-time childcare monitoring</p>
          </div>
          <form
            className="ml-auto hidden w-full max-w-[330px] md:block"
            onSubmit={event => { event.preventDefault(); handlePageSearch(); }}
          >
            <input
              aria-label="Search admin pages"
              className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
              placeholder="Search pages…"
              value={pageSearch}
              onChange={event => setPageSearch(event.target.value)}
            />
          </form>
          <div className="hidden text-right xl:block">
            <div className="font-mono text-xs font-medium text-slate-300">{clockNow.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}</div>
            <div className="text-[10px] text-slate-500">{clockNow.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · IST</div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
