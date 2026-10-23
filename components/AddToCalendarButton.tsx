'use client';

import { CalendarPlus } from 'lucide-react';

interface AddToCalendarButtonProps {
  title: string;
  location: string;
  startsAt: string; // ISO timestamp
  url?: string | null;
}

// Typical IDFA screening length when the film's runtime is unknown
const DEFAULT_DURATION_MINUTES = 120;

function toIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export default function AddToCalendarButton({ title, location, startsAt, url }: AddToCalendarButtonProps) {
  const handleClick = () => {
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IDFA Ticket Manager//EN',
      'BEGIN:VEVENT',
      `UID:${toIcsTimestamp(start)}-${encodeURIComponent(title)}@idfa-ticket-manager`,
      `DTSTAMP:${toIcsTimestamp(new Date())}`,
      `DTSTART:${toIcsTimestamp(start)}`,
      `DTEND:${toIcsTimestamp(end)}`,
      `SUMMARY:${escapeIcsText(`IDFA: ${title}`)}`,
      `LOCATION:${escapeIcsText(location)}`,
      ...(url ? [`URL:${url}`] : []),
      'BEGIN:VALARM',
      'TRIGGER:-PT45M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'screening'}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center space-x-1 px-3 py-1.5 text-sm border border-idfa-gray-300 font-medium rounded hover:border-idfa-black transition-colors"
    >
      <CalendarPlus className="h-4 w-4" />
      <span>Add to calendar</span>
    </button>
  );
}
