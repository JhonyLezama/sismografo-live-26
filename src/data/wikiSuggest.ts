/* Sugerencias de artículos de Wikipedia generadas por scripts/update-catalog.mjs
 * (public/wikipedia-suggestions.json) y flujo de aceptación en localStorage:
 * el usuario aprueba o descarta el enlace sugerido para cada evento. */

export interface WikiSuggestion {
  title: string;
  snippet: string;
  url: string;
}

export interface WikiSuggestSnapshot {
  updatedAt: string;
  suggestions: Record<string, WikiSuggestion>;
}

const LS_KEY = "sismografo-wiki";

let cache: Record<string, WikiSuggestion> | null = null;
let pending: Promise<Record<string, WikiSuggestion>> | null = null;

export function loadWikiSuggestions(): Promise<Record<string, WikiSuggestion>> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}wikipedia-suggestions.json`, {
          cache: "no-cache",
        });
        if (!res.ok) throw new Error(`wikipedia-suggestions.json HTTP ${res.status}`);
        const snap = (await res.json()) as WikiSuggestSnapshot;
        cache = snap.suggestions ?? {};
      } catch {
        cache = {};
      }
      return cache;
    })();
  }
  return pending;
}

interface WikiMemo {
  accepted: Record<string, string>; // quakeId -> url
  dismissed: Record<string, true>;
}

function memo(): WikiMemo {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const m = JSON.parse(raw) as Partial<WikiMemo>;
      return {
        accepted: m.accepted && typeof m.accepted === "object" ? m.accepted : {},
        dismissed: m.dismissed && typeof m.dismissed === "object" ? m.dismissed : {},
      };
    }
  } catch {
    /* localStorage no disponible */
  }
  return { accepted: {}, dismissed: {} };
}

function save(m: WikiMemo) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* se ignora */
  }
}

export function wikiAcceptedUrl(quakeId: string): string | null {
  return memo().accepted[quakeId] ?? null;
}

export function acceptWiki(quakeId: string, url: string) {
  const m = memo();
  m.accepted[quakeId] = url;
  delete m.dismissed[quakeId];
  save(m);
}

export function wikiDismissed(quakeId: string): boolean {
  return !!memo().dismissed[quakeId];
}

export function dismissWiki(quakeId: string) {
  const m = memo();
  m.dismissed[quakeId] = true;
  delete m.accepted[quakeId];
  save(m);
}
