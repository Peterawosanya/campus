import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getNavItemsForRoles } from '@/config/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { ROLE_LABELS, ROLE_SHORT_LABELS } from '@/types';
import { cn } from '@/lib/utils';
import { GraduationCap, ChevronDown, Menu, X, LogOut, Search, Bell } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, memberships, activeSchool, activeRole, activeRoles, setActiveSchoolId, setActiveRole, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const navSections = getNavItemsForRoles(activeRoles);
  const schools = Array.from(
    new Map(
      memberships
        .map((m) => m.schools)
        .filter(Boolean)
        .map((s) => [s!.id, s!]),
    ).values(),
  );

  const currentPath = location.pathname;
  const breadcrumb = (() => {
    const allItems = navSections.flatMap((s) => s.items);
    const current = allItems.find((i) => i.path === currentPath);
    return current?.label ?? 'Dashboard';
  })();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-500 text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-navy-600">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold font-display">CampusOS</span>
        <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-navy-200 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* School selector */}
      {schools.length > 0 && (
        <div className="px-3 py-3 border-b border-navy-600 relative">
          <button
            onClick={() => setSchoolMenuOpen(!schoolMenuOpen)}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 bg-navy-600 hover:bg-navy-700 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-500 text-sm font-bold flex-shrink-0">
              {activeSchool?.short_name?.charAt(0) ?? activeSchool?.name.charAt(0) ?? 'S'}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium truncate">{activeSchool?.name ?? 'Select school'}</p>
              <p className="text-xs text-navy-200">{activeRole ? ROLE_SHORT_LABELS[activeRole] : ''}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-navy-300 transition-transform', schoolMenuOpen && 'rotate-180')} />
          </button>

          {schoolMenuOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 rounded-lg bg-navy-600 border border-navy-500 shadow-lg z-20 overflow-hidden">
              {schools.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSchoolId(s.id);
                    setSchoolMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-navy-700 transition-colors',
                    s.id === activeSchool?.id && 'bg-primary-500/20',
                  )}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-500 text-xs font-bold flex-shrink-0">
                    {s.short_name?.charAt(0) ?? s.name.charAt(0)}
                  </div>
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeRoles.length > 1 && (
        <div className="px-3 py-2 border-b border-navy-600">
          <p className="px-3 mb-1.5 text-2xs font-semibold uppercase tracking-wider text-navy-300">Acting as</p>
          <select
            value={activeRole ?? ''}
            onChange={(e) => setActiveRole(e.target.value as typeof activeRoles[number])}
            className="w-full rounded-lg bg-navy-600 border border-navy-500 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
          >
            {activeRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-6">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-2xs font-semibold uppercase tracking-wider text-navy-300">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-500 text-white'
                          : 'text-navy-100 hover:bg-navy-600 hover:text-white',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-success-500 px-1.5 py-0.5 text-2xs font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="border-t border-navy-600 p-3">
        <button
          onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-navy-600 transition-colors"
        >
          <Avatar
            firstName={profile?.first_name ?? 'U'}
            lastName={profile?.last_name ?? ''}
            size="sm"
          />
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium truncate">{profile?.first_name} {profile?.last_name}</p>
            <p className="text-xs text-navy-200 truncate">{profile?.email}</p>
          </div>
        </button>

        {profileMenuOpen && (
          <div className="mt-1 rounded-lg bg-navy-600 border border-navy-500 overflow-hidden">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-navy-100 hover:bg-navy-700 transition-colors"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-64 hidden lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-500/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-slide-in">{sidebar}</div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top nav */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-8 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-navy-500 hover:bg-slate-100 p-2 rounded-lg">
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">CampusOS</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-navy-500">{breadcrumb}</span>
          </div>

          {/* Search (decorative for now) */}
          <div className="ml-auto hidden md:flex items-center w-64 h-9 rounded-lg bg-slate-100 px-3 gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm text-navy-500 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-error-400 ring-2 ring-white" />
          </button>

          {/* Avatar */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 p-1 pr-2 rounded-lg hover:bg-slate-100 transition-colors"
            title="Click to sign out"
          >
            <Avatar
              firstName={profile?.first_name ?? 'U'}
              lastName={profile?.last_name ?? ''}
              size="sm"
            />
            <span className="hidden md:block text-sm font-medium text-navy-500">
              {profile?.first_name}
            </span>
          </button>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
