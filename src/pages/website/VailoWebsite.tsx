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
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Coffee,
  Compass,
  Copy,
  FileText,
  Flame,
  Globe,
  Handshake,
  Lightbulb,
  Loader2,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  MousePointerClick,
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
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import { getPlatformLegalTemplate } from '../../lib/platformLegalDefaults';
import { legalContentIsEmpty, sanitizeLegalHtml } from '../../lib/legalHtml';
import { PLANS, ROI, calcRoi, pickPlan, type Plan } from '../../lib/websiteRoi';

/* ===========================================================================
 * 1. CONFIG & CONTENT
 * ========================================================================= */

const CONTACT_EMAIL = 'info@vailo.app';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/pricing', label: 'Pricing', end: false },
  { to: '/tour-providers', label: 'Tour Providers', end: false },
  { to: '/contact', label: 'Contact', end: false },
] as const;

const PLAN_INCLUDES = [
  '24/7 AI Property Assistant',
  'House Guide & Wi-Fi card',
  'Live Like a Local recommendations',
  'Bookable excursions + 33% revenue share',
  'Automated pre-arrival check-in',
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
      'Automated guest support built on your House Guide. Appliances, Wi-Fi, check-out rules — answered instantly, day or night.',
    detail: [
      'Answers come from your own House Guide, not guesswork',
      'Guests chat from a simple link or QR code — no app to install',
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
      'Arrange & book tours around the world directly from the guest portal — and earn 33% on every booking.',
    detail: [
      'Bookable tours from Viator and local tour operators',
      'Guests book in a couple of taps, right inside their stay',
      'A 33% revenue share lands with you, completely passively',
    ],
  },
  {
    id: 'checkin',
    icon: ClipboardCheck,
    title: 'Automated Check-in',
    blurb:
      'Collect arrival details before guests even land: arrival time, party details and special requests — hands-free.',
    detail: [
      'Pre-arrival form sent before every stay',
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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  light,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
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
      {subtitle && (
        <p
          className={cx(
            'mt-4 text-base leading-relaxed sm:text-lg',
            light ? 'text-white/70' : 'text-vailo-dark/65'
          )}
        >
          {subtitle}
        </p>
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
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const classes = cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
  if (to) {
    return (
      <Link to={to} className={classes}>
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
function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.7 });
  const text = useTransform(spring, (v) => `${prefix}${formatInt(v)}${suffix}`);
  useEffect(() => {
    if (reduce) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, spring]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/* ===========================================================================
 * 3. LAYOUT — header, footer, shell
 * ========================================================================= */

function SiteHeader() {
  const { pathname } = useLocation();
  // Keyed by pathname so the mobile menu closes automatically after navigating.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6">
      <div
        className={cx(
          'mx-auto max-w-6xl rounded-2xl border backdrop-blur-xl transition-all duration-300',
          scrolled
            ? 'border-white/70 bg-white/75 shadow-[0_10px_40px_-12px_rgba(5,31,38,0.25)]'
            : 'border-white/50 bg-white/55 shadow-[0_6px_24px_-14px_rgba(5,31,38,0.18)]'
        )}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <Link to="/" className="flex items-center" aria-label="Vailo home">
            <img src="/vailoLogo.png" alt="Vailo" className="h-9 w-auto sm:h-10" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="relative rounded-xl px-4 py-2 text-sm font-semibold">
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
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button to="/contact?intent=demo" size="sm" className="px-4 sm:px-5">
              Book a Demo
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

        <AnimatePresence initial={false}>
          {open && (
            <motion.nav
              id="mobile-nav"
              aria-label="Mobile"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden lg:hidden"
            >
              <div className="flex flex-col gap-1 border-t border-vailo-dark/5 p-3">
                {NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      cx(
                        'rounded-xl px-4 py-3 text-base font-semibold transition-colors',
                        isActive ? 'bg-vailo-teal/10 text-vailo-teal' : 'text-vailo-dark/75 hover:bg-vailo-dark/5'
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
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

const HERO_CHAT: ChatLine[] = [
  { from: 'guest', text: 'Hi! Where should we have dinner tonight? 🍷' },
  {
    from: 'ai',
    text: (
      <>
        Welcome, Sofia! Try <strong>Taverna Eleni</strong> — 6 min walk, a local favourite for grilled octopus. Want me
        to book a table?
      </>
    ),
  },
  { from: 'guest', text: 'Yes please. And what’s the Wi-Fi?' },
  {
    from: 'ai',
    text: (
      <>
        Done! ✅ Wi-Fi: <strong>Villa_Sunset</strong> · password <strong>sunset2026</strong>
      </>
    ),
  },
];

function useChatSequence(script: ChatLine[]) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? script.length : 0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;

    const step = () => {
      if (cancelled) return;
      if (i >= script.length) {
        timer = setTimeout(() => {
          if (cancelled) return;
          i = 0;
          setCount(0);
          timer = setTimeout(step, 900);
        }, 7000);
        return;
      }
      const isAi = script[i].from === 'ai';
      if (isAi) setTyping(true);
      timer = setTimeout(
        () => {
          if (cancelled) return;
          setTyping(false);
          i += 1;
          setCount(i);
          step();
        },
        isAi ? 1500 : 1100
      );
    };

    timer = setTimeout(step, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduce, script]);

  return { count, typing };
}

function PhoneMockup() {
  const reduce = useReducedMotion();
  const { count, typing } = useChatSequence(HERO_CHAT);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [count, typing]);

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
                <p className="text-[11px] text-vailo-dark/55">Villa Sunset · your local best friend</p>
              </div>
            </div>

            {/* messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-hidden px-3.5 py-4">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-vailo-dark/35">Today</p>
              <AnimatePresence initial={false}>
                {HERO_CHAT.slice(0, count).map((m, i) => (
                  <motion.div
                    key={`${i}-${m.from}`}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className={cx('flex', m.from === 'guest' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cx(
                        'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-sm',
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
              </AnimatePresence>
            </div>

            {/* quick actions + input */}
            <div className="border-t border-vailo-dark/5 bg-white/80 px-3.5 pb-5 pt-3 backdrop-blur">
              <div className="mb-3 flex gap-2 overflow-hidden">
                {['House guide', 'Eat local', 'Tours'].map((chip) => (
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
      <FloatChip className="-left-10 top-24 hidden sm:flex" delay={0} icon={Star} tone="gold">
        Guest rating 4.9
      </FloatChip>
      <FloatChip className="-right-12 top-[45%] hidden sm:flex" delay={1.2} icon={Wallet} tone="teal">
        +€16.50 earned
      </FloatChip>
      <FloatChip className="-left-6 bottom-20 hidden sm:flex" delay={2.1} icon={Clock} tone="teal">
        Answered instantly
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
    <section className="relative overflow-hidden pb-20 pt-32 sm:pb-28 sm:pt-40">
      {/* backdrop */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#eef5f4] via-white to-white" />
      <div className="absolute -right-40 top-0 -z-10 h-[34rem] w-[34rem] rounded-full bg-vailo-gold/20 blur-3xl" />
      <div className="absolute -left-40 top-40 -z-10 h-[30rem] w-[30rem] rounded-full bg-vailo-teal/15 blur-3xl" />
      <div
        className="absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(11,79,92,0.14) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 20%, transparent 70%)',
        }}
      />

      <Container>
        <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Eyebrow>AI concierge for hosts</Eyebrow>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
              className="font-luxury mt-6 text-[2.5rem] font-medium leading-[1.08] tracking-tight text-vailo-dark sm:text-5xl lg:text-[3.6rem]"
            >
              Meet Vailo.{' '}
              <span className="bg-gradient-to-r from-vailo-teal via-[#0b8da0] to-vailo-gold bg-clip-text text-transparent">
                Your guests’ local best friend,
              </span>{' '}
              your ultimate co-host.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-vailo-dark/65 lg:mx-0"
            >
              The AI-driven digital concierge that automates guest support, curates authentic local experiences, and
              generates passive income for hosts.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
              className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start"
            >
              <Button to="/contact?intent=trial" size="lg">
                Start Free Trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Button>
              <Button variant="secondary" size="lg" onClick={() => scrollToId('how-it-works')}>
                See How It Works
              </Button>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-vailo-dark/60 lg:justify-start"
            >
              {['No app for guests to install', 'Built from your House Guide', 'Earn 33% on excursions'].map((t) => (
                <li key={t} className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-vailo-teal" aria-hidden />
                  {t}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          >
            <PhoneMockup />
          </motion.div>
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
              <b className="text-vailo-teal">2.</b> Set the temperature — 180°C works for most dishes
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
    { name: 'Chez Marcelle', note: 'Family-run bistro · daily specials', walk: '4 min', tag: 'Local favourite', icon: Utensils },
    { name: 'Marché du Quartier', note: 'Morning market · fresh and seasonal', walk: '9 min', tag: 'Hidden gem', icon: Store },
    { name: 'Café des Artisans', note: 'Quiet courtyard · best croissants', walk: '6 min', tag: 'Locals only', icon: Coffee },
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
    { id: 'skip', name: 'Louvre Skip-the-Line Guided Tour', meta: '2.5 h · Small group', price: 59, rating: '4.8' },
    { id: 'after', name: 'Louvre Highlights, Early Entry', meta: '2 h · Before the crowds', price: 79, rating: '4.9' },
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

function WifiCard({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const password = 'sunsetvilla26';

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <PopCard icon={Wifi} title="Wi-Fi" subtitle="Instant answer · no waiting for your host" onClose={onClose}>
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
  side: 'left' | 'right';
  wrapperClass: string;
  popClass: string;
  Card: (props: { onClose: () => void }) => ReactNode;
};

const JOURNEY: JourneyItem[] = [
  {
    id: 'oven',
    question: 'How does the oven work?',
    hint: 'House Guide',
    icon: Flame,
    side: 'left',
    wrapperClass: 'lg:absolute lg:left-0 lg:top-2 lg:w-[240px]',
    popClass: 'lg:absolute lg:left-full lg:top-0 lg:pl-4',
    Card: OvenCard,
  },
  {
    id: 'eat',
    question: 'Where should we eat like locals?',
    hint: 'Live Like a Local',
    icon: Utensils,
    side: 'right',
    wrapperClass: 'lg:absolute lg:right-0 lg:top-24 lg:w-[240px]',
    popClass: 'lg:absolute lg:right-full lg:top-0 lg:pr-4',
    Card: LocalCard,
  },
  {
    id: 'louvre',
    question: 'How can we book a Louvre tour?',
    hint: 'Arrange & Book',
    icon: Ticket,
    side: 'left',
    wrapperClass: 'lg:absolute lg:bottom-24 lg:left-8 lg:w-[240px]',
    popClass: 'lg:absolute lg:bottom-0 lg:left-full lg:pl-4',
    Card: BookCard,
  },
  {
    id: 'wifi',
    question: 'What’s the Wi-Fi password?',
    hint: 'Instant Wi-Fi card',
    icon: Wifi,
    side: 'right',
    wrapperClass: 'lg:absolute lg:bottom-2 lg:right-6 lg:w-[240px]',
    popClass: 'lg:absolute lg:bottom-0 lg:right-full lg:pr-4',
    Card: WifiCard,
  },
];

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
    <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden py-20 sm:py-28">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-[#f3f7f6] to-white" />
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="The guest journey"
            title="Every question a guest has, answered before they ask your phone."
            subtitle="From the oven to the Louvre, Vailo is the friend in their pocket. Pick a thought bubble to see it in action."
          />
        </Reveal>

        <p className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-vailo-teal">
          <MousePointerClick className="h-4 w-4" aria-hidden />
          <span className="hidden lg:inline">Hover or click a bubble</span>
          <span className="lg:hidden">Tap a bubble</span>
        </p>

        <div ref={rootRef} className="relative mt-10 grid gap-4 md:grid-cols-2 lg:mt-6 lg:block lg:h-[700px]">
          {/* guest */}
          <motion.div
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="relative mx-auto mb-2 h-52 w-52 md:col-span-2 lg:absolute lg:left-1/2 lg:top-1/2 lg:mb-0 lg:h-[270px] lg:w-[270px] lg:-translate-x-1/2 lg:-translate-y-1/2"
          >
            <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-vailo-teal/15 to-vailo-gold/25 blur-2xl" />
            <div className="relative h-full w-full drop-shadow-[0_20px_30px_rgba(5,31,38,0.18)]">
              <GuestIllustration />
            </div>
          </motion.div>

          {JOURNEY.map((item, i) => {
            const isOpen = active === item.id;
            const Card = item.Card;
            return (
              <div
                key={item.id}
                data-journey-item
                className={cx('relative', item.wrapperClass, isOpen ? 'z-30' : 'z-10')}
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
                  transition={{ duration: 4 + i * 0.7, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
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
                      'group relative flex w-full items-center gap-3 rounded-[1.6rem] border px-4 py-3.5 text-left backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-vailo-gold/40',
                      isOpen
                        ? 'border-vailo-gold/60 bg-white shadow-[0_20px_44px_-14px_rgba(197,160,89,0.55)]'
                        : 'border-white bg-white/85 shadow-[0_14px_34px_-14px_rgba(5,31,38,0.3)] hover:shadow-[0_20px_44px_-14px_rgba(5,31,38,0.38)]'
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-10 w-10 flex-none items-center justify-center rounded-2xl transition-colors',
                        isOpen ? 'bg-vailo-gold text-vailo-dark' : 'bg-vailo-teal/10 text-vailo-teal'
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-bold leading-snug text-vailo-dark">“{item.question}”</span>
                      <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wider text-vailo-teal/70">
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
                  {/* thought-bubble tail (desktop only) */}
                  <span
                    aria-hidden
                    className={cx(
                      'pointer-events-none absolute hidden lg:block',
                      item.side === 'left' ? '-bottom-3 right-6' : '-bottom-3 left-6'
                    )}
                  >
                    <span className="absolute h-3.5 w-3.5 rounded-full bg-white/90 shadow ring-1 ring-vailo-dark/5" />
                    <span
                      className={cx(
                        'absolute top-3.5 h-2 w-2 rounded-full bg-white/90 shadow ring-1 ring-vailo-dark/5',
                        item.side === 'left' ? 'left-4' : '-left-2'
                      )}
                    />
                  </span>
                </motion.div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      key="card"
                      initial={reduce ? false : { opacity: 0, scale: 0.88, x: item.side === 'left' ? -18 : 18, y: 6 }}
                      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
                      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                      style={{ transformOrigin: item.side === 'left' ? 'left center' : 'right center' }}
                      className={cx('mt-3 w-full lg:mt-0 lg:w-[350px]', item.popClass)}
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

  const { hoursSaved, monthlyIncome, yearlyIncome } = useMemo(() => calcRoi(guests), [guests]);
  const plan = pickPlan(properties);
  const monthsToCover = plan && monthlyIncome > 0 ? plan.priceEur / monthlyIncome : null;

  return (
    <section id="roi" className="relative scroll-mt-24 overflow-hidden bg-vailo-dark py-20 text-white sm:py-28">
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
                Estimates assume {ROI.excursionConversion * 100}% of guests book an excursion at an average of €
                {ROI.avgBookingEur}, with a {ROI.hostShare * 100}% host share. Actual results vary.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid h-full gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
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

                <div className="rounded-3xl bg-gradient-to-br from-[#e1bf7c] to-vailo-gold p-6 text-vailo-dark shadow-2xl">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-vailo-dark text-vailo-gold">
                    <TrendingUp className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
                    <AnimatedNumber value={monthlyIncome} prefix="€" />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-snug text-vailo-dark/75">
                    Estimated passive income via Excursions
                  </p>
                  <p className="mt-1 text-xs font-bold text-vailo-dark/60">
                    per month · ≈ €{formatInt(yearlyIncome)} per year
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
                {plan ? (
                  <p className="flex items-start gap-3 text-sm leading-relaxed text-white/80">
                    <Lightbulb className="mt-0.5 h-5 w-5 flex-none text-vailo-gold" aria-hidden />
                    <span>
                      For {properties} {properties === 1 ? 'property' : 'properties'} we’d suggest{' '}
                      <b className="text-white">
                        {plan.name} (€{plan.priceEur}/yr)
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
                ) : (
                  <p className="flex items-start gap-3 text-sm leading-relaxed text-white/80">
                    <Lightbulb className="mt-0.5 h-5 w-5 flex-none text-vailo-gold" aria-hidden />
                    <span>
                      Managing more than 20 properties?{' '}
                      <Link to="/contact?intent=demo" className="font-bold text-vailo-gold underline underline-offset-4">
                        Talk to us
                      </Link>{' '}
                      about a custom plan.
                    </span>
                  </p>
                )}
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
              Vailo partners with Viator and local tour operators. Every time your guest books an excursion, you earn a
              33% revenue share, completely passively.
            </p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 4d. SECTION — CORE FEATURES (bento grid)
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
              Check-out is at 11:00. Leave the keys on the kitchen table — safe travels! 👋
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
            title="Everything your guests need. Nothing you have to answer twice."
            subtitle="One portal that supports guests, showcases your area and earns while you sleep."
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
  const perProperty = plan.priceEur / plan.properties;
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cx(
        'relative flex h-full flex-col rounded-3xl p-7 sm:p-8',
        plan.popular
          ? 'bg-white shadow-[0_40px_80px_-30px_rgba(197,160,89,0.6)] ring-2 ring-vailo-gold lg:-my-3 lg:py-11'
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
          <span className="text-5xl font-extrabold tracking-tight text-vailo-dark">€{plan.priceEur}</span>
          <span className="text-base font-semibold text-vailo-dark/50">/ year</span>
        </p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-xl bg-vailo-teal/8 px-3 py-1.5 text-sm font-bold text-vailo-teal">
          {plan.propertiesLabel}
        </p>
        {plan.properties > 1 && (
          <p className="mt-2 text-xs font-medium text-vailo-dark/50">≈ €{perProperty.toFixed(2)} per property</p>
        )}
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
        to={`/contact?intent=trial&plan=${encodeURIComponent(plan.name)}`}
        variant={plan.popular ? 'primary' : 'dark'}
        size="lg"
        className="relative mt-8 w-full"
      >
        Start Free Trial
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
            subtitle="One annual price per portfolio size. Every plan includes every feature."
          />
        </Reveal>

        <div className="mt-16 grid items-stretch gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.08} className="h-full">
              <PricingCard plan={plan} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mx-auto mt-12 flex max-w-3xl items-start gap-4 rounded-3xl border border-vailo-gold/40 bg-gradient-to-r from-[#fdf6e3] to-[#f9ecc9] p-5 shadow-[0_20px_50px_-24px_rgba(197,160,89,0.7)] sm:items-center sm:p-6">
            <p className="text-center text-sm font-semibold leading-relaxed text-vailo-dark sm:text-base">
              💡 Pays for itself: With our 33% revenue share on excursions, Vailo covers its own yearly cost with just 1
              or 2 guest bookings!
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
  title = 'Ready to meet your new co-host?',
  subtitle = 'Set up Vailo in an afternoon and let it handle the questions, the recommendations and the bookings.',
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="px-3 pb-20 sm:px-6 sm:pb-28">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-vailo-dark via-[#073a45] to-vailo-teal px-6 py-16 text-center text-white shadow-[0_40px_80px_-30px_rgba(5,31,38,0.7)] sm:px-12 sm:py-20">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-vailo-gold/30 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-luxury text-3xl font-medium leading-tight sm:text-4xl lg:text-5xl">{title}</h2>
            <p className="mt-4 text-base text-white/70 sm:text-lg">{subtitle}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/contact?intent=trial" size="lg">
                Start Free Trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Button>
              <Button to="/contact?intent=demo" variant="glass" size="lg">
                Book a Demo
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: FileText,
      title: 'Add your House Guide',
      text: 'Tell Vailo about your property once — appliances, Wi-Fi, rules, check-out. It becomes the AI’s knowledge.',
    },
    {
      icon: Users,
      title: 'Share the guest link',
      text: 'Guests open your portal from a link or QR code. No app, no sign-up, in the language they speak.',
    },
    {
      icon: Wallet,
      title: 'They chat, explore & book',
      text: 'Vailo answers, recommends local favourites and books excursions — you earn 33% on each.',
    },
  ];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <Reveal>
          <SectionHeading eyebrow="How it works" title="Live in three simple steps." />
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.1}>
              <div className="relative h-full rounded-3xl bg-white p-7 shadow-[0_18px_50px_-24px_rgba(5,31,38,0.25)] ring-1 ring-vailo-dark/6">
                <span className="absolute right-6 top-5 font-luxury text-5xl font-semibold text-vailo-teal/10">{i + 1}</span>
                <IconTile icon={s.icon} />
                <h3 className="font-luxury mt-5 text-xl font-medium">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-vailo-dark/65">{s.text}</p>
              </div>
            </Reveal>
          ))}
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

/** Compact hero used by inner pages. */
function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pb-14 pt-36 sm:pb-20 sm:pt-44">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#e9f3f2] via-[#f6faf9] to-white" />
      <div className="absolute -right-32 -top-10 -z-10 h-96 w-96 rounded-full bg-vailo-gold/20 blur-3xl" />
      <div className="absolute -left-32 top-20 -z-10 h-96 w-96 rounded-full bg-vailo-teal/15 blur-3xl" />
      <Container className="text-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-luxury mx-auto mt-6 max-w-3xl text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-vailo-dark/65">{subtitle}</p>
          {children && <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{children}</div>}
        </motion.div>
      </Container>
    </section>
  );
}

/* ===========================================================================
 * 5. PAGES
 * ========================================================================= */

export function HomePage() {
  usePageMeta(
    'Vailo — Your guests’ local best friend, your ultimate co-host',
    'Vailo is the AI-driven digital concierge for vacation rentals and boutique hotels: automated guest support, authentic local tips and bookable excursions that earn you passive income.'
  );
  return (
    <>
      <Hero />
      <GuestJourney />
      <RoiCalculator />
      <FeaturesSection />
      <PricingSection />
      <FinalCta />
    </>
  );
}

export function FeaturesPage() {
  usePageMeta('Features — Vailo', 'AI property assistant, Live Like a Local, global excursions and automated check-in — all in one guest portal.');
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="One guest portal. Four ways to delight."
        subtitle="Vailo takes the repetitive work off your plate and turns your guests’ curiosity into something that earns."
      >
        <Button to="/contact?intent=trial" size="lg">
          Start Free Trial
        </Button>
        <Button to="/pricing" variant="secondary" size="lg">
          See pricing
        </Button>
      </PageHero>
      <FeaturesSection detailed />
      <HowItWorks />
      <FinalCta />
    </>
  );
}

export function PricingPage() {
  usePageMeta('Pricing — Vailo', 'Simple annual pricing from €49 per property. Vailo pays for itself through its 33% excursion revenue share.');
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Priced to disappear into your margins."
        subtitle="Annual plans for every portfolio size, with a revenue share on excursions that works in your favour."
      />
      <div className="-mt-10">
        <PricingSection id="plans" />
      </div>
      <section className="pb-20 sm:pb-28">
        <Container>
          <Reveal>
            <SectionHeading title="Questions, answered." />
          </Reveal>
          <Reveal delay={0.08} className="mt-10">
            <Faq
              items={[
                {
                  q: 'How does the 33% revenue share work?',
                  a: 'When a guest books an excursion through your Vailo portal, you earn 33% of that booking. Vailo partners with Viator and local tour operators, so it’s completely passive.',
                },
                {
                  q: 'Do my guests need to install an app?',
                  a: 'No. Guests open your property’s portal from a link or QR code in any browser, so there is nothing to download.',
                },
                {
                  q: 'What does the AI assistant know?',
                  a: 'It answers from the House Guide you provide — appliances, Wi-Fi, house rules and more — plus curated local knowledge of your area.',
                },
                {
                  q: 'What if I manage more than 20 properties?',
                  a: (
                    <>
                      We’d love to help.{' '}
                      <Link to="/contact?intent=demo" className="font-bold text-vailo-teal underline underline-offset-4">
                        Get in touch
                      </Link>{' '}
                      and we’ll shape a plan around your portfolio.
                    </>
                  ),
                },
              ]}
            />
          </Reveal>
        </Container>
      </section>
      <FinalCta />
    </>
  );
}

export function TourProvidersPage() {
  usePageMeta('Tour Providers — Vailo', 'List your tours and experiences with Vailo and reach guests while they plan their stay.');
  const benefits = [
    {
      icon: MapPin,
      title: 'Reach guests at the right moment',
      text: 'Your experiences appear inside the guest portal of the property they’re staying in — right when they’re deciding what to do.',
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
      />
    </>
  );
}

type ContactIntent = 'demo' | 'trial' | 'partner' | 'general';

const CONTACT_COPY: Record<ContactIntent, { eyebrow: string; title: string; subtitle: string; message: (plan: string) => string; role: string }> = {
  demo: {
    eyebrow: 'Book a demo',
    title: 'See Vailo on a property like yours.',
    subtitle: 'Tell us a little about your portfolio and we’ll set up a walkthrough.',
    message: () => 'Hi Vailo team, I’d like to book a demo.',
    role: '',
  },
  trial: {
    eyebrow: 'Start free trial',
    title: 'Start your free trial.',
    subtitle: 'Leave your details and we’ll get your first property set up.',
    message: (plan) => `Hi Vailo team, I’d like to start a free trial${plan ? ` of the ${plan} plan` : ''}.`,
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

  usePageMeta('Contact — Vailo', 'Book a demo, start a free trial or get in touch with the Vailo team.');

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
      <PageHero eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} />
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
  usePageMeta(`${title} — Vailo`, `${title} for the Vailo platform.`);
  const { resolved, loading } = usePlatformLegal('en');
  const live = isPrivacy ? resolved.privacyPolicy : resolved.termsOfUse;
  const html = !loading && !legalContentIsEmpty(live) ? live : getPlatformLegalTemplate('en', isPrivacy ? 'privacyPolicy' : 'termsOfUse');

  return (
    <>
      <PageHero eyebrow="Legal" title={title} subtitle="How we handle data and what you can expect when using Vailo." />
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
