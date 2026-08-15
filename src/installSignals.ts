/* Señales de interés para el aviso de instalación PWA */

export type InstallSignal = "export" | "map-select";

const EVENT = "sismografo-install-signal";

export function emitInstallSignal(type: InstallSignal) {
  window.dispatchEvent(new CustomEvent<InstallSignal>(EVENT, { detail: type }));
}

export function onInstallSignal(cb: (type: InstallSignal) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<InstallSignal>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
