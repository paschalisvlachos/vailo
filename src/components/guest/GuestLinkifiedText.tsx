import { type ReactNode } from 'react';
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
      nodes.push(
        <a
          key={`${keyPrefix}-p-${key++}`}
          href={telHref(raw)}
          className="text-[#0B4F5C] font-medium underline underline-offset-2"
        >
          {raw}
        </a>
      );
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

    const display = trimUrlTrailingPunctuation(raw);
    const href = hrefForUrl(raw);
    if (href) {
      nodes.push(
        <a
          key={`u-${urlKey++}`}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternalUrl(href);
          }}
          className="text-[#0B4F5C] font-medium underline underline-offset-2 break-all"
        >
          {display}
        </a>
      );
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
