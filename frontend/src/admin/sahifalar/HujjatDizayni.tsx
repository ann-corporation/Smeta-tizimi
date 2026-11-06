import { useCallback, useEffect, useRef, useState } from 'react';
import { kompaniyaSozlamaOl, kompaniyaSozlamaYoz } from '../../api/kompaniya-sozlama';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Check, Palette } from 'lucide-react';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import {
  HUJJAT_TURLARI, MAVZU_HEX, RANG_MAVZULARI, RANG_MAVZU_NOMI, hujjatMavzusi, hujjatMavzusiniSaqla,
  dizaynTozala, hujjatDizayniniSaqla, joriyHujjatDizayni,
  type HujjatDizayn, type HujjatTuri, type QatorRangi, type RangMavzusi,
} from '../../lib/hujjat-yozuvchi';
import { UslubTahrir } from '../../components/hujjat-dizayn/UslubTahrir';

const fon = (m: RangMavzusi, r: QatorRangi | null) => {
  const h = r ? MAVZU_HEX[m][r] : null;
  return h ? `#${h}` : '#ffffff';
};

/** Kichik namuna: hujjatning o'zidagi kabi qator turlari — tanlangan mavzu ranglarida. */
function Namuna({ m }: { m: RangMavzusi }) {
  const q: Array<{ r: QatorRangi | null; t: string; s: string; b?: boolean }> = [
    { r: 'header', t: 'Наименование работ и затрат', s: 'Сумма', b: true },
    { r: 'bolim', t: 'ФУНДАМЕНТЫ', s: '', b: true },
    { r: 'ish', t: 'УСТРОЙСТВО ФУНДАМЕНТОВ', s: '359 093,52', b: true },
    { r: m === 'kategoriya' ? 'ЧЕЛ' : null, t: 'Затраты труда рабочих', s: '151 049,77' },
    { r: m === 'kategoriya' ? 'МАШ' : null, t: 'Краны на автомобильном ходу', s: '15 799,12' },
    { r: m === 'kategoriya' ? 'МАТ' : null, t: 'Раствор цементно-песчаный', s: '173 723,88' },
    { r: 'jami', t: 'Итого по разделу', s: '359 093,52', b: true },
    { r: 'vsego', t: 'ИТОГО ПО АКТУ', s: '150 026 606,32', b: true },
  ];
  return (
    <table className="w-full border-collapse font-serif text-[11px] text-black">
      <tbody>{q.map((x, i) => (
        <tr key={i} style={{ background: fon(m, x.r) }}>
          <td className={`border border-neutral-400 px-1.5 py-0.5 ${x.b ? 'font-bold' : ''}`}>{x.t}</td>
          <td className={`w-24 border border-neutral-400 px-1.5 py-0.5 text-right tabular-nums ${x.b ? 'font-bold' : ''}`}>{x.s}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Egasi (2026-10-02): "tizimning o'zida hujjatlar dizaynini har biri uchun tanlash mumkin bo'lsin". */
export function HujjatDizayni() {
  const [tanlov, setTanlov] = useState<Record<HujjatTuri, RangMavzusi>>(() =>
    Object.fromEntries((Object.keys(HUJJAT_TURLARI) as HujjatTuri[]).map((t) => [t, hujjatMavzusi(t)])) as Record<HujjatTuri, RangMavzusi>);
  const [ochiq, setOchiq] = useState<HujjatTuri>('f2');
  const kompaniyaId = useKompaniya().joriyId;
  const yozish = useRef(false);
  const taymer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oxirgi = useRef(tanlov);
  oxirgi.current = tanlov;
  /* Daraja uslubi (shrift, BL/RS/MAT/OB, Тип ustuni …) — hujjat.dizayn sozlamasining _uslub maydoni. */
  const [uslub, setUslub] = useState<HujjatDizayn>(() => joriyHujjatDizayni());
  const uslubRef = useRef(uslub);
  uslubRef.current = uslub;
  /** Kutilayotgan server yozuvi (sahifadan tez chiqilsa ham yo'qolmasin — aks holda keyingi ochilishda eski server qiymati mahalliy tanlovni bosib ketardi). */
  const kutilmoqda = useRef<(() => void) | null>(null);
  const serverga = useCallback((x: Record<string, string>) => {
    if (kompaniyaId == null || !yozish.current) return;
    if (taymer.current) clearTimeout(taymer.current);
    const yoz = () => {
      taymer.current = null; kutilmoqda.current = null;
      void kompaniyaSozlamaYoz({ kompaniya_id: kompaniyaId, kalit: 'hujjat.dizayn', qiymat: { ...x, _uslub: uslubRef.current } }).catch(() => { /* jim — mahalliy saqlangan */ });
    };
    kutilmoqda.current = yoz;
    taymer.current = setTimeout(yoz, 800);
  }, [kompaniyaId]);
  useEffect(() => () => { if (taymer.current) clearTimeout(taymer.current); kutilmoqda.current?.(); }, []);
  /* Server qiymati (butun kompaniya uchun bir xil) → localStorage (rasmiy.ts sinxron o'quvchilari o'zgarmaydi). */
  useEffect(() => {
    if (kompaniyaId == null) return;
    let bekor = false;
    kompaniyaSozlamaOl(kompaniyaId).then((s) => {
      if (bekor) return;
      yozish.current = s.yozish_mumkin;
      const sv = s.sozlamalar['hujjat.dizayn']?.qiymat;
      const svUslub = sv && typeof sv === 'object' ? (sv as Record<string, unknown>)._uslub : null;
      if (svUslub && typeof svUslub === 'object') { const d = dizaynTozala(svUslub); hujjatDizayniniSaqla(d); uslubRef.current = d; setUslub(d); }
      if (sv && typeof sv === 'object') {
        const yangi = { ...oxirgi.current };
        for (const tur of Object.keys(HUJJAT_TURLARI) as HujjatTuri[]) {
          const m = (sv as Record<string, unknown>)[tur];
          if (typeof m === 'string' && (RANG_MAVZULARI as readonly string[]).includes(m)) { hujjatMavzusiniSaqla(tur, m as RangMavzusi); yangi[tur] = m as RangMavzusi; }
        }
        setTanlov(yangi);
      } else if (s.yozish_mumkin && (Object.values(oxirgi.current) as string[]).some((m) => m !== 'kulrang')) {
        serverga(oxirgi.current);
      }
    }).catch(() => { /* jim — mahalliy rejim */ });
    return () => { bekor = true; };
  }, [kompaniyaId, serverga]);
  const uslubOzgardi = (d: HujjatDizayn) => { hujjatDizayniniSaqla(d); uslubRef.current = d; setUslub(d); serverga(oxirgi.current); };
  const tanla = (t: HujjatTuri, m: RangMavzusi) => { hujjatMavzusiniSaqla(t, m); setTanlov((o) => ({ ...o, [t]: m })); serverga({ ...oxirgi.current, [t]: m }); };
  const hammasiga = (m: RangMavzusi) => { for (const t of Object.keys(HUJJAT_TURLARI) as HujjatTuri[]) hujjatMavzusiniSaqla(t, m); serverga(Object.fromEntries(Object.keys(HUJJAT_TURLARI).map((t) => [t, m]))); setTanlov((o) => Object.fromEntries(Object.keys(o).map((t) => [t, m])) as Record<HujjatTuri, RangMavzusi>); };

  return (
    <Sahifa sarlavha="Hujjatlar dizayni" tavsif="Har bir hujjat turi uchun rang mavzusi — Excel va ko'rish oynasida shu qo'llanadi">
      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section className="karta overflow-hidden" aria-label="Hujjat turlari">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[12px] text-text-dim">
            <Palette size={14} className="text-accent" />Hammasiga bir xil:
            {RANG_MAVZULARI.map((m) => <button key={m} type="button" onClick={() => hammasiga(m)} className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:border-accent hover:text-text">{RANG_MAVZU_NOMI[m]}</button>)}
          </div>
          <ul>
            {(Object.entries(HUJJAT_TURLARI) as Array<[HujjatTuri, string]>).map(([t, nom]) => (
              <li key={t} className={`flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 ${ochiq === t ? 'bg-accent/5' : ''}`}>
                <button type="button" onClick={() => setOchiq(t)} className="min-w-0 flex-1 truncate text-left text-[13px] text-text">{nom}</button>
                <div className="flex items-center gap-1" role="radiogroup" aria-label={`Mavzu: ${nom}`}>
                  {RANG_MAVZULARI.map((m) => {
                    const faol = tanlov[t] === m;
                    const h = MAVZU_HEX[m];
                    return (
                      <button key={m} type="button" role="radio" aria-checked={faol} aria-label={`${nom}: ${RANG_MAVZU_NOMI[m]}`} title={RANG_MAVZU_NOMI[m]}
                        onClick={() => { tanla(t, m); setOchiq(t); }}
                        className={`relative flex h-7 w-10 overflow-hidden rounded border ${faol ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}>
                        {m === 'kategoriya'
                          ? (['ЧЕЛ', 'МАШ', 'МАТ'] as const).map((k) => <span key={k} className="flex-1" style={{ background: `#${h[k]}` }} />)
                          : (['bolim', 'ish', 'jami'] as const).map((k) => <span key={k} className="flex-1" style={{ background: h[k] ? `#${h[k]}` : '#fff' }} />)}
                        {faol && <Check size={13} className="absolute inset-0 m-auto text-neutral-700" />}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="karta space-y-2 p-3" aria-label="Namuna">
          <div className="text-[12px] text-text-dim"><b className="text-text">{HUJJAT_TURLARI[ochiq]}</b> — {RANG_MAVZU_NOMI[tanlov[ochiq]]}</div>
          <div className="rounded bg-white p-2"><Namuna m={tanlov[ochiq]} /></div>
          <p className="text-[11px] text-text-mute">Tanlov shu brauzerda saqlanadi va keyingi yuklab olishdan boshlab qo'llanadi. Ranglar chop etishda ham yengil.</p>
        </section>
      </div>
      <div className="mt-3"><UslubTahrir dizayn={uslub} onChange={uslubOzgardi} /></div>
    </Sahifa>
  );
}

export default HujjatDizayni;
