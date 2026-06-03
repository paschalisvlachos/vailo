import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import CalendarBookingDetailsModal from '../../../components/admin/CalendarBookingDetailsModal';
import GuestWhatsAppLink from '../../../components/admin/GuestWhatsAppLink';
import { extractBookingProvider } from '../../../lib/bookingProvider';
import {
  buildGuestPortalUrl,
  formatGuestSlug,
  getTypePublicSlug,
} from '../../../lib/guestPortalSlug';
import { bookingWhatsAppPhone } from '../../../lib/guestWhatsApp';
import { buildInvitePortalUrl, isGuestPortalAccessRequired } from '../../../lib/guestAccess';
import { sendGuestInviteCallable } from '../../../lib/guestPortalCallables';
import { httpsCallableMessage } from '../../../lib/callableError';
import {
  getBookingInvitationStatus,
  guestDetailsPatch,
  isBookingGuestDetailsComplete,
  patchSyncedBookingList,
  patchSyncedBookingListRevokeAccess,
  type SyncedBooking,
} from '../../../lib/syncedBooking';
import {
  Calendar as CalendarIcon,
  Plus,
  Mail,
  Link2,
  Check,
  ArrowLeft,
  Building,
  Trash2,
  Loader2,
  AlertCircle,
  Pencil,
  Undo2,
  RefreshCw,
} from 'lucide-react';

type ReservationRow = SyncedBooking & { typeId: string; typeName: string };

export default function Reservations() {
  const { property, propertyId } = useOutletContext<{
    property: { urlSlug?: string; guestPortalAccessRequired?: boolean };
    propertyId: string;
  }>();
  const toast = useToast();
  const { languages } = usePlatformLanguages();

  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [filterTypeId, setFilterTypeId] = useState<string>('all');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailsBooking, setDetailsBooking] = useState<ReservationRow | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [inviteCredentials, setInviteCredentials] = useState<{
    guestName: string;
    inviteUrl: string;
    password: string;
  } | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

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
  ).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()); 

  const displayedBookings = filterTypeId === 'all' 
    ? allBookings 
    : allBookings.filter(b => b.typeId === filterTypeId);

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
        guestEmail: formData.guestEmail,
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
    if (!payload.guestName || !payload.guestEmail || !payload.guestLocale) {
      toast.warning('Name, email, and language are required.');
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
      toast.success('Guest details saved. They appear under House Guests.');
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

    if (isGuestPortalAccessRequired(property)) {
      setSendingInvite(true);
      try {
        const { inviteToken, invitePassword } = await sendGuestInviteCallable(
          propertyId,
          booking.typeId,
          booking.id,
          options?.reinvite
        );
        const type = propertyTypes.find((t) => t.id === booking.typeId);
        const propSlug = formatGuestSlug(property.urlSlug);
        const unitSlug = type ? getTypePublicSlug(type) : '';
        const inviteUrl =
          propSlug && unitSlug
            ? buildInvitePortalUrl(
                window.location.origin,
                propSlug,
                unitSlug,
                inviteToken,
                booking.typeId,
                booking.guestLocale
              )
            : '';
        setInviteCredentials({
          guestName: guestLabel,
          inviteUrl,
          password: invitePassword,
        });
        toast.success(
          options?.reinvite
            ? `Re-invite prepared for ${guestLabel}. Share the link and password (email/WhatsApp delivery next).`
            : `Invite prepared for ${guestLabel}. Share the link and password.`
        );
      } catch (err) {
        toast.error(httpsCallableMessage(err, 'Failed to send invite.'));
      } finally {
        setSendingInvite(false);
      }
      return;
    }

    const targetType = propertyTypes.find((t) => t.id === booking.typeId);
    if (!targetType) return;

    const updatedBookings = patchSyncedBookingList(targetType.syncedBookings, booking, {
      isInvited: true,
      lastInvitedAt: new Date().toISOString(),
    });

    await setDoc(
      doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId),
      { syncedBookings: updatedBookings },
      { merge: true }
    );

    toast.success(
      options?.reinvite
        ? `Re-invite recorded for ${guestLabel}.`
        : `Invitation recorded for ${guestLabel}.`
    );
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

  const handleCopyLink = (booking: ReservationRow) => {
    const type = propertyTypes.find((t) => t.id === booking.typeId);
    const link = type
      ? buildGuestPortalUrl(window.location.origin, property, {
          id: type.id,
          urlSlug: type.urlSlug,
          typeSlug: type.typeSlug,
          propertyTypeName: type.propertyTypeName,
        })
      : null;

    if (!link) {
      toast.warning('Set property and unit URL slugs before copying the guest portal link.');
      return;
    }

    navigator.clipboard.writeText(link);
    const copyKey = booking.id || `${booking.start}-${booking.end}`;
    setCopiedId(copyKey);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Guest portal link copied.');
  };

  const bookingProviderLabel = (booking: ReservationRow) => {
    const type = propertyTypes.find((t) => t.id === booking.typeId);
    return (
      booking.provider ||
      extractBookingProvider(booking.summary || '', type?.iCalUrl || '')
    );
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Email *</label>
                <input type="email" required name="guestEmail" value={formData.guestEmail} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal" placeholder="john@example.com" />
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

        <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm text-sm font-medium">
          <Plus size={18} className="mr-2" /> Add Manual Booking
        </button>
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

                  return (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      {/* Guest Info */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{booking.guestName || booking.summary}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {booking.guestEmail ? booking.guestEmail : <span className="italic">OTA Guest Email Hidden</span>}
                        </div>
                        {(booking.guestWhatsapp || booking.guestPhone) && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                            <span>{booking.guestWhatsapp || booking.guestPhone}</span>
                            {whatsappPhone && <GuestWhatsAppLink phone={whatsappPhone} />}
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
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {status === 'invited' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            Invited
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

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
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

                          <button
                            type="button"
                            onClick={() => handleCopyLink(booking)}
                            className="p-1.5 text-gray-400 hover:text-vailo-teal transition-colors"
                            title="Copy guest portal link for this unit"
                          >
                            {copiedId === copyKey ? (
                              <Check size={18} className="text-green-500" />
                            ) : (
                              <Link2 size={18} />
                            )}
                          </button>

                          {booking.isInvited ? (
                            <>
                              <span className="flex items-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-400">
                                <Mail size={14} className="mr-1.5" />
                                Sent
                              </span>
                              <button
                                type="button"
                                onClick={() => void sendInvite(booking, { reinvite: true })}
                                className="flex items-center px-3 py-1.5 rounded-lg border border-vailo-teal/15 bg-white text-xs font-bold text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                                title="Send invitation again"
                              >
                                <RefreshCw size={14} className="mr-1.5" />
                                Re-invite
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleUninvite(booking)}
                                className="flex items-center px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                                title="Mark invitation as not sent"
                              >
                                <Undo2 size={14} className="mr-1.5" />
                                Unsend
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void sendInvite(booking)}
                              className="flex items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white border-vailo-teal/15 text-vailo-teal hover:bg-vailo-teal/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:border-gray-200"
                              disabled={!detailsComplete || sendingInvite}
                              title={
                                !detailsComplete ? 'Add guest details first' : 'Mark invitation as sent'
                              }
                            >
                              <Mail size={14} className="mr-1.5" />
                              Send Invite
                            </button>
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

      {inviteCredentials && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900">Invitation for {inviteCredentials.guestName}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Share the link and password with the guest. The same access applies if they open the
              unit URL on site during their stay.
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
    </div>
  );
}