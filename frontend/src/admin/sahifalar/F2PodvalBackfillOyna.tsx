import { useEffect, useMemo, useState } from 'react';
import { FileUp, ShieldAlert } from 'lucide-react';
import { F2Oyna } from './F2Oyna';
import { FmtN } from '../../lib/format';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { t, tilLocale } from '../../i18n/til';
import { f2AktlarniOqiFonda } from '../../lib/f2-moslash-v3/fonda';
import type { F2Akt } from '../../lib/smeta-anatomiya/f2';
import { aktPodvalYoz, podvalNomzodlari, type PodvalNomzod } from '../../api/t2-akt-podval';
import { podvalMoslash } from '../../lib/akt-podval-moslash';

type Yorliq = { cls: string; matn: string };
function podvalMatni(pv: { tekshiruv: { toliq: boolean } } | null | undefined): Yorliq {
  if (!pv) return { cls: 'text-warn', matn: t('podval topilmadi') };
  if (pv.tekshiruv.toliq) return { cls: 'text-ok', matn: t('isbotlangan') };
  return { cls: 'text-warn', matn: t('isbotlanmagan — yozilmaydi') };
}
function reestrMatni(mos: boolean | null): Yorliq {
  if (mos === null) return { cls: 'text-text-dim', matn: t('reestr jami yo‘q') };
  if (mos) return { cls: 'text-ok', matn: t('mos') };
  return { cls: 'text-warn', matn: t('mos emas') };
}
/**
 * F2 PODVAL BACKFILL (egasi 2026-11-03): tasdiqlangan F2 ning asl faylini qayta yuklang — tizim FAQAT podvalni o'qiydi
 * (qatorlar o'zgarmaydi, F2 qayta import qilinmaydi), uni akt bilan JAMILAR va QATORLAR bo'yicha moslaydi va `t2_akt_podval`
 * ga yozadi (manba: backfill). Moslashni foydalanuvchi tasdiqlaydi; isbotlanmagan podval yozilmaydi (smeta podvali qoladi).
 */
