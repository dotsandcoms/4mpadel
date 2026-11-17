import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { GUIDES, emptyTourProgress, tourPathMatches, type GuideId, type TourProgress } from '@/lib/guided-tour';
import { readTourProgress, saveTourProgress } from '@/lib/guided-tour-storage';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { GuidedTourContext, type ActiveTour, type TourTargetHandle } from './context';
import { GuidedTourOverlay } from './spotlight';

export function GuidedTourProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { owner, notice } = useMessagingInbox(), router = useRouter(), pathname = usePathname();
  const [stored, setStored] = useState({ owner: null as string | null, ready: false, progress: emptyTourProgress() });
  const [active, setActive] = useState<ActiveTour | null>(null), [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [welcomeReady, setWelcomeReady] = useState(false), [menuOpen, setMenuOpen] = useState(false), [targetsVersion, setTargetsVersion] = useState(0);
  const account = useRef(owner); account.current = owner;
  const current = useRef(active); current.current = active;
  const preferences = useRef(stored); preferences.current = stored;
  const permitted = useRef(enabled); permitted.current = enabled;
  const epoch = useRef(0), serial = useRef(0), targets = useRef(new Map<string, TourTargetHandle>()).current;
  const menu = useRef<{ open: () => void; close: () => void } | null>(null);

  useEffect(() => {
    const request = ++epoch.current;
    setActive(null); current.current = null; setWelcomeReady(false);
    const pending = { owner, ready: !owner, progress: emptyTourProgress() };
    preferences.current = pending; setStored(pending);
    if (owner) void readTourProgress(owner).catch(() => emptyTourProgress()).then(progress => {
      if (request !== epoch.current || account.current !== owner) return;
      const next = { owner, ready: true, progress }; preferences.current = next; setStored(next);
    });
    return () => { epoch.current++; };
  }, [owner]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  const update = useCallback((change: (progress: TourProgress) => TourProgress) => {
    const id = account.current, previous = preferences.current;
    if (!id || previous.owner !== id || !previous.ready) return;
    const next = { ...previous, progress: change(previous.progress) };
    preferences.current = next; setStored(next);
    void saveTourProgress(id, next.progress).catch(() => {});
  }, []);
  const dismissTip = useCallback((id: GuideId) => update(progress => ({ ...progress, seen: [...new Set([...progress.seen, id])] })), [update]);
  const clear = useCallback(() => { current.current = null; setActive(null); }, []);
  const stop = useCallback(() => {
    if (current.current?.id === 'overview') update(progress => ({ ...progress, welcome: 'skipped' }));
    clear();
  }, [clear, update]);
  const go = useCallback((id: GuideId, index: number, navigate = true) => {
    const user = account.current, prefs = preferences.current;
    if (!user || prefs.owner !== user || !prefs.ready || !permitted.current) return;
    const step = GUIDES[id].steps[index];
    if (!step) return;
    const next: ActiveTour = { owner: user, id, index, entered: false, serial: ++serial.current };
    current.current = next; setActive(next);
    dismissTip(step.chapter || id);
    if (navigate && step.route) router.navigate(step.params ? { pathname: step.route, params: step.params } as Href : step.route as Href);
    if (step.menu) menu.current?.open(); else menu.current?.close();
  }, [dismissTip, router]);
  const start = useCallback((id: GuideId) => {
    if (!permitted.current) return;
    if (id === 'overview') update(progress => ({ ...progress, welcome: 'started' }));
    hapticLight(); go(id, 0);
  }, [go, update]);
  const next = useCallback(() => {
    const tour = current.current;
    if (!tour || tour.owner !== account.current || !permitted.current) return;
    const guide = GUIDES[tour.id];
    if (tour.index + 1 < guide.steps.length) { hapticLight(); go(tour.id, tour.index + 1); return; }
    update(progress => ({ ...progress, welcome: tour.id === 'overview' ? 'completed' : progress.welcome,
      completed: [...new Set([...progress.completed, tour.id])] }));
    clear(); hapticSuccess();
    if (tour.id === 'overview') router.navigate('/(tabs)');
  }, [clear, go, router, update]);
  const back = useCallback(() => { const tour = current.current; if (tour && tour.index > 0) { hapticLight(); go(tour.id, tour.index - 1); } }, [go]);
  const later = useCallback(() => update(progress => ({ ...progress, welcome: 'later' })), [update]);
  const register = useCallback((id: string, target: TourTargetHandle) => {
    targets.set(id, target); setTargetsVersion(value => value + 1);
    return () => { if (targets.get(id) === target) { targets.delete(id); setTargetsVersion(value => value + 1); } };
  }, [targets]);
  const registerMenu = useCallback((bridge: { open: () => void; close: () => void }) => {
    menu.current = bridge;
    return () => { if (menu.current === bridge) menu.current = null; };
  }, []);

  const own = !!owner && stored.owner === owner && stored.ready;
  const ownActive = active?.owner === owner ? active : null;
  const guide = ownActive ? GUIDES[ownActive.id] : null, step = guide && ownActive ? guide.steps[ownActive.index] : null;
  const available = enabled && own && foreground && !notice;
  useEffect(() => {
    setWelcomeReady(false);
    if (!available || pathname !== '/' || stored.progress.welcome !== 'unseen' || ownActive) return;
    const timer = setTimeout(() => setWelcomeReady(true), 650);
    return () => clearTimeout(timer);
  }, [available, pathname, stored.progress.welcome, ownActive]);
  const welcomeVisible = available && welcomeReady && pathname === '/' && stored.progress.welcome === 'unseen' && !ownActive;

  useEffect(() => {
    if (!ownActive || !step || !enabled) return;
    if (tourPathMatches(step.path, pathname)) {
      if (!ownActive.entered) {
        const entered = { ...ownActive, entered: true }; current.current = entered; setActive(entered);
      }
      return;
    }
    if (ownActive.entered) {
      const upcoming = guide?.steps[ownActive.index + 1];
      if (upcoming && tourPathMatches(upcoming.path, pathname)) go(ownActive.id, ownActive.index + 1, false);
      else clear();
    }
  }, [ownActive, step, guide, pathname, enabled, go, clear]);
  useEffect(() => {
    if (!ownActive || ownActive.entered) return;
    const timer = setTimeout(() => { if (current.current?.serial === ownActive.serial && !current.current.entered) clear(); }, 5000);
    return () => clearTimeout(timer);
  }, [ownActive, clear]);
  useEffect(() => {
    if (!ownActive || !step?.menu || menuOpen) return;
    const timer = setTimeout(() => { if (current.current?.serial === ownActive.serial) clear(); }, 850);
    return () => clearTimeout(timer);
  }, [ownActive, step?.menu, menuOpen, clear]);
  useEffect(() => {
    if (ownActive?.entered && step?.target === 'header.menu' && menuOpen && guide?.steps[ownActive.index + 1]?.menu)
      go(ownActive.id, ownActive.index + 1, false);
  }, [ownActive, step, menuOpen, guide, go]);
  useEffect(() => {
    if (!available || (!ownActive && !welcomeVisible)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (ownActive) stop(); else later(); return true; });
    return () => subscription.remove();
  }, [available, ownActive, welcomeVisible, stop, later]);

  const value = useMemo(() => ({ active: ownActive, guide, step, ready: own, progress: own ? stored.progress : emptyTourProgress(),
    welcomeVisible, visible: available && !!step && !!ownActive?.entered && (!step.menu || menuOpen),
    allowSystemPrompts: available && stored.progress.welcome !== 'unseen' && !ownActive,
    targets, targetsVersion, start, next, back, stop, later, dismissTip, register, registerMenu, menuVisibility: setMenuOpen,
  }), [ownActive, guide, step, own, stored.progress, welcomeVisible, available, menuOpen, targets, targetsVersion, start, next, back, stop, later, dismissTip, register, registerMenu]);
  return <GuidedTourContext.Provider value={value}><View style={{ flex: 1 }}>{children}<GuidedTourOverlay /></View></GuidedTourContext.Provider>;
}
