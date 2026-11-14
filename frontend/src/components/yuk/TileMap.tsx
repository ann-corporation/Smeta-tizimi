/** Yengil xarita (kutubxonasiz): plitka tarmog'i, surish, +/- zoom, bosib nuqta tanlash, belgilar va yo'l chizig'i. Provayder: lib/yuk-tashish/geo.ts. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dunyoPiksel, GEO_PROVAYDER, PLITKA, pikseldanNuqta, type Nuqta } from '../../lib/yuk-tashish/geo';

export type XaritaBelgi = { id: string; lat: number; lng: number; yorliq: string; rang?: 'a' | 'b' | 'mashina' | 'yuk' };
type Props = { markaz: Nuqta; zoom: number; belgilar?: XaritaBelgi[]; iz?: Array<[number, number]>; onTanla?: (p: Nuqta) => void; onBelgi?: (id: string) => void; balandlik?: number; yorliq: string };
const RANG: Record<string, string> = { a: '#16a34a', b: '#dc2626', mashina: '#2563eb', yuk: '#d97706' };

export default function TileMap({ markaz, zoom, belgilar = [], iz, onTanla, onBelgi, balandlik = 280, yorliq }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(zoom);
  const [c, setC] = useState(() => dunyoPiksel(markaz, zoom));
  const [o, setO] = useState({ w: 320, h: balandlik });
  const surish = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => { setZ(zoom); setC(dunyoPiksel(markaz, zoom)); }, [markaz.lat, markaz.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const olchov = () => setO({ w: el.clientWidth || 320, h: el.clientHeight || balandlik });
    olchov();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(olchov) : null; ro?.observe(el);
    return () => ro?.disconnect();
  }, [balandlik]);

  const plitkalar = useMemo(() => {
    const n = 2 ** z;
    const x0 = Math.floor((c.x - o.w / 2) / PLITKA), x1 = Math.floor((c.x + o.w / 2) / PLITKA);
    const y0 = Math.max(0, Math.floor((c.y - o.h / 2) / PLITKA)), y1 = Math.min(n - 1, Math.floor((c.y + o.h / 2) / PLITKA));
    const r: Array<{ k: string; url: string; left: number; top: number }> = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      r.push({ k: `${z}/${x}/${y}`, url: GEO_PROVAYDER.plitkaUrl(z, ((x % n) + n) % n, y), left: x * PLITKA - c.x + o.w / 2, top: y * PLITKA - c.y + o.h / 2 });
    }
    return r;
  }, [c, z, o]);

  const ekran = useCallback((p: Nuqta) => { const d = dunyoPiksel(p, z); return { x: d.x - c.x + o.w / 2, y: d.y - c.y + o.h / 2 }; }, [c, z, o]);
  const zoomla = (d: number) => { const nz = Math.max(3, Math.min(17, z + d)); if (nz === z) return; const p = pikseldanNuqta(c.x, c.y, z); setZ(nz); setC(dunyoPiksel(p, nz)); };

  return (
    <div ref={ref} role="application" aria-label={yorliq} style={{ height: balandlik, touchAction: 'none' }}
      className="relative w-full select-none overflow-hidden rounded-lg border border-border bg-surface-2"
      onPointerDown={(e) => { surish.current = { x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const s = surish.current; if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y; if (Math.abs(dx) + Math.abs(dy) > 4) s.moved = true; if (s.moved) { setC((p) => ({ x: p.x - dx, y: p.y - dy })); s.x = e.clientX; s.y = e.clientY; } }}
      onPointerUp={(e) => {
        const s = surish.current; surish.current = null;
        if (s && !s.moved && onTanla) { const r = ref.current!.getBoundingClientRect(); onTanla(pikseldanNuqta(c.x + (e.clientX - r.left - o.w / 2), c.y + (e.clientY - r.top - o.h / 2), z)); }
      }}>
      {plitkalar.map((p) => <img key={p.k} src={p.url} alt="" draggable={false} width={PLITKA} height={PLITKA} loading="lazy" style={{ position: 'absolute', left: p.left, top: p.top }} />)}
      {iz && iz.length > 1 && (
        <svg className="pointer-events-none absolute inset-0" width={o.w} height={o.h} aria-hidden>
          <polyline fill="none" stroke="#2563eb" strokeWidth={3} strokeLinejoin="round" points={iz.map(([la, ln]) => { const e = ekran({ lat: la, lng: ln }); return `${e.x},${e.y}`; }).join(' ')} />
        </svg>
      )}
      {belgilar.map((b) => {
        const e = ekran(b);
        return (
          <button key={b.id} type="button" title={b.yorliq} aria-label={b.yorliq} onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => ev.stopPropagation()} onClick={() => onBelgi?.(b.id)}
            style={{ position: 'absolute', left: e.x - 12, top: e.y - 12, width: 24, height: 24, borderRadius: 12, background: RANG[b.rang ?? 'yuk'], color: '#fff', border: '2px solid #fff', fontSize: 11, fontWeight: 700 }}>
            {b.yorliq.slice(0, 1).toUpperCase()}
          </button>
        );
      })}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" aria-label="+" className="h-9 w-9 rounded bg-surface text-lg shadow" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => zoomla(1)}>+</button>
        <button type="button" aria-label="−" className="h-9 w-9 rounded bg-surface text-lg shadow" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => zoomla(-1)}>−</button>
      </div>
      <span className="absolute bottom-1 left-1 rounded bg-surface/80 px-1 text-[10px] text-text-mute">{GEO_PROVAYDER.atribut}</span>
    </div>
  );
}
