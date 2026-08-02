import React, { useEffect, useState } from 'react';
import { ExternalLink, MapPin, ShieldAlert, X } from 'lucide-react';

export default function OutbreakAlert({ alerts }) {
  const alertKey = (alerts || []).map(alert => alert.id).join(':');
  const [dismissedKey, setDismissedKey] = useState('');

  useEffect(() => {
    setDismissedKey('');
  }, [alertKey]);

  if (!alerts?.length || dismissedKey === alertKey) return null;

  return (
    <section
      role="alert"
      aria-live="polite"
      className="relative z-20 shrink-0 border-b border-care-warning/30 bg-care-warning/10 px-4 py-3"
    >
      <div className="max-w-7xl mx-auto pr-10 space-y-3">
        {alerts.slice(0, 2).map((alert, index) => (
          <div
            key={alert.id}
            className={index > 0 ? 'border-t border-care-warning/20 pt-3' : ''}
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <ShieldAlert className="w-5 h-5 text-care-warning mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[10px] font-bold uppercase text-care-warning">
                      Public health notice near you
                    </span>
                    <span className="inline-flex items-center text-[10px] text-care-muted">
                      <MapPin className="w-3 h-3 mr-1" />
                      {alert.matchedArea}
                      {Number.isFinite(alert.distance) ? ` | ${alert.distance.toFixed(0)} km away` : ''}
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-care-heading mt-1">{alert.headline}</h2>
                  <p className="text-xs text-care-muted leading-relaxed mt-1">
                    {alert.summary} {alert.guidance}
                  </p>
                </div>
              </div>
              <a
                href={alert.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center self-start rounded-lg bg-care-primary px-3 py-2 text-xs font-bold text-care-surface hover:bg-care-primary-hover transition-colors shrink-0"
              >
                Official notice <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setDismissedKey(alertKey)}
        className="absolute right-4 top-3 p-1.5 text-care-warning hover:text-care-heading hover:bg-care-neutral transition-colors"
        title="Dismiss public health notice"
        aria-label="Dismiss public health notice"
      >
        <X className="w-4 h-4" />
      </button>
    </section>
  );
}
