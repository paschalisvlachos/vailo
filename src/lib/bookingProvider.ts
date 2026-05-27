/** Infer OTA / channel label from iCal URL or event summary. */
export function extractBookingProvider(summary: string, iCalUrl: string): string {
  const lowerUrl = iCalUrl.toLowerCase();
  if (lowerUrl.includes('airbnb.com')) return 'Airbnb';
  if (lowerUrl.includes('booking.com')) return 'Booking.com';
  if (lowerUrl.includes('vrbo.com') || lowerUrl.includes('homeaway.com')) return 'VRBO';
  if (lowerUrl.includes('expedia.com')) return 'Expedia';

  if (!summary) return 'Direct / Manual Booking';
  const lowerSum = summary.toLowerCase();
  if (lowerSum.includes('airbnb')) return 'Airbnb';
  if (lowerSum.includes('booking.com')) return 'Booking.com';
  if (lowerSum.includes('vrbo') || lowerSum.includes('homeaway')) return 'VRBO';
  if (lowerSum.includes('closed') || lowerSum.includes('blocked')) return 'Blocked Date';

  return summary.length > 20 ? `${summary.substring(0, 20)}...` : summary;
}
