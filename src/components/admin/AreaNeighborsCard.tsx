import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Link2, Loader2, Save } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import {
  neighborAreaName,
  parseNeighborAreaIds,
  saveAreaNeighborsSymmetric,
} from '../../lib/areaNeighbors';
import { AdminButton, AdminCard } from './AdminPageHeader';

type AreaOption = { id: string; name: string };

type Props = {
  country: string;
  areaId: string;
  areaName: string;
  allAreas: AreaOption[];
};

export default function AreaNeighborsCard({ country, areaId, areaName, allAreas }: Props) {
  const toast = useToast();
  const [storedNeighborIds, setStoredNeighborIds] = useState<string[]>([]);
  const [draftNeighborIds, setDraftNeighborIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const otherAreas = useMemo(
    () => allAreas.filter((a) => a.id !== areaId).sort((a, b) => a.name.localeCompare(b.name)),
    [allAreas, areaId]
  );

  const validAreaIds = useMemo(() => allAreas.map((a) => a.id), [allAreas]);

  useEffect(() => {
    if (!country || !areaId) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'countries', country, 'areas', areaId), (snap) => {
      const ids = parseNeighborAreaIds(snap.exists() ? snap.data() : undefined);
      setStoredNeighborIds(ids);
      setDraftNeighborIds(ids);
      setLoading(false);
    });
    return () => unsub();
  }, [country, areaId]);

  const dirty = useMemo(() => {
    if (draftNeighborIds.length !== storedNeighborIds.length) return true;
    const stored = [...storedNeighborIds].sort();
    const draft = [...draftNeighborIds].sort();
    return draft.some((id, i) => id !== stored[i]);
  }, [draftNeighborIds, storedNeighborIds]);

  const toggleNeighbor = (neighborId: string) => {
    setDraftNeighborIds((prev) =>
      prev.includes(neighborId) ? prev.filter((id) => id !== neighborId) : [...prev, neighborId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveAreaNeighborsSymmetric({
        country,
        areaId,
        nextNeighborIds: draftNeighborIds,
        validAreaIds,
      });
      setStoredNeighborIds(result.savedNeighborIds);
      setDraftNeighborIds(result.savedNeighborIds);

      const names = result.savedNeighborIds.map((id) => neighborAreaName(id, allAreas));
      if (names.length === 0) {
        toast.success(`Nearby regions cleared for ${areaName}.`);
      } else {
        toast.success(
          `Nearby regions saved for ${areaName}: ${names.join(', ')} (synced both ways).`
        );
      }
    } catch (error) {
      console.error(error);
      toast.error('Could not save nearby regions.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminCard className="p-4 sm:p-6 flex items-center justify-center gap-2 text-gray-500 text-sm min-h-[120px]">
        <Loader2 size={16} className="animate-spin" /> Loading nearby regions…
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 sm:pb-6 border-b border-gray-100">
        <div className="min-w-0 pr-0 sm:pr-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={20} className="text-vailo-teal shrink-0" />
            Nearby regions — {areaName}
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
            Direct neighbor areas whose curated content can appear for listings in {areaName} when
            guests are close to the border (distance rules apply on the guest portal). Links are{' '}
            <strong>symmetric</strong>: enabling Rethymno here also adds {areaName} on Rethymno&apos;s
            side.
          </p>
        </div>
        <AdminButton
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="shrink-0 self-start"
        >
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
          Save
        </AdminButton>
      </div>

      {otherAreas.length === 0 ? (
        <p className="text-sm text-gray-500 mt-5">
          Add another area in this country to configure regional overlap.
        </p>
      ) : (
        <div className="mt-5 sm:mt-6 space-y-3">
          <p className="text-sm font-medium text-gray-700">Include content from</p>
          <div className="flex flex-col gap-2">
            {otherAreas.map((area) => {
              const checked = draftNeighborIds.includes(area.id);
              return (
                <label
                  key={area.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    checked
                      ? 'border-vailo-teal/40 bg-vailo-teal/5'
                      : 'border-gray-200 bg-gray-50/80 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleNeighbor(area.id)}
                    className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                  />
                  <span className="text-sm font-medium text-gray-900">{area.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{area.id}</span>
                </label>
              );
            })}
          </div>
          {storedNeighborIds.length > 0 && !dirty && (
            <p className="text-xs text-gray-500 pt-1">
              Active:{' '}
              {storedNeighborIds
                .map((id) => neighborAreaName(id, allAreas))
                .join(', ')}
            </p>
          )}
        </div>
      )}
    </AdminCard>
  );
}
