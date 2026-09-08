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
    <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-0.5">
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
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 shrink-0"
                aria-label={isOpen ? `Collapse ${category.label}` : `Expand ${category.label}`}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Link
                to={categoryPath}
                onClick={onNavigate}
                className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg text-[13px] font-medium truncate ${
                  categoryActive
                    ? 'bg-white/12 text-white'
                    : 'text-white/55 hover:bg-white/6 hover:text-white/90'
                }`}
              >
                {category.label}
              </Link>
            </div>
            {isOpen && (
              <div className="ml-6 mb-1 space-y-0.5">
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
                      className={`block px-2 py-1.5 rounded-lg text-xs truncate ${
                        subActive
                          ? 'bg-white/12 text-white font-medium'
                          : 'text-white/45 hover:bg-white/6 hover:text-white/80'
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
