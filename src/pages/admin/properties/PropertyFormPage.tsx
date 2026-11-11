import {
  useState,
  useEffect,
  useMemo,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { formatGuestSlug, mergePreviousSlugs, slugFromPropertyTypeName } from '../../../lib/guestPortalSlug';
import { isGuestPortalAccessRequired } from '../../../lib/guestAccess';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../../lib/icalSync';
import { adminPath, isAdminPathname } from '../../../lib/adminRoutes';
import {
  ensureUniqueInternalRefCode,
  ensureUniquePropertySlug,
  generateInternalRefCode,
  loadPropertyIdentityIndex,
} from '../../../lib/propertyIdentityUniqueness';
import { ensureAreaDocument } from '../../../lib/ensureAreaDocument';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import { DEFAULT_PRIMARY_LOCALE } from '../../../lib/propertyContentLocales';
import {
  serializeGuideFormDataForSave,
  type HouseGuideFormData,
} from '../../../lib/houseGuideLocales';
import { useToast } from '../../../context/ToastContext';
import { useAdminSession } from '../../../context/AdminSessionContext';
import {
  Building2,
  Home,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Check,
  ClipboardCheck,
  CalendarDays,
  Clock3,
  Sparkles,
  CircleCheck,
  CircleMinus,
  KeyRound,
  Power,
  PowerOff,
  Scissors,
  ArrowLeft,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
} from '../../../components/admin/AdminPageHeader';
import PropertyWizardListingStep from '../../../components/admin/PropertyWizardListingStep';
import HouseGuideImportPanel from '../../../components/admin/HouseGuideImportPanel';
import {
  EMPTY_WIZARD_LISTING,
  buildListingOnboardingSeedText,
  firstWizardListingErrorKey,
  getWizardListingFieldErrors,
  isWizardListingComplete,
  scrollToWizardListingField,
  type WizardListingDraft,
  type WizardListingFieldErrors,
  type WizardListingFieldKey,
} from '../../../lib/wizardListingOnboarding';

/** Hotel kept for existing records / future; new properties are Property-only. */
export type ListingKind = 'hotel' | 'property';

const EMPTY_FORM = {
  propertyName: '',
  urlSlug: '',
  internalRefCode: '',
  listingKind: 'property' as ListingKind,
  guestPortalAccessRequired: false,
  preArrivalCheckInEnabled: true,
  calendarSyncEnabled: false,
  reservationSplitEnabled: false,
};

type PropertyFormData = typeof EMPTY_FORM;

type WizardStepId = 'identity' | 'guest' | 'listing';

type WizardStepDef = {
  id: WizardStepId;
  title: string;
  description: string;
  icon: LucideIcon;
};

const BASE_WIZARD_STEPS: WizardStepDef[] = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'Name and public URL for this property.',
    icon: Building2,
  },
  {
    id: 'guest',
    title: 'Guest experience',
    description: 'Choose what to turn on — take it or leave it.',
    icon: Settings2,
  },
];

const LISTING_WIZARD_STEP: WizardStepDef = {
  id: 'listing',
  title: 'First listing',
  description: 'Add your first unit from Maps, OTAs, and photos.',
  icon: Home,
};

const WIZARD_STEP_ACCENTS: Record<
  WizardStepId,
  {
    chip: string;
    chipActive: string;
    icon: string;
    iconActive: string;
    iconDone: string;
    title: string;
    blob: string;
    progress: string;
  }
> = {
  identity: {
    chip: 'border-teal-100 bg-teal-50/70',
    chipActive: 'border-teal-300 bg-white shadow-md shadow-teal-200/50 ring-2 ring-teal-100',
    icon: 'bg-teal-100 text-teal-600',
    iconActive: 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-500/30',
    iconDone: 'bg-teal-500 text-white',
    title: 'text-teal-800',
    blob: 'from-teal-200/50 via-teal-100/20 to-transparent',
    progress: 'from-teal-400 via-teal-500 to-emerald-400',
  },
  guest: {
    chip: 'border-amber-100 bg-amber-50/70',
    chipActive: 'border-amber-300 bg-white shadow-md shadow-amber-200/50 ring-2 ring-amber-100',
    icon: 'bg-amber-100 text-amber-600',
    iconActive: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-400/30',
    iconDone: 'bg-amber-500 text-white',
    title: 'text-amber-900',
    blob: 'from-amber-200/50 via-orange-100/20 to-transparent',
    progress: 'from-amber-400 via-orange-400 to-rose-300',
  },
  listing: {
    chip: 'border-sky-100 bg-sky-50/70',
    chipActive: 'border-sky-300 bg-white shadow-md shadow-sky-200/50 ring-2 ring-sky-100',
    icon: 'bg-sky-100 text-sky-600',
    iconActive: 'bg-gradient-to-br from-sky-400 to-cyan-600 text-white shadow-lg shadow-sky-400/30',
    iconDone: 'bg-sky-500 text-white',
    title: 'text-sky-900',
    blob: 'from-sky-200/50 via-cyan-100/20 to-transparent',
    progress: 'from-sky-400 via-cyan-400 to-teal-400',
  },
};

