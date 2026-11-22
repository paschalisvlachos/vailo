/**
 * Property work sections shown in the main admin sidebar (Your portfolio)
 * and used to drive PropertyLayout visibility.
 */

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Handshake,
  MapPin,
  Users,
} from 'lucide-react';

export type PropertyAdminSection = {
  name: string;
  /** Path under /admin/properties/:id/ — empty string was Overview (removed). */
  path: string;
  icon: LucideIcon;
  help: string;
  badgeKey: 'guestIssues' | null;
};

/**
 * Property work sections (sidebar), excluding Property Listings itself —
 * that is the unified portfolio entry (`/properties` or `/properties/:id/types`).
 */
export const PROPERTY_ADMIN_SECTIONS: PropertyAdminSection[] = [
  {
    name: 'Check-ins',
    path: 'check-ins',
    icon: ClipboardCheck,
    badgeKey: null,
    help: 'Online pre-arrival check-in responses from guests.',
  },
  {
    name: 'Local Gems',
    path: 'local-gems',
    icon: MapPin,
    badgeKey: null,
    help: 'Curated places near this property for the guest portal.',
  },
  {
    name: 'House Guide',
    path: 'house-guide',
    icon: BookOpen,
    badgeKey: null,
    help: 'Stay handbook: check-in, Wi‑Fi, appliances, house rules, and more.',
  },
  {
    name: 'Partners',
    path: 'features',
    icon: Handshake,
    badgeKey: null,
    help: 'Business cooperations and promotions you offer guests — and may earn commission on.',
  },
  {
    name: 'Guest Issues',
    path: 'guest-issues',
    icon: AlertTriangle,
    badgeKey: 'guestIssues',
    help: 'Problems guests reported from the portal.',
  },
  {
    name: 'House Guests',
    path: 'house-guests',
    icon: Users,
    badgeKey: null,
    help: 'Guests linked to stays and invites for this property.',
  },
  {
    name: 'Analytics',
    path: 'analytics',
    icon: BarChart3,
    badgeKey: null,
    help: 'Portal activity and engagement for this property.',
  },
];

/** Parse `/admin/properties/:propertyId/...` from a pathname. */
export function propertyIdFromAdminPath(pathname: string): string | null {
  const match = pathname.match(/\/admin\/properties\/([^/]+)/);
  if (!match) return null;
  const id = match[1];
  if (!id || id === 'add' || id === 'new') return null;
  return id;
}
