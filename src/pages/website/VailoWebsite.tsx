/**
 * Vailo marketing website (vailo.app)
 * ===========================================================================
 * Multi-page SaaS site built with React + TypeScript + Tailwind + Lucide + Framer Motion.
 *
 * Everything lives in this one file so it is easy to preview and review. It is organised in
 * self-contained, banner-commented sections so splitting it later is a copy/paste job:
 *
 *   1. Config & content   -> `content.ts`
 *   2. UI primitives      -> `components/ui.tsx`
 *   3. Layout             -> `components/SiteHeader.tsx`, `SiteFooter.tsx`, `WebsiteLayout.tsx`
 *   4. Sections           -> `sections/Hero.tsx`, `GuestJourney.tsx`, `RoiCalculator.tsx`,
 *                            `FeaturesGrid.tsx`, `PricingSection.tsx`, ...
 *   5. Pages              -> `pages/HomePage.tsx`, `FeaturesPage.tsx`, `PricingPage.tsx`, ...
 *
 * Routing is wired in `src/App.tsx` (WebsiteLayout is a layout route; pages render in its <Outlet />).
 * Brand tokens (`vailo-dark`, `vailo-teal`, `vailo-gold`, ...) come from `src/index.css`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CalendarCheck,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Coffee,
  Compass,
  ChartColumn,
  Copy,
  DoorOpen,
  ExternalLink,
  Flame,
  Globe,
  Handshake,
  KeyRound,
  Lightbulb,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Car,
  Menu,
  MessageCircle,
  MonitorSmartphone,
  MousePointerClick,
  Percent,
  QrCode,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Ticket,
  Trees,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Waves,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import { getPlatformLegalTemplate } from '../../lib/platformLegalDefaults';
import { legalContentIsEmpty, sanitizeLegalHtml } from '../../lib/legalHtml';
import { PLANS, ROI, calcRoi, pickPlan, planAnnualTotal, type Plan } from '../../lib/websiteRoi';

/* ===========================================================================
 * 1. CONFIG & CONTENT
 * ========================================================================= */

const CONTACT_EMAIL = 'info@vailo.app';

/** Live guest-portal demo (same URL used on the previous marketing site). */
const LIVE_DEMO_HREF =
  '/vailo-demo/villa-vailo?typeId=Kjtkq2IVUEB84CQAo30B&adminPreview=1&previewFrame=mobile';

const HERO_BENEFITS = [
  'Answers guests instantly and save up to 70% on management time',
  'Personalized experiences recommended by locals',
  'promote your featured partnerships (i.e car rentals)',
  'Get commissions from built-in excursion bookings',
  'Upgrade your property and guest experience',
  'booking and airbnb AI messages',
  'online check-in for guests before arrival',
  'Guest activity and request analytics',
] as const;

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/pricing', label: 'Pricing', end: false },
  { to: '/impact', label: 'Impact', end: false },
  { to: '/tour-providers', label: 'Tour Providers', end: false },
  { to: '/contact', label: 'Contact', end: false },
] as const;

/** Simple breakdown of the home hero thesis + benefit set. */
const IMPACT_SYSTEM = [
  {
    id: '1',
    claim: 'Effortless for you. Perfect for your guests.',
    variable: 'Your work vs guest happiness',
    definition:
      'You spend less time on the same guest questions. Guests find answers themselves. Both use the same House Guide.',
    measure: 'Fewer messages for you · Guests solve problems without calling you',
  },
  {
    id: '2',
    claim: 'Automated access from booking day to checkout.',
    variable: 'How long guests can use Vailo',
    definition:
      'Guests get a private link when they book — not only when they arrive. They can use Vailo until checkout. The QR code at the property opens the same portal.',
    measure: 'Days of access before arrival · Guests who open Vailo early',
  },
  {
    id: '3',
    claim: 'Boost your revenue with early visitor access.',
    variable: 'Time to book before arrival',
    definition:
      'More days before check-in means more time to book tours and your partners. On Vailo tours you keep 1/3 of our margin. On your own partners you keep 100% of your margin.',
    measure: 'Bookings before arrival · Extra income per property each month',
  },
] as const;

const IMPACT_CAPABILITIES = [
  {
    n: '01',
    claim: 'Answers guests instantly and save up to 70% on management time',
    lever: 'Your team time',
    kpi: 'Up to 70% less time on repeat guest questions',
    unit: 'Hours per guest · Inbox messages',
    mechanism:
      'The AI answers day and night from your House Guide. Common questions (Wi-Fi, lockbox, oven, checkout) do not need a person. You only handle special cases.',
    formula: 'Time saved = common questions × time per answer × how often AI handles them',
  },
  {
    n: '02',
    claim: 'Personalized experiences recommended by locals',
    lever: 'Better local tips',
    kpi: 'Local tips that fit the stay, not generic lists',
    unit: 'Clicks per stay · Saved places',
    mechanism:
      'Live Like a Local shows places and activities near your property. Guests discover more without you writing a new list for every stay.',
    formula: 'More useful tips → more guest interest in your area',
  },
  {
    n: '03',
    claim: 'Promote your featured partnerships (i.e. car rentals)',
    lever: 'Your partner income',
    kpi: 'You keep 100% of your partner margin',
    unit: 'Partner bookings · Margin in €',
    mechanism:
      'Your partners (cars, transfers, and more) appear in the guest portal. Vailo does not take a cut. Early access simply gives guests more time to book them.',
    formula: 'Your partner income = bookings × your full margin',
  },
  {
    n: '04',
    claim: 'Get commissions from built-in excursion bookings',
    lever: 'Tour income share',
    kpi: 'You get 1/3 of Vailo’s tour margin',
    unit: '€ per booking',
    mechanism:
      'Guests book Vailo tours inside the portal. We earn a margin on the booking (for example 10%). You get 1/3 of that margin — not 1/3 of the full ticket price.',
    formula: 'Your € = ticket price × margin % × 1/3',
  },
  {
    n: '05',
    claim: 'Upgrade your property and guest experience',
    lever: 'Guest experience quality',
    kpi: 'More answers ready · Fewer arrival problems',
    unit: 'House Guide coverage · Guest issues',
    mechanism:
      'Setup is guided once. Analytics show what is missing. Guests get clearer rules and fewer problems — without hiring more staff.',
    formula: 'Better guide → fewer unanswered questions → smoother stays',
  },
  {
    n: '06',
    claim: 'Booking and Airbnb AI messages',
    lever: 'Faster replies',
    kpi: 'Quicker answers on booking channels',
    unit: 'Reply time · Questions covered',
    mechanism:
      'AI helps you answer Booking.com and Airbnb messages faster. Routine questions clear quickly. Answers stay based on your property information.',
    formula: 'Faster drafts → better response time for guests',
  },
  {
    n: '07',
    claim: 'Online check-in for guests before arrival',
    lever: 'Arrival workload',
    kpi: 'Guests who check in before they arrive',
    unit: '% of stays checked in early',
    mechanism:
      'Guests fill in stay details in the portal before they arrive. Less waiting at the door. Fewer calls for you on arrival day.',
    formula: 'Early check-in → less work at the door',
  },
  {
    n: '08',
    claim: 'Guest activity and request analytics',
    lever: 'Clear stay insights',
    kpi: 'See what guests used and asked',
    unit: 'Portal visits · AI questions · Local picks · Tour bookings',
    mechanism:
      'In Vailo admin, each property has Analytics. You see portal use, AI questions, local picks, and tour bookings — stay by stay. Use this to improve the next booking.',
    formula: 'Real guest activity → better House Guide and offers next time',
  },
] as const;

/** In-page anchors on the marketing home page (order matches section order). */
const HOME_SECTION_LINKS = [
  { hash: 'how-you-earn', label: 'How you earn' },
  { hash: 'how-vailo-works', label: 'How Vailo works' },
  { hash: 'guest-journey', label: 'The guest journey' },
  { hash: 'roi', label: 'ROI calculator' },
  { hash: 'your-team', label: 'Your team' },
  { hash: 'for-hosts', label: 'Built for hosts' },
  { hash: 'property-analytics', label: 'Property analytics' },
] as const;

/** Why property owners benefit from Vailo admin Analytics. */
const PROPERTY_ANALYTICS_HOST_BENEFITS = [
  {
    title: 'Stop guessing what guests need',
    text: 'You see real questions and portal use — not only complaints after checkout.',
  },
  {
    title: 'Improve the next stay, not only this one',
    text: 'Fix House Guide gaps and weak local tips before the next booking arrives.',
  },
  {
    title: 'Protect your time and reviews',
    text: 'Fewer repeat messages and clearer arrival info mean calmer ops and happier guests.',
  },
  {
    title: 'Grow partner and tour income',
    text: 'See which offers guests open and book, so you promote what actually works.',
  },
] as const;

/** Headline KPIs shown at the top of Property → Analytics in Vailo admin. */
const PROPERTY_ANALYTICS_KPIS = [
  { label: 'Sessions active', meaning: 'Stays that used the portal' },
  { label: 'Portal visits', meaning: 'How many times guests opened it' },
  { label: 'Live Like a Local', meaning: 'Local discovery opens' },
  { label: 'Assistant turns', meaning: 'AI House Guide questions' },
  { label: 'Excursions opened', meaning: 'Tour browsing started' },
  { label: 'Excursion bookings', meaning: 'Bookings completed in-portal' },
] as const;

/** Deeper metrics tracked per property in Vailo admin Analytics. */
const PROPERTY_ANALYTICS_METRICS = [
  {
    icon: ChartColumn,
    title: 'Who is using the portal',
    text: 'Active sessions and portal visits tell you which bookings actually opened Vailo — and which never did.',
    action: 'Follow up on quiet stays or improve the guest link / QR placement.',
  },
  {
    icon: Bot,
    title: 'What guests ask the AI',
    text: 'Assistant turns (and AI expert turns) show the questions your House Guide is answering — or failing to cover.',
    action: 'Add missing Wi-Fi, appliance, or checkout answers before the next arrival.',
  },
  {
    icon: Compass,
    title: 'What they explore locally',
    text: 'Live Like a Local opens, saved picks, and gem impressions show what guests care about in your area.',
    action: 'Feature stronger local partners and gems that match real interest.',
  },
  {
    icon: Ticket,
    title: 'How tours convert',
    text: 'Full excursion funnel: opens → detail views → booking starts → completed bookings, per stay.',
    action: 'Fix weak listings or push high-interest tours earlier from booking day.',
  },
  {
    icon: BookOpen,
    title: 'Which House Guide parts they open',
    text: 'Accordion opens show which guide sections guests actually expand during the stay.',
    action: 'Rewrite thin sections and promote the ones guests rely on.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Per-stay timeline',
    text: 'Open any booking or visitor: first/last seen, device, and the event timeline of that stay.',
    action: 'Diagnose a single guest journey instead of guessing from inbox noise.',
  },
] as const;

/** Headline statistics used on Impact (aligned with ROI model + product economics). */
const SITE_STATS = [
  {
    kind: 'number' as const,
    value: 70,
    suffix: '%',
    label: 'Less time on repeat guest questions',
    detail: 'Common stay questions answered from your House Guide',
  },
  {
    kind: 'number' as const,
    value: ROI.hoursSavedPerGuest,
    decimals: 1,
    suffix: 'h',
    label: 'Hours saved per guest',
    detail: 'Less messaging work for you or your team',
  },
  {
    kind: 'text' as const,
    display: '1/3',
    label: 'Of Vailo tour margin goes to you',
    detail: 'This is a share of our margin, not the full ticket price',
  },
  {
    kind: 'number' as const,
    value: 100,
    suffix: '%',
    label: 'Of your partner margin stays yours',
    detail: 'Cars, transfers, and partners you already work with',
  },
  {
    kind: 'text' as const,
    display: '24/7',
    label: 'AI answers any time of day',
    detail: 'From the day guests book until they check out',
  },
  {
    kind: 'number' as const,
    value: 49,
    prefix: '€',
    label: 'From this price per property / year',
    detail: 'Lower price per property when you manage more homes',
  },
] as const;

/** Reference portfolio used to illustrate model outputs (same assumptions as the ROI calculator). */
const STATS_REFERENCE_GUESTS = 100;

const SECTION_PAD = 'py-20 sm:py-28';
const SECTION_PAD_COMPACT = 'py-12 sm:py-16';
const SECTION_SCROLL_MT = 'scroll-mt-24';

const PLAN_INCLUDES = [
  'Setup once: automated, effortless, fast',
  'Auto guest link from booking day to checkout',
  'On-property QR poster, A5 or A4',
  '1/3 of Vailo’s excursion margin to you',
  '100% of your featured-partner margins',
];

type Feature = {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  detail: string[];
};

const FEATURES: Feature[] = [
  {
    id: 'assistant',
    icon: Bot,
    title: '24/7 AI Property Assistant',
    blurb:
      'Automated guest support built on your House Guide. Appliances, Wi-Fi, check-out rules, answered instantly, day or night.',
    detail: [
      'Answers come from your own House Guide, not guesswork',
      'Guests open their private link from booking day, or scan the QR on arrival',
      'Spot the questions your guide is missing and fill the gaps',
    ],
  },
  {
    id: 'local',
    icon: Compass,
    title: 'Live Like a Local',
    blurb:
      'Your AI expert curates hidden gems around the property, so guests eat, drink and explore like the locals do.',
    detail: [
      'Authentic spots near the property, not tourist traps',
      'Personal picks guests can save for later',
      'Add your own favourites alongside the AI’s suggestions',
    ],
  },
  {
    id: 'excursions',
    icon: Globe,
    title: 'Global Excursions',
    blurb:
      'Guests can book tours and experiences from booking day. On Vailo-supplied bookings you earn 1/3 of our margin; on your featured partners you keep 100% of your agreed margin.',
    detail: [
      'Access from booking day means more time to book before they arrive',
      'Vailo excursions: 1/3 of our commission margin goes to you (not of the ticket price)',
      'Your featured partners: you keep the full margin you agreed with them',
    ],
  },
  {
    id: 'checkin',
    icon: ClipboardCheck,
    title: 'Automated Check-in',
    blurb:
      'Collect arrival details before guests even land: arrival time, party details and special requests, hands-free.',
    detail: [
      'Pre-arrival form available as soon as they have the link from booking day',
      'Everything arrives in one place, ready for your welcome',
      'Fewer back-and-forth messages the day of arrival',
    ],
  },
];

/* ---- Pure helpers ------------------------------------------------------- */

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const formatInt = (n: number) => Math.round(n).toLocaleString('en-US');

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [title, description]);
}

/* ===========================================================================
 * 2. UI PRIMITIVES
 * ========================================================================= */

const EASE = [0.22, 1, 0.36, 1] as const;

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

/** Fade + rise on scroll. */
function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em]',
        light
          ? 'bg-white/10 text-vailo-gold ring-1 ring-white/15'
          : 'bg-vailo-teal/8 text-vailo-teal ring-1 ring-vailo-teal/10'
      )}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** High-contrast readout for the one-time setup promise. */
