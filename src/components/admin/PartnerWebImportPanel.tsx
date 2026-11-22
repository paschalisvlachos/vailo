import { useMemo, useState } from 'react';
import { Layers, Link as LinkIcon, Loader2, Wand2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import {
  chunkUrls,
  discoverPartnerServicesFromPage,
  extractPartnersFromPages,
  type PartnerImportDraft,
  type PartnerImportServiceHit,
} from '../../lib/partnerImportAi';
import { AdminButton } from './AdminPageHeader';

type Props = {
  variant: 'bulk' | 'page';
  areaName: string;
  country?: string;
  categories: string[];
  onChangeMethod: () => void;
  /** Single service page → fill the form for review/save. */
  onSingleDraft?: (draft: PartnerImportDraft) => void;
  /** Bulk import → parent persists drafts (e.g. addDoc). */
  onBulkDrafts?: (drafts: PartnerImportDraft[]) => Promise<void>;
};

export default function PartnerWebImportPanel({
  variant,
  areaName,
  country,
  categories,
  onChangeMethod,
  onSingleDraft,
  onBulkDrafts,
}: Props) {
  const toast = useToast();
  const [pageUrl, setPageUrl] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [services, setServices] = useState<PartnerImportServiceHit[] | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  const allSelected = useMemo(
    () => !!services?.length && services.every((s) => selectedUrls.has(s.url)),
    [services, selectedUrls]
  );

  const normalizeInputUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return new URL(trimmed).toString();
    } catch {
      return null;
    }
  };

  const handleDiscover = async () => {
    const url = normalizeInputUrl(pageUrl);
    if (!url) {
      toast.warning('Enter a valid services page URL (including https://).');
      return;
    }
    if (!areaName) {
      toast.warning('Property area is required before importing from the web.');
      return;
    }
    setIsWorking(true);
    setProgressLabel('Scanning page for services…');
    setServices(null);
    setSelectedUrls(new Set());
    try {
      const result = await discoverPartnerServicesFromPage({
        pageUrl: url,
        areaName,
        country,
      });
      setPageUrl(result.indexUrl || url);
      setServices(result.services);
      setSelectedUrls(new Set(result.services.map((s) => s.url)));
      if (result.services.length === 0) {
        toast.warning('No services found on that page.');
      } else {
        toast.success(`Found ${result.services.length} service${result.services.length === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not scan that page.');
    } finally {
      setIsWorking(false);
      setProgressLabel('');
    }
  };

  const handleExtractSingle = async () => {
    const url = normalizeInputUrl(pageUrl);
    if (!url) {
      toast.warning('Enter a valid service page URL (including https://).');
      return;
    }
    if (!areaName) {
      toast.warning('Property area is required before importing from the web.');
      return;
    }
    if (categories.length === 0) {
      toast.warning('Add Partner Categories for this area first.');
      return;
    }
    if (!onSingleDraft) return;

    setIsWorking(true);
    setProgressLabel('Reading service page…');
    try {
      const result = await extractPartnersFromPages({
        urls: [url],
        areaName,
        country,
        categories,
      });
      const draft = result.partners[0];
      if (!draft) {
        const note = result.failures[0]?.note || 'Nothing usable was found on that page.';
        toast.error(note);
        return;
      }
      onSingleDraft(draft);
      toast.success('Partner details filled from the page. Review and save.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not import that page.');
    } finally {
      setIsWorking(false);
      setProgressLabel('');
    }
  };

  const toggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (!services) return;
    if (allSelected) setSelectedUrls(new Set());
    else setSelectedUrls(new Set(services.map((s) => s.url)));
  };

  const handleBulkImport = async () => {
    if (!onBulkDrafts || !services) return;
    const urls = services.map((s) => s.url).filter((u) => selectedUrls.has(u));
    if (urls.length === 0) {
      toast.warning('Select at least one service to import.');
      return;
    }
    if (categories.length === 0) {
      toast.warning('Add Partner Categories for this area first.');
      return;
    }

    setIsWorking(true);
    const drafts: PartnerImportDraft[] = [];
    const failures: { url: string; note: string }[] = [];
    const batches = chunkUrls(urls, 6);

    try {
      for (let i = 0; i < batches.length; i += 1) {
        setProgressLabel(`Importing batch ${i + 1} of ${batches.length}…`);
        // eslint-disable-next-line no-await-in-loop
        const result = await extractPartnersFromPages({
          urls: batches[i],
          areaName,
          country,
          categories,
        });
        drafts.push(...result.partners);
        failures.push(...result.failures);
      }

      if (drafts.length === 0) {
        toast.error(failures[0]?.note || 'No partners could be imported from the selected pages.');
        return;
      }

      setProgressLabel(`Saving ${drafts.length} partner${drafts.length === 1 ? '' : 's'}…`);
      await onBulkDrafts(drafts);

      const failNote =
        failures.length > 0
          ? ` ${failures.length} page${failures.length === 1 ? '' : 's'} failed.`
          : '';
      toast.success(`Added ${drafts.length} partner${drafts.length === 1 ? '' : 's'}.${failNote}`);
      setServices(null);
      setSelectedUrls(new Set());
      setPageUrl('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setIsWorking(false);
      setProgressLabel('');
    }
  };

  if (variant === 'page') {
    return (
      <div className="mb-8 bg-vailo-teal/5 p-4 rounded-xl border border-vailo-teal/15 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider">
            Single service page URL
          </label>
          <button
            type="button"
            onClick={onChangeMethod}
            className="text-xs font-medium text-vailo-teal hover:underline shrink-0"
          >
            Change method
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
          <div className="relative flex-1 min-w-0">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-vailo-teal/50 pointer-events-none" size={18} />
            <input
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://example.com/services/private-airport-transfers/"
              className="box-border w-full h-11 pl-10 pr-4 bg-white border border-vailo-teal/15 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none text-sm"
              disabled={isWorking}
            />
          </div>
          <AdminButton
            type="button"
            variant="accent"
            onClick={() => void handleExtractSingle()}
            disabled={isWorking || !pageUrl.trim()}
            className="box-border w-full sm:w-auto h-11 !py-0 shrink-0"
          >
            {isWorking ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {isWorking ? progressLabel || 'Importing…' : 'Import from page'}
          </AdminButton>
        </div>
        <p className="text-xs text-gray-500">
          Import one partner from a detail page, then review and save.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="bg-vailo-teal/5 p-4 rounded-xl border border-vailo-teal/15 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider">
            Services listing page URL
          </label>
          <button
            type="button"
            onClick={onChangeMethod}
            className="text-xs font-medium text-vailo-teal hover:underline shrink-0"
          >
            Change method
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
          <div className="relative flex-1 min-w-0">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-vailo-teal/50 pointer-events-none" size={18} />
            <input
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://example.com/our-services/"
              className="box-border w-full h-11 pl-10 pr-4 bg-white border border-vailo-teal/15 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none text-sm"
              disabled={isWorking}
            />
          </div>
          <AdminButton
            type="button"
            variant="accent"
            onClick={() => void handleDiscover()}
            disabled={isWorking || !pageUrl.trim()}
            className="box-border w-full sm:w-auto h-11 !py-0 shrink-0"
          >
            {isWorking && !services ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {isWorking && !services ? progressLabel || 'Scanning…' : 'Find services'}
          </AdminButton>
        </div>
        <p className="text-xs text-gray-500">
          Scan a services overview page, pick which ones to import, then add them in bulk.
        </p>
      </div>

      {services && services.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                disabled={isWorking}
              />
              Select all ({selectedUrls.size}/{services.length})
            </label>
            <AdminButton
              type="button"
              variant="accent"
              onClick={() => void handleBulkImport()}
              disabled={isWorking || selectedUrls.size === 0}
            >
              {isWorking ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
              {isWorking ? progressLabel || 'Importing…' : `Import ${selectedUrls.size} selected`}
            </AdminButton>
          </div>
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {services.map((service) => (
              <li key={service.url} className="px-4 py-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedUrls.has(service.url)}
                  onChange={() => toggleUrl(service.url)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                  disabled={isWorking}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{service.title}</p>
                  {service.summary ? (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{service.summary}</p>
                  ) : null}
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-vailo-teal hover:underline break-all"
                  >
                    {service.url}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
