import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { reportMoneyValidity } from '../../lib/money-input';
/**
 * NarxManbalari.tsx — narx manbalari reestri (egasi Q4/Q5, 2026-10-01): kataloglar (kvartal),
 * счет-фактуралар, tijorat takliflari (КП), mash-chas kalkulyatsiyalari, chel-chas e'lonlari.
 * Pozitsiyalar Excel'dan (ustunlarni yagona smeta anatomiyasi aniqlaydi, topilmasa operator
 * tanlaydi) yoki qo'lda. Katta katalog bo'laklab yuklanadi. Smeta narxlariga dalil bog'lash —
 * «Narx dalili» sahifasida.
 */
import { useEffect, useMemo, useState, useRef } from 'react';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { yangiOperationId } from '../../api/supabase';
import {
  NARX_MANBA_TUR_NOMI, narxManbaniYukla, sbNarxManbaBekor, sbNarxManbalarOl,
  type NarxManba, type NarxManbaMalumot, type NarxManbaQatorKirish, type NarxManbaTur,
} from '../../api/t2-narx-dalil';
import type { XlsxWorkbook } from '../../lib/f2-import-parse';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import { katalogniOqi, type KatalogUstunlar } from '../../lib/narx-dalil/katalog-oqish';
import { toast } from '../../umumiy/ui/Toast';
import { KatalogQidiruv } from './KatalogQidiruv';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { ManbaChip } from '../../components/narx/NarxKorinish';

const inp = 'mt-1 h-8 w-full px-2 text-[13px]';
const harf = (i: number) => (i < 0 ? '—' : String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''));

