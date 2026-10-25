/**
 * MindmapKichik — rahbar paneliga joylanadigan ixcham «Kompaniya xaritasi» kartasi: radial mini-xarita
 * (markaz — kompaniya, 1-halqa — loyihalar, 2-halqa — obyektlar; romb rangi — holat, o‘lchami — smeta),
 * holat taqsimoti va «To‘liq xaritani ochish» havolasi. Faqat o‘qiydi.
 *
 * Foydalanish:
 *   <MindmapKichik kompaniyaId={17} />                 // o‘zi `t2_mindmap_grafi` ni o‘qiydi
 *   <MindmapKichik graf={grafSnapshot} />              // tayyor graf (qayta so‘rov yo‘q)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Map as MapIkon } from 'lucide-react';
import { sbMindmapGrafOl, type MindmapGraf } from '../../api/t2-mindmap';
import { pulQisqa } from '../../lib/format';
import { t, useTil } from '../../i18n/til';
import { daraxtQur, diqqatRoyxati, hajmOlcham, radialJoyla, HOLAT_TARTIB } from '../../lib/mindmap-korinish';
import { HolatChiziq } from './belgilar';
import { HOLAT_RANG, foizMatn, holatNomi } from './holat';
import { Romb } from './belgilar';

export type MindmapKichikProps = {
  /** Graf o‘qiladigan kompaniya (graf berilmasa majburiy). */
  kompaniyaId?: number | null;
  /** Tayyor graf — berilsa server so‘rovi yuborilmaydi. */
  graf?: MindmapGraf | null;
  /** To‘liq xarita manzili. */
  havola?: string;
  /** Mini-xarita balandligi (px). */
  balandlik?: number;
  sarlavha?: string;
  className?: string;
};

