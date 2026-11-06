type DesktopReadStatus = { offline: boolean; offlineEpoch: number };

let current: DesktopReadStatus = { offline: false, offlineEpoch: 0 };
const listeners = new Set<() => void>();

export const desktopReadStatus = () => current;

export function subscribeDesktopReadStatus(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateDesktopReadStatus(offline: boolean) {
  // Every fallback invalidates reads already in flight, even if a parallel request reconnects.
  if (!offline && !current.offline) return;
  current = { offline, offlineEpoch: current.offlineEpoch + Number(offline) };
  listeners.forEach(listener => listener());
}
