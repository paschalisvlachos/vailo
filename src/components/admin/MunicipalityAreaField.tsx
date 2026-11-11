import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPin } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  searchMunicipalitiesForCountry,
  type MunicipalitySuggestion,
} from '../../lib/geocoding';
import { AdminInput, AdminLabel } from './AdminPageHeader';

export type MunicipalityChoice = {
  name: string;
  lat?: number;
  lng?: number;
};

type ExistingArea = { id: string; name: string };

type SuggestionRow =
  | { key: string; name: string; label: string; kind: 'existing' }
  | { key: string; name: string; label: string; kind: 'geocode'; lat?: number; lng?: number };

type MunicipalityAreaFieldProps = {
  country: string;
  value: string;
  onChange: (next: MunicipalityChoice) => void;
  required?: boolean;
  id?: string;
  disabled?: boolean;
  label?: string;
  helpText?: string;
};

export default function MunicipalityAreaField({
  country,
  value,
  onChange,
  required = false,
  id,
  disabled = false,
  label = 'Area / municipality *',
  helpText = 'Type any city or municipality worldwide. We suggest matches for the selected country and create the area automatically if it is new.',
}: MunicipalityAreaFieldProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [existingAreas, setExistingAreas] = useState<ExistingArea[]>([]);
  const [remote, setRemote] = useState<MunicipalitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!country) {
      setExistingAreas([]);
      return;
    }
    return onSnapshot(collection(db, 'countries', country, 'areas'), (snapshot) => {
      const rows = snapshot.docs
        .map((d) => ({
          id: d.id,
          name: String(d.data().name || d.id).trim() || d.id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setExistingAreas(rows);
    });
  }, [country]);

  useEffect(() => {
    if (!country || query.trim().length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      void searchMunicipalitiesForCountry(query, country)
        .then((rows) => {
          if (!cancelled) setRemote(rows);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, country]);

  const updateMenuRect = () => {
    const el = inputWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    const onReposition = () => updateMenuRect();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, query, remote, existingAreas]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      const listEl = document.getElementById(listId);
      if (listEl?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [listId]);

  const q = query.trim().toLowerCase();
  const existingMatches =
    q.length === 0
      ? existingAreas.slice(0, 8)
      : existingAreas.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 8);

  const existingKeys = new Set(existingMatches.map((a) => a.name.toLowerCase()));
  const remoteOnly = remote.filter((r) => !existingKeys.has(r.name.toLowerCase()));

  const suggestions: SuggestionRow[] = [
    ...existingMatches.map((a) => ({
      key: `existing-${a.id}`,
      name: a.name,
      label: a.name,
      kind: 'existing' as const,
    })),
    ...remoteOnly.map((r) => ({
      key: `geo-${r.name}-${r.lat ?? 0}-${r.lng ?? 0}`,
      name: r.name,
      label: r.label,
      kind: 'geocode' as const,
      lat: r.lat,
      lng: r.lng,
    })),
  ].slice(0, 10);

  const showMenu =
    open && country && menuRect && (suggestions.length > 0 || (q.length >= 2 && !loading));

  const pick = (row: SuggestionRow) => {
    onChange({
      name: row.name,
      lat: row.kind === 'geocode' ? row.lat : undefined,
      lng: row.kind === 'geocode' ? row.lng : undefined,
    });
    setQuery(row.name);
    setOpen(false);
  };

  const commitTyped = () => {
    const name = query.trim();
    if (!name) return;
    const existing = existingAreas.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange({ name: existing.name });
      setQuery(existing.name);
      return;
    }
    const geo = remote.find((r) => r.name.toLowerCase() === name.toLowerCase()) || remote[0];
    if (geo && name.toLowerCase().startsWith(geo.name.toLowerCase().slice(0, 3))) {
      onChange({ name: geo.name, lat: geo.lat, lng: geo.lng });
      setQuery(geo.name);
      return;
    }
    onChange({ name });
  };

  return (
    <div ref={wrapRef} className="relative">
      <AdminLabel htmlFor={inputId}>{label}</AdminLabel>
      <div ref={inputWrapRef} className="relative">
        <MapPin
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-vailo-teal/50 pointer-events-none"
        />
        <AdminInput
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          required={required}
          disabled={disabled || !country}
          value={query}
          placeholder={country ? 'Start typing a city or municipality…' : 'Select a country first'}
          className="pl-9"
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            updateMenuRect();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
            if (!e.target.value.trim()) onChange({ name: '' });
          }}
          onBlur={() => {
            window.setTimeout(() => commitTyped(), 120);
          }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTyped();
                setOpen(false);
              }
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const row = suggestions[highlight];
              if (row) pick(row);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {loading ? (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
          />
        ) : null}
      </div>
      <p className="text-xs text-gray-500 mt-1">{helpText}</p>

      {showMenu
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              className="admin-shell fixed z-[200] max-h-64 overflow-auto rounded border border-[#eeeeee] bg-white shadow-[1px_1px_15px_rgba(0,0,0,0.1)]"
              style={{
                top: menuRect.top,
                left: menuRect.left,
                width: menuRect.width,
              }}
            >
              {suggestions.map((row, idx) => (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === highlight}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                      idx === highlight ? 'bg-vailo-teal/8 text-vailo-dark' : 'hover:bg-gray-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(row)}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <span className="font-semibold text-vailo-dark">{row.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{row.label}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      {row.kind === 'existing' ? 'Already in Vailo' : 'Suggested place'}
                    </span>
                  </button>
                </li>
              ))}
              {suggestions.length === 0 && q.length >= 2 && !loading ? (
                <li className="px-3 py-3 text-sm text-gray-500">
                  No matches yet — you can still use “{query.trim()}”. It will be created when you
                  save.
                </li>
              ) : null}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
}
