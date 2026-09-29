import { Activity, Archive, Waves, Scale, Vibrate } from "lucide-react";

interface Props {
  active: string;
  onFelt: () => void;
  liveCount: number | null;
}

const ITEMS = [
  { href: "#en-vivo", label: "En vivo", icon: Activity },
  { href: "#escalas", label: "Escalas", icon: Waves },
  { href: "#registro", label: "Archivo", icon: Archive },
  { href: "#balance", label: "Balance", icon: Scale },
];

/* Barra lateral fija (desktop): icono + texto, nada desplegado por defecto */
export default function SideNav({ active, onFelt, liveCount }: Props) {
  return (
    <aside className="fixed top-[65px] bottom-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-abyss/95 backdrop-blur-sm lg:flex">
      <div className="p-3">
        <button
          onClick={onFelt}
          className="chip-btn felt-pulse flex w-full items-center gap-3 bg-verm px-4 py-3 text-left font-mono text-xs font-semibold tracking-[0.16em] text-abyss uppercase hover:brightness-110"
        >
          <Vibrate size={16} strokeWidth={2.2} />
          Lo sentí
        </button>
        <p className="mt-2 px-1 font-mono text-[9px] leading-relaxed tracking-[0.18em] text-dim uppercase">
          ¿Tembló? Te digo qué fue
        </p>
      </div>
      <nav className="flex flex-col px-3 pb-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = active === href;
          return (
            <a
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`chip-btn flex items-center gap-3 border-l-2 px-3 py-3 font-mono text-[11px] tracking-[0.18em] uppercase ${
                isActive
                  ? "border-amber bg-amber/5 text-amber"
                  : "border-transparent text-fog hover:border-amber/50 hover:text-bone"
              }`}
            >
              <Icon size={16} strokeWidth={1.8} className={isActive ? "text-amber" : "text-dim"} />
              {label}
              {href === "#en-vivo" && liveCount !== null && (
                <span className="ml-auto border border-teal/40 bg-teal/10 px-1.5 py-0.5 font-mono text-[9px] text-teal">
                  {liveCount}
                </span>
              )}
            </a>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-line p-4 font-mono text-[9px] leading-relaxed tracking-[0.2em] text-dim uppercase">
        USGS + EMSC
        <br />
        M4.5+ en vivo
      </div>
    </aside>
  );
}
