import Link from 'next/link';

/** Festival years as small links; hidden when there's only one */
export default function YearSwitcher({
  years,
  selectedYear,
  basePath = '/screenings',
}: {
  years: number[];
  selectedYear: number;
  basePath?: string;
}) {
  if (years.length < 2) {
    return <span />;
  }

  return (
    <nav aria-label="Festival year" className="flex gap-1">
      {years.map((year) => (
        <Link
          key={year}
          href={`${basePath}?year=${year}`}
          aria-current={year === selectedYear ? 'page' : undefined}
          className={`inline-flex h-9 items-center rounded-full px-2 text-sm font-semibold tabular-nums transition-colors ${
            year === selectedYear ? 'text-ink underline decoration-spark decoration-[3px] underline-offset-[6px]' : 'text-ink-3 hover:text-ink'
          }`}
        >
          {year}
        </Link>
      ))}
    </nav>
  );
}
