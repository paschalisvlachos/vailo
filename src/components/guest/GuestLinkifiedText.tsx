import { type ReactNode } from 'react';
import { ExternalLink, Phone } from 'lucide-react';
import { isValidExternalUrl, openExternalUrl } from '../../lib/geocoding';

const URL_REGEX = /\b(https?:\/\/[^\s<>\])}"']+|www\.[^\s<>\])}"']+)/gi;
const PHONE_REGEX = /\+?(?:\d[\s().\-/]?){8,14}\d/g;

function trimUrlTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, '');
}

function hrefForUrl(url: string): string | null {
  const trimmed = trimUrlTrailingPunctuation(url.trim());
  const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  return isValidExternalUrl(href) ? href : null;
}

function isLikelyPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  const trimmed = candidate.trim();
  if (trimmed.startsWith('+')) return true;
  if (/[\s().\-/]/.test(trimmed)) return true;
  return digits.length >= 10;
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[\s().\-/]/g, '')}`;
}

function formatPhoneDisplay(phone: string): string {
  return phone.replace(/\s+/g, ' ').trim();
}

function ViewMoreLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openExternalUrl(href);
      }}
      className="inline-flex items-center gap-1 mx-0.5 align-baseline text-[0.95em] font-semibold text-[#0A4544] underline decoration-[#C5A059]/70 underline-offset-[3px] hover:text-[#083937] hover:decoration-[#C5A059]"
    >
      View more
      <ExternalLink size={12} className="shrink-0 opacity-80" aria-hidden />
    </a>
  );
}

function PhoneChip({ phone }: { phone: string }) {
  const display = formatPhoneDisplay(phone);
  return (
    <a
      href={telHref(phone)}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 mx-0.5 my-0.5 align-middle max-w-full rounded-full border border-[#D4E3E2] bg-[#F3F8F7] px-2.5 py-1 text-[0.92em] font-semibold text-[#0A4544] no-underline shadow-[0_1px_2px_rgba(4,28,30,0.06)] hover:border-[#C5A059]/55 hover:bg-white"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0A4544] text-[#E8D5A8]">
        <Phone size={11} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 truncate tabular-nums tracking-wide">{display}</span>
    </a>
  );
}

function linkifyPhones(segment: string, keyPrefix: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(PHONE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(segment)) !== null) {
    const raw = match[0];
    if (match.index > last) {
      nodes.push(segment.slice(last, match.index));
    }
    if (isLikelyPhone(raw)) {
      nodes.push(<PhoneChip key={`${keyPrefix}-p-${key++}`} phone={raw} />);
    } else {
      nodes.push(raw);
    }
    last = match.index + raw.length;
  }

  if (last < segment.length) {
    nodes.push(segment.slice(last));
  }

  return nodes.length > 0 ? nodes : [segment];
}

export function linkifyGuestText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let urlKey = 0;
  const urlRe = new RegExp(URL_REGEX.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = urlRe.exec(text)) !== null) {
    const raw = match[0];
    if (match.index > lastIndex) {
      nodes.push(...linkifyPhones(text.slice(lastIndex, match.index), urlKey * 100));
    }

    const href = hrefForUrl(raw);
    if (href) {
      nodes.push(<ViewMoreLink key={`u-${urlKey++}`} href={href} />);
    } else {
      nodes.push(raw);
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(...linkifyPhones(text.slice(lastIndex), urlKey * 100 + 50));
  }

  return nodes.length > 0 ? nodes : [text];
}

type Props = {
  text: string;
  className?: string;
};

export default function GuestLinkifiedText({ text, className }: Props) {
  return <div className={className}>{linkifyGuestText(text)}</div>;
}
