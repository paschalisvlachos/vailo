import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { formatGuestSlug, mergePreviousSlugs } from '../../../lib/guestPortalSlug';
import {
  ensureUniqueInternalRefCode,
  ensureUniquePropertySlug,
  loadPropertyIdentityIndex,
} from '../../../lib/propertyIdentityUniqueness';
import { useToast } from '../../../context/ToastContext';
import {
  User,
  Pencil,
  Phone,
  Mail,
  MapPin,
  X,
  Save,
  Copy,
  Check,
  Building2,
  ShieldCheck,
  ClipboardCheck,
  CalendarDays,
  Languages,
} from 'lucide-react';
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import type { PropertyRecord } from './PropertyLayout';
import type { ListingKind } from './PropertyFormPage';
import PropertyLanguagesCard from '../../../components/admin/PropertyLanguagesCard';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { PROPERTY_ASSIGNMENT_ROLES } from '../../../lib/adminAccess';
import { isGuestPortalAccessRequired } from '../../../lib/guestAccess';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../../lib/icalSync';
import { isPropertyReservationSplitEnabled } from '../../../lib/syncedBooking';
import { buildOpenPortalInviteClipboardText } from '../../../lib/guestInviteEmailTemplate';
import { buildGuestPortalPublicListingUrl } from '../../../lib/guestPortalQrCode';

interface OwnerOption {
  id: string;
  fullName: string;
  role: string;
  company?: string;
  email?: string;
  phone?: string;
}

type FormData = {
  propertyName: string;
  urlSlug: string;
  internalRefCode: string;
  listingKind: ListingKind;
  ownerId: string;
  email: string;
  phone: string;
  guestPortalAccessRequired: boolean;
  calendarSyncEnabled: boolean;
  reservationSplitEnabled: boolean;
  preArrivalCheckInEnabled: boolean;
};

function buildFormFromProperty(property: PropertyRecord): FormData {
  return {
    propertyName: property.propertyName || '',
    urlSlug: property.urlSlug || '',
    internalRefCode: property.internalRefCode || '',
    listingKind: 'property',
    ownerId: property.ownerId || '',
    email: '',
    phone: '',
    guestPortalAccessRequired: isGuestPortalAccessRequired(property),
    calendarSyncEnabled: isCalendarSyncEnabled(property),
    reservationSplitEnabled: property.reservationSplitEnabled === true,
    preArrivalCheckInEnabled: isPreArrivalCheckInEnabled(property),
  };
}

function OverviewCategory({
  category,
  title,
  description,
  icon,
  children,
  className = '',
}: {
  category: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard className={`overflow-hidden ${className}`}>
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-r from-vailo-surface-elevated/80 to-white">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-vailo-teal/10 text-vailo-teal flex items-center justify-center shrink-0">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-vailo-teal mb-1">
              {category}
            </p>
            <h3 className="text-base font-semibold text-vailo-dark leading-tight">
              {title}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </AdminCard>
  );
}

