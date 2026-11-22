import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  ARRANGE_AND_BOOK_CATEGORIES,
  adminArrangeAndBookServicesPath,
} from '../../lib/arrangeAndBook';
import { adminPath } from '../../lib/adminRoutes';

export default function ArrangeAndBookSidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const activeCategory = params.get('category') || '';
  const activeSubcategory = params.get('subcategory') || '';
  const onServices = location.pathname.endsWith('/excursions/services');
  const [expanded, setExpanded] = useState<string>(onServices ? activeCategory : '');

  useEffect(() => {
    if (onServices && activeCategory) setExpanded(activeCategory);
  }, [onServices, activeCategory]);

  return (
    <div className="mt-0.5 mb-1 space-y-0.5 px-2">
      {ARRANGE_AND_BOOK_CATEGORIES.map((category) => {
        const isOpen = expanded === category.id;
        const categoryActive = onServices && activeCategory === category.id && !activeSubcategory;
        const categoryPath = adminPath(adminArrangeAndBookServicesPath(category.id));

        return (
          <div key={category.id}>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setExpanded((prev) => (prev === category.id ? '' : category.id))}
                className="p-1.5 text-gray-400 hover:text-vailo-dark hover:bg-black/[0.03] rounded-md shrink-0"
                aria-label={isOpen ? `Collapse ${category.label}` : `Expand ${category.label}`}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Link
                to={categoryPath}
                onClick={onNavigate}
                className={`flex-1 min-w-0 px-2 py-1.5 text-[12px] font-medium truncate rounded-md ${
                  categoryActive
                    ? 'bg-[#2ec4b6]/20 text-vailo-teal'
                    : 'text-gray-500 hover:bg-black/[0.03] hover:text-vailo-dark'
                }`}
              >
                {category.label}
              </Link>
            </div>
            {isOpen && (
              <div className="mb-1 space-y-0.5">
                {category.subcategories.map((sub) => {
                  const subActive =
                    onServices &&
                    activeCategory === category.id &&
                    activeSubcategory === sub.id;
                  return (
                    <Link
                      key={sub.id}
                      to={adminPath(adminArrangeAndBookServicesPath(category.id, sub.id))}
                      onClick={onNavigate}
                      className={`block pl-10 pr-3 py-1.5 text-[12px] truncate rounded-md ${
                        subActive
                          ? 'bg-[#2ec4b6]/20 text-vailo-teal font-medium'
                          : 'text-gray-500 hover:bg-black/[0.03] hover:text-vailo-dark'
                      }`}
                    >
                      {sub.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
