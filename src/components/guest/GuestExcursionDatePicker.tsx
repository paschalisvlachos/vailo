import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrencyAmountParts, type Excursion } from '../../lib/excursion';
import {
  formatAvailabilitySpotsLabel,
  isAvailabilityCapacityUnlimited,
  monthDateRange,
  resolvePricesForDate,
  toAvailabilityDateId,
  type ExcursionAvailability,
} from '../../lib/excursionAvailability';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = {
  excursion: Pick<Excursion, 'seasonPrices' | 'currency' | 'showPriceFrom'>;
  openDates: ExcursionAvailability[];
  selectedDate: string;
  onSelect: (dateIso: string) => void;
  hasError?: boolean;
};

function calendarAdultPriceParts(
  excursion: Props['excursion'],
  dateIso: string,
  availability?: ExcursionAvailability | null
): { amount: string; symbol: string } | null {
  const prices = resolvePricesForDate(excursion, dateIso, availability);
  if (!prices) return null;
  return formatCurrencyAmountParts(prices.adult, excursion.currency);
}

function calendarAdultPriceLabel(
  parts: { amount: string; symbol: string } | null
): string | null {
  if (!parts) return null;
  return `${parts.amount} ${parts.symbol}`;
}

function formatGuestDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function initialViewMonth(openDates: ExcursionAvailability[], selectedDate: string) {
  const ref = selectedDate || openDates[0]?.date;
  if (ref) {
    const d = new Date(`${ref}T12:00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function GuestExcursionDatePicker({
  excursion,
  openDates,
  selectedDate,
  onSelect,
  hasError = false,
}: Props) {
  const openByDate = useMemo(() => {
    const map = new Map<string, ExcursionAvailability>();
    for (const day of openDates) map.set(day.date, day);
    return map;
  }, [openDates]);

  const bounds = useMemo(() => {
    if (openDates.length === 0) return null;
    const sorted = [...openDates].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    return {
      firstYear: Number(first.slice(0, 4)),
      firstMonth: Number(first.slice(5, 7)) - 1,
      lastYear: Number(last.slice(0, 4)),
      lastMonth: Number(last.slice(5, 7)) - 1,
    };
  }, [openDates]);

  const [{ year, month }, setViewMonth] = useState(() =>
    initialViewMonth(openDates, selectedDate)
  );

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayIso = new Date().toISOString().slice(0, 10);

  const datesInMonth = useMemo(() => {
    const { start, end } = monthDateRange(year, month);
    return openDates.filter((d) => d.date >= start && d.date <= end).length;
  }, [openDates, year, month]);

  const canGoPrev =
    bounds &&
    (year > bounds.firstYear || (year === bounds.firstYear && month > bounds.firstMonth));
  const canGoNext =
    bounds &&
    (year < bounds.lastYear || (year === bounds.lastYear && month < bounds.lastMonth));

  const selectedDay = selectedDate ? openByDate.get(selectedDate) : null;
  const selectedPriceParts = selectedDay
    ? calendarAdultPriceParts(excursion, selectedDay.date, selectedDay)
    : null;

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border bg-white p-4 ${
          hasError ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() =>
              setViewMonth((prev) => {
                const d = new Date(prev.year, prev.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
            disabled={!canGoPrev}
            className="p-2 rounded-xl text-[#0B4F5C] hover:bg-[#0B4F5C]/5 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-0">
            <p className="font-luxury text-lg text-[#051F26] font-medium">{monthLabel(year, month)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {datesInMonth} available date{datesInMonth !== 1 ? 's' : ''} this month
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setViewMonth((prev) => {
                const d = new Date(prev.year, prev.month + 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
            disabled={!canGoNext}
            className="p-2 rounded-xl text-[#0B4F5C] hover:bg-[#0B4F5C]/5 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 py-1"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day, index) => {
            if (day == null) {
              return <div key={`empty-${index}`} className="aspect-square" aria-hidden />;
            }

            const dateIso = toAvailabilityDateId(new Date(year, month, day));
            const availability = openByDate.get(dateIso);
            const isAvailable = Boolean(availability);
            const isSelected = selectedDate === dateIso;
            const isToday = dateIso === todayIso;
            const isPast = dateIso < todayIso;
            const priceParts = availability
              ? calendarAdultPriceParts(excursion, dateIso, availability)
              : null;
            const priceAria = calendarAdultPriceLabel(priceParts);

            return (
              <button
                key={dateIso}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && onSelect(dateIso)}
                className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center px-0.5 py-1 text-sm font-semibold transition-all relative ${
                  isSelected
                    ? 'bg-[#0B4F5C] text-white shadow-md scale-[1.02]'
                    : isAvailable
                      ? 'bg-[#0B4F5C]/8 text-[#0B4F5C] hover:bg-[#0B4F5C]/15'
                      : isPast
                        ? 'text-gray-300'
                        : 'text-gray-400'
                } ${isToday && !isSelected ? 'ring-2 ring-[#C5A059]/50 ring-offset-1' : ''}`}
                aria-label={
                  isAvailable
                    ? `Book ${formatGuestDate(dateIso)}${priceAria ? `, ${priceAria} per adult` : ''}`
                    : `${day} unavailable`
                }
                aria-pressed={isSelected}
              >
                <span className="leading-none">{day}</span>
                {isAvailable && priceParts && (
                  <span
                    className={`inline-flex items-baseline gap-0.5 text-[8px] font-bold leading-tight mt-1 max-w-full ${
                      isSelected ? 'text-white/90' : 'text-[#0B4F5C]/75'
                    }`}
                  >
                    <span className="tabular-nums">{priceParts.amount}</span>
                    <span>{priceParts.symbol}</span>
                  </span>
                )}
                {isAvailable && !isSelected && !priceParts && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#C5A059]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div className="rounded-xl border border-[#0B4F5C]/15 bg-[#0B4F5C]/5 px-4 py-3.5">
          <p className="font-luxury text-base text-[#051F26] font-medium leading-snug">
            {formatGuestDate(selectedDay.date)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-600">
            {selectedPriceParts && (
              <span className="font-semibold text-[#0B4F5C] inline-flex items-baseline gap-1">
                {excursion.showPriceFrom !== false && (
                  <span className="font-normal">from</span>
                )}
                <span className="tabular-nums">{selectedPriceParts.amount}</span>
                <span>{selectedPriceParts.symbol}</span>
                <span className="font-normal text-gray-600">/ adult</span>
              </span>
            )}
            {selectedDay.departureTime && <span>Departs {selectedDay.departureTime}</span>}
            {!isAvailabilityCapacityUnlimited(selectedDay) && (
              <span>{formatAvailabilitySpotsLabel(selectedDay)}</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-1">Tap an highlighted date to continue</p>
      )}
    </div>
  );
}
