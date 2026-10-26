/**
 * Rahbar panelidagi MINDMAP o'rni (egasi 2026-10-25: «urg'u — mindmapga»).
 * `components/mindmap/MindmapKichik.tsx` (boshqa vazifa quryapti) mavjud bo'lsa — avtomatik ulanadi (props: kompaniyaId, havola, balandlik) (import.meta.glob:
 * fayl yo'q bo'lsa build buzilmaydi). Hozircha — shu panel ma'lumotidan (kompaniya → loyihalar → obyektlar) kichik
 * radial xarita chiziladi: tugun o'lchami — smeta, rangi — obyekt holati. To'liq xarita: /admin/mindmap.
 */
import { lazy, Suspense, useMemo, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Network } from 'lucide-react';
import { t } from '../../i18n/til';
import type { BossExecutive } from '../boss-decision/model';
import { compactMoney } from '../boss-decision/decision-v2';
import { HOLAT_NOMI, HOLAT_RANG, obyektHolati } from '../../lib/rahbar-panel/grafik';
import { GrafikKarta } from './RahbarGrafiklar';

type KichikModul = { default?: ComponentType<Record<string, unknown>>; MindmapKichik?: ComponentType<Record<string, unknown>> };
const modullar = import.meta.glob<KichikModul>('../mindmap/MindmapKichik.tsx');
const yuklovchi = Object.values(modullar)[0];
const Bosh: ComponentType<Record<string, unknown>> = () => null;
const MindmapKichik = yuklovchi
  ? lazy(async () => { const m = await yuklovchi(); return { default: m.MindmapKichik ?? m.default ?? Bosh }; })
  : null;

export function MindmapSlot({ kompaniyaId, kompaniyaNom, e }: { kompaniyaId: number; kompaniyaNom: string; e: BossExecutive | null }) {
  const havola = `/admin/mindmap?tugun=${encodeURIComponent(`kompaniya:${kompaniyaId}`)}`;
  // MindmapKichik o'z kartasi bilan keladi (sarlavha + «To'liq xaritani ochish»).
  if (MindmapKichik) return (
    <div data-testid="rahbar-mindmap-slot" className="flex min-w-0 flex-col">
      <Suspense fallback={<div className="fz-card skel h-80" />}>
        <MindmapKichik kompaniyaId={kompaniyaId} havola={havola} balandlik={300} className="h-full" />
      </Suspense>
    </div>
  );
  return (
    <GrafikKarta sarlavha={t('Bog‘lanishlar xaritasi')} izoh={t('Kompaniya → loyihalar → obyektlar. Tugun o‘lchami — smeta, rangi — holat.')}
      ong={<Link to={havola} className="fz-btn fz-btn--primary fz-btn--sm"><Network aria-hidden="true" />{t('Tayyor Mindmapni ochish')}</Link>}>
      <div data-testid="rahbar-mindmap-slot"><MiniXarita nom={kompaniyaNom} e={e} /></div>
    </GrafikKarta>
  );
}

const W = 640, H = 340, CX = W / 2, CY = H / 2;
const qisqa = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Kichik radial xarita — faqat executive portfel ma'lumotidan (qo'shimcha so'rov yo'q). */
function MiniXarita({ nom, e }: { nom: string; e: BossExecutive | null }) {
  const sxema = useMemo(() => {
    if (!e) return null;
    const loyihalar = e.projects.slice(0, 8);
    const maxSmeta = Math.max(1, ...e.objects.map((o) => o.estimate_known ?? 0));
    return loyihalar.map((p, i) => {
      const burchak = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, loyihalar.length);
      const px = CX + Math.cos(burchak) * 195, py = CY + Math.sin(burchak) * 112;
      const obs = e.objects.filter((o) => (o.project_id ?? null) === (p.project_id ?? null));
      const kor = obs.slice(0, 7);
      return {
        p, px, py, qolgan: obs.length - kor.length,
        obyektlar: kor.map((o, j) => {
          const b = burchak + ((j - (kor.length - 1) / 2) * 0.42);
          const r = o.estimate_known != null && o.estimate_known > 0 ? 4 + 8 * Math.sqrt(o.estimate_known / maxSmeta) : 4;
          return { o, x: px + Math.cos(b) * 52, y: py + Math.sin(b) * 40, r, h: obyektHolati(o) };
        }),
      };
    });
  }, [e]);
  if (!sxema) return <p className="text-[13px] text-text-mute">{t('Portfel modeli ulanmagan — xarita uchun to‘liq Mindmapni oching.')}</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t('Bog‘lanishlar xaritasi')}>
      {sxema.map(({ p, px, py, obyektlar }) => <g key={p.project_id ?? 'none'}>
        <line x1={CX} y1={CY} x2={px} y2={py} stroke="var(--border-strong)" strokeWidth={1.5} />
        {obyektlar.map(({ o, x, y }) => <line key={o.object_id} x1={px} y1={py} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />)}
      </g>)}
      {sxema.map(({ p, px, py, obyektlar, qolgan }) => <g key={`n${p.project_id ?? 'none'}`}>
        {obyektlar.map(({ o, x, y, r, h }) => <circle key={o.object_id} cx={x} cy={y} r={r} fill={`color-mix(in srgb, ${HOLAT_RANG[h]} 45%, var(--surface))`} stroke={HOLAT_RANG[h]} strokeWidth={1.5}>
          <title>{`${o.name} · ${compactMoney(o.estimate_known) ?? '—'} · ${t(HOLAT_NOMI[h])}`}</title>
        </circle>)}
        <rect x={px - 62} y={py - 13} width={124} height={26} rx={6} fill="var(--surface-2)" stroke="var(--accent)" strokeWidth={1} />
        <text x={px} y={py + 4.5} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">{qisqa(p.name)}<title>{`${p.name} · ${p.object_count} · ${compactMoney(p.estimate_known) ?? '—'}`}</title></text>
        {qolgan > 0 && <text x={px} y={py + 27} textAnchor="middle" fontSize={11} fill="var(--text-mute)">{`+${qolgan}`}</text>}
      </g>)}
      <circle cx={CX} cy={CY} r={34} fill="var(--accent)" />
      <text x={CX} y={CY + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--on-accent)">{qisqa(nom, 12)}<title>{nom}</title></text>
    </svg>
  );
}
