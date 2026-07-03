import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Copy, Loader2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { loadCountryNames } from '../../lib/countryNames';
import { copyAreaCategories } from '../../lib/copyAreaCategories';
import {
  AdminButton,
  AdminCard,
  AdminLabel,
  AdminSelect,
} from './AdminPageHeader';

type AreaOption = { id: string; name: string };

type Props = {
  targetCountry: string;
  targetAreaId: string;
  targetAreaName: string;
  collectionName: 'localGemsCategories' | 'featuresCategories';
  primaryLocale: string;
  title?: string;
  description?: string;
};

export default function CopyAreaCategoriesCard({
  targetCountry,
  targetAreaId,
  targetAreaName,
  collectionName,
  primaryLocale,
  title = 'Copy categories from another area',
  description = 'Imports category names, translations, Live like a local visibility, and knowledge notes. Categories that already exist here (same English name) are skipped.',
}: Props) {
  const toast = useToast();
  const [countries, setCountries] = useState<string[]>([]);
  const [sourceCountry, setSourceCountry] = useState('');
  const [sourceAreas, setSourceAreas] = useState<AreaOption[]>([]);
  const [sourceAreaId, setSourceAreaId] = useState('');
  const [isLoadingCountries, setIsLoadingCountries] = useState(true);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch((err) => console.error('Failed to load countries:', err))
      .finally(() => setIsLoadingCountries(false));
  }, []);

  useEffect(() => {
    if (!sourceCountry) {
      setSourceAreas([]);
      setSourceAreaId('');
      return;
    }

    const unsub = onSnapshot(collection(db, 'countries', sourceCountry, 'areas'), (snapshot) => {
      const areas = snapshot.docs
        .map((d) => ({
          id: d.id,
          name: String(d.data().name || d.id).trim() || d.id,
        }))
        .filter((a) => !(sourceCountry === targetCountry && a.id === targetAreaId))
        .sort((a, b) => a.name.localeCompare(b.name));
      setSourceAreas(areas);
      setSourceAreaId((prev) => (areas.some((a) => a.id === prev) ? prev : ''));
    });

    return () => unsub();
  }, [sourceCountry, targetCountry, targetAreaId]);

  const handleCopy = async () => {
    if (!sourceCountry || !sourceAreaId) {
      toast.warning('Select a source country and area.');
      return;
    }

    const sourceLabel =
      sourceAreas.find((a) => a.id === sourceAreaId)?.name || sourceAreaId;

    if (
      !window.confirm(
        `Copy categories from ${sourceLabel} (${sourceCountry}) into ${targetAreaName} (${targetCountry})?\n\nExisting categories with the same English name will be left unchanged.`
      )
    ) {
      return;
    }

    setIsCopying(true);
    try {
      const result = await copyAreaCategories({
        collectionName,
        sourceCountry,
        sourceAreaId,
        targetCountry,
        targetAreaId,
        primaryLocale,
      });

      if (result.added === 0 && result.skipped === 0) {
        toast.info('The source area has no categories to copy.');
        return;
      }

      if (result.added === 0) {
        toast.info(
          `No new categories added — all ${result.skipped} already exist in ${targetAreaName}.`
        );
        return;
      }

      const skippedNote =
        result.skipped > 0 ? ` ${result.skipped} skipped (already exist).` : '';
      toast.success(`Added ${result.added} categor${result.added === 1 ? 'y' : 'ies'} to ${targetAreaName}.${skippedNote}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to copy categories.');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <AdminCard padding className="mb-6">
      <div className="flex items-start gap-3 mb-4">
        <Copy className="text-vailo-teal shrink-0 mt-0.5" size={20} />
        <div>
          <h3 className="text-base font-bold text-vailo-dark">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <AdminLabel>Source country</AdminLabel>
          <AdminSelect
            value={sourceCountry}
            onChange={(e) => {
              setSourceCountry(e.target.value);
              setSourceAreaId('');
            }}
            disabled={isLoadingCountries}
          >
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div>
          <AdminLabel>Source area</AdminLabel>
          <AdminSelect
            value={sourceAreaId}
            onChange={(e) => setSourceAreaId(e.target.value)}
            disabled={!sourceCountry || sourceAreas.length === 0}
          >
            <option value="">
              {!sourceCountry
                ? 'Choose a country first'
                : sourceAreas.length === 0
                  ? 'No other areas'
                  : 'Select area…'}
            </option>
            {sourceAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </AdminSelect>
        </div>
      </div>

      <AdminButton
        type="button"
        onClick={() => void handleCopy()}
        disabled={isCopying || !sourceCountry || !sourceAreaId}
      >
        {isCopying ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Copying…
          </>
        ) : (
          <>
            <Copy size={16} />
            Copy categories here
          </>
        )}
      </AdminButton>
    </AdminCard>
  );
}
