import { useEffect, useRef, useState } from 'react';

/**
 * Graf3D — mindmap'ning 3D, o'z-o'zidan aylanadigan ko'rinishi (egasi 2026-09-30: "grafik 3D da
 * bo'lishi, aylanib turishi, kuchli dizayn, takrorlanmas animatsiya va effektlar"; "sozlamalari bo'lishi
 * kerak — parametrlari, animatsiyalarini boshqarish"; "rang-barang kamalak qilib tashlading" — sukut
 * bo'yicha vazmin bir rangli palitra; "bir-biriga qo'lda bog'lash").
 *
 * Kutubxonasiz (canvas 2D + perspektiv proyeksiya):
 *   - 3D kuch simulyatsiyasi, ochilishda markazdan tarqalish; graf og'irlik markazi atrofida aylanadi,
 *     kamera o'lchamni o'zi moslaydi (qo'lda zoom qilinsa to'xtaydi);
 *   - effektlar: nur halqasi, "nafas", chiziqlarda energiya zarralari, yulduzlar, tumanlik, orbit halqalar;
 *   - bog'lash rejimi: A tugunni, keyin B tugunni bosish — `onBogla(A, B)` (qoidalar va server — ota komponentda);
 *   - sozlamalar paneli (brauzerda eslab qolinadi).
 * Joylashuv faqat ko'rinish uchun — bazadagi mindmap joylashuviga yozilmaydi.
 */
/** `markaz` — ildiz tugun (kompaniya): graf markaziga qotiriladi, katta, alohida rangda, yozuvi doim ko'rinadi. */
export type GrafTugun = { id: string; nom: string; rang: string; tur: string; markaz?: boolean };
export type GrafBog = { manba: string; maqsad: string };

export type Graf3DSozlama = {
  /** Aylanish tezligi: 0 — to'xtagan, 1 — odatiy. */
  aylanish: number;
  zarralar: boolean;
  zarraTezligi: number;
  /** Nur halqasi kuchi: 0 — yo'q. */
  nur: number;
  nafas: boolean;
  yulduzlar: boolean;
  tuman: boolean;
  yozuvlar: 'muhim' | 'hammasi' | 'yoq';
  /** Tugun o'lchami ko'paytiruvchisi. */
  olcham: number;
  /** Bog'lanish uzunligi (tugunlar oralig'i). */
  oraliq: number;
  /** monoxrom — vazmin bir rangli (sukut); tur — har tur o'z rangida. */
  rang: 'monoxrom' | 'tur';
};

export const GRAF3D_SUKUT: Graf3DSozlama = {
  aylanish: 1, zarralar: true, zarraTezligi: 1, nur: 1, nafas: true, yulduzlar: true, tuman: true,
  yozuvlar: 'muhim', olcham: 1, oraliq: 60, rang: 'monoxrom',
};
const SOZLAMA_KALIT = 'graf3d-sozlama-v1';
function sozlamaOqi(): Graf3DSozlama {
  try { return { ...GRAF3D_SUKUT, ...(JSON.parse(localStorage.getItem(SOZLAMA_KALIT) || '{}') as Partial<Graf3DSozlama>) }; } catch { return GRAF3D_SUKUT; }
}

/** Monoxrom palitra: kumush-ko'kish tugunlar, bitta urg'u (tanlash/bog'lash). */
const MONO = '#c9d4ec';
const URGU = '#8fb0ff';
/** Markaz (kompaniya) rangi — palitradan mustaqil, iliq oltin. */
const MARKAZ = '#f2c46d';

