import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  FileText,
  Globe,
  Home,
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
  type HouseGuideImportSource,
} from '../../lib/houseGuideImportAi';
import type { HouseGuideFormData } from '../../lib/houseGuideLocales';

function isRecoverableFailedSource(source: HouseGuideImportSource): boolean {
  if (source.kind !== 'url' || !source.url) return false;
  if (source.fetchStatus === 'ok') return false;
  // Maps is skipped on purpose — recovery paste is still optional but useful for some hosts.
  return source.fetchStatus === 'failed' || source.fetchStatus === 'skipped';
}

function buildManualRecoveryBlock(label: string, url: string, pasted: string): string {
  return [
    '',
    `--- Manual copy from: ${label} ---`,
    `URL: ${url}`,
    pasted.trim(),
    '--- End manual copy ---',
    '',
  ].join('\n');
}

type Props = {
  formData: HouseGuideFormData;
  contentLocale: string;
  primaryLocale: string;
  onApply: (next: HouseGuideFormData) => Promise<void>;
  disabled?: boolean;
  /** Prefill paste box (e.g. wizard onboarding seed). */
  initialImportText?: string;
  /** Prefill uploaded files from the property wizard. */
  initialFiles?: File[];
  /** Show post-wizard handoff banner and scroll into view. */
  fromWizard?: boolean;
  /** Start AI analysis automatically once seed text is ready. */
  autoAnalyze?: boolean;
  /** Wizard finish destinations — import runs first based on confidence toggles. */
  footerActions?: {
    onContinueListing: () => void;
    onFinishHouseGuide: () => void;
    onFinishProperties: () => void;
  };
};

type ConfidenceFilter = 'high' | 'medium' | 'low' | 'questions';

type AutoImportToggles = {
  high: boolean;
  medium: boolean;
  low: boolean;
  questions: boolean;
};

const DEFAULT_AUTO_IMPORT: AutoImportToggles = {
  high: true,
  medium: false,
  low: false,
  questions: false,
};

type AnalyzeProgressStep = {
  id: string;
  label: string;
};

function labelForImportUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('airbnb')) return 'Parsing from Airbnb…';
    if (host.includes('booking.com')) return 'Parsing from Booking.com…';
    if (host.includes('vrbo') || host.includes('homeaway')) return 'Parsing from VRBO…';
    if (host.includes('google') || host.includes('maps.app.goo.gl') || host === 'share.google') {
      return 'Parsing from Google Maps…';
    }
    return `Parsing from website (${host})…`;
  } catch {
    return 'Parsing from website…';
  }
}

