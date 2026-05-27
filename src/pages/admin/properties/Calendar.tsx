import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import CalendarBookingDetailsModal from '../../../components/admin/CalendarBookingDetailsModal';
import {
  formatBookingDateRange,
  getBookingInvitationStatus,
  guestDetailsPatch,
  mergeSyncedBookingFromExisting,
  patchSyncedBookingList,
  type SyncedBooking,
} from '../../../lib/syncedBooking';
import { extractBookingProvider } from '../../../lib/bookingProvider';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Building, RefreshCw } from 'lucide-react';

function bookingStatusLabel(status: ReturnType<typeof getBookingInvitationStatus>): string {
  switch (status) {
    case 'invited':
      return 'Invited';
    case 'ready_for_reservations':
      return 'Visit the reservations page for invitation settings';
    default:
      return 'Enter details to enable invitation';
  }
}

function bookingBorderClass(status: ReturnType<typeof getBookingInvitationStatus>): string {
  switch (status) {
    case 'invited':
      return 'border-l-red-500';
    case 'ready_for_reservations':
      return 'border-l-emerald-500';
    default:
      return 'border-l-blue-500';
  }
}

export default function Calendar() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  const toast = useToast();
  const { languages } = usePlatformLanguages();

  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [detailsBooking, setDetailsBooking] = useState<SyncedBooking | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
      if (typesData.length > 0 && !selectedTypeId) setSelectedTypeId(typesData[0].id);
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = new Date();

  const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);

  const handleSync = async () => {
    if (!selectedType?.iCalUrl) return;
    setIsSyncing(true);

    try {
      const separator = selectedType.iCalUrl.includes('?') ? '&' : '?';
      const noCacheUrl = `${selectedType.iCalUrl}${separator}nocache=${Date.now()}`;

      const proxies = [
        `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(noCacheUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(noCacheUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(noCacheUrl)}`,
      ];

      let text: string | null = null;
      let success = false;

      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl);
          if (response.ok) {
            const fetchedText = await response.text();
            if (fetchedText.includes('BEGIN:VCALENDAR')) {
              text = fetchedText;
              success = true;
              break;
            }
          }
        } catch {
          /* try next proxy */
        }
      }

      if (!success || !text) {
        throw new Error(
          "All proxy networks were blocked by the booking channel's firewall. Try again in a few minutes."
        );
      }

      const events: SyncedBooking[] = [];
      const lines = text.split(/\r?\n/);
      let currentEvent: SyncedBooking | null = null;

      const extractDateFromICal = (line: string) => {
        const match = line.match(/:(\d{8})/);
        if (match) {
          const dateStr = match[1];
          const y = dateStr.substring(0, 4);
          const m = dateStr.substring(4, 6);
          const d = dateStr.substring(6, 8);
          return `${y}-${m}-${d}`;
        }
        return null;
      };

      for (const line of lines) {
        if (line.startsWith('BEGIN:VEVENT')) {
          currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
          if (currentEvent && currentEvent.start && currentEvent.end) {
            currentEvent.id = Math.random().toString(36).substr(2, 9);
            currentEvent.provider = extractBookingProvider(
              currentEvent.summary || '',
              selectedType.iCalUrl
            );
            currentEvent.isInvited = false;
            events.push(currentEvent);
          }
          currentEvent = null;
        } else if (currentEvent) {
          if (line.startsWith('DTSTART')) {
            currentEvent.start = extractDateFromICal(line) || undefined;
          } else if (line.startsWith('DTEND')) {
            currentEvent.end = extractDateFromICal(line) || undefined;
          } else if (line.startsWith('SUMMARY')) {
            currentEvent.summary = line.substring(line.indexOf(':') + 1);
          }
        }
      }

      const typeRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId);
      const existingBookings: SyncedBooking[] = selectedType.syncedBookings || [];

      const mergedEvents = events.map((newEvent) => {
        const matchedOld = existingBookings.find(
          (b) => b.start === newEvent.start && b.end === newEvent.end
        );
        return mergeSyncedBookingFromExisting(newEvent, matchedOld);
      });

      await setDoc(
        typeRef,
        {
          syncedBookings: mergedEvents,
          lastSyncedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      toast.success(`Calendar synced! Found ${events.length} reservations.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      console.error('Sync error:', error);
      toast.error(`Failed to sync calendar. Error: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveBookingDetails = async (
    target: SyncedBooking,
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

    if (!selectedType?.syncedBookings) return;
    setSavingDetails(true);

    const updatedBookings = patchSyncedBookingList(
      selectedType.syncedBookings,
      target,
      guestDetailsPatch(payload)
    );

    try {
      const typeRef = doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId);
      await setDoc(typeRef, { syncedBookings: updatedBookings }, { merge: true });
      toast.success('Guest details saved. View them under House Guests.');
      setDetailsBooking(null);
    } catch (error) {
      console.error('Error saving guest details', error);
      toast.error('Failed to save guest details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const getBookingsForDate = (day: number) => {
    if (!selectedType?.syncedBookings) return [];

    const cellDate = new Date(year, month, day);
    cellDate.setHours(0, 0, 0, 0);

    return selectedType.syncedBookings.filter((booking: SyncedBooking) => {
      if (!booking.start || !booking.end) return false;
      const startDate = new Date(booking.start);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(booking.end);
      endDate.setHours(0, 0, 0, 0);

      return cellDate >= startDate && cellDate < endDate;
    });
  };

  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Listings Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          Availability calendars are managed per specific unit. Please create a unit first.
        </p>
      </div>
    );
  }

  const detailsProvider =
    detailsBooking &&
    (detailsBooking.provider ||
      extractBookingProvider(detailsBooking.summary || '', selectedType?.iCalUrl || ''));

  return (
    <div className="admin-page">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-vailo-teal/5 text-vailo-teal rounded-xl flex items-center justify-center">
            <CalendarIcon size={20} />
          </div>
          <select
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal shadow-sm min-w-[200px]"
          >
            {propertyTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.propertyTypeName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {selectedType?.iCalUrl ? (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200 flex items-center">
              <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span> iCal Active
            </span>
          ) : (
            <span className="text-xs font-medium text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-200">
              No iCal configured
            </span>
          )}

          <button
            onClick={handleSync}
            disabled={!selectedType?.iCalUrl || isSyncing}
            className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl text-sm font-medium hover:bg-vailo-teal-hover disabled:opacity-50 disabled:bg-gray-400 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={`mr-2 ${isSyncing ? 'animate-spin text-white' : 'text-white'}`} />
            {isSyncing ? 'Syncing Bookings...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900">
            {monthNames[month]} {year}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={prevMonth}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 gap-px border-b border-gray-200">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50 min-h-[140px] p-2"></div>
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday =
              day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const isPast = new Date(year, month, day) < todayStart;

            const dayBookings = getBookingsForDate(day);

            return (
              <div
                key={day}
                className={`bg-white min-h-[140px] p-2 relative group transition-colors flex flex-col ${
                  isPast ? 'opacity-60 bg-gray-50/50' : 'hover:bg-gray-50'
                } ${dayBookings.length > 0 ? 'bg-vailo-teal/5/10' : ''}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full mb-1 ${
                    isToday ? 'bg-vailo-teal text-white shadow-sm' : 'text-gray-700'
                  }`}
                >
                  {day}
                </span>

                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[90px] no-scrollbar">
                  {dayBookings.length > 0 ? (
                    dayBookings.map((booking: SyncedBooking) => {
                      const fallbackId = booking.id || `${booking.start}-${booking.end}`;
                      const providerName =
                        booking.provider ||
                        extractBookingProvider(booking.summary || '', selectedType?.iCalUrl || '');
                      const status = getBookingInvitationStatus(booking);

                      return (
                        <button
                          key={fallbackId}
                          type="button"
                          onClick={() => setDetailsBooking(booking)}
                          className={`w-full text-left px-2.5 py-2 bg-white border border-gray-200 border-l-[3px] ${bookingBorderClass(
                            status
                          )} rounded-md shadow-sm hover:shadow-md transition-shadow`}
                        >
                          <div
                            className="text-[10px] font-bold text-gray-700 truncate"
                            title={`Booked via ${providerName}`}
                          >
                            Booked via {providerName}
                          </div>
                          <div className="text-[10px] text-gray-600 mt-0.5 font-medium">
                            {formatBookingDateRange(booking.start, booking.end)}
                          </div>
                          <div
                            className={`text-[9px] mt-1 leading-tight font-semibold ${
                              status === 'invited'
                                ? 'text-red-600'
                                : status === 'ready_for_reservations'
                                  ? 'text-emerald-700'
                                  : 'text-vailo-teal'
                            }`}
                          >
                            {bookingStatusLabel(status)}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="mt-4 px-2 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded opacity-0 group-hover:opacity-100 transition-opacity text-center border border-emerald-100">
                      Available
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {detailsBooking && detailsProvider && (
        <CalendarBookingDetailsModal
          booking={detailsBooking}
          providerLabel={detailsProvider}
          languages={languages}
          saving={savingDetails}
          onClose={() => setDetailsBooking(null)}
          onSave={(payload) => void saveBookingDetails(detailsBooking, payload)}
        />
      )}
    </div>
  );
}
