import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Image as ImageIcon, Loader2, Lock, Plus, Users, X } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { loadCountryNames } from '../../../lib/countryNames';
import { useToast } from '../../../context/ToastContext';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { adminPath } from '../../../lib/adminRoutes';
import {
  EMPTY_EXCURSION_PROVIDER_FORM,
  EXCURSION_PROVIDER_COLLECTION,
  dedupeOperatingRegions,
  excursionProviderFormFromDoc,
  excursionProviderPayloadFromForm,
  excursionProviderPortalPayloadFromForm,
  excursionProviderValidationSummary,
  formatExcursionProviderSaveError,
  operatingRegionKey,
  sanitizeFirestorePayload,
  uniqueCountriesFromRegions,
  validateExcursionProviderForm,
  type ExcursionProviderFormData,
  type ExcursionProviderRegion,
} from '../../../lib/excursionProvider';
import {
  adminExcursionsListPath,
  portalExcursionsListPath,
} from '../../../lib/excursion';
import {
  adminProviderBookingsPath,
  portalProviderBookingsPath,
} from '../../../lib/excursionBooking';
import {
  findExcursionProviderAllocationConflict,
  normalizeLinkedOwnerIds,
} from '../../../lib/excursionProviderPortal';
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

type AreaOption = { id: string; name: string };

