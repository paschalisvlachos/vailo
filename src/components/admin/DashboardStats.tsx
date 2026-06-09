import type { ReactNode } from 'react';
import {
  Building2,
  Users,
  Layers,
  UserCheck,
  AlertTriangle,
  MapPin,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminCard } from './AdminPageHeader';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { adminPath } from '../../lib/adminRoutes';

const TEAL = '#0b4f5c';
const GOLD = '#c5a059';
const TEAL_LIGHT = '#0a6574';
const PIE_COLORS = [TEAL, GOLD, TEAL_LIGHT, '#8a6d2e'];

function formatUsd(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Building2;
}) {
  return (
    <AdminCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold text-vailo-dark mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className="admin-icon-box shrink-0">
          <Icon size={18} />
        </div>
      </div>
    </AdminCard>
  );
}

function ChartCard({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard className={`p-4 sm:p-6 ${className}`}>
      <h3 className="text-sm font-bold text-vailo-dark font-luxury">{title}</h3>
      {description && <div className="text-xs text-gray-500 mt-1 mb-4">{description}</div>}
      {!description && <div className="mb-4" />}
      {children}
    </AdminCard>
  );
}

function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  color = TEAL,
}: {
  data: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey])), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const value = Number(item[valueKey]);
        const pct = (value / max) * 100;
        return (
          <div key={String(item[labelKey])}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs text-gray-600 truncate" title={String(item[labelKey])}>
                {item[labelKey]}
              </span>
              <span className="text-xs font-bold text-vailo-dark tabular-nums shrink-0">{value}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerticalBarChart({
  data,
  labelKey,
  valueKey,
  colors,
}: {
  data: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
  colors?: string[];
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  const chartHeight = 160;

  return (
    <div className="flex items-end justify-center gap-6 sm:gap-10 pt-2" style={{ height: chartHeight + 48 }}>
      {data.map((item, i) => {
        const value = Number(item[valueKey]);
        const barHeight = value === 0 ? 0 : Math.max((value / max) * chartHeight, 8);
        const fill = colors?.[i] ?? TEAL;
        return (
          <div key={String(item[labelKey])} className="flex flex-col items-center gap-2 min-w-0 flex-1 max-w-28">
            <span className="text-sm font-bold text-vailo-dark tabular-nums">{value}</span>
            <div className="w-full flex justify-center items-end" style={{ height: chartHeight }}>
              <div
                className="w-10 sm:w-14 rounded-t-lg transition-all duration-500"
                style={{ height: barHeight, backgroundColor: fill }}
                title={`${item[labelKey]}: ${value}`}
              />
            </div>
            <span className="text-[11px] text-gray-500 text-center leading-tight">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({
  data,
  colors = PIE_COLORS,
}: {
  data: { name: string; value: number }[];
  colors?: string[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const start = (cumulative / total) * 360;
    cumulative += d.value;
    const end = (cumulative / total) * 360;
    return { ...d, start, end, color: colors[i % colors.length] };
  });

  const r = 40;
  const cx = 50;
  const cy = 50;

  function arcPath(startAngle: number, endAngle: number, inner: number, outer: number) {
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const x1 = cx + outer * Math.cos(toRad(startAngle));
    const y1 = cy + outer * Math.sin(toRad(startAngle));
    const x2 = cx + outer * Math.cos(toRad(endAngle));
    const y2 = cy + outer * Math.sin(toRad(endAngle));
    const x3 = cx + inner * Math.cos(toRad(endAngle));
    const y3 = cy + inner * Math.sin(toRad(endAngle));
    const x4 = cx + inner * Math.cos(toRad(startAngle));
    const y4 = cy + inner * Math.sin(toRad(startAngle));
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
      <svg viewBox="0 0 100 100" className="w-40 h-40 shrink-0">
        {segments.map((seg) => (
          <path
            key={seg.name}
            d={arcPath(seg.start, seg.end - 0.5, r - 14, r)}
            fill={seg.color}
          />
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-vailo-dark text-[10px] font-bold">
          {total}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-gray-500 text-[5px]">
          total
        </text>
      </svg>
      <ul className="space-y-2">
        {segments.map((seg) => (
          <li key={seg.name} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-gray-600">{seg.name}</span>
            <span className="font-bold text-vailo-dark tabular-nums ml-auto">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineChart({
  data,
  valueKey,
  labelKey,
  color = GOLD,
}: {
  data: Record<string, string | number>[];
  valueKey: string;
  labelKey: string;
  color?: string;
}) {
  const values = data.map((d) => Number(d[valueKey]));
  const max = Math.max(...values, 1);
  const width = 100;
  const height = 60;
  const padding = 4;

  const points = values.map((v, i) => {
    const x = padding + (i / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (v / max) * (height - padding * 2);
    return { x, y, v, label: String(data[i][labelKey]) };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={padding}
            y1={height - padding - frac * (height - padding * 2)}
            x2={width - padding}
            y2={height - padding - frac * (height - padding * 2)}
            stroke="#e5e7eb"
            strokeWidth="0.3"
            strokeDasharray="1 1"
          />
        ))}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r="1.8" fill={color} />
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        {points.map((p) => (
          <div key={p.label} className="text-center min-w-0 flex-1">
            <p className="text-[10px] text-gray-400 truncate">{p.label}</p>
            <p className="text-xs font-bold text-vailo-dark tabular-nums">{p.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardStats() {
  const { stats, loading } = useDashboardStats();

  if (loading) {
    return (
      <section className="mt-2">
        <p className="text-sm text-gray-500 py-8 text-center">Loading platform statistics…</p>
      </section>
    );
  }

  const portfolioMix = [
    { name: 'Hotels', value: stats.hotelCount },
    { name: 'Properties', value: stats.villaCount },
  ].filter((d) => d.value > 0);

  const discoveredPipeline = [
    { status: 'Needs review', count: stats.discoveredNew },
    { status: 'Reviewed', count: stats.discoveredReviewed },
  ];

  const guestActivity = [
    { label: 'In stay now', count: stats.guestsInStay },
    { label: 'Next 30 days', count: stats.upcomingGuests },
    { label: 'Configured total', count: stats.totalHouseGuests },
  ];

  const hasAreaData = stats.areaBreakdown.length > 0;
  const hasUsageHistory = stats.usageHistory.some((m) => m.magicFill > 0);

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-vailo-dark font-luxury">Platform statistics</h3>
        <p className="text-sm text-gray-500 mt-1">
          Live snapshot across properties, guests, area data, and API usage.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Properties" value={stats.propertyCount} icon={Building2} />
        <KpiCard label="Listings" value={stats.listingCount} sub="Units across portfolio" icon={Layers} />
        <KpiCard
          label="Owners"
          value={stats.ownerCount}
          sub={`${stats.activeOwnerCount} active`}
          icon={Users}
        />
        <KpiCard
          label="Guests in stay"
          value={stats.guestsInStay}
          sub={`${stats.upcomingGuests} arriving soon`}
          icon={UserCheck}
        />
        <KpiCard
          label="Open issues"
          value={stats.openGuestIssues}
          sub={
            stats.unseenGuestIssues > 0
              ? `${stats.unseenGuestIssues} unseen`
              : 'All seen by host'
          }
          icon={AlertTriangle}
        />
        <KpiCard
          label="Places to review"
          value={stats.discoveredNew}
          sub={`${stats.discoveredReviewed} already reviewed`}
          icon={MapPin}
        />
        <KpiCard
          label="Magic Fill calls"
          value={stats.magicFill}
          sub={`${formatUsd(stats.magicFillEstimatedCost)} est. this month`}
          icon={Sparkles}
        />
        <KpiCard
          label="House guests"
          value={stats.totalHouseGuests}
          sub="With complete booking details"
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {hasAreaData && (
          <ChartCard
            title="Portfolio by area"
            description="Properties grouped by location"
          >
            <HorizontalBarChart
              data={stats.areaBreakdown.map((d) => ({ area: d.area, count: d.count }))}
              labelKey="area"
              valueKey="count"
            />
          </ChartCard>
        )}

        {portfolioMix.length > 0 && (
          <ChartCard
            title="Portfolio mix"
            description="Hotels vs standalone properties"
          >
            <DonutChart data={portfolioMix} />
          </ChartCard>
        )}

        <ChartCard
          title="Discovered places pipeline"
          description={
            stats.discoveredNew > 0 ? (
              <Link to={adminPath('/area')} className="text-vailo-teal hover:underline font-medium">
                Review in Area data →
              </Link>
            ) : (
              'AI-discovered places awaiting promotion to Local Gems'
            )
          }
        >
          <VerticalBarChart
            data={discoveredPipeline.map((d) => ({ status: d.status, count: d.count }))}
            labelKey="status"
            valueKey="count"
            colors={[GOLD, TEAL]}
          />
        </ChartCard>

        <ChartCard
          title="Guest activity"
          description="House guests with complete details on active bookings"
        >
          <VerticalBarChart
            data={guestActivity.map((d) => ({ label: d.label, count: d.count }))}
            labelKey="label"
            valueKey="count"
            colors={[TEAL_LIGHT, TEAL, GOLD]}
          />
        </ChartCard>

        <ChartCard
          title="Magic Fill API usage"
          description="Google Places lookups — last 6 months"
          className="lg:col-span-2"
        >
          {hasUsageHistory ? (
            <LineChart
              data={stats.usageHistory.map((m) => ({ label: m.label, magicFill: m.magicFill }))}
              labelKey="label"
              valueKey="magicFill"
            />
          ) : (
            <p className="text-sm text-gray-500 py-10 text-center">
              No Magic Fill usage recorded yet this period.
            </p>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
