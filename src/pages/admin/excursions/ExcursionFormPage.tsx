import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Image as ImageIcon, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION, parseExcursionProviderCommissionType } from '../../../lib/excursionProvider';
import {
  EMPTY_EXCURSION_FORM,
  adminExcursionsListPath,
  createSeasonPriceRow,
  excursionFormFromDoc,
  excursionPayloadFromForm,
  excursionValidationSummary,
  formatExcursionSlug,
  portalExcursionsListPath,
  sanitizeExcursionPayload,
  seasonPricesFormFromDoc,
  validateExcursionForm,
  type ExcursionFormData,
  type ExcursionSeasonPriceFormRow,
} from '../../../lib/excursion';
import {
  adminExcursionAvailabilityPath,
  portalExcursionAvailabilityPath,
} from '../../../lib/excursionAvailability';
import {
  adminExcursionDiscountsPath,
  portalExcursionDiscountsPath,
} from '../../../lib/excursionDiscount';
import {
  adminExcursionBookingsPath,
  portalExcursionBookingsPath,
} from '../../../lib/excursionBooking';
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function fieldErrorClass(hasError: boolean) {
  return hasError ? 'border-red-300 ring-1 ring-red-100 focus:border-red-400' : '';
}

export default function ExcursionFormPage() {
  const { providerId, excursionId } = useParams<{ providerId: string; excursionId?: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const isEdit = Boolean(excursionId);
  const navigate = useNavigate();
  const toast = useToast();
  const { isPlatformAdmin } = useAdminSession();
  const showArchivedStatus = isPlatformAdmin && !portalMode;
  const showExcursionCommission = isPlatformAdmin && !portalMode;

  const [formData, setFormData] = useState<ExcursionFormData>(EMPTY_EXCURSION_FORM);
  const [seasonPrices, setSeasonPrices] = useState<ExcursionSeasonPriceFormRow[]>([
    createSeasonPriceRow(),
  ]);
  const [slugManual, setSlugManual] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerUsesPerExcursionCommission, setProviderUsesPerExcursionCommission] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const listPath = providerId
    ? adminPath(
        portalMode ? portalExcursionsListPath(providerId) : adminExcursionsListPath(providerId)
      )
    : adminPath('/excursions/providers');

  const availabilityPath =
    isEdit && providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionAvailabilityPath(providerId, excursionId)
            : adminExcursionAvailabilityPath(providerId, excursionId)
        )
      : null;

  const discountsPath =
    isEdit && providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionDiscountsPath(providerId, excursionId)
            : adminExcursionDiscountsPath(providerId, excursionId)
        )
      : null;

  const bookingsPath =
    isEdit && providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionBookingsPath(providerId, excursionId)
            : adminExcursionBookingsPath(providerId, excursionId)
        )
      : null;

  useEffect(() => {
    if (!providerId) return;
    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setProviderName(String(data.businessName || ''));
        setProviderUsesPerExcursionCommission(
          parseExcursionProviderCommissionType(data.commissionType) === 'per_excursion'
        );
      }
    });
  }, [providerId]);

  useEffect(() => {
    if (!isEdit || !providerId || !excursionId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId))
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Excursion not found.');
          navigate(listPath);
          return;
        }
        const parsed = excursionFormFromDoc(snap.data());
        setFormData(parsed);
        setSeasonPrices(seasonPricesFormFromDoc(snap.data()));
        setSlugManual(true);
        if (parsed.heroPhotoUrl) setHeroPreview(parsed.heroPhotoUrl);
      })
      .catch(() => {
        toast.error('Failed to load excursion.');
        navigate(listPath);
      })
      .finally(() => setLoading(false));
  }, [isEdit, providerId, excursionId, listPath, navigate, toast]);

  useEffect(() => {
    if (slugManual || isEdit) return;
    setFormData((prev) => ({
      ...prev,
      slug: formatExcursionSlug(prev.title),
    }));
  }, [formData.title, slugManual, isEdit]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        if (name === 'commissionType') {
          delete next.platformCommissionPercent;
          delete next.fixedCommissionAmount;
        }
        return next;
      });
    }
    if (name === 'slug') setSlugManual(true);
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const updateSeasonPrice = (
    index: number,
    field: keyof Omit<ExcursionSeasonPriceFormRow, 'localId'>,
    value: string
  ) => {
    const errorKey = `season-${index}-${field === 'priceAdult' ? 'priceAdult' : field}`;
    if (fieldErrors[errorKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
    setSeasonPrices((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const addSeasonPrice = () => {
    setSeasonPrices((prev) => [...prev, createSeasonPriceRow()]);
  };

  const removeSeasonPrice = (index: number) => {
    setSeasonPrices((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadHero = async (): Promise<string | undefined> => {
    if (!heroFile) return formData.heroPhotoUrl.trim() || undefined;
    setIsUploadingHero(true);
    try {
      const ext = heroFile.name.split('.').pop() || 'jpg';
      const path = `excursions/${providerId}/${excursionId || 'new'}-${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, heroFile);
      return await getDownloadURL(storageRef);
    } finally {
      setIsUploadingHero(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId) return;

    const includeCommission = showExcursionCommission && providerUsesPerExcursionCommission;
    const errors = validateExcursionForm(formData, seasonPrices, { includeCommission });
    if (errors.length > 0) {
      const map: Record<string, string> = {};
      errors.forEach((err) => {
        map[err.field] = err.message;
      });
      setFieldErrors(map);
      toast.error(excursionValidationSummary(errors));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const heroPhotoUrl = await uploadHero();
      const payload = sanitizeExcursionPayload({
        ...excursionPayloadFromForm(formData, providerId, seasonPrices, { includeCommission }),
        heroPhotoUrl,
        updatedAt: new Date().toISOString(),
      });

      if (isEdit && excursionId) {
        await updateDoc(
          doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId),
          payload
        );
        toast.success('Excursion updated.');
      } else {
        await addDoc(
          collection(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION),
          { ...payload, createdAt: new Date().toISOString() }
        );
        toast.success('Excursion created.');
      }

      navigate(listPath);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save excursion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!providerId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading excursion…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to excursions"
        title={isEdit ? 'Edit excursion' : 'Add excursion'}
        description={
          providerName ? `${providerName}${isEdit ? '' : ' · new product'}` : undefined
        }
        action={
          isEdit && (availabilityPath || discountsPath || bookingsPath) ? (
            <div className="flex flex-wrap gap-2">
              {bookingsPath && (
                <AdminButtonLink to={bookingsPath} variant="secondary">
                  Bookings
                </AdminButtonLink>
              )}
              {discountsPath && (
                <AdminButtonLink to={discountsPath} variant="secondary">
                  Discounts
                </AdminButtonLink>
              )}
              {availabilityPath && (
                <AdminButtonLink to={availabilityPath} variant="secondary">
                  Availability calendar
                </AdminButtonLink>
              )}
            </div>
          ) : undefined
        }
      />

      {Object.keys(fieldErrors).length > 0 && (
        <AdminAlert variant="warning" title="Please fix the following" className="mb-6">
          <ul className="list-disc list-inside space-y-1">
            {[...new Set(Object.values(fieldErrors))].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </AdminAlert>
      )}

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden mb-6">
          <div className="p-6 sm:p-8 space-y-8">
            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="title">Title *</AdminLabel>
                  <AdminInput
                    id="title"
                    name="title"
                    required
                    value={formData.title}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.title))}
                    placeholder="Samaria Gorge crossing"
                  />
                  <FieldError message={fieldErrors.title} />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="subtitle">Subtitle</AdminLabel>
                  <AdminInput
                    id="subtitle"
                    name="subtitle"
                    value={formData.subtitle}
                    onChange={handleChange}
                    placeholder="Hiking – Samaria Gorge crossing"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Activity type and route, shown under the title
                  </p>
                </div>
                <div>
                  <AdminLabel htmlFor="slug">URL slug</AdminLabel>
                  <AdminInput
                    id="slug"
                    name="slug"
                    value={formData.slug}
                    onChange={handleChange}
                    placeholder="samaria-gorge-crossing"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="status">Status *</AdminLabel>
                  <AdminSelect
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    {showArchivedStatus && <option value="archived">Archived</option>}
                  </AdminSelect>
                  {!showArchivedStatus && (
                    <p className="text-xs text-gray-500 mt-1">
                      Set to Published when ready for guests to book.
                    </p>
                  )}
                </div>
                <div>
                  <AdminLabel htmlFor="categories">Categories</AdminLabel>
                  <AdminInput
                    id="categories"
                    name="categories"
                    value={formData.categories}
                    onChange={handleChange}
                    placeholder="Hiking, Nature"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="description">Description</AdminLabel>
                  <AdminTextarea
                    id="description"
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Main overview of the excursion for guests…"
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel>Hero photo</AdminLabel>
                  <div className="flex items-start gap-4">
                    <div className="h-24 w-32 rounded-xl border border-gray-200 bg-vailo-surface-elevated overflow-hidden shrink-0">
                      {heroPreview ? (
                        <img src={heroPreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <ImageIcon size={28} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setHeroFile(file);
                          setHeroPreview(URL.createObjectURL(file));
                        }}
                        className="text-sm text-gray-600"
                      />
                      {isUploadingHero && (
                        <p className="text-xs text-vailo-teal mt-1 flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Uploading…
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Trip details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="travelStyle">Travel style</AdminLabel>
                  <AdminSelect
                    id="travelStyle"
                    name="travelStyle"
                    value={formData.travelStyle}
                    onChange={handleChange}
                  >
                    <option value="day_trip">Day trip</option>
                    <option value="half_day">Half day</option>
                    <option value="full_day">Full day</option>
                    <option value="multi_day">Multi-day</option>
                    <option value="overnight">Overnight</option>
                    <option value="custom">Custom label</option>
                  </AdminSelect>
                </div>
                {formData.travelStyle === 'custom' && (
                  <div>
                    <AdminLabel htmlFor="travelStyleLabel">Custom travel style label</AdminLabel>
                    <AdminInput
                      id="travelStyleLabel"
                      name="travelStyleLabel"
                      value={formData.travelStyleLabel}
                      onChange={handleChange}
                      placeholder="e.g. Extended adventure"
                    />
                  </div>
                )}
                <div>
                  <AdminLabel htmlFor="durationType">Duration type</AdminLabel>
                  <AdminSelect
                    id="durationType"
                    name="durationType"
                    value={formData.durationType}
                    onChange={handleChange}
                  >
                    <option value="hours">Hours</option>
                    <option value="half_day">Half day</option>
                    <option value="full_day">Full day</option>
                    <option value="multi_day">Multi-day</option>
                  </AdminSelect>
                </div>
                {formData.durationType === 'hours' && (
                  <div>
                    <AdminLabel htmlFor="durationMinutes">Duration (minutes) *</AdminLabel>
                    <AdminInput
                      id="durationMinutes"
                      name="durationMinutes"
                      type="number"
                      min={1}
                      value={formData.durationMinutes}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.durationMinutes))}
                    />
                    <FieldError message={fieldErrors.durationMinutes} />
                  </div>
                )}
                <div>
                  <AdminLabel htmlFor="durationLabel">Duration display label</AdminLabel>
                  <AdminInput
                    id="durationLabel"
                    name="durationLabel"
                    value={formData.durationLabel}
                    onChange={handleChange}
                    placeholder="e.g. 7 hours, Full day"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="minParticipants">Min number of people</AdminLabel>
                  <AdminInput
                    id="minParticipants"
                    name="minParticipants"
                    type="number"
                    min={1}
                    value={formData.minParticipants}
                    onChange={handleChange}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      name="maxParticipantsUnlimited"
                      checked={formData.maxParticipantsUnlimited}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                    />
                    Unlimited maximum group size
                  </label>
                  <AdminLabel htmlFor="maxParticipants">Max number of people</AdminLabel>
                  <AdminInput
                    id="maxParticipants"
                    name="maxParticipants"
                    type="number"
                    min={1}
                    value={formData.maxParticipants}
                    onChange={handleChange}
                    disabled={formData.maxParticipantsUnlimited}
                    className={fieldErrorClass(Boolean(fieldErrors.maxParticipants))}
                  />
                  <FieldError message={fieldErrors.maxParticipants} />
                  {formData.maxParticipantsUnlimited && (
                    <p className="text-xs text-gray-500 mt-1">
                      No cap on how many guests can book in one reservation.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="admin-section-title border-0 pb-0 mb-1">Season pricing</h3>
                  <p className="text-sm text-gray-500">
                    Set per-person prices for each operating season (date from – date to).
                  </p>
                </div>
                <AdminButton type="button" variant="secondary" onClick={addSeasonPrice}>
                  <Plus size={16} /> Add season
                </AdminButton>
              </div>

              <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="currency">Currency</AdminLabel>
                  <AdminSelect
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </AdminSelect>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      name="showPriceFrom"
                      checked={formData.showPriceFrom}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                    />
                    Show lowest price as &ldquo;from&rdquo; (e.g. from 110.00 €)
                  </label>
                </div>
              </div>

              <div className="space-y-4">
                {seasonPrices.map((season, index) => (
                  <div
                    key={season.localId}
                    className="rounded-xl border border-gray-200 bg-vailo-surface-elevated/40 p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <p className="text-sm font-semibold text-vailo-dark">
                        {season.label.trim() || `Season ${index + 1}`}
                      </p>
                      {seasonPrices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSeasonPrice(index)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove season"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                      <div className="md:col-span-2">
                        <AdminLabel htmlFor={`season-label-${index}`}>Season label (optional)</AdminLabel>
                        <AdminInput
                          id={`season-label-${index}`}
                          value={season.label}
                          onChange={(e) => updateSeasonPrice(index, 'label', e.target.value)}
                          placeholder="e.g. Summer, June – November"
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-from-${index}`}>From date *</AdminLabel>
                        <AdminInput
                          id={`season-from-${index}`}
                          type="date"
                          value={season.fromDate}
                          onChange={(e) => updateSeasonPrice(index, 'fromDate', e.target.value)}
                          className={fieldErrorClass(Boolean(fieldErrors[`season-${index}-fromDate`]))}
                        />
                        <FieldError message={fieldErrors[`season-${index}-fromDate`]} />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-to-${index}`}>To date *</AdminLabel>
                        <AdminInput
                          id={`season-to-${index}`}
                          type="date"
                          value={season.toDate}
                          onChange={(e) => updateSeasonPrice(index, 'toDate', e.target.value)}
                          className={fieldErrorClass(Boolean(fieldErrors[`season-${index}-toDate`]))}
                        />
                        <FieldError message={fieldErrors[`season-${index}-toDate`]} />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-adult-${index}`}>Adult price *</AdminLabel>
                        <AdminInput
                          id={`season-adult-${index}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={season.priceAdult}
                          onChange={(e) => updateSeasonPrice(index, 'priceAdult', e.target.value)}
                          className={fieldErrorClass(Boolean(fieldErrors[`season-${index}-priceAdult`]))}
                        />
                        <FieldError message={fieldErrors[`season-${index}-priceAdult`]} />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-child-${index}`}>Child price</AdminLabel>
                        <AdminInput
                          id={`season-child-${index}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={season.priceChild}
                          onChange={(e) => updateSeasonPrice(index, 'priceChild', e.target.value)}
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-infant-${index}`}>Infant price</AdminLabel>
                        <AdminInput
                          id={`season-infant-${index}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={season.priceInfant}
                          onChange={(e) => updateSeasonPrice(index, 'priceInfant', e.target.value)}
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`season-senior-${index}`}>Senior price</AdminLabel>
                        <AdminInput
                          id={`season-senior-${index}`}
                          type="number"
                          min={0}
                          step={0.01}
                          value={season.priceSenior}
                          onChange={(e) => updateSeasonPrice(index, 'priceSenior', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {showExcursionCommission && providerUsesPerExcursionCommission && (
              <>
                <hr className="border-gray-100" />

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Lock size={16} className="text-vailo-gold" />
                    <h3 className="admin-section-title border-0 pb-0 mb-0">Commission</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-vailo-gold/15 text-vailo-dark border border-vailo-gold/25">
                      Admin only
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    This provider uses per-excursion commission. Set the platform margin for this
                    product.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    <div>
                      <AdminLabel htmlFor="commissionType">Commission type</AdminLabel>
                      <AdminSelect
                        id="commissionType"
                        name="commissionType"
                        value={formData.commissionType}
                        onChange={handleChange}
                      >
                        <option value="percent">Percentage of sell price</option>
                        <option value="fixed_per_booking">Fixed amount per booking</option>
                      </AdminSelect>
                    </div>
                    {formData.commissionType === 'percent' ? (
                      <div>
                        <AdminLabel htmlFor="platformCommissionPercent">Platform commission %</AdminLabel>
                        <AdminInput
                          id="platformCommissionPercent"
                          name="platformCommissionPercent"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={formData.platformCommissionPercent}
                          onChange={handleChange}
                          className={fieldErrorClass(Boolean(fieldErrors.platformCommissionPercent))}
                        />
                        <FieldError message={fieldErrors.platformCommissionPercent} />
                      </div>
                    ) : (
                      <div>
                        <AdminLabel htmlFor="fixedCommissionAmount">Fixed commission (EUR)</AdminLabel>
                        <AdminInput
                          id="fixedCommissionAmount"
                          name="fixedCommissionAmount"
                          type="number"
                          min={0}
                          step={0.01}
                          value={formData.fixedCommissionAmount}
                          onChange={handleChange}
                          className={fieldErrorClass(Boolean(fieldErrors.fixedCommissionAmount))}
                        />
                        <FieldError message={fieldErrors.fixedCommissionAmount} />
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Program</h3>
              <div className="grid grid-cols-1 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="programBreakdown">Program breakdown</AdminLabel>
                  <AdminTextarea
                    id="programBreakdown"
                    name="programBreakdown"
                    rows={5}
                    value={formData.programBreakdown}
                    onChange={handleChange}
                    placeholder="Summary of the day’s schedule and highlights…"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="programDetails">Full program</AdminLabel>
                  <AdminTextarea
                    id="programDetails"
                    name="programDetails"
                    rows={8}
                    value={formData.programDetails}
                    onChange={handleChange}
                    placeholder="Detailed step-by-step itinerary shown when guests view the program…"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Detailed itinerary — equivalent to &ldquo;View the program&rdquo; content
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">
                Requirements &amp; notes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="participationRequirements">
                    Participation requirements
                  </AdminLabel>
                  <AdminTextarea
                    id="participationRequirements"
                    name="participationRequirements"
                    rows={4}
                    value={formData.participationRequirements}
                    onChange={handleChange}
                    placeholder="Fitness level, age limits, health conditions…"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="whatToBring">What to bring</AdminLabel>
                  <AdminTextarea
                    id="whatToBring"
                    name="whatToBring"
                    rows={4}
                    value={formData.whatToBring}
                    onChange={handleChange}
                    placeholder="Hiking shoes, Sunscreen, Water bottle"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
                </div>
                <div>
                  <AdminLabel htmlFor="notes">Notes</AdminLabel>
                  <AdminTextarea
                    id="notes"
                    name="notes"
                    rows={4}
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Important remarks for guests…"
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Inclusions &amp; extras</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="included">Included</AdminLabel>
                  <AdminTextarea
                    id="included"
                    name="included"
                    rows={4}
                    value={formData.included}
                    onChange={handleChange}
                    placeholder="Guide, Transport, Entrance fees"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
                </div>
                <div>
                  <AdminLabel htmlFor="notIncluded">Not included</AdminLabel>
                  <AdminTextarea
                    id="notIncluded"
                    name="notIncluded"
                    rows={4}
                    value={formData.notIncluded}
                    onChange={handleChange}
                    placeholder="Lunch, Personal expenses"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
                </div>
                <div>
                  <AdminLabel htmlFor="additionalServices">Additional services</AdminLabel>
                  <AdminTextarea
                    id="additionalServices"
                    name="additionalServices"
                    rows={4}
                    value={formData.additionalServices}
                    onChange={handleChange}
                    placeholder="Optional add-ons available on request…"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="additionalInfo">Additional information</AdminLabel>
                  <AdminTextarea
                    id="additionalInfo"
                    name="additionalInfo"
                    rows={4}
                    value={formData.additionalInfo}
                    onChange={handleChange}
                    placeholder="Any other details guests should know…"
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Booking rules</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="bookingMode">Booking mode</AdminLabel>
                  <AdminSelect
                    id="bookingMode"
                    name="bookingMode"
                    value={formData.bookingMode}
                    onChange={handleChange}
                  >
                    <option value="request">Request to confirm</option>
                    <option value="instant">Instant book</option>
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="cutoffHoursBefore">Cutoff (hours before)</AdminLabel>
                  <AdminInput
                    id="cutoffHoursBefore"
                    name="cutoffHoursBefore"
                    type="number"
                    min={0}
                    value={formData.cutoffHoursBefore}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="advanceBookingDaysMax">Book up to (days ahead)</AdminLabel>
                  <AdminInput
                    id="advanceBookingDaysMax"
                    name="advanceBookingDaysMax"
                    type="number"
                    min={1}
                    value={formData.advanceBookingDaysMax}
                    onChange={handleChange}
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="meetingPoint">Meeting point</AdminLabel>
                  <AdminInput
                    id="meetingPoint"
                    name="meetingPoint"
                    value={formData.meetingPoint}
                    onChange={handleChange}
                    placeholder="Where guests meet or are picked up"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex items-center justify-end gap-3">
            <AdminButton type="button" variant="secondary" onClick={() => navigate(listPath)}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting || isUploadingHero}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create excursion'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