export default function Overview() {
  const { property, propertyId } = useOutletContext<{
    property: PropertyRecord;
    propertyId: string;
  }>();
  const toast = useToast();
  const { isPlatformAdmin } = useAdminSession();
  const { languages: platformLanguages, loading: platformLangsLoading } = usePlatformLanguages();
  const showLanguagesCategory = !platformLangsLoading && platformLanguages.length > 1;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>(() => buildFormFromProperty(property));
  const [ownersList, setOwnersList] = useState<OwnerOption[]>([]);
  const [assignedOwner, setAssignedOwner] = useState<OwnerOption | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string; urlSlug?: string; typeSlug?: string }[]
  >([]);
  const [copiedOpenPortalInvite, setCopiedOpenPortalInvite] = useState(false);
  const [inviteListingId, setInviteListingId] = useState('');
  const prevOwnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isEditing) setFormData(buildFormFromProperty(property));
  }, [property, isEditing]);

  useEffect(() => {
    const q = query(collection(db, 'owners'), where('role', 'in', [...PROPERTY_ASSIGNMENT_ROLES]));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OwnerOption[];
      list.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setOwnersList(list);
    });
  }, []);

  useEffect(() => {
    if (!propertyId) return;
    return onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      setPropertyTypes(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as {
          id: string;
          propertyTypeName?: string;
          urlSlug?: string;
          typeSlug?: string;
        }[]
      );
    });
  }, [propertyId]);

  useEffect(() => {
    if (propertyTypes.length === 0) {
      setInviteListingId('');
      return;
    }
    setInviteListingId((current) =>
      propertyTypes.some((type) => type.id === current) ? current : propertyTypes[0]!.id
    );
  }, [propertyTypes]);

  useEffect(() => {
    const ownerId = isEditing ? formData.ownerId : property.ownerId;
    if (!ownerId) {
      setAssignedOwner(null);
      setLoadingOwner(false);
      return;
    }

    setLoadingOwner(true);
    getDoc(doc(db, 'owners', ownerId))
      .then((snap) => {
        setAssignedOwner(snap.exists() ? ({ id: snap.id, ...snap.data() } as OwnerOption) : null);
      })
      .catch(console.error)
      .finally(() => setLoadingOwner(false));
  }, [property.ownerId, formData.ownerId, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      prevOwnerIdRef.current = null;
      return;
    }
    if (formData.ownerId === prevOwnerIdRef.current) return;
    prevOwnerIdRef.current = formData.ownerId;
    const owner = ownersList.find((o) => o.id === formData.ownerId);
    if (owner) {
      setFormData((prev) => ({
        ...prev,
        email: owner.email || '',
        phone: owner.phone || '',
      }));
    } else if (!formData.ownerId) {
      setFormData((prev) => ({ ...prev, email: '', phone: '' }));
    }
  }, [formData.ownerId, isEditing, ownersList]);

  const handleCopyOpenPortalInvitation = async () => {
    if (propertyTypes.length === 0) {
      toast.warning('Add a property listing before copying the portal invitation.');
      return;
    }
    const type =
      propertyTypes.find((listing) => listing.id === inviteListingId) || propertyTypes[0];
    if (!type) {
      toast.warning('Add a property listing before copying the portal invitation.');
      return;
    }
    const url = buildGuestPortalPublicListingUrl(property, type);
    if (!url) {
      toast.warning('Set property and unit URL slugs before copying the portal invitation.');
      return;
    }
    const unitLabel = type.propertyTypeName?.trim() || 'Your unit';
    const preArrivalCheckInEnabled = isPreArrivalCheckInEnabled(property);
    const text = buildOpenPortalInviteClipboardText({
      propertyName: property.propertyName || 'Your stay',
      unitName: unitLabel,
      portalUrl: url,
      preArrivalCheckInEnabled,
      hostLabel: property.propertyName,
      accessRequired: isGuestPortalAccessRequired(property),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOpenPortalInvite(true);
      setTimeout(() => setCopiedOpenPortalInvite(false), 2500);
      toast.success(
        `Portal invitation for ${unitLabel} copied — paste into email, Airbnb, or chat.`
      );
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleStartEdit = () => {
    const owner =
      ownersList.find((o) => o.id === property.ownerId) || assignedOwner;
    prevOwnerIdRef.current = property.ownerId || null;
    setFormData({
      ...buildFormFromProperty(property),
      email: owner?.email || '',
      phone: owner?.phone || '',
    });
    setIsEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
    if (name === 'listingKind') return;
    if ((name === 'urlSlug' || name === 'internalRefCode') && !isPlatformAdmin) return;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    setFormData(buildFormFromProperty(property));
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!propertyId) return;
    setIsSaving(true);
    try {
      const propertyPatch: Record<string, unknown> = {
        propertyName: formData.propertyName.trim(),
        listingKind: 'property',
        ownerId: formData.ownerId,
        updatedAt: new Date().toISOString(),
      };
      if (isPlatformAdmin) {
        const identityIndex = await loadPropertyIdentityIndex();
        const uniqueSlug = ensureUniquePropertySlug(
          formData.urlSlug,
          identityIndex,
          propertyId
        );
        const uniqueRef = ensureUniqueInternalRefCode(
          formData.internalRefCode,
          identityIndex,
          propertyId
        );
        const newPropertySlug = formatGuestSlug(uniqueSlug.value);

        if (uniqueSlug.changed || uniqueRef.changed) {
          setFormData((prev) => ({
            ...prev,
            urlSlug: uniqueSlug.value,
            internalRefCode: uniqueRef.value,
          }));
          const parts: string[] = [];
          if (uniqueSlug.changed) parts.push(`slug → /${uniqueSlug.value}`);
          if (uniqueRef.changed) parts.push(`ref → ${uniqueRef.value}`);
          toast.warning(`Duplicate detected — adjusted automatically (${parts.join(', ')}).`);
        }

        propertyPatch.urlSlug = newPropertySlug;
        propertyPatch.previousUrlSlugs = mergePreviousSlugs(
          property.previousUrlSlugs,
          property.urlSlug,
          newPropertySlug
        );
        propertyPatch.internalRefCode = uniqueRef.value;
        propertyPatch.guestPortalAccessRequired = formData.guestPortalAccessRequired;
        propertyPatch.calendarSyncEnabled = formData.calendarSyncEnabled;
        propertyPatch.reservationSplitEnabled = formData.calendarSyncEnabled
          ? formData.reservationSplitEnabled
          : false;
        propertyPatch.preArrivalCheckInEnabled = formData.preArrivalCheckInEnabled;
      }
      await updateDoc(doc(db, 'properties', propertyId), propertyPatch);
      if (formData.ownerId) {
        await updateDoc(doc(db, 'owners', formData.ownerId), {
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          updatedAt: new Date().toISOString(),
        });
        setAssignedOwner((prev) =>
          prev && prev.id === formData.ownerId
            ? { ...prev, email: formData.email.trim(), phone: formData.phone.trim() }
            : prev
        );
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded bg-white p-4 sm:p-5 shadow-[1px_1px_15px_rgba(0,0,0,0.1)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-vailo-teal mb-1">
              Overview
            </p>
            <h2 className="text-lg sm:text-xl font-semibold text-vailo-dark">
              {property.propertyName || 'Property'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEditing
                ? 'Edit the categories below, then save.'
                : 'Identity, people, languages, and guest experience settings.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white pl-2 pr-1 py-1 shadow-sm">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
                Open portal invitation for
              </span>
              <AdminSelect
                aria-label="Property listing for portal invitation"
                value={inviteListingId}
                onChange={(e) => setInviteListingId(e.target.value)}
                disabled={propertyTypes.length === 0}
                className="min-w-[8rem] max-w-[12rem] py-1 px-2 text-xs h-8"
              >
                {propertyTypes.length === 0 ? (
                  <option value="">No listings</option>
                ) : (
                  propertyTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.propertyTypeName?.trim() || 'Untitled listing'}
                    </option>
                  ))
                )}
              </AdminSelect>
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => void handleCopyOpenPortalInvitation()}
                disabled={propertyTypes.length === 0}
                title="Copy open portal invitation for the selected listing"
                aria-label="Copy open portal invitation"
                className="!px-2 !py-1.5 h-8 shrink-0"
              >
                {copiedOpenPortalInvite ? <Check size={14} /> : <Copy size={14} />}
              </AdminButton>
            </div>
            {!isEditing ? (
              isPlatformAdmin ? (
                <AdminButton type="button" variant="secondary" onClick={handleStartEdit}>
                  <Pencil size={16} /> Edit overview
                </AdminButton>
              ) : (
                <p className="text-sm text-gray-500">
                  To edit overview, contact Vailo at{' '}
                  <a
                    href="mailto:contact@vailo.app"
                    className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                  >
                    contact@vailo.app
                  </a>
                  .
                </p>
              )
            ) : (
              <>
                <AdminButton type="button" variant="secondary" onClick={handleCancel} disabled={isSaving}>
                  <X size={16} /> Cancel
                </AdminButton>
                <AdminButton type="button" onClick={handleSave} disabled={isSaving}>
                  <Save size={16} /> {isSaving ? 'Saving…' : 'Save changes'}
                </AdminButton>
              </>
            )}
          </div>
        </div>
      </div>

      {showLanguagesCategory ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Languages size={14} className="text-vailo-teal" />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-vailo-teal">
              Category · Languages
            </p>
          </div>
          <PropertyLanguagesCard
            propertyId={propertyId}
            propertyData={property as Record<string, unknown>}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <OverviewCategory
          category="Category · Identity"
          title="General details"
          description="Name, type, reference code, and URL slug. Location is set on each property listing."
          icon={<Building2 size={18} />}
        >
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <AdminLabel htmlFor="propertyName">Property name *</AdminLabel>
                <AdminInput
                  id="propertyName"
                  name="propertyName"
                  required
                  value={formData.propertyName}
                  onChange={handleChange}
                  placeholder="e.g. Villa Paschalis"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The name guests and your team will see in the portal and admin.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <AdminLabel htmlFor="internalRefCode">Reference code *</AdminLabel>
                  {isPlatformAdmin ? (
                    <AdminInput
                      id="internalRefCode"
                      name="internalRefCode"
                      value={formData.internalRefCode}
                      onChange={handleChange}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <p className="font-medium text-vailo-dark font-mono text-sm bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                      {property.internalRefCode || '—'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Your private code to find this property quickly in admin. Guests never see it.
                    {!isPlatformAdmin ? (
                      <>
                        {' '}
                        Need a change? Contact{' '}
                        <a
                          href="mailto:contact@vailo.app"
                          className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                        >
                          contact@vailo.app
                        </a>
                        .
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <div>
                <AdminLabel htmlFor="urlSlug">URL slug *</AdminLabel>
                {isPlatformAdmin ? (
                  <AdminInput
                    id="urlSlug"
                    name="urlSlug"
                    value={formData.urlSlug}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                ) : (
                  <p className="font-medium text-vailo-dark font-mono text-sm bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                    /{property.urlSlug || '—'}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Short web address for your guest portal (for example /villa-paschalis).
                  {!isPlatformAdmin ? (
                    <>
                      {' '}
                      Need a change? Contact{' '}
                      <a
                        href="mailto:contact@vailo.app"
                        className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                      >
                        contact@vailo.app
                      </a>
                      .
                    </>
                  ) : null}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Location</p>
                <p className="font-medium text-vailo-dark inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-vailo-teal/50" />
                  {[property.area || property.city, property.country].filter(Boolean).join(', ') ||
                    'Not set yet'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Country and area come from each property listing (for example Paris on one
                  listing, Athens on another property). Edit them under Property Listings.
                </p>
              </div>
              <p className="text-xs text-gray-400">
                Registered{' '}
                {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : '—'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-gray-500 mb-1">Registration date</p>
                <p className="font-medium text-vailo-dark">
                  {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Type</p>
                <AdminBadge variant="teal">Property</AdminBadge>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Reference code</p>
                <p className="font-medium text-vailo-dark font-mono text-sm">
                  {property.internalRefCode || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">URL slug</p>
                <p className="font-medium text-vailo-dark font-mono text-sm">/{property.urlSlug || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500 mb-1">Location</p>
                <p className="font-medium text-vailo-dark inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-vailo-teal/50" />
                  {[property.area || property.city, property.country].filter(Boolean).join(', ') ||
                    'Not set yet'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Synced from property listings. Add or edit listings to set country and area.
                </p>
              </div>
            </div>
          )}
        </OverviewCategory>

        <OverviewCategory
          category="Category · People"
          title="Property allocation"
          description="Admin-only: assign this property to an agent or owner. Users already see their allocated properties after login."
          icon={<User size={18} />}
        >
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <AdminLabel htmlFor="ownerId">Assigned agent / owner</AdminLabel>
                <AdminSelect id="ownerId" name="ownerId" value={formData.ownerId} onChange={handleChange}>
                  <option value="">Unassigned</option>
                  {ownersList.map((user) => (
                    <option key={user.id} value={user.id}>
                      [{user.role === 'agent' ? 'Agent' : 'Owner'}] {user.fullName}
                      {user.company ? ` (${user.company})` : ''}
                    </option>
                  ))}
                </AdminSelect>
                <p className="text-xs text-gray-500 mt-1">
                  Manually link this property to a user. Agencies with several properties are
                  allocated after login — they do not set this themselves.
                </p>
              </div>
              {formData.ownerId && (
                <>
                  <div>
                    <AdminLabel htmlFor="email">Email</AdminLabel>
                    <AdminInput
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="contact@example.com"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Contact email for the assigned agent or owner.
                    </p>
                  </div>
                  <div>
                    <AdminLabel htmlFor="phone">Telephone</AdminLabel>
                    <AdminInput
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+30 …"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Phone number so your team can reach the assigned person quickly.
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : loadingOwner ? (
            <p className="text-sm text-gray-500 animate-pulse">Loading contact…</p>
          ) : assignedOwner ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-vailo-teal/8 flex items-center justify-center text-vailo-teal font-bold text-lg">
                  {assignedOwner.fullName?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold text-vailo-dark">{assignedOwner.fullName}</p>
                  {assignedOwner.role && <AdminBadge variant="gold">{assignedOwner.role}</AdminBadge>}
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={15} className="text-vailo-teal/50 shrink-0" />
                {assignedOwner.email || '—'}
              </p>
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={15} className="text-vailo-teal/50 shrink-0" />
                {assignedOwner.phone || '—'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No owner assigned to this property.</p>
          )}
        </OverviewCategory>
      </div>

      <div className="space-y-3">
        <div className="px-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-vailo-teal">
            Category · Guest experience
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Portal access, online check-in, and calendar / reservations for this property.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <OverviewCategory
            category="Guest experience"
            title="Guest portal access"
            description="Control whether guests need an invite gate to open the portal."
            icon={<ShieldCheck size={18} />}
          >
            <p className="text-sm text-gray-500 mb-4">
              Access control is on by default for all properties. Only Vailo platform admins can change
              this setting.
            </p>
            {isEditing && isPlatformAdmin ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="guestPortalAccessRequired"
                  checked={formData.guestPortalAccessRequired}
                  onChange={handleChange}
                  className="mt-1 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">Require guest access</span>
                  <span className="block text-gray-500 mt-1">
                    Guests need an invitation (password), an active stay on this unit (NFC/QR during
                    booking dates), or a guest visitor access code. Access runs from activation until two days after
                    checkout.
                  </span>
                </span>
              </label>
            ) : (
              <div className="text-sm text-gray-700 space-y-2">
                {isGuestPortalAccessRequired(property) ? (
                  <AdminBadge variant="teal">Access control enabled</AdminBadge>
                ) : (
                  <AdminBadge variant="neutral">Open portal (no invite gate)</AdminBadge>
                )}
                {isEditing && !isPlatformAdmin ? (
                  <p className="text-xs text-gray-500">
                    This setting is managed by your Vailo administrator.
                  </p>
                ) : null}
              </div>
            )}
          </OverviewCategory>

          <OverviewCategory
            category="Guest experience"
            title="Online check-in"
            description="Let guests complete pre-arrival check-in inside the portal."
            icon={<ClipboardCheck size={18} />}
          >
            <p className="text-sm text-gray-500 mb-4">
              When enabled, guests see a Check in button in the guest portal. Invitation copy tells them
              to tap Check in after opening the portal. Check-ins appear on the Check-ins tab. When
              disabled, guests only receive the standard guest portal link.
            </p>
            {isEditing && isPlatformAdmin ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="preArrivalCheckInEnabled"
                  checked={formData.preArrivalCheckInEnabled}
                  onChange={handleChange}
                  className="mt-1 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">Enable online check-in</span>
                  <span className="block text-gray-500 mt-1">
                    Guests can complete pre-arrival details before arrival. Turn off if you handle
                    check-in another way.
                  </span>
                </span>
              </label>
            ) : (
              <div className="text-sm text-gray-700">
                {isPreArrivalCheckInEnabled(property) ? (
                  <AdminBadge variant="teal">Check-in enabled</AdminBadge>
                ) : (
                  <AdminBadge variant="neutral">Check-in disabled</AdminBadge>
                )}
              </div>
            )}
          </OverviewCategory>

          <OverviewCategory
            category="Guest experience"
            title="Calendar / Reservations"
            description="iCal sync, reservations visibility, and optional split actions."
            icon={<CalendarDays size={18} />}
          >
            <p className="text-sm text-gray-500 mb-4">
              When calendar sync is on, admins can import iCal bookings and use the Reservations and
              Calendar sections. Split is only available after sync is enabled.
            </p>
            {isEditing && isPlatformAdmin ? (
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="calendarSyncEnabled"
                    checked={formData.calendarSyncEnabled}
                    onChange={handleChange}
                    className="mt-1 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                  />
                  <span className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">Enable calendar sync</span>
                    <span className="block text-gray-500 mt-1">
                      Import reservations from Airbnb, Booking.com, or a channel manager. When off,
                      Reservations and Calendar are hidden and listing iCal fields are locked.
                    </span>
                  </span>
                </label>
                {formData.calendarSyncEnabled ? (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="reservationSplitEnabled"
                      checked={formData.reservationSplitEnabled}
                      onChange={handleChange}
                      className="mt-1 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
                    />
                    <span className="text-sm text-gray-700">
                      <span className="font-semibold text-gray-900">Allow reservation splitting</span>
                      <span className="block text-gray-500 mt-1">
                        Shows a Split action on each reservation in the Reservations tab for this
                        property — useful when a channel exports overlapping bookings as one block.
                      </span>
                    </span>
                  </label>
                ) : (
                  <AdminBadge variant="neutral">Splitting disabled</AdminBadge>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-700 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {isCalendarSyncEnabled(property) ? (
                    <AdminBadge variant="teal">Sync enabled</AdminBadge>
                  ) : (
                    <AdminBadge variant="neutral">Sync disabled</AdminBadge>
                  )}
                  {isPropertyReservationSplitEnabled(property) ? (
                    <AdminBadge variant="teal">Splitting enabled</AdminBadge>
                  ) : (
                    <AdminBadge variant="neutral">Splitting disabled</AdminBadge>
                  )}
                </div>
                {isEditing && !isPlatformAdmin ? (
                  <p className="text-xs text-gray-500">
                    This setting is managed by your Vailo administrator.
                  </p>
                ) : null}
              </div>
            )}
          </OverviewCategory>
        </div>
      </div>
    </div>
  );
}