function SetupEaseLine({
  light,
  align = 'left',
  className,
}: {
  light?: boolean;
  align?: 'center' | 'left';
  className?: string;
}) {
  const word = light ? 'text-vailo-gold' : 'text-vailo-teal';
  const sep = light ? 'text-white/40' : 'text-vailo-dark/30';
  return (
    <p
      className={cx(
        'font-luxury text-[1.35rem] font-semibold leading-snug tracking-tight sm:text-[1.55rem]',
        !className && (align === 'center' ? 'text-center' : 'text-left'),
        className
      )}
    >
      <span className={word}>Automated</span>
      <span className={sep}>, </span>
      <span className={word}>effortless</span>
      <span className={sep}>, </span>
      <span className={word}>fast</span>
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  easeLine,
  light,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shows “Automated, effortless, fast” under the title for setup messaging. */
  easeLine?: boolean;
  light?: boolean;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cx('max-w-3xl', align === 'center' ? 'mx-auto text-center' : 'text-left')}>
      {eyebrow && <Eyebrow light={light}>{eyebrow}</Eyebrow>}
      <h2
        className={cx(
          'font-luxury mt-5 text-3xl font-medium leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]',
          light ? 'text-white' : 'text-vailo-dark'
        )}
      >
        {title}
      </h2>
      {easeLine && (
        <div className="mt-4">
          <SetupEaseLine light={light} align={align} />
        </div>
      )}
      {subtitle && (
        <div
          className={cx(
            'text-base leading-relaxed sm:text-lg',
            easeLine ? 'mt-3' : 'mt-4',
            light ? 'text-white/70' : 'text-vailo-dark/65'
          )}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'glass';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'group inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vailo-gold/40 disabled:pointer-events-none disabled:opacity-60';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-[#d9b66f] to-vailo-gold text-vailo-dark shadow-[0_10px_28px_-8px_rgba(197,160,89,0.75)] hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-8px_rgba(197,160,89,0.9)]',
  secondary:
    'bg-white text-vailo-dark shadow-sm ring-1 ring-vailo-dark/10 hover:-translate-y-0.5 hover:ring-vailo-teal/40 hover:shadow-md',
  dark: 'bg-vailo-dark text-white shadow-lg shadow-vailo-dark/20 hover:-translate-y-0.5 hover:bg-vailo-teal',
  glass: 'bg-white/10 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2.5 text-sm',
  md: 'px-5 py-3 text-sm',
  lg: 'px-7 py-4 text-base',
};

function Button({
  children,
  to,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled,
  target,
}: {
  children: ReactNode;
  to?: string;
  /** Full-page / external navigation (guest demo, admin login). */
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  target?: string;
}) {
  const classes = cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        onClick={onClick}
        className={classes}
      >
        {children}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

function IconTile({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-vailo-teal to-vailo-teal-light text-white shadow-lg shadow-vailo-teal/25',
        className
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </span>
  );
}

/** Count-up number that springs to its new value. */
function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.7 });
  const text = useTransform(spring, (v) => {
    const n =
      decimals > 0
        ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : formatInt(v);
    return `${prefix}${n}${suffix}`;
  });
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/* ===========================================================================
 * 3. LAYOUT — header, footer, shell
 * ========================================================================= */

function ExploreDesktopMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
          open ? 'bg-vailo-teal/10 text-vailo-teal' : 'text-vailo-dark/70 hover:text-vailo-dark'
        )}
      >
        Explore
        <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="On the home page"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-2xl bg-white p-2 shadow-[0_24px_50px_-20px_rgba(5,31,38,0.35)] ring-1 ring-vailo-dark/8"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-vailo-dark/40">
              On the home page
            </p>
            {HOME_SECTION_LINKS.map((link) => (
              <Link
                key={link.hash}
                role="menuitem"
                to={{ pathname: '/', hash: link.hash }}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-vailo-dark/75 transition hover:bg-vailo-teal/10 hover:text-vailo-teal"
              >
                {link.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SiteHeader() {
  const { pathname } = useLocation();
  // Keyed by pathname so the mobile menu closes automatically after navigating.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const reduce = useReducedMotion();

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-[0_8px_28px_-16px_rgba(5,31,38,0.28)]">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <Link to="/" className="flex items-center" aria-label="Vailo home">
            <img src="/vailoLogo.png" alt="Vailo" className="h-9 w-auto sm:h-10" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <div key={link.to} className="contents">
                <NavLink to={link.to} end={link.end} className="relative rounded-xl px-4 py-2 text-sm font-semibold">
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-active-pill"
                          className="absolute inset-0 rounded-xl bg-vailo-teal/10"
                          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span
                        className={cx(
                          'relative transition-colors',
                          isActive ? 'text-vailo-teal' : 'text-vailo-dark/70 hover:text-vailo-dark'
                        )}
                      >
                        {link.label}
                      </span>
                    </>
                  )}
                </NavLink>
                {link.to === '/' && <ExploreDesktopMenu />}
              </div>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button to="/contact?intent=demo" size="sm" className="px-3 sm:px-5">
              Book a Demo
            </Button>
            <Button href={LIVE_DEMO_HREF} variant="secondary" size="sm" className="hidden px-3 sm:inline-flex sm:px-5">
              Try guest demo
            </Button>
            <button
              type="button"
              onClick={() => setOpenFor(open ? null : pathname)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-vailo-dark transition hover:bg-vailo-dark/5 lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right-to-left vertical slide-over drawer (mobile) */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
            <motion.button
              type="button"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-vailo-dark/45 backdrop-blur-sm"
              onClick={() => setOpenFor(null)}
            />
            <motion.nav
              id="mobile-nav"
              aria-label="Mobile"
              initial={reduce ? { opacity: 0 } : { x: '100%' }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="absolute inset-y-0 right-0 flex w-[min(100%,20rem)] flex-col bg-white shadow-[-20px_0_50px_-20px_rgba(5,31,38,0.35)]"
            >
              <div className="flex items-center justify-between border-b border-vailo-dark/8 px-4 py-3.5">
                <img src="/vailoLogo.png" alt="Vailo" className="h-8 w-auto" />
                <button
                  type="button"
                  onClick={() => setOpenFor(null)}
                  aria-label="Close menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-vailo-dark transition hover:bg-vailo-dark/5"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {NAV_LINKS.map((link, i) => (
                  <motion.div
                    key={link.to}
                    initial={reduce ? false : { opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04, duration: 0.28, ease: EASE }}
                  >
                    <NavLink
                      to={link.to}
                      end={link.end}
                      onClick={() => setOpenFor(null)}
                      className={({ isActive }) =>
                        cx(
                          'block rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors',
                          isActive ? 'bg-vailo-teal/10 text-vailo-teal' : 'text-vailo-dark/80 hover:bg-vailo-dark/5'
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                    {link.to === '/' && (
                      <div className="mt-2 mb-1 rounded-2xl bg-vailo-dark/[0.03] px-2 py-2">
                        <p className="px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-vailo-dark/40">
                          Explore · On the home page
                        </p>
                        {HOME_SECTION_LINKS.map((section) => (
                          <Link
                            key={section.hash}
                            to={{ pathname: '/', hash: section.hash }}
                            onClick={() => setOpenFor(null)}
                            className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-vailo-dark/70 transition hover:bg-vailo-teal/10 hover:text-vailo-teal"
                          >
                            {section.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              <div className="space-y-2 border-t border-vailo-dark/8 p-4">
                <Button to="/contact?intent=demo" size="lg" className="w-full" onClick={() => setOpenFor(null)}>
                  Book a Demo
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </Button>
                <Button
                  href={LIVE_DEMO_HREF}
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={() => setOpenFor(null)}
                >
                  Try guest demo
                  <ExternalLink className="h-4 w-4 opacity-70" aria-hidden />
                </Button>
              </div>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-vailo-dark text-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-vailo-teal/40 blur-3xl" />
      <Container className="relative py-14 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <img src="/vailoLogo.png" alt="Vailo" className="h-10 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              The AI-driven digital concierge for vacation rentals and boutique hotels. Your guests’ local best friend,
              your ultimate co-host.
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { to: '/impact', label: 'Impact' },
              { to: '/features', label: 'Features' },
              { to: '/pricing', label: 'Pricing' },
              { to: '/tour-providers', label: 'Tour Providers' },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { to: '/contact', label: 'Contact' },
              { to: '/contact?intent=demo', label: 'Book a Demo' },
            ]}
          />
          <FooterColumn
            title="Legal & access"
            links={[
              { to: '/privacy', label: 'Privacy' },
              { to: '/terms', label: 'Terms' },
              { to: '/admin', label: 'Host Login', hardNav: true },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center">
          <p>© 2026 Vailo. All rights reserved.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 transition hover:text-white">
            <Mail className="h-4 w-4" aria-hidden />
            {CONTACT_EMAIL}
          </a>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { to: string; label: string; hardNav?: boolean }[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-vailo-gold">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-white/70 transition hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEBSITE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

/** Layout route: sticky header + page outlet + footer. */
export function WebsiteLayout() {
  const { pathname, hash } = useLocation();

  // Load the marketing fonts only when the public website is shown.
  useEffect(() => {
    if (document.querySelector(`link[href="${WEBSITE_FONTS_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = WEBSITE_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  // Scroll to top on page change (or to the #hash target when present).
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [pathname, hash]);

  return (
    <div
      className="min-h-screen bg-white text-vailo-dark antialiased"
      style={{ fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' }}
    >
      <SiteHeader />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="-mt-[76px]"
      >
        <Outlet />
      </motion.main>
      <SiteFooter />
    </div>
  );
}

/* ===========================================================================
 * 4a. SECTION — HERO (+ floating phone mockup)
 * ========================================================================= */

type ChatLine = { from: 'guest' | 'ai'; text: ReactNode };

type HeroScenario = {
  id: string;
  guest: string;
  ai: ReactNode;
};

/** Four realistic House Guide scenarios cycled on the hero phone. */
const HERO_SCENARIOS: HeroScenario[] = [
  {
    id: 'washer',
    guest: 'The washing machine does not work.',
    ai: (
      <>
        <p className="font-semibold">Bosch Serie 6, WAT28460</p>
        <ol className="mt-1.5 space-y-1 text-[12px] text-vailo-dark/80">
          <li>
            <b className="text-vailo-teal">1.</b> Open the door fully, it locks if the drum is still spinning
          </li>
          <li>
            <b className="text-vailo-teal">2.</b> Turn the dial to <b>Cotton 40°C</b>, then press <b>Start</b>
          </li>
          <li>
            <b className="text-vailo-teal">3.</b> If it beeps E18: clean the filter under the front flap (coin tray)
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-vailo-dark/55">Detergent: drawer left, softener: middle</p>
      </>
    ),
  },
  {
    id: 'power',
    guest: 'There is no electricity and I cannot open the garage door.',
    ai: (
      <>
        <p className="font-semibold">Power + garage override</p>
        <ol className="mt-1.5 space-y-1 text-[12px] text-vailo-dark/80">
          <li>
            <b className="text-vailo-teal">1.</b> Check the main breaker in the hallway cupboard (left of entrance)
          </li>
          <li>
            <b className="text-vailo-teal">2.</b> Flip any red switch back up, label <b>Garage / Gate</b>
          </li>
          <li>
            <b className="text-vailo-teal">3.</b> Manual garage: pull the red cord on the motor, then lift the door
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-vailo-dark/55">Still dark? Call host from Contacts in the portal.</p>
      </>
    ),
  },
  {
    id: 'garbage',
    guest: 'Where can I throw the garbage?',
    ai: (
      <>
        <p className="font-semibold">Bins by the garden gate</p>
        <ul className="mt-1.5 space-y-1 text-[12px] text-vailo-dark/80">
          <li>
            <b className="text-vailo-teal">Grey</b>, general waste
          </li>
          <li>
            <b className="text-vailo-teal">Blue</b>, paper & cardboard
          </li>
          <li>
            <b className="text-vailo-teal">Yellow</b>, plastic & cans
          </li>
          <li>
            <b className="text-vailo-teal">Green</b>, glass (next to the olive tree)
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-vailo-dark/55">Collection: Mon, Wed, Fri mornings</p>
      </>
    ),
  },
  {
    id: 'wifi',
    guest: 'What is the Wi-Fi password?',
    ai: (
      <>
        <p className="font-semibold">Wi-Fi details</p>
        <p className="mt-1.5 text-[12px] text-vailo-dark/80">
          Network: <b>Villa_Sunset_5G</b>
        </p>
        <p className="mt-1 text-[12px] text-vailo-dark/80">
          Password: <b>sunsetvilla26</b>
        </p>
        <p className="mt-2 text-[11px] text-vailo-dark/55">Copy it from the Wi-Fi card on Stay → Essentials.</p>
      </>
    ),
  },
];

function useScenarioSequence(scenarios: HeroScenario[]) {
  const reduce = useReducedMotion();
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [phase, setPhase] = useState<'empty' | 'guest' | 'typing' | 'ai'>(reduce ? 'ai' : 'empty');

  useEffect(() => {
    if (reduce) {
      setPhase('ai');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;

    const run = () => {
      if (cancelled) return;
      setScenarioIndex(i);
      setPhase('empty');
      timer = setTimeout(() => {
        if (cancelled) return;
        setPhase('guest');
        timer = setTimeout(() => {
          if (cancelled) return;
          setPhase('typing');
          timer = setTimeout(() => {
            if (cancelled) return;
            setPhase('ai');
            timer = setTimeout(() => {
              if (cancelled) return;
              i = (i + 1) % scenarios.length;
              run();
            }, 4200);
          }, 1400);
        }, 900);
      }, 400);
    };

    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduce, scenarios.length]);

  const scenario = scenarios[scenarioIndex] ?? scenarios[0];
  const lines: ChatLine[] = [];
  if (phase === 'guest' || phase === 'typing' || phase === 'ai') {
    lines.push({ from: 'guest', text: scenario.guest });
  }
  if (phase === 'ai') {
    lines.push({ from: 'ai', text: scenario.ai });
  }
  return { lines, typing: phase === 'typing', scenarioId: scenario.id };
}

function PhoneMockup() {
  const reduce = useReducedMotion();
  const { lines, typing, scenarioId } = useScenarioSequence(HERO_SCENARIOS);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [lines.length, typing, scenarioId]);

  return (
    <div className="relative mx-auto w-[290px] sm:w-[320px]">
      {/* glow */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-gradient-to-tr from-vailo-teal/30 via-cyan-300/20 to-vailo-gold/30 blur-3xl" />

      <motion.div
        animate={reduce ? undefined : { y: [0, -14, 0], rotate: [-1, 1, -1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="relative"
      >
        <div className="rounded-[2.9rem] bg-gradient-to-b from-[#0c2f38] to-vailo-dark p-2.5 shadow-[0_40px_80px_-20px_rgba(5,31,38,0.6),0_0_0_1px_rgba(255,255,255,0.08)_inset]">
          <div className="relative flex h-[580px] flex-col overflow-hidden rounded-[2.35rem] bg-[#f3f6f5] sm:h-[620px]">
            {/* notch + status bar */}
            <div className="absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-vailo-dark" />
            <div className="relative z-10 flex items-center justify-between px-7 pb-1 pt-3 text-[11px] font-semibold text-vailo-dark">
              <span>9:41</span>
              <span className="flex items-center gap-1 opacity-70">
                <Wifi className="h-3 w-3" aria-hidden />
                <span className="h-2 w-4 rounded-sm border border-vailo-dark/60" />
              </span>
            </div>

            {/* chat header */}
            <div className="flex items-center gap-3 border-b border-vailo-dark/5 bg-white/80 px-4 pb-3 pt-4 backdrop-blur">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-vailo-dark">
                <img src="/V.png" alt="" className="h-7 w-7 object-contain" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-vailo-dark">Vailo</p>
                <p className="text-[11px] text-vailo-dark/55">Villa Sunset, House Guide</p>
              </div>
            </div>

            {/* messages — one scenario at a time */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-vailo-dark/35">
                From your House Guide
              </p>
              <AnimatePresence mode="wait">
                <motion.div key={scenarioId} className="space-y-3">
                  {lines.map((m, i) => (
                    <motion.div
                      key={`${scenarioId}-${i}-${m.from}`}
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className={cx('flex', m.from === 'guest' ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cx(
                          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-sm',
                          m.from === 'guest'
                            ? 'rounded-br-md bg-vailo-teal text-white'
                            : 'rounded-bl-md bg-white text-vailo-dark ring-1 ring-vailo-dark/5'
                        )}
                      >
                        {m.text}
                      </div>
                    </motion.div>
                  ))}
                  {typing && (
                    <motion.div
                      key="typing"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex justify-start"
                    >
                      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-vailo-dark/5">
                        {[0, 1, 2].map((d) => (
                          <motion.span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-vailo-teal/60"
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15 }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* quick actions + input */}
            <div className="border-t border-vailo-dark/5 bg-white/80 px-3.5 pb-5 pt-3 backdrop-blur">
              <div className="mb-3 flex gap-2 overflow-hidden">
                {['Appliances', 'Power', 'Wi-Fi'].map((chip) => (
                  <span
                    key={chip}
                    className="whitespace-nowrap rounded-full bg-vailo-teal/8 px-3 py-1.5 text-[11px] font-semibold text-vailo-teal"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-vailo-surface px-3.5 py-2.5">
                <span className="flex-1 text-[13px] text-vailo-dark/40">Ask Vailo anything…</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-vailo-gold text-vailo-dark">
                  <Send className="h-4 w-4" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* floating chips */}
      <FloatChip className="-left-10 top-24 hidden sm:flex" delay={0} icon={BookOpen} tone="gold">
        From House Guide
      </FloatChip>
      <FloatChip className="-right-12 top-[45%] hidden sm:flex" delay={1.2} icon={Clock} tone="teal">
        Answered instantly
      </FloatChip>
      <FloatChip className="-left-6 bottom-20 hidden sm:flex" delay={2.1} icon={Check} tone="teal">
        No host call needed
      </FloatChip>
    </div>
  );
}

function FloatChip({
  children,
  icon: Icon,
  className,
  delay,
  tone,
}: {
  children: ReactNode;
  icon: LucideIcon;
  className?: string;
  delay: number;
  tone: 'gold' | 'teal';
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -10, 0] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
      className={cx(
        'absolute items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-3.5 py-2.5 text-xs font-bold text-vailo-dark shadow-[0_14px_34px_-12px_rgba(5,31,38,0.35)] backdrop-blur-xl',
        className
      )}
    >
      <span
        className={cx(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          tone === 'gold' ? 'bg-vailo-gold/20 text-vailo-gold-muted' : 'bg-vailo-teal/10 text-vailo-teal'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {children}
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative isolate min-h-[min(100svh,920px)] overflow-hidden pb-12 pt-28 sm:pb-16 sm:pt-36">
      <div className="absolute inset-0 z-0">
        <img
          src="/hero-villa-pool.jpg"
          alt=""
          aria-hidden
          className="h-full w-full scale-105 object-cover object-[50%_45%]"
        />
        <div className="absolute inset-0 bg-vailo-dark/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-vailo-dark/92 via-vailo-dark/70 to-vailo-dark/45 sm:via-vailo-dark/60 sm:to-vailo-dark/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-vailo-dark/80 via-vailo-dark/20 to-vailo-dark/45" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
      </div>

      <Container className="relative z-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          {/* Phone first on mobile; text first on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.12, ease: EASE }}
            className="relative order-1 lg:order-2"
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-vailo-teal/25 blur-3xl" />
            <PhoneMockup />
          </motion.div>

          <div className="order-2 text-center lg:order-1 lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: EASE }}
              className="flex flex-wrap items-center justify-center gap-2.5 lg:justify-start"
            >
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-2xl border border-vailo-gold/40 bg-vailo-gold/15 px-4 py-2.5 text-left shadow-[0_10px_30px_-16px_rgba(197,160,89,0.55)] backdrop-blur-md transition hover:bg-vailo-gold/25"
              >
                <span className="text-[13px] font-medium leading-snug text-white/85 sm:text-sm">
                  <span className="font-extrabold tracking-tight text-vailo-gold">€49 / year</span> per property,
                  less as you add more
                </span>
              </Link>
              <Link
                to="/contact?intent=trial"
                className="inline-flex items-center justify-center rounded-2xl border border-vailo-gold/40 bg-vailo-gold/15 px-4 py-2.5 text-left shadow-[0_10px_30px_-16px_rgba(197,160,89,0.55)] backdrop-blur-md transition hover:bg-vailo-gold/25"
              >
                <span className="text-[13px] font-medium leading-snug text-white/85 sm:text-sm">
                  <span className="font-extrabold tracking-tight text-vailo-gold">1 week</span> free trial
                </span>
              </Link>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
              className="font-luxury mt-5 text-[1.94rem] font-medium leading-[1.12] tracking-tight text-white sm:text-[2.025rem] lg:text-[2.75rem]"
            >
              Effortless for you. Perfect for your guests.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/75 sm:text-[18px] lg:mx-0"
            >
              Automated access from booking day to checkout.
              <br />
              Boost your revenue with early visitor access.
            </motion.p>

            <motion.ul
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.22, ease: EASE }}
              className="mx-auto mt-6 grid max-w-xl grid-cols-1 gap-x-10 gap-y-5 rounded-2xl border border-white/20 bg-white/10 p-5 text-left shadow-[0_12px_40px_-20px_rgba(5,31,38,0.45)] backdrop-blur-md sm:grid-cols-2 sm:p-6 lg:mx-0"
            >
              {HERO_BENEFITS.map((label) => (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-vailo-gold/20 text-vailo-gold"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[14.5px] font-medium leading-snug text-white/88">{label}</span>
                </li>
              ))}
            </motion.ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4b. SECTION — INTERACTIVE GUEST JOURNEY ("thought bubbles")
 * ========================================================================= */

/** Shared chrome for the little mobile-UI cards that pop up next to each bubble. */
function PopCard({
  icon: Icon,
  title,
  subtitle,
  onClose,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_70px_-20px_rgba(5,31,38,0.45)] ring-1 ring-vailo-dark/8">
      <div className="flex items-center gap-3 bg-gradient-to-r from-vailo-dark to-vailo-teal px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">{title}</p>
          <p className="truncate text-[11px] text-white/65">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="bg-[#f6f8f7] p-4">{children}</div>
    </div>
  );
}

function GuestMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[88%] rounded-2xl rounded-br-md bg-vailo-teal px-3.5 py-2 text-[13px] leading-snug text-white">
        {children}
      </p>
    </div>
  );
}

function AiMsg({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-vailo-dark">
        <img src="/V.png" alt="" className="h-4 w-4 object-contain" />
      </span>
      <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[13px] leading-snug text-vailo-dark shadow-sm ring-1 ring-vailo-dark/5">
        {children}
      </div>
    </div>
  );
}

function OvenCard({ onClose }: { onClose: () => void }) {
  return (
    <PopCard icon={Bot} title="Vailo AI" subtitle="Answering from your House Guide" onClose={onClose}>
      <div className="space-y-3">
        <GuestMsg>How does the oven work?</GuestMsg>
        <AiMsg>
          <p className="font-semibold">Happy to help! 🍳 Your Bosch oven:</p>
          <ol className="mt-1.5 space-y-1 text-[12.5px] text-vailo-dark/80">
            <li>
              <b className="text-vailo-teal">1.</b> Turn the dial to <b>Top/Bottom heat</b>
            </li>
            <li>
              <b className="text-vailo-teal">2.</b> Set the temperature, 180°C works for most dishes
            </li>
            <li>
              <b className="text-vailo-teal">3.</b> Press <b>▶ Start</b>. It beeps when preheated.
            </li>
          </ol>
          <p className="mt-2 text-[12px] text-vailo-dark/60">Pizza tip: use the middle rack.</p>
        </AiMsg>
        <div className="flex items-center gap-1.5 pl-8 text-[11px] font-semibold text-vailo-teal">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          From your House Guide › Kitchen
        </div>
      </div>
    </PopCard>
  );
}

function LocalCard({ onClose }: { onClose: () => void }) {
  const spots = [
    { name: 'Chez Marcelle', note: 'Family-run bistro, daily specials', walk: '4 min', tag: 'Local favourite', icon: Utensils },
    { name: 'Marché du Quartier', note: 'Morning market, fresh and seasonal', walk: '9 min', tag: 'Hidden gem', icon: Store },
    { name: 'Café des Artisans', note: 'Quiet courtyard, best croissants', walk: '6 min', tag: 'Locals only', icon: Coffee },
  ];
  return (
    <PopCard icon={Compass} title="Live Like a Local" subtitle="Curated by your AI local expert" onClose={onClose}>
      <ul className="space-y-2.5">
        {spots.map((s) => (
          <li key={s.name} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-vailo-dark/5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-vailo-gold/15 text-vailo-gold-muted">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-vailo-dark">{s.name}</p>
              <p className="truncate text-[11.5px] text-vailo-dark/55">{s.note}</p>
              <div className="mt-1 flex items-center gap-2 text-[10.5px] font-semibold">
                <span className="inline-flex items-center gap-1 text-vailo-dark/55">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {s.walk} walk
                </span>
                <span className="rounded-full bg-vailo-teal/10 px-2 py-0.5 text-vailo-teal">{s.tag}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PopCard>
  );
}

function BookCard({ onClose }: { onClose: () => void }) {
  const [booked, setBooked] = useState<string | null>(null);
  const tours = [
    { id: 'skip', name: 'Louvre Skip-the-Line Guided Tour', meta: '2.5 h, Small group', price: 59, rating: '4.8' },
    { id: 'after', name: 'Louvre Highlights, Early Entry', meta: '2 h, Before the crowds', price: 79, rating: '4.9' },
  ];
  return (
    <PopCard icon={Ticket} title="Arrange & Book" subtitle="Tours bookable inside the portal" onClose={onClose}>
      <ul className="space-y-2.5">
        {tours.map((t) => {
          const isBooked = booked === t.id;
          return (
            <li key={t.id} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-vailo-dark/5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-bold leading-snug text-vailo-dark">{t.name}</p>
                <span className="inline-flex flex-none items-center gap-1 text-[11px] font-bold text-vailo-gold-muted">
                  <Star className="h-3 w-3 fill-current" aria-hidden />
                  {t.rating}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-vailo-dark/55">{t.meta}</p>
              <div className="mt-2.5 flex items-center justify-between">
                <p className="text-[12px] text-vailo-dark/60">
                  from <b className="text-base text-vailo-dark">€{t.price}</b> / person
                </p>
                <button
                  type="button"
                  onClick={() => setBooked(isBooked ? null : t.id)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all',
                    isBooked
                      ? 'bg-emerald-500 text-white'
                      : 'bg-vailo-gold text-vailo-dark hover:bg-vailo-gold-hover'
                  )}
                >
                  {isBooked ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden /> Requested
                    </>
                  ) : (
                    'Book now'
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </PopCard>
  );
}

function ArrivalCard({ onClose }: { onClose: () => void }) {
  return (
    <PopCard icon={KeyRound} title="Arrival & Check-in" subtitle="From your House Guide, no 2am call" onClose={onClose}>
      <div className="space-y-3">
        <GuestMsg>How do we get in? There’s no key under the mat.</GuestMsg>
        <AiMsg>
          <p className="font-semibold">You’re at the right gate 🔑</p>
          <ol className="mt-1.5 space-y-1 text-[12.5px] text-vailo-dark/80">
            <li>
              <b className="text-vailo-teal">1.</b> Lockbox on the right of the wooden door
            </li>
            <li>
              <b className="text-vailo-teal">2.</b> Code <b>4829</b>, then # to open
            </li>
            <li>
              <b className="text-vailo-teal">3.</b> White key card goes in the slot by the entrance to turn the power on
            </li>
          </ol>
        </AiMsg>
        <div className="flex items-center gap-1.5 pl-8 text-[11px] font-semibold text-vailo-teal">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          From your House Guide › Arrival
        </div>
      </div>
    </PopCard>
  );
}

function TransferCard({ onClose }: { onClose: () => void }) {
  const [requested, setRequested] = useState(false);
  return (
    <PopCard icon={Car} title="Arrange & Book" subtitle="Airport transfer, bookable tonight" onClose={onClose}>
      <div className="space-y-3">
        <GuestMsg>Can someone pick us up from the airport at 6am?</GuestMsg>
        <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-vailo-dark/5">
          <p className="text-[13px] font-bold text-vailo-dark">Private airport transfer</p>
          <p className="mt-0.5 text-[11.5px] text-vailo-dark/55">CHQ → Villa Sunset, 35 min, up to 4 guests</p>
          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-[12px] text-vailo-dark/60">
              from <b className="text-base text-vailo-dark">€48</b>
            </p>
            <button
              type="button"
              onClick={() => setRequested((v) => !v)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all',
                requested ? 'bg-emerald-500 text-white' : 'bg-vailo-gold text-vailo-dark hover:bg-vailo-gold-hover'
              )}
            >
              {requested ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden /> Requested
                </>
              ) : (
                'Book transfer'
              )}
            </button>
          </div>
        </div>
        <p className="text-[11px] font-semibold text-vailo-teal">
          You earn 1/3 of Vailo’s margin on this booking, not of the ticket price.
        </p>
      </div>
    </PopCard>
  );
}

function WifiCard({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const password = 'sunsetvilla26';

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <PopCard icon={Wifi} title="Wi-Fi" subtitle="Instant answer, no waiting for your host" onClose={onClose}>
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-vailo-dark/5">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-vailo-dark/40">Network</p>
        <p className="mt-0.5 text-sm font-bold text-vailo-dark">Villa_Sunset_5G</p>
        <p className="mt-3 text-[10.5px] font-bold uppercase tracking-wider text-vailo-dark/40">Password</p>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-vailo-surface px-3 py-2.5">
          <code className="truncate font-mono text-sm font-semibold text-vailo-dark">{password}</code>
          <button
            type="button"
            onClick={async () => setCopied(await copyText(password))}
            className={cx(
              'inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
              copied ? 'bg-emerald-500 text-white' : 'bg-vailo-dark text-white hover:bg-vailo-teal'
            )}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
              </>
            )}
          </button>
        </div>
      </div>
    </PopCard>
  );
}

function CheckoutCard({ onClose }: { onClose: () => void }) {
  return (
    <PopCard icon={DoorOpen} title="Check-out" subtitle="From your House Guide, no morning scramble" onClose={onClose}>
      <div className="space-y-3">
        <GuestMsg>What time is check-out, and what do we need to do?</GuestMsg>
        <AiMsg>
          <p className="font-semibold">Easy check-out by 11:00 🏠</p>
          <ol className="mt-1.5 space-y-1 text-[12.5px] text-vailo-dark/80">
            <li>
              <b className="text-vailo-teal">1.</b> Leave keys in the lockbox, same code as arrival
            </li>
            <li>
              <b className="text-vailo-teal">2.</b> Put used towels in the bathroom hamper
            </li>
            <li>
              <b className="text-vailo-teal">3.</b> Trash goes in the bins by the gate (green = recycling)
            </li>
          </ol>
          <p className="mt-2 text-[12px] text-vailo-dark/60">Late check-out? Ask in chat, we’ll check availability.</p>
        </AiMsg>
        <div className="flex items-center gap-1.5 pl-8 text-[11px] font-semibold text-vailo-teal">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          From your House Guide › Departure
        </div>
      </div>
    </PopCard>
  );
}

function BeachCard({ onClose }: { onClose: () => void }) {
  const spots = [
    { name: 'Agios Pavlos Cove', note: 'Quiet pebbles, turquoise water', walk: '12 min drive', tag: 'Hidden gem', icon: Waves },
    { name: 'Olive Grove Path', note: 'Shaded loop, sunset views', walk: '18 min walk', tag: 'Locals love it', icon: Trees },
    { name: 'Harbour Swim Spot', note: 'Calm mornings, coffee nearby', walk: '8 min walk', tag: 'Family friendly', icon: MapPin },
  ];
  return (
    <PopCard icon={Waves} title="Live Like a Local" subtitle="Beaches & nature near the property" onClose={onClose}>
      <ul className="space-y-2.5">
        {spots.map((s) => (
          <li key={s.name} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-vailo-dark/5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-vailo-teal/10 text-vailo-teal">
              <s.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-vailo-dark">{s.name}</p>
              <p className="truncate text-[11.5px] text-vailo-dark/55">{s.note}</p>
              <div className="mt-1 flex items-center gap-2 text-[10.5px] font-semibold">
                <span className="inline-flex items-center gap-1 text-vailo-dark/55">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {s.walk}
                </span>
                <span className="rounded-full bg-vailo-teal/10 px-2 py-0.5 text-vailo-teal">{s.tag}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PopCard>
  );
}

function GuestIllustration() {
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full" role="img" aria-label="A relaxed guest on a sofa, sunglasses on, holding a cold drink">
      <defs>
        <linearGradient id="gj-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dff0f0" />
          <stop offset="1" stopColor="#f7ecd2" />
        </linearGradient>
        <linearGradient id="gj-sofa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f7585" />
          <stop offset="1" stopColor="#0b4f5c" />
        </linearGradient>
        <clipPath id="gj-clip">
          <circle cx="120" cy="120" r="112" />
        </clipPath>
      </defs>
      <circle cx="120" cy="120" r="112" fill="url(#gj-bg)" />
      <circle cx="120" cy="120" r="112" fill="none" stroke="#fff" strokeWidth="4" opacity=".7" />
      <g clipPath="url(#gj-clip)">
        {/* sun */}
        <circle cx="186" cy="60" r="18" fill="#f3d58d" />
        <circle cx="186" cy="60" r="28" fill="#f3d58d" opacity=".35" />
        {/* plant */}
        <path d="M44 150c-6-26 4-44 14-52 2 22 2 34-14 52z" fill="#3f8f7e" />
        <path d="M54 156c-2-22 10-38 26-42-4 20-8 32-26 42z" fill="#2f7a6a" />
        <rect x="38" y="150" width="26" height="30" rx="8" fill="#c5a059" />
        {/* sofa */}
        <rect x="56" y="104" width="130" height="86" rx="32" fill="url(#gj-sofa)" />
        <rect x="44" y="136" width="30" height="58" rx="15" fill="#0a6574" />
        <rect x="168" y="136" width="30" height="58" rx="15" fill="#0a6574" />
        {/* legs stretched out */}
        <rect x="96" y="164" width="92" height="20" rx="10" fill="#083a43" />
        <ellipse cx="190" cy="176" rx="12" ry="8" fill="#f1c9a5" />
        {/* torso */}
        <rect x="92" y="112" width="56" height="66" rx="26" fill="#c5a059" />
        {/* head */}
        <circle cx="120" cy="92" r="21" fill="#f1c9a5" />
        <path d="M99 90c1-17 12-24 23-24 13 0 21 9 21 24-7-9-15-13-25-12-8 1-14 5-19 12z" fill="#3b2a20" />
        {/* sunglasses */}
        <rect x="104" y="88" width="15" height="10" rx="5" fill="#051f26" />
        <rect x="123" y="88" width="15" height="10" rx="5" fill="#051f26" />
        <rect x="118" y="91" width="6" height="2.6" fill="#051f26" />
        <path d="M113 106q8 7 16 0" stroke="#a5583f" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        {/* arm + drink */}
        <path d="M144 128q16 2 20-14" stroke="#f1c9a5" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M156 76h22l-3 30a8 8 0 0 1-8 7 8 8 0 0 1-8-7z" fill="#ffffff" opacity=".92" />
        <path d="M158 86h18l-1.4 20a6 6 0 0 1-6 5 6 6 0 0 1-6-5z" fill="#f0a35a" opacity=".85" />
        <path d="M172 70l5-10" stroke="#c5a059" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="167" cy="76" r="4.5" fill="#f3d58d" />
      </g>
    </svg>
  );
}

type JourneyItem = {
  id: string;
  question: string;
  hint: string;
  icon: LucideIcon;
  /** Degrees from 12 o’clock, clockwise — places the bubble on a ring. */
  angle: number;
  Card: (props: { onClose: () => void }) => ReactNode;
};

const JOURNEY: JourneyItem[] = [
  {
    id: 'arrival',
    question: 'How do we get in? There’s no key.',
    hint: 'Arrival & lockbox',
    icon: KeyRound,
    angle: 337.5,
    Card: ArrivalCard,
  },
  {
    id: 'eat',
    question: 'Where should we eat like locals?',
    hint: 'Live Like a Local',
    icon: Utensils,
    angle: 22.5,
    Card: LocalCard,
  },
  {
    id: 'wifi',
    question: 'What’s the Wi-Fi password?',
    hint: 'Instant Wi-Fi card',
    icon: Wifi,
    angle: 67.5,
    Card: WifiCard,
  },
  {
    id: 'transfer',
    question: 'Can someone pick us up at 6am?',
    hint: 'Airport transfer',
    icon: Car,
    angle: 112.5,
    Card: TransferCard,
  },
  {
    id: 'checkout',
    question: 'What do we do at check-out?',
    hint: 'Departure checklist',
    icon: DoorOpen,
    angle: 157.5,
    Card: CheckoutCard,
  },
  {
    id: 'louvre',
    question: 'How can we book a Louvre tour?',
    hint: 'Arrange & Book',
    icon: Ticket,
    angle: 202.5,
    Card: BookCard,
  },
  {
    id: 'oven',
    question: 'How does the oven work?',
    hint: 'House Guide',
    icon: Flame,
    angle: 247.5,
    Card: OvenCard,
  },
  {
    id: 'beach',
    question: 'Where’s a quiet beach nearby?',
    hint: 'Beaches & nature',
    icon: Waves,
    angle: 292.5,
    Card: BeachCard,
  },
];

/** Polar placement on the desktop ring (0° = top, clockwise). */
function journeyStyle(angle: number): { left: string; top: string } {
  const rad = ((angle - 90) * Math.PI) / 180;
  const r = 38;
  return {
    left: `${50 + r * Math.cos(rad)}%`,
    top: `${50 + r * Math.sin(rad)}%`,
  };
}

function journeySide(angle: number): 'left' | 'right' {
  const rad = ((angle - 90) * Math.PI) / 180;
  return Math.cos(rad) >= 0 ? 'right' : 'left';
}

function GuestJourney() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [touched, setTouched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setActive(null);
    setPinned(false);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest('[data-journey-item]')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [close]);

  return (
    <section id="guest-journey" className={cx('relative overflow-hidden', SECTION_SCROLL_MT, SECTION_PAD_COMPACT)}>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#f3f7f6] to-white" />
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="The guest journey"
            title="From the day they book, every question stays off your phone."
            subtitle="Lockbox at 2am. A taverna that isn’t a trap. A 6am airport car. Pick a thought bubble: this is what guests get from their private link from booking day, and again when they scan the QR on arrival."
          />
        </Reveal>

        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-vailo-teal">
          <MousePointerClick className="h-4 w-4" aria-hidden />
          <span className="hidden lg:inline">Hover or click a bubble</span>
          <span className="lg:hidden">Tap a bubble</span>
        </p>

        <div
          ref={rootRef}
          className="relative mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:mt-4 lg:block lg:aspect-square lg:h-auto lg:max-h-[920px] lg:w-full"
        >
          {/* soft orbit ring — desktop only */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-vailo-teal/20 lg:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-vailo-teal/[0.06] to-vailo-gold/[0.08] lg:block"
          />

          {/* guest */}
          <motion.div
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="relative mx-auto mb-2 h-52 w-52 sm:col-span-2 lg:absolute lg:left-1/2 lg:top-1/2 lg:mb-0 lg:h-[250px] lg:w-[250px] lg:-translate-x-1/2 lg:-translate-y-1/2"
          >
            <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-vailo-teal/15 to-vailo-gold/25 blur-2xl" />
            <div className="relative h-full w-full drop-shadow-[0_20px_30px_rgba(5,31,38,0.18)]">
              <GuestIllustration />
            </div>
          </motion.div>

          {JOURNEY.map((item, i) => {
            const isOpen = active === item.id;
            const Card = item.Card;
            const side = journeySide(item.angle);
            const ringStyle = journeyStyle(item.angle);
            return (
              <div
                key={item.id}
                data-journey-item
                style={
                  {
                    ['--jx' as string]: ringStyle.left,
                    ['--jy' as string]: ringStyle.top,
                  } as CSSProperties
                }
                className={cx(
                  'relative lg:absolute lg:w-[220px] lg:-translate-x-1/2 lg:-translate-y-1/2',
                  'lg:left-[var(--jx)] lg:top-[var(--jy)]',
                  isOpen ? 'z-30' : 'z-10'
                )}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  setActive(item.id);
                  setPinned(false);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  if (!pinned) setActive((cur) => (cur === item.id ? null : cur));
                }}
              >
                <motion.div
                  animate={reduce ? undefined : { y: [0, -9, 0] }}
                  transition={{ duration: 4 + i * 0.45, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }}
                  className="relative"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setTouched(true);
                      if (isOpen && pinned) close();
                      else {
                        setActive(item.id);
                        setPinned(true);
                      }
                    }}
                    className={cx(
                      'group relative flex w-full items-center gap-3 rounded-full border px-4 py-3.5 text-left backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vailo-gold/40',
                      isOpen
                        ? 'border-vailo-gold/60 bg-white shadow-[0_20px_44px_-14px_rgba(197,160,89,0.55)]'
                        : 'border-white bg-white/85 shadow-[0_14px_34px_-14px_rgba(5,31,38,0.3)] hover:shadow-[0_20px_44px_-14px_rgba(5,31,38,0.38)]'
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors',
                        isOpen ? 'bg-vailo-gold text-vailo-dark' : 'bg-vailo-teal/10 text-vailo-teal'
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold leading-snug text-vailo-dark">“{item.question}”</span>
                      <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wider text-vailo-teal/70">
                        {item.hint}
                      </span>
                    </span>
                    {!touched && i === 0 && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vailo-gold opacity-75" />
                        <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-vailo-gold" />
                      </span>
                    )}
                  </button>
                  {/* thought-bubble dots pointing toward the guest */}
                  <span
                    aria-hidden
                    className={cx(
                      'pointer-events-none absolute hidden lg:block',
                      side === 'left' ? '-bottom-1 right-8' : '-bottom-1 left-8'
                    )}
                  >
                    <span className="absolute h-2.5 w-2.5 rounded-full bg-white/90 shadow ring-1 ring-vailo-dark/5" />
                    <span
                      className={cx(
                        'absolute top-3 h-1.5 w-1.5 rounded-full bg-white/90 shadow ring-1 ring-vailo-dark/5',
                        side === 'left' ? 'left-3' : '-left-1'
                      )}
                    />
                  </span>
                </motion.div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      key="card"
                      initial={reduce ? false : { opacity: 0, scale: 0.88, x: side === 'left' ? -18 : 18, y: 6 }}
                      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      style={{ transformOrigin: side === 'left' ? 'left center' : 'right center' }}
                      className={cx(
                        'mt-3 w-full lg:absolute lg:top-1/2 lg:mt-0 lg:w-[320px] lg:-translate-y-1/2',
                        side === 'left' ? 'lg:left-full lg:pl-3' : 'lg:right-full lg:pr-3'
                      )}
                    >
                      <Card onClose={close} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4c. SECTION — ROI & PASSIVE INCOME CALCULATOR
 * ========================================================================= */

function RangeField({
  id,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold text-white/85">
          {label}
        </label>
        <span className="rounded-xl bg-white/10 px-3 py-1 text-lg font-bold tabular-nums text-white ring-1 ring-white/15">
          {formatInt(value)}
          {unit && <span className="ml-1 text-xs font-medium text-white/55">{unit}</span>}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vailo-range mt-5"
        style={{ ['--range-pct' as string]: `${pct}%` }}
      />
      <div className="mt-2 flex justify-between text-xs font-medium text-white/40">
        <span>{formatInt(min)}</span>
        <span>{formatInt(max)}</span>
      </div>
    </div>
  );
}

function RoiCalculator() {
  const [properties, setProperties] = useState(5);
  const [guests, setGuests] = useState(120);

  const { hoursSaved, monthlyIncome, yearlyIncome, fteFreed } = useMemo(() => calcRoi(guests), [guests]);
  const plan = pickPlan(properties);
  const annualTotal = planAnnualTotal(properties);
  const monthsToCover = monthlyIncome > 0 ? annualTotal / monthlyIncome : null;
  const conversionPct = Math.round(ROI.excursionConversion * 100);
  const marginPct = Math.round(ROI.exampleMarginRate * 100);

  return (
    <section id="roi" className={cx('relative overflow-hidden bg-vailo-dark text-white', SECTION_SCROLL_MT, SECTION_PAD_COMPACT)}>
      <div className="absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-vailo-teal/50 blur-3xl" />
      <div className="absolute -right-32 bottom-0 h-[26rem] w-[26rem] rounded-full bg-vailo-gold/20 blur-3xl" />
      <Container className="relative">
        <Reveal>
          <SectionHeading
            light
            eyebrow="ROI calculator"
            title="Save Time. Generate Revenue."
            subtitle="Slide to match your portfolio and see what Vailo could give back to you every month."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <div className="h-full rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              <div className="space-y-10">
                <RangeField
                  id="roi-properties"
                  label="Number of Properties"
                  value={properties}
                  min={1}
                  max={100}
                  onChange={setProperties}
                />
                <RangeField
                  id="roi-guests"
                  label="Average Guests per Month"
                  value={guests}
                  min={10}
                  max={1000}
                  onChange={setGuests}
                />
              </div>
              <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/45">
                Estimates assume {conversionPct}% of guests book a Vailo-supplied excursion at €{ROI.avgBookingEur}, a{' '}
                {marginPct}% platform margin (example, real margins vary), and you receive 1/3 of that margin, not of
                the ticket price. Also {ROI.hoursSavedPerGuest} hours saved per guest on messaging. Actual results vary.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid h-full gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-3xl bg-gradient-to-br from-white to-[#e9f3f2] p-6 text-vailo-dark shadow-2xl">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vailo-teal text-white">
                    <Clock className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-5 text-4xl font-extrabold tracking-tight text-vailo-teal sm:text-5xl">
                    <AnimatedNumber value={hoursSaved} suffix=" h" />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-snug text-vailo-dark/70">
                    Hours saved per month on guest messaging
                  </p>
                </div>

                <div className="rounded-3xl bg-gradient-to-br from-[#e8f1f0] to-white p-6 text-vailo-dark shadow-2xl ring-1 ring-vailo-teal/15">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vailo-dark text-vailo-gold">
                    <Users className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-5 text-4xl font-extrabold tracking-tight text-vailo-dark sm:text-5xl">
                    <AnimatedNumber value={fteFreed} decimals={1} />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-snug text-vailo-dark/70">
                    Full-time team capacity freed
                  </p>
                  <p className="mt-1 text-xs font-bold text-vailo-dark/55">
                    reassign elsewhere, or save the hire
                  </p>
                </div>

                <div className="rounded-3xl bg-gradient-to-br from-[#e1bf7c] to-vailo-gold p-6 text-vailo-dark shadow-2xl sm:col-span-2 lg:col-span-1">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vailo-dark text-vailo-gold">
                    <TrendingUp className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
                    <AnimatedNumber value={monthlyIncome} prefix="€" />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-snug text-vailo-dark/75">
                    Your 1/3 of Vailo excursion margin
                  </p>
                  <p className="mt-1 text-xs font-bold text-vailo-dark/60">
                    per month, ≈ €{formatInt(yearlyIncome)} per year
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
                <p className="flex items-start gap-3 text-sm leading-relaxed text-white/80">
                  <Lightbulb className="mt-0.5 h-5 w-5 flex-none text-vailo-gold" aria-hidden />
                  <span>
                    For {properties} {properties === 1 ? 'property' : 'properties'} we’d suggest{' '}
                    <b className="text-white">
                      {plan.name} (€{plan.pricePerPropertyEur} × {properties} = €{formatInt(annualTotal)}/yr)
                    </b>
                    .{' '}
                    {monthsToCover !== null && (
                      <>
                        At this volume, excursion income could cover it in{' '}
                        <b className="text-vailo-gold">
                          {monthsToCover <= 1 ? 'about a month' : `about ${Math.ceil(monthsToCover)} months`}
                        </b>
                        .
                      </>
                    )}
                  </span>
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="mx-auto mt-8 flex max-w-3xl items-start gap-4 rounded-3xl border border-vailo-gold/30 bg-vailo-gold/10 p-5 sm:items-center sm:p-6">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-vailo-gold text-vailo-dark">
              <Handshake className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium leading-relaxed text-white/90 sm:text-base">
              Access from booking day means more bookings before arrival. On Vailo-supplied excursions you earn 1/3 of
              our margin; on your featured partnerships you keep 100% of the margin you agreed with your partner.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4d. SECTION — HOW MONEY WORKS (very clear split)
 * ========================================================================= */

function RevenueShare({ compact }: { compact?: boolean } = {}) {
  return (
    <section
      id="how-you-earn"
      className={cx('relative overflow-hidden', SECTION_SCROLL_MT, compact ? SECTION_PAD_COMPACT : SECTION_PAD)}
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#eef5f4] to-white" />
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="How you earn"
            title="Two income types. Zero confusion."
            subtitle="What you keep depends on who supplies the booking: Vailo, or your own featured partner."
          />
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-vailo-dark p-7 text-white shadow-[0_28px_60px_-28px_rgba(5,31,38,0.55)] sm:p-8">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-vailo-gold ring-1 ring-white/15">
                <Percent className="h-3.5 w-3.5" aria-hidden />
                Vailo-supplied excursions & services
              </span>
              <h3 className="font-luxury mt-5 text-2xl font-medium sm:text-3xl">1/3 of our margin to you</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">
                When a guest books a tour or service supplied through Vailo, we earn a commission margin on that
                booking (for example 8%, 10% or 20%, it varies by product). That margin is split:
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-vailo-gold/20 p-4 ring-1 ring-vailo-gold/35">
                  <p className="text-3xl font-extrabold text-vailo-gold">1/3</p>
                  <p className="mt-1 text-sm font-semibold text-white">to the property</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/12">
                  <p className="text-3xl font-extrabold text-white/90">2/3</p>
                  <p className="mt-1 text-sm font-semibold text-white/70">to Vailo</p>
                </div>
              </div>
              <p className="mt-5 rounded-xl bg-white/8 px-4 py-3 text-sm font-semibold leading-snug text-vailo-gold ring-1 ring-vailo-gold/25">
                Important: this is 1/3 of the margin, not 1/3 of the guest’s ticket price.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white p-7 shadow-[0_28px_60px_-28px_rgba(5,31,38,0.28)] ring-1 ring-vailo-dark/8 sm:p-8">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                <Handshake className="h-3.5 w-3.5" aria-hidden />
                Your featured partnerships
              </span>
              <h3 className="font-luxury mt-5 text-2xl font-medium text-vailo-dark sm:text-3xl">
                100% of your margin to you
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-vailo-dark/65">
                Car rentals, transfers, local partners, anything you feature that you already have an agreement with.
                The margin you negotiated with that partner stays entirely yours.
              </p>
              <div className="mt-6 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
                <p className="text-4xl font-extrabold text-emerald-700">100%</p>
                <p className="mt-1 text-sm font-semibold text-emerald-800/80">
                  of the partner margin you agreed, Vailo does not take a cut
                </p>
              </div>
              <p className="mt-5 text-sm font-semibold leading-snug text-vailo-dark/55">
                Guest-link access from booking day simply gives visitors more time to book these partners before they
                arrive.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-semibold text-vailo-dark/55">
            Example: €100 ticket with a 10% Vailo margin (€10) → you earn €3.33, Vailo €6.67. Your own car-rental partner
            deal stays 100% yours.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4e. SECTION — TEAM CAPACITY / LABOUR SAVINGS
 * ========================================================================= */

function TeamSavings() {
  const points = [
    {
      icon: MessageCircle,
      title: 'Fewer people glued to the inbox',
      text: 'Wi-Fi, lockbox, oven, checkout, the questions that eat a guest-ops shift get answered by Vailo. Your team stops repeating themselves.',
    },
    {
      icon: Users,
      title: 'Reassign capacity, or don’t hire',
      text: 'The hours you free can go to upselling, owner relations, or on-property hospitality. Growing portfolios often skip the next guest-support hire.',
    },
    {
      icon: Wallet,
      title: 'Labour savings plus earlier bookings',
      text: 'Cut night-and-weekend messaging, and give guests more time from booking day to book Vailo excursions and your featured partners.',
    },
  ];
  return (
    <section id="your-team" className={cx('relative overflow-hidden', SECTION_SCROLL_MT, SECTION_PAD_COMPACT)}>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#f7f3ea] to-white" />
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Your team"
            title="Guest support time your people can spend elsewhere."
            subtitle="Vailo doesn’t replace hospitality, it removes the repetitive layer from booking day onward. Leaner ops, clearer payroll, more booking income."
          />
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/6">
                <IconTile icon={p.icon} />
                <h3 className="font-luxury mt-5 text-xl font-medium text-vailo-dark">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-vailo-dark/65">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.12}>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm font-semibold text-vailo-dark/55">
            Use the ROI calculator above: hours saved translate into full-time capacity you can redeploy or leave
            unhired.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4e. SECTION — HOST PROOF (what the paying customer sees)
 * ========================================================================= */

function HostProof() {
  const points = [
    {
      icon: ChartColumn,
      title: 'Guest analytics per stay',
      text: 'See portal visits, assistant questions, Live Like a Local usage and the excursion funnel, so you know what to fix before the next booking.',
    },
    {
      icon: BookOpen,
      title: 'House Guide that powers the AI',
      text: 'Guided fill-in once. Automated, effortless, fast. Featured cards on the guest portal, full text for the 24/7 assistant. Track what’s complete at a glance.',
    },
    {
      icon: Wallet,
      title: 'Two clear income streams',
      text: 'Vailo excursions: 1/3 of our margin. Your featured partners: 100% of the margin you agreed. Link access from booking day means more of both before check-in.',
    },
  ];

  return (
    <section id="for-hosts" className={cx(SECTION_SCROLL_MT, SECTION_PAD_COMPACT)}>
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Built for hosts"
            title="Set the property up once. Then mostly leave it alone."
            easeLine
            subtitle="Guided setup that takes little time. Guests get a private link from booking day, plus a QR on arrival. You see what’s working, and where each euro of booking income comes from."
          />
        </Reveal>

        <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal>
            <div className="relative pb-16 sm:pb-20">
              <div className="overflow-hidden rounded-3xl bg-vailo-dark p-2 shadow-[0_40px_80px_-30px_rgba(5,31,38,0.55)] ring-1 ring-vailo-dark/10">
                <img
                  src="/website/screenshots/admin-analytics-list.png"
                  alt="Vailo host analytics: sessions, portal visits, assistant turns and Live Like a Local usage"
                  className="w-full rounded-2xl bg-white"
                  loading="lazy"
                />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.5, ease: EASE }}
                className="absolute bottom-0 right-4 w-[min(100%,320px)] overflow-hidden rounded-2xl shadow-[0_24px_50px_-20px_rgba(5,31,38,0.45)] ring-1 ring-vailo-dark/10 sm:right-8 sm:w-[380px]"
              >
                <img
                  src="/website/screenshots/admin-house-guide.png"
                  alt="Vailo House Guide completion view for hosts"
                  className="w-full bg-white"
                  loading="lazy"
                />
              </motion.div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <ul className="space-y-5 pt-8 lg:pt-0">
              {points.map((p) => (
                <li key={p.title} className="flex gap-4 rounded-3xl bg-white p-5 shadow-[0_14px_40px_-24px_rgba(5,31,38,0.3)] ring-1 ring-vailo-dark/6">
                  <IconTile icon={p.icon} className="h-11 w-11 flex-none" />
                  <div>
                    <h3 className="text-base font-bold text-vailo-dark">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-vailo-dark/65">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to="/contact?intent=demo" size="lg">
                Book a Demo
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Button>
              <Button href={LIVE_DEMO_HREF} variant="secondary" size="lg">
                Try guest demo
                <ExternalLink className="h-4 w-4 opacity-70" aria-hidden />
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4e. SECTION — CORE FEATURES (bento grid)
 * ========================================================================= */

function FeatureCardShell({
  feature,
  className,
  tone = 'light',
  children,
  showDetail,
}: {
  feature: Feature;
  className?: string;
  tone?: 'light' | 'dark' | 'gold';
  children?: ReactNode;
  showDetail?: boolean;
}) {
  const dark = tone === 'dark';
  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-3xl p-7 sm:p-8',
        tone === 'light' && 'bg-white shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/6',
        tone === 'dark' && 'bg-gradient-to-br from-vailo-dark via-[#073a45] to-vailo-teal text-white shadow-[0_30px_60px_-24px_rgba(5,31,38,0.6)]',
        tone === 'gold' && 'bg-gradient-to-br from-[#fbf3df] to-[#f3e0b3] shadow-[0_18px_50px_-24px_rgba(197,160,89,0.55)] ring-1 ring-vailo-gold/30',
        className
      )}
    >
      <span
        className={cx(
          'inline-flex h-12 w-12 items-center justify-center rounded-2xl',
          dark ? 'bg-white/12 text-vailo-gold ring-1 ring-white/20' : 'bg-gradient-to-br from-vailo-teal to-vailo-teal-light text-white shadow-lg shadow-vailo-teal/25'
        )}
      >
        <feature.icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className={cx('font-luxury mt-5 text-2xl font-medium leading-snug', dark ? 'text-white' : 'text-vailo-dark')}>
        {feature.title}
      </h3>
      <p className={cx('mt-2 max-w-md text-[15px] leading-relaxed', dark ? 'text-white/70' : 'text-vailo-dark/65')}>
        {feature.blurb}
      </p>
      {showDetail && (
        <ul className="mt-4 space-y-2">
          {feature.detail.map((d) => (
            <li key={d} className={cx('flex items-start gap-2 text-sm', dark ? 'text-white/80' : 'text-vailo-dark/75')}>
              <Check className={cx('mt-0.5 h-4 w-4 flex-none', dark ? 'text-vailo-gold' : 'text-vailo-teal')} aria-hidden />
              {d}
            </li>
          ))}
        </ul>
      )}
      {children && <div className="mt-6 flex-1">{children}</div>}
    </motion.article>
  );
}

function CheckinVisual() {
  const items = ['Arrival time', 'Guest details', 'Special requests'];
  return (
    <div className="rounded-2xl bg-vailo-surface p-4 ring-1 ring-vailo-dark/5">
      <div className="mb-3 flex items-center justify-between text-xs font-bold text-vailo-dark/60">
        <span>Pre-arrival check-in</span>
        <span className="text-vailo-teal">100% complete</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-vailo-dark/8">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-vailo-teal to-vailo-gold"
          initial={{ width: 0 }}
          whileInView={{ width: '100%' }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
        />
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {items.map((t, i) => (
          <motion.li
            key={t}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.25 }}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-vailo-dark shadow-sm"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-3 w-3" aria-hidden />
            </span>
            {t}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function FeaturesGrid({ detailed = false }: { detailed?: boolean }) {
  const [assistant, local, excursions, checkin] = FEATURES;
  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <Reveal className="lg:col-span-4">
        <FeatureCardShell feature={assistant} tone="dark" className="h-full" showDetail={detailed}>
          <div className="space-y-2.5 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10 backdrop-blur">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-vailo-teal-light px-3.5 py-2 text-[13px] text-white">
              What time is check-out?
            </p>
            <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[13px] text-vailo-dark">
              Check-out is at 11:00. Leave the keys on the kitchen table, safe travels! 👋
            </p>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-vailo-gold">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> Answered from your House Guide
            </p>
          </div>
        </FeatureCardShell>
      </Reveal>

      <Reveal delay={0.08} className="lg:col-span-2">
        <FeatureCardShell feature={local} className="h-full" showDetail={detailed}>
          <div className="flex flex-wrap gap-2">
            {[
              { l: 'Hidden bistros', i: Utensils },
              { l: 'Morning cafés', i: Coffee },
              { l: 'Quiet trails', i: Trees },
              { l: 'Artisan shops', i: Store },
            ].map(({ l, i: Icon }) => (
              <span
                key={l}
                className="inline-flex items-center gap-1.5 rounded-full bg-vailo-teal/8 px-3 py-1.5 text-xs font-bold text-vailo-teal"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {l}
              </span>
            ))}
          </div>
        </FeatureCardShell>
      </Reveal>

      <Reveal delay={0.12} className="lg:col-span-2">
        <FeatureCardShell feature={excursions} tone="gold" className="h-full" showDetail={detailed}>
          <div className="flex items-center justify-between rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-vailo-gold/20">
            <div>
              <p className="text-xs font-bold text-vailo-dark">Guided city tour</p>
              <p className="text-[11px] text-vailo-dark/55">Booked by your guest</p>
            </div>
            <span className="rounded-xl bg-vailo-dark px-3 py-1.5 text-sm font-extrabold text-vailo-gold">+€16.50</span>
          </div>
        </FeatureCardShell>
      </Reveal>

      <Reveal delay={0.16} className="lg:col-span-4">
        <FeatureCardShell feature={checkin} className="h-full" showDetail={detailed}>
          <CheckinVisual />
        </FeatureCardShell>
      </Reveal>
    </div>
  );
}

function FeaturesSection({ detailed = false }: { detailed?: boolean }) {
  return (
    <section id="features-overview" className="scroll-mt-24 py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Core features"
            title="Everything guests need from booking day to checkout. Nothing you answer twice."
            easeLine
            subtitle="Set the property up once. From the day they book, Vailo supports guests, promotes your partners, and earns while you sleep."
          />
        </Reveal>
        <div className="mt-14">
          <FeaturesGrid detailed={detailed} />
        </div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4e. SECTION — PRICING
 * ========================================================================= */

function PricingCard({ plan }: { plan: Plan }) {
  const exampleCount =
    plan.id === 'solo' ? 1 : plan.id === 'pro' ? 10 : plan.id === 'agency' ? 30 : 60;
  const exampleTotal = plan.pricePerPropertyEur * exampleCount;
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cx(
        'relative flex h-full flex-col rounded-3xl p-6 sm:p-7',
        plan.popular
          ? 'bg-white shadow-[0_40px_80px_-30px_rgba(197,160,89,0.6)] ring-2 ring-vailo-gold'
          : 'bg-white shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/8'
      )}
    >
      {plan.popular && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-vailo-gold/10 to-transparent" />
          <span className="absolute -top-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-[#d9b66f] to-vailo-gold px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-vailo-dark shadow-lg">
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
            Most Popular
          </span>
        </>
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h3 className="font-luxury text-2xl font-medium text-vailo-dark">{plan.name}</h3>
          <p className="mt-1 text-sm text-vailo-dark/60">{plan.tagline}</p>
        </div>
        {plan.saving && (
          <span className="flex-none rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-200">
            {plan.saving}
          </span>
        )}
      </div>

      <div className="relative mt-6">
        <p className="flex items-baseline gap-1.5">
          <span className="text-5xl font-extrabold tracking-tight text-vailo-dark">
            €{plan.pricePerPropertyEur}
          </span>
          <span className="text-base font-semibold text-vailo-dark/50">/ property / year</span>
        </p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-xl bg-vailo-teal/8 px-3 py-1.5 text-sm font-bold text-vailo-teal">
          {plan.propertiesLabel}
        </p>
        <p className="mt-2 text-xs font-medium text-vailo-dark/50">
          {plan.id === 'solo'
            ? '€49 billed annually'
            : `e.g. ${exampleCount} properties → €${formatInt(exampleTotal)}/yr`}
        </p>
      </div>

      <ul className="relative mt-7 flex-1 space-y-3">
        {PLAN_INCLUDES.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm font-medium text-vailo-dark/80">
            <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-vailo-teal/10 text-vailo-teal">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <Button
        to={`/contact?intent=demo&plan=${encodeURIComponent(plan.name)}`}
        variant={plan.popular ? 'primary' : 'dark'}
        size="lg"
        className="relative mt-8 w-full"
      >
        Book a Demo
      </Button>
    </motion.div>
  );
}

function PricingSection({ id = 'pricing-overview' }: { id?: string }) {
  return (
    <section id={id} className="relative scroll-mt-24 overflow-hidden bg-gradient-to-b from-white via-[#f3f7f6] to-white py-20 sm:py-28">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Pricing"
            title="Simple, transparent pricing that pays for itself."
            subtitle="Pay per property, billed annually. The more you manage, the lower the rate. Every plan includes every feature."
          />
        </Reveal>

        <div className="mt-16 grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.08} className="h-full">
              <PricingCard plan={plan} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mx-auto mt-12 flex max-w-3xl items-start gap-4 rounded-3xl border border-vailo-gold/40 bg-gradient-to-r from-[#fdf6e3] to-[#f9ecc9] p-5 shadow-[0_20px_50px_-24px_rgba(197,160,89,0.7)] sm:items-center sm:p-6">
            <p className="text-center text-sm font-semibold leading-relaxed text-vailo-dark sm:text-base">
              💡 Clear economics: on Vailo excursions you earn 1/3 of our margin; on your featured partners you keep
              100% of your agreed margin. Access from booking day gives more time for both.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4f. SECTIONS — shared CTA, steps, FAQ, page hero
 * ========================================================================= */

function FinalCta({
  title = 'Set the property up once. Guests open from booking day.',
  subtitle =
    'Private guest link after every booking, QR on arrival, quieter inbox, plus clear income: 1/3 of Vailo’s excursion margin, and 100% of your featured-partner margins.',
  showEaseLine = true,
  compact = false,
}: {
  title?: string;
  subtitle?: ReactNode;
  showEaseLine?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={cx('px-3 sm:px-6', compact ? 'pb-12 sm:pb-16' : 'pb-20 sm:pb-28')}>
      <Reveal>
        <div
          className={cx(
            'relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-vailo-dark via-[#073a45] to-vailo-teal text-center text-white shadow-[0_40px_80px_-30px_rgba(5,31,38,0.7)]',
            compact ? 'px-6 py-12 sm:px-12 sm:py-14' : 'px-6 py-16 sm:px-12 sm:py-20'
          )}
        >
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-vailo-gold/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-luxury text-3xl font-medium leading-tight sm:text-4xl lg:text-5xl">{title}</h2>
            {showEaseLine && (
              <div className="mt-4">
                <SetupEaseLine light align="center" />
              </div>
            )}
            <div className={cx('text-base text-white/70 sm:text-lg', showEaseLine ? 'mt-3' : 'mt-4')}>
              {subtitle}
            </div>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {compact ? (
                <>
                  <Button to="/contact?intent=trial" size="lg">
                    Start 1 week free
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Button>
                  <Button to="/contact?intent=demo" variant="glass" size="lg">
                    Book a Demo
                  </Button>
                </>
              ) : (
                <>
                  <Button to="/contact?intent=demo" size="lg">
                    Book a Demo
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Button>
                  <Button href={LIVE_DEMO_HREF} variant="glass" size="lg">
                    Try guest demo
                    <ExternalLink className="h-4 w-4 opacity-80" aria-hidden />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function PropertyAnalyticsSection() {
  return (
    <section id="property-analytics" className={cx('relative overflow-hidden', SECTION_SCROLL_MT, SECTION_PAD_COMPACT)}>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#eef5f4] to-white" />
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Property analytics"
            title="For property owners: see how guests use your stay."
            subtitle="In Vailo admin, every property has Analytics. You see if guests opened the portal, what they asked the AI, which local tips they used, and which tours they booked — stay by stay."
          />
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-8 rounded-[1.5rem] border border-vailo-gold/35 bg-vailo-gold/10 px-5 py-6 sm:px-7 sm:py-7">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-gold-muted">
              Why this helps you as a host
            </p>
            <p className="mt-2 max-w-2xl text-base font-semibold text-vailo-dark sm:text-lg">
              Analytics are not just charts. They help you run the property with less guesswork.
            </p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {PROPERTY_ANALYTICS_HOST_BENEFITS.map((b) => (
                <li key={b.title} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-vailo-gold/25 text-vailo-gold-muted"
                    aria-hidden
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-vailo-dark">{b.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-vailo-dark/65">{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="mt-10 overflow-hidden rounded-[1.5rem] bg-vailo-dark text-white shadow-[0_28px_60px_-28px_rgba(5,31,38,0.5)]">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-gold">
                What you see at the top of Analytics
              </p>
              <p className="mt-1 text-sm text-white/60">Six totals for your property — explained in plain words.</p>
            </div>
            <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {PROPERTY_ANALYTICS_KPIS.map((kpi) => (
                <div key={kpi.label} className="bg-vailo-dark px-5 py-5 sm:px-6">
                  <p className="text-base font-bold text-white">{kpi.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/55">{kpi.meaning}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <ul className="space-y-3">
            {PROPERTY_ANALYTICS_METRICS.map((m, i) => (
              <Reveal key={m.title} delay={i * 0.04}>
                <li className="rounded-2xl bg-white p-5 shadow-[0_14px_40px_-24px_rgba(5,31,38,0.28)] ring-1 ring-vailo-dark/6">
                  <div className="flex gap-3">
                    <IconTile icon={m.icon} className="h-11 w-11 flex-none" />
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-vailo-dark">{m.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-vailo-dark/65">{m.text}</p>
                      <p className="mt-2 text-[13px] font-semibold text-vailo-teal">→ {m.action}</p>
                    </div>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={0.08}>
            <div className="lg:sticky lg:top-28">
              <div className="overflow-hidden rounded-3xl bg-vailo-dark p-2 shadow-[0_40px_80px_-30px_rgba(5,31,38,0.55)] ring-1 ring-vailo-dark/10">
                <img
                  src="/website/screenshots/admin-analytics-list.png"
                  alt="Vailo admin property analytics: sessions, portal visits, assistant turns, Live Like a Local and excursion activity"
                  className="w-full rounded-2xl bg-white"
                  loading="lazy"
                />
              </div>
              <div className="mt-5 rounded-2xl bg-white p-5 shadow-[0_14px_40px_-24px_rgba(5,31,38,0.28)] ring-1 ring-vailo-dark/6">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-teal">How to read it</p>
                <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-vailo-dark/70">
                  <li>
                    <span className="font-bold text-vailo-dark">1.</span> Check the six totals — is the portal being used?
                  </li>
                  <li>
                    <span className="font-bold text-vailo-dark">2.</span> Open a stay row to see that guest’s activity.
                  </li>
                  <li>
                    <span className="font-bold text-vailo-dark">3.</span> Fix the House Guide, local picks, or tours before the next booking.
                  </li>
                </ol>
                <p className="mt-4 text-[13px] font-semibold text-vailo-dark/45">
                  Only real guest activity is tracked. Admin preview and tester codes are excluded.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function StatsSection({
  tone = 'light',
  showReference = false,
}: {
  tone?: 'light' | 'dark';
  showReference?: boolean;
}) {
  const dark = tone === 'dark';
  const ref = useMemo(() => calcRoi(STATS_REFERENCE_GUESTS), []);
  const conversionPct = Math.round(ROI.excursionConversion * 100);
  const marginPct = Math.round(ROI.exampleMarginRate * 100);

  return (
    <section
      id="stats"
      className={cx(
        'relative overflow-hidden',
        SECTION_SCROLL_MT,
        SECTION_PAD_COMPACT,
        dark ? 'bg-vailo-dark text-white' : ''
      )}
    >
      {!dark && <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#eef5f4] via-white to-white" />}
      {dark && (
        <>
          <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-vailo-teal/40 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-vailo-gold/20 blur-3xl" />
        </>
      )}
      <Container className="relative">
        <Reveal>
          <SectionHeading
            light={dark}
            align="left"
            eyebrow="By the numbers"
            title="Key numbers, explained simply."
            subtitle="These are the main rates behind Vailo. Use the ROI calculator on the home page to try them with your own guest numbers."
          />
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.05}>
              <div
                className={cx(
                  'h-full rounded-[1.5rem] p-6 ring-1',
                  dark
                    ? 'bg-white/5 ring-white/10'
                    : 'bg-white shadow-[0_18px_50px_-28px_rgba(5,31,38,0.28)] ring-vailo-dark/8'
                )}
              >
                <p
                  className={cx(
                    'font-luxury text-4xl font-medium tracking-tight sm:text-5xl',
                    dark ? 'text-vailo-gold' : 'text-vailo-teal'
                  )}
                >
                  {stat.kind === 'number' ? (
                    <AnimatedNumber
                      value={stat.value}
                      prefix={'prefix' in stat ? stat.prefix : ''}
                      suffix={stat.suffix ?? ''}
                      decimals={'decimals' in stat ? stat.decimals : 0}
                    />
                  ) : (
                    stat.display
                  )}
                </p>
                <p className={cx('mt-3 text-base font-bold leading-snug', dark ? 'text-white' : 'text-vailo-dark')}>
                  {stat.label}
                </p>
                <p className={cx('mt-1.5 text-sm leading-relaxed', dark ? 'text-white/55' : 'text-vailo-dark/55')}>
                  {stat.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {showReference && (
          <Reveal delay={0.12}>
            <div
              className={cx(
                'mt-8 overflow-hidden rounded-[1.5rem] ring-1',
                dark ? 'bg-white/5 ring-white/10' : 'bg-white ring-vailo-dark/8 shadow-[0_18px_50px_-28px_rgba(5,31,38,0.28)]'
              )}
            >
              <div
                className={cx(
                  'flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6',
                  dark ? 'border-white/10' : 'border-vailo-dark/8'
                )}
              >
                <div>
                  <p
                    className={cx(
                      'text-[11px] font-extrabold uppercase tracking-[0.16em]',
                      dark ? 'text-vailo-gold' : 'text-vailo-teal'
                    )}
                  >
                    Example
                  </p>
                  <p className={cx('mt-1 text-base font-bold', dark ? 'text-white' : 'text-vailo-dark')}>
                    {STATS_REFERENCE_GUESTS} guests per month
                  </p>
                </div>
                <p className={cx('text-sm', dark ? 'text-white/50' : 'text-vailo-dark/50')}>
                  Same rules as the ROI calculator
                </p>
              </div>
              <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-4" style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(5,31,38,0.08)' }}>
                {[
                  {
                    label: 'Hours saved / month',
                    node: <AnimatedNumber value={ref.hoursSaved} suffix=" h" />,
                  },
                  {
                    label: 'Tour margin to you / month',
                    node: <AnimatedNumber value={ref.monthlyIncome} prefix="€" decimals={2} />,
                  },
                  {
                    label: 'Tour margin to you / year',
                    node: <AnimatedNumber value={ref.yearlyIncome} prefix="€" decimals={0} />,
                  },
                  {
                    label: 'Team time freed',
                    node: <AnimatedNumber value={ref.fteFreed} suffix=" full-time months" decimals={2} />,
                  },
                ].map((cell) => (
                  <div key={cell.label} className={cx('px-5 py-5 sm:px-6', dark ? 'bg-vailo-dark' : 'bg-white')}>
                    <p className={cx('text-[11px] font-extrabold uppercase tracking-[0.16em]', dark ? 'text-white/40' : 'text-vailo-dark/40')}>
                      {cell.label}
                    </p>
                    <p className={cx('mt-2 font-luxury text-3xl font-medium', dark ? 'text-vailo-gold' : 'text-vailo-teal')}>
                      {cell.node}
                    </p>
                  </div>
                ))}
              </div>
              <p className={cx('px-5 py-4 text-sm leading-relaxed sm:px-6', dark ? 'text-white/50' : 'text-vailo-dark/55')}>
                This example assumes {conversionPct}% of guests book a Vailo tour at €{ROI.avgBookingEur}, with a{' '}
                {marginPct}% margin (example only). You get 1/3 of that margin, plus about {ROI.hoursSavedPerGuest} hours
                saved per guest. Income from your own partners is extra and stays 100% yours. Real results can differ.
              </p>
            </div>
          </Reveal>
        )}
      </Container>
    </section>
  );
}

function GuestAccessMock() {
  return (
    <div className="relative mx-auto w-full max-w-[280px] space-y-3">
      <div className="absolute -inset-4 rounded-3xl bg-vailo-gold/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-[0_28px_60px_-24px_rgba(5,31,38,0.45)] ring-1 ring-vailo-dark/10">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-vailo-teal/10 text-vailo-teal">
            <Link2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-vailo-teal">From booking day</p>
            <p className="truncate text-sm font-bold text-vailo-dark">Guest link, auto-sent</p>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-[#f3f6f5] px-3 py-2.5 font-mono text-[11px] font-semibold text-vailo-dark/70 ring-1 ring-vailo-dark/6">
          vailo.app/villa-sunset/…
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-vailo-dark/60">
          Opened the day they book, used until checkout. More time for partners, transfers and tours.
        </p>
      </div>
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_18px_40px_-24px_rgba(5,31,38,0.35)] ring-1 ring-vailo-dark/8">
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-[#f3f6f5] text-vailo-dark ring-1 ring-vailo-dark/8">
          <QrCode className="h-9 w-9" strokeWidth={1.25} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-vailo-dark/40">On arrival</p>
          <p className="text-sm font-bold text-vailo-dark">QR poster, A5 / A4</p>
          <p className="mt-0.5 text-[11px] text-vailo-dark/55">Same portal, scan in the property</p>
        </div>
      </div>
    </div>
  );
}

function HowItWorks({ compact }: { compact?: boolean } = {}) {
  const steps: { icon: LucideIcon; title: string; text: ReactNode }[] = [
    {
      icon: Sparkles,
      title: 'Set the property up once',
      text: (
        <>
          Guided setup you finish once.{' '}
          <span className="font-semibold text-vailo-teal">Automated</span>,{' '}
          <span className="font-semibold text-vailo-teal">effortless</span>,{' '}
          <span className="font-semibold text-vailo-teal">fast</span>. Add your House Guide (appliances, Wi-Fi,
          rules) and Vailo turns it into the guest portal.
        </>
      ),
    },
    {
      icon: Link2,
      title: 'Guests get a link when they book',
      text: 'Right after booking (your site, Airbnb, Booking.com…), they receive an automated private link. Access starts that day, not only on arrival, and lasts until they leave.',
    },
    {
      icon: QrCode,
      title: 'QR poster for arrival',
      text: 'Print the A5/A4 poster for the property. Guests who prefer to scan on arrival open the same portal, no app needed.',
    },
    {
      icon: Wallet,
      title: 'Promote partners. Keep the upside.',
      text: 'Access from booking day means more bookings before check-in. Vailo excursions: 1/3 of our margin to you. Your featured partners: you keep 100% of your agreed margin.',
    },
  ];
  return (
    <section
      id="how-vailo-works"
      className={cx('relative overflow-hidden', SECTION_SCROLL_MT, compact ? SECTION_PAD_COMPACT : SECTION_PAD)}
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#eef5f4] via-white to-white" />
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          <div>
            <Reveal>
              <SectionHeading
                align="left"
                eyebrow="How Vailo works"
                title="Access from booking day, not only from arrival."
                easeLine
                subtitle="Set the property up once. Guests open a private link as soon as they book, use it until checkout, and can still scan the QR when they walk in."
              />
            </Reveal>
            <ol className="mt-10 space-y-4">
              {steps.map((s, i) => (
                <Reveal key={s.title} delay={i * 0.07}>
                  <li className="relative flex gap-4 rounded-2xl bg-white/90 p-4 shadow-[0_14px_40px_-24px_rgba(5,31,38,0.35)] ring-1 ring-vailo-dark/6 sm:p-5">
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-vailo-teal text-sm font-extrabold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <s.icon className="h-4 w-4 text-vailo-gold-muted" aria-hidden />
                        <h3 className="text-base font-bold text-vailo-dark sm:text-lg">{s.title}</h3>
                      </div>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-vailo-dark/65">{s.text}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal delay={0.12} className="lg:pl-4">
            <GuestAccessMock />
            <p className="mx-auto mt-6 max-w-xs text-center text-sm font-semibold text-vailo-dark/55">
              Link first for early bookings. QR on arrival for the same stay portal.
            </p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-vailo-dark/8">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="text-base font-bold text-vailo-dark">{item.q}</span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="flex-none text-vailo-teal">
                <ChevronDown className="h-5 w-5" aria-hidden />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 text-[15px] leading-relaxed text-vailo-dark/65">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Compact hero used by inner pages. Each menu category gets its own photo + product shots. */
function PageHero({
  eyebrow,
  title,
  subtitle,
  easeLine,
  children,
  image = '/portal-book-arrange-hero.png',
  imagePosition = '50% 40%',
  previews,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  easeLine?: boolean;
  children?: ReactNode;
  image?: string;
  imagePosition?: string;
  previews?: string[];
}) {
  const hasPreviews = Boolean(previews?.length);
  return (
    <section className="relative isolate overflow-hidden pb-14 pt-36 sm:pb-20 sm:pt-44">
      <div className="absolute inset-0 z-0">
        <img
          src={image}
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-50"
          style={{ objectPosition: imagePosition }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-[#f6faf9]/88 to-white" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/45 to-white/25" />
      </div>
      <Container className="relative z-10">
        <div className={cx('grid items-center gap-10', hasPreviews && 'lg:grid-cols-[1.05fr_0.95fr]')}>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className={hasPreviews ? 'text-center lg:text-left' : 'text-center'}
          >
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1
              className={cx(
                'font-luxury mt-6 max-w-3xl text-4xl font-medium leading-[1.1] tracking-tight text-vailo-dark sm:text-5xl lg:text-6xl',
                !hasPreviews && 'mx-auto'
              )}
            >
              {title}
            </h1>
            {easeLine && (
              <div className={cx('mt-4 max-w-2xl', !hasPreviews ? 'mx-auto' : 'mx-auto lg:mx-0')}>
                <SetupEaseLine
                  className={!hasPreviews ? 'text-center' : 'text-center lg:text-left'}
                />
              </div>
            )}
            <div
              className={cx(
                'max-w-2xl text-lg leading-relaxed text-vailo-dark/65',
                easeLine ? 'mt-3' : 'mt-5',
                !hasPreviews && 'mx-auto'
              )}
            >
              {subtitle}
            </div>
            {children && (
              <div className={cx('mt-8 flex flex-col gap-3 sm:flex-row', hasPreviews ? 'justify-center lg:justify-start' : 'justify-center')}>
                {children}
              </div>
            )}
          </motion.div>

          {hasPreviews && (
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
              className="relative mx-auto h-[340px] w-full max-w-md sm:h-[400px]"
            >
              {previews!.slice(0, 3).map((src, i) => {
                const frames = [
                  'left-0 top-6 w-[58%] -rotate-6',
                  'right-0 top-0 w-[62%] rotate-3',
                  'bottom-0 left-1/2 w-[56%] -translate-x-1/2 rotate-1',
                ];
                return (
                  <div
                    key={src}
                    className={cx(
                      'absolute overflow-hidden rounded-2xl bg-white shadow-[0_24px_50px_-18px_rgba(5,31,38,0.45)] ring-1 ring-vailo-dark/10',
                      frames[i]
                    )}
                    style={{ zIndex: i + 1 }}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover object-top" />
                  </div>
                );
              })}
            </motion.div>
          )}
        </div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 5. PAGES
 * ========================================================================= */

export function ImpactPage() {
  usePageMeta(
    'Impact, Vailo',
    'For property owners: how Vailo saves your time, helps your guests, and creates extra income from booking day to checkout.'
  );
  return (
    <>
      <PageHero
        eyebrow="For property owners"
        title="What Vailo changes for your property."
        subtitle="Written for owners and hosts. Simple steps: less work for you, a better stay for guests, and clearer ways to earn more."
        image="/portal-ai-chatbot-hero.png"
        imagePosition="48% 38%"
      >
        <Button to="/contact?intent=demo" size="lg">
          Book a Demo
        </Button>
        <Button to="/contact?intent=trial" variant="secondary" size="lg">
          Start 1 week free
        </Button>
      </PageHero>

      <StatsSection tone="dark" showReference />

      <section className="pb-12 pt-16 sm:pb-16 sm:pt-24">
        <Container>
          <Reveal>
            <SectionHeading
              title="Three things you get as an owner."
              subtitle="These are the three lines from the home page. Here is what each one means for your property."
            />
          </Reveal>

          <div className="mt-10 space-y-5">
            {IMPACT_SYSTEM.map((row, i) => (
              <Reveal key={row.id} delay={i * 0.05}>
                <article className="rounded-[1.5rem] bg-vailo-dark p-6 text-white shadow-[0_28px_60px_-28px_rgba(5,31,38,0.55)] sm:p-8">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-gold">
                    Promise {row.id}
                  </p>
                  <h3 className="font-luxury mt-3 text-2xl font-medium leading-snug sm:text-3xl">{row.claim}</h3>
                  <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/70 sm:text-[17px]">
                    {row.definition}
                  </p>
                  <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/40">
                        What changes
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-white/90 sm:text-base">{row.variable}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/40">
                        What we look at
                      </p>
                      <p className="mt-1.5 text-sm font-medium text-vailo-gold/90 sm:text-base">{row.measure}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="pb-16 sm:pb-24">
        <Container>
          <Reveal>
            <SectionHeading
              eyebrow="Owner benefits"
              title="Eight ways Vailo helps your property."
              subtitle="Same points as the home-page checklist. For each one: what changes for you, the key number, and how it works."
            />
          </Reveal>

          <ol className="mt-10 space-y-5">
            {IMPACT_CAPABILITIES.map((cap, i) => (
              <Reveal key={cap.n} delay={Math.min(i * 0.04, 0.24)}>
                <li className="overflow-hidden rounded-[1.5rem] bg-white p-6 shadow-[0_18px_50px_-28px_rgba(5,31,38,0.28)] ring-1 ring-vailo-dark/8 sm:p-8">
                  <div className="flex items-start gap-4">
                    <p className="font-mono text-2xl font-bold tracking-tight text-vailo-teal">{cap.n}</p>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-bold leading-snug text-vailo-dark sm:text-2xl">{cap.claim}</h3>
                      <p className="mt-3 max-w-3xl text-base leading-relaxed text-vailo-dark/70">{cap.mechanism}</p>
                      <p className="mt-4 rounded-xl bg-[#f3f6f5] px-4 py-3 text-sm font-semibold leading-relaxed text-vailo-dark/75 ring-1 ring-vailo-dark/6">
                        In short: {cap.formula}
                      </p>
                      <dl className="mt-5 grid gap-4 border-t border-vailo-dark/8 pt-5 sm:grid-cols-3">
                        <div>
                          <dt className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-dark/40">
                            What it changes
                          </dt>
                          <dd className="mt-1.5 text-sm font-semibold text-vailo-dark sm:text-base">{cap.lever}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-dark/40">
                            Key number
                          </dt>
                          <dd className="mt-1.5 text-sm font-semibold text-vailo-teal sm:text-base">{cap.kpi}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-vailo-dark/40">
                            Measured in
                          </dt>
                          <dd className="mt-1.5 text-sm font-medium text-vailo-dark/70 sm:text-base">{cap.unit}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </Container>
      </section>

      <PropertyAnalyticsSection />

      <FinalCta
        title="Ready to see this on your property?"
        subtitle="Start a free week, or book a short demo. We will show you the guest portal and the analytics for a property like yours."
        showEaseLine={false}
      />
    </>
  );
}

export function HomePage() {
  usePageMeta(
    'Vailo, AI guest portal for vacation rentals',
    'Guests get an automated Vailo link from booking day to checkout, plus a QR on arrival. Earn 1/3 of Vailo’s excursion margin, keep 100% of your featured-partner margins, and cut guest messages.'
  );
  return (
    <>
      <Hero />
      <RevenueShare compact />
      <HowItWorks compact />
      <GuestJourney />
      <RoiCalculator />
      <TeamSavings />
      <HostProof />
      <PropertyAnalyticsSection />
      <FinalCta compact />
    </>
  );
}

export function FeaturesPage() {
  usePageMeta(
    'Features, Vailo',
    'AI property assistant, Live Like a Local, global excursions and automated check-in, all in one guest portal.'
  );
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Set the property up once. Guests help themselves from booking day."
        easeLine
        subtitle="Guided setup that takes little time. An automated link after every booking, a QR on arrival, then Vailo takes the repetitive work and turns early interest into partner and tour income."
        image="/portal-ai-chatbot-hero.png"
        imagePosition="48% 38%"
        previews={[
          '/website/screenshots/portal-ai-assistant.png',
          '/website/screenshots/portal-live-like-local.png',
          '/website/screenshots/portal-house-guide.png',
        ]}
      >
        <Button to="/contact?intent=demo" size="lg">
          Book a Demo
        </Button>
        <Button href={LIVE_DEMO_HREF} variant="secondary" size="lg">
          Try guest demo
          <ExternalLink className="h-4 w-4 opacity-70" aria-hidden />
        </Button>
      </PageHero>
      <FeaturesSection detailed />
      <HowItWorks />
      <RevenueShare />
      <PropertyAnalyticsSection />
      <FinalCta />
    </>
  );
}

export function PricingPage() {
  usePageMeta(
    'Pricing, Vailo',
    'Simple annual pricing from €49 per property. Earn 1/3 of Vailo’s excursion margin; keep 100% of your featured-partner margins.'
  );
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Priced to disappear into your margins."
        subtitle="Annual plans for every portfolio size, with clear booking economics that favour the host."
        image="/portal-ai-chatbot-hero.png"
        imagePosition="30% 55%"
        previews={[
          '/website/screenshots/admin-analytics-list.png',
          '/website/screenshots/admin-house-guide.png',
          '/website/screenshots/portal-excursions.png',
        ]}
      />
      <div className="-mt-10">
        <PricingSection id="plans" />
      </div>
      <RevenueShare />
      <section className="pb-20 sm:pb-28">
        <Container>
          <Reveal>
            <SectionHeading title="Questions, answered." />
          </Reveal>
          <Reveal delay={0.08} className="mt-10">
            <Faq
              items={[
                {
                  q: 'When do guests get access to Vailo?',
                  a: 'Right after booking, not only on arrival. They receive an automated private link and can use the portal from that day until checkout. The A5/A4 QR poster is for scanning at the property, same experience.',
                },
                {
                  q: 'How long does property setup take?',
                  a: (
                    <>
                      You set the property up once.{' '}
                      <span className="font-semibold text-vailo-teal">Automated</span>,{' '}
                      <span className="font-semibold text-vailo-teal">effortless</span>,{' '}
                      <span className="font-semibold text-vailo-teal">fast</span>. After that, guests help themselves
                      from booking day onward.
                    </>
                  ),
                },
                {
                  q: 'How does early access help me earn more?',
                  a: 'Guests have days or weeks from booking day to book before arrival. That means more Vailo excursions (you earn 1/3 of our margin) and more of your featured-partner bookings (you keep 100% of your agreed margin).',
                },
                {
                  q: 'Do my guests need to install an app?',
                  a: 'No. They open the link or scan the QR in any browser. Nothing to download, nothing to sign up for.',
                },
                {
                  q: 'Can this reduce how many people I need on guest support?',
                  a: 'Yes. Vailo takes the repetitive Wi-Fi, arrival, appliance and local-tip questions. Many hosts reassign that capacity, and growing portfolios often avoid hiring the next guest-ops person.',
                },
                {
                  q: 'How does the 1/3 revenue share work?',
                  a: 'Only on Vailo-supplied excursions and services, and only on our commission margin, not the guest ticket price. Example: 10% margin on €100 = €10 → you get ~€3.33, Vailo ~€6.67. Featured partnerships you bring keep 100% of your margin.',
                },
                {
                  q: 'Is every plan the same product?',
                  a: 'Yes. Pricing only changes with how many properties you manage. Every plan includes the guest link, QR poster, AI assistant, House Guide, Live Like a Local, Vailo excursions, and your featured partners.',
                },
                {
                  q: 'How is the annual total calculated?',
                  a: 'You pay the per-property rate for your portfolio size × the number of properties. One property is €49/year; 2–20 are €39 each; 21–50 are €29 each; 51+ are €19 each.',
                },
                {
                  q: 'What if I manage a large team already?',
                  a: 'Keep the people who create great stays, free them from inbox triage. Vailo is built so guest messaging doesn’t scale linearly with your portfolio.',
                },
              ]}
            />
          </Reveal>
        </Container>
      </section>
      <PropertyAnalyticsSection />
      <FinalCta />
    </>
  );
}

export function TourProvidersPage() {
  usePageMeta(
    'Tour Providers, Vailo',
    'List your tours and experiences with Vailo and reach guests while they plan their stay, from booking day onward.'
  );
  const benefits = [
    {
      icon: MapPin,
      title: 'Reach guests at the right moment',
      text: 'Your experiences appear inside the guest portal from booking day, right when they’re deciding what to do.',
    },
    {
      icon: CalendarCheck,
      title: 'Bookings, handled',
      text: 'Guests browse and request in a few taps. You see every booking in one place.',
    },
    {
      icon: SlidersHorizontal,
      title: 'Stay in control',
      text: 'Manage your listings, availability and discounts from your own provider portal.',
    },
    {
      icon: ShieldCheck,
      title: 'Clear partner terms',
      text: 'A straightforward partner agreement, so everyone knows how bookings and revenue sharing work.',
    },
  ];
  return (
    <>
      <PageHero
        eyebrow="For tour providers"
        title="Put your experiences in front of guests who are ready to book."
        subtitle="Partner with Vailo and get your tours and activities recommended inside vacation rentals and boutique hotels."
        image="/portal-book-arrange-hero.png"
        imagePosition="50% 42%"
        previews={[
          '/website/screenshots/portal-excursions.png',
          '/website/screenshots/portal-local-services.png',
          '/website/screenshots/portal-live-like-local_2.png',
        ]}
      >
        <Button to="/contact?intent=partner" size="lg">
          Become a partner
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Button>
      </PageHero>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-6 sm:grid-cols-2">
            {benefits.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.07}>
                <div className="flex h-full gap-5 rounded-3xl bg-white p-7 shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/6">
                  <IconTile icon={b.icon} className="flex-none" />
                  <div>
                    <h3 className="font-luxury text-xl font-medium">{b.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-vailo-dark/65">{b.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="How it works" title="From first call to first booking." />
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { n: 1, t: 'Get in touch', d: 'Tell us about your tours and the destinations you operate in.' },
              { n: 2, t: 'List your experiences', d: 'Add your tours, schedules and prices in the provider portal.' },
              { n: 3, t: 'Receive bookings', d: 'Guests book through their stay portal and you deliver the experience.' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <div className="h-full rounded-3xl bg-gradient-to-br from-vailo-dark to-vailo-teal p-7 text-white shadow-xl">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vailo-gold text-lg font-extrabold text-vailo-dark">
                    {s.n}
                  </span>
                  <h3 className="font-luxury mt-5 text-xl font-medium">{s.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/70">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <FinalCta
        title="Let’s fill your next departure."
        subtitle="Join the tour operators already reaching travellers through Vailo."
        showEaseLine={false}
      />
    </>
  );
}

type ContactIntent = 'demo' | 'trial' | 'partner' | 'general';

const CONTACT_COPY: Record<ContactIntent, { eyebrow: string; title: string; subtitle: string; message: (plan: string) => string; role: string }> = {
  demo: {
    eyebrow: 'Book a demo',
    title: 'See Vailo on a property like yours.',
    subtitle: 'Tell us a little about your portfolio and we’ll set up a short walkthrough, no fake “trial” button.',
    message: (plan) =>
      `Hi Vailo team, I’d like to book a demo${plan ? ` (interested in ${plan})` : ''}.`,
    role: '',
  },
  trial: {
    eyebrow: '1 week free trial',
    title: 'Start your free week on Vailo.',
    subtitle: 'Leave your details and we’ll get your 1 week free trial set up.',
    message: (plan) =>
      `Hi Vailo team, I’d like to start the 1 week free trial${plan ? ` (${plan} plan)` : ''}.`,
    role: '',
  },
  partner: {
    eyebrow: 'Tour providers',
    title: 'Become a Vailo tour partner.',
    subtitle: 'Share a little about your tours and where you operate.',
    message: () => 'Hi Vailo team, we’d like to list our tours and experiences with Vailo.',
    role: 'Tour provider',
  },
  general: {
    eyebrow: 'Contact',
    title: 'Talk to the Vailo team.',
    subtitle: 'Questions, ideas or feedback? We’d love to hear from you.',
    message: () => '',
    role: '',
  },
};

const ROLE_OPTIONS = ['Property owner', 'Property manager', 'Hospitality operator', 'Tour provider', 'Other'];

type FormStatus = 'idle' | 'sending' | 'sent' | 'error';

export function ContactPage() {
  const [params] = useSearchParams();
  const rawIntent = params.get('intent');
  const intent: ContactIntent = rawIntent === 'demo' || rawIntent === 'trial' || rawIntent === 'partner' ? rawIntent : 'general';
  const plan = params.get('plan') ?? '';
  const copy = CONTACT_COPY[intent];

  usePageMeta('Contact, Vailo', 'Book a demo, start a free trial or get in touch with the Vailo team.');

  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState('');
  const formKey = `${intent}-${plan}`;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = Object.fromEntries(
      ['name', 'email', 'company', 'role', 'phone', 'message', 'website'].map((k) => [k, String(data.get(k) ?? '').trim()])
    );

    if (payload.name.length < 2) return fail('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return fail('Please enter a valid email address.');
    if (payload.phone && !/^[\d\s+\-().]{6,}$/.test(payload.phone)) return fail('Please enter a valid telephone number.');
    if (payload.message.length < 10) return fail('Please enter a message (at least 10 characters).');

    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok !== true) throw new Error(body.error || 'Something went wrong. Please try again.');
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error && err.message
          ? err.message
          : `Could not send your message. Please email ${CONTACT_EMAIL} directly.`
      );
    }
  }

  function fail(message: string) {
    setStatus('error');
    setError(message);
  }

  const inputClass =
    'w-full rounded-2xl border border-vailo-dark/10 bg-white px-4 py-3.5 text-[15px] text-vailo-dark outline-none transition placeholder:text-vailo-dark/35 focus:border-vailo-teal/60 focus:ring-4 focus:ring-vailo-teal/10';
  const labelClass = 'mb-1.5 block text-sm font-bold text-vailo-dark/80';

  return (
    <>
      <PageHero
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={copy.subtitle}
        image="/portal-ai-chatbot-hero.png"
        imagePosition="62% 35%"
        previews={['/guest-portal-mockup.png', '/website/screenshots/portal-ai-assistant.png']}
      />
      <section className="pb-20 sm:pb-28">
        <Container>
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <div className="h-full rounded-3xl bg-gradient-to-br from-vailo-dark to-vailo-teal p-8 text-white shadow-2xl">
                <h2 className="font-luxury text-2xl font-medium">What happens next?</h2>
                <ul className="mt-6 space-y-5">
                  {[
                    { icon: Mail, t: 'We read every message', d: 'A real person from the Vailo team replies to you directly.' },
                    { icon: MessageCircle, t: 'We learn about your property', d: 'A few quick questions so the demo fits your needs.' },
                    { icon: Sparkles, t: 'You see Vailo in action', d: 'Your guests’ local best friend, ready to go.' },
                  ].map(({ icon: Icon, t, d }) => (
                    <li key={t} className="flex gap-4">
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white/12 text-vailo-gold ring-1 ring-white/15">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-bold">{t}</p>
                        <p className="text-sm text-white/65">{d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-vailo-gold underline-offset-4 hover:underline"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="rounded-3xl bg-white p-6 shadow-[0_30px_70px_-30px_rgba(5,31,38,0.35)] ring-1 ring-vailo-dark/6 sm:p-9">
                <AnimatePresence mode="wait">
                  {status === 'sent' ? (
                    <motion.div
                      key="sent"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="py-12 text-center"
                    >
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
                        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      >
                        <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
                      </motion.span>
                      <h2 className="font-luxury mt-6 text-3xl font-medium">Thank you!</h2>
                      <p className="mx-auto mt-3 max-w-sm text-vailo-dark/65">
                        Your message is on its way. We’ll be in touch very soon.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.form
                      key={formKey}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onSubmit={onSubmit}
                      noValidate
                      className="space-y-5"
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="c-name" className={labelClass}>
                            Name *
                          </label>
                          <input id="c-name" name="name" autoComplete="name" required placeholder="Your name" className={inputClass} />
                        </div>
                        <div>
                          <label htmlFor="c-email" className={labelClass}>
                            Email *
                          </label>
                          <input
                            id="c-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            placeholder="you@company.com"
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="c-company" className={labelClass}>
                            Company / property
                          </label>
                          <input id="c-company" name="company" autoComplete="organization" placeholder="Optional" className={inputClass} />
                        </div>
                        <div>
                          <label htmlFor="c-role" className={labelClass}>
                            I am a…
                          </label>
                          <select id="c-role" name="role" defaultValue={copy.role} className={inputClass}>
                            <option value="">Select</option>
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="c-phone" className={labelClass}>
                          Telephone
                        </label>
                        <input
                          id="c-phone"
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="c-message" className={labelClass}>
                          Message *
                        </label>
                        <textarea
                          id="c-message"
                          name="message"
                          required
                          rows={5}
                          defaultValue={copy.message(plan)}
                          placeholder="Tell us about your property or portfolio…"
                          className={cx(inputClass, 'resize-y')}
                        />
                      </div>

                      {/* honeypot — real users never see or fill this */}
                      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

                      <AnimatePresence>
                        {status === 'error' && error && (
                          <motion.p
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            role="alert"
                            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200"
                          >
                            {error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <Button type="submit" size="lg" disabled={status === 'sending'} className="w-full">
                        {status === 'sending' ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Sending…
                          </>
                        ) : (
                          <>
                            Send message <Send className="h-5 w-5" aria-hidden />
                          </>
                        )}
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}

function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';
  usePageMeta(`${title}, Vailo`, `${title} for the Vailo platform.`);
  const { resolved, loading } = usePlatformLegal('en');
  const live = isPrivacy ? resolved.privacyPolicy : resolved.termsOfUse;
  const html = !loading && !legalContentIsEmpty(live) ? live : getPlatformLegalTemplate('en', isPrivacy ? 'privacyPolicy' : 'termsOfUse');

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title={title}
        subtitle="How we handle data and what you can expect when using Vailo."
        image="/portal-book-arrange-hero.png"
        imagePosition="50% 20%"
      />
      <section className="pb-20 sm:pb-28">
        <Container>
          <article
            className="mx-auto max-w-3xl rounded-3xl bg-white p-6 text-[15px] leading-relaxed text-vailo-dark/80 shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/6 sm:p-10 [&_a]:font-semibold [&_a]:text-vailo-teal [&_a]:underline [&_h2]:font-luxury [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:text-vailo-dark [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-vailo-dark [&_li]:mt-1.5 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mt-3 [&_ul]:ml-5 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(html) }}
          />
        </Container>
      </section>
    </>
  );
}

export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