function buildAnalyzeProgressSteps(text: string, files: File[]): AnalyzeProgressStep[] {
  const steps: AnalyzeProgressStep[] = [
    { id: 'start', label: 'Preparing your sources…' },
  ];
  const notes = text.trim();
  if (notes) {
    steps.push({ id: 'notes', label: 'Reading pasted notes…' });
  }

  const urlMatches = notes.match(/https?:\/\/[^\s<>"'`)\]]+/gi) || [];
  const seen = new Set<string>();
  for (const raw of urlMatches) {
    const url = raw.replace(/[.,;]+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    steps.push({ id: `url-${seen.size}`, label: labelForImportUrl(url) });
  }

  for (const file of files) {
    steps.push({ id: `file-${file.name}`, label: `Parsing from file: ${file.name}…` });
  }

  steps.push({ id: 'map', label: 'Mapping content into House Guide fields…' });
  steps.push({ id: 'finish', label: 'Almost done — finishing AI review…' });
  return steps;
}

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

function sourceBadge(opts: {
  sourceLabel: string;
  sourceKind: string;
  sourceId: string;
  sourceUrl?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
        From: {opts.sourceLabel || 'Unknown'}
      </span>
      <span className="font-mono text-slate-500">
        {opts.sourceId} · {opts.sourceKind}
      </span>
      {opts.sourceUrl ? (
        <a
          href={opts.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sky-700 hover:underline font-medium"
        >
          <ExternalLink size={11} />
          Open page
        </a>
      ) : null}
    </div>
  );
}

export default function HouseGuideImportPanel({
  formData,
  contentLocale,
  primaryLocale,
  onApply,
  disabled = false,
  initialImportText = '',
  initialFiles = [],
  fromWizard = false,
  autoAnalyze = false,
  footerActions,
}: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoAnalyzeStarted = useRef(false);

  const [importText, setImportText] = useState(initialImportText);
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<HouseGuideImportResult | null>(null);
  const [showWizardBanner, setShowWizardBanner] = useState(fromWizard);
  const [progressSteps, setProgressSteps] = useState<AnalyzeProgressStep[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [showPlacementReview, setShowPlacementReview] = useState(false);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('high');
  const [recoveryDrafts, setRecoveryDrafts] = useState<Record<string, string>>({});
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [importFinished, setImportFinished] = useState(false);
  const [autoImport, setAutoImport] = useState<AutoImportToggles>(DEFAULT_AUTO_IMPORT);
  const [progressMode, setProgressMode] = useState<'analyze' | 'reanalyze'>('analyze');
  const [footerBusy, setFooterBusy] = useState(false);
  const progressTimerRef = useRef<number | null>(null);
  const hideSourceInputs = fromWizard || autoAnalyze;
  const confidenceLocked = isAnalyzing || recoveryBusy || isApplying || footerBusy;

  const clearProgressTimer = () => {
    if (progressTimerRef.current != null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startProgress = (text: string, files: File[]) => {
    clearProgressTimer();
    const steps = buildAnalyzeProgressSteps(text, files);
    setProgressSteps(steps);
    setProgressIndex(0);
    progressTimerRef.current = window.setInterval(() => {
      setProgressIndex((i) => {
        if (i >= steps.length - 1) return i;
        return i + 1;
      });
    }, 2200);
  };

  const stopProgress = () => {
    clearProgressTimer();
    setProgressSteps([]);
    setProgressIndex(0);
  };

  useEffect(() => () => clearProgressTimer(), []);

  useEffect(() => {
    if (!initialImportText.trim()) return;
    setImportText((prev) => (prev.trim() ? prev : initialImportText));
  }, [initialImportText]);

  useEffect(() => {
    if (!initialFiles.length) return;
    setSelectedFiles((prev) => (prev.length ? prev : initialFiles));
  }, [initialFiles]);

  useEffect(() => {
    if (!fromWizard) return;
    setShowWizardBanner(true);
    window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }, [fromWizard]);

  useEffect(() => {
    if (!result) {
      setAutoImport(DEFAULT_AUTO_IMPORT);
      return;
    }
    const total = result.assignments.length + result.questions.length;
    if (total <= 1) {
      setAutoImport({
        high: result.assignments.some((a) => a.confidence === 'high'),
        medium: result.assignments.some((a) => a.confidence === 'medium'),
        low: result.assignments.some((a) => a.confidence === 'low'),
        questions: result.questions.length > 0,
      });
      return;
    }
    setAutoImport(DEFAULT_AUTO_IMPORT);
  }, [result]);

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

  const runAnalyze = async (
    text: string,
    files: File[],
    opts?: { keepResultOnError?: boolean; reanalyze?: boolean }
  ): Promise<boolean> => {
    if (!text.trim() && files.length === 0) {
      toast.warning('Paste text or upload at least one file.');
      return false;
    }

    const previousResult = result;
    setProgressMode(opts?.reanalyze ? 'reanalyze' : 'analyze');
    setIsAnalyzing(true);
    setShowPlacementReview(false);
    if (!opts?.keepResultOnError) {
      setResult(null);
      setRecoveryDrafts({});
    }
    startProgress(text, files);
    window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    try {
      const prepared = await Promise.all(files.map((f) => prepareImportSource(f)));
      const analyzed = await analyzeHouseGuideImport({
        pastedText: text,
        files: prepared,
        contentLocale,
      });

      if (analyzed.assignments.length === 0 && analyzed.questions.length === 0) {
        toast.warning(
          'AI could not map any content to house guide fields. Try more detail or pick fields manually.'
        );
      }

      setResult(analyzed);
      setShowPlacementReview(false);
      setRecoveryDrafts({});
      setImportFinished(false);
      return true;
    } catch (err) {
      console.error('house guide import:', err);
      if (opts?.keepResultOnError && previousResult) {
        setResult(previousResult);
      }
      const message =
        err instanceof Error ? err.message : 'AI import failed.';
      const busy =
        /high demand|busy|try again|resource-exhausted|quota|rate limit/i.test(message);
      toast.error(
        busy
          ? 'AI is busy right now. Wait a few seconds, then click Add & re-analyse all again.'
          : message
      );
      return false;
    } finally {
      stopProgress();
      setIsAnalyzing(false);
      setProgressMode('analyze');
    }
  };

  const handleAnalyze = async () => {
    await runAnalyze(importText, selectedFiles);
  };

  useEffect(() => {
    if (!(autoAnalyze || fromWizard)) return;
    if (autoAnalyzeStarted.current) return;
    const seed = importText.trim() || initialImportText.trim();
    const files = selectedFiles.length ? selectedFiles : initialFiles;
    if (!seed && files.length === 0) return;
    autoAnalyzeStarted.current = true;
    if (!importText.trim() && seed) setImportText(seed);
    if (!selectedFiles.length && files.length) setSelectedFiles(files);
    void runAnalyze(seed, files);
    // Intentionally once when wizard seed is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoAnalyze,
    fromWizard,
    importText,
    initialImportText,
    selectedFiles,
    initialFiles,
    contentLocale,
  ]);

  const handleApply = async (mode: 'high' | 'selected' = 'selected') => {
    if (!result || isApplying) return;

    const enabledAssignments =
      mode === 'high'
        ? result.assignments.filter((a) => a.confidence === 'high')
        : confidenceFilter === 'questions'
          ? []
          : result.assignments.filter(
              (a) => a.enabled && a.confidence === confidenceFilter
            );
    const enabledQuestions =
      mode === 'high'
        ? []
        : confidenceFilter === 'questions'
          ? result.questions.filter(
              (q) => q.enabled && q.resolvedCategoryId && q.resolvedFieldId
            )
          : [];

    if (enabledAssignments.length === 0 && enabledQuestions.length === 0) {
      toast.warning(
        mode === 'high'
          ? 'No high-confidence placements to add automatically.'
          : 'Select at least one placement to apply.'
      );
      return;
    }

    if (mode !== 'high') {
      const unresolved = result.questions.filter(
        (q) => q.enabled && (!q.resolvedCategoryId || !q.resolvedFieldId)
      );
      if (unresolved.length > 0) {
        toast.warning('Choose a category and field for all enabled uncertain items.');
        return;
      }
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
        mode === 'high'
          ? `Added ${count} high-confidence placement${count === 1 ? '' : 's'} automatically.`
          : `Saved ${count} placement${count === 1 ? '' : 's'} to the house guide.`
      );
      setImportFinished(true);
      setShowPlacementReview(false);
      if (mode === 'high') {
        // Keep medium/low + questions for optional review.
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            assignments: prev.assignments
              .filter((a) => a.confidence !== 'high')
              .map((a) => ({ ...a, enabled: true })),
          };
        });
      } else if (confidenceFilter === 'questions') {
        const appliedIds = new Set(enabledQuestions.map((q) => q.id));
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            questions: prev.questions.filter((q) => !appliedIds.has(q.id)),
          };
        });
      } else {
        const appliedIds = new Set(enabledAssignments.map((a) => a.id));
        setResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            assignments: prev.assignments.filter((a) => !appliedIds.has(a.id)),
          };
        });
      }
    } catch (err) {
      console.error('house guide import apply:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const resetReview = () => {
    setResult(null);
    setShowPlacementReview(false);
    setConfidenceFilter('high');
    setRecoveryDrafts({});
    setRecoveryBusy(false);
    setImportFinished(false);
    setAutoImport(DEFAULT_AUTO_IMPORT);
  };

  const applyAutoImportToggles = async (): Promise<boolean> => {
    if (!result || isApplying) return false;

    const enabledAssignments = result.assignments
      .filter((a) => {
        if (a.confidence === 'high') return autoImport.high;
        if (a.confidence === 'medium') return autoImport.medium;
        if (a.confidence === 'low') return autoImport.low;
        return false;
      })
      .map((a) => ({ ...a, enabled: true }));

    const unresolvedQuestions = autoImport.questions
      ? result.questions.filter((q) => !q.resolvedCategoryId || !q.resolvedFieldId)
      : [];
    if (unresolvedQuestions.length > 0) {
      toast.warning(
        'Unclear items are set to import automatically — choose a category and field for each, or turn that toggle off.'
      );
      setConfidenceFilter('questions');
      setShowPlacementReview(true);
      return false;
    }

    const enabledQuestions = autoImport.questions
      ? result.questions
          .filter((q) => q.resolvedCategoryId && q.resolvedFieldId)
          .map((q) => ({ ...q, enabled: true }))
      : [];

    if (enabledAssignments.length === 0 && enabledQuestions.length === 0) {
      return true;
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
        `Imported ${count} placement${count === 1 ? '' : 's'} from the selected confidence levels.`
      );
      setImportFinished(true);
      setShowPlacementReview(false);
      setResult((prev) => {
        if (!prev) return prev;
        const appliedAssignmentIds = new Set(enabledAssignments.map((a) => a.id));
        const appliedQuestionIds = new Set(enabledQuestions.map((q) => q.id));
        return {
          ...prev,
          assignments: prev.assignments.filter((a) => !appliedAssignmentIds.has(a.id)),
          questions: prev.questions.filter((q) => !appliedQuestionIds.has(q.id)),
        };
      });
      return true;
    } catch (err) {
      console.error('house guide import apply:', err);
      toast.error('Could not save. Please try again.');
      return false;
    } finally {
      setIsApplying(false);
    }
  };

  const handleFooterAction = async (action: () => void) => {
    if (confidenceLocked) return;
    setFooterBusy(true);
    try {
      const ok = await applyAutoImportToggles();
      if (!ok) return;
      action();
    } finally {
      setFooterBusy(false);
    }
  };

  const pasteRecoveryFromClipboard = async (sourceId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.warning('Clipboard is empty. Open the page, press Ctrl+A then Ctrl+C, and try again.');
        return;
      }
      setRecoveryDrafts((prev) => ({ ...prev, [sourceId]: text }));
      toast.success('Pasted from clipboard.');
    } catch {
      toast.error(
        'Could not read clipboard. Paste into the box with Ctrl+V, then use Add & re-analyse all.'
      );
    }
  };

  const addAllRecoveriesAndReanalyse = async () => {
    if (!result) return;
    const failed = result.sources.filter(isRecoverableFailedSource);
    const blocks: string[] = [];
    for (const source of failed) {
      const pasted = (recoveryDrafts[source.id] || '').trim();
      if (!pasted || !source.url) continue;
      blocks.push(buildManualRecoveryBlock(source.label, source.url, pasted));
    }
    if (!blocks.length) {
      toast.info('No pasted pages yet — continuing with what already parsed.');
      return;
    }

    const nextText = `${importText.trim()}\n${blocks.join('\n')}`.trim();
    setRecoveryBusy(true);
    setShowPlacementReview(false);
    try {
      const ok = await runAnalyze(nextText, selectedFiles, {
        keepResultOnError: true,
        reanalyze: true,
      });
      if (ok) {
        setImportText(nextText);
        toast.success('Added pasted pages and re-checked placements & confidence.');
      }
    } finally {
      setRecoveryBusy(false);
    }
  };

  const openReview = (filter: ConfidenceFilter) => {
    setConfidenceFilter(filter);
    setShowPlacementReview(true);
  };

  return (
    <div
      ref={panelRef}
      id="house-guide-ai-import"
      className={`mt-10 bg-white rounded-3xl border shadow-sm overflow-hidden ${
        showWizardBanner ? 'border-amber-300 ring-2 ring-amber-100' : 'border-vailo-teal/15'
      }`}
    >
      {showWizardBanner ? (
        <div className="px-6 py-4 border-b border-amber-200 bg-amber-50" role="status">
          <p className="text-sm font-bold text-amber-950 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-700" />
            <span>
              Your listing is saved. AI Import is running from your notes, links, and files — this can
              take a minute.
            </span>
          </p>
          <button
            type="button"
            className="mt-2 ml-6 text-xs font-semibold text-amber-800 hover:underline"
            onClick={() => setShowWizardBanner(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-vailo-teal/[0.04] to-transparent">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={20} className="text-vailo-gold" />
          AI Import Assistant
        </h2>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          {hideSourceInputs
            ? `AI is sorting your wizard sources into House Guide categories in ${contentLocale.toUpperCase()}. This often takes 30–90 seconds — please keep this page open.`
            : `Paste notes or upload files (PDF, text, photos). AI will sort content into house guide categories and write it in the active language tab (${contentLocale.toUpperCase()}) — source text in other languages is translated automatically. You review and confirm before anything is placed.`}
        </p>
      </div>

      {isAnalyzing ? (
        <div className="mx-6 mt-5 mb-2 rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-sky-50 p-5">
          <div className="flex items-start gap-3">
            <span className="h-10 w-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <Loader2 size={20} className="animate-spin" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-teal-950">
                {progressMode === 'reanalyze'
                  ? 'Re-analysing pasted pages'
                  : 'AI Import in progress'}
              </p>
              <p className="text-sm text-teal-900/80 mt-1 leading-relaxed">
                {progressMode === 'reanalyze'
                  ? 'Merging your pasted page text, re-checking placements, and refreshing confidence — hang tight.'
                  : 'This can take a little while. We fetch pages, read files, and map facts into guide fields — hang tight.'}
              </p>
              <ul className="mt-4 space-y-2.5">
                {progressSteps.map((step, index) => {
                  const done = index < progressIndex;
                  const active = index === progressIndex;
                  return (
                    <li
                      key={step.id}
                      className={`flex items-center gap-2.5 text-sm ${
                        active
                          ? 'text-teal-900 font-semibold'
                          : done
                            ? 'text-teal-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      ) : active ? (
                        <Loader2 size={16} className="text-teal-600 animate-spin shrink-0" />
                      ) : (
                        <Globe size={16} className="text-slate-300 shrink-0" />
                      )}
                      <span>{step.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {!hideSourceInputs ? (
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
      ) : null}

      {!hideSourceInputs || result ? (
        <div className="px-6 pb-6 flex flex-wrap gap-3">
          {!hideSourceInputs ? (
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
              {isAnalyzing ? 'Analysing…' : result ? 'Re-analyse with AI' : 'Analyse with AI'}
            </button>
          ) : null}
          {result ? (
            <button
              type="button"
              onClick={resetReview}
              className="px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel review
            </button>
          ) : null}
        </div>
      ) : null}

      {result && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-6 space-y-6">
          <div className="flex items-start gap-3">
            <Bot size={20} className="text-vailo-teal shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-gray-900">AI summary</p>
              <p className="text-sm text-gray-600 mt-1">{result.summary}</p>
            </div>
          </div>

          {result.sources.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                <p className="text-sm font-bold text-sky-950">Sources</p>
                <ul className="mt-2 space-y-1.5">
                  {result.sources.map((s) => (
                    <li
                      key={s.id}
                      className="text-sm text-sky-950 flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      {s.fetchStatus === 'ok' || s.kind !== 'url' ? (
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="text-amber-500 shrink-0" />
                      )}
                      <span className="font-semibold">{s.label}</span>
                      <span className="text-xs uppercase tracking-wider text-sky-700/80">
                        {s.kind}
                        {s.fetchStatus ? ` · ${s.fetchStatus}` : ''}
                      </span>
                      {s.fetchNote ? (
                        <span className="text-xs text-sky-800/80 w-full pl-5">{s.fetchNote}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              {result.sources.some(isRecoverableFailedSource) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-amber-950 flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-600 shrink-0" />
                      Some pages couldn’t be fetched
                    </p>
                    <p className="text-sm text-amber-900/90 mt-2 leading-relaxed">
                      Optional: paste into any boxes below, then click{' '}
                      <span className="font-bold">Add &amp; re-analyse all</span> once. If you skip
                      pasting, continue normally with what already parsed.
                    </p>
                    <ol className="mt-2 space-y-1 text-sm text-amber-950 list-decimal list-inside">
                      <li>Open a failed page</li>
                      <li>
                        <kbd className="px-1.5 py-0.5 rounded bg-white border text-xs font-mono">Ctrl+A</kbd>{' '}
                        then{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-white border text-xs font-mono">Ctrl+C</kbd>
                      </li>
                      <li>Paste into that page’s box</li>
                      <li>Repeat for other pages, then re-analyse all together</li>
                    </ol>
                  </div>

                  {result.sources.filter(isRecoverableFailedSource).map((s) => (
                    <div
                      key={`recover-${s.id}`}
                      className="rounded-xl border border-amber-200/80 bg-white p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-sm font-bold text-slate-800">{s.label}</p>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-teal-800 hover:underline inline-flex items-center gap-1"
                        >
                          Open page <ExternalLink size={11} />
                        </a>
                      </div>
                      <textarea
                        value={recoveryDrafts[s.id] || ''}
                        onChange={(e) =>
                          setRecoveryDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        rows={3}
                        placeholder="Paste this page’s text here (optional)…"
                        disabled={disabled || isAnalyzing || isApplying || recoveryBusy}
                        className="w-full px-3 py-2 border border-amber-200 rounded-xl text-sm text-slate-800 bg-amber-50/40 focus:ring-2 focus:ring-amber-200 outline-none disabled:opacity-50"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void pasteRecoveryFromClipboard(s.id)}
                          disabled={disabled || isAnalyzing || isApplying || recoveryBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <ClipboardPaste size={14} />
                          Paste
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRecoveryDrafts((prev) => ({ ...prev, [s.id]: '' }))
                          }
                          disabled={
                            disabled ||
                            isAnalyzing ||
                            isApplying ||
                            recoveryBusy ||
                            !(recoveryDrafts[s.id] || '').trim()
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Clear pasted
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void addAllRecoveriesAndReanalyse()}
                      disabled={
                        disabled ||
                        isAnalyzing ||
                        isApplying ||
                        recoveryBusy ||
                        !Object.values(recoveryDrafts).some((v) => v.trim())
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-50"
                    >
                      {recoveryBusy ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Bot size={15} />
                      )}
                      {recoveryBusy ? 'Re-analysing all…' : 'Add & re-analyse all'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryDrafts({});
                        toast.info('Continuing with what already parsed.');
                      }}
                      disabled={disabled || isAnalyzing || isApplying || recoveryBusy}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-300 bg-white text-amber-950 text-sm font-bold hover:bg-amber-100 disabled:opacity-50"
                    >
                      Skip paste — continue normally
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {(() => {
            const highCount = result.assignments.filter((a) => a.confidence === 'high').length;
            const mediumCount = result.assignments.filter((a) => a.confidence === 'medium').length;
            const lowCount = result.assignments.filter((a) => a.confidence === 'low').length;
            const questionCount = result.questions.length;
            const totalResults = highCount + mediumCount + lowCount + questionCount;
            const showAutoToggles = totalResults > 1;
            const boxes: {
              key: keyof AutoImportToggles;
              filter: ConfidenceFilter;
              label: string;
              count: number;
              border: string;
              labelClass: string;
              showBtn: string;
            }[] = [
              {
                key: 'high',
                filter: 'high',
                label: 'High',
                count: highCount,
                border: 'border-emerald-200',
                labelClass: 'text-emerald-700',
                showBtn: 'text-emerald-800',
              },
              {
                key: 'medium',
                filter: 'medium',
                label: 'Medium',
                count: mediumCount,
                border: 'border-amber-200',
                labelClass: 'text-amber-700',
                showBtn: 'text-amber-800',
              },
              {
                key: 'low',
                filter: 'low',
                label: 'Low',
                count: lowCount,
                border: 'border-rose-200',
                labelClass: 'text-rose-700',
                showBtn: 'text-rose-800',
              },
              {
                key: 'questions',
                filter: 'questions',
                label: 'Unclear',
                count: questionCount,
                border: 'border-slate-200',
                labelClass: 'text-slate-600',
                showBtn: 'text-slate-700',
              },
            ];
            return (
              <div
                className={`space-y-3 ${
                  confidenceLocked ? 'opacity-50 pointer-events-none select-none' : ''
                }`}
                aria-disabled={confidenceLocked}
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">Confidence</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {confidenceLocked
                      ? 'Confidence is paused while AI is working…'
                      : showAutoToggles
                        ? 'Choose which confidence levels to import automatically when you continue or finish. High starts on.'
                        : 'Review placements by confidence level.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {boxes.map((box) => (
                    <div
                      key={box.key}
                      className={`rounded-2xl border ${box.border} bg-white p-4 shadow-sm`}
                    >
                      <p
                        className={`text-[11px] font-bold uppercase tracking-wider ${box.labelClass}`}
                      >
                        {box.label}
                      </p>
                      <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                        {box.count}
                      </p>
                      {showAutoToggles && box.count > 0 ? (
                        <label className="mt-3 flex items-center justify-between gap-2 cursor-pointer">
                          <span className="text-[11px] font-semibold text-slate-600 leading-tight">
                            Import automatically
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={autoImport[box.key]}
                            onClick={() =>
                              setAutoImport((prev) => ({
                                ...prev,
                                [box.key]: !prev[box.key],
                              }))
                            }
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                              autoImport[box.key] ? 'bg-teal-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                autoImport[box.key] ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openReview(box.filter)}
                        disabled={box.count === 0 || confidenceLocked}
                        className={`mt-3 w-full text-xs font-bold ${box.showBtn} hover:underline disabled:opacity-40`}
                      >
                        Show {box.label.toLowerCase()} only
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {showPlacementReview && !confidenceLocked ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['high', 'High'],
                      ['medium', 'Medium'],
                      ['low', 'Low'],
                      ['questions', 'Unclear'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setConfidenceFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                        confidenceFilter === key
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlacementReview(false)}
                  className="text-xs font-bold text-teal-800 hover:underline"
                >
                  Hide review
                </button>
              </div>

              {confidenceFilter !== 'questions' ? (
                <div className="space-y-3">
                  {result.assignments.filter((a) => a.confidence === confidenceFilter)
                    .length === 0 ? (
                    <p className="text-sm text-slate-500">No placements in this confidence level.</p>
                  ) : null}
                  {result.assignments
                    .filter((a) => a.confidence === confidenceFilter)
                    .map((a) => (
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
                            onChange={(e) =>
                              updateAssignment(a.id, { enabled: e.target.checked })
                            }
                            className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                          />
                          Include this placement
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {a.categoryId}/{a.fieldId}
                          </span>
                          {confidenceBadge(a.confidence)}
                        </div>
                      </div>

                      <div className="mb-3">
                        {sourceBadge({
                          sourceId: a.sourceId,
                          sourceLabel: a.sourceLabel,
                          sourceKind: a.sourceKind,
                          sourceUrl: a.sourceUrl,
                        })}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1">
                            Category
                          </label>
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

                      {a.fieldType === 'textarea' ? (
                        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap border border-gray-100">
                          {a.content}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-gray-500">
                            Parsed items ({a.items?.length || 0})
                          </p>
                          <pre className="text-xs text-gray-700 bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto border border-slate-800 whitespace-pre-wrap font-mono">
                            {JSON.stringify(a.items || [], null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-3">
                    Needs your decision ({result.questions.length})
                  </p>
                  {result.questions.length === 0 ? (
                    <p className="text-sm text-slate-500">No unclear items.</p>
                  ) : null}
                  <div className="space-y-3">
                    {result.questions.map((q) => (
                      <div
                        key={q.id}
                        className="bg-white border border-amber-200/80 rounded-xl p-4"
                      >
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
                        <p className="text-xs text-amber-700 mb-2">{q.reason}</p>
                        <div className="mb-3">
                          {sourceBadge({
                            sourceId: q.sourceId,
                            sourceLabel: q.sourceLabel,
                            sourceKind: q.sourceKind,
                            sourceUrl: q.sourceUrl,
                          })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">
                              Category
                            </label>
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
                            <label className="block text-xs font-bold text-gray-500 mb-1">
                              Field
                            </label>
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
                onClick={() => void handleApply('selected')}
                disabled={disabled || isApplying}
                className="px-8 py-3 bg-gray-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-colors flex items-center shadow-md disabled:opacity-50"
              >
                {isApplying ? (
                  <Loader2 size={18} className="mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 size={18} className="mr-2" />
                )}
                {isApplying
                  ? 'Saving…'
                  : `Confirm & place ${confidenceFilter === 'questions' ? 'unclear items' : `${confidenceFilter} confidence`}`}
              </button>
            </>
          ) : null}

          {footerActions && !confidenceLocked ? (
            <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-amber-50/40 p-5">
              <p className="text-sm font-bold text-slate-900">What’s next?</p>
              <p className="text-sm text-slate-600 mt-1">
                {importFinished
                  ? 'Add another listing under this property, or finish setup.'
                  : 'Continue or finish will import the confidence levels toggled on above, then take you there.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled || footerBusy || isApplying}
                  onClick={() => void handleFooterAction(footerActions.onContinueListing)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-50"
                >
                  {footerBusy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Home size={16} />
                  )}
                  Continue — add next listing
                </button>
                <button
                  type="button"
                  disabled={disabled || footerBusy || isApplying}
                  onClick={() => void handleFooterAction(footerActions.onFinishHouseGuide)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                >
                  <BookOpen size={16} />
                  Finish — open House Guide
                </button>
                <button
                  type="button"
                  disabled={disabled || footerBusy || isApplying}
                  onClick={() => void handleFooterAction(footerActions.onFinishProperties)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
                >
                  Finish — back to Properties
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {!result && importFinished && footerActions && !confidenceLocked ? (
        <div className="px-6 pb-6">
          <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-amber-50/40 p-5">
            <p className="text-sm font-bold text-slate-900">What’s next?</p>
            <p className="text-sm text-slate-600 mt-1">
              Continue to add another listing, or finish setup.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled || footerBusy}
                onClick={() => void handleFooterAction(footerActions.onContinueListing)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-50"
              >
                <Home size={16} />
                Continue — add next listing
              </button>
              <button
                type="button"
                disabled={disabled || footerBusy}
                onClick={() => void handleFooterAction(footerActions.onFinishHouseGuide)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                <BookOpen size={16} />
                Finish — open House Guide
              </button>
              <button
                type="button"
                disabled={disabled || footerBusy}
                onClick={() => void handleFooterAction(footerActions.onFinishProperties)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                Finish — back to Properties
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
