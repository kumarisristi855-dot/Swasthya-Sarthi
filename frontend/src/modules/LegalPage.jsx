import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, LockKeyhole, Scale, ShieldCheck } from 'lucide-react';

const documents = {
  terms: {
    title: 'Terms of Service',
    icon: Scale,
    sections: [
      ['Platform purpose', 'Swasthya Sarthi helps patients discover healthcare facilities, review published provider information, and manage appointments. It does not replace professional medical advice, diagnosis, or emergency care.'],
      ['Account responsibilities', 'Users must provide accurate information, protect their login credentials, and use only the portal assigned to their role. Appointment availability remains subject to confirmation by the participating clinic or hospital.'],
      ['Medical emergencies', 'Do not use Swasthya Sarthi for an emergency. Contact local emergency services or proceed to the nearest emergency department.'],
      ['Directory information', 'Facility and public doctor-directory information can change. Users should confirm services, schedules, fees, and credentials with the provider.'],
      ['Acceptable use', 'Users may not access another person’s health information, interfere with platform security, submit fraudulent bookings, or misuse provider contact information.']
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    icon: LockKeyhole,
    sections: [
      ['Information collected', 'Swasthya Sarthi stores account details, role profiles, appointment information, symptom-search text, in-person visit records, and notification delivery logs required to operate the service.'],
      ['How information is used', 'Information is used to authenticate users, match patients with care options, coordinate appointments, support clinical workflows, and send appointment communications.'],
      ['Role-based access', 'Patients, doctors, and hospital administrators receive different access. Clinical records are available only through authenticated, role-checked workflows connected to an appointment relationship.'],
      ['Location information', 'Browser location is used only when permission is granted. A patient can instead select a city or district manually.'],
      ['Data choices', 'Users may correct account information and can contact the platform operator regarding access or deletion requests, subject to healthcare record-retention obligations.']
    ]
  },
  security: {
    title: 'Security Overview',
    icon: ShieldCheck,
    sections: [
      ['Authentication', 'Swasthya Sarthi uses Supabase Auth sessions and verifies the authenticated role on protected backend routes. Frontend role selection alone does not grant access.'],
      ['Authorization', 'Patient, doctor, and hospital-admin operations are separated by server-side role and ownership checks. Doctors can access patient history only when an appointment relationship exists.'],
      ['Booking integrity', 'Appointment slots use a database uniqueness constraint to prevent double booking, with availability revalidated during booking.'],
      ['Secrets and transport', 'Provider credentials and API keys are read from environment variables and are not embedded in frontend code. Production deployments should enforce HTTPS.'],
      ['Operational safeguards', 'Notification attempts are logged for auditing, and source-verified public directory data is kept separate from bookable Swasthya Sarthi practitioner accounts.']
    ]
  }
};

export default function LegalPage() {
  const { document } = useParams();
  const page = documents[document];

  if (!page) return <Navigate to="/" replace />;

  const Icon = page.icon;

  return (
    <div className="portal-theme min-h-screen bg-care-neutral text-care-body font-sans">
      <header className="border-b border-care-border bg-care-neutral/90 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center text-sm text-care-muted hover:text-care-surface transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Swasthya Sarthi
          </Link>
          <div className="flex items-center gap-2 font-bold">
            <Activity className="w-5 h-5 text-care-primary" />
            Swasthya Sarthi
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-care-primary-subtle border border-care-primary/20 rounded-lg text-care-primary">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-care-surface">{page.title}</h1>
            <p className="text-xs text-care-muted mt-1">Last updated July 28, 2026</p>
          </div>
        </div>

        <div className="border-y border-care-border divide-y divide-care-border">
          {page.sections.map(([heading, body]) => (
            <section key={heading} className="py-6">
              <h2 className="text-base font-bold text-care-body mb-2">{heading}</h2>
              <p className="text-sm text-care-muted leading-7">{body}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
