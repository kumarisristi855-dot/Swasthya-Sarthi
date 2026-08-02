import React, { useEffect, useRef, useState } from 'react';
import { Activity, Building2, ChevronDown, LogOut, Mail, Pencil, Phone, ShieldCheck } from 'lucide-react';
import Avatar from './ui/Avatar';

export default function PortalHeader({ role, userLabel, onLogout, context, profile, onEditProfile }) {
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const closeMenu = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <header className="care-header">
      <div className="care-navbar-inner gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-care-primary text-care-surface">
            <span className="relative h-6 w-6" aria-hidden="true">
              <Activity className="care-logo-pulse-base absolute inset-0 h-6 w-6" strokeWidth={2.5} />
              <Activity className="care-logo-pulse-scan absolute inset-0 h-6 w-6" strokeWidth={2.5} />
            </span>
          </div>
          <div>
            <span className="block text-lg font-bold text-care-heading">CareSync</span>
            <span className="block text-[10px] font-semibold uppercase text-care-primary-hover">{role}</span>
          </div>
        </div>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
          {context}
          {profile ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(open => !open)}
                className="group flex h-14 items-center gap-2.5 rounded-lg border border-care-border bg-care-surface px-2.5 text-left shadow-sm transition-all hover:border-care-primary/40 hover:bg-care-primary-subtle/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary focus-visible:ring-offset-2"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="relative shrink-0">
                  <Avatar name={profile.name || userLabel} id={profile.id} src={profile.avatarUrl} size="sm" variant="brand" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-care-surface bg-care-success" aria-hidden="true" />
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block max-w-44 truncate text-sm font-semibold text-care-heading">{profile.name || userLabel}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-care-primary-hover">{profile.label || 'Account profile'}</span>
                </span>
                <span className="hidden h-7 w-7 items-center justify-center rounded-md bg-care-neutral text-care-muted transition-colors group-hover:bg-care-surface group-hover:text-care-primary-hover sm:flex">
                  <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-care-border bg-care-surface p-3 shadow-xl">
                  <div className="flex items-center gap-3 border-b border-care-border p-2 pb-4">
                    <Avatar name={profile.name || userLabel} id={profile.id} src={profile.avatarUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-care-heading">{profile.name || userLabel}</p>
                      <p className="truncate text-xs text-care-muted">{profile.email || 'Email not available'}</p>
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-care-success">
                        <ShieldCheck className="h-3.5 w-3.5" /> Signed in securely
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 px-2 py-3 text-sm">
                    <div className="flex items-center gap-2 text-care-body">
                      <Building2 className="h-4 w-4 shrink-0 text-care-muted" />
                      <span className="truncate">{profile.organization || 'Hospital assignment unavailable'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-care-body">
                      <Phone className="h-4 w-4 shrink-0 text-care-muted" />
                      <span className="truncate">{profile.phone || 'Phone number not added'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-care-body">
                      <Mail className="h-4 w-4 shrink-0 text-care-muted" />
                      <span className="truncate">{profile.email || 'Email not available'}</span>
                    </div>
                  </div>

                  {onEditProfile && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); onEditProfile(); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-care-heading transition-colors hover:bg-care-primary-subtle hover:text-care-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-primary"
                    >
                      <Pencil className="h-4 w-4" /> Edit profile
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-care-danger transition-colors hover:bg-care-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-care-danger"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <span className="hidden max-w-48 truncate text-sm text-care-muted sm:inline">{userLabel}</span>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-care-muted hover:bg-care-primary-subtle hover:text-care-heading"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
