import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileUp } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { yangiOperationId } from '../../api/supabase';
import { buxBankImport, buxTolovOl, buxXato, type BuxTolovRoyxat } from '../../api/t2-bux-hisob';
import { bankMosla, bankParse, bankYuk, csvGrid, type BankParse } from '../../lib/buxgalteriya/bank';
import { readWorkbookGrids, type Grid } from '../../lib/qarzdorlik/parse';
import { yigindi2 } from '../../lib/hisob-yadro';
import { Izoh, Son, XatoQator } from './umumiy';
import { ddmmyyyy, kirit, td, th, type Davr } from './yordamchi';

const SABAB: Record<string, () => string> = {
  raqam: () => t('shartnoma raqami bo‘yicha'), inn: () => t('STIR bo‘yicha'), nom: () => t('nomi bo‘yicha'),
  bir_nechta: () => t('bir nechta shartnoma — tanlang'), topilmadi: () => t('topilmadi — tanlang'),
};

/** «Bank va kassa»: to'lovlar ro'yxati + bank ko'chirmasini (CSV/Excel) yuklash, kontragent va shartnomaga moslash. */
export function Bank({ kid, davr, versiya, onOzgardi }: { kid: number; davr: Davr; versiya: number; onOzgardi: () => void }) {
  const [d, setD] = useState<BuxTolovRoyxat | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);
  const [parse, setParse] = useState<BankParse | null>(null);
  const [fayl, setFayl] = useState<{ nom: string; grid: Grid } | null>(null);
  const [kreditKirim, setKreditKirim] = useState(true);
  const [tanlov, setTanlov] = useState<Array<number | null>>([]);
  const [yozilmoqda, setYozilmoqda] = useState(false);
  const opRef = useRef<string>(yangiOperationId());

  const yukla = useCallback(async () => {
    setYuk(true);
    const r = await buxTolovOl(kid, { dan: davr.dan, gacha: davr.gacha });
    setYuk(false);
    if (r.ok) { setD(r.natija); setXato(null); } else setXato(r.error);
  }, [kid, davr.dan, davr.gacha]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void yukla(); }, [yukla, versiya]);

  const jami = useMemo(() => ({
    kirim: yigindi2((d?.tolovlar ?? []).filter((x) => x.yonalish === 'kirim').map((x) => x.summa)),
    chiqim: yigindi2((d?.tolovlar ?? []).filter((x) => x.yonalish === 'chiqim').map((x) => x.summa)),
  }), [d]);

  const qayta = useCallback((grid: Grid, kk: boolean) => {
    const p = bankParse(grid, { kreditKirim: kk });
    setParse(p);
    setTanlov(p.qatorlar.map((q) => bankMosla(q, d?.shartnomalar ?? []).shartnoma_id));
    opRef.current = yangiOperationId();
  }, [d]);

  const faylTanla = async (f: File | undefined) => {
    if (!f) return;
    try {
      let grid: Grid;
      if (/\.csv$|\.txt$/i.test(f.name)) grid = csvGrid(await f.text());
      else grid = (await readWorkbookGrids(await f.arrayBuffer()))[0]?.grid ?? [];
      setFayl({ nom: f.name, grid }); qayta(grid, kreditKirim); setXato(null);
    } catch { setXato(t('Faylni o‘qib bo‘lmadi. CSV yoki Excel (.xlsx) yuklang.')); }
  };

  const moslar = useMemo(() => (parse ? bankYuk(parse.qatorlar, tanlov) : []), [parse, tanlov]);
  const yoz = async () => {
    if (moslar.length === 0) return;
    setYozilmoqda(true);
    const r = await buxBankImport({ kompaniyaId: kid, qatorlar: moslar, operationId: opRef.current });
    setYozilmoqda(false);
    if (!r.ok) { setXato(buxXato(r)); return; }
    toast(t('{yangi} ta yangi, {takror} ta takror, {xato} ta xato', { yangi: r.yangi ?? 0, takror: r.takror ?? 0, xato: r.xato ?? 0 }), (r.xato ?? 0) > 0 ? 'danger' : 'ok');
    setParse(null); setFayl(null); void yukla(); onOzgardi();
  };

  const shartnomalar = d?.shartnomalar ?? [];
  return (
    <div className="space-y-4">
      <XatoQator xato={xato} />
      <div className="fz-panel space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="fz-btn cursor-pointer"><FileUp size={14} /> {t('Bank ko‘chirmasini yuklash')}
            <input type="file" accept=".csv,.txt,.xlsx" className="sr-only" aria-label={t('Bank ko‘chirmasi fayli')} onChange={(e) => { void faylTanla(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <Izoh matn={t('CSV yoki Excel. Tizim sana, summa, STIR va to‘lov maqsadini topadi va shartnomaga moslaydi. Moslanmaganini o‘zingiz tanlaysiz. Qayta yuklansa takror yozilmaydi.')} />
          {fayl && <span className="text-[12px] text-text-mute">{fayl.nom}</span>}
          {fayl && (
            <label className="flex items-center gap-1 text-[12px]">
              <input type="checkbox" checked={kreditKirim} onChange={(e) => { setKreditKirim(e.target.checked); qayta(fayl.grid, e.target.checked); }} />
              {t('«Kredit» ustuni = kirim')}
              <Izoh matn={t('Bank ko‘chirmasida pul kelishi odatda «Kredit» ustunida. Agar bankingizda teskari bo‘lsa, belgini oling.')} />
            </label>
          )}
        </div>
        {parse && parse.topilmadi.length > 0 && <p role="alert" className="text-[12.5px] text-danger">{t('Ustun topilmadi: {nom}. Birinchi qatorda «Sana», «Summa» (yoki Debet/Kredit) sarlavhalari bo‘lsin.', { nom: parse.topilmadi.join(', ') })}</p>}
        {parse && parse.qatorlar.length > 0 && (
          <>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full min-w-[820px] text-[12px]" aria-label={t('Ko‘chirma qatorlari')}>
                <thead><tr className="sticky top-0 bg-surface text-left text-[10.5px] uppercase text-text-mute">
                  <th className={th}>{t('Sana')}</th><th className={th}>{t('Yo‘nalish')}</th><th className={`${th} text-right`}>{t('Summa')}</th><th className={th}>{t('Maqsad')}</th><th className={th}>{t('Shartnoma')}</th>
                </tr></thead>
                <tbody>{parse.qatorlar.map((q, j) => {
                  const m = bankMosla(q, shartnomalar);
                  return (
                    <tr key={q.i} className="border-t border-border/30">
                      <td className={td}>{ddmmyyyy(q.sana)}</td>
                      <td className={td}>{q.yonalish === 'kirim' ? t('Kirim') : q.yonalish === 'chiqim' ? t('Chiqim') : '—'}</td>
                      <td className={`${td} text-right`}><Son v={q.summa} /></td>
                      <td className={`${td} max-w-[280px] truncate`} title={q.izoh}>{q.kontragent ? `${q.kontragent} · ` : ''}{q.izoh}</td>
                      <td className={td}>
                        <select aria-label={t('Shartnoma tanlash')} className={`${kirit} w-56`} value={tanlov[j] ?? ''} onChange={(e) => setTanlov((a) => a.map((x, i) => (i === j ? (e.target.value ? Number(e.target.value) : null) : x)))}>
                          <option value="">{SABAB[m.shartnoma_id == null ? m.sabab : 'topilmadi']()}</option>
                          {shartnomalar.map((s) => <option key={s.id} value={s.id}>{s.raqam}{s.kontragent ? ` · ${s.kontragent}` : ''}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="fz-btn" disabled={moslar.length === 0 || yozilmoqda} onClick={() => void yoz()}><CheckCircle2 size={14} /> {t('{n} ta moslangan qatorni yozish', { n: moslar.length })}</button>
              <span className="text-[12px] text-text-mute">{t('Moslanmagan: {n} ta (yozilmaydi)', { n: parse.qatorlar.length - moslar.length })}</span>
            </div>
          </>
        )}
      </div>

      <div className="fz-panel grid grid-cols-2 gap-2 text-[12.5px]" aria-label={t('To‘lovlar jami')}>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Kirim (buyurtmachidan)')}</span><Son v={jami.kirim} qalin /></div>
        <div><span className="mb-1 block text-[11px] uppercase text-text-mute">{t('Chiqim (kontragentlarga)')}</span><Son v={jami.chiqim} qalin /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[12.5px]" aria-label={t('To‘lovlar ro‘yxati')}>
          <thead><tr className="text-left text-[11px] uppercase text-text-mute">
            <th className={th}>{t('Sana')}</th><th className={th}>{t('Yo‘nalish')}</th><th className={th}>{t('Kontragent')}</th><th className={th}>{t('Shartnoma')}</th>
            <th className={`${th} text-right`}>{t('Summa')}</th><th className={th}>{t('Hujjat №')}</th><th className={th}>{t('Provodka')}<Izoh matn={t('Provodkada: bu to‘lov jurnalga yozilgan. Aks holda «Hujjatlardan yangilash» ni bosing.')} /></th>
          </tr></thead>
          <tbody>
            {!yuk && (d?.tolovlar.length ?? 0) === 0 && <tr><td colSpan={7} className="px-2 py-6 text-center text-text-mute">{d ? t('Bu davrda to‘lov yo‘q.') : t('Yuklanmoqda…')}</td></tr>}
            {(d?.tolovlar ?? []).map((x) => (
              <tr key={x.id} className="border-t border-border/50">
                <td className={td}>{ddmmyyyy(x.sana)}</td>
                <td className={td}>{x.yonalish === 'kirim' ? t('Kirim') : t('Chiqim')}{x.tur === 'qaytarim' ? ` (${t('qaytarim')})` : ''}</td>
                <td className={td}>{x.kontragent ?? '—'}</td><td className={td}>{x.shartnoma_raqam}</td>
                <td className={`${td} text-right`}><Son v={x.summa} /></td>
                <td className={td}>{x.hujjat_raqam ?? '—'}</td>
                <td className={td}>{x.provodkada ? <span className="text-ok">{t('Yozilgan')}</span> : <span className="text-warn">{t('Kutmoqda')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
