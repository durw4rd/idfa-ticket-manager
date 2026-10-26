'use client';

import type { ExtractedTicketFields } from '@/lib/types';
import { inputToTicketDate, inputToTicketStart, ticketDateToInput, ticketStartToInput } from '@/lib/dates';
import { Field } from '@/components/ui/Field';

/**
 * Title, venue, date and time of a ticket, used by the upload review and "Fix details".
 * Dates and times are edited with native pickers and kept in the stored formats
 * (DD-MM-YYYY and HH:MM AM/PM).
 */
export default function TicketFieldsForm({
  value,
  onChange,
  disabled,
}: {
  value: ExtractedTicketFields;
  onChange: (value: ExtractedTicketFields) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field
        label="Film"
        value={value.act}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, act: event.target.value })}
      />
      <Field
        label="Venue"
        value={value.location}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, location: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Date"
          type="date"
          value={ticketDateToInput(value.date)}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, date: inputToTicketDate(event.target.value) })}
        />
        <Field
          label="Time"
          type="time"
          value={ticketStartToInput(value.start)}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, start: inputToTicketStart(event.target.value) })}
        />
      </div>
    </div>
  );
}