type GuestTone = 'teal' | 'mint' | 'sky';

const GUEST_TONES: Record<
  GuestTone,
  {
    card: string;
    soft: string;
    iconWrap: string;
    icon: string;
    step: string;
    onPanel: string;
    onLabel: string;
    offPanel: string;
    offLabel: string;
    toggleOn: string;
  }
> = {
  teal: {
    card: 'border-teal-100/90 bg-gradient-to-br from-teal-50/70 via-white to-white',
    soft: 'bg-teal-50/80 border-teal-100',
    iconWrap: 'bg-teal-100/80 text-teal-700',
    icon: 'text-teal-700',
    step: 'bg-teal-600 text-white',
    onPanel: 'bg-emerald-50/70 border-emerald-100',
    onLabel: 'text-emerald-800',
    offPanel: 'bg-stone-50 border-stone-100',
    offLabel: 'text-stone-500',
    toggleOn: 'bg-teal-600 text-white shadow-sm shadow-teal-600/20',
  },
  mint: {
    card: 'border-emerald-100/90 bg-gradient-to-br from-emerald-50/70 via-white to-white',
    soft: 'bg-emerald-50/80 border-emerald-100',
    iconWrap: 'bg-emerald-100/80 text-emerald-700',
    icon: 'text-emerald-700',
    step: 'bg-emerald-600 text-white',
    onPanel: 'bg-lime-50/80 border-lime-100',
    onLabel: 'text-emerald-800',
    offPanel: 'bg-stone-50 border-stone-100',
    offLabel: 'text-stone-500',
    toggleOn: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20',
  },
  sky: {
    card: 'border-sky-100/90 bg-gradient-to-br from-sky-50/80 via-white to-white',
    soft: 'bg-sky-50/80 border-sky-100',
    iconWrap: 'bg-sky-100/80 text-sky-700',
    icon: 'text-sky-700',
    step: 'bg-sky-600 text-white',
    onPanel: 'bg-cyan-50/70 border-cyan-100',
    onLabel: 'text-sky-800',
    offPanel: 'bg-stone-50 border-stone-100',
    offLabel: 'text-stone-500',
    toggleOn: 'bg-sky-600 text-white shadow-sm shadow-sky-600/20',
  },
};

type GuestExperienceChoiceProps = {
  id: string;
  name: string;
  stepNumber: number;
  title: string;
  icon: LucideIcon;
  tone: GuestTone;
  summary: string;
  maintenance: string;
  onPros: string[];
  onCons: string[];
  offPros: string[];
  offCons: string[];
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  children?: ReactNode;
};

function GuestBullet({
  positive,
  children,
}: {
  positive: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed">
      {positive ? (
        <CircleCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" strokeWidth={2} />
      ) : (
        <CircleMinus size={16} className="text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
      )}
      <span>{children}</span>
    </li>
  );
}

