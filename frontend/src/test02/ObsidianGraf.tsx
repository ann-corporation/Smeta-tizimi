import { useEffect, useRef, useState } from 'react';

/**
 * ObsidianGraf — mindmap'ning Obsidian "graph view" uslubidagi ko'rinishi (egasi 2026-09-30:
 * "mindmapni ham obsidian shaklida qilib chiroyli qilib ber").
 *
 * Canvas + oddiy kuch simulyatsiyasi (itarish, bog'lanish prujinasi, markazga tortish):
 *   - tugun — dumaloq nuqta, o'lchami bog'lanishlar soniga qarab; rangi — tur rangi;
 *   - chiziqlar ingichka; sichqoncha tugun ustida — qo'shnilari yorishadi, qolgani xiralashadi;
 *   - g'ildirak — kursor ostida zoom, bo'sh joyni sudrash — pan, tugunni sudrash — joyini o'zgartirish;
 *   - bosish — `onTanla(id)` (to'liq sahifaga o'tish yoki tafsilot).
 * Joylashuv faqat ko'rinish uchun — bazadagi mindmap joylashuviga yozilmaydi.
 */
export type GrafTugun = { id: string; nom: string; rang: string; tur: string };
export type GrafBog = { manba: string; maqsad: string };

type N = GrafTugun & { x: number; y: number; vx: number; vy: number; r: number; daraja: number; qotgan: boolean };

