import { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Loader2, Search, X } from 'lucide-react';
import { useAdminSession } from '../../context/AdminSessionContext';
import {
  copiedGemsSummary,
  pasteGemsToTargets,
  type CopiedPropertyGems,
} from '../../lib/propertyGemCopy';
import {
  groupGemPasteTargetsByProperty,
  loadGemPasteTargets,
  type GemPasteTarget,
} from '../../lib/propertyGemPasteTargets';
import { AdminButton, AdminInput } from './AdminPageHeader';

type Props = {
  clip: CopiedPropertyGems;
  excludeSource?: { propertyId: string; typeId: string };
  onClose: () => void;
  onPasted: (result: { pasted: number; skipped: number; targets: number }) => void;
};

export default function CopyGemsModal({ clip, excludeSource, onClose, onPasted }: Props) {
  const { profile, scopes, isPlatformAdmin } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<GemPasteTarget[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await loadGemPasteTargets(profile, scopes, excludeSource);
        if (cancelled) return;
        setTargets(loaded);
        setSelectedKeys(new Set(loaded.map((t) => `${t.propertyId}:${t.typeId}`)));
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Could not load destination listings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, scopes, excludeSource?.propertyId, excludeSource?.typeId]);

  const filteredGroups = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const filtered = q
      ? targets.filter(
          (t) =>
            t.propertyName.toLowerCase().includes(q) ||
            t.listingName.toLowerCase().includes(q)
        )
      : targets;
    return groupGemPasteTargetsByProperty(filtered);
  }, [targets, searchText]);

  const filteredTargets = useMemo(
    () => filteredGroups.flatMap((g) => g.listings),
    [filteredGroups]
  );

  const allFilteredSelected =
    filteredTargets.length > 0 &&
    filteredTargets.every((t) => selectedKeys.has(`${t.propertyId}:${t.typeId}`));

  const toggleTarget = (target: GemPasteTarget) => {
    const key = `${target.propertyId}:${target.typeId}`;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const t of filteredTargets) next.delete(`${t.propertyId}:${t.typeId}`);
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const t of filteredTargets) next.add(`${t.propertyId}:${t.typeId}`);
        return next;
      });
    }
  };

  const handlePaste = async () => {
    const selected = targets.filter((t) => selectedKeys.has(`${t.propertyId}:${t.typeId}`));
    if (selected.length === 0) return;

    setIsPasting(true);
    setError('');
    try {
      const result = await pasteGemsToTargets({ gems: clip.gems, targets: selected });
      onPasted(result);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Paste failed. Please try again.');
    } finally {
      setIsPasting(false);
    }
  };

  const scopeHint = isPlatformAdmin
    ? 'Paste to any property listing in the platform.'
    : 'Paste to listings on properties you manage. Existing gems are skipped automatically.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-gems-modal-title"
      onClick={() => !isPasting && onClose()}
    >
      <div
        className="bg-white w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-vailo-teal/10 bg-vailo-teal/5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="copy-gems-modal-title" className="text-lg font-bold text-vailo-dark">
              Paste gems to listings
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              {clip.gems.length} gem{clip.gems.length === 1 ? '' : 's'} copied
              {clip.sourceListingName ? ` from ${clip.sourceListingName}` : ''}:{' '}
              {copiedGemsSummary(clip)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{scopeHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPasting}
            className="p-2 rounded-lg text-gray-500 hover:bg-white/80 transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-gray-500 text-sm">
              <Loader2 size={18} className="animate-spin mr-2" />
              Loading listings…
            </div>
          ) : targets.length === 0 ? (
            <p className="text-sm text-gray-600 py-8 text-center">
              No destination listings available for your account.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[12rem]">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <AdminInput
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search property or listing…"
                    className="pl-9 py-2 text-sm"
                    aria-label="Search destination listings"
                  />
                </div>
                {filteredTargets.length > 0 && (
                  <AdminButton
                    type="button"
                    variant="secondary"
                    onClick={toggleSelectAllFiltered}
                    className="text-xs py-2 px-3 shrink-0"
                  >
                    {allFilteredSelected ? 'Deselect all' : 'Select all'}
                  </AdminButton>
                )}
              </div>

              <div className="space-y-4">
                {filteredGroups.map((group) => (
                  <div key={group.propertyId} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <p className="text-sm font-bold text-gray-900">{group.propertyName}</p>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {group.listings.map((listing) => {
                        const key = `${listing.propertyId}:${listing.typeId}`;
                        const checked = selectedKeys.has(key);
                        return (
                          <li key={key}>
                            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTarget(listing)}
                                className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                              />
                              <span className="text-sm text-gray-800">{listing.listingName}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <AdminButton
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPasting}
            className="w-full sm:w-auto"
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="button"
            onClick={handlePaste}
            disabled={isPasting || loading || selectedKeys.size === 0}
            className="w-full sm:w-auto"
          >
            {isPasting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ClipboardPaste size={16} />
            )}
            Paste to {selectedKeys.size} listing{selectedKeys.size === 1 ? '' : 's'}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