export function MindmapKichik({ kompaniyaId, graf: tayyor, havola = '/admin/mindmap', balandlik = 240, sarlavha, className = '' }: MindmapKichikProps) {
  useTil();
  const navigate = useNavigate();
  const [oqilgan, setOqilgan] = useState<{ graf: MindmapGraf | null; xato: string; yuklanmoqda: boolean }>({ graf: null, xato: '', yuklanmoqda: false });
  useEffect(() => {
    if (tayyor || !kompaniyaId) return;
    let bekor = false;
    setOqilgan((s) => ({ ...s, yuklanmoqda: true, xato: '' }));
    sbMindmapGrafOl(kompaniyaId).then((r) => {
      if (bekor) return;
      setOqilgan(r.ok ? { graf: r.graf, xato: '', yuklanmoqda: false } : { graf: null, xato: r.error, yuklanmoqda: false });
    });
    return () => { bekor = true; };
  }, [tayyor, kompaniyaId]);
  const graf = tayyor ?? oqilgan.graf;
  const daraxt = useMemo(() => (graf ? daraxtQur(graf) : null), [graf]);
  const joy = useMemo(() => (daraxt ? radialJoyla(daraxt, 62, 108) : null), [daraxt]);
  const root = daraxt?.tugunlar.get(daraxt.ildiz) ?? null;
  const diqqat = useMemo(() => (daraxt ? diqqatRoyxati(daraxt, 3) : []), [daraxt]);
  const sarlavhaMatn = sarlavha ?? t('Kompaniya xaritasi');
  const yarim = balandlik / 2;
  const masshtab = Math.min(1, (yarim - 14) / 120);

  return (
    <section className={'fz-card flex flex-col ' + className} aria-label={sarlavhaMatn}>
      <div className="fz-card__head">
        <div className="min-w-0">
          <h3 className="fz-card__title inline-flex items-center gap-2"><MapIkon aria-hidden className="h-4 w-4 text-[var(--accent-text)]" />{sarlavhaMatn}</h3>
          {root && <p className="fz-card__sub">{t('{n} ta obyekt', { n: root.obyektSoni }) + ' · ' + t('smeta {s}', { s: (root.smetaToliq ? '' : '≈ ') + pulQisqa(root.smeta) }) + ' · ' + t('F2 {p}', { p: foizMatn(root.f2Foiz) })}</p>}
        </div>
        <Link to={havola} className="fz-btn fz-btn--sm shrink-0 no-underline">{t('To‘liq xaritani ochish')}<ArrowRight aria-hidden /></Link>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="relative min-w-0" style={{ height: balandlik }}>
          {!daraxt && (
            <div className="grid h-full place-items-center text-[12.5px] text-text-mute">
              {oqilgan.xato ? t('Xarita o‘qilmadi: {x}', { x: oqilgan.xato }) : oqilgan.yuklanmoqda || !kompaniyaId ? t('Xarita yuklanmoqda…') : t('Xarita ma’lumoti yo‘q.')}
            </div>
          )}
          {daraxt && joy && root && (
            <svg width="100%" height={balandlik} viewBox={`${-yarim * 1.6} ${-yarim} ${yarim * 3.2} ${balandlik}`} role="img"
              aria-label={HOLAT_TARTIB.map((h) => holatNomi(h) + ': ' + root.holatSanoq[h]).join(' · ')}>
              <g transform={`scale(${masshtab})`}>
                {[...daraxt.tugunlar.values()].filter((x) => x.ota && joy.has(x.ota) && joy.has(x.id)).map((x) => {
                  const a = joy.get(x.ota!)!, b = joy.get(x.id)!;
                  return <line key={'l' + x.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={x.daraja === 1 ? 1.6 : 1} style={{ stroke: 'var(--border-strong)', strokeOpacity: 0.6 }} />;
                })}
                {[...daraxt.tugunlar.values()].filter((x) => x.daraja === 2 && joy.has(x.id)).map((x) => {
                  const p = joy.get(x.id)!;
                  const r = hajmOlcham(x.smeta, daraxt.maxSmeta, 3.5, 8);
                  return (
                    <rect key={x.id} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={1} transform={`rotate(45 ${p.x} ${p.y})`}
                      style={{ fill: HOLAT_RANG[x.holat], cursor: 'pointer' }} onClick={() => navigate(havola + '?tugun=' + encodeURIComponent(x.id))}>
                      <title>{x.nom + ' — ' + holatNomi(x.holat) + ' · F2 ' + foizMatn(x.f2Foiz)}</title>
                    </rect>
                  );
                })}
                {root.bolalar.map((id) => {
                  const x = daraxt.tugunlar.get(id)!, p = joy.get(id)!;
                  return (
                    <g key={id} style={{ cursor: 'pointer' }} onClick={() => navigate(havola + '?tugun=' + encodeURIComponent(id))}>
                      <circle cx={p.x} cy={p.y} r={6} style={{ fill: 'var(--surface-2)', stroke: HOLAT_RANG[x.holat] }} strokeWidth={2} />
                      <title>{(x.tur === 'guruh' ? t('Loyihasiz obyektlar') : x.nom) + ' · ' + t('{n} ta obyekt', { n: x.obyektSoni })}</title>
                    </g>
                  );
                })}
                <rect x={-11} y={-11} width={22} height={22} rx={3} transform="rotate(45)" style={{ fill: 'var(--accent-soft)', stroke: 'var(--accent)' }} />
                <rect x={-5} y={-5} width={10} height={10} rx={1.5} transform="rotate(45)" style={{ fill: 'var(--accent)' }} />
              </g>
            </svg>
          )}
        </div>
        {root && (
          <div className="flex flex-col justify-center gap-2">
            <HolatChiziq sanoq={root.holatSanoq} balandlik={10} />
            <ul className="space-y-1 text-[12.5px]">
              {HOLAT_TARTIB.map((h) => (
                <li key={h} className="flex items-center gap-2">
                  <i aria-hidden className="inline-block h-2 w-2 rotate-45" style={{ background: HOLAT_RANG[h] }} />
                  <span className="flex-1 text-text-dim">{holatNomi(h)}</span>
                  <b className="font-mono tabular-nums">{root.holatSanoq[h]}</b>
                </li>
              ))}
            </ul>
            {diqqat.length > 0 && (
              <div className="mt-1 border-t border-border pt-2">
                <div className="fz-panel__h mb-1">{t('Diqqat markazida')}</div>
                <ul className="space-y-0.5">
                  {diqqat.map((o) => (
                    <li key={o.id}>
                      <Link to={havola + '?tugun=' + encodeURIComponent(o.id)} className="flex items-center gap-1.5 rounded-[var(--radius-xs)] px-1 py-0.5 text-[12px] text-text no-underline hover:bg-[var(--surface-3)]">
                        <Romb holat={o.holat} olcham={6} /><span className="truncate">{o.nom}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
