/**
 * Solishtiruv.tsx — /admin/solishtiruv. Bitta navbat: modullar orasidagi FARQLAR (Forma 3 ↔ F2, F2 ↔ smeta/fakt, to'lov ↔ Forma 3,
 * xarajat ↔ obyekt, buxgalteriya ↔ manba, smeta podvali). Jiddiylik bo'yicha guruhlangan; har birida dalil va tuzatish joyiga havola.
 * Farq yashirilmaydi: qonuniy bo'lsa (avans, qisman to'lov, hali kiritilmagan) SABAB bilan «tushuntiriladi», tuzatilsa o'zi yo'qoladi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { toast } from '../../umumiy/ui/Toast';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { solishtiruvOl, solishtiruvTushuntir, solishtiruvYangila, type SolishtiruvIstisno, type SolishtiruvJavob } from '../../api/t2-solishtiruv';
import { tugma, tugmaAsosiy } from '../zakazchik/tomon-yordam';

const JIDDIYLIK: { kalit: SolishtiruvIstisno['jiddiylik']; nom: string }[] = [
  { kalit: 'high', nom: 'Jiddiy farqlar' }, { kalit: 'medium', nom: 'O‘rtacha farqlar' }, { kalit: 'low', nom: 'Tekshiring (ogohlantirish)' },
];
/** Dalil kalitlari: ustamasiz (QQS siz) pul -> SummaJuft; QQS bilan pul -> FmtN; qolgani matn. */
const PUL_USTAMASIZ = new Set(['forma3_summa', 'f2_summa', 'farq', 'jami']);
const PUL_QQS = new Set(['forma3_jami_qqs_bilan', 'tolangan', 'qoldiq']);
const DALIL_NOMI: Record<string, string> = {
  forma3_summa: 'Forma 3 summasi', f2_summa: 'F2 aktlari yig‘indisi', farq: 'Farq', bekor_f2_soni: 'Bekor qilingan F2 soni', raqam: 'Raqam',
  qator_soni: 'Qatorlar soni', forma3_jami_qqs_bilan: 'Forma 3 jami (QQS bilan)', tolangan: 'To‘langan (QQS bilan)', qoldiq: 'Qoldiq (QQS bilan)', jami: 'Jami',
  soni: 'Soni', eng_eski_forma3: 'Eng eski Forma 3', izoh: 'Izoh', tur: 'Tur',
};

function DalilQatori({ k, v, obyektId }: { k: string; v: unknown; obyektId: number | null }) {
  if (v == null || typeof v === 'object') return null;
  const nom = t(DALIL_NOMI[k] ?? k);
  if (typeof v === 'number' && PUL_USTAMASIZ.has(k)) return <div className="text-[12px]"><span className="text-text-mute">{nom}: </span><SummaJuft obyektId={obyektId} ustamasiz={v} rejim="ustamali" kichik /></div>;
  if (typeof v === 'number' && PUL_QQS.has(k)) return <div className="text-[12px]"><span className="text-text-mute">{nom}: </span><FmtN val={v} /></div>;
  return <div className="text-[12px]"><span className="text-text-mute">{nom}: </span>{String(v)}</div>;
}

