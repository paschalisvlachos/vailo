import { useMemo, useState, useEffect } from 'react';
import { useOutletContext, Navigate } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import CalendarBookingDetailsModal from '../../../components/admin/CalendarBookingDetailsModal';
import ResetBookingsDateRangeModal from '../../../components/admin/ResetBookingsDateRangeModal';
import SplitReservationModal from '../../../components/admin/SplitReservationModal';
import GuestWhatsAppLink from '../../../components/admin/GuestWhatsAppLink';
import GuestInviteEmailPreviewModal from '../../../components/admin/GuestInviteEmailPreviewModal';
import PreArrivalSubmissionModal from '../../../components/admin/PreArrivalSubmissionModal';
import PreArrivalSettingsCard from '../../../components/admin/PreArrivalSettingsCard';
import { maybeTriggerAutoGuestInvite } from '../../../lib/autoGuestInvite';
import { extractBookingProvider } from '../../../lib/bookingProvider';
import { formatGuestSlug, getTypePublicSlug } from '../../../lib/guestPortalSlug';
import { bookingWhatsAppPhone } from '../../../lib/guestWhatsApp';
import {
  buildGuestInviteClipboardText,
  buildGuestInviteEmailPayloadFromBooking,
  buildGuestInviteWhatsAppMessage,
  buildOpenPortalInviteClipboardText,
  formatGuestStayLabel,
} from '../../../lib/guestInviteEmailTemplate';
import { buildPostStayThankYouWhatsAppMessage } from '../../../lib/postStayThankYouTemplate';
import { buildInvitePortalUrl, getGuestPortalPublicOrigin, isGuestPortalAccessRequired, portalAccessUntilFromEnd } from '../../../lib/guestAccess';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from '../../../lib/whatsappLink';
import { buildGuestPortalPublicListingUrl } from '../../../lib/guestPortalQrCode';
import { sendGuestInviteCallable, prepareGuestInviteCopyCallable } from '../../../lib/guestPortalCallables';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../../lib/icalSync';
import { httpsCallableMessage } from '../../../lib/callableError';
import {
  buildSplitBookingsFromOriginal,
  buildMarkInvitedViaWhatsAppPatch,
  formatBookingDateRange,
  getBookingInvitationStatus,
  getBookingInvitationStatusLabel,
  guestDetailsPatch,
  isBookingCheckoutReached,
  isBookingGuestDetailsComplete,
  isPostStayThankYouEligible,
  isPropertyReservationSplitEnabled,
  isSplitBookingPart,
  patchSyncedBookingList,
  patchSyncedBookingListRevokeAccess,
  replaceBookingWithSplits,
  type SplitBookingPart,
  type SyncedBooking,
} from '../../../lib/syncedBooking';
import { resetPropertyBookingsInDateRange } from '../../../lib/resetPropertyBookings';
import { usePropertyListingQuery } from '../../../hooks/usePropertyListingQuery';
import {
  Calendar as CalendarIcon,
  Plus,
  Mail,
  Copy,
  Check,
  ArrowLeft,
  Building,
  Trash2,
  Loader2,
  AlertCircle,
  Pencil,
  Undo2,
  RefreshCw,
  Eye,
  Eraser,
  Scissors,
  ClipboardCheck,
} from 'lucide-react';

type ReservationRow = SyncedBooking & { typeId: string; typeName: string };

