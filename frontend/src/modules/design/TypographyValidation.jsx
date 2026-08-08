import React from 'react';

const scriptSamples = [
  {
    code: 'hi',
    label: 'Devanagari',
    displayFont: 'var(--font-display-hi)',
    bodyFont: '"Noto Sans Devanagari", var(--font-body-base)',
    heading: 'स्वास्थ्य साथी',
    body: 'पास के भरोसेमंद डॉक्टर, अस्पताल और उपलब्ध समय देखें।',
  },
  {
    code: 'bn',
    label: 'Bengali',
    displayFont: 'var(--font-display-bn)',
    bodyFont: '"Noto Sans Bengali", var(--font-body-base)',
    heading: 'স্বাস্থ্য সারথি',
    body: 'কাছের ভরসাযোগ্য ডাক্তার, হাসপাতাল এবং সময় দেখুন।',
  },
  {
    code: 'ta',
    label: 'Tamil',
    displayFont: 'var(--font-display-ta)',
    bodyFont: '"Noto Sans Tamil", var(--font-body-base)',
    heading: 'ஸ்வஸ்த்ய சாரதி',
    body: 'அருகிலுள்ள நம்பகமான மருத்துவர், மருத்துவமனை மற்றும் நேரங்களைப் பாருங்கள்.',
  },
  {
    code: 'te',
    label: 'Telugu',
    displayFont: 'var(--font-display-te)',
    bodyFont: '"Noto Sans Telugu", var(--font-body-base)',
    heading: 'స్వస్థ్య సారథి',
    body: 'సమీపంలోని నమ్మదగిన వైద్యులు, ఆసుపత్రులు మరియు సమయాలను చూడండి.',
  },
  {
    code: 'kn',
    label: 'Kannada',
    displayFont: 'var(--font-display-kn)',
    bodyFont: '"Noto Sans Kannada", var(--font-body-base)',
    heading: 'ಸ್ವಾಸ್ಥ್ಯ ಸಾರಥಿ',
    body: 'ಹತ್ತಿರದ ವಿಶ್ವಾಸಾರ್ಹ ವೈದ್ಯರು, ಆಸ್ಪತ್ರೆಗಳು ಮತ್ತು ಸಮಯಗಳನ್ನು ನೋಡಿ.',
  },
];

const tokens = [
  ['Sarthi Teal', '#0C7C7A', 'selection, confirmation, active state'],
  ['Deep Clinic Navy', '#12343B', 'headings and trust surfaces'],
  ['Monsoon Blue', '#D8EEF0', 'calm panels and selected backgrounds'],
  ['Marigold Signal', '#F2A83B', 'attention and urgency only'],
  ['Jasmine White', '#FAFBF8', 'app background'],
  ['Madder Rose', '#A43E4C', 'critical and negative states'],
];

export default function TypographyValidation() {
  return (
    <main className="min-h-screen bg-care-neutral px-4 py-8 text-care-body sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="rounded-lg border border-care-border bg-care-surface p-6 shadow-sm sm:p-8">
            <p className="care-eyebrow uppercase">Care Route checkpoint</p>
            <h1
              className="mt-3 max-w-4xl text-4xl font-normal leading-tight text-care-heading sm:text-5xl"
              style={{ fontFamily: 'var(--font-display-base)' }}
            >
              Typography validation before app-wide rollout
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-care-muted">
              This isolated view compares the proposed display and body faces across the five supported Indian
              scripts so mismatched weight, rhythm, or personality can be caught before the redesign reaches
              patient, doctor, and hospital admin screens.
            </p>
          </div>

          <aside className="rounded-lg border border-care-border bg-care-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase text-care-heading">Approved color tokens</h2>
            <div className="mt-4 grid gap-3">
              {tokens.map(([name, hex, role]) => (
                <div key={name} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-md border border-care-border p-3">
                  <span className="h-11 w-11 rounded-md border border-care-border" style={{ background: hex }} />
                  <span>
                    <span className="block text-sm font-bold text-care-heading">{name}</span>
                    <span className="block text-xs font-semibold text-care-muted">{hex}</span>
                    <span className="mt-1 block text-xs leading-5 text-care-muted">{role}</span>
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {scriptSamples.map(sample => (
            <article key={sample.code} className="flex min-h-[280px] flex-col rounded-lg border border-care-border bg-care-surface p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="care-badge care-badge-info">{sample.label}</span>
                <span className="text-xs font-bold uppercase text-care-muted">{sample.code}</span>
              </div>
              <h2
                className="text-[2rem] font-normal leading-[1.18] text-care-heading"
                lang={sample.code}
                style={{ fontFamily: sample.displayFont }}
              >
                {sample.heading}
              </h2>
              <p
                className="mt-5 text-sm leading-7 text-care-body"
                lang={sample.code}
                style={{ fontFamily: sample.bodyFont }}
              >
                {sample.body}
              </p>
              <div className="mt-auto pt-6">
                <div className="h-2 rounded-full bg-care-primary-subtle">
                  <div className="h-2 w-2/3 rounded-full bg-care-primary" />
                </div>
                <p className="mt-3 text-xs leading-5 text-care-muted">
                  Display: {sample.displayFont.replace('var(--font-display-', '').replace(')', '')}
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-care-border bg-care-surface p-6 shadow-sm">
          <h2
            className="text-2xl font-normal text-care-heading"
            style={{ fontFamily: 'var(--font-display-base)' }}
          >
            Validation notes to review
          </h2>
          <div className="mt-5 grid gap-4 text-sm leading-7 text-care-body md:grid-cols-3">
            <p>
              Compare apparent height across the large headings. The target is comparable presence, not identical
              glyph geometry.
            </p>
            <p>
              Marigold is intentionally shown only as a token, not as a selected or active state. Selection remains
              teal or Monsoon Blue.
            </p>
            <p>
              Kannada uses Noto Serif Kannada because there is no matching Tiro Kannada family in the proposed set;
              this is the most likely script to need approval or a replacement.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
