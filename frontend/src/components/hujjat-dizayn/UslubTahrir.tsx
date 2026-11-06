/**
 * «Hujjat dizayni» tahrirchisi (kompaniya sozlamasi): shrift, daraja uslublari, «Тип» ustuni, son formati, ramka,
 * sarlavha foni, zebra, chekka va yonalish — jonli namuna bilan. Hujjat yozuvchi (`hujjat-yozuvchi/dizayn.ts`)
 * shu qiymatlar bo'yicha HAR hujjatni yasaydi. Alohida sahifa/jadval emas: «Hujjatlar dizayni» sahifasi va
 * `hujjat.dizayn` kompaniya sozlamasining `_uslub` maydoni kengaytiriladi.
 */
import type { CSSProperties } from 'react';
import { t } from '../../i18n/til';
import {
  DARAJALAR, DIZAYN_PRESETLAR, DIZAYN_PRESET_NOMI, SHRIFTLAR,
  type ChegaraTuri, type DarajaKalit, type DarajaUslubi, type DizaynPreset, type HujjatDizayn,
} from '../../lib/hujjat-yozuvchi/dizayn';

const DARAJA_NOMI: Record<DarajaKalit, string> = {
  rz: 'Razdel', bl: 'Ish (BL)', rs: 'Resurs (RS)', mat: 'Material (MAT)', ob: 'Uskuna (OB)', jami: 'Jami', vsego: 'Hammasi (VSEGO)',
};
const CHEGARA_NOMI: Record<ChegaraTuri, string> = { thin: 'Ingichka', hair: 'Juda ingichka', medium: 'Orta', none: 'Yoq' };

/** Namuna hujjat (uydirma ma'lumot): razdel, ish, resurs, material, uskuna, jami. */
const NAMUNA: ReadonlyArray<{ d: DarajaKalit | 'sarlavha'; nom: string; ed: string; kol: number | null; narx: number | null; summa: number | null; tip: string; guruh?: number }> = [
  { d: 'sarlavha', nom: 'Наименование работ и затрат', ed: 'Ед.', kol: null, narx: null, summa: null, tip: 'Тип' },
  { d: 'rz', nom: 'РАЗДЕЛ 1. ФУНДАМЕНТЫ', ed: '', kol: null, narx: null, summa: null, tip: 'rz' },
  { d: 'bl', nom: 'УСТРОЙСТВО ФУНДАМЕНТНЫХ ПЛИТ', ed: 'М3', kol: 12.5, narx: null, summa: 1234567.5, tip: 'bl', guruh: 1 },
  { d: 'rs', nom: 'Затраты труда рабочих', ed: 'чел-ч', kol: 31.25, narx: 15000, summa: 468750, tip: 'rs', guruh: 1 },
  { d: 'mat', nom: 'БЕТОН ТЯЖЁЛЫЙ', ed: 'М3', kol: 12.75, narx: 52000, summa: 663000, tip: 'mat', guruh: 1 },
  { d: 'ob', nom: 'ВИБРАТОР ГЛУБИННЫЙ', ed: 'ШТ', kol: 1, narx: 102817.5, summa: 102817.5, tip: 'ob', guruh: 1 },
  { d: 'bl', nom: 'ГИДРОИЗОЛЯЦИЯ ОБМАЗОЧНАЯ', ed: 'М2', kol: 80, narx: null, summa: 345000, tip: 'bl', guruh: 2 },
  { d: 'rs', nom: 'Затраты труда рабочих', ed: 'чел-ч', kol: 20, narx: 15000, summa: 300000, tip: 'rs', guruh: 2 },
  { d: 'mat', nom: 'МАСТИКА БИТУМНАЯ', ed: 'КГ', kol: 9, narx: 5000, summa: 45000, tip: 'mat', guruh: 2 },
  { d: 'jami', nom: 'Итого по разделу', ed: '', kol: null, narx: null, summa: 1579567.5, tip: '' },
  { d: 'vsego', nom: 'ВСЕГО', ed: '', kol: null, narx: null, summa: 1579567.5, tip: '' },
];

