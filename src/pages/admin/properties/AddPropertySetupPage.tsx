import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { adminPath } from '../../../lib/adminRoutes';
import {
  clearAddPropertyDraft,
  emptyAddPropertyDraft,
  readAddPropertyDraft,
  writeAddPropertyDraft,
  type AddPropertyDraft,
  type AddPropertySetupStep,
} from '../../../lib/addPropertyDraft';
import {
  fetchNearestEssentialPlaces,
  loadAreaLocalGemsForListing,
} from '../../../lib/addPropertyAroundData';
import { emptyEssentialsBySlot } from '../../../lib/addPropertyEssentials';
import {
  houseGuideSeedToFormPatch,
  mapEssentialsToHouseGuide,
} from '../../../lib/mapEssentialsToHouseGuide';
import { createPropertyFromAddDraft } from '../../../lib/createPropertyFromAddDraft';
import {
  buildListingOnboardingSeedText,
  firstWizardListingErrorKey,
  getWizardListingFieldErrors,
  hasWizardHouseGuideUserSources,
  isWizardListingComplete,
  wizardListingFieldDomId,
  type WizardListingDraft,
  type WizardListingFieldErrors,
} from '../../../lib/wizardListingOnboarding';
import {
  serializeGuideFormDataForSave,
  type HouseGuideFormData,
} from '../../../lib/houseGuideLocales';
import { DEFAULT_PRIMARY_LOCALE } from '../../../lib/propertyContentLocales';
import {
  countListingsTowardCapacity,
  creatorListingQuotaMessage,
} from '../../../lib/ownerListingQuota';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { useAdminSession } from '../../../context/AdminSessionContext';
import PropertyWizardListingStep from '../../../components/admin/PropertyWizardListingStep';
import AddPropertyGuestPortalPreview from '../../../components/admin/AddPropertyGuestPortalPreview';
import AddPropertyAroundStep from '../../../components/admin/AddPropertyAroundStep';
import HouseGuideImportPanel from '../../../components/admin/HouseGuideImportPanel';
import { AdminButton } from '../../../components/admin/AdminPageHeader';

