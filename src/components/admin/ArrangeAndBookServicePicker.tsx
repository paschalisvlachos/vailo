import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  ARRANGE_AND_BOOK_CATEGORIES,
  toggleArrangeAndBookCategory,
  toggleArrangeAndBookSubcategory,
} from '../../lib/arrangeAndBook';

type Props = {
  selectedCategoryIds: string[];
  selectedSubcategoryIds: string[];
  onChange: (next: { categoryIds: string[]; subcategoryIds: string[] }) => void;
  description?: string;
};

export default function ArrangeAndBookServicePicker({
  selectedCategoryIds,
  selectedSubcategoryIds,
  onChange,
  description = 'Select every category and service this provider offers. One business can appear in multiple lists.',
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const category of ARRANGE_AND_BOOK_CATEGORIES) {
        if (
          selectedCategoryIds.includes(category.id) ||
          category.subcategories.some((sub) => selectedSubcategoryIds.includes(sub.id))
        ) {
          next.add(category.id);
        }
      }
      return next;
    });
  }, [selectedCategoryIds, selectedSubcategoryIds]);

  const toggleExpanded = (categoryId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="space-y-2">
        {ARRANGE_AND_BOOK_CATEGORIES.map((category) => {
          const categorySelected = selectedCategoryIds.includes(category.id);
          const selectedCount = category.subcategories.filter((sub) =>
            selectedSubcategoryIds.includes(sub.id)
          ).length;
          const isOpen = expanded.has(category.id);

          return (
            <div
              key={category.id}
              className={`rounded-xl border ${
                categorySelected || selectedCount > 0
                  ? 'border-vailo-teal/25 bg-vailo-teal/[0.03]'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(category.id)}
                  className="p-1 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5"
                  aria-label={isOpen ? `Collapse ${category.label}` : `Expand ${category.label}`}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      toggleArrangeAndBookCategory(
                        category.id,
                        selectedCategoryIds,
                        selectedSubcategoryIds
                      )
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    categorySelected
                      ? 'bg-vailo-teal text-white border-vailo-teal'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-vailo-teal/40'
                  }`}
                >
                  {category.label}
                </button>
                {selectedCount > 0 && (
                  <span className="text-xs text-gray-500">
                    {selectedCount} service{selectedCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {isOpen && (
                <div className="flex flex-wrap gap-2 px-3 pb-3 pl-11">
                  {category.subcategories.map((sub) => {
                    const selected = selectedSubcategoryIds.includes(sub.id);
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() =>
                          onChange(
                            toggleArrangeAndBookSubcategory(
                              sub.id,
                              selectedCategoryIds,
                              selectedSubcategoryIds
                            )
                          )
                        }
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          selected
                            ? 'bg-vailo-gold/15 text-vailo-teal-hover border-vailo-gold/40'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-vailo-teal/40'
                        }`}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