const fmt = (n: number | null, x: number) => (n == null ? '' : n.toLocaleString('ru-RU', { minimumFractionDigits: x, maximumFractionDigits: x }));

function chegaraCss(c: ChegaraTuri): string {
  return c === 'none' ? 'none' : c === 'hair' ? '1px dotted #777' : c === 'medium' ? '2px solid #333' : '1px solid #333';
}

/** Jonli namuna: Excel dagi qoidalar bilan bir xil (daraja uslubi, ramka, otstup, zebra, ustun yashirinligi). */
export function DizaynNamuna({ d }: { d: HujjatDizayn }) {
  const bd = chegaraCss(d.chegara);
  return (
    <div className="overflow-x-auto rounded bg-white p-2" data-testid="dizayn-namuna">
      <table className="w-full border-collapse text-black" style={{ fontFamily: `'${d.shrift.nom}', serif`, fontSize: `${d.shrift.olcham * 1.2}px` }}>
        <tbody>
          {NAMUNA.map((q, i) => {
            const sar = q.d === 'sarlavha';
            const u: DarajaUslubi | null = sar ? null : d.daraja[q.d as DarajaKalit];
            const zebra = d.zebra && !sar && (q.d === 'bl' || q.d === 'rs' || q.d === 'mat' || q.d === 'ob') && q.guruh === 1 && (u?.fon == null || u.fon === 'FFFFFF');
            const fon = sar ? d.sarlavhaFon : zebra ? d.zebraFon : u?.fon ?? null;
            const ust = !sar && q.d === 'bl' && d.blQalinChiziq ? '2px solid #333' : !sar && (q.d === 'jami' || q.d === 'vsego') && d.jamiQosChiziq ? '3px double #333' : bd;
            const s: CSSProperties = {
              border: bd, borderTop: ust, padding: '2px 5px', verticalAlign: 'top',
              fontWeight: sar || u?.qalin ? 700 : 400, fontStyle: u?.kursiv ? 'italic' : 'normal',
              color: u?.matnRang ? `#${u.matnRang}` : '#000', background: fon ? `#${fon}` : '#fff',
              fontSize: u ? `${(d.shrift.olcham + u.olchamQosh) * 1.2}px` : undefined, textAlign: sar ? 'center' : undefined,
            };
            const num: CSSProperties = { ...s, textAlign: 'right', whiteSpace: 'nowrap' };
            return (
              <tr key={i}>
                <td style={{ ...s, paddingLeft: 5 + (u?.otstup ?? 0) * 9 }} data-daraja={q.d}>{q.nom}</td>
                <td style={{ ...s, textAlign: 'center' }}>{q.ed}</td>
                <td style={num}>{fmt(q.kol, d.xonaHajm)}</td>
                <td style={num}>{fmt(q.narx, d.xonaPul)}</td>
                <td style={num}>{sar ? 'Сумма' : fmt(q.summa, d.xonaPul)}</td>
                {d.tipKorsat && <td style={{ ...s, textAlign: 'center' }}>{q.tip}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const inp = 'rounded border border-border bg-transparent px-1.5 py-0.5 text-[12px] text-text';

function Rang({ qiymat, onChange, nom }: { qiymat: string | null; onChange: (h: string | null) => void; nom: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input type="color" aria-label={nom} value={qiymat ? `#${qiymat}` : '#ffffff'} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
        onChange={(e) => onChange(e.target.value.replace('#', '').toUpperCase())} />
      <button type="button" aria-label={`${nom}: ${t('Rangni olib tashlash')}`} title={t('Rangni olib tashlash')} onClick={() => onChange(null)}
        className={`rounded border border-border px-1 text-[11px] ${qiymat ? 'text-text' : 'text-text-mute'}`}>×</button>
    </span>
  );
}

export function UslubTahrir({ dizayn, onChange, oqish = false }: { dizayn: HujjatDizayn; onChange: (d: HujjatDizayn) => void; oqish?: boolean }) {
  const o = (p: Partial<HujjatDizayn>) => onChange({ ...dizayn, ...p, preset: 'maxsus' });
  const daraja = (k: DarajaKalit, p: Partial<DarajaUslubi>) => o({ daraja: { ...dizayn.daraja, [k]: { ...dizayn.daraja[k], ...p } } });
  const chekka = (k: keyof HujjatDizayn['chekka'], v: number) => o({ chekka: { ...dizayn.chekka, [k]: Math.min(2, Math.max(0, Number.isFinite(v) ? v : 0)) } });
  const lbl = 'flex items-center gap-1.5 text-[12px] text-text-dim';
  return (
    <section className="karta space-y-3 p-3" aria-label={t('Hujjat dizayni')}>
      <h2 className="m-0 text-[14px] font-semibold text-text">{t('Hujjat dizayni')}</h2>
      <p className="m-0 text-[11px] text-text-mute">{t('Dizayn kompaniya sozlamasi sifatida saqlanadi va barcha rasmiy hujjatlarga (F2, Forma-3, LRV, M-29, ostatka va boshqalar) qollanadi.')}</p>
      <fieldset disabled={oqish} className="m-0 space-y-3 border-0 p-0">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Tayyor andozalar')}>
          <span className="text-[12px] text-text-dim">{t('Tayyor andozalar')}:</span>
          {(Object.keys(DIZAYN_PRESETLAR) as DizaynPreset[]).map((p) => (
            <button key={p} type="button" aria-pressed={dizayn.preset === p} onClick={() => onChange(DIZAYN_PRESETLAR[p])}
              className={`rounded-md border px-2 py-0.5 text-[12px] ${dizayn.preset === p ? 'border-accent text-text' : 'border-border text-text-dim hover:border-accent'}`}>{t(DIZAYN_PRESET_NOMI[p])}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={lbl}>{t('Shrift')}
            <select className={inp} value={dizayn.shrift.nom} onChange={(e) => o({ shrift: { ...dizayn.shrift, nom: e.target.value } })}>
              {SHRIFTLAR.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className={lbl}>{t('Shrift hajmi')}
            <input type="number" min={7} max={14} className={`${inp} w-16`} value={dizayn.shrift.olcham} onChange={(e) => o({ shrift: { ...dizayn.shrift, olcham: Number(e.target.value) } })} />
          </label>
          <label className={lbl}>
            <input type="checkbox" checked={dizayn.tipKorsat} onChange={(e) => o({ tipKorsat: e.target.checked })} />{t('Tip belgisi ustuni hujjatda korinsin')}
          </label>
          <label className={lbl}>
            <input type="checkbox" checked={dizayn.zebra} onChange={(e) => o({ zebra: e.target.checked })} />{t('Ish guruhlari navbatlashgan fon bilan')}
            <Rang qiymat={dizayn.zebraFon} nom={t('Zebra foni')} onChange={(h) => o({ zebraFon: h ?? 'F7F7F7' })} />
          </label>
          <label className={lbl}>{t('Pul xonalari (verguldan keyin)')}
            <input type="number" min={0} max={4} className={`${inp} w-14`} value={dizayn.xonaPul} onChange={(e) => o({ xonaPul: Number(e.target.value) })} />
          </label>
          <label className={lbl}>{t('Hajm xonalari')}
            <input type="number" min={0} max={6} className={`${inp} w-14`} value={dizayn.xonaHajm} onChange={(e) => o({ xonaHajm: Number(e.target.value) })} />
          </label>
          <label className={lbl}>{t('Katak chegarasi')}
            <select className={inp} value={dizayn.chegara} onChange={(e) => o({ chegara: e.target.value as ChegaraTuri })}>
              {(Object.keys(CHEGARA_NOMI) as ChegaraTuri[]).map((c) => <option key={c} value={c}>{t(CHEGARA_NOMI[c])}</option>)}
            </select>
          </label>
          <label className={lbl}>{t('Jadval sarlavhasi foni')}
            <Rang qiymat={dizayn.sarlavhaFon} nom={t('Jadval sarlavhasi foni')} onChange={(h) => o({ sarlavhaFon: h })} />
          </label>
          <label className={lbl}>
            <input type="checkbox" checked={dizayn.blQalinChiziq} onChange={(e) => o({ blQalinChiziq: e.target.checked })} />{t('Yangi ish boshida qalin yuqori chiziq')}
          </label>
          <label className={lbl}>
            <input type="checkbox" checked={dizayn.jamiQosChiziq} onChange={(e) => o({ jamiQosChiziq: e.target.checked })} />{t('Jami ustida qosh chiziq')}
          </label>
          <label className={lbl} title={t('Uzun nomli qator shu sondan ortiq matn qatoriga shishmaydi (0 — cheklovsiz)')}>{t('Qator balandligi (matn qatori, 0 — cheklovsiz)')}
            <input type="number" min={0} max={20} className={`${inp} w-14`} value={dizayn.qatorMaks} onChange={(e) => o({ qatorMaks: Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))) })} />
          </label>
          <label className={lbl}>{t('Varaq yonalishi')}
            <select className={inp} value={dizayn.yonalish} onChange={(e) => o({ yonalish: e.target.value as HujjatDizayn['yonalish'] })}>
              <option value="auto">{t('Hujjatga qarab')}</option>
              <option value="portrait">{t('Tik')}</option>
              <option value="landscape">{t('Yotiq')}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Chekkalar (dyuym)')}>
          <span className="text-[12px] text-text-dim">{t('Chekkalar (dyuym)')}:</span>
          {([['chap', 'Chap'], ['ong', 'Ong'], ['yuqori', 'Yuqori'], ['past', 'Past']] as const).map(([k, nom]) => (
            <label key={k} className={lbl}>{t(nom)}
              <input type="number" step={0.1} min={0} max={2} className={`${inp} w-16`} value={dizayn.chekka[k]} onChange={(e) => chekka(k, Number(e.target.value))} />
            </label>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]" aria-label={t('Daraja uslublari')}>
            <thead>
              <tr className="text-left text-text-dim">
                <th className="py-1 pr-2 font-medium">{t('Daraja')}</th><th className="px-1 font-medium">{t('Qalin')}</th><th className="px-1 font-medium">{t('Kursiv')}</th>
                <th className="px-1 font-medium">{t('Hajm farqi (pt)')}</th><th className="px-1 font-medium">{t('Matn rangi')}</th><th className="px-1 font-medium">{t('Fon')}</th><th className="px-1 font-medium">{t('Otstup')}</th>
              </tr>
            </thead>
            <tbody>
              {DARAJALAR.map((k) => {
                const u = dizayn.daraja[k];
                const nom = t(DARAJA_NOMI[k]);
                return (
                  <tr key={k} className="border-t border-border/60">
                    <td className="py-1 pr-2 text-text">{nom}</td>
                    <td className="px-1"><input type="checkbox" aria-label={`${nom}: ${t('Qalin')}`} checked={u.qalin} onChange={(e) => daraja(k, { qalin: e.target.checked })} /></td>
                    <td className="px-1"><input type="checkbox" aria-label={`${nom}: ${t('Kursiv')}`} checked={u.kursiv} onChange={(e) => daraja(k, { kursiv: e.target.checked })} /></td>
                    <td className="px-1"><input type="number" min={-3} max={4} aria-label={`${nom}: ${t('Hajm farqi (pt)')}`} className={`${inp} w-14`} value={u.olchamQosh} onChange={(e) => daraja(k, { olchamQosh: Number(e.target.value) })} /></td>
                    <td className="px-1"><Rang qiymat={u.matnRang} nom={`${nom}: ${t('Matn rangi')}`} onChange={(h) => daraja(k, { matnRang: h })} /></td>
                    <td className="px-1"><Rang qiymat={u.fon} nom={`${nom}: ${t('Fon')}`} onChange={(h) => daraja(k, { fon: h })} /></td>
                    <td className="px-1"><input type="number" min={0} max={6} aria-label={`${nom}: ${t('Otstup')}`} className={`${inp} w-14`} value={u.otstup} onChange={(e) => daraja(k, { otstup: Number(e.target.value) })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <div className="space-y-1">
        <div className="text-[12px] font-medium text-text">{t('Jonli korinish')}</div>
        <DizaynNamuna d={dizayn} />
      </div>
    </section>
  );
}
