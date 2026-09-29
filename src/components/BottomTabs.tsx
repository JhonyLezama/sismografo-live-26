import { useState } from "react";
import { Activity, Archive, Scale, Waves, Info, MoreHorizontal, Vibrate, Download } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { useInstallPrompt } from "../hooks";

interface Props {
  active: string;
  onFelt: () => void;
}

const MORE_ITEMS = [
  { href: "#balance", label: "Balance", desc: "Víctimas y costos 2026", icon: Scale },
  { href: "#acerca", label: "Acerca y fuentes", desc: "Metodología y aviso", icon: Info },
];

/* Barra inferior tipo app: En vivo + Archivo + LO SENTÍ + Escalas + Más */
export default function BottomTabs({ active, onFelt }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pwa = useInstallPrompt();
  const moreActive = active === "#balance" || active === "#acerca";

  const tab = (href: string, label: string, Icon: typeof Activity) => {
    const isActive = active === href;
    return (
      <a
        key={href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 font-mono text-[8px] tracking-[0.14em] uppercase ${
          isActive ? "text-amber" : "text-dim"
        }`}
      >
        <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
        <span className="truncate">{label}</span>
      </a>
    );
  };

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-abyss/95 px-1 pt-1 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}
      >
        {tab("#en-vivo", "En vivo", Activity)}
        {tab("#escalas", "Escalas", Waves)}
        <button
          onClick={onFelt}
          aria-label="Lo sentí: averiguar qué temblor fue"
          className="chip-btn felt-pulse mx-1 -mt-5 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-verm text-abyss shadow-lg shadow-verm/30 hover:brightness-110"
        >
          <Vibrate size={22} strokeWidth={2.2} />
        </button>
        {tab("#registro", "Archivo", Archive)}
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
          className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 font-mono text-[8px] tracking-[0.14em] uppercase ${
            moreActive ? "text-amber" : "text-dim"
          }`}
        >
          <MoreHorizontal size={19} strokeWidth={moreActive ? 2.2 : 1.8} />
          <span className="truncate">Más</span>
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} maxHeight="60dvh">
        <div className="px-4 pt-1">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.24em] text-dim uppercase">Explorar</span>
            <button
              onClick={() => setMoreOpen(false)}
              aria-label="Cerrar"
              className="chip-btn grid h-8 w-8 place-items-center border border-line text-fog hover:border-verm hover:text-verm"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
          <ul className="divide-y divide-line/60">
            {MORE_ITEMS.map(({ href, label, desc, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={`chip-btn flex items-center gap-3 py-3.5 ${
                    active === href ? "text-amber" : "text-fog"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center border border-line bg-deep">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[12px] tracking-[0.16em] uppercase">{label}</span>
                    <span className="block truncate text-xs text-dim">{desc}</span>
                  </span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-dim">
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
          {pwa.canPrompt ? (
            <button
              onClick={() => {
                setMoreOpen(false);
                void pwa.install();
              }}
              className="chip-btn mt-3 flex w-full items-center gap-3 border border-amber/60 bg-amber/15 px-3 py-3 text-left"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center border border-amber/40 bg-deep text-amber">
                <Download size={16} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[12px] tracking-[0.16em] text-amber uppercase">Instalar app</span>
                <span className="block truncate text-xs text-dim">Acceso directo y funciona sin conexión</span>
              </span>
            </button>
          ) : pwa.canInstall ? (
            <p className="mt-3 border border-line bg-deep/60 px-3 py-2.5 text-xs leading-relaxed text-fog">
              Para instalarla: en Safari toca <span className="text-bone">Compartir</span> →{" "}
              <span className="text-bone">Añadir a pantalla de inicio</span>.
            </p>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