export default function NarxManbalari() {
  const moneyScope = useRef<HTMLDivElement>(null);
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [royxat, setRoyxat] = useState<NarxManba[]>([]);
  const [forma, setForma] = useState<NarxManbaMalumot | null>(null);
  const [kitob, setKitob] = useState<XlsxWorkbook | null>(null);
  const [varaq, setVaraq] = useState('');
  const [qolda, setQolda] = useState<KatalogUstunlar | null>(null);
  const [qoldaQatorlar, setQoldaQatorlar] = useState<NarxManbaQatorKirish[]>([]);
  const [jarayon, setJarayon] = useState<string | null>(null);

  const yukla = () => { if (kompaniyaId) void sbNarxManbalarOl(kompaniyaId).then((r) => setRoyxat(r.ok ? r.qatorlar ?? [] : [])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(yukla, [kompaniyaId]);

  const rows = useMemo(() => (kitob && varaq ? kitob.sheet(varaq)?.rows ?? [] : []), [kitob, varaq]);
  const oqish = useMemo(() => (rows.length ? katalogniOqi(varaq, rows, qolda) : null), [rows, varaq, qolda]);
  const pozitsiyalar = kitob ? oqish?.qatorlar ?? [] : qoldaQatorlar.filter((q) => q.nom.trim());
  const ustunSoni = useMemo(() => rows.slice(0, 50).reduce((m, r) => Math.max(m, r.length), 0), [rows]);

  const faylTanla = async (f: File | undefined) => {
    if (!f) return;
    try {
      const wb = await readXlsxFonda(await f.arrayBuffer());
      setKitob(wb); setVaraq(wb.sheets[0]?.name ?? ''); setQolda(null);
      setForma((x) => ({ ...(x ?? { tur: 'katalog' }), nom: x?.nom || f.name.replace(/\.[^.]+$/, '') }));
    } catch (e) {
      toast('Fayl o‘qilmadi: ' + (e instanceof Error ? e.message : String(e)), 'danger');
    }
  };

  const saqla = async () => {
    if (!reportMoneyValidity(moneyScope.current)) return;
    if (!kompaniyaId || !forma) return;
    if (!forma.nom?.trim() || !forma.tur) { toast('Manba turi va nomi majburiy', 'warn'); return; }
    if (!pozitsiyalar.length) { toast('Pozitsiyalar yo‘q — Excel yuklang yoki qo‘lda kiriting', 'warn'); return; }
    setJarayon('Yuklanmoqda…');
    const r = await narxManbaniYukla(kompaniyaId, forma, pozitsiyalar, yangiOperationId(), 5000,
      (y, j) => setJarayon(`Yuklanmoqda: ${y.toLocaleString('ru-RU')} / ${j.toLocaleString('ru-RU')}`));
    setJarayon(null);
    if (!r.ok) { toast(r.error || 'Saqlanmadi', 'danger'); return; }
    toast(`✓ Manba saqlandi: ${pozitsiyalar.length.toLocaleString('ru-RU')} pozitsiya`, 'ok');
    setForma(null); setKitob(null); setVaraq(''); setQolda(null); setQoldaQatorlar([]);
    yukla();
  };

  const bekor = async (m: NarxManba) => {
    if (!kompaniyaId) return;
    if (!(await tasdiqSora({ sarlavha: t('Manbani bekor qilish'), matn: t('«{nom}» bekor qilinsinmi? (smeta dalili sifatida ishlatilsa — rad etiladi)', { nom: m.nom }), tasdiqMatni: t('Bekor qilish'), xavfli: true }))) return;
    const r = await sbNarxManbaBekor(kompaniyaId, m.id, m.versiya);
    if (r.ok) { toast('Bekor qilindi', 'ok'); yukla(); } else toast(r.error || 'Xato', 'danger');
  };

  const f = (k: keyof NarxManbaMalumot) => (e: { target: { value: string } }) =>
    setForma((x) => ({ ...(x ?? {}), [k]: k === 'yil' || k === 'kvartal' ? (e.target.value ? Number(e.target.value) : null) : e.target.value }));

  const NDS: Record<NarxManba['nds_holati'], { matn: string; cls: string }> = {
    nds_siz: { matn: 'без НДС', cls: 'fz-stamp--info' }, nds_bilan: { matn: 'с НДС', cls: 'fz-stamp--info' }, nomalum: { matn: 'НДС noma’lum', cls: 'fz-stamp--warn' },
  };
  const maxQator = Math.max(1, ...royxat.map((m) => Number(m.qator_soni) || 0));
  const jamiPozitsiya = royxat.reduce((a, m) => a + (Number(m.qator_soni) || 0), 0);
  const jamiDalil = royxat.reduce((a, m) => a + (Number(m.dalil_soni) || 0), 0);
  const yangiTugma = !forma ? <button type="button" onClick={() => setForma({ tur: 'katalog', nds_holati: 'nomalum' })} className="fz-btn fz-btn--primary"><Plus size={14} /> {t('Yangi manba')}</button> : null;
  const ustunManba = oqish ? (oqish.manba === 'anatomiya' ? t('anatomiya aniqladi') : oqish.manba === 'operator' ? t('operator tanladi') : t('topilmadi — qo‘lda tanlang')) : '';

  return (
    <Sahifa sarlavha="Narx manbalari" tavsif="Kataloglar, счет-фактуралар, КП va kalkulyatsiyalar — smeta narxlarining dalili (НАПУ himoyasi)." amallar={yangiTugma}>
    <div className="flex flex-col gap-4">
      <div className="fz-doc__panels">
        <div className="fz-panel"><div className="fz-panel__h"><span>{t('Faol manbalar')}</span></div><b className="font-[family-name:var(--font-display)] text-[22px] tabular-nums">{royxat.length.toLocaleString('ru-RU')}</b></div>
        <div className="fz-panel"><div className="fz-panel__h"><span>{t('Pozitsiyalar')}</span></div><b className="font-[family-name:var(--font-display)] text-[22px] tabular-nums">{jamiPozitsiya.toLocaleString('ru-RU')}</b></div>
        <div className="fz-panel"><div className="fz-panel__h"><span>{t('Smeta narxiga bog‘langan dalillar')}</span></div><b className="font-[family-name:var(--font-display)] text-[22px] tabular-nums">{jamiDalil.toLocaleString('ru-RU')}</b></div>
      </div>

      {/* Egasi 2026-10-03: platforma katalogini ko'rish va qidirish (bir marta yuklanadi, hamma kompaniya uchun). */}
      <KatalogQidiruv />

      {forma && (
        <section ref={moneyScope} className="fz-card">
          <div className="fz-card__head"><div><h3 className="fz-card__title">{t('Yangi narx manbasi')}</h3><p className="fz-card__sub">{t('Rekvizitlar — «Обоснование цен» hujjatiga aynan shunday chiqadi.')}</p></div></div>
          <div className="fz-card__body flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-[12px] text-text-dim md:grid-cols-4">
            <label>{t('Turi')}<select className={inp} value={forma.tur ?? 'katalog'} onChange={(e) => setForma((x) => ({ ...(x ?? {}), tur: e.target.value as NarxManbaTur }))}>
              {Object.entries(NARX_MANBA_TUR_NOMI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="md:col-span-3">{t('Nomi *')}<input className={inp} value={forma.nom ?? ''} onChange={f('nom')} placeholder="Каталог текущих цен, 3 кв. 2026" /></label>
            <label>{t('Raqam')}<input className={inp} value={forma.raqam ?? ''} onChange={f('raqam')} /></label>
            <label>{t('Sana')}<input type="date" className={inp} value={forma.sana ?? ''} onChange={f('sana')} /></label>
            <label>{t('Yil')}<input className={inp} inputMode="numeric" value={forma.yil ?? ''} onChange={f('yil')} /></label>
            <label>{t('Kvartal')}<select className={inp} value={forma.kvartal ?? ''} onChange={f('kvartal')}><option value="">—</option>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label className="md:col-span-2">{t('Yetkazuvchi / nashr etuvchi')}<input className={inp} value={forma.yetkazuvchi ?? ''} onChange={f('yetkazuvchi')} /></label>
            <label>{t('INN')}<input className={inp} value={forma.yetkazuvchi_inn ?? ''} onChange={f('yetkazuvchi_inn')} /></label>
            <label>{t('Region')}<input className={inp} value={forma.region ?? ''} onChange={f('region')} /></label>
            <label>НДС<select className={inp} value={forma.nds_holati ?? 'nomalum'} onChange={(e) => setForma((x) => ({ ...(x ?? {}), nds_holati: e.target.value as NarxManba['nds_holati'] }))}>
              <option value="nomalum">{t('noma’lum')}</option><option value="nds_siz">без НДС</option><option value="nds_bilan">с НДС</option></select></label>
            <label className="md:col-span-3">{t('Izoh')}<input className={inp} value={forma.izoh ?? ''} onChange={f('izoh')} /></label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <label className="fz-btn cursor-pointer"><FileUp size={14} /> {t('Excel’dan pozitsiyalar')}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void faylTanla(e.target.files?.[0])} /></label>
            {kitob && <select className="h-8 px-2" value={varaq} onChange={(e) => { setVaraq(e.target.value); setQolda(null); }}>{kitob.sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>}
            {!kitob && <button type="button" className="fz-btn" onClick={() => setQoldaQatorlar((q) => [...q, { kod: '', nom: '', birlik: '', narx: null }])}>{t('+ qo‘lda pozitsiya')}</button>}
            {oqish && <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-text-dim">
              <span className={`fz-chip ${oqish.manba === 'anatomiya' || oqish.manba === 'operator' ? 'fz-chip--accent' : 'fz-chip--warn'}`}>{t('Ustunlar')}: {ustunManba}</span>
              <span className="fz-chip">{t('pozitsiya')}: {oqish.qatorlar.length.toLocaleString('ru-RU')}</span>
              {oqish.narxsiz > 0 && <span className="fz-chip fz-chip--warn">{t('narxsiz')}: {oqish.narxsiz}</span>}
            </span>}
          </div>

          {kitob && ustunSoni > 0 && (
            <div className="flex flex-wrap gap-3 text-[12px] text-text-dim">
              {(['kod', 'nom', 'birlik', 'narx'] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1.5">{k}: <select className="h-7 px-1" value={(qolda ?? oqish?.ustunlar)?.[k] ?? -1}
                  onChange={(e) => setQolda({ ...(qolda ?? oqish?.ustunlar ?? { kod: -1, nom: -1, birlik: -1, narx: -1, boshQator: 0 }), [k]: Number(e.target.value) })}>
                  <option value={-1}>—</option>{Array.from({ length: ustunSoni }, (_, i) => <option key={i} value={i}>{harf(i)}</option>)}</select></label>
              ))}
              <label className="inline-flex items-center gap-1.5">{t('1-qator:')} <input className="h-7 w-16 px-1" type="number" min={1} value={((qolda ?? oqish?.ustunlar)?.boshQator ?? 0) + 1}
                onChange={(e) => setQolda({ ...(qolda ?? oqish?.ustunlar ?? { kod: -1, nom: -1, birlik: -1, narx: -1, boshQator: 0 }), boshQator: Math.max(0, Number(e.target.value) - 1) })} /></label>
            </div>
          )}

          {!kitob && qoldaQatorlar.length > 0 && (
            <div className="flex flex-col gap-1">
              {qoldaQatorlar.map((q, i) => {
                const set = (p: Partial<NarxManbaQatorKirish>) => setQoldaQatorlar((a) => a.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="grid grid-cols-[1fr_3fr_1fr_1fr_auto] items-center gap-1">
                    <input className={inp} placeholder={t('Kod')} value={q.kod ?? ''} onChange={(e) => set({ kod: e.target.value })} />
                    <input className={inp} placeholder={t('Nomi *')} value={q.nom} onChange={(e) => set({ nom: e.target.value })} />
                    <input className={inp} placeholder={t('Birlik')} value={q.birlik ?? ''} onChange={(e) => set({ birlik: e.target.value })} />
                    <MoneyInput numericValue className={inp} placeholder={t('Narx')} inputMode="decimal" value={q.narx ?? ''} onValueChange={(moneyValue) => set({ narx: moneyValue === '' ? null : Number(moneyValue.replace(/\s/g, '').replace(',', '.')) })} />
                    <button type="button" onClick={() => setQoldaQatorlar((a) => a.filter((_, j) => j !== i))} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm hover:text-danger" aria-label={t('Pozitsiyani olib tashlash')}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {pozitsiyalar.length > 0 && (
            <div className="fz-table-wrap max-h-56">
              <table className="fz-table text-[12px]">
                <thead><tr><th>{t('Kod')}</th><th>{t('Nomi')}</th><th>{t('Birlik')}</th><th className="fz-c-num">{t('Narx')}</th></tr></thead>
                <tbody>
                {pozitsiyalar.slice(0, 50).map((q, i) => <tr key={i}><td className="fz-c-shifr">{q.kod}</td><td>{q.nom}</td><td className="fz-c-unit">{q.birlik}</td><td className="fz-c-num">{q.narx == null ? <span className="fz-chip fz-chip--warn">{t('narxsiz')}</span> : q.narx.toLocaleString('ru-RU')}</td></tr>)}
              </tbody></table>
              {pozitsiyalar.length > 50 && <div className="px-3 py-1.5 text-[12px] text-text-mute">{t('… yana {n} ta', { n: (pozitsiyalar.length - 50).toLocaleString('ru-RU') })}</div>}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {jarayon && <span className="text-[12px] text-text-dim" role="status">{jarayon}</span>}
            <button type="button" className="fz-btn fz-btn--ghost" onClick={() => { setForma(null); setKitob(null); setQoldaQatorlar([]); }}>{t('Bekor')}</button>
            <button type="button" disabled={!!jarayon} className="fz-btn fz-btn--primary" onClick={() => void saqla()}>{t('Saqlash')}</button>
          </div>
          </div>
        </section>
      )}

      <div className="fz-table-wrap">
        <table className="fz-table min-w-[860px]">
          <thead><tr><th>{t('Turi')}</th><th>{t('Nomi')}</th><th>{t('Rekvizit')}</th><th>НДС</th><th className="fz-c-num" style={{ width: 200 }}>{t('Pozitsiya')}</th><th className="fz-c-num">{t('Dalil')}</th><th /></tr></thead>
          <tbody>
            {royxat.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-text-mute">{t('Manba yo‘q — «Yangi manba» bilan katalog, faktura yoki КП yuklang.')}</td></tr>}
            {royxat.map((m) => (
              <tr key={m.id}>
                <td><ManbaChip tur={m.tur} /></td>
                <td className="font-medium">{m.nom}</td>
                <td className="text-[12px] text-text-dim">{[m.raqam && `№ ${m.raqam}`, m.sana, m.kvartal && m.yil ? `${m.kvartal} кв. ${m.yil}` : m.yil, m.region, m.yetkazuvchi].filter(Boolean).join(' · ') || '—'}</td>
                <td><span className={`fz-stamp ${NDS[m.nds_holati]?.cls ?? ''}`}>{t(NDS[m.nds_holati]?.matn ?? m.nds_holati)}</span></td>
                <td className="fz-c-num">
                  <span className="fz-bars__q"><span className="sr-only">{t('Pozitsiya')}</span><b>{Number(m.qator_soni).toLocaleString('ru-RU')}</b><i style={{ ['--w' as string]: `${(Number(m.qator_soni) / maxQator) * 100}%` }} /></span>
                </td>
                <td className="fz-c-num">{Number(m.dalil_soni) > 0 ? <span className="fz-chip fz-chip--accent">{Number(m.dalil_soni).toLocaleString('ru-RU')}</span> : <span className="text-text-mute">0</span>}</td>
                <td className="text-right"><button type="button" onClick={() => void bekor(m)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm hover:text-danger" title={t('Bekor qilish')} aria-label={t('Bekor qilish')}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </Sahifa>
  );
}
