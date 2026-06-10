import { useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  analyzeHouseGuideImport,
  applyHouseGuideImport,
  categoryFieldOptions,
  prepareImportSource,
  type HouseGuideFieldAssignment,
  type HouseGuideImportQuestion,
  type HouseGuideImportResult,
} from '../../lib/houseGuideImportAi';
import type { HouseGuideFormData } from '../../lib/houseGuideLocales';

type Props = {
  formData: HouseGuideFormData;
  contentLocale: string;
  primaryLocale: string;
  onApply: (next: HouseGuideFormData) => Promise<void>;
  disabled?: boolean;
};

const ACCEPTED_TYPES =
  '.txt,.md,.csv,.pdf,image/*,text/plain,application/pdf';

function confidenceBadge(confidence: HouseGuideFieldAssignment['confidence']) {
  if (confidence === 'high') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        High confidence
      </span>
    );
  }
  if (confidence === 'medium') {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        Review
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
      Uncertain
    </span>
  );
}

export default function HouseGuideImportPanel({
  formData,
  contentLocale,
  primaryLocale,
  onApply,
  disabled = false,
}: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importText, setImportText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<HouseGuideImportResult | null>(null);

  const fieldOptions = useMemo(() => categoryFieldOptions(), []);

  const categoryOptions = useMemo(
    () =>
      fieldOptions.reduce<{ id: string; title: string }[]>((acc, row) => {
        if (!acc.some((c) => c.id === row.categoryId)) {
          acc.push({ id: row.categoryId, title: row.categoryTitle });
        }
        return acc;
      }, []),
    [fieldOptions]
  );

  const fieldsForCategory = (categoryId: string, textareaOnly = false) =>
    fieldOptions.filter(
      (f) => f.categoryId === categoryId && (!textareaOnly || f.fieldType === 'textarea')
    );

  const updateAssignment = (
    id: string,
    patch: Partial<HouseGuideFieldAssignment>
  ) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      };
    });
  };

  const updateQuestion = (id: string, patch: Partial<HouseGuideImportQuestion>) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
      };
    });
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setSelectedFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const added = Array.from(files).filter((f) => !names.has(f.name));
      return [...prev, ...added];
    });
  };

  const handleAnalyze = async () => {
    if (!importText.trim() && selectedFiles.length === 0) {
      toast.warning('Paste text or upload at least one file.');
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    try {
      const prepared = await Promise.all(selectedFiles.map((f) => prepareImportSource(f)));
      const analyzed = await analyzeHouseGuideImport({
        pastedText: importText,
        files: prepared,
        contentLocale,
      });

      if (analyzed.assignments.length === 0 && analyzed.questions.length === 0) {
        toast.warning('AI could not map any content to house guide fields. Try more detail or pick fields manually.');
      }

      setResult(analyzed);
    } catch (err) {
      console.error('house guide import:', err);
      toast.error(err instanceof Error ? err.message : 'AI import failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!result || isApplying) return;

    const enabledAssignments = result.assignments.filter((a) => a.enabled);
    const enabledQuestions = result.questions.filter(
      (q) => q.enabled && q.resolvedCategoryId && q.resolvedFieldId
    );

    if (enabledAssignments.length === 0 && enabledQuestions.length === 0) {
      toast.warning('Select at least one placement to apply.');
      return;
    }

    const unresolved = result.questions.filter(
      (q) => q.enabled && (!q.resolvedCategoryId || !q.resolvedFieldId)
    );
    if (unresolved.length > 0) {
      toast.warning('Choose a category and field for all enabled uncertain items.');
      return;
    }

    const next = applyHouseGuideImport(
      formData,
      enabledAssignments,
      enabledQuestions,
      contentLocale,
      primaryLocale
    );

    setIsApplying(true);
    try {
      await onApply(next);
      const count = enabledAssignments.length + enabledQuestions.length;
      toast.success(
        `Saved ${count} placement${count === 1 ? '' : 's'} to the house guide.`
      );
      setResult(null);
      setImportText('');
      setSelectedFiles([]);
    } catch (err) {
      console.error('house guide import apply:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const resetReview = () => setResult(null);

  return (
    <div className="mt-10 bg-white rounded-3xl border border-vailo-teal/15 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-vailo-teal/[0.04] to-transparent">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={20} className="text-vailo-gold" />
          AI Import Assistant
        </h2>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Paste notes or upload files (PDF, text, photos). AI will sort content into house guide
          categories and write it in the active language tab ({contentLocale.toUpperCase()}) — source
          text in other languages is translated automatically. You review and confirm before anything
          is placed.
        </p>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
            <FileText size={16} className="text-vailo-teal" />
            Paste text
          </label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            disabled={disabled || isAnalyzing || isApplying}
            placeholder="Paste an existing house manual, email from your cleaner, check-in notes…"
            rows={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0B4F5C] outline-none text-sm text-gray-800 bg-gray-50/50 focus:bg-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
            <UploadCloud size={16} className="text-vailo-teal" />
            Upload files
          </label>
          <label
            className={`flex flex-col items-center justify-center min-h-[196px] border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              disabled || isAnalyzing
                ? 'border-gray-200 bg-gray-50 opacity-50 pointer-events-none'
                : 'border-vailo-teal/25 bg-gray-50/50 hover:bg-vailo-teal/[0.04] hover:border-vailo-teal/40'
            }`}
          >
            <UploadCloud size={28} className="text-vailo-teal/70 mb-2" />
            <p className="text-sm font-medium text-gray-700">Drop files or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">PDF, TXT, MD, CSV, photos</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              className="hidden"
              disabled={disabled || isAnalyzing || isApplying}
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          {selectedFiles.length > 0 && (
            <ul className="mt-3 space-y-2">
              {selectedFiles.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                >
                  <span className="truncate text-gray-700">{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedFiles((prev) => prev.filter((f) => f.name !== file.name))
                    }
                    className="text-gray-400 hover:text-red-500 p-1"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={disabled || isAnalyzing || isApplying}
          className="px-6 py-3 bg-vailo-teal hover:bg-black text-white text-sm font-bold rounded-xl transition-colors flex items-center shadow-md disabled:opacity-50"
        >
          {isAnalyzing ? (
            <Loader2 size={18} className="mr-2 animate-spin" />
          ) : (
            <Bot size={18} className="mr-2" />
          )}
          {isAnalyzing ? 'Analysing…' : 'Analyse with AI'}
        </button>
        {result && (
          <button
            type="button"
            onClick={resetReview}
            className="px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel review
          </button>
        )}
      </div>

      {result && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-6 space-y-6">
          <div className="flex items-start gap-3">
            <Bot size={20} className="text-vailo-teal shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-900">AI summary</p>
              <p className="text-sm text-gray-600 mt-1">{result.summary}</p>
            </div>
          </div>

          {result.assignments.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-3">
                Proposed placements ({result.assignments.filter((a) => a.enabled).length} of{' '}
                {result.assignments.length} selected)
              </p>
              <div className="space-y-3">
                {result.assignments.map((a) => (
                  <div
                    key={a.id}
                    className={`bg-white border rounded-xl p-4 ${
                      a.enabled ? 'border-vailo-teal/20' : 'border-gray-200 opacity-70'
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3 justify-between mb-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={a.enabled}
                          onChange={(e) => updateAssignment(a.id, { enabled: e.target.checked })}
                          className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                        />
                        Include this placement
                      </label>
                      {confidenceBadge(a.confidence)}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Category</label>
                        <select
                          value={a.categoryId}
                          onChange={(e) => {
                            const catId = e.target.value;
                            const firstField = fieldsForCategory(catId)[0];
                            updateAssignment(a.id, {
                              categoryId: catId,
                              fieldId: firstField?.fieldId || a.fieldId,
                              fieldType: firstField?.fieldType || a.fieldType,
                            });
                          }}
                          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]"
                        >
                          {categoryOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Field</label>
                        <select
                          value={a.fieldId}
                          onChange={(e) => {
                            const fieldId = e.target.value;
                            const field = fieldsForCategory(a.categoryId).find(
                              (f) => f.fieldId === fieldId
                            );
                            updateAssignment(a.id, {
                              fieldId,
                              fieldType: field?.fieldType || a.fieldType,
                            });
                          }}
                          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]"
                        >
                          {fieldsForCategory(a.categoryId).map((f) => (
                            <option key={f.fieldId} value={f.fieldId}>
                              {f.fieldLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-3">
                      <label className="text-xs font-bold text-gray-500">Merge mode</label>
                      <select
                        value={a.mergeMode}
                        onChange={(e) =>
                          updateAssignment(a.id, {
                            mergeMode: e.target.value as 'append' | 'replace',
                          })
                        }
                        className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]"
                      >
                        <option value="append">Append to existing</option>
                        <option value="replace">Replace existing</option>
                      </select>
                    </div>

                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap border border-gray-100">
                      {a.fieldType === 'textarea' ? a.content : a.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.questions.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-900 mb-3">
                Needs your decision ({result.questions.length})
              </p>
              <div className="space-y-3">
                {result.questions.map((q) => (
                  <div key={q.id} className="bg-white border border-amber-200/80 rounded-xl p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.enabled}
                        onChange={(e) => updateQuestion(q.id, { enabled: e.target.checked })}
                        className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                      />
                      Include after you choose placement
                    </label>
                    <p className="text-sm text-gray-700 mb-1">{q.content}</p>
                    <p className="text-xs text-amber-700 mb-3">{q.reason}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Category</label>
                        <select
                          value={q.resolvedCategoryId}
                          onChange={(e) => {
                            const catId = e.target.value;
                            const firstField = fieldsForCategory(catId, true)[0];
                            updateQuestion(q.id, {
                              resolvedCategoryId: catId,
                              resolvedFieldId: firstField?.fieldId || '',
                            });
                          }}
                          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C]"
                        >
                          <option value="">Select category…</option>
                          {categoryOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Field</label>
                        <select
                          value={q.resolvedFieldId}
                          onChange={(e) =>
                            updateQuestion(q.id, { resolvedFieldId: e.target.value })
                          }
                          disabled={!q.resolvedCategoryId}
                          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0B4F5C] disabled:opacity-50"
                        >
                          <option value="">Select field…</option>
                          {fieldsForCategory(q.resolvedCategoryId, true).map((f) => (
                            <option key={f.fieldId} value={f.fieldId}>
                              {f.fieldLabel}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={disabled || isApplying}
            className="px-8 py-3 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-colors flex items-center shadow-md disabled:opacity-50"
          >
            {isApplying ? (
              <Loader2 size={18} className="mr-2 animate-spin" />
            ) : (
              <CheckCircle2 size={18} className="mr-2" />
            )}
            {isApplying ? 'Saving…' : 'Confirm & place in guide'}
          </button>
        </div>
      )}
    </div>
  );
}