type N = GrafTugun & {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  r: number; daraja: number; faza: number; ritm: number;
  sx: number; sy: number; s: number; pz: number;
};
type Zarra = { t: number; tezlik: number };
type Yulduz = { x: number; y: number; z: number; r: number; miltillash: number };

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function Slayder({ nom, v, min, max, step, on }: { nom: string; v: number; min: number; max: number; step: number; on: (x: number) => void }) {
  return (
    <label className="block text-[11px] text-zinc-300">
      <span className="flex justify-between"><span>{nom}</span><span className="tabular-nums text-zinc-500">{v.toFixed(step < 1 ? 1 : 0)}</span></span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-full accent-sky-400" />
    </label>
  );
}
function Belgi({ nom, v, on }: { nom: string; v: boolean; on: (x: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-[11px] text-zinc-300"><span>{nom}</span><input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="accent-sky-400" /></label>
  );
}

export function Graf3D({ tugunlar, boglar, onTanla, onBogla }: {
  tugunlar: readonly GrafTugun[];
  boglar: readonly GrafBog[];
  onTanla?: (id: string) => void;
  /** Qo'lda bog'lash: manba → maqsad (qoidalar va saqlash ota komponentda). */
  onBogla?: (manba: string, maqsad: string) => void;
}) {
  const quti = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const holat = useRef<{ n: N[]; byId: Map<string, N>; e: Array<{ a: N; b: N; zarralar: Zarra[] }>; qo: Map<string, Set<string>> }>({ n: [], byId: new Map(), e: [], qo: new Map() });
  const kamera = useRef({ ay: 0, ax: -0.35, k: 1, masofa: 900 });
  const avtoZoom = useRef(true);
  const markaz = useRef({ x: 0, y: 0, z: 0 });
  const [sozlama, setSozlama] = useState<Graf3DSozlama>(sozlamaOqi);
  const S = useRef(sozlama);
  const [panel, setPanel] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const tanlanganRef = useRef<string | null>(null);
  const qidirRef = useRef('');
  const [qidir, setQidir] = useState('');
  /** Bog'lash rejimi: null — o'chiq; '' — yoqilgan, manba tanlanmagan; id — manba tanlangan. */
  const [boglash, setBoglash] = useState<string | null>(null);
  const boglashRef = useRef<string | null>(null);
  const kursor = useRef({ x: 0, y: 0 });
  const sud = useRef<{ x: number; y: number; kochdi: boolean } | null>(null);
  const issiqlik = useRef(1);
  const yulduzlar = useRef<Yulduz[]>([]);
  const vaqt = useRef(0);

  useEffect(() => {
    S.current = sozlama;
    try { localStorage.setItem(SOZLAMA_KALIT, JSON.stringify(sozlama)); } catch { /* shaxsiy rejim — eslab qolinmaydi */ }
  }, [sozlama]);
  useEffect(() => { boglashRef.current = boglash; }, [boglash]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBoglash(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  useEffect(() => {
    const y: Yulduz[] = [];
    for (let i = 0; i < 380; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), R = 1600 + Math.random() * 1400;
      y.push({ x: R * Math.sin(v) * Math.cos(u), y: R * Math.sin(v) * Math.sin(u), z: R * Math.cos(v), r: Math.random() * 1.3 + 0.2, miltillash: Math.random() * Math.PI * 2 });
    }
    yulduzlar.current = y;
  }, []);

  useEffect(() => {
    const eski = holat.current.byId;
    const daraja = new Map<string, number>();
    for (const b of boglar) { daraja.set(b.manba, (daraja.get(b.manba) ?? 0) + 1); daraja.set(b.maqsad, (daraja.get(b.maqsad) ?? 0) + 1); }
    const n: N[] = tugunlar.map((t) => {
      const o = eski.get(t.id);
      const d = daraja.get(t.id) ?? 0;
      const tez = 3 + Math.random() * 3, u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1);
      return {
        ...t,
        x: o?.x ?? (Math.random() - 0.5) * 4, y: o?.y ?? (Math.random() - 0.5) * 4, z: o?.z ?? (Math.random() - 0.5) * 4,
        vx: o ? 0 : tez * Math.sin(v) * Math.cos(u), vy: o ? 0 : tez * Math.sin(v) * Math.sin(u), vz: o ? 0 : tez * Math.cos(v),
        r: t.markaz ? 18 : 4 + Math.min(12, Math.sqrt(d) * 2.6), daraja: d, faza: Math.random() * Math.PI * 2, ritm: 0.8 + Math.random() * 1.4,
        sx: 0, sy: 0, s: 1, pz: 0,
      };
    });
    const byId = new Map(n.map((x) => [x.id, x]));
    const e: Array<{ a: N; b: N; zarralar: Zarra[] }> = [];
    const qo = new Map<string, Set<string>>();
    const qosh = (k: string, v: string) => { let s = qo.get(k); if (!s) { s = new Set(); qo.set(k, s); } s.add(v); };
    for (const b of boglar) {
      const a = byId.get(b.manba), c = byId.get(b.maqsad);
      if (!a || !c) continue;
      e.push({ a, b: c, zarralar: Array.from({ length: Math.random() < 0.4 ? 2 : 1 }, () => ({ t: Math.random(), tezlik: 0.0015 + Math.random() * 0.004 })) });
      qosh(a.id, c.id); qosh(c.id, a.id);
    }
    holat.current = { n, byId, e, qo };
    issiqlik.current = 1;
  }, [tugunlar, boglar]);
  // Oraliq o'zgarsa — simulyatsiya qayta "isitiladi".
  useEffect(() => { issiqlik.current = Math.max(issiqlik.current, 0.5); }, [sozlama.oraliq]);

  useEffect(() => {
    let raf = 0;
    const qadam = () => {
      vaqt.current += 1 / 60;
      const { n, e } = holat.current;
      const t = issiqlik.current, oraliq = S.current.oraliq;
      if (t > 0.015) {
        const itar = 1800 * (oraliq / 60) ** 2, chegara = (300 * oraliq / 60) ** 2;
        for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) {
          const a = n[i], b = n[j];
          let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 0.5; }
          if (d2 > chegara) continue;
          const d = Math.sqrt(d2), f = Math.min(a.markaz || b.markaz ? 24 : 8, (a.markaz || b.markaz ? 8 : 1) * itar / d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f; a.vz += (dz / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; b.vz -= (dz / d) * f;
        }
        for (const { a, b } of e) {
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const f = (d - (a.markaz || b.markaz ? oraliq * 3 : oraliq)) * 0.03;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f; a.vz += (dz / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; b.vz -= (dz / d) * f;
        }
        for (const a of n) {
          if (a.markaz) { a.x = 0; a.y = 0; a.z = 0; a.vx = 0; a.vy = 0; a.vz = 0; continue; }
          a.vx -= a.x * 0.012; a.vy -= a.y * 0.012; a.vz -= a.z * 0.012;
          a.x += a.vx * t; a.y += a.vy * t; a.z += a.vz * t;
          a.vx *= 0.55; a.vy *= 0.55; a.vz *= 0.55;
        }
        issiqlik.current = t * 0.996;
      }
      if (!sud.current) kamera.current.ay += 0.0022 * S.current.aylanish;
      if (S.current.zarralar) for (const { zarralar } of e) for (const z of zarralar) { z.t += z.tezlik * S.current.zarraTezligi; if (z.t > 1) z.t -= 1; }
      try { chiz(); } catch { /* bitta kadr tashlab ketiladi — animatsiya davom etadi */ }
      raf = requestAnimationFrame(qadam);
    };
    raf = requestAnimationFrame(qadam);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function proyeksiya(x: number, y: number, z: number, w: number, h: number) {
    const { ay, ax, k, masofa } = kamera.current;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sxx = Math.sin(ax);
    const m = markaz.current;
    x -= m.x; y -= m.y; z -= m.z;
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cx - z1 * sxx, z2 = y * sxx + z1 * cx;
    const s = masofa + z2 > 40 ? (masofa / (masofa + z2)) * k : 0;
    return { sx: w / 2 + x1 * s, sy: h / 2 + y2 * s, s, pz: z2 };
  }

  function chiz() {
    const c = canvas.current, q = quti.current;
    if (!c || !q) return;
    const so = S.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = q.clientWidth, h = q.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const T = vaqt.current;
    const rangOf = (a: N) => (so.rang === 'tur' ? a.rang : MONO);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#0e1220'); bg.addColorStop(0.55, '#080a14'); bg.addColorStop(1, '#030409');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    if (so.tuman) {
      const tuman = (cx: number, cy: number, r: number, col: string) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      };
      tuman(w * (0.32 + 0.08 * Math.sin(T * 0.07)), h * (0.36 + 0.06 * Math.cos(T * 0.05)), Math.max(w, h) * 0.45, 'rgba(90,110,170,0.07)');
      tuman(w * (0.7 + 0.07 * Math.cos(T * 0.06)), h * (0.64 + 0.05 * Math.sin(T * 0.08)), Math.max(w, h) * 0.4, 'rgba(70,95,150,0.06)');
    }
    if (so.yulduzlar) {
      // Yulduzlar markazga bog'liq emas va sekinroq aylanadi (parallaks).
      const ayEski = kamera.current.ay, mEski = markaz.current;
      markaz.current = { x: 0, y: 0, z: 0 };
      kamera.current.ay = ayEski * 0.35;
      for (const s of yulduzlar.current) {
        const p = proyeksiya(s.x, s.y, s.z, w, h);
        if (p.s <= 0) continue;
        ctx.fillStyle = `rgba(210,218,240,${0.3 + 0.3 * Math.sin(T * 1.7 + s.miltillash)})`;
        ctx.fillRect(p.sx, p.sy, s.r * p.s * 1.5, s.r * p.s * 1.5);
      }
      kamera.current.ay = ayEski;
      markaz.current = mEski;
    }

    const { n, e, qo } = holat.current;
    // Og'irlik markazi va o'lcham (silliq kuzatiladi) — graf ekran markazida, avtomatik sig'adi.
    if (n.length) {
      let mx = 0, my = 0, mz = 0;
      const ildiz = n.find((a) => a.markaz);
      if (!ildiz) {
        for (const a of n) { mx += a.x; my += a.y; mz += a.z; }
        mx /= n.length; my /= n.length; mz /= n.length;
      }
      const m = markaz.current;
      m.x += (mx - m.x) * 0.08; m.y += (my - m.y) * 0.08; m.z += (mz - m.z) * 0.08;
      if (avtoZoom.current) {
        const d = n.map((a) => Math.hypot(a.x - mx, a.y - my, a.z - mz)).sort((p, q2) => p - q2);
        const R = Math.max(60, d[Math.floor(d.length * 0.92)] ?? 60);
        kamera.current.k += (Math.min(2.2, Math.max(0.15, (Math.min(w, h) * 0.4) / R)) - kamera.current.k) * 0.05;
        kamera.current.masofa += (Math.max(500, R * 3.4) - kamera.current.masofa) * 0.05;
      }
    }
    for (const a of n) Object.assign(a, proyeksiya(a.x, a.y, a.z, w, h));
    const bm = boglashRef.current;
    const hv = hoverRef.current ?? (bm || tanlanganRef.current);
    const qs = qidirRef.current.trim().toLowerCase();
    const faol = hv ? new Set([hv, ...(qo.get(hv) ?? [])]) : null;
    const moslik = (x: N) => !qs || x.nom.toLowerCase().includes(qs);
    const chuqurAlfa = (s: number) => Math.max(0.12, Math.min(1, (s / kamera.current.k - 0.55) * 1.6));
    const [ur, ug, ub] = rgb(URGU);

    for (const { a, b, zarralar } of e) {
      if (a.s <= 0 || b.s <= 0) continue;
      const yoniq = !faol || (faol.has(a.id) && faol.has(b.id) && (a.id === hv || b.id === hv));
      const alfa = (yoniq ? (faol ? 0.85 : 0.26) : 0.04) * Math.min(chuqurAlfa(a.s), chuqurAlfa(b.s));
      const [r1, g1, b1] = faol && yoniq ? [ur, ug, ub] : rgb(rangOf(a));
      const [r2, g2, b2] = faol && yoniq ? [ur, ug, ub] : rgb(rangOf(b));
      const gr = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
      gr.addColorStop(0, `rgba(${r1},${g1},${b1},${alfa})`); gr.addColorStop(1, `rgba(${r2},${g2},${b2},${alfa})`);
      ctx.strokeStyle = gr; ctx.lineWidth = (yoniq && faol ? 1.5 : 0.8) * Math.min(a.s, b.s);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      if (!yoniq || !so.zarralar) continue;
      for (const z of zarralar) {
        const px = a.sx + (b.sx - a.sx) * z.t, py = a.sy + (b.sy - a.sy) * z.t;
        const rr = Math.max(0.3, (faol ? 3 : 2) * (a.s + (b.s - a.s) * z.t));
        const g = ctx.createRadialGradient(px, py, 0, px, py, rr * 2.5);
        g.addColorStop(0, `rgba(255,255,255,${0.85 * alfa + 0.1})`); g.addColorStop(0.4, `rgba(${r2},${g2},${b2},${0.5 * alfa})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rr * 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Bog'lash rejimi: manbadan kursorgacha harakatlanuvchi punktir.
    if (bm) {
      const a = holat.current.byId.get(bm);
      if (a && a.s > 0) {
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -T * 30;
        ctx.strokeStyle = `rgba(${ur},${ug},${ub},0.9)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(kursor.current.x, kursor.current.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const tartib = [...n].sort((p, q2) => q2.pz - p.pz);
    for (const a of tartib) {
      if (a.s <= 0) continue;
      const yoniq = (!faol || faol.has(a.id)) && moslik(a);
      const alfa = (yoniq ? 1 : 0.1) * chuqurAlfa(a.s);
      const urgu = a.id === hv || a.id === bm;
      const [r, g, b] = urgu ? [ur, ug, ub] : a.markaz ? rgb(MARKAZ) : rgb(rangOf(a));
      const nafas = so.nafas ? 1 + 0.12 * Math.sin(T * a.ritm * 2 + a.faza) : 1;
      const R = Math.max(0.5, a.r * a.s * nafas * so.olcham);
      if (so.nur > 0) {
        const hr = R * (2 + 2.2 * so.nur);
        const halo = ctx.createRadialGradient(a.sx, a.sy, 0, a.sx, a.sy, hr);
        halo.addColorStop(0, `rgba(${r},${g},${b},${Math.min(1, 0.5 * so.nur) * alfa})`); halo.addColorStop(0.35, `rgba(${r},${g},${b},${Math.min(1, 0.15 * so.nur) * alfa})`); halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(a.sx, a.sy, hr, 0, Math.PI * 2); ctx.fill();
      }
      const yadro = ctx.createRadialGradient(a.sx - R * 0.35, a.sy - R * 0.35, R * 0.1, a.sx, a.sy, R);
      yadro.addColorStop(0, `rgba(255,255,255,${alfa})`); yadro.addColorStop(0.4, `rgba(${r},${g},${b},${alfa})`); yadro.addColorStop(1, `rgba(${Math.round(r * 0.3)},${Math.round(g * 0.3)},${Math.round(b * 0.3)},${alfa})`);
      ctx.fillStyle = yadro; ctx.beginPath(); ctx.arc(a.sx, a.sy, R, 0, Math.PI * 2); ctx.fill();
      if (urgu || a.markaz) {
        ctx.lineWidth = a.markaz && !urgu ? 1.8 : 1.4;
        for (let i = 0; i < 2; i++) {
          const rr = R * (2 + i * 0.9) + 3 * Math.sin(T * 3 + i);
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.75 - i * 0.3})`;
          ctx.beginPath(); ctx.arc(a.sx, a.sy, rr, T * (1.6 - i * 2.4), T * (1.6 - i * 2.4) + Math.PI * 1.35); ctx.stroke();
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    if (so.yozuvlar === 'yoq' && !faol && !qs) return;
    ctx.textAlign = 'center';
    for (const a of tartib) {
      if (a.s <= 0) continue;
      const yoniq = (!faol || faol.has(a.id)) && moslik(a);
      const korsat = a.markaz || (faol && faol.has(a.id)) || (qs && moslik(a))
        || so.yozuvlar === 'hammasi' || (so.yozuvlar === 'muhim' && (a.daraja >= 5 || a.s / kamera.current.k > 1.25));
      if (!korsat) continue;
      const fs = a.markaz ? Math.max(13, Math.min(18, 15 * a.s)) : Math.max(10, Math.min(15, 11.5 * a.s));
      ctx.font = `${a.id === hv || a.markaz ? 700 : 500} ${fs}px Inter, system-ui, sans-serif`;
      ctx.globalAlpha = (yoniq ? 1 : 0.12) * chuqurAlfa(a.s);
      const matn = a.nom.length > 34 ? a.nom.slice(0, 32) + '…' : a.nom;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(3,4,9,0.85)';
      const ty = a.markaz ? a.sy - a.r * a.s * so.olcham * 2.4 - 6 : a.sy + a.r * a.s * so.olcham + fs + 2;
      ctx.strokeText(matn, a.sx, ty);
      ctx.fillStyle = a.markaz ? MARKAZ : a.id === hv ? '#ffffff' : '#d4d9e8';
      ctx.fillText(matn, a.sx, ty);
      ctx.globalAlpha = 1;
    }
  }

  const topTugun = (ex: number, ey: number) => {
    const r = canvas.current!.getBoundingClientRect();
    const mx = ex - r.left, my = ey - r.top;
    let eng: N | null = null, engZ = Infinity;
    for (const a of holat.current.n) {
      if (a.s <= 0) continue;
      const d = Math.hypot(a.sx - mx, a.sy - my);
      if (d < a.r * a.s * S.current.olcham + 6 && a.pz < engZ) { eng = a; engZ = a.pz; }
    }
    return eng;
  };
  const yangila = (p: Partial<Graf3DSozlama>) => setSozlama((s) => ({ ...s, ...p }));
  const tugma = 'rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-zinc-200 hover:bg-white/10 backdrop-blur';
  const faolTugma = 'rounded-md border border-sky-300/40 bg-sky-400/15 px-2.5 py-1.5 text-[12px] text-sky-100 backdrop-blur';
  const hoverTugun = hover ? holat.current.byId.get(hover) : undefined;

  return (
    <div ref={quti} className="select-none" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#030409' }}>
      <canvas
        ref={canvas}
        style={{ display: 'block', cursor: boglash != null ? 'crosshair' : hover ? 'pointer' : 'grab' }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); sud.current = { x: e.clientX, y: e.clientY, kochdi: false }; }}
        onPointerMove={(e) => {
          const r = canvas.current!.getBoundingClientRect();
          kursor.current = { x: e.clientX - r.left, y: e.clientY - r.top };
          const s = sud.current;
          if (s) {
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) s.kochdi = true;
            kamera.current.ay += dx * 0.006;
            kamera.current.ax = Math.max(-1.4, Math.min(1.4, kamera.current.ax + dy * 0.006));
            s.x = e.clientX; s.y = e.clientY;
            return;
          }
          const id = topTugun(e.clientX, e.clientY)?.id ?? null;
          if (id !== hoverRef.current) { hoverRef.current = id; setHover(id); }
        }}
        onPointerUp={(e) => {
          const s = sud.current;
          sud.current = null;
          if (!s || s.kochdi) return;
          const t = topTugun(e.clientX, e.clientY);
          if (boglash != null) {
            if (!t) return;
            if (!boglash) { setBoglash(t.id); return; }
            if (t.id !== boglash) { onBogla?.(boglash, t.id); setBoglash(null); }
            return;
          }
          tanlanganRef.current = t?.id ?? null;
          if (t) onTanla?.(t.id);
        }}
        onPointerLeave={() => { hoverRef.current = null; setHover(null); }}
        onWheel={(e) => { avtoZoom.current = false; kamera.current.k = Math.min(4, Math.max(0.1, kamera.current.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); }}
      />
      <div className="whitespace-nowrap" style={{ position: 'absolute', left: 12, top: 12, right: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={qidir} onChange={(e) => { setQidir(e.target.value); qidirRef.current = e.target.value; }} placeholder="Qidirish…"
          className="w-52 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-sky-300/60" />
        {onBogla && (
          <button type="button" className={boglash != null ? faolTugma : tugma} onClick={() => setBoglash((b) => (b == null ? '' : null))}
            title="Avval birinchi tugunni, keyin ikkinchisini bosing (Esc — bekor)">
            🔗 {boglash == null ? 'Bog‘lash' : boglash ? 'Ikkinchi tugunni bosing… (Esc)' : 'Birinchi tugunni bosing… (Esc)'}
          </button>
        )}
        <button type="button" className={tugma} onClick={() => yangila({ aylanish: sozlama.aylanish > 0 ? 0 : 1 })}>{sozlama.aylanish > 0 ? '⏸ To‘xtatish' : '⟳ Aylantirish'}</button>
        <button type="button" className={tugma} onClick={() => { kamera.current = { ...kamera.current, ax: -0.35 }; avtoZoom.current = true; }}>Markazlash</button>
        <button type="button" className={panel ? faolTugma : tugma} onClick={() => setPanel((p) => !p)}>⚙ Sozlamalar</button>
      </div>
      {panel && (
        <div className="space-y-2.5 rounded-lg border border-white/10 bg-black/70 p-3 text-zinc-200 backdrop-blur" style={{ position: 'absolute', right: 12, top: 12, width: 250 }}>
          <div className="flex items-center justify-between text-[12px] font-semibold text-zinc-100"><span>Grafik sozlamalari</span>
            <button type="button" className="text-[11px] font-normal text-zinc-400 hover:text-zinc-100" onClick={() => setSozlama(GRAF3D_SUKUT)}>Sukutga qaytarish</button></div>
          <label className="block text-[11px] text-zinc-300">Rang
            <select value={sozlama.rang} onChange={(e) => yangila({ rang: e.target.value as Graf3DSozlama['rang'] })} className="mt-1 w-full rounded border border-white/10 bg-zinc-900 px-1.5 py-1 text-[11px]">
              <option value="monoxrom">Bir rangli (vazmin)</option><option value="tur">Tur bo‘yicha ranglar</option>
            </select></label>
          <label className="block text-[11px] text-zinc-300">Yozuvlar
            <select value={sozlama.yozuvlar} onChange={(e) => yangila({ yozuvlar: e.target.value as Graf3DSozlama['yozuvlar'] })} className="mt-1 w-full rounded border border-white/10 bg-zinc-900 px-1.5 py-1 text-[11px]">
              <option value="muhim">Muhimlari (yaqinlashsa — ko‘proq)</option><option value="hammasi">Hammasi</option><option value="yoq">Faqat tanlanganda</option>
            </select></label>
          <Slayder nom="Aylanish tezligi" v={sozlama.aylanish} min={0} max={3} step={0.1} on={(x) => yangila({ aylanish: x })} />
          <Slayder nom="Nur kuchi" v={sozlama.nur} min={0} max={2} step={0.1} on={(x) => yangila({ nur: x })} />
          <Slayder nom="Tugun o‘lchami" v={sozlama.olcham} min={0.5} max={2} step={0.1} on={(x) => yangila({ olcham: x })} />
          <Slayder nom="Tugunlar oralig‘i" v={sozlama.oraliq} min={30} max={150} step={5} on={(x) => yangila({ oraliq: x })} />
          <Belgi nom="Energiya zarralari" v={sozlama.zarralar} on={(x) => yangila({ zarralar: x })} />
          {sozlama.zarralar && <Slayder nom="Zarralar tezligi" v={sozlama.zarraTezligi} min={0.2} max={3} step={0.1} on={(x) => yangila({ zarraTezligi: x })} />}
          <Belgi nom="Tugun “nafas” olishi" v={sozlama.nafas} on={(x) => yangila({ nafas: x })} />
          <Belgi nom="Yulduzlar" v={sozlama.yulduzlar} on={(x) => yangila({ yulduzlar: x })} />
          <Belgi nom="Tumanlik" v={sozlama.tuman} on={(x) => yangila({ tuman: x })} />
        </div>
      )}
      {hoverTugun && (
        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-[12px] text-zinc-200 backdrop-blur" style={{ position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none' }}>
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: sozlama.rang === 'tur' ? hoverTugun.rang : MONO }} />
          <b>{hoverTugun.nom}</b> <span className="text-zinc-400">· {hoverTugun.tur} · {hoverTugun.daraja} ta bog‘lanish</span>
        </div>
      )}
    </div>
  );
}
