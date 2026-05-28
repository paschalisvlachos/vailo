import { MapPin, ExternalLink } from 'lucide-react';
import { extractPlanMapPoints, buildGoogleViewAllUrl } from '../../lib/planMapUtils';

type PlanOverviewMapProps = {
  planData: {
    type?: string;
    plan?: Record<string, unknown>[];
    categories?: { items?: Record<string, unknown>[] }[];
  };
};

export default function PlanOverviewMap({ planData }: PlanOverviewMapProps) {
  const points = extractPlanMapPoints(planData);
  const googleUrl = buildGoogleViewAllUrl(points);
  if (!googleUrl || points.length === 0) return null;

  const label =
    points.length === 1
      ? 'View place on map'
      : `View all ${points.length} places on map`;

  return (
    <a
      href={googleUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="guest-btn-action mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl border border-[#0B4F5C]/15 bg-[#0B4F5C] px-4 py-4 text-base font-semibold text-white shadow-[0_4px_16px_rgba(11,79,92,0.2)] transition-colors hover:bg-[#0a4550] min-h-[48px]"
    >
      <MapPin size={18} className="shrink-0 text-[#C5A059]" />
      <span>{label}</span>
      <ExternalLink size={15} className="shrink-0 opacity-75" />
    </a>
  );
}
