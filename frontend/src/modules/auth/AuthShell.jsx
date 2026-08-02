import React from 'react';
import { ArrowLeft, Building2, CalendarCheck2, MapPin, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from '../../shared/BrandMark';
import authClinicImage from '../../assets/auth-clinic-consultation.png';

export default function AuthShell({ icon: Icon, title, subtitle, accent = 'teal', children }) {
  const { pathname } = useLocation();
  const iconTone = {
    blue: 'border-care-border bg-care-primary-subtle text-care-primary-hover',
    teal: 'border-care-primary bg-care-primary-subtle text-care-primary-hover',
    amber: 'border-care-warning bg-care-surface text-care-warning',
  }[accent];
  const signInRoles = [
    { label: 'Patient', path: '/login/patient', icon: UserRound },
    { label: 'Doctor', path: '/login/doctor', icon: Stethoscope },
    { label: 'Hospital', path: '/login/admin', icon: Building2 },
  ];

  return (
    <div className="care-shell grid min-h-screen lg:grid-cols-[minmax(600px,1.05fr)_minmax(520px,0.95fr)]">
      <aside className="care-auth-panel relative hidden overflow-hidden border-r border-care-border bg-care-surface p-10 text-care-heading lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0" aria-hidden="true">
          <img src={authClinicImage} alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-care-surface/40 via-care-surface/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-care-primary-subtle via-care-primary-subtle/40 to-transparent" />
        </div>
        <div className="absolute -bottom-32 -left-24 h-80 w-[32rem] rounded-[52%] bg-care-primary-subtle" aria-hidden="true" />
        <div className="absolute -right-28 -top-24 h-72 w-72 rounded-full bg-care-primary-subtle" aria-hidden="true" />
        <div className="absolute left-[43%] top-20 h-28 w-28 rounded-full bg-care-surface/35" aria-hidden="true" />
        <div className="care-token-dot-pattern absolute left-[38%] top-24 h-28 w-28 opacity-25" aria-hidden="true" />
        <div className="relative z-10">
          <BrandMark />
        </div>
        <div className="relative z-10 -mt-16 max-w-md px-6 py-5 before:absolute before:-inset-y-4 before:-left-5 before:right-8 before:-z-10 before:rounded-[42%] before:bg-care-surface before:opacity-[0.7] before:blur-2xl before:content-['']">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-care-surface text-care-primary-hover shadow-sm ring-1 ring-care-border">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h2 className="text-5xl font-bold leading-[1.05] text-care-heading">
            Care that <span className="block text-care-primary-hover">stays connected.</span>
          </h2>
          <span className="mt-4 block h-1 w-12 rounded-full bg-care-primary" aria-hidden="true" />
          <p className="mt-5 font-medium leading-7 text-care-body">
            Secure access to appointments, availability, and the information your role needs.
          </p>
          <div className="mt-8 space-y-5">
            {[
              { title: 'Easy Appointments', copy: 'Book and manage with ease.', icon: CalendarCheck2 },
              { title: 'Secure & Private', copy: 'Your data is always protected.', icon: ShieldCheck },
              { title: 'Nearby Care', copy: 'Find care close to you.', icon: MapPin },
            ].map(feature => (
              <div key={feature.title} className="flex items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-care-primary-subtle text-care-primary-hover shadow-sm ring-1 ring-care-border">
                  <feature.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold text-care-heading">{feature.title}</span>
                  <span className="mt-0.5 block text-xs font-medium text-care-body">{feature.copy}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs font-semibold text-care-muted">Protected healthcare workspace</p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-care-primary-subtle px-5 py-10 sm:px-8">
        <div className="absolute -right-24 -top-24 h-80 w-96 rounded-[45%] bg-care-primary-subtle" aria-hidden="true" />
        <div className="care-token-dot-pattern absolute right-16 top-16 h-32 w-32 opacity-25" aria-hidden="true" />
        <div className="w-full max-w-md relative z-10">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <BrandMark compact />
            <span className="text-xs care-muted">Secure sign in</span>
          </div>

          <Link to="/" className="mb-7 inline-flex items-center gap-2 text-sm care-muted hover:text-care-primary-hover">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <section className="care-surface-raised p-6 sm:p-8">
            <nav aria-label="Choose sign-in role" className="mb-7 grid grid-cols-3 gap-1 rounded-lg border border-care-border bg-care-neutral p-1">
              {signInRoles.map(role => {
                const RoleIcon = role.icon;
                const isActive = pathname === role.path;

                return (
                  <Link
                    key={role.path}
                    to={role.path}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors sm:text-sm ${
                      isActive
                        ? 'bg-care-surface text-care-primary-hover shadow-sm ring-1 ring-care-primary'
                        : 'text-care-muted hover:bg-care-surface/70 hover:text-care-heading'
                    }`}
                  >
                    <RoleIcon className="h-4 w-4 shrink-0" />
                    <span>{role.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mb-7 flex items-center gap-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${iconTone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-care-heading">{title}</h1>
                <p className="mt-1 text-sm care-muted">{subtitle}</p>
              </div>
            </div>
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
