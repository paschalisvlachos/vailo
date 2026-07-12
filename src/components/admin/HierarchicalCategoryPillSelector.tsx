import { useEffect, useMemo, useState } from 'react';
import {
  buildAdminCategoryHierarchy,
  parentHasSelectedSubcategories,
  primaryInList,
  type CategoryDocRecord,
} from '../../lib/categoryHierarchy';

type ColorClass = 'blue' | 'purple' | 'orange';

type Props = {
  label: string;
  categoryDocs: CategoryDocRecord[];
  selectedPrimaries: string[];
  onSelectedChange: (primaries: string[]) => void;
  locale: string;
  primaryLocale: string;
  colorClass?: ColorClass;
};

const COLOR_MAP = {
  blue: {
    active: 'bg-vailo-teal/10 text-vailo-dark border-blue-300',
    panel: 'border-vailo-teal/20 bg-vailo-teal/[0.04]',
    accent: 'text-vailo-teal',
  },
  purple: {
    active: 'bg-vailo-gold/15 text-vailo-teal-hover border-vailo-gold/30',
    panel: 'border-vailo-gold/25 bg-vailo-gold/[0.06]',
    accent: 'text-vailo-teal-hover',
  },
  orange: {
    active: 'bg-orange-50 text-orange-800 border-orange-200',
    panel: 'border-orange-200 bg-orange-50/50',
    accent: 'text-orange-700',
  },
};

export default function HierarchicalCategoryPillSelector({
  label,
  categoryDocs,
  selectedPrimaries,
  onSelectedChange,
  locale,
  primaryLocale,
  colorClass = 'blue',
}: Props) {
  const styles = COLOR_MAP[colorClass];
  const { parentOptions, subcategoriesByParentPrimary } = useMemo(
    () => buildAdminCategoryHierarchy(categoryDocs, locale, primaryLocale),
    [categoryDocs, locale, primaryLocale]
  );

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      for (const parent of parentOptions) {
        if (
          primaryInList(parent.primary, selectedPrimaries) ||
          parentHasSelectedSubcategories(
            parent.primary,
            selectedPrimaries,
            subcategoriesByParentPrimary
          )
        ) {
          next.add(parent.primary);
        }
      }
      return next;
    });
  }, [selectedPrimaries, parentOptions, subcategoriesByParentPrimary]);

  const togglePrimary = (primary: string) => {
    const has = primaryInList(primary, selectedPrimaries);
    const next = has
      ? selectedPrimaries.filter((p) => !primaryInList(p, [primary]))
      : [...selectedPrimaries, primary];
    onSelectedChange(next);
  };

  const handleParentClick = (parentPrimary: string) => {
    const subs = subcategoriesByParentPrimary[parentPrimary] || [];
    const willSelect = !primaryInList(parentPrimary, selectedPrimaries);
    togglePrimary(parentPrimary);
    if (subs.length > 0) {
      setExpandedParents((prev) => {
        const next = new Set(prev);
        if (willSelect) next.add(parentPrimary);
        else next.delete(parentPrimary);
        return next;
      });
    }
  };

  const toggleParentExpanded = (parentPrimary: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentPrimary)) next.delete(parentPrimary);
      else next.add(parentPrimary);
      return next;
    });
  };

  const parentPillClass = (parentPrimary: string) => {
    const isLeafSelected = primaryInList(parentPrimary, selectedPrimaries);
    const hasSelectedSubs = parentHasSelectedSubcategories(
      parentPrimary,
      selectedPrimaries,
      subcategoriesByParentPrimary
    );
    const isActive = isLeafSelected || hasSelectedSubs;

    return `px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
      isActive
        ? `${styles.active} shadow-sm`
        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
    }`;
  };

  const subPillClass = (subPrimary: string) => {
    const selected = primaryInList(subPrimary, selectedPrimaries);
    return `px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
      selected
        ? `${styles.active} shadow-sm`
        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
    }`;
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-gray-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {parentOptions.map((parent) => {
          const subs = subcategoriesByParentPrimary[parent.primary] || [];
          return (
            <span key={parent.primary} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleParentClick(parent.primary)}
                className={parentPillClass(parent.primary)}
              >
                {parent.label}
              </button>
              {subs.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleParentExpanded(parent.primary)}
                  className={`h-7 w-7 rounded-full text-[10px] font-bold border transition-all ${
                    expandedParents.has(parent.primary)
                      ? `${styles.active} shadow-sm`
                      : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                  }`}
                  aria-label={`${expandedParents.has(parent.primary) ? 'Hide' : 'Show'} subcategories for ${parent.label}`}
                  title="Optional subcategories"
                >
                  {expandedParents.has(parent.primary) ? '−' : '+'}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {parentOptions.map((parent) => {
        const subs = subcategoriesByParentPrimary[parent.primary] || [];
        if (subs.length === 0 || !expandedParents.has(parent.primary)) return null;

        return (
          <div
            key={`subs-${parent.primary}`}
            className={`rounded-lg border p-3 ${styles.panel}`}
          >
            <p className={`text-xs font-semibold mb-2 ${styles.accent}`}>
              {parent.label} — optional subcategories
            </p>
            <div className="flex flex-wrap gap-2">
              {subs.map((sub) => (
                <button
                  key={sub.primary}
                  type="button"
                  onClick={() => togglePrimary(sub.primary)}
                  className={subPillClass(sub.primary)}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
