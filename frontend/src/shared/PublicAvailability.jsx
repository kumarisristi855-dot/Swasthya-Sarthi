import React from 'react';
import { CalendarClock, ExternalLink } from 'lucide-react';

export default function PublicAvailability({ availability }) {
  if (!availability?.schedules?.length) return null;

  return (
    <div className="border-t border-care-border pt-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[10px] font-bold uppercase text-care-primary-hover flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          Published OPD Hours
        </span>
        <a
          href={availability.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-semibold text-care-primary hover:text-care-primary inline-flex items-center gap-1"
        >
          Source <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="space-y-1.5">
        {availability.schedules.map((schedule, index) => (
          <div key={`${schedule.days.join('-')}-${index}`} className="text-[11px] text-care-muted flex justify-between gap-3">
            <span className="font-semibold">{schedule.days.join(', ')}</span>
            <span className="text-right">
              {schedule.hours}
              {schedule.room ? <span className="text-care-muted"> | {schedule.room}</span> : null}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-care-warning/80 leading-relaxed mt-2">
        Confirm live availability on the official booking page.
      </p>
    </div>
  );
}
