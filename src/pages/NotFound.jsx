import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, CalendarDays, Home, Search } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const ROUTE_CONTEXT = [
  { test: /^\/calendar|^\/events/, title: 'Event not found', copy: 'That event may have moved, been unpublished, or the link may be incomplete.', href: '/calendar', label: 'Browse events', Icon: CalendarDays },
  { test: /^\/players/, title: 'Player not found', copy: 'We could not find a player profile at this address.', href: '/players', label: 'Find a player', Icon: Search },
  { test: /^\/organisations/, title: 'Organisation not found', copy: 'This organisation page is unavailable or its address has changed.', href: '/organisations', label: 'Browse organisations', Icon: Search },
  { test: /^\/clubs/, title: 'Club not found', copy: 'This club page is unavailable or its address has changed.', href: '/clubs', label: 'Browse clubs', Icon: Search },
  { test: /^\/gallery/, title: 'Gallery not found', copy: 'That album may have moved or is no longer public.', href: '/gallery', label: 'View gallery', Icon: Search },
  { test: /^\/blog/, title: 'Article not found', copy: 'That article may have moved or is no longer available.', href: '/blog', label: 'Read the latest', Icon: Search },
];

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const context = useMemo(
    () => ROUTE_CONTEXT.find(({ test }) => test.test(location.pathname)) || {
      title: 'Page not found',
      copy: 'The page you are looking for may have moved, changed its name, or never existed.',
      href: '/',
      label: 'Back to home',
      Icon: Home,
    },
    [location.pathname],
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${context.title} | 4M Padel`;
    return () => { document.title = previousTitle; };
  }, [context.title]);

  return (
    <main
      className="relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden bg-[#07090d] px-5 py-20"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }}
    >
      <div aria-hidden="true" className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(204,255,0,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(204,255,0,.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div aria-hidden="true" className="absolute -left-28 top-1/4 h-72 w-72 rounded-full bg-padel-green/10 blur-[100px]" />
      <div aria-hidden="true" className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-lime-500/10 blur-[120px]" />

      <section className="relative w-full max-w-3xl rounded-[2rem] border border-white/10 bg-black/55 px-6 py-12 text-center shadow-2xl backdrop-blur-xl sm:px-12 sm:py-16">
        <p className="text-[clamp(5rem,18vw,10rem)] font-extrabold leading-none tracking-[-0.06em] text-padel-green">404</p>
        <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-padel-green" />
        <h1
          className="mt-8 text-3xl font-bold tracking-tight text-white sm:text-5xl"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }}
        >
          {context.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-gray-400 sm:text-base">{context.copy}</p>
        <p className="mx-auto mt-5 max-w-full truncate rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-gray-600" title={location.pathname}>
          {location.pathname}
        </p>

        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={context.href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-padel-green px-6 py-3 text-sm font-bold !text-black transition-colors hover:bg-white hover:!text-black">
            <context.Icon size={18} /> {context.label}
          </Link>
          <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
            <ArrowLeft size={18} /> Go back
          </button>
        </div>
      </section>
    </main>
  );
};

export default NotFound;
