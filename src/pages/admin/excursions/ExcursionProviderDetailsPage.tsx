import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Anchor, Loader2, Plus, Trash2 } from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION } from '../../../lib/excursionProvider';
import {
  adminExcursionsListPath,
  portalExcursionsListPath,
} from '../../../lib/excursion';
import {
  EMPTY_EXCURSION_PROVIDER_DETAILS_FORM,
  createFleetRow,
  createFleetSpecRow,
  excursionProviderDetailsFormFromDoc,
  excursionProviderDetailsPayloadFromForm,
  type ExcursionProviderDetailsFormData,
  type ExcursionProviderFleetFormRow,
} from '../../../lib/excursionProviderDetails';
import {
  AdminBackHeader,
  AdminButton,
  AdminButtonLink,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';

type FleetPhotoPending = {
  localId: string;
  file: File;
  preview: string;
};

export default function ExcursionProviderDetailsPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [providerName, setProviderName] = useState('');
  const [formData, setFormData] = useState<ExcursionProviderDetailsFormData>(
    EMPTY_EXCURSION_PROVIDER_DETAILS_FORM
  );
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [fleetPhotosPending, setFleetPhotosPending] = useState<Record<string, FleetPhotoPending[]>>(
    {}
  );

  const listPath = providerId
    ? adminPath(
        portalMode ? portalExcursionsListPath(providerId) : adminExcursionsListPath(providerId)
      )
    : adminPath('/excursions/providers');

  useEffect(() => {
    if (!providerId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId))
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Provider not found.');
          navigate(listPath);
          return;
        }
        const data = snap.data();
        setProviderName(String(data.businessName || 'Provider'));
        setFormData(excursionProviderDetailsFormFromDoc(data));
      })
      .catch((error) => {
        console.error(error);
        toast.error('Failed to load provider details.');
      })
      .finally(() => setLoading(false));
  }, [providerId, toast, navigate, listPath]);

  const updateFleetRow = (
    index: number,
    patch: Partial<Omit<ExcursionProviderFleetFormRow, 'localId' | 'specifications'>>
  ) => {
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const handleFleetPhotoFiles = (fleetLocalId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setFleetPhotosPending((prev) => ({
      ...prev,
      [fleetLocalId]: [
        ...(prev[fleetLocalId] ?? []),
        ...files.map((file) => ({
          localId: `fleet-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: URL.createObjectURL(file),
        })),
      ],
    }));
    event.target.value = '';
  };

  const removeFleetPhotoUrl = (fleetIndex: number, url: string) => {
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.map((row, i) =>
        i === fleetIndex ? { ...row, photoUrls: row.photoUrls.filter((item) => item !== url) } : row
      ),
    }));
  };

  const removeFleetPhotoPending = (fleetLocalId: string, pendingLocalId: string) => {
    setFleetPhotosPending((prev) => {
      const pending = prev[fleetLocalId] ?? [];
      const item = pending.find((entry) => entry.localId === pendingLocalId);
      if (item?.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      const nextPending = pending.filter((entry) => entry.localId !== pendingLocalId);
      if (nextPending.length === 0) {
        const { [fleetLocalId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fleetLocalId]: nextPending };
    });
  };

  const clearFleetPhotosPending = (fleetLocalId: string) => {
    setFleetPhotosPending((prev) => {
      const pending = prev[fleetLocalId] ?? [];
      pending.forEach((item) => {
        if (item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      });
      const { [fleetLocalId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const uploadFleetPhotos = async (
    fleet: ExcursionProviderFleetFormRow
  ): Promise<string[]> => {
    const pending = fleetPhotosPending[fleet.localId] ?? [];
    if (pending.length === 0) return fleet.photoUrls;

    const uploaded = await Promise.all(
      pending.map(async (item, index) => {
        const ext = item.file.name.split('.').pop() || 'jpg';
        const path = `excursion-providers/${providerId}/fleet/${fleet.localId}/${Date.now()}-${index}.${ext}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, item.file);
        return getDownloadURL(storageRef);
      })
    );

    return [...fleet.photoUrls, ...uploaded];
  };

  const addFleetRow = () => {
    setFormData((prev) => ({
      ...prev,
      fleet: [...prev.fleet, createFleetRow()],
    }));
  };

  const removeFleetRow = (index: number) => {
    const fleetLocalId = formData.fleet[index]?.localId;
    if (fleetLocalId) clearFleetPhotosPending(fleetLocalId);
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.filter((_, i) => i !== index),
    }));
  };

  const addSpecRow = (fleetIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.map((row, i) =>
        i === fleetIndex
          ? { ...row, specifications: [...row.specifications, createFleetSpecRow()] }
          : row
      ),
    }));
  };

  const updateSpecRow = (
    fleetIndex: number,
    specIndex: number,
    patch: Partial<{ label: string; value: string }>
  ) => {
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.map((row, i) =>
        i === fleetIndex
          ? {
              ...row,
              specifications: row.specifications.map((spec, j) =>
                j === specIndex ? { ...spec, ...patch } : spec
              ),
            }
          : row
      ),
    }));
  };

  const removeSpecRow = (fleetIndex: number, specIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      fleet: prev.fleet.map((row, i) =>
        i === fleetIndex
          ? {
              ...row,
              specifications: row.specifications.filter((_, j) => j !== specIndex),
            }
          : row
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!providerId) return;

    const namedFleet = formData.fleet.filter((row) => row.name.trim());
    if (formData.fleet.some((row) => !row.name.trim() && row.model.trim())) {
      toast.error('Each fleet entry needs a name.');
      return;
    }

    setIsSubmitting(true);
    setIsUploadingPhotos(true);
    try {
      const fleetWithPhotos = await Promise.all(
        namedFleet.map(async (row) => ({
          ...row,
          photoUrls: await uploadFleetPhotos(row),
        }))
      );

      namedFleet.forEach((row) => clearFleetPhotosPending(row.localId));

      await updateDoc(
        doc(db, EXCURSION_PROVIDER_COLLECTION, providerId),
        excursionProviderDetailsPayloadFromForm({ ...formData, fleet: fleetWithPhotos })
      );

      setFormData((prev) => ({
        ...prev,
        fleet: prev.fleet.map((row) => {
          const saved = fleetWithPhotos.find((entry) => entry.localId === row.localId);
          return saved ? { ...row, photoUrls: saved.photoUrls } : row;
        }),
      }));

      toast.success('Provider details saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save provider details.');
    } finally {
      setIsSubmitting(false);
      setIsUploadingPhotos(false);
    }
  };

  if (!providerId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading provider details…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to excursions"
        title="Provider details"
        description={
          providerName
            ? `Shared information for all excursions by ${providerName}`
            : 'About text and fleet information shared across excursions'
        }
        action={
          <AdminButtonLink to={listPath} variant="secondary">
            Manage excursions
          </AdminButtonLink>
        }
      />

      <form onSubmit={handleSubmit}>
        <AdminCard className="p-4 sm:p-6 space-y-8">
          <section>
            <h3 className="admin-section-title border-0 pb-0 mb-1">About</h3>
            <p className="text-sm text-gray-500 mb-4">
              General introduction shown for this provider&apos;s excursions — journey overview,
              destinations, experience highlights.
            </p>
            <AdminLabel htmlFor="about">About text</AdminLabel>
            <AdminTextarea
              id="about"
              rows={8}
              value={formData.about}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, about: event.target.value }))
              }
              placeholder="Step aboard and embark on a journey to Balos Lagoon and Gramvousa Island…"
            />
          </section>

          <hr className="border-gray-100" />

          <section>
            <h3 className="admin-section-title border-0 pb-0 mb-1">Useful info</h3>
            <p className="text-sm text-gray-500 mb-4">
              Departure point, practical notes, links, or other details guests may need.
            </p>
            <AdminLabel htmlFor="usefulInfo">Useful information</AdminLabel>
            <AdminTextarea
              id="usefulInfo"
              rows={6}
              value={formData.usefulInfo}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, usefulInfo: event.target.value }))
              }
              placeholder="Our journey starts from the Port of Kissamos…"
            />
          </section>

          <hr className="border-gray-100" />

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="admin-section-title border-0 pb-0 mb-1">Fleet</h3>
                <p className="text-sm text-gray-500">
                  Boats, vehicles, or vessels used for excursions. Add one entry per item in your
                  fleet.
                </p>
              </div>
              <AdminButton type="button" variant="secondary" onClick={addFleetRow}>
                <Plus size={16} /> Add fleet item
              </AdminButton>
            </div>

            {formData.fleet.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-vailo-surface-elevated/30 px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-vailo-teal/10 text-vailo-teal">
                  <Anchor size={18} />
                </div>
                <p className="text-sm font-medium text-vailo-dark">No fleet items yet</p>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Add boats or vehicles with model, year, description, and technical specifications.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.fleet.map((fleet, fleetIndex) => (
                  <div
                    key={fleet.localId}
                    className="rounded-xl border border-gray-200 bg-vailo-surface-elevated/40 p-4 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <p className="text-sm font-semibold text-vailo-dark">
                          {fleet.name.trim() || `Fleet item ${fleetIndex + 1}`}
                        </p>
                        {fleet.model.trim() && (
                          <p className="text-xs text-gray-500 mt-0.5">{fleet.model.trim()}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFleetRow(fleetIndex)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove fleet item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                      <div>
                        <AdminLabel htmlFor={`fleet-name-${fleetIndex}`}>Name</AdminLabel>
                        <AdminInput
                          id={`fleet-name-${fleetIndex}`}
                          value={fleet.name}
                          onChange={(event) =>
                            updateFleetRow(fleetIndex, { name: event.target.value })
                          }
                          placeholder="S/Y Izabela"
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`fleet-model-${fleetIndex}`}>Model / type</AdminLabel>
                        <AdminInput
                          id={`fleet-model-${fleetIndex}`}
                          value={fleet.model}
                          onChange={(event) =>
                            updateFleetRow(fleetIndex, { model: event.target.value })
                          }
                          placeholder="Beneteau Oceanis 46"
                        />
                      </div>
                      <div>
                        <AdminLabel htmlFor={`fleet-year-${fleetIndex}`}>Year built</AdminLabel>
                        <AdminInput
                          id={`fleet-year-${fleetIndex}`}
                          value={fleet.yearBuilt}
                          onChange={(event) =>
                            updateFleetRow(fleetIndex, { yearBuilt: event.target.value })
                          }
                          placeholder="2009"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <AdminLabel htmlFor={`fleet-description-${fleetIndex}`}>
                          Description
                        </AdminLabel>
                        <AdminTextarea
                          id={`fleet-description-${fleetIndex}`}
                          rows={4}
                          value={fleet.description}
                          onChange={(event) =>
                            updateFleetRow(fleetIndex, { description: event.target.value })
                          }
                          placeholder="Escape the ordinary and set sail on a remarkable seafaring adventure…"
                        />
                      </div>
                    </div>

                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <AdminLabel htmlFor={`fleet-photos-${fleetIndex}`}>Photos</AdminLabel>
                      <p className="text-xs text-gray-500 mb-3">
                        Images of this vessel or vehicle — shown with fleet details.
                      </p>
                      {(fleet.photoUrls.length > 0 ||
                        (fleetPhotosPending[fleet.localId]?.length ?? 0) > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                          {fleet.photoUrls.map((url) => (
                            <div
                              key={url}
                              className="relative aspect-[4/3] rounded-xl border border-gray-200 overflow-hidden bg-vailo-surface-elevated"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeFleetPhotoUrl(fleetIndex, url)}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors"
                                aria-label="Remove photo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          {(fleetPhotosPending[fleet.localId] ?? []).map((item) => (
                            <div
                              key={item.localId}
                              className="relative aspect-[4/3] rounded-xl border border-dashed border-vailo-teal/40 overflow-hidden bg-vailo-surface-elevated"
                            >
                              <img src={item.preview} alt="" className="h-full w-full object-cover" />
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-vailo-teal text-white text-[10px] font-bold uppercase">
                                New
                              </span>
                              <button
                                type="button"
                                onClick={() => removeFleetPhotoPending(fleet.localId, item.localId)}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/70 transition-colors"
                                aria-label="Remove photo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input
                        id={`fleet-photos-${fleetIndex}`}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => handleFleetPhotoFiles(fleet.localId, event)}
                        className="text-sm text-gray-600"
                      />
                      {isUploadingPhotos && (fleetPhotosPending[fleet.localId]?.length ?? 0) > 0 && (
                        <p className="text-xs text-vailo-teal mt-1 flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" /> Uploading photos…
                        </p>
                      )}
                    </div>

                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-vailo-dark">
                            Technical specifications
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Label and value pairs — e.g. Cabins, Length, Motor power.
                          </p>
                        </div>
                        <AdminButton
                          type="button"
                          variant="secondary"
                          onClick={() => addSpecRow(fleetIndex)}
                        >
                          <Plus size={16} /> Add spec
                        </AdminButton>
                      </div>

                      {fleet.specifications.length === 0 ? (
                        <p className="text-xs text-gray-500">No specifications added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {fleet.specifications.map((spec, specIndex) => (
                            <div
                              key={spec.localId}
                              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start"
                            >
                              <AdminInput
                                value={spec.label}
                                onChange={(event) =>
                                  updateSpecRow(fleetIndex, specIndex, {
                                    label: event.target.value,
                                  })
                                }
                                placeholder="Cabins"
                                aria-label={`Specification label ${specIndex + 1}`}
                              />
                              <AdminInput
                                value={spec.value}
                                onChange={(event) =>
                                  updateSpecRow(fleetIndex, specIndex, {
                                    value: event.target.value,
                                  })
                                }
                                placeholder="4"
                                aria-label={`Specification value ${specIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeSpecRow(fleetIndex, specIndex)}
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors justify-self-start sm:justify-self-auto"
                                title="Remove specification"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-3 pt-2">
            <AdminButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving…
                </>
              ) : (
                'Save details'
              )}
            </AdminButton>
            <AdminButtonLink to={listPath} variant="secondary">
              Cancel
            </AdminButtonLink>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
