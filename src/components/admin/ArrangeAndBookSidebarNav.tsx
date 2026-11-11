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
    <div className="mt-0.5 mb-1 space-y-0.5">
      {ARRANGE_AND_BOOK_CATEGORIES.map((category) => {
        const isOpen = expanded === category.id;
        const categoryActive = onServices && activeCategory === category.id && !activeSubcategory;
        const categoryPath = adminPath(adminArrangeAndBookServicesPath(category.id));

        return (
          <div key={category.id}>
            <div className="flex items-center pl-3">
              <button
                type="button"
                onClick={() => setExpanded((prev) => (prev === category.id ? '' : category.id))}
                className="p-1.5 text-white/40 hover:text-white hover:bg-black/20 shrink-0"
                aria-label={isOpen ? `Collapse ${category.label}` : `Expand ${category.label}`}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Link
                to={categoryPath}
                onClick={onNavigate}
                className={`flex-1 min-w-0 px-2 py-1.5 text-[12px] font-normal truncate capitalize ${
                  categoryActive
                    ? 'bg-black/20 text-white'
                    : 'text-white/70 hover:bg-black/20 hover:text-white'
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
                      className={`block pl-[50px] pr-4 py-1.5 text-[12px] font-light truncate capitalize ${
                        subActive
                          ? 'bg-black/30 text-white'
                          : 'text-white/70 hover:bg-black/30 hover:text-white'
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
