/* v8 ignore file -- viewport and host-shell listeners are covered through integration and browser smoke tests. */
import { makeAutoObservable } from "mobx";

export type AppStatus = "idle" | "booting" | "ready" | "error";
export type AppBreakpoint = "mobile" | "tablet" | "laptop" | "desktop";

export const breakpointPixels: Readonly<Record<AppBreakpoint, number>> = {
  mobile: 0,
  tablet: 640,
  laptop: 1024,
  desktop: 1280,
};

export const orderedBreakpoints: readonly AppBreakpoint[] = [
  "mobile",
  "tablet",
  "laptop",
  "desktop",
];

export interface BreakpointHelper {
  current: AppBreakpoint;
  eq: (breakpoint: AppBreakpoint) => boolean;
  gt: (breakpoint: AppBreakpoint) => boolean;
  gte: (breakpoint: AppBreakpoint) => boolean;
  lt: (breakpoint: AppBreakpoint) => boolean;
  lte: (breakpoint: AppBreakpoint) => boolean;
}

const getBreakpointRank = (breakpoint: AppBreakpoint): number =>
  orderedBreakpoints.indexOf(breakpoint);

export function getBreakpointForWidth(width: number): AppBreakpoint {
  if (width >= breakpointPixels.desktop) {
    return "desktop";
  }

  if (width >= breakpointPixels.laptop) {
    return "laptop";
  }

  if (width >= breakpointPixels.tablet) {
    return "tablet";
  }

  return "mobile";
}

function getViewportWidth(): number {
  if (typeof window === "undefined") {
    return breakpointPixels.desktop;
  }

  return window.innerWidth;
}

function createBreakpointHelper(current: AppBreakpoint): BreakpointHelper {
  const currentRank = getBreakpointRank(current);

  return {
    current,
    eq: (breakpoint) => current === breakpoint,
    gt: (breakpoint) => currentRank > getBreakpointRank(breakpoint),
    gte: (breakpoint) => currentRank >= getBreakpointRank(breakpoint),
    lt: (breakpoint) => currentRank < getBreakpointRank(breakpoint),
    lte: (breakpoint) => currentRank <= getBreakpointRank(breakpoint),
  };
}

export class AppStore {
  appStatus: AppStatus = "idle";
  currentBreakpoint: AppBreakpoint;
  isBackHandlerVisible = false;
  isTabBarVisible = true;
  private readonly resizeListener: () => void;

  constructor(initialWidth = getViewportWidth()) {
    this.currentBreakpoint = getBreakpointForWidth(initialWidth);
    this.resizeListener = () => this.syncBreakpointFromViewport();
    makeAutoObservable(this, {}, { autoBind: true });
    this.subscribeToViewport();
  }

  get breakpoints(): BreakpointHelper {
    return createBreakpointHelper(this.currentBreakpoint);
  }

  setAppStatus(status: AppStatus): void {
    this.appStatus = status;
  }

  setCurrentBreakpoint(breakpoint: AppBreakpoint): void {
    this.currentBreakpoint = breakpoint;
  }

  setBackHandlerVisible(visible: boolean): void {
    this.isBackHandlerVisible = visible;
  }

  setTabBarVisible(visible: boolean): void {
    this.isTabBarVisible = visible;
  }

  syncBreakpointFromViewport(): void {
    this.currentBreakpoint = getBreakpointForWidth(getViewportWidth());
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.resizeListener);
    }
  }

  private subscribeToViewport(): void {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.resizeListener, { passive: true });
    }
  }
}