function GuestExperienceChoice({
  id,
  name,
  stepNumber,
  title,
  icon: Icon,
  tone,
  summary,
  maintenance,
  onPros,
  onCons,
  offPros,
  offCons,
  checked,
  onChange,
  children,
}: GuestExperienceChoiceProps) {
  const t = GUEST_TONES[tone];

  return (
    <div className={`rounded-3xl border overflow-hidden transition-all ${t.card}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <span
              className={`h-14 w-14 rounded-2xl flex items-center justify-center ${t.iconWrap}`}
            >
              <Icon size={26} strokeWidth={1.75} />
            </span>
            <span
              className={`absolute -top-1.5 -left-1.5 h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center ${t.step}`}
            >
              {stepNumber}
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h4 className="text-lg font-bold text-slate-800 font-luxury tracking-tight">{title}</h4>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-2xl">{summary}</p>
          </div>
        </div>

        <div
          className={`mt-5 flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 ${t.soft}`}
        >
          <span className={`mt-0.5 ${t.icon}`}>
            <Clock3 size={16} strokeWidth={2} />
          </span>
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">Time to maintain — </span>
            {maintenance}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-4 ${checked ? t.onPanel : 'bg-white/70 border-slate-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <Power size={15} className={checked ? 'text-emerald-600' : 'text-slate-400'} />
              <p className={`text-xs font-bold uppercase tracking-[0.12em] ${t.onLabel}`}>
                If you turn it ON
              </p>
            </div>
            <ul className="space-y-2.5 mb-3">
              {onPros.map((item) => (
                <GuestBullet key={item} positive>
                  {item}
                </GuestBullet>
              ))}
            </ul>
            <ul className="space-y-2.5">
              {onCons.map((item) => (
                <GuestBullet key={item} positive={false}>
                  {item}
                </GuestBullet>
              ))}
            </ul>
          </div>

          <div className={`rounded-2xl border p-4 ${!checked ? t.offPanel : 'bg-white/70 border-slate-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <PowerOff size={15} className={!checked ? 'text-slate-600' : 'text-slate-400'} />
              <p className={`text-xs font-bold uppercase tracking-[0.12em] ${t.offLabel}`}>
                If you leave it OFF
              </p>
            </div>
            <ul className="space-y-2.5 mb-3">
              {offPros.map((item) => (
                <GuestBullet key={item} positive>
                  {item}
                </GuestBullet>
              ))}
            </ul>
            <ul className="space-y-2.5">
              {offCons.map((item) => (
                <GuestBullet key={item} positive={false}>
                  {item}
                </GuestBullet>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-white/80 border border-white px-4 py-3.5 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Sparkles size={16} className={t.icon} />
            Your choice for this property
          </p>
          <div className="inline-flex rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1">
            <button
              type="button"
              id={id}
              aria-pressed={checked}
              onClick={() =>
                onChange({
                  target: { name, type: 'checkbox', checked: true },
                } as ChangeEvent<HTMLInputElement>)
              }
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                checked ? t.toggleOn : 'text-slate-500 hover:bg-white'
              }`}
            >
              <Power size={14} />
              On
            </button>
            <button
              type="button"
              aria-pressed={!checked}
              onClick={() =>
                onChange({
                  target: { name, type: 'checkbox', checked: false },
                } as ChangeEvent<HTMLInputElement>)
              }
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                !checked
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white'
              }`}
            >
              <PowerOff size={14} />
              Off
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function formatSlugPart(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function stepIsComplete(
  stepId: WizardStepId,
  formData: PropertyFormData,
  listingDraft: WizardListingDraft
): boolean {
  switch (stepId) {
    case 'identity':
      return Boolean(
        formData.propertyName.trim() &&
          formData.urlSlug.trim() &&
          formData.internalRefCode.trim() &&
          formData.listingKind
      );
    case 'guest':
      return true;
    case 'listing':
      return isWizardListingComplete(listingDraft);
    default:
      return false;
  }
}

export default function PropertyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { isPlatformAdmin } = useAdminSession();
  const canEditIdentityCodes = isPlatformAdmin;

  const [formData, setFormData] = useState<PropertyFormData>(EMPTY_FORM);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [originalUrlSlug, setOriginalUrlSlug] = useState('');
  const [originalInternalRefCode, setOriginalInternalRefCode] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  /** Blocks the Continue→Create click-through that auto-submits and leaves the wizard. */
  const [allowFinishClick, setAllowFinishClick] = useState(true);
  const [listingDraft, setListingDraft] = useState<WizardListingDraft>(EMPTY_WIZARD_LISTING);
  const [listingPhotoFile, setListingPhotoFile] = useState<File | null>(null);
  const [listingPhotoPreview, setListingPhotoPreview] = useState<string | null>(null);
  const [listingFieldErrors, setListingFieldErrors] = useState<WizardListingFieldErrors>({});
  const [onboardingFiles, setOnboardingFiles] = useState<File[]>([]);
  const [postCreateImport, setPostCreateImport] = useState<{
    propertyId: string;
    listingId: string;
    seedText: string;
    files: File[];
  } | null>(null);
  const [guideFormData, setGuideFormData] = useState<HouseGuideFormData>({});
  const [guideSaving, setGuideSaving] = useState(false);

  const wizardSteps = useMemo(
    () => (isEdit ? BASE_WIZARD_STEPS : [...BASE_WIZARD_STEPS, LISTING_WIZARD_STEP]),
    [isEdit]
  );

  const currentStep = wizardSteps[stepIndex]!;
  const isLastStep = stepIndex === wizardSteps.length - 1;

  const goToStep = (idx: number) => {
    setAllowFinishClick(false);
    setStepIndex(Math.max(0, Math.min(idx, wizardSteps.length - 1)));
    window.setTimeout(() => setAllowFinishClick(true), 400);
  };

  useEffect(() => {
    if (isEdit) return;
    setFormData((prev) => ({
      ...prev,
      listingKind: 'property',
      internalRefCode: generateInternalRefCode(),
    }));
  }, [isEdit]);

  useEffect(() => {
    if (!id) return;

    const loadProperty = async () => {
      try {
        const snap = await getDoc(doc(db, 'properties', id));
        if (!snap.exists()) {
          toast.error('Property not found.');
          navigate(adminPath('/properties'));
          return;
        }
        const data = snap.data();
        const urlSlug = data.urlSlug || '';
        const internalRefCode = data.internalRefCode || '';
        setIsSlugManuallyEdited(true);
        setOriginalUrlSlug(urlSlug);
        setOriginalInternalRefCode(internalRefCode);
        setFormData({
          propertyName: data.propertyName || '',
          urlSlug,
          internalRefCode,
          listingKind: 'property',
          guestPortalAccessRequired: isGuestPortalAccessRequired(data),
          preArrivalCheckInEnabled: isPreArrivalCheckInEnabled(data),
          calendarSyncEnabled: isCalendarSyncEnabled(data),
          reservationSplitEnabled: data.reservationSplitEnabled === true,
        });
      } catch (error) {
        console.error('Error loading property:', error);
        toast.error('Failed to load property.');
        navigate(adminPath('/properties'));
      } finally {
        setLoading(false);
      }
    };

    loadProperty();
  }, [id, navigate]);

  useEffect(() => {
    if (isEdit) return;
    if (isSlugManuallyEdited && canEditIdentityCodes) return;
    const nameSlug = formatSlugPart(formData.propertyName);
    setFormData((prev) => ({ ...prev, urlSlug: nameSlug }));
  }, [formData.propertyName, isSlugManuallyEdited, canEditIdentityCodes, isEdit]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        ...(name === 'calendarSyncEnabled' && !checked
          ? { reservationSplitEnabled: false }
          : {}),
      }));
      return;
    }
    if ((name === 'urlSlug' || name === 'internalRefCode') && !canEditIdentityCodes) return;
    if (name === 'listingKind') return;
    if (name === 'urlSlug') setIsSlugManuallyEdited(true);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateCurrentStep = (): boolean => {
    if (currentStep.id === 'listing') {
      const errors = getWizardListingFieldErrors(listingDraft);
      setListingFieldErrors(errors);
      const firstKey = firstWizardListingErrorKey(errors);
      if (!firstKey) return true;
      const count = Object.keys(errors).length;
      toast.warning(
        count === 1
          ? Object.values(errors)[0]!
          : `${count} required listing fields are missing — see the highlighted fields.`
      );
      window.setTimeout(() => scrollToWizardListingField(firstKey), 50);
      return false;
    }
    if (stepIsComplete(currentStep.id, formData, listingDraft)) return true;
    toast.warning('Please complete the required fields on this step.');
    return false;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;
    const nextIdx = Math.min(stepIndex + 1, wizardSteps.length - 1);
    goToStep(nextIdx);
  };

  const goBack = () => {
    goToStep(Math.max(stepIndex - 1, 0));
  };

  const handleSubmit = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (!isLastStep) {
      goNext();
      return;
    }
    if (!allowFinishClick) return;

    for (const step of wizardSteps) {
      if (!stepIsComplete(step.id, formData, listingDraft)) {
        const idx = wizardSteps.findIndex((s) => s.id === step.id);
        goToStep(idx);
        if (step.id === 'listing') {
          const errors = getWizardListingFieldErrors(listingDraft);
          setListingFieldErrors(errors);
          const firstKey = firstWizardListingErrorKey(errors);
          toast.warning(
            Object.keys(errors).length === 1
              ? Object.values(errors)[0]!
              : `Please complete the ${step.title} step — missing fields are highlighted.`
          );
          if (firstKey) window.setTimeout(() => scrollToWizardListingField(firstKey), 80);
        } else {
          toast.warning(`Please complete the ${step.title} step.`);
        }
        return;
      }
    }
    setListingFieldErrors({});

    setIsSubmitting(true);

    try {
      const identityIndex = await loadPropertyIdentityIndex();
      const desiredSlug = canEditIdentityCodes
        ? formData.urlSlug
        : isEdit
          ? originalUrlSlug
          : formData.urlSlug || formData.propertyName;
      const desiredRef = canEditIdentityCodes
        ? formData.internalRefCode
        : isEdit
          ? originalInternalRefCode
          : formData.internalRefCode;

      const uniqueSlug = ensureUniquePropertySlug(
        desiredSlug,
        identityIndex,
        isEdit ? id : null
      );
      const uniqueRef = ensureUniqueInternalRefCode(
        desiredRef,
        identityIndex,
        isEdit ? id : null
      );
      const newPropertySlug = formatGuestSlug(uniqueSlug.value);

      if (uniqueSlug.changed || uniqueRef.changed) {
        setFormData((prev) => ({
          ...prev,
          urlSlug: uniqueSlug.value,
          internalRefCode: uniqueRef.value,
          listingKind: 'property',
        }));
        const parts: string[] = [];
        if (uniqueSlug.changed) parts.push(`slug → /${uniqueSlug.value}`);
        if (uniqueRef.changed) parts.push(`ref → ${uniqueRef.value}`);
        toast.warning(`Duplicate detected — adjusted automatically (${parts.join(', ')}).`);
      }

      if (isEdit && id) {
        const existingSnap = await getDoc(doc(db, 'properties', id));
        const existing = existingSnap.data();
        const patch: Record<string, unknown> = {
          propertyName: formData.propertyName,
          listingKind: 'property',
          guestPortalAccessRequired: formData.guestPortalAccessRequired,
          preArrivalCheckInEnabled: formData.preArrivalCheckInEnabled,
          calendarSyncEnabled: formData.calendarSyncEnabled,
          reservationSplitEnabled: formData.calendarSyncEnabled
            ? formData.reservationSplitEnabled
            : false,
          updatedAt: new Date().toISOString(),
        };
        if (canEditIdentityCodes) {
          patch.urlSlug = newPropertySlug;
          patch.previousUrlSlugs = mergePreviousSlugs(
            existing?.previousUrlSlugs,
            existing?.urlSlug,
            newPropertySlug
          );
          patch.internalRefCode = uniqueRef.value;
        }
        await updateDoc(doc(db, 'properties', id), patch);
        navigate(adminPath(`/properties/${id}`));
      } else {
        const latNum = listingDraft.latitude ? Number(listingDraft.latitude) : undefined;
        const lngNum = listingDraft.longitude ? Number(listingDraft.longitude) : undefined;
        const ensuredArea = await ensureAreaDocument({
          country: listingDraft.country,
          areaName: listingDraft.city,
          lat: Number.isFinite(latNum) ? latNum : undefined,
          lng: Number.isFinite(lngNum) ? lngNum : undefined,
        });

        const propertyRef = await addDoc(collection(db, 'properties'), {
          propertyName: formData.propertyName,
          urlSlug: newPropertySlug,
          previousUrlSlugs: [],
          internalRefCode: uniqueRef.value,
          listingKind: 'property',
          country: listingDraft.country.trim(),
          area: ensuredArea.areaName,
          city: ensuredArea.areaName,
          guestPortalAccessRequired: formData.guestPortalAccessRequired,
          preArrivalCheckInEnabled: formData.preArrivalCheckInEnabled,
          calendarSyncEnabled: formData.calendarSyncEnabled,
          reservationSplitEnabled: formData.calendarSyncEnabled
            ? formData.reservationSplitEnabled
            : false,
          createdAt: new Date().toISOString(),
        });

        let finalPhotoUrl = listingDraft.photoUrl;
        if (listingPhotoFile) {
          const storage = getStorage();
          const fileRef = ref(
            storage,
            `propertyTypes/${propertyRef.id}/${Date.now()}_${listingPhotoFile.name}`
          );
          await uploadBytes(fileRef, listingPhotoFile);
          finalPhotoUrl = await getDownloadURL(fileRef);
        } else if (finalPhotoUrl) {
          finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
            googlePlaceId: listingDraft.googlePlaceId,
            docId: propertyRef.id,
          });
        }

        const listingSlug =
          formatGuestSlug(listingDraft.urlSlug) ||
          slugFromPropertyTypeName(listingDraft.propertyTypeName);

        const referenceUrls = (listingDraft.referenceUrls || [])
          .map((u) => u.trim())
          .filter(Boolean);
        const primaryListingUrl = referenceUrls[0] || '';

        const listingRef = await addDoc(
          collection(db, 'properties', propertyRef.id, 'propertyTypes'),
          {
            propertyTypeName: listingDraft.propertyTypeName.trim(),
            urlSlug: listingSlug,
            typeSlug: listingSlug,
            previousUrlSlugs: [],
            listingUrl: primaryListingUrl,
            referenceUrls,
            airbnbUrl: '',
            bookingUrl: '',
            googleMapsUrl: listingDraft.googleMapsUrl.trim(),
            iCalUrl: formData.calendarSyncEnabled ? listingDraft.iCalUrl.trim() : '',
            addressLine: listingDraft.addressLine.trim(),
            country: listingDraft.country.trim(),
            city: ensuredArea.areaName,
            area: listingDraft.area.trim(),
            postCode: listingDraft.postCode.trim(),
            latitude: listingDraft.latitude,
            longitude: listingDraft.longitude,
            googlePlaceId: listingDraft.googlePlaceId,
            googleRating: listingDraft.googleRating,
            photoUrl: finalPhotoUrl,
            wifiName: listingDraft.wifiName.trim(),
            wifiPassword: listingDraft.wifiPassword.trim(),
            whatsapp: listingDraft.whatsapp.trim(),
            internalRefCode:
              listingDraft.internalRefCode.trim() ||
              `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            ownerId: '',
            onboardingNotes: listingDraft.onboardingNotes.trim(),
            createdAt: new Date().toISOString(),
          }
        );

        const seedText = buildListingOnboardingSeedText({
          ...listingDraft,
          city: ensuredArea.areaName,
        });

        toast.success('Property and listing saved. AI Import is starting on this page.');
        setGuideFormData({});
        setPostCreateImport({
          propertyId: propertyRef.id,
          listingId: listingRef.id,
          seedText,
          files: onboardingFiles,
        });
        window.setTimeout(() => {
          document.getElementById('wizard-house-guide-import')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 120);
      }
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error('Failed to save property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="admin-page py-16 text-center text-gray-500 text-sm">Loading property…</div>;
  }

  const propertiesPath = adminPath('/properties');
  const stepAccent = WIZARD_STEP_ACCENTS[currentStep.id];
  const progressPct = ((stepIndex + 1) / wizardSteps.length) * 100;

  const handleBackToProperties = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isAdminPathname(propertiesPath)) {
      window.location.assign(propertiesPath);
      return;
    }
    window.location.href = propertiesPath;
  };

  return (
    <div className="admin-page relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 h-72 overflow-hidden rounded-3xl -z-0"
      >
        <div className="absolute -left-16 top-0 h-56 w-56 rounded-full bg-teal-300/30 blur-3xl animate-[pulse_6s_ease-in-out_infinite]" />
        <div className="absolute left-1/3 top-8 h-44 w-44 rounded-full bg-amber-300/25 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        <div className="absolute right-0 top-4 h-52 w-52 rounded-full bg-sky-300/30 blur-3xl animate-[pulse_5s_ease-in-out_infinite]" />
      </div>

      <div className="relative mb-6 sm:mb-8">
        <a
          href={propertiesPath}
          onClick={handleBackToProperties}
          className="admin-back-link"
        >
          <ArrowLeft size={16} />
          Back to Properties
        </a>

        <div className="mt-3 relative overflow-hidden rounded-3xl border border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-amber-50/70 p-5 sm:p-7 shadow-sm shadow-teal-100/40">
          <div
            aria-hidden
            className={`absolute -right-8 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${stepAccent.blob} blur-2xl transition-all duration-500`}
          />
          <div
            aria-hidden
            className="absolute bottom-0 left-1/2 h-24 w-40 -translate-x-1/2 rounded-full bg-sky-200/20 blur-2xl"
          />
          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 mb-2">
                <Sparkles size={13} className="text-amber-500" />
                {isEdit ? 'Property studio' : 'Let’s set up your place'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-vailo-dark font-luxury tracking-tight">
                {isEdit ? 'Edit Property' : 'Add New Property'}
              </h2>
              <p className="text-slate-600 mt-2 text-sm sm:text-base max-w-xl leading-relaxed">
                {isEdit
                  ? `Update details for ${formData.propertyName || 'this property'}`
                  : 'Walk through each step to set up this property for your concierge app'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 border border-teal-100 px-3 py-1.5 text-xs font-bold text-teal-800 shadow-sm">
                <PartyPopper size={14} className="text-amber-500" />
                Step {stepIndex + 1}/{wizardSteps.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isLastStep) {
            goNext();
            return;
          }
          if (!allowFinishClick) return;
          void handleSubmit(e);
        }}
      >
        <AdminCard className="overflow-visible border-teal-100/70 shadow-lg shadow-teal-100/30">
          <div className="border-b border-teal-50 bg-gradient-to-r from-teal-50/80 via-amber-50/40 to-sky-50/70 px-4 sm:px-6 py-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-teal-700/80">
                Your setup path
              </p>
              <p className={`text-xs font-bold truncate ${stepAccent.title}`}>
                {currentStep.title}
              </p>
            </div>
            <div className="h-2.5 rounded-full bg-white/80 border border-white overflow-hidden mb-4 shadow-inner">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${stepAccent.progress} transition-all duration-500 ease-out`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ol
              className={`grid grid-cols-1 gap-2.5 ${
                wizardSteps.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
              }`}
            >
              {wizardSteps.map((step, idx) => {
                const Icon = step.icon;
                const accent = WIZARD_STEP_ACCENTS[step.id];
                const active = idx === stepIndex;
                const done =
                  idx < stepIndex ||
                  (idx !== stepIndex && stepIsComplete(step.id, formData, listingDraft));
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === stepIndex) return;
                        if (idx < stepIndex) {
                          goToStep(idx);
                          return;
                        }
                        if (stepIsComplete(wizardSteps[idx - 1]!.id, formData, listingDraft)) {
                          goToStep(idx);
                        } else {
                          toast.warning('Please complete the previous step first.');
                        }
                      }}
                      className={`w-full text-left rounded-2xl border px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5 ${
                        active
                          ? accent.chipActive
                          : done
                            ? accent.chip
                            : 'border-white/80 bg-white/50 hover:bg-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 ${
                            active
                              ? `${accent.iconActive} scale-105`
                              : done
                                ? accent.iconDone
                                : accent.icon
                          }`}
                        >
                          {done && !active ? <Check size={15} /> : <Icon size={15} />}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-bold truncate ${
                              active ? accent.title : 'text-slate-700'
                            }`}
                          >
                            {idx + 1}. {step.title}
                          </span>
                          <span className="hidden sm:block text-[11px] text-slate-500 truncate">
                            {step.description}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="p-6 sm:p-8 space-y-6 bg-gradient-to-b from-white via-white to-slate-50/40">
            <div className="flex items-start gap-3">
              <span
                className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${stepAccent.iconActive}`}
              >
                {(() => {
                  const Icon = currentStep.icon;
                  return <Icon size={20} />;
                })()}
              </span>
              <div className="min-w-0 pt-0.5">
                <h3 className={`text-lg sm:text-xl font-bold font-luxury ${stepAccent.title}`}>
                  {currentStep.title}
                </h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  {currentStep.description}
                </p>
              </div>
            </div>

            {currentStep.id === 'identity' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="propertyName">
                    Property Name or Business / Agency name *
                  </AdminLabel>
                  <AdminInput
                    id="propertyName"
                    required
                    name="propertyName"
                    value={formData.propertyName}
                    onChange={handleChange}
                    placeholder="Your business or agency name, e.g. Aegean Stays"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter your hospitality business, agency, or brand name — the umbrella guests and
                    your team see across all listings (e.g. Coastal Homes Lisbon, Kyoto Stay Co.).
                  </p>
                </div>
                <div>
                  <AdminLabel htmlFor="listingKind">Type</AdminLabel>
                  <AdminInput
                    id="listingKind"
                    name="listingKind"
                    value="Property"
                    readOnly
                    disabled
                    className="bg-gray-50 text-gray-700"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This is a standard rental property in your portfolio.
                  </p>
                </div>
                <div>
                  <AdminLabel htmlFor="urlSlug">URL slug *</AdminLabel>
                  <AdminInput
                    id="urlSlug"
                    required
                    name="urlSlug"
                    value={formData.urlSlug}
                    onChange={handleChange}
                    readOnly={!canEditIdentityCodes}
                    disabled={!canEditIdentityCodes}
                    placeholder="your-business-or-agency, e.g. aegean-stays"
                    className={`font-mono text-sm ${
                      canEditIdentityCodes ? 'bg-vailo-surface-elevated' : 'bg-gray-50 text-gray-700'
                    }`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Short web address for your business or agency portal — e.g. /aegean-stays,
                    /coastal-homes-lisbon. Created from the name above; contact Vailo if you need it
                    changed.
                  </p>
                </div>
                <div>
                  <AdminLabel htmlFor="internalRefCode">Internal reference code *</AdminLabel>
                  <AdminInput
                    id="internalRefCode"
                    required
                    name="internalRefCode"
                    value={formData.internalRefCode}
                    onChange={handleChange}
                    readOnly={!canEditIdentityCodes}
                    disabled={!canEditIdentityCodes}
                    className={`font-mono text-sm ${
                      canEditIdentityCodes ? 'bg-vailo-surface-elevated' : 'bg-gray-50 text-gray-700'
                    }`}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your private code to find this property quickly in admin. Guests never see it.
                  </p>
                </div>
              </div>
            )}

            {currentStep.id === 'guest' && (
              <div className="space-y-6">
                <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50/90 via-sky-50/50 to-emerald-50/40 px-5 py-5 sm:px-6">
                  <div className="flex items-start gap-3">
                    <span className="h-11 w-11 rounded-2xl bg-white/80 text-teal-700 flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles size={20} strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700 mb-1">
                        Category · Guest experience
                      </p>
                      <h3 className="text-base sm:text-lg font-bold text-slate-800 font-luxury">
                        Pick only what you need
                      </h3>
                      <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-2xl">
                        Three switches. Our motto is{' '}
                        <span className="font-semibold text-slate-800">take it or leave it</span> —
                        turn something on only if you will use it. Each card shows the upside, the
                        trade-off, and how much time it takes to maintain.
                      </p>
                    </div>
                  </div>
                </div>

                <GuestExperienceChoice
                  id="guestPortalAccessRequired"
                  name="guestPortalAccessRequired"
                  stepNumber={1}
                  tone="teal"
                  title="Guest portal access control"
                  icon={KeyRound}
                  summary="Should the portal stay private for real guests, or open to anyone with the link?"
                  maintenance="ON is light once invites or booking dates are flowing. OFF is near zero upkeep."
                  onPros={[
                    'Private house guide, Wi‑Fi, and local tips for real guests only',
                    'Works with invitations, active stays, and visitor codes',
                    'Access window runs automatically around the stay',
                  ]}
                  onCons={[
                    'Guests need a valid invite, stay, or visitor code to get in',
                    'Wrong dates or missing invites can create support messages',
                  ]}
                  offPros={[
                    'Share one public link — simplest possible setup',
                    'No gate to manage day to day',
                  ]}
                  offCons={[
                    'Anyone with the URL can open guest content',
                    'Less “private stay handbook” feeling',
                  ]}
                  checked={formData.guestPortalAccessRequired}
                  onChange={handleChange}
                />

                <GuestExperienceChoice
                  id="preArrivalCheckInEnabled"
                  name="preArrivalCheckInEnabled"
                  stepNumber={2}
                  tone="mint"
                  title="Online check-in"
                  icon={ClipboardCheck}
                  summary="Should guests fill arrival details in the portal before they show up?"
                  maintenance="ON means a quick look at Check-ins before arrival. OFF means zero portal check-in work."
                  onPros={[
                    'Guests arrive prepared — fewer last-minute questions',
                    'Invite copy can point them to Check in in the portal',
                    'Submissions land in one Check-ins list',
                  ]}
                  onCons={[
                    'Someone should review Check-ins before arrival',
                    'Guests may skip it unless you nudge them',
                  ]}
                  offPros={[
                    'No forms to watch in Vailo',
                    'Portal stays a simple guidebook',
                  ]}
                  offCons={[
                    'You gather arrival details by hand',
                    'More back-and-forth the week before arrival',
                  ]}
                  checked={formData.preArrivalCheckInEnabled}
                  onChange={handleChange}
                />

                <GuestExperienceChoice
                  id="calendarSyncEnabled"
                  name="calendarSyncEnabled"
                  stepNumber={3}
                  tone="sky"
                  title="Calendar & reservations"
                  icon={CalendarDays}
                  summary="Should Vailo import bookings from Airbnb, Booking.com, or your channel manager?"
                  maintenance="ON needs iCal URLs per listing and a quick check if a feed breaks. OFF needs no calendar care in Vailo."
                  onPros={[
                    'Stays appear in Reservations and Calendar automatically',
                    'Helps align guest access with real booking dates',
                    'One place to see what is coming this week',
                  ]}
                  onCons={[
                    'Each listing needs a working calendar feed',
                    'A changed channel URL needs a small fix',
                  ]}
                  offPros={[
                    'Nothing to configure or babysit',
                    'Perfect if you never need bookings inside Vailo',
                  ]}
                  offCons={[
                    'Reservations and Calendar stay hidden',
                    'Stay-based tools work less smoothly',
                  ]}
                  checked={formData.calendarSyncEnabled}
                  onChange={handleChange}
                >
                  {formData.calendarSyncEnabled ? (
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                      <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-sky-100 bg-sky-50/50 p-4 hover:bg-sky-50 transition-colors">
                        <input
                          type="checkbox"
                          name="reservationSplitEnabled"
                          checked={formData.reservationSplitEnabled}
                          onChange={handleChange}
                          className="mt-1 rounded border-sky-200 text-sky-600 focus:ring-sky-200"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
                            <Scissors size={15} className="text-sky-600" />
                            Also allow reservation splitting
                          </span>
                          <span className="block text-slate-500 mt-1 leading-relaxed">
                            Optional add-on. Only if a channel sometimes exports overlapping bookings
                            as one block. Take it or leave it — most hosts can leave this off.
                          </span>
                        </span>
                      </label>
                    </div>
                  ) : null}
                </GuestExperienceChoice>
              </div>
            )}

            {currentStep.id === 'listing' ? (
              <PropertyWizardListingStep
                value={listingDraft}
                onChange={setListingDraft}
                photoFile={listingPhotoFile}
                photoPreview={listingPhotoPreview}
                calendarSyncEnabled={formData.calendarSyncEnabled}
                fieldErrors={listingFieldErrors}
                onboardingFiles={onboardingFiles}
                onOnboardingFilesChange={setOnboardingFiles}
                onClearFieldError={(key: WizardListingFieldKey) =>
                  setListingFieldErrors((prev) => {
                    if (!prev[key]) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })
                }
                onPhotoFileChange={(file, previewUrl) => {
                  setListingPhotoFile(file);
                  setListingPhotoPreview(previewUrl);
                  if (!file && !previewUrl) {
                    setListingDraft((prev) => ({ ...prev, photoUrl: '' }));
                  }
                }}
              />
            ) : null}
          </div>

          <div className="px-6 sm:px-8 py-5 bg-gradient-to-r from-teal-50/90 via-amber-50/50 to-sky-50/80 border-t border-teal-100/70 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => navigate(adminPath('/properties'))}
            >
              Cancel
            </AdminButton>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              {stepIndex > 0 ? (
                <AdminButton type="button" variant="secondary" onClick={goBack} disabled={isSubmitting}>
                  <ChevronLeft size={16} /> Back
                </AdminButton>
              ) : null}
              {!isLastStep ? (
                <AdminButton type="button" onClick={goNext}>
                  Continue <ChevronRight size={16} />
                </AdminButton>
              ) : (
                <AdminButton
                  type="button"
                  disabled={
                    isSubmitting || !allowFinishClick || Boolean(postCreateImport)
                  }
                  onClick={() => void handleSubmit()}
                >
                  {isSubmitting
                    ? 'Saving…'
                    : postCreateImport
                      ? 'Created'
                      : isEdit
                        ? 'Save Changes'
                        : 'Create & open House Guide'}
                </AdminButton>
              )}
            </div>
          </div>
        </AdminCard>
      </form>

      {postCreateImport ? (
        <div id="wizard-house-guide-import" className="relative mt-8 space-y-4">
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-teal-50/50 p-5 sm:p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 mb-1 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              House Guide · AI Import
            </p>
            <h3 className="text-xl font-bold text-vailo-dark font-luxury">
              Review what AI found for your guide
            </h3>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
              Your listing is saved. Import starts automatically from your notes, links, and files —
              this can take up to a minute. Watch the live progress below, then review and apply.
            </p>
          </div>

          <HouseGuideImportPanel
            formData={guideFormData}
            contentLocale={DEFAULT_PRIMARY_LOCALE}
            primaryLocale={DEFAULT_PRIMARY_LOCALE}
            initialImportText={postCreateImport.seedText}
            initialFiles={postCreateImport.files}
            fromWizard
            autoAnalyze
            disabled={guideSaving}
            footerActions={{
              onContinueListing: () =>
                navigate(adminPath(`/properties/${postCreateImport.propertyId}/types`)),
              onFinishHouseGuide: () =>
                navigate(
                  adminPath(
                    `/properties/${postCreateImport.propertyId}/house-guide?listing=${encodeURIComponent(postCreateImport.listingId)}`
                  )
                ),
              onFinishProperties: () => navigate(adminPath('/properties')),
            }}
            onApply={async (next) => {
              setGuideSaving(true);
              try {
                const payload = serializeGuideFormDataForSave(next, DEFAULT_PRIMARY_LOCALE);
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
      ) : null}
    </div>
  );
}
