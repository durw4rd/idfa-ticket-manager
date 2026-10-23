import Link from 'next/link';

interface YearSwitcherProps {
  years: number[];
  selectedYear: number;
}

export default function YearSwitcher({ years, selectedYear }: YearSwitcherProps) {
  if (years.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Festival year" className="flex flex-wrap gap-2">
      {years.map((year) => (
        <Link
          key={year}
          href={`/screenings?year=${year}`}
          aria-current={year === selectedYear ? 'page' : undefined}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            year === selectedYear
              ? 'bg-idfa-black text-white border-idfa-black'
              : 'border-idfa-gray-300 text-idfa-gray-700 hover:border-idfa-black'
          }`}
        >
          {year}
        </Link>
      ))}
    </nav>
  );
}
