import { LayoutGrid, Rows3 } from 'lucide-react';

export type GemsLayoutMode = 'grid' | 'list';

type Props = {
  value: GemsLayoutMode;
  onChange: (mode: GemsLayoutMode) => void;
  gridLabel: string;
  listLabel: string;
  groupLabel: string;
};

export default function GuestGemsLayoutToggle({
  value,
  onChange,
  gridLabel,
  listLabel,
  groupLabel,
}: Props) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className="flex shrink-0 rounded-full bg-white border border-gray-200/90 p-0.5 shadow-sm"
    >
      <button
        type="button"
        aria-pressed={value === 'grid'}
        title={gridLabel}
        onClick={() => onChange('grid')}
        className={`flex items-center justify-center h-8 w-9 rounded-full transition-all ${
          value === 'grid'
            ? 'bg-[#0B4F5C] text-[#C5A059] shadow-sm'
            : 'text-gray-400 hover:text-[#0B4F5C]'
        }`}
      >
        <LayoutGrid size={15} strokeWidth={2.25} />
        <span className="sr-only">{gridLabel}</span>
      </button>
      <button
        type="button"
        aria-pressed={value === 'list'}
        title={listLabel}
        onClick={() => onChange('list')}
        className={`flex items-center justify-center h-8 w-9 rounded-full transition-all ${
          value === 'list'
            ? 'bg-[#0B4F5C] text-[#C5A059] shadow-sm'
            : 'text-gray-400 hover:text-[#0B4F5C]'
        }`}
      >
        <Rows3 size={15} strokeWidth={2.25} />
        <span className="sr-only">{listLabel}</span>
      </button>
    </div>
  );
}
