import { useEffect, useState } from "react";
import { MONTHS_ES } from "../data/quakes";
import { useMediaQuery } from "../hooks";

interface Props {
  playing: boolean;
  month: number;
  disabled?: boolean;
  disabledHint?: string;
  count: number;
  onPlayPause: () => void;
  onSeek: (m: number) => void;
  onReset: () => void;
}

export default function YearPlayer({
  playing,
  month,
  disabled,
  disabledHint,
  count,
  onPlayPause,
  onSeek,
  onReset,
}: Props) {
  const active = month >= 0;
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 1023px)");

  useEffect(() => {
    if (playing) setOpen(true);
    else if (month < 0) setOpen(false);
  }, [playing, month]);

  if (disabled && isMobile) return null;

  return (
    <div className={`mb-5 border border-line bg-panel ${disabled ? "opacity-50" : ""}`}>
      <div
        className={`flex flex-wrap items-center gap-2 bg-deep/60 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 ${open ? "border-b border-line/60" : ""}`}
      >
        <button
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={playing ? "Pausar" : "Reproducir"}
          title={disabled ? disabledHint : playing ? "Pausar" : "Reproducir"}
          className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel text-amber hover:border-amber disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-amber sm:h-8 sm:w-8"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            {playing ? (
              <path d="M4.5 3h2.4v10H4.5zM9.1 3h2.4v10H9.1z" />
            ) : (
              <path d="M5 3.2l8 4.8-8 4.8V3.2z" />
            )}
          </svg>
        </button>
        <button
          onClick={onReset}
          disabled={disabled}
          aria-label="Mostrar todo el año"
          title={disabled ? disabledHint : "Mostrar todo el año"}
          className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel text-fog hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-fog sm:h-8 sm:w-8"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
        <span className="hidden font-mono text-[10px] tracking-[0.22em] text-dim uppercase sm:inline">Reproductor del año</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-widest text-amber uppercase sm:ml-auto sm:flex-none">
          {disabled
            ? disabledHint
            : active
              ? playing
                ? `reproduciendo · hasta ${MONTHS_ES[month]} · ${count} eventos`
                : `hasta ${MONTHS_ES[month]} · ${count} eventos`
              : "todo el año"}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-expanded={open}
          aria-label={open ? "Ocultar meses" : "Mostrar meses"}
          title={open ? "Ocultar meses" : "Mostrar meses"}
          className="chip-btn grid h-7 w-7 place-items-center border border-line bg-panel text-fog hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-fog sm:h-8 sm:w-8"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M3 6l5 5 5-5" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="flex items-stretch gap-px px-1.5 py-1.5">
          {MONTHS_ES.slice(0, 8).map((m, i) => (
            <button
              key={m}
              disabled={disabled}
              onClick={() => onSeek(i)}
              className={`chip-btn flex-1 px-1 py-1 font-mono text-[9px] uppercase transition-colors sm:px-1 sm:py-1.5 sm:text-[10px] ${
                active && month >= i ? "bg-amber/25 text-bone" : "text-dim hover:text-fog"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}