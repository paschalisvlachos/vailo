import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Square,
  X,
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import {
  adminExcursionEditPath,
  adminExcursionsListPath,
  excursionFromDoc,
  portalExcursionEditPath,
  portalExcursionsListPath,
  type Excursion,
} from '../../../lib/excursion';
import {
  adminExcursionDiscountsPath,
  portalExcursionDiscountsPath,
} from '../../../lib/excursionDiscount';
import {
  EMPTY_AVAILABILITY_FORM,
  AVAILABILITY_WEEKDAY_LABELS,
  availabilityFormFromDoc,
  availabilityFromDoc,
  availabilityPayloadFromForm,
  availabilityStatusLabel,
  availabilityValidationSummary,
  defaultAvailabilityWeekdayFilter,
  enumerateAvailabilityDates,
  filterBookableAvailabilityDates,
  findSeasonPriceForDate,
  formatAvailabilityCapacitySummary,
  formatAvailabilityPriceSummary,
  monthDateRange,
  parseAvailabilityDateId,
  sanitizeAvailabilityPayload,
  toAvailabilityDateId,
  validateAvailabilityForm,
  type ExcursionAvailability,
  type ExcursionAvailabilityFormData,
} from '../../../lib/excursionAvailability';
import {
  AdminAlert,
  AdminBackHeader,
  AdminButton,
  AdminButtonLink,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function cellStatusClass(
  availability: ExcursionAvailability | undefined,
  inSeason: boolean,
  isPast: boolean
): string {
  if (!availability) {
    if (inSeason) return isPast ? 'bg-gray-50' : 'bg-white hover:bg-vailo-teal/5';
    return isPast ? 'bg-gray-50/80 opacity-60' : 'bg-gray-50/40 opacity-80';
  }
  if (availability.status === 'open') {
    return isPast ? 'bg-emerald-50/60' : 'bg-emerald-50 hover:bg-emerald-100/80';
  }
  if (availability.status === 'sold_out') {
    return 'bg-red-50 hover:bg-red-100/80';
  }
  return 'bg-gray-100 hover:bg-gray-200/60';
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function AvailabilitySettingsFields({
  formData,
  fieldErrors,
  onChange,
  showCapacity = true,
}: {
  formData: ExcursionAvailabilityFormData;
  fieldErrors: Record<string, string>;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  showCapacity?: boolean;
}) {
  return (
    <>
      <div>
        <AdminLabel htmlFor="bulk-status">Status</AdminLabel>
        <AdminSelect id="bulk-status" name="status" value={formData.status} onChange={onChange}>
          <option value="open">Open — bookable</option>
          <option value="closed">Closed — not bookable</option>
          <option value="sold_out">Sold out</option>
        </AdminSelect>
      </div>

      {formData.status === 'open' && showCapacity && (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="capacityUnlimited"
              checked={formData.capacityUnlimited}
              onChange={onChange}
              className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
            />
            Unlimited spaces (no capacity cap)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <AdminLabel htmlFor="bulk-capacityTotal">Capacity (spots) *</AdminLabel>
              <AdminInput
                id="bulk-capacityTotal"
                name="capacityTotal"
                type="number"
                min={1}
                value={formData.capacityTotal}
                onChange={onChange}
                disabled={formData.capacityUnlimited}
              />
              <FieldError message={fieldErrors.capacityTotal} />
            </div>
            <div>
              <AdminLabel htmlFor="bulk-departureTime">Departure time</AdminLabel>
              <AdminInput
                id="bulk-departureTime"
                name="departureTime"
                type="time"
                value={formData.departureTime}
                onChange={onChange}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="overridePrices"
              checked={formData.overridePrices}
              onChange={onChange}
              className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
            />
            Override prices for these dates
          </label>

          {formData.overridePrices && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-vailo-surface-elevated/50 p-4">
              <div>
                <AdminLabel htmlFor="bulk-priceAdult">Adult *</AdminLabel>
                <AdminInput
                  id="bulk-priceAdult"
                  name="priceAdult"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.priceAdult}
                  onChange={onChange}
                />
                <FieldError message={fieldErrors.priceAdult} />
              </div>
              <div>
                <AdminLabel htmlFor="bulk-priceChild">Child</AdminLabel>
                <AdminInput
                  id="bulk-priceChild"
                  name="priceChild"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.priceChild}
                  onChange={onChange}
                />
              </div>
              <div>
                <AdminLabel htmlFor="bulk-priceInfant">Infant</AdminLabel>
                <AdminInput
                  id="bulk-priceInfant"
                  name="priceInfant"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.priceInfant}
                  onChange={onChange}
                />
              </div>
              <div>
                <AdminLabel htmlFor="bulk-priceSenior">Senior</AdminLabel>
                <AdminInput
                  id="bulk-priceSenior"
                  name="priceSenior"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.priceSenior}
                  onChange={onChange}
                />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function ExcursionAvailabilityPage() {
  const { providerId, excursionId } = useParams<{ providerId: string; excursionId: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [excursion, setExcursion] = useState<Excursion | null>(null);
  const [providerName, setProviderName] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availabilityByDate, setAvailabilityByDate] = useState<Record<string, ExcursionAvailability>>(
    {}
  );
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ExcursionAvailabilityFormData>(EMPTY_AVAILABILITY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [lastAnchorDateId, setLastAnchorDateId] = useState<string | null>(null);
  const [bulkForm, setBulkForm] = useState<ExcursionAvailabilityFormData>(EMPTY_AVAILABILITY_FORM);
  const [bulkFieldErrors, setBulkFieldErrors] = useState<Record<string, string>>({});
  const [bulkRangeStart, setBulkRangeStart] = useState('');
  const [bulkRangeEnd, setBulkRangeEnd] = useState('');
  const [bulkWeekdays, setBulkWeekdays] = useState<boolean[]>(defaultAvailabilityWeekdayFilter());
  const [bulkSaving, setBulkSaving] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const listPath = providerId
    ? adminPath(
        portalMode ? portalExcursionsListPath(providerId) : adminExcursionsListPath(providerId)
      )
    : adminPath('/excursions/providers');

  const editPath = providerId && excursionId
    ? adminPath(
        portalMode
          ? portalExcursionEditPath(providerId, excursionId)
          : adminExcursionEditPath(providerId, excursionId)
      )
    : listPath;

  const discountsPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionDiscountsPath(providerId, excursionId)
            : adminExcursionDiscountsPath(providerId, excursionId)
        )
      : listPath;

  useEffect(() => {
    if (!providerId || !excursionId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId)).then((snap) => {
      if (snap.exists()) {
        setProviderName(String(snap.data().businessName || ''));
      }
    });

    getDoc(
      doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
    )
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Excursion not found.');
          navigate(listPath);
          return;
        }
        setExcursion(excursionFromDoc(snap.id, snap.data()));
        const cap = Number(snap.data().maxParticipants) || 20;
        setBulkForm({
          ...EMPTY_AVAILABILITY_FORM,
          capacityTotal: String(cap),
        });
      })
      .catch(() => {
        toast.error('Failed to load excursion.');
        navigate(listPath);
      })
      .finally(() => setLoading(false));
  }, [providerId, excursionId, listPath, navigate, toast]);

  useEffect(() => {
    if (!providerId || !excursionId) return;

    const { start, end } = monthDateRange(year, month);
    const q = query(
      collection(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        'availability'
      ),
      where('date', '>=', start),
      where('date', '<=', end)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const map: Record<string, ExcursionAvailability> = {};
        snapshot.docs.forEach((d) => {
          const item = availabilityFromDoc(d.id, d.data());
          map[item.date] = item;
        });
        setAvailabilityByDate(map);
      },
      () => toast.error('Failed to load availability.')
    );

    return () => unsub();
  }, [providerId, excursionId, year, month, toast]);

  useEffect(() => {
    const { start, end } = monthDateRange(year, month);
    setBulkRangeStart((prev) => prev || start);
    setBulkRangeEnd((prev) => prev || end);
  }, [year, month]);

  const selectedAvailability = selectedDateId ? availabilityByDate[selectedDateId] : null;

  const availabilityCollectionRef = () =>
    collection(
      db,
      EXCURSION_PROVIDER_COLLECTION,
      providerId!,
      EXCURSION_SUBCOLLECTION,
      excursionId!,
      'availability'
    );

  const fetchExistingInRange = async (dateIds: string[]) => {
    if (dateIds.length === 0) return {} as Record<string, ExcursionAvailability>;
    const sorted = [...dateIds].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const snap = await getDocs(
      query(availabilityCollectionRef(), where('date', '>=', start), where('date', '<=', end))
    );
    const map: Record<string, ExcursionAvailability> = {};
    snap.docs.forEach((d) => {
      const item = availabilityFromDoc(d.id, d.data());
      map[item.date] = item;
    });
    return map;
  };

  const applyAvailabilityToDates = async (
    dateIds: string[],
    form: ExcursionAvailabilityFormData,
    options: { clearSelection?: boolean } = {}
  ) => {
    if (!providerId || !excursionId || !excursion || dateIds.length === 0) return;

    const { eligible, skippedOffSeason, skippedPast } = filterBookableAvailabilityDates(
      excursion,
      dateIds
    );

    if (eligible.length === 0) {
      toast.warning(
        `No bookable dates to update${skippedOffSeason ? ` (${skippedOffSeason} off-season` : ''}${
          skippedPast ? `${skippedOffSeason ? ', ' : ' ('}${skippedPast} in the past` : ''
        }${skippedOffSeason || skippedPast ? ')' : ''}.`
      );
      return;
    }

    const existingMap = await fetchExistingInRange(eligible);

    for (const dateId of eligible) {
      const existing = existingMap[dateId] ?? availabilityByDate[dateId] ?? null;
      const errors = validateAvailabilityForm(form, existing);
      if (errors.length > 0) {
        toast.error(`${dateId}: ${availabilityValidationSummary(errors)}`);
        return;
      }
    }

    setBulkSaving(true);
    try {
      const now = new Date().toISOString();
      const chunks: string[][] = [];
      for (let i = 0; i < eligible.length; i += 400) {
        chunks.push(eligible.slice(i, i + 400));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const dateId of chunk) {
          const existing = existingMap[dateId] ?? availabilityByDate[dateId];
          const payload = sanitizeAvailabilityPayload({
            ...availabilityPayloadFromForm(form, dateId),
            capacityBooked: existing?.capacityBooked || 0,
            updatedAt: now,
            createdAt: existing?.createdAt || now,
          });
          batch.set(
            doc(availabilityCollectionRef(), dateId),
            payload,
            { merge: true }
          );
        }
        await batch.commit();
      }

      const skipped = skippedOffSeason + skippedPast;
      toast.success(
        `Updated ${eligible.length} date${eligible.length === 1 ? '' : 's'}${
          skipped > 0 ? ` (${skipped} skipped)` : ''
        }.`
      );
      if (options.clearSelection) {
        setSelectedDates(new Set());
        setSelectMode(false);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to save bulk availability.');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    if (bulkFieldErrors[name]) {
      setBulkFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    setBulkForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleApplyBulkRange = async () => {
    if (!bulkRangeStart || !bulkRangeEnd) {
      toast.warning('Choose a start and end date.');
      return;
    }
    const dates = enumerateAvailabilityDates(bulkRangeStart, bulkRangeEnd, bulkWeekdays);
    await applyAvailabilityToDates(dates, bulkForm);
  };

  const handleApplySelected = async () => {
    await applyAvailabilityToDates([...selectedDates], bulkForm, { clearSelection: true });
  };

  const toggleWeekday = (index: number) => {
    setBulkWeekdays((prev) => prev.map((on, i) => (i === index ? !on : on)));
  };

  const selectAllInSeasonThisMonth = () => {
    if (!excursion) return;
    const ids: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      if (cellDate < todayStart) continue;
      const dateId = toAvailabilityDateId(cellDate);
      if (findSeasonPriceForDate(excursion, dateId)) ids.push(dateId);
    }
    setSelectedDates(new Set(ids));
    setSelectMode(true);
  };

  const handleDayClick = (dateId: string, shiftKey: boolean) => {
    if (!excursion) return;

    if (selectMode) {
      if (shiftKey && lastAnchorDateId) {
        const anchor = parseAvailabilityDateId(lastAnchorDateId);
        const target = parseAvailabilityDateId(dateId);
        const start = anchor <= target ? anchor : target;
        const end = anchor <= target ? target : anchor;
        const rangeIds = enumerateAvailabilityDates(
          toAvailabilityDateId(start),
          toAvailabilityDateId(end),
          defaultAvailabilityWeekdayFilter()
        ).filter((id) => findSeasonPriceForDate(excursion, id) && id >= toAvailabilityDateId(todayStart));

        setSelectedDates((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return next;
        });
      } else {
        setSelectedDates((prev) => {
          const next = new Set(prev);
          if (next.has(dateId)) next.delete(dateId);
          else next.add(dateId);
          return next;
        });
        setLastAnchorDateId(dateId);
      }
      return;
    }

    openDayModal(dateId);
  };

  const openDayModal = (dateId: string) => {
    if (!excursion) return;
    const season = findSeasonPriceForDate(excursion, dateId);
    setSelectedDateId(dateId);
    setFieldErrors({});
    setFormData(
      availabilityFormFromDoc(availabilityByDate[dateId] || null, {
        capacityTotal: excursion.maxParticipants || 20,
        seasonPrices: season,
      })
    );
  };

  const closeDayModal = () => {
    setSelectedDateId(null);
    setFieldErrors({});
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSaveDay = async () => {
    if (!providerId || !excursionId || !selectedDateId || !excursion) return;

    const errors = validateAvailabilityForm(formData, selectedAvailability);
    if (errors.length > 0) {
      const map: Record<string, string> = {};
      errors.forEach((err) => {
        map[err.field] = err.message;
      });
      setFieldErrors(map);
      toast.error(availabilityValidationSummary(errors));
      return;
    }

    setSaving(true);
    try {
      const payload = sanitizeAvailabilityPayload({
        ...availabilityPayloadFromForm(formData, selectedDateId),
        capacityBooked: selectedAvailability?.capacityBooked || 0,
        updatedAt: new Date().toISOString(),
        createdAt: selectedAvailability?.createdAt || new Date().toISOString(),
      });

      await setDoc(
        doc(
          db,
          EXCURSION_PROVIDER_COLLECTION,
          providerId,
          EXCURSION_SUBCOLLECTION,
          excursionId,
          'availability',
          selectedDateId
        ),
        payload,
        { merge: true }
      );

      toast.success('Availability saved.');
      closeDayModal();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save availability.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDay = async () => {
    if (!providerId || !excursionId || !selectedDateId || !selectedAvailability) return;
    const booked = selectedAvailability.capacityBooked || 0;
    if (booked > 0) {
      toast.error('Cannot remove a date with existing bookings.');
      return;
    }
    if (!window.confirm(`Remove availability for ${selectedDateId}?`)) return;

    setSaving(true);
    try {
      await deleteDoc(
        doc(
          db,
          EXCURSION_PROVIDER_COLLECTION,
          providerId,
          EXCURSION_SUBCOLLECTION,
          excursionId,
          'availability',
          selectedDateId
        )
      );
      toast.success('Availability removed.');
      closeDayModal();
    } catch (error) {
      console.error(error);
      toast.error('Failed to remove availability.');
    } finally {
      setSaving(false);
    }
  };

  const monthStats = useMemo(() => {
    const values = Object.values(availabilityByDate);
    return {
      open: values.filter((v) => v.status === 'open').length,
      closed: values.filter((v) => v.status === 'closed').length,
      soldOut: values.filter((v) => v.status === 'sold_out').length,
    };
  }, [availabilityByDate]);

  const bulkRangePreview = useMemo(() => {
    if (!excursion || !bulkRangeStart || !bulkRangeEnd) {
      return { eligible: 0, skipped: 0 };
    }
    const dates = enumerateAvailabilityDates(bulkRangeStart, bulkRangeEnd, bulkWeekdays);
    const { eligible, skippedOffSeason, skippedPast } = filterBookableAvailabilityDates(
      excursion,
      dates
    );
    return { eligible: eligible.length, skipped: skippedOffSeason + skippedPast };
  }, [excursion, bulkRangeStart, bulkRangeEnd, bulkWeekdays]);

  if (!providerId || !excursionId) {
    navigate(listPath);
    return null;
  }

  if (loading || !excursion) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading calendar…</div>;
  }

  const selectedDateLabel = selectedDateId
    ? parseAvailabilityDateId(selectedDateId).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to excursions"
        title="Availability calendar"
        description={
          providerName
            ? `${excursion.title} · ${providerName}`
            : excursion.title
        }
        action={
          <div className="flex flex-wrap gap-2">
            <AdminButtonLink to={discountsPath} variant="secondary">
              Discounts
            </AdminButtonLink>
            <AdminButton type="button" variant="secondary" onClick={() => navigate(editPath)}>
              Edit excursion
            </AdminButton>
          </div>
        }
      />

      <AdminAlert variant="info" title="How it works" className="mb-6">
        Use <strong>Bulk add bookable days</strong> to open a date range in one go, or turn on{' '}
        <strong>Select on calendar</strong> to pick multiple days (Shift+click for a range). Click a
        single date to edit it individually. Only <strong>Open</strong> in-season dates are
        bookable.
      </AdminAlert>

      <AdminCard className="p-5 sm:p-6 mb-6">
        <h3 className="text-base font-bold text-vailo-dark mb-1">Bulk add bookable days</h3>
        <p className="text-sm text-gray-500 mb-4">
          Set capacity and status once, then apply to every matching day in the range.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <AdminLabel htmlFor="bulk-range-start">From date</AdminLabel>
                <AdminInput
                  id="bulk-range-start"
                  type="date"
                  value={bulkRangeStart}
                  onChange={(e) => setBulkRangeStart(e.target.value)}
                />
              </div>
              <div>
                <AdminLabel htmlFor="bulk-range-end">To date</AdminLabel>
                <AdminInput
                  id="bulk-range-end"
                  type="date"
                  value={bulkRangeEnd}
                  onChange={(e) => setBulkRangeEnd(e.target.value)}
                />
              </div>
            </div>

            <div>
              <AdminLabel>Days of week</AdminLabel>
              <div className="flex flex-wrap gap-2 mt-1">
                {AVAILABILITY_WEEKDAY_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(index)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      bulkWeekdays[index]
                        ? 'bg-vailo-teal text-white border-vailo-teal'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-vailo-teal/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <AvailabilitySettingsFields
              formData={bulkForm}
              fieldErrors={bulkFieldErrors}
              onChange={handleBulkFormChange}
            />
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-xl border border-gray-100 bg-vailo-surface-elevated/40 p-4">
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <span className="font-semibold text-vailo-dark">{bulkRangePreview.eligible}</span>{' '}
                in-season day{bulkRangePreview.eligible === 1 ? '' : 's'} will be updated
                {bulkRangePreview.skipped > 0 && (
                  <span className="text-gray-500"> ({bulkRangePreview.skipped} skipped)</span>
                )}
                .
              </p>
              <p className="text-xs text-gray-500">
                Off-season and past dates are skipped automatically.
              </p>
            </div>
            <AdminButton
              type="button"
              onClick={() => void handleApplyBulkRange()}
              disabled={bulkSaving || bulkRangePreview.eligible === 0}
            >
              {bulkSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving…
                </>
              ) : (
                `Apply to ${bulkRangePreview.eligible} day${bulkRangePreview.eligible === 1 ? '' : 's'}`
              )}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-3 mb-6 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Open ({monthStats.open})
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-800 border border-red-100">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Sold out ({monthStats.soldOut})
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          <span className="h-2 w-2 rounded-full bg-gray-400" /> Closed ({monthStats.closed})
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-gray-500 border border-gray-200">
          No entry — not bookable
        </span>
      </div>

      <AdminCard className="overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 bg-vailo-surface-elevated/80">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-vailo-teal/10 text-vailo-teal rounded-xl flex items-center justify-center">
              <CalendarIcon size={18} />
            </div>
            <h3 className="text-lg font-bold text-vailo-dark">
              {MONTH_NAMES[month]} {year}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              type="button"
              variant={selectMode ? 'primary' : 'secondary'}
              onClick={() => {
                setSelectMode((v) => !v);
                if (selectMode) setSelectedDates(new Set());
              }}
            >
              {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
              {selectMode ? 'Selecting…' : 'Select on calendar'}
            </AdminButton>
            {selectMode && (
              <>
                <AdminButton type="button" variant="secondary" onClick={selectAllInSeasonThisMonth}>
                  All in-season this month
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedDates(new Set())}
                  disabled={selectedDates.size === 0}
                >
                  Clear ({selectedDates.size})
                </AdminButton>
                <AdminButton
                  type="button"
                  onClick={() => void handleApplySelected()}
                  disabled={bulkSaving || selectedDates.size === 0}
                >
                  Apply to {selectedDates.size} selected
                </AdminButton>
              </>
            )}
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map((day) => (
            <div
              key={day}
              className="py-2.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50 min-h-[88px]" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const cellDate = new Date(year, month, day);
            const dateId = toAvailabilityDateId(cellDate);
            const isToday =
              day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear();
            const isPast = cellDate < todayStart;
            const availability = availabilityByDate[dateId];
            const inSeason = Boolean(findSeasonPriceForDate(excursion, dateId));
            const isSelected = selectedDates.has(dateId);
            const priceLabel = formatAvailabilityPriceSummary(excursion, dateId, availability);

            return (
              <button
                key={dateId}
                type="button"
                onClick={(e) => handleDayClick(dateId, e.shiftKey)}
                className={`min-h-[88px] p-2 text-left transition-colors flex flex-col relative ${cellStatusClass(
                  availability,
                  inSeason,
                  isPast
                )} ${isSelected ? 'ring-2 ring-inset ring-vailo-teal z-[1]' : ''}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full mb-1 ${
                    isToday ? 'bg-vailo-teal text-white' : 'text-gray-700'
                  }`}
                >
                  {day}
                </span>

                {availability ? (
                  <div className="space-y-0.5 flex-1">
                    <p className="text-[10px] font-semibold text-gray-800 leading-tight">
                      {availabilityStatusLabel(availability.status)}
                    </p>
                    {availability.status === 'open' && (
                      <p className="text-[10px] text-gray-600 leading-tight">
                        {formatAvailabilityCapacitySummary(availability)}
                      </p>
                    )}
                    {availability.departureTime && (
                      <p className="text-[10px] text-gray-500">{availability.departureTime}</p>
                    )}
                    <p className="text-[10px] font-medium text-vailo-teal leading-tight truncate">
                      {priceLabel}
                    </p>
                  </div>
                ) : inSeason ? (
                  <p className="text-[10px] text-gray-400 leading-tight">In season · not set</p>
                ) : (
                  <p className="text-[10px] text-gray-300 leading-tight">Off season</p>
                )}
              </button>
            );
          })}
        </div>
      </AdminCard>

      {selectedDateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-vailo-dark">{selectedDateLabel}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {findSeasonPriceForDate(excursion, selectedDateId)
                    ? `Season price: ${formatAvailabilityPriceSummary(excursion, selectedDateId)}`
                    : 'No matching season — set a price override to open this date'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDayModal}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <AdminLabel htmlFor="status">Status</AdminLabel>
                <AdminSelect
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleFormChange}
                >
                  <option value="open">Open — bookable</option>
                  <option value="closed">Closed — not bookable</option>
                  <option value="sold_out">Sold out</option>
                </AdminSelect>
              </div>

              {formData.status === 'open' && (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      name="capacityUnlimited"
                      checked={formData.capacityUnlimited}
                      onChange={handleFormChange}
                      className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                    />
                    Unlimited spaces (no capacity cap)
                  </label>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <AdminLabel htmlFor="capacityTotal">Capacity (spots) *</AdminLabel>
                      <AdminInput
                        id="capacityTotal"
                        name="capacityTotal"
                        type="number"
                        min={1}
                        value={formData.capacityTotal}
                        onChange={handleFormChange}
                        disabled={formData.capacityUnlimited}
                      />
                      <FieldError message={fieldErrors.capacityTotal} />
                      {formData.capacityUnlimited && (
                        <p className="text-xs text-gray-500 mt-1">
                          Bookings won&apos;t be limited by spot count.
                        </p>
                      )}
                      {(selectedAvailability?.capacityBooked || 0) > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedAvailability?.capacityBooked} already booked
                        </p>
                      )}
                    </div>
                    <div>
                      <AdminLabel htmlFor="departureTime">Departure time</AdminLabel>
                      <AdminInput
                        id="departureTime"
                        name="departureTime"
                        type="time"
                        value={formData.departureTime}
                        onChange={handleFormChange}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      name="overridePrices"
                      checked={formData.overridePrices}
                      onChange={handleFormChange}
                      className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                    />
                    Override prices for this date
                  </label>

                  {formData.overridePrices && (
                    <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-vailo-surface-elevated/50 p-4">
                      <div>
                        <AdminLabel htmlFor="priceAdult">Adult *</AdminLabel>
                        <AdminInput
                          id="priceAdult"
                          name="priceAdult"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formData.priceAdult}
                          onChange={handleFormChange}
                        />
                        <FieldError message={fieldErrors.priceAdult} />
                      </div>
                      <div>
                        <AdminLabel htmlFor="priceChild">Child</AdminLabel>
                        <AdminInput
                          id="priceChild"
                          name="priceChild"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formData.priceChild}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor="priceInfant">Infant</AdminLabel>
                        <AdminInput
                          id="priceInfant"
                          name="priceInfant"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formData.priceInfant}
                          onChange={handleFormChange}
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor="priceSenior">Senior</AdminLabel>
                        <AdminInput
                          id="priceSenior"
                          name="priceSenior"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formData.priceSenior}
                          onChange={handleFormChange}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <AdminLabel htmlFor="notes">Internal notes</AdminLabel>
                <AdminTextarea
                  id="notes"
                  name="notes"
                  rows={2}
                  value={formData.notes}
                  onChange={handleFormChange}
                  placeholder="Optional notes for your team"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-vailo-surface-elevated/50">
              <div>
                {selectedAvailability && (selectedAvailability.capacityBooked || 0) === 0 && (
                  <AdminButton type="button" variant="danger" onClick={handleDeleteDay} disabled={saving}>
                    Remove date
                  </AdminButton>
                )}
              </div>
              <div className="flex gap-2">
                <AdminButton type="button" variant="secondary" onClick={closeDayModal} disabled={saving}>
                  Cancel
                </AdminButton>
                <AdminButton type="button" onClick={handleSaveDay} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving…
                    </>
                  ) : (
                    'Save'
                  )}
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
