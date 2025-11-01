'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleQRSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsibleQRSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleQRSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-2xl font-bold mb-6 hover:text-idfa-gray-800 transition-colors"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="h-6 w-6 text-idfa-gray-600" />
        ) : (
          <ChevronDown className="h-6 w-6 text-idfa-gray-600" />
        )}
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

