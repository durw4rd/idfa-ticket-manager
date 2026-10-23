'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { ExtractedTicketFields } from '@/lib/types';

interface TicketActionsProps {
  ticketId: string;
  fields: ExtractedTicketFields;
}

/**
 * Edit or delete one of the viewer's own tickets
 */
export default function TicketActions({ ticketId, fields }: TicketActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedTicketFields>(fields);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: draft }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update ticket');
      }
      // The screening key changes with the details, so go back to that festival year's list
      router.push(`/screenings?year=${data.ticket.festivalYear}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket');
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete this ticket for "${fields.act}"? This can't be undone.`)) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete ticket');
      }
      router.push(`/screenings?year=${fields.date.split('-')[2]}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ticket');
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-idfa-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-idfa-black focus:border-transparent';

  return (
    <div className="mt-4">
      {isEditing ? (
        <div className="space-y-3 text-left">
          <label className="block text-sm">
            <span className="text-idfa-gray-600">Title</span>
            <input className={inputClass} value={draft.act} onChange={(e) => setDraft({ ...draft, act: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="text-idfa-gray-600">Venue</span>
            <input className={inputClass} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-idfa-gray-600">Date (DD-MM-YYYY)</span>
              <input className={inputClass} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="text-idfa-gray-600">Time (HH:MM AM/PM)</span>
              <input className={inputClass} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-idfa-black text-white rounded hover:bg-idfa-gray-800 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(fields);
                setIsEditing(false);
              }}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-idfa-gray-700 hover:bg-idfa-gray-100 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-idfa-gray-700 hover:text-idfa-black hover:bg-idfa-gray-100 rounded transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Fix details
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