export default function Reservations() {
  const { property, propertyId } = useOutletContext<{
    property: {
      propertyName?: string;
      urlSlug?: string;
      guestPortalAccessRequired?: boolean;
      reservationSplitEnabled?: boolean;
      calendarSyncEnabled?: boolean;
      preArrivalCheckInEnabled?: boolean;
      preArrivalTransferOffer?: import('../../../lib/preArrivalSettings').PreArrivalTransferOffer;
      autoSendGuestInviteWhenReady?: boolean;
    };
    propertyId: string;
  }>();
  const toast = useToast();
  const { languages } = usePlatformLanguages();
  const preArrivalCheckInEnabled = isPreArrivalCheckInEnabled(property);
  const calendarSyncEnabled = isCalendarSyncEnabled(property);

  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const propertyTypeIds = useMemo(() => propertyTypes.map((type) => type.id as string), [propertyTypes]);
  const { listingId: filterTypeId, setListingId: setFilterTypeId } = usePropertyListingQuery({
    allowAll: true,
    validTypeIds: propertyTypeIds,
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailsBooking, setDetailsBooking] = useState<ReservationRow | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [inviteCredentials, setInviteCredentials] = useState<{
    guestName: string;
    stayLabel: string;
    inviteUrl: string;
    password: string;
  } | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [emailPreviewBooking, setEmailPreviewBooking] = useState<ReservationRow | null>(null);
  const [preArrivalViewBooking, setPreArrivalViewBooking] = useState<ReservationRow | null>(null);
  const [invitePreviewSecrets, setInvitePreviewSecrets] = useState<
    Record<string, { password: string; token: string }>
  >({});
  const [copyingInviteId, setCopyingInviteId] = useState<string | null>(null);
  const [openingWhatsAppInviteId, setOpeningWhatsAppInviteId] = useState<string | null>(null);
  const [markingWhatsAppInviteId, setMarkingWhatsAppInviteId] = useState<string | null>(null);
  const [resetRangeOpen, setResetRangeOpen] = useState(false);
  const [splitBooking, setSplitBooking] = useState<ReservationRow | null>(null);
  const [copiedOpenPortalInvite, setCopiedOpenPortalInvite] = useState(false);

  const reservationSplitEnabled = isPropertyReservationSplitEnabled(property);

  const initialFormState = {
    typeId: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    guestLocale: '',
    start: '',
    end: '',
  };
  const [formData, setFormData] = useState(initialFormState);

  // 1. Fetch Property Types & Bookings
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
    });
    return () => unsubscribe();
  }, [propertyId]);

  // 2. Aggregate Bookings for the List View
  const allBookings = propertyTypes.flatMap(pt => 
    (pt.syncedBookings || []).map((b: any) => ({
      ...b,
      typeId: pt.id,
      typeName: pt.propertyTypeName
    }))
  ).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));

  const displayedBookings = filterTypeId === 'all' 
    ? allBookings 
    : allBookings.filter(b => b.typeId === filterTypeId);

  const resetScopeLabel =
    filterTypeId === 'all'
      ? 'all units'
      : propertyTypes.find((t) => t.id === filterTypeId)?.propertyTypeName || 'this unit';

  const resetScopeBookings: SyncedBooking[] =
    filterTypeId === 'all'
      ? propertyTypes.flatMap((pt) => pt.syncedBookings || [])
      : propertyTypes.find((t) => t.id === filterTypeId)?.syncedBookings || [];

  const resetScopeTypeIds =
    filterTypeId === 'all' ? propertyTypes.map((t) => t.id) : [filterTypeId];

  const handleResetDateRange = async (rangeStart: string, rangeEnd: string) => {
    try {
      const removed = await resetPropertyBookingsInDateRange(
        propertyId,
        propertyTypes,
        resetScopeTypeIds,
        rangeStart,
        rangeEnd
      );
      toast.success(
        removed === 1
          ? 'Removed 1 reservation.'
          : `Removed ${removed} reservations.`
      );
    } catch (error) {
      console.error('Reset bookings error:', error);
      toast.error('Failed to clear reservations for that date range.');
      throw error;
    }
  };

  const handleCopyOpenPortalInvitation = async () => {
    const type =
      filterTypeId === 'all'
        ? propertyTypes[0]
        : propertyTypes.find((t) => t.id === filterTypeId);
    if (!type) {
      toast.warning('Add a property listing before copying the portal invitation.');
      return;
    }
    const url = buildGuestPortalPublicListingUrl(property, type);
    if (!url) {
      toast.warning('Set property and unit URL slugs before copying the portal invitation.');
      return;
    }
    const text = buildOpenPortalInviteClipboardText({
      propertyName: property.propertyName || 'Your stay',
      unitName: type.propertyTypeName || 'Your unit',
      portalUrl: url,
      preArrivalCheckInEnabled,
      hostLabel: property.propertyName,
      accessRequired: isGuestPortalAccessRequired(property),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOpenPortalInvite(true);
      setTimeout(() => setCopiedOpenPortalInvite(false), 2500);
      toast.success('Portal invitation copied — paste into email, Airbnb, or chat.');
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // --- ACTIONS ---

  const submitManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !formData.typeId) {
      toast.warning("Please select a unit.");
      return;
    }
    
    // Normalize new dates for mathematical comparison
    const newStart = new Date(formData.start);
    const newEnd = new Date(formData.end);
    newStart.setHours(0, 0, 0, 0);
    newEnd.setHours(0, 0, 0, 0);

    if (newEnd <= newStart) {
      toast.warning("Check-out must be after check-in.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const targetType = propertyTypes.find(t => t.id === formData.typeId);
      const existingBookings = targetType.syncedBookings || [];

      // --- DOUBLE BOOKING PREVENTION ENGINE ---
      const hasConflict = existingBookings.some((booking: any) => {
        if (!booking.start || !booking.end) return false;
        
        const bStart = new Date(booking.start);
        const bEnd = new Date(booking.end);
        bStart.setHours(0, 0, 0, 0);
        bEnd.setHours(0, 0, 0, 0);

        // A date overlap occurs if the new check-in is BEFORE the existing check-out
        // AND the new check-out is AFTER the existing check-in.
        return newStart < bEnd && newEnd > bStart;
      });

      if (hasConflict) {
        toast.warning("DOUBLE BOOKING DETECTED: These dates overlap with an existing reservation in this unit. Please choose different dates or a different unit.");
        setIsSubmitting(false);
        return; // Immediately stop execution
      }
      // --- END ENGINE ---

      if (!formData.guestLocale) {
        toast.warning('Please select a default language.');
        setIsSubmitting(false);
        return;
      }

      const newBooking = {
        id: `MANUAL-${Math.random().toString(36).substr(2, 9)}`,
        start: formData.start,
        end: formData.end,
        summary: formData.guestName,
        provider: 'Direct Booking',
        guestName: formData.guestName,
        guestEmail: formData.guestEmail.trim(),
        guestPhone: formData.guestPhone || '',
        guestWhatsapp: formData.guestPhone || '',
        guestLocale: formData.guestLocale,
        guestDetailsComplete: true,
        isInvited: false,
      };

      const updatedBookings = [...existingBookings, newBooking];
      
      await setDoc(doc(db, 'properties', propertyId, 'propertyTypes', formData.typeId), {
        syncedBookings: updatedBookings
      }, { merge: true });

      setIsFormOpen(false);
      setFormData(initialFormState);
    } catch (error) {
      toast.error("Failed to add reservation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveBookingDetails = async (
    target: ReservationRow,
    payload: {
      guestName: string;
      guestEmail: string;
      guestWhatsapp: string;
      guestLocale: string;
    }
  ) => {
    if (!payload.guestName || !payload.guestLocale) {
      toast.warning('Name and language are required.');
      return;
    }

    const targetType = propertyTypes.find((t) => t.id === target.typeId);
    if (!targetType?.syncedBookings) return;

    setSavingDetails(true);
    const updatedBookings = patchSyncedBookingList(
      targetType.syncedBookings,
      target,
      guestDetailsPatch(payload)
    );

    try {
      await setDoc(
        doc(db, 'properties', propertyId, 'propertyTypes', target.typeId),
        { syncedBookings: updatedBookings },
        { merge: true }
      );
      const autoInvite = await maybeTriggerAutoGuestInvite({
        property,
        propertyId,
        typeId: target.typeId,
        bookingId: target.id,
      });
      toast.success(
        autoInvite.sent
          ? 'Guest details saved and invitation email sent automatically.'
          : 'Guest details saved. They appear under House Guests.'
      );
      setDetailsBooking(null);
    } catch (error) {
      console.error('Error saving guest details', error);
      toast.error('Failed to save guest details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const sendInvite = async (booking: ReservationRow, options?: { reinvite?: boolean }) => {
    if (!isBookingGuestDetailsComplete(booking)) {
      toast.warning('Add guest details before sending an invite.');
      return;
    }
    if (!booking.id) {
      toast.warning('This booking has no id; save guest details first.');
      return;
    }

    const guestLabel = booking.guestName || booking.summary || 'guest';
    const stayLabel = formatGuestStayLabel(
      property.propertyName || 'Your property',
      booking.typeName
    );

    setSendingInvite(true);
    try {
      const result =
        await sendGuestInviteCallable(
          propertyId,
          booking.typeId,
          booking.id,
          options?.reinvite
        );
      const { inviteToken, invitePassword, inviteUrl: emailedInviteUrl } = result;
      const type = propertyTypes.find((t) => t.id === booking.typeId);
      const propSlug = formatGuestSlug(property.urlSlug);
      const unitSlug = type ? getTypePublicSlug(type) : '';
      const inviteUrl =
        emailedInviteUrl ||
        (propSlug && unitSlug
          ? buildInvitePortalUrl(
              getGuestPortalPublicOrigin(),
              propSlug,
              unitSlug,
              inviteToken,
              booking.typeId,
              booking.guestLocale
            )
          : '');
      setInviteCredentials({
        guestName: guestLabel,
        stayLabel,
        inviteUrl,
        password: invitePassword,
      });
      if (booking.id) {
        setInvitePreviewSecrets((prev) => ({
          ...prev,
          [booking.id!]: { password: invitePassword, token: inviteToken },
        }));
      }
      toast.success(
        result.emailSent === false
          ? `Invitation saved for ${stayLabel}, but the email could not be confirmed. Copy the link manually if needed.`
          : options?.reinvite
            ? `Re-invite sent for ${stayLabel} to ${booking.guestEmail?.trim() || guestLabel}.`
            : `Invitation sent for ${stayLabel} to ${booking.guestEmail?.trim() || guestLabel}.`
      );
    } catch (err) {
      toast.error(httpsCallableMessage(err, 'Failed to send invite.'));
    } finally {
      setSendingInvite(false);
    }
  };

  const handleUninvite = async (booking: ReservationRow) => {
    if (
      !window.confirm(
        'Unsend this invitation? The guest will lose guest portal access until you send a new invite.'
      )
    ) {
      return;
    }

    const targetType = propertyTypes.find((t) => t.id === booking.typeId);
    if (!targetType) return;

    const updatedBookings = patchSyncedBookingListRevokeAccess(
      targetType.syncedBookings,
      booking
    );

    await setDoc(
      doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId),
      { syncedBookings: updatedBookings },
      { merge: true }
    );
    toast.success('Invitation withdrawn and guest portal access revoked.');
  };

  const handleMarkInviteSentViaWhatsApp = async (booking: ReservationRow) => {
    if (!booking.id) {
      toast.warning('Save guest details first so this reservation has an id.');
      return;
    }
    if (!isBookingGuestDetailsComplete(booking)) {
      toast.warning('Add guest details before marking the invitation as sent.');
      return;
    }
    if (
      !window.confirm(
        'Mark this guest as invited via WhatsApp? Portal access credentials will stay active — use the same link and password you already shared.'
      )
    ) {
      return;
    }

    setMarkingWhatsAppInviteId(booking.id);
    try {
      const targetType = propertyTypes.find((t) => t.id === booking.typeId);
      if (!targetType?.syncedBookings) {
        toast.error('Unit not found.');
        return;
      }

      const current =
        targetType.syncedBookings.find((b: SyncedBooking) => b.id === booking.id) || booking;
      const accessUntil =
        current.portalAccessUntil || portalAccessUntilFromEnd(current.end || booking.end);
      if (!accessUntil) {
        toast.warning('Invalid stay dates on this reservation.');
        return;
      }

      const updatedBookings = patchSyncedBookingList(
        targetType.syncedBookings,
        current,
        buildMarkInvitedViaWhatsAppPatch(current, accessUntil)
      );

      await setDoc(
        doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId),
        { syncedBookings: updatedBookings },
        { merge: true }
      );

      toast.success(
        booking.isInvited
          ? 'Invitation channel updated to WhatsApp.'
          : 'Marked as invited via WhatsApp.'
      );
    } catch (err) {
      toast.error(httpsCallableMessage(err, 'Could not mark invitation as sent.'));
    } finally {
      setMarkingWhatsAppInviteId(null);
    }
  };

  const buildInvitePayloadForBooking = (
    booking: ReservationRow,
    options?: {
      reinvite?: boolean;
      secrets?: { password: string; token: string };
    }
  ) => {
    const type = propertyTypes.find((t) => t.id === booking.typeId);
    const secrets =
      options?.secrets ?? (booking.id ? invitePreviewSecrets[booking.id] : undefined);
    return buildGuestInviteEmailPayloadFromBooking({
      booking,
      propertyName: property.propertyName || 'Your property',
      unitName: booking.typeName,
      propertySlug: property.urlSlug,
      unitType: type,
      typeId: booking.typeId,
      origin: getGuestPortalPublicOrigin(),
      reinvite: options?.reinvite ?? false,
      accessPassword: secrets?.password,
      inviteToken: secrets?.token || booking.inviteToken,
      logoUrl: `${window.location.origin}/vailoLogo.png`,
      preArrivalCheckInEnabled,
    });
  };

  const resolveInviteSecretsForBooking = async (
    booking: ReservationRow,
    options?: { alwaysPreparePassword?: boolean }
  ): Promise<{ password: string; token: string } | undefined> => {
    if (!booking.id) return undefined;

    let secrets = invitePreviewSecrets[booking.id];
    const skipPrepareForSentInvite =
      !options?.alwaysPreparePassword && booking.isInvited && booking.inviteToken;
    if (!secrets?.password && !skipPrepareForSentInvite) {
      const prepared = await prepareGuestInviteCopyCallable(
        propertyId,
        booking.typeId,
        booking.id
      );
      secrets = { password: prepared.invitePassword, token: prepared.inviteToken };
      setInvitePreviewSecrets((prev) => ({
        ...prev,
        [booking.id!]: secrets!,
      }));
    }

    return secrets;
  };

  const handleCopyInvitation = async (booking: ReservationRow) => {
    if (!isBookingGuestDetailsComplete(booking)) {
      toast.warning('Add guest details before copying an invitation.');
      return;
    }

    if (!booking.id) {
      toast.warning('Save guest details first so this reservation has an id.');
      return;
    }

    const type = propertyTypes.find((t) => t.id === booking.typeId);
    const propSlug = formatGuestSlug(property.urlSlug);
    const unitSlug = type ? getTypePublicSlug(type) : '';
    if (!propSlug || !unitSlug) {
      toast.warning('Set property and unit URL slugs before copying an invitation.');
      return;
    }

    const copyKey = booking.id || `${booking.start}-${booking.end}`;

    setCopyingInviteId(copyKey);
    try {
      const secrets = await resolveInviteSecretsForBooking(booking, {
        alwaysPreparePassword: true,
      });
      if (!secrets?.password) {
        toast.error('Could not prepare invite credentials for this reservation.');
        return;
      }

      const payload = buildInvitePayloadForBooking(booking, { secrets });
      const text = buildGuestInviteClipboardText(payload);

      await navigator.clipboard.writeText(text);
      setCopiedId(copyKey);
      setTimeout(() => setCopiedId(null), 2500);
      toast.success('Invitation copied — paste it into email, Airbnb, or chat.');
    } catch (err) {
      toast.error(httpsCallableMessage(err, 'Could not prepare invitation to copy.'));
    } finally {
      setCopyingInviteId(null);
    }
  };

  const bookingProviderLabel = (booking: ReservationRow) => {
    const type = propertyTypes.find((t) => t.id === booking.typeId);
    return (
      booking.provider ||
      extractBookingProvider(booking.summary || '', type?.iCalUrl || '')
    );
  };

  const buildWhatsAppInviteMessage = (
    booking: ReservationRow,
    secrets?: { password: string; token: string }
  ) => {
    const payload = buildInvitePayloadForBooking(booking, { reinvite: false, secrets });
    return buildGuestInviteWhatsAppMessage(payload);
  };

  const handleOpenWhatsAppInvite = async (booking: ReservationRow) => {
    if (!isBookingGuestDetailsComplete(booking)) {
      toast.warning('Add guest details before sending an invitation.');
      return;
    }
    if (!booking.id) {
      toast.warning('Save guest details first so this reservation has an id.');
      return;
    }

    const phone = bookingWhatsAppPhone(booking);
    const digits = phone ? normalizeWhatsAppPhone(phone) : null;
    if (!digits) {
      toast.warning('Add a valid guest phone number for WhatsApp.');
      return;
    }

    const type = propertyTypes.find((t) => t.id === booking.typeId);
    const propSlug = formatGuestSlug(property.urlSlug);
    const unitSlug = type ? getTypePublicSlug(type) : '';
    if (!propSlug || !unitSlug) {
      toast.warning('Set property and unit URL slugs before sending a WhatsApp invitation.');
      return;
    }

    setOpeningWhatsAppInviteId(booking.id);
    try {
      const secrets = await resolveInviteSecretsForBooking(booking, {
        alwaysPreparePassword: true,
      });
      if (!secrets?.password) {
        toast.error('Could not prepare invite credentials for this reservation.');
        return;
      }
      const message = buildWhatsAppInviteMessage(booking, secrets);
      const url = buildWhatsAppUrl(digits, message);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(httpsCallableMessage(err, 'Could not prepare WhatsApp invitation.'));
    } finally {
      setOpeningWhatsAppInviteId(null);
    }
  };

  const buildThankYouWhatsAppMessage = (booking: ReservationRow) =>
    buildPostStayThankYouWhatsAppMessage({
      guestName: booking.guestName || booking.summary || 'Guest',
      propertyName: property.propertyName || 'Your property',
      unitName: booking.typeName,
      stayRangeLabel: formatBookingDateRange(booking.start, booking.end),
      hostLabel: property.propertyName || 'Your host',
    });

  const handleSplitConfirm = async (booking: ReservationRow, parts: SplitBookingPart[]) => {
    const targetType = propertyTypes.find((t) => t.id === booking.typeId);
    if (!targetType) {
      toast.error('Unit not found.');
      return;
    }

    const splitParts = buildSplitBookingsFromOriginal(booking, parts);
    const updatedBookings = replaceBookingWithSplits(
      targetType.syncedBookings || [],
      booking,
      splitParts
    );

    await setDoc(
      doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId),
      { syncedBookings: updatedBookings },
      { merge: true }
    );
    toast.success(`Split into ${splitParts.length} reservations.`);
  };

  const handleDelete = async (booking: any) => {
    if (
      !window.confirm(
        'Delete this reservation? It will be removed from the calendar and any guest portal access for this stay will be blocked immediately.'
      )
    )
      return;
    
    const targetType = propertyTypes.find(t => t.id === booking.typeId);
    const updatedBookings = targetType.syncedBookings.filter((b: any) => b.id !== booking.id);
    
    await setDoc(doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId), {
      syncedBookings: updatedBookings
    }, { merge: true });
  };

  // --- RENDERS ---

  if (!calendarSyncEnabled) {
    return <Navigate to=".." replace />;
  }

  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Listings Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">Create a unit first to manage reservations.</p>
      </div>
    );
  }

  if (isFormOpen) {
    return (
      <div className="w-full">
        <div className="flex items-center mb-6">
          <button onClick={() => setIsFormOpen(false)} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-xl font-bold text-gray-900">Add Manual Reservation</h3>
        </div>

        <form onSubmit={submitManualBooking} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          
          {/* Unit Selector */}
          <div className="p-6 border-b border-gray-100 bg-gray-50">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Select Unit *</label>
            <select required name="typeId" value={formData.typeId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white">
              <option value="">Select a property listing...</option>
              {propertyTypes.map(type => (
                <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
              ))}
            </select>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Full Name *</label>
                <input type="text" required name="guestName" value={formData.guestName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" placeholder="John Doe" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Guest Email <span className="text-gray-400 font-normal">(Optional — needed to email an invite)</span>
                </label>
                <input type="email" name="guestEmail" value={formData.guestEmail} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" placeholder="john@example.com" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Phone <span className="text-gray-400 font-normal">(Optional, for WhatsApp)</span></label>
                <input type="tel" name="guestPhone" value={formData.guestPhone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" placeholder="+1 234 567 8900" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default language *</label>
                <select
                  required
                  name="guestLocale"
                  value={formData.guestLocale}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal bg-white"
                >
                  <option value="">Select language…</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.shortName}>
                      {lang.title} ({lang.shortName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date *</label>
                <input type="date" required name="start" value={formData.start} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date *</label>
                <input type="date" required name="end" value={formData.end} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" />
              </div>
            </div>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center text-xs text-gray-500">
              <AlertCircle size={14} className="mr-1" />
              Dates are automatically verified against calendar conflicts.
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-lg disabled:opacity-50 transition-colors shadow-sm">
                {isSubmitting && <Loader2 size={16} className="mr-2 animate-spin" />}
                {isSubmitting ? 'Verifying...' : 'Add Reservation'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {preArrivalCheckInEnabled && (
        <PreArrivalSettingsCard propertyId={propertyId} property={property} />
      )}

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-vailo-teal/5 text-vailo-teal rounded-xl flex items-center justify-center">
            <CalendarIcon size={20} />
          </div>
          <select 
            value={filterTypeId} 
            onChange={(e) => setFilterTypeId(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal shadow-sm min-w-[200px]"
          >
            <option value="all">All Units (Master View)</option>
            {propertyTypes.map(type => (
              <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setResetRangeOpen(true)}
            className="flex items-center px-4 py-2 bg-white border border-red-200 text-red-700 rounded-xl hover:bg-red-50 transition-colors shadow-sm text-sm font-medium"
          >
            <Eraser size={18} className="mr-2" /> Clear date range
          </button>
          <button
            type="button"
            onClick={() => void handleCopyOpenPortalInvitation()}
            title="Copy a general guest portal invitation to paste anywhere"
            className="flex items-center px-4 py-2 bg-white border border-vailo-teal/30 text-vailo-teal rounded-xl hover:bg-vailo-teal/5 transition-colors shadow-sm text-sm font-medium"
          >
            {copiedOpenPortalInvite ? (
              <Check size={18} className="mr-2" />
            ) : (
              <Copy size={18} className="mr-2" />
            )}
            Copy open portal invitation
          </button>
          <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm text-sm font-medium">
            <Plus size={18} className="mr-2" /> Add Manual Booking
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      {displayedBookings.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <CalendarIcon size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-900 font-medium">No reservations found.</p>
          <p className="text-gray-500 text-sm mt-1">Sync your iCal or add manual bookings to see them here.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Guest Info</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Dates</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Invite email
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedBookings.map((booking: ReservationRow) => {
                  const checkIn = booking.start
                    ? new Date(booking.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—';
                  const checkOut = booking.end
                    ? new Date(booking.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—';
                  const isManual = booking.provider === 'Direct Booking';
                  const status = getBookingInvitationStatus(booking);
                  const detailsComplete = isBookingGuestDetailsComplete(booking);
                  const copyKey = booking.id || `${booking.start}-${booking.end}`;
                  const whatsappPhone = detailsComplete ? bookingWhatsAppPhone(booking) : null;
                  const inviteClosed = isBookingCheckoutReached(booking);
                  const inviteClosedTitle =
                    'Checkout date has passed — invitation actions are no longer available';

                  return (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      {/* Guest Info */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{booking.guestName || booking.summary}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {booking.guestEmail ? booking.guestEmail : <span className="italic">OTA Guest Email Hidden</span>}
                        </div>
                        {(booking.guestWhatsapp || booking.guestPhone) && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {booking.guestWhatsapp || booking.guestPhone}
                          </div>
                        )}
                        {booking.guestLocale && (
                          <div className="text-xs text-gray-400 uppercase">{booking.guestLocale}</div>
                        )}
                      </td>
                      
                      {/* Unit */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {booking.typeName}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{checkIn} &rarr; {checkOut}</div>
                        <div className="text-xs text-gray-500 mt-1">{booking.provider}</div>
                        {isSplitBookingPart(booking) && (
                          <div className="text-[10px] font-bold text-vailo-teal mt-1 uppercase tracking-wide">
                            Split part {booking.splitPartIndex}
                          </div>
                        )}
                        {booking.postStayThankYouSentAt && (
                          <div className="text-[10px] font-bold text-emerald-700 mt-1 uppercase tracking-wide">
                            Thank-you email sent
                          </div>
                        )}
                        {preArrivalCheckInEnabled && booking.preArrivalComplete && (
                          <div className="text-[10px] font-bold text-[#0B4F5C] mt-1 uppercase tracking-wide">
                            Pre-arrival submitted
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {status === 'invited' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            {getBookingInvitationStatusLabel(booking)}
                          </span>
                        ) : status === 'ready_for_reservations' ? (
                          <span className="inline-flex max-w-[200px] mx-auto px-2.5 py-1 rounded-full text-[10px] font-bold leading-tight bg-emerald-50 text-emerald-800">
                            Ready for invitation
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDetailsBooking(booking)}
                            className="inline-flex max-w-[200px] mx-auto px-2.5 py-1 rounded-full text-[10px] font-bold leading-tight bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Add guest details"
                          >
                            Needs guest details
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        {detailsComplete ? (
                          <button
                            type="button"
                            onClick={() => setEmailPreviewBooking(booking)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-vailo-teal hover:bg-vailo-teal/5 hover:border-vailo-teal/20 transition-colors"
                            title="Preview invitation email with this guest's details"
                          >
                            <Eye size={14} />
                            Preview
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex flex-wrap items-center justify-end gap-2 max-w-[420px] ml-auto">
                          {reservationSplitEnabled && !isSplitBookingPart(booking) && (
                            <button
                              type="button"
                              onClick={() => setSplitBooking(booking)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                              title="Split this reservation into separate stays with their own dates"
                            >
                              <Scissors size={14} />
                              Split
                            </button>
                          )}

                          {detailsComplete && (
                            <button
                              type="button"
                              onClick={() => setDetailsBooking(booking)}
                              className="p-1.5 text-gray-400 hover:text-vailo-teal transition-colors"
                              title="Edit guest details"
                            >
                              <Pencil size={18} />
                            </button>
                          )}

                          {preArrivalCheckInEnabled &&
                            booking.preArrivalComplete &&
                            booking.preArrivalSubmission && (
                            <button
                              type="button"
                              onClick={() => setPreArrivalViewBooking(booking)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0B4F5C]/20 bg-white text-xs font-bold text-[#0B4F5C] hover:bg-[#0B4F5C]/5 transition-colors"
                              title="View pre-arrival check-in details and export declaration PDF"
                            >
                              <ClipboardCheck size={14} />
                              View pre-arrival
                            </button>
                          )}

                          {detailsComplete && (
                            <button
                              type="button"
                              onClick={() => void handleCopyInvitation(booking)}
                              disabled={inviteClosed || copyingInviteId === copyKey}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-vailo-teal hover:bg-vailo-teal/5 hover:border-vailo-teal/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-white"
                              title={
                                inviteClosed
                                  ? inviteClosedTitle
                                  : 'Copy full invitation text for email, Airbnb, or chat'
                              }
                            >
                              {copyingInviteId === copyKey ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : copiedId === copyKey ? (
                                <Check size={14} className="text-green-600" />
                              ) : (
                                <Copy size={14} />
                              )}
                              {copyingInviteId === copyKey
                                ? 'Copying…'
                                : copiedId === copyKey
                                  ? 'Copied'
                                  : 'Copy invitation'}
                            </button>
                          )}

                          {booking.isInvited ? (
                            <>
                              <span
                                className={`flex items-center px-3 py-1.5 rounded-lg border text-xs font-bold ${
                                  inviteClosed
                                    ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60'
                                    : 'border-gray-200 bg-white text-gray-400'
                                }`}
                                title={
                                  inviteClosed
                                    ? inviteClosedTitle
                                    : booking.lastInviteChannel === 'whatsapp'
                                      ? 'Invitation sent via WhatsApp'
                                      : booking.lastInviteChannel === 'email'
                                        ? 'Invitation sent via email'
                                        : 'Invitation was sent'
                                }
                              >
                                <Mail size={14} className="mr-1.5" />
                                {booking.lastInviteChannel === 'whatsapp'
                                  ? 'Sent · WhatsApp'
                                  : booking.lastInviteChannel === 'email'
                                    ? 'Sent · Email'
                                    : 'Sent'}
                              </span>
                              <button
                                type="button"
                                onClick={() => void sendInvite(booking, { reinvite: true })}
                                disabled={
                                  inviteClosed ||
                                  sendingInvite ||
                                  !booking.guestEmail?.trim()?.includes('@')
                                }
                                className="flex items-center px-3 py-1.5 rounded-lg border border-vailo-teal/15 bg-white text-xs font-bold text-vailo-teal hover:bg-vailo-teal/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-white"
                                title={
                                  inviteClosed
                                    ? inviteClosedTitle
                                    : !booking.guestEmail?.trim()?.includes('@')
                                      ? 'Add guest email to re-send by email'
                                      : 'Send invitation again by email'
                                }
                              >
                                <RefreshCw size={14} className="mr-1.5" />
                                Re-invite
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleUninvite(booking)}
                                disabled={inviteClosed}
                                className="flex items-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200 disabled:hover:bg-white"
                                title={
                                  inviteClosed ? inviteClosedTitle : 'Mark invitation as not sent'
                                }
                              >
                                <Undo2 size={14} className="mr-1.5" />
                                Unsend
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => void sendInvite(booking)}
                                className="flex items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white border-vailo-teal/15 text-vailo-teal hover:bg-vailo-teal/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200"
                                disabled={
                                  !detailsComplete ||
                                  sendingInvite ||
                                  inviteClosed ||
                                  !booking.guestEmail?.trim()?.includes('@')
                                }
                                title={
                                  inviteClosed
                                    ? inviteClosedTitle
                                    : !detailsComplete
                                      ? 'Add guest details first'
                                      : !booking.guestEmail?.trim()
                                        ? 'Add guest email to send an invitation by email'
                                        : 'Email invitation link and access password to guest'
                                }
                              >
                                <Mail size={14} className="mr-1.5" />
                                Send Invite
                              </button>
                              {!inviteClosed && detailsComplete && (
                                <button
                                  type="button"
                                  onClick={() => void handleMarkInviteSentViaWhatsApp(booking)}
                                  disabled={markingWhatsAppInviteId === booking.id}
                                  className="flex items-center px-3 py-1.5 rounded-lg border border-[#25D366]/35 bg-white text-xs font-bold text-[#128C7E] hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Mark as invited after sharing the portal link and password on WhatsApp"
                                >
                                  {markingWhatsAppInviteId === booking.id ? (
                                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                                  ) : (
                                    <Check size={14} className="mr-1.5" />
                                  )}
                                  Mark invited (WhatsApp)
                                </button>
                              )}
                            </>
                          )}

                          {whatsappPhone && detailsComplete && (
                            <GuestWhatsAppLink
                              phone={whatsappPhone}
                              label="WhatsApp"
                              disabled={inviteClosed}
                              loading={openingWhatsAppInviteId === booking.id}
                              onClick={() => void handleOpenWhatsAppInvite(booking)}
                              title={
                                inviteClosed
                                  ? inviteClosedTitle
                                  : 'Open WhatsApp with guest portal link and access password'
                              }
                            />
                          )}

                          {whatsappPhone && isPostStayThankYouEligible(booking) && (
                            <GuestWhatsAppLink
                              phone={whatsappPhone}
                              message={buildThankYouWhatsAppMessage(booking)}
                              label="Thank you"
                              title="Open WhatsApp with a post-stay thank-you message (same text as the automated email)"
                            />
                          )}

                          {/* Delete */}
                          {isManual && (
                            <button 
                              onClick={() => handleDelete(booking)}
                              className="text-gray-400 hover:text-red-600 transition-colors ml-2"
                              title="Delete Manual Booking"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preArrivalViewBooking && preArrivalViewBooking.preArrivalSubmission && (
        <PreArrivalSubmissionModal
          booking={preArrivalViewBooking}
          typeId={preArrivalViewBooking.typeId}
          propertyId={propertyId}
          propertyName={property.propertyName || 'Your property'}
          unitName={preArrivalViewBooking.typeName}
          onClose={() => setPreArrivalViewBooking(null)}
        />
      )}

      {emailPreviewBooking && (
        <GuestInviteEmailPreviewModal
          booking={emailPreviewBooking}
          typeId={emailPreviewBooking.typeId}
          unitName={emailPreviewBooking.typeName}
          propertyName={property.propertyName || 'Your property'}
          propertySlug={property.urlSlug}
          unitType={propertyTypes.find((t) => t.id === emailPreviewBooking.typeId)}
          defaultReinvite={Boolean(emailPreviewBooking.isInvited)}
          accessPassword={
            emailPreviewBooking.id
              ? invitePreviewSecrets[emailPreviewBooking.id]?.password
              : undefined
          }
          inviteToken={
            emailPreviewBooking.id
              ? invitePreviewSecrets[emailPreviewBooking.id]?.token ||
                emailPreviewBooking.inviteToken
              : emailPreviewBooking.inviteToken
          }
          detailsComplete={isBookingGuestDetailsComplete(emailPreviewBooking)}
          preArrivalCheckInEnabled={preArrivalCheckInEnabled}
          onClose={() => setEmailPreviewBooking(null)}
        />
      )}

      {inviteCredentials && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900">
              Invitation for {inviteCredentials.guestName}
            </h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {inviteCredentials.stayLabel} — share the link and password with the guest. The same
              access applies if they open the unit URL on site during their stay.
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Link</p>
                <p className="break-all font-mono text-vailo-teal bg-gray-50 p-2 rounded-lg">
                  {inviteCredentials.inviteUrl || 'Set property and unit URL slugs.'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">Password</p>
                <p className="font-mono text-lg font-bold tracking-widest text-gray-900">
                  {inviteCredentials.password}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (inviteCredentials.inviteUrl) {
                    navigator.clipboard.writeText(
                      `${inviteCredentials.inviteUrl}\nPassword: ${inviteCredentials.password}`
                    );
                    toast.success('Link and password copied.');
                  }
                }}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Copy all
              </button>
              <button
                type="button"
                onClick={() => setInviteCredentials(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-vailo-teal rounded-lg hover:bg-vailo-teal-hover"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsBooking && (
        <CalendarBookingDetailsModal
          booking={detailsBooking}
          providerLabel={bookingProviderLabel(detailsBooking)}
          languages={languages}
          saving={savingDetails}
          onClose={() => setDetailsBooking(null)}
          onSave={(payload) => void saveBookingDetails(detailsBooking, payload)}
          subtitle={
            isBookingGuestDetailsComplete(detailsBooking)
              ? 'Updates are saved to House Guests and this reservation.'
              : 'Saved details appear under House Guests and enable invitation.'
          }
          saveLabel={
            isBookingGuestDetailsComplete(detailsBooking) ? 'Save changes' : 'Save details'
          }
        />
      )}

      {resetRangeOpen && (
        <ResetBookingsDateRangeModal
          scopeLabel={resetScopeLabel}
          bookings={resetScopeBookings}
          onClose={() => setResetRangeOpen(false)}
          onConfirm={handleResetDateRange}
        />
      )}

      {splitBooking && (
        <SplitReservationModal
          booking={splitBooking}
          onClose={() => setSplitBooking(null)}
          onConfirm={(parts) => handleSplitConfirm(splitBooking, parts)}
        />
      )}
    </div>
  );
}