import { useMemo } from 'react';
import { X } from 'lucide-react';
import { legalContentIsEmpty, sanitizeLegalHtml } from '../../lib/legalHtml';

type Props = {
  title: string;
  body: string;
  onClose: () => void;
};

export default function LegalDocumentModal({ title, body, onClose }: Props) {
  const safeHtml = useMemo(() => sanitizeLegalHtml(body), [body]);
  const isEmpty = legalContentIsEmpty(body);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-[#051F26]/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg max-h-[88vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 id="legal-modal-title" className="font-luxury text-lg text-[#051F26] font-medium pr-4">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 text-sm text-gray-700 leading-relaxed">
          {isEmpty ? (
            <p className="text-gray-500 italic">This document is not available yet. Please check back later.</p>
          ) : (
            <div
              className="legal-document-content"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