export function F2PodvalBackfillOyna(p: { obyektId: number; kompaniyaId: number; onYop: () => void; onTugadi?: () => void }) {
  const [nomzodlar, setNomzodlar] = useState<PodvalNomzod[] | null>(null);
  const [xato, setXato] = useState('');
  const [fayl, setFayl] = useState('');
  const [aktlar, setAktlar] = useState<F2Akt[] | null>(null);
  const [band, setBand] = useState(false);
  /** varaq → tanlangan akt id (bo'sh — o'tkazib yuboriladi). */
  const [tanlov, setTanlov] = useState<Record<string, number | null>>({});
  const [natija, setNatija] = useState<Record<string, 'ok' | 'xato'>>({});

  const yukla = async () => {
    const r = await podvalNomzodlari(p.obyektId);
    if (!r.ok) { setXato(t('F2 aktlari o‘qilmadi. Qayta urinib ko‘ring.')); return; }
    setNomzodlar(r.aktlar);
  };
  useEffect(() => { void yukla(); }, [p.obyektId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function faylTanlandi(file: File | undefined) {
    if (!file) return;
    setXato(''); setBand(true); setAktlar(null); setNatija({});
    try {
      const a = await f2AktlarniOqiFonda(file.name, file);
      setFayl(file.name); setAktlar(a);
    } catch { setXato(t('Fayl o‘qilmadi. F2 xlsx faylini tanlang.')); }
    finally { setBand(false); }
  }

  const moslash = useMemo(() => {
    if (!aktlar || !nomzodlar) return [];
    return podvalMoslash(aktlar.map((a) => ({ varaq: a.varaq, pryamye: a.jami.pryamye ?? a.qatorlarJami, barglarSoni: a.barglarSoni, podval: a.podval ?? null })), nomzodlar);
  }, [aktlar, nomzodlar]);
  useEffect(() => {
    setTanlov(Object.fromEntries(moslash.map((m) => [m.varaq.varaq, m.tavsiya != null ? m.variantlar[m.tavsiya].nomzod.akt_id : null])));
  }, [moslash]);

  const saqlashga = moslash.filter((m) => tanlov[m.varaq.varaq] != null && m.varaq.podval?.tekshiruv.toliq && natija[m.varaq.varaq] !== 'ok');

  async function saqla() {
    if (!aktlar || band) return;
    setBand(true); setXato('');
    try {
      for (const m of saqlashga) {
        const r = await aktPodvalYoz({ kompaniyaId: p.kompaniyaId, aktId: tanlov[m.varaq.varaq] as number, manba: 'backfill', podval: m.varaq.podval! }).catch(() => null);
        setNatija((s) => ({ ...s, [m.varaq.varaq]: r?.ok ? 'ok' : 'xato' }));
      }
      await yukla(); p.onTugadi?.();
    } finally { setBand(false); }
  }

  /** Reestr jamiga ega, lekin hali hujjat podvali yo'q aktlar (hisobot). */
  const kutilmoqda = (nomzodlar ?? []).filter((n) => n.holat === 'tasdiqlangan' && n.podval_manba == null && (n.reestr_qqssiz != null || n.reestr_qqs_bilan != null));

  return (
    <F2Oyna label={t('F2 podvalini fayldan tiklash')} onYop={band ? undefined : p.onYop} kenglik={980}>
      <div className="fz-card__head" style={{ padding: '10px 16px' }}><h3 className="fz-card__title"><FileUp size={15} aria-hidden="true" /> {t('F2 podvalini fayldan tiklash')}</h3></div>
      <div className="space-y-3 p-4 text-[13px]">
        <p className="text-text-dim">{t('Tasdiqlangan F2 ning asl Excel faylini yuklang: faqat podval (ustama foizlari) o‘qiladi va akt bilan jami/qatorlar bo‘yicha moslanadi. F2 qatorlari o‘zgarmaydi.')}</p>
        <label className="fz-btn inline-flex cursor-pointer items-center gap-2">
          <FileUp aria-hidden="true" />{t('Excel faylni tanlash')}
          <input data-testid="podval-backfill-fayl" type="file" accept=".xlsx,.xlsm" className="sr-only" disabled={band} onChange={(e) => void faylTanlandi(e.target.files?.[0])} />
        </label>
        {fayl && <span className="ml-2 text-text-dim">{fayl}</span>}
        {xato && <p role="alert" className="fz-note fz-note--danger"><ShieldAlert />{xato}</p>}
        {band && <div className="skel min-h-[60px] rounded-xl" />}
        {aktlar && aktlar.length === 0 && <p className="text-text-dim">{t('Faylda F2 varag‘i topilmadi.')}</p>}
        {moslash.length > 0 && (
          <div className="max-h-[42dvh] overflow-auto rounded border border-border/60">
            <table className="w-full text-[12.5px]" data-testid="podval-backfill-jadval">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-dim"><tr><th className="p-1.5">{t('Varaq')}</th><th className="text-right">{t('ПРЯМЫЕ')}</th><th className="text-right">{t('ИТОГО-4')}</th><th>{t('Podval')}</th><th>{t('Akt')}</th><th>{t('Reestr')}</th><th /></tr></thead>
              <tbody>
                {moslash.map((m) => {
                  const pv = m.varaq.podval;
                  const sel = tanlov[m.varaq.varaq] ?? null;
                  const v = m.variantlar.find((x) => x.nomzod.akt_id === sel);
                  const podvalHolat = podvalMatni(pv);
                  const reestrHolat = v ? reestrMatni(v.reestrMos) : null;
                  return (
                    <tr key={m.varaq.varaq} className="border-t border-border/40" data-testid="podval-backfill-qator">
                      <td className="p-1.5 font-medium">{m.varaq.varaq}</td>
                      <td className="text-right tabular-nums">{m.varaq.pryamye == null ? '—' : <FmtN val={m.varaq.pryamye} />}</td>
                      <td className="text-right tabular-nums">{pv?.itogo4 == null ? '—' : <FmtN val={pv.itogo4} />}</td>
                      <td><span className={podvalHolat.cls} title={pv?.tekshiruv.isbotsiz.join(', ')}>{podvalHolat.matn}</span></td>
                      <td>
                        <select aria-label={t('Akt tanlash: {v}', { v: m.varaq.varaq })} value={sel ?? ''} disabled={band || natija[m.varaq.varaq] === 'ok'}
                          onChange={(e) => setTanlov((s) => ({ ...s, [m.varaq.varaq]: e.target.value ? Number(e.target.value) : null }))}>
                          <option value="">{t('— o‘tkazib yuborish —')}</option>
                          {m.variantlar.map((x) => <option key={x.nomzod.akt_id} value={x.nomzod.akt_id}>{`№${x.nomzod.raqam || x.nomzod.akt_id} · ${davrNomi(x.nomzod.oy ?? '', tilLocale()) || '—'} · ${x.sabab.join('+')}`}</option>)}
                        </select>
                      </td>
                      <td>{reestrHolat ? <span className={reestrHolat.cls}>{reestrHolat.matn}</span> : '—'}</td>
                      <td>{natija[m.varaq.varaq] === 'ok' ? <span className="text-ok">{t('saqlandi')}</span> : natija[m.varaq.varaq] === 'xato' ? <span className="text-danger">{t('xato')}</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {kutilmoqda.length > 0 && (
          <p data-testid="podval-backfill-kutilmoqda" className="fz-note fz-note--info">
            {t('Reestr jamiga ega, podvali hali tiklanmagan F2 lar: {n} ta', { n: kutilmoqda.length })} — {kutilmoqda.map((n) => `№${n.raqam || n.akt_id}`).join(', ')}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={p.onYop} disabled={band}>{t('Yopish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" data-testid="podval-backfill-saqla" onClick={() => void saqla()} disabled={band || saqlashga.length === 0}>{t('{n} ta podvalni saqlash', { n: saqlashga.length })}</button>
        </div>
      </div>
    </F2Oyna>
  );
}

export default F2PodvalBackfillOyna;
