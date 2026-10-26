'use client';

import { CalendarPlus } from 'lucide-react';
import { screeningEnd } from '@/lib/dates';
import { Button } from '@/components/ui/Button';

interface AddToCalendarButtonProps {
  title: string;
  location: string;
  startsAt: string; // ISO timestamp
  url?: string | null;
}

function toIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export default function AddToCalendarButton({ title, location, startsAt, url }: AddToCalendarButtonProps) {
  const handleClick = () => {
    const start = new Date(startsAt);
    const end = screeningEnd(start);

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
    <Button variant="secondary" size="sm" onClick={handleClick} icon={<CalendarPlus className="h-4 w-4" />}>
      Calendar
    </Button>
  );
}
