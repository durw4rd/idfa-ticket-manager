import { Loader2 } from 'lucide-react';

export default function UploadProgress({
  status,
  progress,
}: {
  status: string;
  progress: { current: number; total: number };
}) {
  const share = progress.total > 0 ? progress.current / progress.total : 0;
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center" role="status" aria-live="polite">
      <Loader2 className="mb-4 h-8 w-8 animate-spin text-ink-3" />
      <p className="font-display text-lg">{status}</p>
      <p className="mt-1 text-sm text-ink-2">Keep this screen open while the tickets are read.</p>
      <div className="mt-6 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-spark transition-all" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