export default function Solishtiruv() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [d, setD] = useState<SolishtiruvJavob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [sabab, setSabab] = useState<Record<number, string>>({});

  const ol = useCallback(async () => {
    if (!kompaniyaId) return;
    setYuk(true);
    const r = await solishtiruvOl({ kompaniyaId });
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
    setYuk(false);
  }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);

  const guruh = useMemo(() => JIDDIYLIK.map((g) => ({ ...g, qatorlar: (d?.royxat ?? []).filter((x) => x.jiddiylik === g.kalit) })), [d]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Solishtiruv" />;

  const yangila = async () => {
    setYuk(true);
    const r = await solishtiruvYangila({ kompaniyaId });
    if (r.ok === false) toast(r.error || t('Yangilab bo‘lmadi'), 'danger');
    await ol();
  };
  const tushuntir = async (x: SolishtiruvIstisno, holat: 'tushuntirildi' | 'ochiq') => {
    const matn = (sabab[x.id] ?? '').trim();
    if (holat === 'tushuntirildi' && matn.length < 3) { toast(t('Sababni yozing (kamida 3 belgi)'), 'danger'); return; }
    const r = await solishtiruvTushuntir({ kompaniyaId, id: x.id, holat, sabab: matn });
    if (r.ok === false) toast(r.error || t('Saqlab bo‘lmadi'), 'danger'); else await ol();
  };

  return (
    <Sahifa sarlavha="Solishtiruv" tavsif="Modullar orasidagi farqlar bir joyda: nima, qayerda va qayerdan tuzatish. Farq yashirilmaydi — qonuniy bo‘lsa sabab bilan tushuntiriladi."
      onYangila={() => void yangila()} yangilanmoqda={yuk}>
      <div className="p-4 flex flex-col gap-4 overflow-auto">
        {xato && <div className="text-[13px] text-danger" role="alert">{xato}</div>}
        {d && (
          <div className="text-[13px]" data-testid="solishtiruv-hisob">
            {t('Ochiq jiddiy farqlar')}: <b>{d.hisob.yuqori_ochiq}</b> · {t('Ochiq')}: <b>{d.hisob.ochiq}</b> · {t('Tushuntirilgan')}: <b>{d.hisob.tushuntirildi}</b>
          </div>
        )}
        {d && d.royxat.length === 0 && <div className="text-[13px] text-text-mute">{t('Hozircha farq topilmadi. Tekshiruvlar kechasi ishlaydi; hoziroq ishga tushirish uchun yuqoridagi yangilash tugmasini bosing.')}</div>}
        {guruh.filter((g) => g.qatorlar.length > 0).map((g) => (
          <section key={g.kalit} aria-label={t(g.nom)}>
            <h3 className="text-[13px] font-semibold mb-2">{t(g.nom)} ({g.qatorlar.length})</h3>
            <div className="flex flex-col gap-2">
              {g.qatorlar.map((x) => (
                <article key={x.id} className="border border-border rounded-md p-3 flex flex-col gap-1" data-testid="solishtiruv-istisno">
                  <div className="text-[13px] font-medium">{x.nom}{x.obyekt_nom ? ` — ${x.obyekt_nom}` : ''}</div>
                  <div className="text-[12px] text-text-mute">{x.tavsif}</div>
                  {Object.entries(x.dalil ?? {}).map(([k, v]) => <DalilQatori key={k} k={k} v={v} obyektId={x.obyekt_id} />)}
                  <div className="text-[12px]">{t('Tavsiya')}: {x.tavsiya} <Link className="underline" to={x.havola}>{t('Tuzatish joyiga o‘tish')}</Link></div>
                  {x.holat === 'tushuntirildi' ? (
                    <div className="text-[12px]">
                      <b>{t('Tushuntirilgan')}:</b> {x.sabab}{x.ozgargan ? ` — ${t('dalil o‘zgargan, qayta ko‘rib chiqing')}` : ''}{' '}
                      <button type="button" className={tugma} onClick={() => void tushuntir(x, 'ochiq')}>{t('Qayta ochish')}</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <input className="border border-border rounded px-2 py-1 text-[12px] flex-1 min-w-0" value={sabab[x.id] ?? ''} placeholder={t('Sabab (avans, qisman to‘lov, hali kiritilmagan…)')}
                        aria-label={t('Sabab')} onChange={(e) => setSabab((s) => ({ ...s, [x.id]: e.target.value }))} />
                      <button type="button" className={tugmaAsosiy} onClick={() => void tushuntir(x, 'tushuntirildi')}>{t('Tushuntirish')}</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sahifa>
  );
}