export function ObsidianGraf({ tugunlar, boglar, onTanla }: {
  tugunlar: readonly GrafTugun[];
  boglar: readonly GrafBog[];
  onTanla?: (id: string) => void;
}) {
  const quti = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const holat = useRef<{ n: N[]; byId: Map<string, N>; e: Array<[N, N]>; qo: Map<string, Set<string>> }>({ n: [], byId: new Map(), e: [], qo: new Map() });
  const kamera = useRef({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const qidirRef = useRef('');
  const [qidir, setQidir] = useState('');
  const issiqlik = useRef(1);
  const sigdirildi = useRef(false);
  /** Barcha tugunlarni ekranga sig'diradi (Obsidian kabi ochilishda butun graf ko'rinadi). */
  function sigdir() {
    const q = quti.current, n = holat.current.n;
    if (!q || !n.length) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const a of n) { x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); x2 = Math.max(x2, a.x); y2 = Math.max(y2, a.y); }
    const k = Math.min(2, Math.max(0.15, Math.min(q.clientWidth / (x2 - x1 + 120), q.clientHeight / (y2 - y1 + 120))));
    kamera.current = { k, x: -((x1 + x2) / 2) * k, y: -((y1 + y2) / 2) * k };
  }

  // Graf tuzilishi o'zgarganda — tugunlar (mavjud joylari saqlanadi).
  useEffect(() => {
    const eski = holat.current.byId;
    const daraja = new Map<string, number>();
    for (const b of boglar) { daraja.set(b.manba, (daraja.get(b.manba) ?? 0) + 1); daraja.set(b.maqsad, (daraja.get(b.maqsad) ?? 0) + 1); }
    const n: N[] = tugunlar.map((t, i) => {
      const o = eski.get(t.id);
      const a = (i / Math.max(1, tugunlar.length)) * Math.PI * 2, rad = 120 + (i % 7) * 25;
      const d = daraja.get(t.id) ?? 0;
      return { ...t, x: o?.x ?? Math.cos(a) * rad, y: o?.y ?? Math.sin(a) * rad, vx: 0, vy: 0, r: 3.5 + Math.min(10, Math.sqrt(d) * 2.2), daraja: d, qotgan: false };
    });
    const byId = new Map(n.map((x) => [x.id, x]));
    const e: Array<[N, N]> = [];
    const qo = new Map<string, Set<string>>();
    for (const b of boglar) {
      const a = byId.get(b.manba), c = byId.get(b.maqsad);
      if (!a || !c) continue;
      e.push([a, c]);
      (qo.get(a.id) ?? qo.set(a.id, new Set()).get(a.id)!).add(c.id);
      (qo.get(c.id) ?? qo.set(c.id, new Set()).get(c.id)!).add(a.id);
    }
    holat.current = { n, byId, e, qo };
    issiqlik.current = 1;
    sigdirildi.current = false;
  }, [tugunlar, boglar]);

  // Simulyatsiya va chizish sikli.
  useEffect(() => {
    let raf = 0;
    const qadam = () => {
      const { n, e } = holat.current;
      const t = issiqlik.current;
      if (t > 0.02) {
        // Itarish (Coulomb) — O(n²), mindmap hajmi (yuzlab tugun) uchun yetarli.
        for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) {
          const a = n[i], b = n[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
          if (d2 > 400000) continue;
          const f = 2200 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        // Prujina (bog'lanish).
        for (const [a, b] of e) {
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (d - 95) * 0.02;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        for (const a of n) {
          a.vx -= a.x * 0.002; a.vy -= a.y * 0.002; // markazga
          if (a.qotgan) { a.vx = 0; a.vy = 0; continue; }
          a.x += a.vx * t; a.y += a.vy * t; a.vx *= 0.6; a.vy *= 0.6;
        }
        issiqlik.current = t * 0.995;
        if (!sigdirildi.current && issiqlik.current < 0.35) { sigdirildi.current = true; sigdir(); }
      }
      chiz();
      raf = requestAnimationFrame(qadam);
    };
    raf = requestAnimationFrame(qadam);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chiz() {
    const c = canvas.current, q = quti.current;
    if (!c || !q) return;
    const dpr = window.devicePixelRatio || 1;
    const w = q.clientWidth, h = q.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { n, e, qo } = holat.current;
    const { x: kx, y: ky, k } = kamera.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w / 2 + kx), dpr * (h / 2 + ky));
    const hv = hoverRef.current;
    const qs = qidirRef.current.trim().toLowerCase();
    const faol = hv ? new Set([hv, ...(qo.get(hv) ?? [])]) : null;
    const moslik = (x: N) => !qs || x.nom.toLowerCase().includes(qs);
    // Chiziqlar
    ctx.lineWidth = 1 / k;
    for (const [a, b] of e) {
      const yoniq = faol ? (faol.has(a.id) && faol.has(b.id) && (a.id === hv || b.id === hv)) : true;
      ctx.strokeStyle = yoniq ? (faol ? 'rgba(167,139,250,0.9)' : 'rgba(160,160,160,0.28)') : 'rgba(120,120,120,0.07)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Tugunlar
    for (const a of n) {
      const yoniq = (!faol || faol.has(a.id)) && moslik(a);
      ctx.globalAlpha = yoniq ? 1 : 0.15;
      ctx.fillStyle = a.id === hv ? '#a78bfa' : a.rang;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      if (a.id === hv) { ctx.strokeStyle = '#ddd6fe'; ctx.lineWidth = 1.5 / k; ctx.stroke(); }
      // Yozuv: yaqinlashganda yoki faol tugunlarda (Obsidian kabi).
      const muhim = a.daraja >= 5;
      if (k > 1.25 || (faol && faol.has(a.id)) || muhim || (qs && moslik(a))) {
        ctx.globalAlpha = yoniq ? Math.min(1, (faol?.has(a.id) || muhim || qs ? 1 : (k - 1.1) * 3)) : 0.1;
        ctx.fillStyle = '#dcddde';
        ctx.font = `${12 / Math.max(0.8, k)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(a.nom.length > 38 ? a.nom.slice(0, 36) + '…' : a.nom, a.x, a.y + a.r + 12 / Math.max(0.8, k));
      }
      ctx.globalAlpha = 1;
    }
  }

  // Sichqoncha: pan / tugun sudrash / hover / bosish / zoom.
  const sud = useRef<{ tur: 'pan' | 'tugun'; x: number; y: number; id?: string; kochdi: boolean } | null>(null);
  const dunyoga = (ex: number, ey: number) => {
    const r = canvas.current!.getBoundingClientRect(), { x, y, k } = kamera.current;
    return { x: (ex - r.left - r.width / 2 - x) / k, y: (ey - r.top - r.height / 2 - y) / k };
  };
  const topTugun = (ex: number, ey: number) => {
    const p = dunyoga(ex, ey);
    let eng: N | null = null, engD = Infinity;
    for (const a of holat.current.n) { const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < a.r + 6 / kamera.current.k && d < engD) { eng = a; engD = d; } }
    return eng;
  };

  return (
    <div ref={quti} className="select-none" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#1e1e1e' }}>
      <canvas
        ref={canvas}
        className="block"
        style={{ cursor: hover ? 'pointer' : sud.current?.tur === 'pan' ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const t = topTugun(e.clientX, e.clientY);
          sud.current = t ? { tur: 'tugun', id: t.id, x: e.clientX, y: e.clientY, kochdi: false } : { tur: 'pan', x: e.clientX, y: e.clientY, kochdi: false };
          if (t) { t.qotgan = true; issiqlik.current = Math.max(issiqlik.current, 0.3); }
        }}
        onPointerMove={(e) => {
          const s = sud.current;
          if (s) {
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) s.kochdi = true;
            if (s.tur === 'pan') { kamera.current.x += dx; kamera.current.y += dy; s.x = e.clientX; s.y = e.clientY; }
            else { const a = holat.current.byId.get(s.id!); if (a) { const p = dunyoga(e.clientX, e.clientY); a.x = p.x; a.y = p.y; issiqlik.current = Math.max(issiqlik.current, 0.3); } }
            return;
          }
          const t = topTugun(e.clientX, e.clientY);
          const id = t?.id ?? null;
          if (id !== hoverRef.current) { hoverRef.current = id; setHover(id); }
        }}
        onPointerUp={() => {
          const s = sud.current;
          sud.current = null;
          if (s?.tur === 'tugun') {
            const a = holat.current.byId.get(s.id!);
            if (a) a.qotgan = false;
            if (!s.kochdi && s.id) onTanla?.(s.id);
          }
        }}
        onPointerLeave={() => { hoverRef.current = null; setHover(null); }}
        onWheel={(e) => {
          const r = canvas.current!.getBoundingClientRect();
          const cam = kamera.current;
          const oldK = cam.k, newK = Math.min(4, Math.max(0.15, oldK * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
          const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
          cam.x = mx - ((mx - cam.x) / oldK) * newK; cam.y = my - ((my - cam.y) / oldK) * newK; cam.k = newK;
        }}
      />
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={qidir} onChange={(e) => { setQidir(e.target.value); qidirRef.current = e.target.value; }} placeholder="Qidirish…"
          className="w-56 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-violet-400/60" />
        <button type="button" onClick={() => sigdir()}
          className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-300 hover:bg-white/10">Ekranga sig‘dirish</button>
      </div>
      {hover && (() => { const a = holat.current.byId.get(hover); return a ? (
        <div className="rounded-md border border-white/10 bg-black/60 px-3 py-2 text-[12px] text-zinc-200" style={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none' }}>
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: a.rang }} />
          <b>{a.nom}</b> <span className="text-zinc-400">· {a.tur} · {a.daraja} ta bog‘lanish</span>
        </div>) : null; })()}
    </div>
  );
}
