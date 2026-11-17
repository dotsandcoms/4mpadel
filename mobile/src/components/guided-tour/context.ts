import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';
import type { Guide, GuideId, TourProgress, TourRect, TourStep } from '@/lib/guided-tour';

export type TourTargetHandle = { node: RefObject<View | null>; measure: () => Promise<TourRect | null>; reveal: () => void; activate?: () => void };
export type ActiveTour = { owner: string; id: GuideId; index: number; entered: boolean; serial: number };
export type TourController = {
  active: ActiveTour | null; guide: Guide | null; step: TourStep | null; ready: boolean;
  progress: TourProgress; welcomeVisible: boolean; visible: boolean; allowSystemPrompts: boolean;
  targets: Map<string, TourTargetHandle>; targetsVersion: number;
  start: (id: GuideId) => void; next: () => void; back: () => void; stop: () => void; later: () => void; dismissTip: (id: GuideId) => void;
  register: (id: string, target: TourTargetHandle) => () => void;
  registerMenu: (bridge: { open: () => void; close: () => void }) => () => void;
  menuVisibility: (open: boolean) => void;
};
export const GuidedTourContext = createContext<TourController | null>(null);
export const useGuidedTour = () => useContext(GuidedTourContext);
