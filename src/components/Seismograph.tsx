import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../hooks";

/* Generador pseudoaleatorio con semilla */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  amp?: number; // 0..1
  seed?: number;
  color?: string;
  height?: number;
  className?: string;
}

export default function Seismograph({
  amp = 0.5,
  seed = 7,
  color = "#f59e42",
  height = 90,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* ---- construcción de la forma de onda ---- */
    const N = 3200;
    const rand = mulberry32(seed * 9973 + 11);
    const wave = new Float32Array(N);
    for (let i = 0; i < N; i++) wave[i] = (rand() * 2 - 1) * 0.045;
    const bursts = 4 + Math.floor(rand() * 3);
    for (let b = 0; b < bursts; b++) {
      const c = Math.floor(rand() * N);
      const sigma = 36 + rand() * 150;
      const a = 0.3 + rand() * 0.7;
      const f = 0.22 + rand() * 0.5;
      const ph = rand() * 6.28;
      const span = Math.floor(sigma * 5);
      for (let i = -span; i <= span; i++) {
        const idx = (c + i + N * 4) % N;
        wave[idx] += a * Math.exp(-Math.abs(i) / sigma) * Math.sin(i * f + ph);
      }
    }

    let w = wrap.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = wrap.clientWidth;
      canvas.width = Math.max(10, Math.floor(w * dpr));
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let offset = 0;
    const mid = (height * dpr) / 2;
    const maxA = height * dpr * 0.42 * Math.max(0.08, Math.min(1, amp));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      /* línea base */
      ctx.strokeStyle = "rgba(143,163,160,0.18)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3 * dpr, 5 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(canvas.width, mid);
      ctx.stroke();
      ctx.setLineDash([]);
      /* trazo */
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6 * dpr;
      ctx.lineJoin = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 7 * dpr;
      ctx.beginPath();
      const step = 2 * dpr;
      for (let x = 0; x <= canvas.width; x += step) {
        const idx = Math.floor((offset + x / step)) % N;
        const y = mid + wave[idx] * maxA;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    if (reduced) {
      draw();
    } else {
      const tick = () => {
        offset = (offset + 1.15) % N;
        draw();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [amp, seed, color, height, reduced]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
