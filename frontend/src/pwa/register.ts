import { registerSW } from "virtual:pwa-register";

export type UpdateHandler = (update: () => Promise<void>) => void;

let listeners: UpdateHandler[] = [];
let pendingUpdate: (() => Promise<void>) | null = null;

export function onSwUpdate(cb: UpdateHandler) {
  listeners.push(cb);
  if (pendingUpdate) cb(pendingUpdate);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pendingUpdate = () => updateSW(true);
      listeners.forEach((l) => l(pendingUpdate!));
    },
    onRegisterError(err) {
      console.warn("Service worker registration failed", err);
    },
  });
}
