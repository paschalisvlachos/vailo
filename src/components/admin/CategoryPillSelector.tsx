type CategoryPillSelectorProps = {
  label: string;
  options: { value: string; label: string }[];
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
  colorClass?: 'blue' | 'purple' | 'orange';
};

const COLOR_MAP = {
  blue: { bg: 'bg-vailo-teal/10', text: 'text-vailo-dark', border: 'border-blue-300' },
  purple: { bg: 'bg-vailo-gold/15', text: 'text-vailo-teal-hover', border: 'border-vailo-gold/30' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
};

export default function CategoryPillSelector({
  label,
  options,
  isSelected,
  onToggle,
  colorClass = 'blue',
}: CategoryPillSelectorProps) {
  const activeStyle = COLOR_MAP[colorClass];

  return (
    <div>
      <p className="text-sm font-bold text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selected
                  ? `${activeStyle.bg} ${activeStyle.text} ${activeStyle.border} shadow-sm`
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