type PortalUserOption = {
  id: string;
  fullName: string;
  email: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function fieldErrorClass(hasError: boolean) {
  return hasError ? 'border-red-300 ring-1 ring-red-100 focus:border-red-400' : '';
}

export default function ExcursionProviderFormPage() {
  const { id, providerId: portalProviderId } = useParams<{ id?: string; providerId?: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const docId = portalMode ? portalProviderId : id;
  const isEdit = Boolean(docId);
  const navigate = useNavigate();
  const toast = useToast();
  const { isPlatformAdmin, scopes } = useAdminSession();
  const showAdminSections = isPlatformAdmin && !portalMode;

  const [formData, setFormData] = useState<ExcursionProviderFormData>(EMPTY_EXCURSION_PROVIDER_FORM);
  const [linkedOwnerIds, setLinkedOwnerIds] = useState<string[]>([]);
  const [allocatedOwnerIds, setAllocatedOwnerIds] = useState<Set<string>>(new Set());
  const [portalUsers, setPortalUsers] = useState<PortalUserOption[]>([]);
  const [isSuspendedByAdmin, setIsSuspendedByAdmin] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [areasByCountry, setAreasByCountry] = useState<Record<string, AreaOption[]>>({});
  const [visibleCountries, setVisibleCountries] = useState<string[]>([]);
  const [countryToAdd, setCountryToAdd] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (visibleCountries.length === 0) return;

    const unsubs = visibleCountries.map((country) =>
      onSnapshot(collection(db, 'countries', country, 'areas'), (snapshot) => {
        const areas = snapshot.docs
          .map((d) => ({
            id: d.id,
            name: String(d.data().name || d.id).trim() || d.id,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAreasByCountry((prev) => ({ ...prev, [country]: areas }));
      })
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [visibleCountries]);

  const availableCountriesToAdd = useMemo(
    () => countries.filter((c) => !visibleCountries.includes(c)),
    [countries, visibleCountries]
  );

  const selectedRegionKeys = useMemo(
    () => new Set(formData.operatingRegions.map(operatingRegionKey)),
    [formData.operatingRegions]
  );

  const addVisibleCountry = (country: string) => {
    if (!country || visibleCountries.includes(country)) return;
    setVisibleCountries((prev) => [...prev, country].sort((a, b) => a.localeCompare(b)));
    if (fieldErrors.operatingRegions) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.operatingRegions;
        return next;
      });
    }
  };

  const removeVisibleCountry = (country: string) => {
    setVisibleCountries((prev) => prev.filter((c) => c !== country));
    setFormData((prev) => ({
      ...prev,
      operatingRegions: prev.operatingRegions.filter((r) => r.country !== country),
    }));
  };

  const toggleArea = (country: string, area: AreaOption) => {
    const key = operatingRegionKey({ country, areaId: area.id });
    setFormData((prev) => {
      const exists = prev.operatingRegions.some((r) => operatingRegionKey(r) === key);
      const operatingRegions = exists
        ? prev.operatingRegions.filter((r) => operatingRegionKey(r) !== key)
        : dedupeOperatingRegions([
            ...prev.operatingRegions,
            { country, areaId: area.id, areaName: area.name },
          ]);
      return { ...prev, operatingRegions };
    });
    if (fieldErrors.operatingRegions) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.operatingRegions;
        return next;
      });
    }
  };

  const removeRegion = (region: ExcursionProviderRegion) => {
    setFormData((prev) => ({
      ...prev,
      operatingRegions: prev.operatingRegions.filter(
        (r) => operatingRegionKey(r) !== operatingRegionKey(region)
      ),
    }));
  };

  useEffect(() => {
    if (!showAdminSections) return;
    const q = query(collection(db, 'owners'), where('role', '==', 'excursion_provider'));
    return onSnapshot(q, (snapshot) => {
      setPortalUsers(
        snapshot.docs
          .map((d) => ({
            id: d.id,
            fullName: String(d.data().fullName || ''),
            email: String(d.data().email || ''),
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
    });
  }, [showAdminSections]);

  useEffect(() => {
    if (!showAdminSections) return;
    return onSnapshot(collection(db, EXCURSION_PROVIDER_COLLECTION), (snapshot) => {
      const taken = new Set<string>();
      snapshot.docs.forEach((d) => {
        if (docId && d.id === docId) return;
        const linked = d.data().linkedOwnerIds;
        if (!Array.isArray(linked)) return;
        linked.forEach((ownerId) => {
          if (typeof ownerId === 'string' && ownerId.trim()) taken.add(ownerId);
        });
      });
      setAllocatedOwnerIds(taken);
    });
  }, [showAdminSections, docId]);

  useEffect(() => {
    if (!docId) return;

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, docId));
        if (!snap.exists()) {
          toast.error('Provider not found.');
          navigate(portalMode ? adminPath('/excursion-portal') : adminPath('/excursions/providers'));
          return;
        }
        const data = snap.data();
        const parsed = excursionProviderFormFromDoc(data);
        setFormData(parsed);
        setVisibleCountries(uniqueCountriesFromRegions(parsed.operatingRegions));
        setLinkedOwnerIds(normalizeLinkedOwnerIds(
          Array.isArray(data.linkedOwnerIds)
            ? data.linkedOwnerIds.filter((x): x is string => typeof x === 'string')
            : []
        ));
        setIsSuspendedByAdmin(parsed.status === 'suspended');
        if (parsed.logoUrl) setLogoPreview(parsed.logoUrl);
      } catch (error) {
        console.error(error);
        toast.error('Failed to load provider.');
        navigate(portalMode ? adminPath('/excursion-portal') : adminPath('/excursions/providers'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [docId, navigate, portalMode, toast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
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
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (): Promise<string | undefined> => {
    if (!logoFile) return formData.logoUrl.trim() || undefined;
    setIsUploadingLogo(true);
    try {
      const ext = logoFile.name.split('.').pop() || 'jpg';
      const path = `excursionProviders/${docId || 'new'}-${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, logoFile);
      return await getDownloadURL(storageRef);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Could not upload logo image.'
      );
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const applyValidationErrors = (
    errors: ReturnType<typeof validateExcursionProviderForm>
  ) => {
    const map: Record<string, string> = {};
    errors.forEach((err) => {
      map[err.field] = err.message;
    });
    setFieldErrors(map);
    toast.error(excursionProviderValidationSummary(errors));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateExcursionProviderForm(formData, {
      includeCommercial: showAdminSections,
    });
    if (validationErrors.length > 0) {
      applyValidationErrors(validationErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const normalizedLinkedOwnerIds = normalizeLinkedOwnerIds(linkedOwnerIds);
      if (showAdminSections && normalizedLinkedOwnerIds.length > 0) {
        const conflict = await findExcursionProviderAllocationConflict(
          normalizedLinkedOwnerIds[0],
          docId
        );
        if (conflict) {
          toast.error(
            `This user is already allocated to "${conflict.businessName}". Each excursion provider login can manage one business only.`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const logoUrl = await uploadLogo();
      const basePayload = portalMode
        ? excursionProviderPortalPayloadFromForm(formData)
        : excursionProviderPayloadFromForm(formData);
      if (portalMode && isSuspendedByAdmin) {
        delete basePayload.status;
      }
      const payload = sanitizeFirestorePayload({
        ...basePayload,
        logoUrl,
        updatedAt: new Date().toISOString(),
        ...(showAdminSections ? { linkedOwnerIds: normalizedLinkedOwnerIds } : {}),
      });

      if (isEdit && docId) {
        await updateDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, docId), payload);
        toast.success(portalMode ? 'Business profile saved.' : 'Provider updated.');
      } else {
        await addDoc(collection(db, EXCURSION_PROVIDER_COLLECTION), {
          ...payload,
          linkedOwnerIds: normalizedLinkedOwnerIds,
          createdAt: new Date().toISOString(),
        });
        toast.success('Provider created.');
      }

      navigate(
        portalMode
          ? adminPath(`/excursion-portal/${docId}`)
          : adminPath('/excursions/providers')
      );
    } catch (error) {
      console.error(error);
      toast.error(formatExcursionProviderSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLinkedOwnerId = linkedOwnerIds[0] ?? '';
  const selectablePortalUsers = useMemo(
    () =>
      portalUsers.filter(
        (user) => !allocatedOwnerIds.has(user.id) || user.id === selectedLinkedOwnerId
      ),
    [portalUsers, allocatedOwnerIds, selectedLinkedOwnerId]
  );

  if (loading) {
    return (
      <div className="admin-page py-16 text-center text-gray-500 text-sm">Loading provider…</div>
    );
  }

  const cancelPath = portalMode
    ? scopes.filter((s) => s.kind === 'excursion_provider').length > 1
      ? adminPath('/excursion-portal')
      : adminPath(`/excursion-portal/${docId}`)
    : adminPath('/excursions/providers');

  const selectedPortalUser = portalUsers.find((user) => user.id === selectedLinkedOwnerId);

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={cancelPath}
        backLabel={portalMode ? 'Back to portal' : 'Back to Excursion Providers'}
        title={
          portalMode
            ? formData.businessName || 'My business'
            : isEdit
              ? 'Edit Excursion Provider'
              : 'Add Excursion Provider'
        }
        description={
          portalMode
            ? 'Update your business profile, operating regions, and contact details'
            : isEdit
              ? `Update details for ${formData.businessName || 'this provider'}`
              : 'Register a tour operator or excursion business for your area catalog'
        }
        action={
          isEdit && docId ? (
            <div className="flex flex-wrap gap-2">
              <AdminButtonLink
                to={adminPath(
                  portalMode
                    ? portalExcursionsListPath(docId)
                    : adminExcursionsListPath(docId)
                )}
                variant="secondary"
              >
                Manage excursions
              </AdminButtonLink>
              <AdminButtonLink
                to={adminPath(
                  portalMode
                    ? portalProviderBookingsPath(docId)
                    : adminProviderBookingsPath(docId)
                )}
                variant="secondary"
              >
                All bookings
              </AdminButtonLink>
            </div>
          ) : undefined
        }
      />

      {portalMode && isSuspendedByAdmin && (
        <AdminAlert variant="warning" title="Account suspended" className="mb-6">
          This business has been suspended by Vailo. Contact your administrator to restore access.
          You can still update your profile, but guests will not see your excursions while suspended.
        </AdminAlert>
      )}

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
              <h3 className="admin-section-title border-0 pb-0 mb-4">Business identity</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="businessName">Business name *</AdminLabel>
                  <AdminInput
                    id="businessName"
                    name="businessName"
                    required
                    value={formData.businessName}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.businessName))}
                  />
                  <FieldError message={fieldErrors.businessName} />
                </div>
                <div>
                  <AdminLabel htmlFor="legalName">Legal name</AdminLabel>
                  <AdminInput
                    id="legalName"
                    name="legalName"
                    value={formData.legalName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="vatNumber">VAT number</AdminLabel>
                  <AdminInput
                    id="vatNumber"
                    name="vatNumber"
                    value={formData.vatNumber}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="registrationNumber">Registration number</AdminLabel>
                  <AdminInput
                    id="registrationNumber"
                    name="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="licenseNumber">Tour operator license</AdminLabel>
                  <AdminInput
                    id="licenseNumber"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="languages">Languages spoken</AdminLabel>
                  <AdminInput
                    id="languages"
                    name="languages"
                    value={formData.languages}
                    onChange={handleChange}
                    placeholder="en, el, de"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated language codes or names</p>
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="description">Description</AdminLabel>
                  <AdminTextarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Brief overview of the business and types of excursions offered…"
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel>Logo</AdminLabel>
                  <div className="flex items-start gap-4">
                    <div className="h-20 w-20 rounded-xl border border-gray-200 bg-vailo-surface-elevated flex items-center justify-center overflow-hidden shrink-0">
                      {logoPreview ? (
                        <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon size={28} className="text-gray-300" />
                      )}
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="text-sm text-gray-600"
                      />
                      {isUploadingLogo && (
                        <p className="text-xs text-vailo-teal mt-1 flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Uploading…
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {showAdminSections && (
              <>
                <hr className="border-gray-100" />

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={16} className="text-vailo-teal" />
                    <h3 className="admin-section-title border-0 pb-0 mb-0">Allocated excursion provider</h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Choose the Owners CRM user who can sign in and manage this business only
                    (profile, excursions, calendar, bookings). Create the user under{' '}
                    <strong>Owners CRM</strong> with role <strong>Excursion provider</strong> first.
                  </p>
                  {portalUsers.length === 0 ? (
                    <AdminAlert variant="gold" className="mb-4">
                      No excursion provider users in Owners CRM yet.{' '}
                      <AdminButtonLink to={adminPath('/add-owner')} className="inline-flex mt-2">
                        Add excursion provider user
                      </AdminButtonLink>
                    </AdminAlert>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                      <div className="md:col-span-2">
                        <AdminLabel htmlFor="linkedOwnerId">Portal login user</AdminLabel>
                        <AdminSelect
                          id="linkedOwnerId"
                          value={selectedLinkedOwnerId}
                          onChange={(e) => {
                            const value = e.target.value;
                            setLinkedOwnerIds(value ? [value] : []);
                          }}
                        >
                          <option value="">Not allocated yet</option>
                          {selectablePortalUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.fullName || user.email} ({user.email})
                            </option>
                          ))}
                        </AdminSelect>
                        {selectedPortalUser ? (
                          <p className="text-xs text-gray-500 mt-2">
                            When <strong>{selectedPortalUser.email}</strong> signs in, they will see
                            only this business in the excursion portal.
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-2">
                            Leave unallocated until you are ready for the operator to sign in.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Operating regions *</h3>
              <p className="text-sm text-gray-500 mb-4">
                Add one or more countries, then select all areas where this provider operates.
              </p>

              {formData.operatingRegions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {formData.operatingRegions.map((region) => (
                    <span
                      key={operatingRegionKey(region)}
                      className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-semibold bg-vailo-teal/8 text-vailo-teal border border-vailo-teal/15"
                    >
                      {region.areaName} · {region.country}
                      <button
                        type="button"
                        onClick={() => removeRegion(region)}
                        className="p-0.5 rounded-full hover:bg-vailo-teal/15 transition-colors"
                        aria-label={`Remove ${region.areaName}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div
                className={`rounded-xl border p-4 sm:p-5 space-y-4 ${
                  fieldErrors.operatingRegions
                    ? 'border-red-300 bg-red-50/40'
                    : 'border-gray-200 bg-vailo-surface-elevated/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="flex-1 min-w-0">
                    <AdminLabel htmlFor="countryToAdd">Add country</AdminLabel>
                    <AdminSelect
                      id="countryToAdd"
                      value={countryToAdd}
                      onChange={(e) => setCountryToAdd(e.target.value)}
                    >
                      <option value="">Select country…</option>
                      {availableCountriesToAdd.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
                  <AdminButton
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    disabled={!countryToAdd}
                    onClick={() => {
                      addVisibleCountry(countryToAdd);
                      setCountryToAdd('');
                    }}
                  >
                    <Plus size={16} /> Add country
                  </AdminButton>
                </div>

                {visibleCountries.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No countries added yet. Use the dropdown above to start selecting areas.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {visibleCountries.map((country) => {
                      const areas = areasByCountry[country] || [];
                      const selectedInCountry = formData.operatingRegions.filter(
                        (r) => r.country === country
                      ).length;

                      return (
                        <div
                          key={country}
                          className="rounded-xl border border-gray-100 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="font-semibold text-vailo-dark">{country}</p>
                              <p className="text-xs text-gray-500">
                                {selectedInCountry > 0
                                  ? `${selectedInCountry} area${selectedInCountry !== 1 ? 's' : ''} selected`
                                  : 'Select areas below'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeVisibleCountry(country)}
                              className="text-xs font-medium text-gray-500 hover:text-red-600 transition-colors"
                            >
                              Remove country
                            </button>
                          </div>

                          {areas.length === 0 ? (
                            <p className="text-xs text-amber-700">
                              No areas in this country yet — add one under Area Functionality first.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {areas.map((area) => {
                                const checked = selectedRegionKeys.has(
                                  operatingRegionKey({ country, areaId: area.id })
                                );
                                return (
                                  <label
                                    key={area.id}
                                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                      checked
                                        ? 'border-vailo-teal/30 bg-vailo-teal/5'
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleArea(country, area)}
                                      className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                                    />
                                    <span className="text-sm font-medium text-vailo-dark">
                                      {area.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <FieldError message={fieldErrors.operatingRegions} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mt-5">
                <div>
                  <AdminLabel htmlFor="timezone">Timezone</AdminLabel>
                  <AdminInput
                    id="timezone"
                    name="timezone"
                    value={formData.timezone}
                    onChange={handleChange}
                    placeholder="Europe/Athens"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="status">Status *</AdminLabel>
                  <AdminSelect
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    disabled={portalMode && isSuspendedByAdmin}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    {showAdminSections && <option value="suspended">Suspended</option>}
                  </AdminSelect>
                  {portalMode && !isSuspendedByAdmin && (
                    <p className="text-xs text-gray-500 mt-1">
                      Set to Active when your profile is ready for guests to see.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="contactPersonName">Contact person</AdminLabel>
                  <AdminInput
                    id="contactPersonName"
                    name="contactPersonName"
                    value={formData.contactPersonName}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="email">Email</AdminLabel>
                  <AdminInput
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.email))}
                  />
                  <FieldError message={fieldErrors.email} />
                </div>
                <div>
                  <AdminLabel htmlFor="phone">Phone</AdminLabel>
                  <AdminInput
                    id="phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="whatsapp">WhatsApp</AdminLabel>
                  <AdminInput
                    id="whatsapp"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="website">Website</AdminLabel>
                  <AdminInput
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://"
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Billing address</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="billingAddress">Address</AdminLabel>
                  <AdminInput
                    id="billingAddress"
                    name="billingAddress"
                    value={formData.billingAddress}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="city">City</AdminLabel>
                  <AdminInput id="city" name="city" value={formData.city} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="postalCode">Postal code</AdminLabel>
                  <AdminInput
                    id="postalCode"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </section>

            {showAdminSections && (
              <>
                <hr className="border-gray-100" />

                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Lock size={16} className="text-vailo-gold" />
                    <h3 className="admin-section-title border-0 pb-0 mb-0">Commercial terms</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-vailo-gold/15 text-vailo-dark border border-vailo-gold/25">
                      Admin only
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Margin and contract fields are visible only to platform admins.
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
                    <div>
                      <AdminLabel htmlFor="payoutTerms">Payout terms</AdminLabel>
                      <AdminSelect
                        id="payoutTerms"
                        name="payoutTerms"
                        value={formData.payoutTerms}
                        onChange={handleChange}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="on_completion">On completion</option>
                      </AdminSelect>
                    </div>
                    <div>
                      <AdminLabel htmlFor="contractStartDate">Contract start</AdminLabel>
                      <AdminInput
                        id="contractStartDate"
                        name="contractStartDate"
                        type="date"
                        value={formData.contractStartDate}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <AdminLabel htmlFor="contractEndDate">Contract end</AdminLabel>
                      <AdminInput
                        id="contractEndDate"
                        name="contractEndDate"
                        type="date"
                        value={formData.contractEndDate}
                        onChange={handleChange}
                        className={fieldErrorClass(Boolean(fieldErrors.contractEndDate))}
                      />
                      <FieldError message={fieldErrors.contractEndDate} />
                    </div>
                    <div className="md:col-span-2">
                      <AdminLabel htmlFor="contractNotes">Contract notes</AdminLabel>
                      <AdminTextarea
                        id="contractNotes"
                        name="contractNotes"
                        rows={2}
                        value={formData.contractNotes}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <AdminLabel htmlFor="internalNotes">Internal notes</AdminLabel>
                      <AdminTextarea
                        id="internalNotes"
                        name="internalNotes"
                        rows={2}
                        value={formData.internalNotes}
                        onChange={handleChange}
                        placeholder="Admin-only notes about this provider…"
                      />
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex items-center justify-end gap-3">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => navigate(cancelPath)}
            >
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting || isUploadingLogo}>
              {isSubmitting
                ? 'Saving…'
                : portalMode
                  ? 'Save profile'
                  : isEdit
                    ? 'Save Changes'
                    : 'Create Provider'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
