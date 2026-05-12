import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Calendar as CalendarIcon, Plus, Mail, Link2, Check, ArrowLeft, Building, Trash2, Loader2, AlertCircle } from 'lucide-react';

export default function Reservations() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [filterTypeId, setFilterTypeId] = useState<string>('all');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const initialFormState = {
    typeId: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    start: '',
    end: ''
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
    if (!propertyId || !formData.typeId) return alert("Please select a unit.");
    
    // Normalize new dates for mathematical comparison
    const newStart = new Date(formData.start);
    const newEnd = new Date(formData.end);
    newStart.setHours(0, 0, 0, 0);
    newEnd.setHours(0, 0, 0, 0);

    if (newEnd <= newStart) return alert("Check-out must be after check-in.");
    
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
        alert("DOUBLE BOOKING DETECTED: These dates overlap with an existing reservation in this unit. Please choose different dates or a different unit.");
        setIsSubmitting(false);
        return; // Immediately stop execution
      }
      // --- END ENGINE ---

      const newBooking = {
        id: `MANUAL-${Math.random().toString(36).substr(2, 9)}`,
        start: formData.start,
        end: formData.end,
        summary: formData.guestName, 
        provider: 'Direct Booking',
        guestName: formData.guestName,
        guestEmail: formData.guestEmail,
        guestPhone: formData.guestPhone || '',
        isInvited: false
      };

      const updatedBookings = [...existingBookings, newBooking];
      
      await setDoc(doc(db, 'properties', propertyId, 'propertyTypes', formData.typeId), {
        syncedBookings: updatedBookings
      }, { merge: true });

      setIsFormOpen(false);
      setFormData(initialFormState);
    } catch (error) {
      alert("Failed to add reservation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvite = async (booking: any) => {
    const targetType = propertyTypes.find(t => t.id === booking.typeId);
    if (!targetType) return;

    alert(`Invitation sent to ${booking.guestName || booking.summary}!`);

    const updatedBookings = targetType.syncedBookings.map((b: any) => 
      b.id === booking.id ? { ...b, isInvited: true } : b
    );

    await setDoc(doc(db, 'properties', propertyId, 'propertyTypes', booking.typeId), {
      syncedBookings: updatedBookings
    }, { merge: true });
  };

  const handleCopyLink = (bookingId: string) => {
    const link = `https://vailo.app/guest/${bookingId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(bookingId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (booking: any) => {
    if (!window.confirm("Delete this reservation? It will be removed from the calendar.")) return;
    
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
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Types Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">Create a unit first to manage reservations.</p>
      </div>
    );
  }

  if (isFormOpen) {
    return (
      <div className="max-w-3xl mx-auto">
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
            <select required name="typeId" value={formData.typeId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="">Select a property type...</option>
              {propertyTypes.map(type => (
                <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
              ))}
            </select>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Full Name *</label>
                <input type="text" required name="guestName" value={formData.guestName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="John Doe" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Email *</label>
                <input type="email" required name="guestEmail" value={formData.guestEmail} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="john@example.com" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Phone <span className="text-gray-400 font-normal">(Optional, for WhatsApp)</span></label>
                <input type="tel" name="guestPhone" value={formData.guestPhone} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" placeholder="+1 234 567 8900" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date *</label>
                <input type="date" required name="start" value={formData.start} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date *</label>
                <input type="date" required name="end" value={formData.end} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
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
              <button type="submit" disabled={isSubmitting} className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm">
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
    <div className="max-w-7xl mx-auto pb-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <CalendarIcon size={20} />
          </div>
          <select 
            value={filterTypeId} 
            onChange={(e) => setFilterTypeId(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[200px]"
          >
            <option value="all">All Units (Master View)</option>
            {propertyTypes.map(type => (
              <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
            ))}
          </select>
        </div>

        <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
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
                {displayedBookings.map((booking: any) => {
                  const checkIn = new Date(booking.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                  const checkOut = new Date(booking.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                  const isManual = booking.provider === 'Direct Booking';

                  return (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      {/* Guest Info */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{booking.guestName || booking.summary}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {booking.guestEmail ? booking.guestEmail : <span className="italic">OTA Guest Email Hidden</span>}
                        </div>
                        {booking.guestPhone && <div className="text-xs text-gray-500">{booking.guestPhone}</div>}
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
                        {booking.isInvited ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            Invited
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          
                          {/* Copy Link */}
                          <button 
                            onClick={() => handleCopyLink(booking.id)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Copy Guest Link"
                          >
                            {copiedId === booking.id ? <Check size={18} className="text-green-500" /> : <Link2 size={18} />}
                          </button>

                          {/* Send Invite */}
                          <button 
                            onClick={() => handleInvite(booking)}
                            className={`flex items-center px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                              booking.isInvited 
                                ? 'bg-white border-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50'
                            }`}
                            disabled={booking.isInvited}
                          >
                            <Mail size={14} className="mr-1.5" />
                            {booking.isInvited ? 'Sent' : 'Send Invite'}
                          </button>

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
    </div>
  );
}