export default function AddPropertySetupPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile, portfolioProperties, portfolioTypes } = useAdminSession();
  const isCapacityUser = profile?.role === 'agent' || profile?.role === 'owner';
  const [draft, setDraft] = useState<AddPropertyDraft>(() => {
    const stored = readAddPropertyDraft();
    // Fresh visit from Properties should start clean; resume mid flow when listing is complete.
    if (
      (stored.setupStep === 'around' || stored.setupStep === 'houseGuide') &&
      isWizardListingComplete(stored.listingDraft)
    ) {
      return stored;
    }
    return emptyAddPropertyDraft();
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [onboardingFiles, setOnboardingFiles] = useState<File[]>([]);
  const [fieldErrors, setFieldErrors] = useState<WizardListingFieldErrors>({});
  const [advancing, setAdvancing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [guideFormData, setGuideFormData] = useState<HouseGuideFormData>({});
  const [guideSaving, setGuideSaving] = useState(false);
  const [postCreateImport, setPostCreateImport] = useState<{
    propertyId: string;
    listingId: string;
    seedText: string;
    files: File[];
    emptySources?: boolean;
  } | null>(null);
  /** Listing already created — show House Guide inputs again to top up. */
  const [topUpListing, setTopUpListing] = useState<{
    propertyId: string;
    listingId: string;
  } | null>(null);
  const [loadingGems, setLoadingGems] = useState(false);
  const [loadingEssentials, setLoadingEssentials] = useState(false);
  const [essentialsError, setEssentialsError] = useState<string | null>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | null>(null);
  const essentialsLoadedForRef = useRef('');

  const listingDraft = draft.listingDraft;
  const photoPreview = draft.photoPreview;
  const setupStep: AddPropertySetupStep = draft.setupStep;

  const persist = useCallback((next: AddPropertyDraft) => {
    setDraft(next);
    writeAddPropertyDraft(next);
  }, []);

  /** Always merge via functional state — never spread a stale `draft` closure. */
  const patchListing = useCallback((next: WizardListingDraft) => {
    setDraft((prev) => {
      const updated: AddPropertyDraft = { ...prev, listingDraft: next };
      writeAddPropertyDraft(updated);
      return updated;
    });
  }, []);

  const patchPhoto = useCallback((file: File | null, previewUrl: string | null) => {
    setPhotoFile(file);
    setDraft((prev) => {
      let listingDraft = prev.listingDraft;
      if (!file && !previewUrl) {
        listingDraft = { ...listingDraft, photoUrl: '' };
      } else if (previewUrl && !file) {
        // Mirrored Google photo — keep every autofilled field, only set photo.
        listingDraft = { ...listingDraft, photoUrl: previewUrl };
      }
      const updated: AddPropertyDraft = {
        ...prev,
        listingDraft,
        photoPreview: previewUrl,
      };
      writeAddPropertyDraft(updated);
      return updated;
    });
  }, []);

  useLayoutEffect(() => {
    const spacer = spacerRef.current;
    if (!spacer) return;

    const update = () => {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!isDesktop) {
        setFixedStyle(null);
        return;
      }

      const rect = spacer.getBoundingClientRect();
      const top = 88;
      const maxHeight = Math.max(360, window.innerHeight - top - 16);
      const scale = Math.min(1, maxHeight / 520);

      setFixedStyle({
        position: 'fixed',
        top,
        left: rect.left,
        width: rect.width,
        zIndex: 30,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
      });
    };

    update();
    window.addEventListener('resize', update);
    const main = spacer.closest('main');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(document.body);
    if (main) ro?.observe(main);

    return () => {
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [setupStep]);

  const loadAroundData = useCallback(
    async (listing: WizardListingDraft, options?: { forceEssentials?: boolean }) => {
      const lat = Number(listing.latitude);
      const lng = Number(listing.longitude);
      const pinKey = `${listing.country}|${listing.city}|${lat.toFixed(5)},${lng.toFixed(5)}`;

      setLoadingGems(true);
      try {
        const { areaContext, gems } = await loadAreaLocalGemsForListing({
          country: listing.country,
          city: listing.city,
          latitude: Number.isFinite(lat) ? lat : null,
          longitude: Number.isFinite(lng) ? lng : null,
        });
        setDraft((prev) => {
          const next: AddPropertyDraft = {
            ...prev,
            listingDraft: listing,
            setupStep: 'around',
            areaContext,
            areaLocalGems: gems,
          };
          writeAddPropertyDraft(next);
          return next;
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Could not load area local gems.'
        );
      } finally {
        setLoadingGems(false);
      }

      if (!options?.forceEssentials && essentialsLoadedForRef.current === pinKey) {
        return;
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setEssentialsError('Property pin is required to find nearby places.');
        return;
      }

      setLoadingEssentials(true);
      setEssentialsError(null);
      try {
        const essentialsBySlot = await fetchNearestEssentialPlaces({
          latitude: lat,
          longitude: lng,
        });
        essentialsLoadedForRef.current = pinKey;
        setDraft((prev) => {
          const next: AddPropertyDraft = {
            ...prev,
            listingDraft: listing,
            setupStep: 'around',
            essentialsBySlot,
            selectedEssentialKeys: [],
          };
          writeAddPropertyDraft(next);
          return next;
        });
      } catch (error) {
        setEssentialsError(
          error instanceof Error ? error.message : 'Could not find nearby essentials.'
        );
      } finally {
        setLoadingEssentials(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (setupStep !== 'around') return;
    if (!isWizardListingComplete(listingDraft)) return;
    const lat = Number(listingDraft.latitude);
    const lng = Number(listingDraft.longitude);
    const pinKey = `${listingDraft.country}|${listingDraft.city}|${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (essentialsLoadedForRef.current === pinKey) return;
    if (
      draft.areaLocalGems.length > 0 ||
      Object.values(draft.essentialsBySlot).some((list) => Array.isArray(list) && list.length > 0)
    ) {
      essentialsLoadedForRef.current = pinKey;
      return;
    }
    void loadAroundData(listingDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when entering around step
  }, [setupStep]);

  const goToAroundStep = async () => {
    const errors = getWizardListingFieldErrors(listingDraft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstKey = firstWizardListingErrorKey(errors);
      if (firstKey) {
        document
          .getElementById(wizardListingFieldDomId(firstKey))
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast.error('Finish the required listing details before continuing.');
      return;
    }

    setAdvancing(true);
    try {
      const next: AddPropertyDraft = {
        ...draft,
        listingDraft,
        setupStep: 'around',
        essentialsBySlot: emptyEssentialsBySlot(),
      };
      persist(next);
      essentialsLoadedForRef.current = '';
      await loadAroundData(listingDraft, { forceEssentials: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setAdvancing(false);
    }
  };

  const goToHouseGuideStep = () => {
    const houseGuideSeed = mapEssentialsToHouseGuide({
      essentialsBySlot: draft.essentialsBySlot,
      selectedEssentialKeys: draft.selectedEssentialKeys,
      country: listingDraft.country,
      includeCountryEmergencyPhones: true,
    });
    const next: AddPropertyDraft = {
      ...draft,
      listingDraft,
      setupStep: 'houseGuide',
      houseGuideSeed,
    };
    persist(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTopUpImport = () => {
    if (!topUpListing || creating) return;
    const emptySources = !hasWizardHouseGuideUserSources(listingDraft, onboardingFiles);
    if (emptySources) {
      toast.error('Add a link, notes, or a file — or click Finish.');
      return;
    }
    const seedText = buildListingOnboardingSeedText(listingDraft);
    setPostCreateImport({
      propertyId: topUpListing.propertyId,
      listingId: topUpListing.listingId,
      seedText,
      files: onboardingFiles,
      emptySources: false,
    });
    setTopUpListing(null);
    toast.success('House Guide AI Import is starting…');
    window.setTimeout(() => {
      document.getElementById('add-property-house-guide-import')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
  };

  const handleContinueCreateAndImport = async () => {
    if (creating || postCreateImport) return;

    const errors = getWizardListingFieldErrors(listingDraft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Listing details are incomplete — go back and finish required fields.');
      persist({ ...draft, listingDraft, setupStep: 'listing' });
      return;
    }

    if (isCapacityUser && profile) {
      const used = countListingsTowardCapacity(profile, portfolioProperties, portfolioTypes);
      const quotaError = creatorListingQuotaMessage(profile, used);
      if (quotaError) {
        toast.error(quotaError);
        return;
      }
    }

    const houseGuideSeed =
      draft.houseGuideSeed ||
      mapEssentialsToHouseGuide({
        essentialsBySlot: draft.essentialsBySlot,
        selectedEssentialKeys: draft.selectedEssentialKeys,
        country: listingDraft.country,
        includeCountryEmergencyPhones: true,
      });

    setCreating(true);
    try {
      const agencyName =
        profile?.company?.trim() || profile?.fullName?.trim() || '';
      const selectedIdSet = new Set(draft.selectedLocalGemIds);
      const selectedLocalGems = draft.areaLocalGems
        .filter((gem) => selectedIdSet.has(gem.id))
        .map((gem) => ({
          name: gem.name,
          description: gem.description,
          category: gem.category,
          categories: gem.categories,
          address: gem.address,
          photoUrl: gem.photoUrl,
          googleMapsUrl: gem.googleMapsUrl,
          googlePlaceId: gem.googlePlaceId || '',
          rating: gem.rating,
          latitude: gem.latitude,
          longitude: gem.longitude,
          sourceAreaGemId: gem.id,
          seededFromAddProperty: true,
        }));

      const created = await createPropertyFromAddDraft({
        listingDraft,
        photoFile,
        houseGuideSeed,
        selectedLocalGems,
        ownerId: isCapacityUser && profile?.id ? profile.id : undefined,
        agencyName: isCapacityUser ? agencyName : agencyName || undefined,
        listingOwnerId: profile?.role === 'owner' && profile.id ? profile.id : undefined,
      });

      const seedPatch = houseGuideSeedToFormPatch(houseGuideSeed);
      setGuideFormData(seedPatch);

      const emptySources = !hasWizardHouseGuideUserSources(listingDraft, onboardingFiles);
      setTopUpListing(null);
      setPostCreateImport({
        propertyId: created.propertyId,
        listingId: created.listingId,
        seedText: emptySources ? '' : created.seedText,
        files: emptySources ? [] : onboardingFiles,
        emptySources,
      });

      clearAddPropertyDraft();
      toast.success(
        emptySources
          ? 'Listing created. Add House Guide sources or finish.'
          : 'Listing created. House Guide AI Import is starting…'
      );
      window.setTimeout(() => {
        document.getElementById('add-property-house-guide-import')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
    } catch (error) {
      console.error('Add property create failed:', error);
      toast.error(
        error instanceof Error ? error.message : 'Could not create the property. Try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const stepMeta =
    setupStep === 'listing'
      ? {
          indexLabel: '1 of 3',
          stepLabel: 'Step 1 · Listing details',
          title: 'Get your property ready in minutes',
          blurb:
            'Paste a Google Maps place link to auto-fill listing details, or enter everything yourself. Watch the guest portal preview update as you go.',
        }
      : setupStep === 'around'
        ? {
            indexLabel: '2 of 3',
            stepLabel: 'Step 2 · Around the property',
            title: 'Local gems & nearby essentials',
            blurb:
              'Select area local gems and review the nearest safety, useful, and transport places for the guest guide.',
          }
        : postCreateImport
          ? {
              indexLabel: '3 of 3',
              stepLabel: 'Step 3 · House Guide',
              title: 'House Guide',
              blurb: postCreateImport.emptySources
                ? 'No notes, links, or files yet — add more to train the AI, or finish for now.'
                : 'AI is collecting your sources. You’ll see which links succeeded or failed, then Finish goes to Properties.',
            }
          : topUpListing
            ? {
                indexLabel: '3 of 3',
                stepLabel: 'Step 3 · House Guide',
                title: 'House Guide · add more',
                blurb:
                  'Add listing pages, files, or pasted notes, then run AI Import — or finish without adding more.',
              }
            : {
                indexLabel: '3 of 3',
                stepLabel: 'Step 3 · House Guide',
                title: 'House Guide · train the AI',
                blurb:
                  'House Guide is where Vailo’s guest chatbot learns this property — listing pages, files, or pasted notes. Add it once; it answers on its own, and you can top up anytime.',
              };

  const locationLabel = [listingDraft.area, listingDraft.city, listingDraft.country]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');

  return (
    <div className="admin-page max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_232px] gap-6 xl:gap-8 items-start">
        <div className="min-w-0 order-2 lg:order-1">
          {setupStep === 'listing' || postCreateImport || topUpListing ? (
            <Link
              to={adminPath('/properties')}
              className="admin-back-link"
              onClick={() => clearAddPropertyDraft()}
            >
              <ArrowLeft size={16} />
              Back to Properties
            </Link>
          ) : (
            <button
              type="button"
              className="admin-back-link"
              onClick={() =>
                persist({
                  ...draft,
                  setupStep: setupStep === 'houseGuide' ? 'around' : 'listing',
                })
              }
            >
              <ArrowLeft size={16} />
              {setupStep === 'houseGuide'
                ? 'Back to local gems & nearby'
                : 'Back to listing details'}
            </button>
          )}

          <div className="mt-4 mb-7 max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 mb-1.5">
              Add property · {stepMeta.indexLabel}
            </p>
            <h1 className="text-xl sm:text-[1.35rem] font-bold text-vailo-dark leading-snug">
              {stepMeta.title}
            </h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{stepMeta.blurb}</p>
          </div>

          {setupStep === 'listing' ? (
            <>
              <PropertyWizardListingStep
                value={listingDraft}
                onChange={patchListing}
                photoFile={photoFile}
                photoPreview={photoPreview}
                calendarSyncEnabled={false}
                hideHero
                hideHouseGuideNotes
                fieldErrors={fieldErrors}
                onClearFieldError={(key) =>
                  setFieldErrors((prev) => {
                    if (!prev[key]) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })
                }
                onPhotoFileChange={patchPhoto}
              />

              <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-5">
                <p className="text-xs text-gray-400">
                  Next: local gems, safety, useful info, and transportation around the pin.
                </p>
                <AdminButton
                  type="button"
                  onClick={() => void goToAroundStep()}
                  disabled={advancing}
                  className="sm:min-w-[11rem]"
                >
                  {advancing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  Next
                </AdminButton>
              </div>
            </>
          ) : setupStep === 'around' ? (
            <>
              <AddPropertyAroundStep
                areaContext={draft.areaContext}
                locationLabel={locationLabel}
                country={listingDraft.country}
                propertyLatitude={listingDraft.latitude}
                propertyLongitude={listingDraft.longitude}
                gems={draft.areaLocalGems}
                selectedLocalGemIds={draft.selectedLocalGemIds}
                essentialsBySlot={draft.essentialsBySlot}
                selectedEssentialKeys={draft.selectedEssentialKeys}
                loadingGems={loadingGems}
                loadingEssentials={loadingEssentials}
                essentialsError={essentialsError}
                onToggleGem={(gemId) => {
                  setDraft((prev) => {
                    const selected = prev.selectedLocalGemIds.includes(gemId)
                      ? prev.selectedLocalGemIds.filter((id) => id !== gemId)
                      : [...prev.selectedLocalGemIds, gemId];
                    const next = { ...prev, selectedLocalGemIds: selected };
                    writeAddPropertyDraft(next);
                    return next;
                  });
                }}
                onSetCategoryGems={(gemIds, selected) => {
                  setDraft((prev) => {
                    const idSet = new Set(gemIds);
                    let selectedLocalGemIds = prev.selectedLocalGemIds.filter(
                      (id) => !idSet.has(id)
                    );
                    if (selected) {
                      selectedLocalGemIds = [...selectedLocalGemIds, ...gemIds];
                    }
                    const next = { ...prev, selectedLocalGemIds };
                    writeAddPropertyDraft(next);
                    return next;
                  });
                }}
                onToggleEssential={(key) => {
                  setDraft((prev) => {
                    const selectedEssentialKeys = prev.selectedEssentialKeys.includes(key)
                      ? prev.selectedEssentialKeys.filter((k) => k !== key)
                      : [...prev.selectedEssentialKeys, key];
                    const next = { ...prev, selectedEssentialKeys };
                    writeAddPropertyDraft(next);
                    return next;
                  });
                }}
                onSetEssentialKeys={(keys, selected) => {
                  setDraft((prev) => {
                    const keySet = new Set(keys);
                    let selectedEssentialKeys = prev.selectedEssentialKeys.filter(
                      (k) => !keySet.has(k)
                    );
                    if (selected) {
                      selectedEssentialKeys = [...selectedEssentialKeys, ...keys];
                    }
                    const next = { ...prev, selectedEssentialKeys };
                    writeAddPropertyDraft(next);
                    return next;
                  });
                }}
                onRefreshEssentials={() => {
                  essentialsLoadedForRef.current = '';
                  void loadAroundData(listingDraft, { forceEssentials: true });
                }}
              />

              <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-5">
                <p className="text-xs text-gray-400">
                  {loadingGems || loadingEssentials
                    ? 'Finding nearby places — Save and continue unlocks when this finishes.'
                    : 'Nothing selected is fine — you can add gems and nearby places later. Continue when ready.'}
                </p>
                <AdminButton
                  type="button"
                  variant="secondary"
                  disabled={loadingGems || loadingEssentials}
                  onClick={goToHouseGuideStep}
                >
                  {loadingGems || loadingEssentials ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Finding nearby…
                    </>
                  ) : (
                    <>
                      Save and continue
                      <ArrowRight size={16} />
                    </>
                  )}
                </AdminButton>
              </div>
            </>
          ) : (
            <>
              {!postCreateImport ? (
                <>
                  <PropertyWizardListingStep
                    value={listingDraft}
                    onChange={patchListing}
                    photoFile={photoFile}
                    photoPreview={photoPreview}
                    calendarSyncEnabled={false}
                    hideHero
                    houseGuideOnly
                    onboardingFiles={onboardingFiles}
                    onOnboardingFilesChange={setOnboardingFiles}
                    onPhotoFileChange={patchPhoto}
                  />

                  <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-5">
                    <p className="text-xs text-gray-400">
                      {topUpListing
                        ? 'Run AI Import on the notes, links, and files above — or finish without adding more.'
                        : 'Creates the listing, seeds Nearby pins into House Guide, then runs AI Import.'}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      {topUpListing ? (
                        <AdminButton
                          type="button"
                          variant="secondary"
                          onClick={() => navigate(adminPath('/properties'))}
                        >
                          Finish
                        </AdminButton>
                      ) : null}
                      <AdminButton
                        type="button"
                        onClick={() =>
                          void (topUpListing
                            ? handleTopUpImport()
                            : handleContinueCreateAndImport())
                        }
                        disabled={creating}
                        className="sm:min-w-[12rem]"
                      >
                        {creating ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            {topUpListing ? 'Starting…' : 'Creating…'}
                          </>
                        ) : topUpListing ? (
                          <>
                            Run AI Import
                            <ArrowRight size={16} />
                          </>
                        ) : (
                          <>
                            Continue
                            <ArrowRight size={16} />
                          </>
                        )}
                      </AdminButton>
                    </div>
                  </div>
                </>
              ) : (
                <div id="add-property-house-guide-import" className="relative">
                  <HouseGuideImportPanel
                    key={`${postCreateImport.propertyId}-${postCreateImport.listingId}-${postCreateImport.emptySources ? 'empty' : 'run'}-${postCreateImport.files.length}`}
                    formData={guideFormData}
                    contentLocale={DEFAULT_PRIMARY_LOCALE}
                    primaryLocale={DEFAULT_PRIMARY_LOCALE}
                    initialImportText={postCreateImport.seedText}
                    initialFiles={postCreateImport.files}
                    fromWizard
                    autoAnalyze
                    emptySources={Boolean(postCreateImport.emptySources)}
                    disabled={guideSaving}
                    footerActions={{
                      onContinueListing: () => navigate(adminPath('/properties')),
                      onFinishHouseGuide: () => navigate(adminPath('/properties')),
                      onFinishProperties: () => navigate(adminPath('/properties')),
                      onAddMoreSources: () => {
                        setTopUpListing({
                          propertyId: postCreateImport.propertyId,
                          listingId: postCreateImport.listingId,
                        });
                        setOnboardingFiles([]);
                        patchListing({
                          ...listingDraft,
                          onboardingNotes: '',
                          referenceUrls: [''],
                        });
                        setPostCreateImport(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      },
                    }}
                    onApply={async (next) => {
                      setGuideSaving(true);
                      try {
                        const payload = serializeGuideFormDataForSave(
                          next,
                          DEFAULT_PRIMARY_LOCALE
                        );
                        await setDoc(
                          doc(
                            db,
                            'properties',
                            postCreateImport.propertyId,
                            'propertyTypes',
                            postCreateImport.listingId,
                            'houseGuide',
                            'data'
                          ),
                          {
                            ...payload,
                            updatedAt: new Date().toISOString(),
                          },
                          { merge: true }
                        );
                        setGuideFormData(next);
                      } finally {
                        setGuideSaving(false);
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div ref={spacerRef} className="order-1 lg:order-2 hidden lg:block w-[232px] h-0" aria-hidden />

        <aside className="order-1 lg:order-2 lg:hidden">
          <AddPropertyGuestPortalPreview
            draft={listingDraft}
            photoPreview={photoPreview}
            stepLabel={stepMeta.stepLabel}
          />
        </aside>

        {fixedStyle ? (
          <aside style={fixedStyle} aria-hidden={false}>
            <div className="pointer-events-auto">
              <AddPropertyGuestPortalPreview
                draft={listingDraft}
                photoPreview={photoPreview}
                stepLabel={stepMeta.stepLabel}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
