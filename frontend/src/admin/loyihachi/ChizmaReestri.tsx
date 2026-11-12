/**
 * ChizmaReestri.tsx — /admin/chizmalar. Chizma reyestri obyekt bo'yicha, revizyalar bilan (loyihachi / mualliflik nazorati va pudratchi/texnadzor
 * uchun BITTA komponent — qarshi tomon ko'rinishi shu sahifaning o'zi, nusxa emas).
 *
 * Loyihachi (design.write / design.issue): varaq ochadi → revizya (fayl R2 ga) → izoh va smeta ta'siri → pudratchi/texnadzorga CHIQARADI.
 * Pudratchi/texnadzor: yangi revizyani qabul qiladi yoki tuzatish so'raydi; smeta qatori / АОСР ni revizyaga bog'laydi (eskirsa ogohlantiriladi);
 * loyihachi taklifini smeta o'zgarishiga aylantiradi (PTO). Ruxsat serverda; bu yerda faqat ko'rinish.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { toast } from '../../umumiy/ui/Toast';
import { sbLoyihaUmumiy } from '../../api/t2-loyiha';
import { hujjatYukla, hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { aloqalarOl, zakazchikObyektlarOl, type Aloqa, type ZakazchikObyekt } from '../../api/t2-tomon';
import {
  chizmaBoglash, chizmaQarori, chizmaTaasiriOl, chizmaTakliflariOl, chizmalarOl, revizyaBekor, revizyaChiqar, revizyaYarat, taklifQarori, taklifYoz, toplamSaqla,
  type Boglanish, type RevizyaKorinishi, type Taklif, type ToplamKorinishi, type YozishFn,
} from '../../api/t2-loyihachi';
import { CHIZMA_MARKALARI } from '../../lib/loyihachi/chizma-revizya';
import { KORINISH_NOMI, TAKLIF_TURI_NOMI, TAQDIM_NOMI, joriyRevizyasi, revizyaHolatlari, type ChizmaBosqich } from '../../lib/loyihachi/chizma-yadro';
import { t } from '../../i18n/til';
import { QatorTanlagich, type TanlanganQator } from './QatorTanlagich';
import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { Bolim } from '../zakazchik/tomon-ui';
import { inp, sana, tugma, tugmaAsosiy } from '../zakazchik/tomon-yordam';

const RANG: Record<string, string> = { joriy: 'fz-stamp--ok', eskirgan: 'fz-stamp--warn', ruxsatsiz: 'fz-stamp--draft', bekor: 'fz-stamp--draft' };

/** Fayl(lar)ni R2 ga yuklaydi (kompaniyaning umumiy loyihasi ostida) va birinchi hujjat ID sini qaytaradi. */
async function faylYukla(kompaniyaId: number, file: File): Promise<number | null> {
  const lr = await sbLoyihaUmumiy(kompaniyaId);
  if (!lr.ok || !lr.id) { toast(lr.error || t('Fayl uchun loyiha topilmadi'), 'danger'); return null; }
  const r = await hujjatYukla({ file, kompaniyaId, loyihaId: lr.id, documentType: 'chizma' });
  if (!r.ok) { toast(r.xato || t('Fayl yuklanmadi'), 'danger'); return null; }
  return r.data.document_id;
}

/* ───────────── Yangi varaq (loyihachi) ───────────── */
function YangiVaraq({ kompaniyaId, aloqalar, onTayyor }: { kompaniyaId: number; aloqalar: Aloqa[]; onTayyor: () => void }) {
  const faol = aloqalar.filter((a) => a.holat === 'faol');
  const [aloqaId, setAloqaId] = useState<number | ''>('');
  const [obyektId, setObyektId] = useState<number | ''>('');
  const [bosqich, setBosqich] = useState<ChizmaBosqich>('RD');
  const [marka, setMarka] = useState('');
  const [varaq, setVaraq] = useState('');
  const [nom, setNom] = useState('');
  const [oz, setOz] = useState<T2Obyekt[]>([]);
  const [ochilgan, setOchilgan] = useState<ZakazchikObyekt[]>([]);
  const [band, setBand] = useState(false);
  useEffect(() => {
    void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => setOz((r.ok ? r.qatorlar ?? [] : []) as T2Obyekt[]));
    void zakazchikObyektlarOl(kompaniyaId).then((r) => setOchilgan(r.ok ? r.natija : []));
  }, [kompaniyaId]);
  useEffect(() => { if (aloqaId === '' && faol.length === 1) setAloqaId(faol[0].id); }, [faol, aloqaId]);
  const obyektlar = useMemo(() => [
    ...oz.map((o) => ({ id: o.id, nom: o.nom })),
    ...ochilgan.filter((o) => aloqaId === '' || o.aloqa_id === aloqaId).map((o) => ({ id: o.obyekt_id, nom: `${o.obyekt_nom} (${o.qarshi_nom})` })),
  ], [oz, ochilgan, aloqaId]);
  const saqla = async () => {
    if (aloqaId === '' || obyektId === '') return;
    setBand(true);
    const r = await toplamSaqla(kompaniyaId, { aloqaId, obyektId, bosqich, marka, varaq, nom });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(r.natija.qayta ? t('Bu varaq allaqachon bor — yangilandi') : t('Chizma varag‘i ochildi'), 'ok'); setVaraq(''); setNom(''); onTayyor();
  };
  if (!faol.length) return <p className="text-sm text-text-dim">{t('Chizma chiqarish uchun avval pudratchi bilan faol aloqa kerak (Tomonlar aloqasi).')}</p>;
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <label className="text-xs text-text-dim">{t('Pudratchi')}
        <select className={`${inp} mt-1 block w-full`} value={aloqaId} onChange={(e) => setAloqaId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— tanlang —')}</option>{faol.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom} ({a.qarshi_rol})</option>)}</select></label>
      <label className="text-xs text-text-dim">{t('Obyekt')}
        <select className={`${inp} mt-1 block w-full`} value={obyektId} onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('— tanlang —')}</option><ObyektOptionlari obyektlar={obyektlar} /></select></label>
      <label className="text-xs text-text-dim">{t('Bosqich')}
        <select className={`${inp} mt-1 block w-full`} value={bosqich} onChange={(e) => setBosqich(e.target.value as ChizmaBosqich)}>
          <option value="RD">{t('RD — ishchi hujjat')}</option><option value="PD">{t('PD — loyiha hujjati')}</option></select></label>
      <label className="text-xs text-text-dim">{t('Marka (КЖ, АР, ОВ…)')}
        <input list="chizma-markalar" className={`${inp} mt-1 block w-full`} value={marka} onChange={(e) => setMarka(e.target.value)} />
        <datalist id="chizma-markalar">{CHIZMA_MARKALARI.map((m) => <option key={m} value={m} />)}</datalist></label>
      <label className="text-xs text-text-dim">{t('Varaq raqami')}<input className={`${inp} mt-1 block w-full`} value={varaq} onChange={(e) => setVaraq(e.target.value)} placeholder="12" /></label>
      <label className="text-xs text-text-dim md:col-span-2">{t('Nomi')}<input className={`${inp} mt-1 block w-full`} value={nom} onChange={(e) => setNom(e.target.value)} /></label>
      <div className="flex items-end"><button type="button" className={tugmaAsosiy} disabled={band || aloqaId === '' || obyektId === '' || !marka.trim() || !varaq.trim()} onClick={() => void saqla()}>{t('Varaq ochish')}</button></div>
    </div>
  );
}

/* ───────────── Yangi revizya (loyihachi) ───────────── */
function YangiRevizya({ kompaniyaId, toplam, onTayyor }: { kompaniyaId: number; toplam: ToplamKorinishi; onTayyor: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [izoh, setIzoh] = useState('');
  const [taasir, setTaasir] = useState('');
  const [band, setBand] = useState(false);
  const birinchi = toplam.revizyalar.length === 0;
  const yarat = async () => {
    setBand(true);
    let docId: number | null = null;
    if (file) { docId = await faylYukla(kompaniyaId, file); if (docId == null) { setBand(false); return; } }
    const r = await revizyaYarat(kompaniyaId, { toplamId: toplam.id, documentId: docId, ozgarishIzohi: izoh, taasirIzoh: taasir });
    setBand(false);
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Revizya qoralamasi tayyor — endi chiqaring'), 'ok'); setFile(null); setIzoh(''); setTaasir(''); onTayyor();
  };
  return (
    <div className="space-y-2 rounded border border-border p-2">
      <div className="text-xs font-semibold">{birinchi ? t('Birinchi chiqarish (rev. 0)') : t('Yangi revizya')}</div>
      <input type="file" className="block text-xs" aria-label={t('Chizma fayli')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <textarea className={`${inp} block h-14 w-full`} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={birinchi ? t('Izoh (ixtiyoriy)') : t('Nima o‘zgardi? (majburiy)')} />
      <textarea className={`${inp} block h-12 w-full`} value={taasir} onChange={(e) => setTaasir(e.target.value)} placeholder={t('Smetaga ta’siri (ixtiyoriy): qaysi ish qo‘shiladi, almashadi yoki hajmi o‘zgaradi')} />
      <button type="button" className={tugma} disabled={band || (!birinchi && izoh.trim().length < 3)} onClick={() => void yarat()}>{t('Qoralama yaratish')}</button>
    </div>
  );
}

/* ───────────── Takliflar (smeta o'zgarish takliflari) ───────────── */
function Takliflar({ kompaniyaId, toplam, r, egasi, yangila }: { kompaniyaId: number; toplam: ToplamKorinishi; r: RevizyaKorinishi; egasi: boolean; yangila: () => void }) {
  const [royxat, setRoyxat] = useState<Taklif[] | null>(null);
  const [tur, setTur] = useState<Taklif['tur']>('qoshimcha');
  const [nom, setNom] = useState('');
  const [birlik, setBirlik] = useState('');
  const [hajm, setHajm] = useState('');
  const [izoh, setIzoh] = useState('');
  const [qatorId, setQatorId] = useState<Record<number, TanlanganQator | null>>({});
  const [band, setBand] = useState(false);
  const ol = useCallback(async () => { const x = await chizmaTakliflariOl(kompaniyaId, r.id); if (x.ok) setRoyxat(x.natija.takliflar); else toast(x.error, 'danger'); }, [kompaniyaId, r.id]);
  useEffect(() => { void ol(); }, [ol]);
  const yoz = async () => {
    setBand(true);
    const x = await taklifYoz(kompaniyaId, { revizyaId: r.id, tur, nom, birlik, hajm: hajm.trim() === '' ? null : Number(hajm.replace(',', '.')), izoh });
    setBand(false);
    if (!x.ok) { toast(x.error, 'danger'); return; }
    setNom(''); setBirlik(''); setHajm(''); setIzoh(''); void ol(); yangila();
  };
  const qaror = async (k: Taklif, q: 'ozgarishga' | 'rad') => {
    let sabab = '';
    if (q === 'rad') { sabab = window.prompt(t('Rad etish sababi?')) ?? ''; if (sabab.trim().length < 3) return; }
    setBand(true);
    const x = await taklifQarori(kompaniyaId, { taklifId: k.id, qaror: q, obyektId: toplam.obyekt_id, qatorId: qatorId[k.id]?.id ?? null, izoh: sabab });
    setBand(false);
    if (!x.ok) { toast(x.error, 'danger'); return; }
    toast(q === 'rad' ? t('Taklif rad etildi') : t('Smeta o‘zgarishi qoralamasi yaratildi — «Smeta va Fakt» da tasdiqlang'), 'ok'); void ol(); yangila();
  };
  if (!royxat) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  return (
    <div className="space-y-2">
      {royxat.length === 0 && <p className="text-xs text-text-dim">{t('Smeta o‘zgarish takliflari yo‘q')}</p>}
      <ul className="space-y-1">{royxat.map((k) => (
        <li key={k.id} className="rounded border border-border px-2 py-1 text-xs">
          <b>{t(TAKLIF_TURI_NOMI[k.tur])}</b>: {k.nom}{k.hajm != null ? ` · ${k.hajm} ${k.birlik ?? ''}` : ''}{k.izoh ? ` — ${k.izoh}` : ''}
          <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">{k.holat === 'yangi' ? t('Kutilmoqda') : k.holat === 'ozgarishga' ? t('Smeta o‘zgarishiga aylandi') : t('Rad etildi')}</span>
          {k.pto_izoh && <span className="text-text-dim"> · {k.pto_izoh}</span>}
          {!egasi && k.holat === 'yangi' && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {k.tur !== 'qoshimcha' && <QatorTanlagich obyektId={toplam.obyekt_id} tanlangan={qatorId[k.id] ?? null} onTanla={(q) => setQatorId((s) => ({ ...s, [k.id]: q }))} />}
              <button type="button" className={tugmaAsosiy} disabled={band || (k.tur !== 'qoshimcha' && !qatorId[k.id])} onClick={() => void qaror(k, 'ozgarishga')}>{t('Smeta o‘zgarishiga aylantirish')}</button>
              <button type="button" className={tugma} disabled={band} onClick={() => void qaror(k, 'rad')}>{t('Rad etish')}</button>
            </div>)}
        </li>))}</ul>
      {egasi && r.holat !== 'bekor' && (
        <div className="grid gap-2 md:grid-cols-5">
          <select aria-label={t('Taklif turi')} className={inp} value={tur} onChange={(e) => setTur(e.target.value as Taklif['tur'])}>
            {(Object.keys(TAKLIF_TURI_NOMI) as Taklif['tur'][]).map((k) => <option key={k} value={k}>{t(TAKLIF_TURI_NOMI[k])}</option>)}</select>
          <input className={`${inp} md:col-span-2`} placeholder={t('Ish nomi (narxsiz — narxni PTO qo‘yadi)')} value={nom} onChange={(e) => setNom(e.target.value)} />
          <input className={inp} placeholder={t('Hajm')} inputMode="decimal" value={hajm} onChange={(e) => setHajm(e.target.value)} />
          <input className={inp} placeholder={t('Birlik')} value={birlik} onChange={(e) => setBirlik(e.target.value)} />
          <input className={`${inp} md:col-span-4`} placeholder={t('Izoh')} value={izoh} onChange={(e) => setIzoh(e.target.value)} />
          <button type="button" className={tugma} disabled={band || nom.trim().length < 2} onClick={() => void yoz()}>{t('Taklif qo‘shish')}</button>
        </div>)}
    </div>
  );
}

/* ───────────── Bitta revizya qatori ───────────── */
function RevizyaQator({ kompaniyaId, toplam, r, korinish, aloqalar, taklifOch, yangila }: {
  kompaniyaId: number; toplam: ToplamKorinishi; r: RevizyaKorinishi; korinish: string; aloqalar: Aloqa[]; taklifOch: boolean; yangila: () => void;
}) {
  const [tanlanganAloqa, setTanlanganAloqa] = useState<number[]>([toplam.aloqa_id]);
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [taklifKorinadi, setTaklifKorinadi] = useState(taklifOch);
  const egasi = toplam.egasi;
  const faol = aloqalar.filter((a) => a.holat === 'faol');
  const bajar = async (f: YozishFn, xabar: string) => {
    setBand(true); const x = await f(); setBand(false);
    if (!x.ok) { toast(x.error, 'danger'); return; }
    toast(xabar, 'ok'); setMatn(''); yangila();
  };
  const qarorKutmoqda = !egasi && r.taqdim_id != null && (r.taqdim_holat === 'yuborilgan' || r.taqdim_holat === 'ko_rilmoqda');
  return (
    <li className="space-y-2 rounded border border-border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b>rev. {r.revizya}</b>
        <span className={`fz-stamp ${RANG[korinish] ?? ''}`}>{t(KORINISH_NOMI[korinish as keyof typeof KORINISH_NOMI] ?? korinish)}</span>
        {r.taqdim_holat && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">{t(TAQDIM_NOMI[r.taqdim_holat])}</span>}
        {r.ruxsat_vaqti && <span className="text-text-dim">{sana(r.ruxsat_vaqti)}</span>}
        {r.document_id != null && <a className="text-accent underline" href={hujjatYuklabOlishUrl(r.document_id)}><Paperclip size={11} className="mr-1 inline" />{r.fayl ?? `#${r.document_id}`}</a>}
        <button type="button" className="ml-auto text-accent underline" onClick={() => setTaklifKorinadi((v) => !v)}>
          {t('Smeta takliflari')} ({r.taklif_soni}{r.taklif_yangi ? `, ${r.taklif_yangi} ${t('yangi')}` : ''})</button>
      </div>
      {r.ozgarish_izohi && <p className="whitespace-pre-wrap"><b>{t('Nima o‘zgardi')}:</b> {r.ozgarish_izohi}</p>}
      {r.taasir_izoh && <p className="whitespace-pre-wrap"><b>{t('Smetaga ta’siri')}:</b> {r.taasir_izoh}</p>}
      {r.qaror_izoh && <p className="text-text-dim"><b>{t('Qaror izohi')}:</b> {r.qaror_izoh}</p>}

      {egasi && r.holat === 'qoralama' && (
        <div className="space-y-2 rounded border border-dashed border-border p-2">
          <div className="font-semibold">{t('Kimga chiqariladi')}</div>
          <div className="flex flex-wrap gap-3">{faol.map((a) => (
            <label key={a.id} className="inline-flex items-center gap-1"><input type="checkbox" checked={tanlanganAloqa.includes(a.id)}
              onChange={(e) => setTanlanganAloqa((s) => e.target.checked ? [...new Set([...s, a.id])] : s.filter((x) => x !== a.id))} />{a.qarshi_nom} ({a.qarshi_rol})</label>))}</div>
          <textarea className={`${inp} block h-12 w-full`} value={matn} onChange={(e) => setMatn(e.target.value)} placeholder={t('Yuboruvchi izohi (ixtiyoriy)')} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tugmaAsosiy} disabled={band || r.document_id == null || tanlanganAloqa.length === 0}
              title={r.document_id == null ? t('Avval chizma faylini yuklang') : undefined}
              onClick={() => void bajar(() => revizyaChiqar(kompaniyaId, r.id, tanlanganAloqa, matn), t('Revizya chiqarildi — pudratchi va texnadzor xabar oladi'))}>{t('Ishga chiqarish')}</button>
            <button type="button" className={tugma} disabled={band || matn.trim().length < 3} onClick={() => void bajar(() => revizyaBekor(kompaniyaId, r.id, matn), t('Revizya bekor qilindi'))}>{t('Bekor qilish (sabab yozing)')}</button>
          </div>
        </div>)}
      {egasi && r.holat === 'ruxsat' && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inp} w-64`} value={matn} onChange={(e) => setMatn(e.target.value)} placeholder={t('Bekor qilish sababi')} />
          <button type="button" className={tugma} disabled={band || matn.trim().length < 3} onClick={() => void bajar(() => revizyaBekor(kompaniyaId, r.id, matn), t('Revizya bekor qilindi'))}>{t('Revizyani bekor qilish')}</button>
        </div>)}

      {qarorKutmoqda && (
        <div className="space-y-2 rounded border border-dashed border-border p-2">
          <textarea className={`${inp} block h-12 w-full`} value={matn} onChange={(e) => setMatn(e.target.value)} placeholder={t('Izoh (tuzatish yoki rad uchun majburiy)')} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tugmaAsosiy} disabled={band} onClick={() => void bajar(() => chizmaQarori(kompaniyaId, r.taqdim_id!, 'qabul', matn), t('Revizya qabul qilindi'))}>{t('Qabul qilish')}</button>
            <button type="button" className={tugma} disabled={band || matn.trim().length < 3} onClick={() => void bajar(() => chizmaQarori(kompaniyaId, r.taqdim_id!, 'tuzatish', matn), t('Tuzatish so‘ralib yuborildi'))}>{t('Tuzatish so‘rash')}</button>
            <button type="button" className={tugma} disabled={band || matn.trim().length < 3} onClick={() => void bajar(() => chizmaQarori(kompaniyaId, r.taqdim_id!, 'rad', matn), t('Revizya rad etildi'))}>{t('Rad etish')}</button>
          </div>
        </div>)}
      {taklifKorinadi && <Takliflar kompaniyaId={kompaniyaId} toplam={toplam} r={r} egasi={egasi} yangila={yangila} />}
    </li>
  );
}

/* ───────────── Pudratchi: bog'lanishlar (smeta qatori / АОСР) ───────────── */
function Boglanishlar({ kompaniyaId, toplam, boglanishlar, yangila }: { kompaniyaId: number; toplam: ToplamKorinishi; boglanishlar: Boglanish[]; yangila: () => void }) {
  const joriy = joriyRevizyasi(toplam.revizyalar);
  const [qator, setQator] = useState<TanlanganQator | null>(null);
  const [band, setBand] = useState(false);
  const mening = boglanishlar.filter((b) => b.toplam_id === toplam.id);
  const bajar = async (p: { qatorId?: number | null; aosrId?: number | null; harakat: 'qosh' | 'ochir'; revizya: number }) => {
    setBand(true); const x = await chizmaBoglash(kompaniyaId, { toplamId: toplam.id, revizya: p.revizya, obyektId: toplam.obyekt_id, qatorId: p.qatorId, aosrId: p.aosrId, harakat: p.harakat }); setBand(false);
    if (!x.ok) { toast(x.error, 'danger'); return; }
    setQator(null); yangila();
  };
  return (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">{t('Bu chizmaga tayangan ishlar')}</div>
      {mening.length === 0 && <p className="text-text-dim">{t('Hali bog‘lanmagan. Smeta qatorini shu yerda, АОСР ni «АОСР» sahifasida bog‘lang.')}</p>}
      <ul className="space-y-1">{mening.map((b) => {
        const eskirgan = b.joriy != null && b.ishlatilgan < b.joriy;
        return (
          <li key={b.id} className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1">
            <span>{b.qator_id != null ? `${t('Smeta qatori')} #${b.qator_id} ${b.qator_kod ?? ''} ${b.qator_nom ?? ''}` : `АОСР № ${b.aosr_raqam ?? b.aosr_id}`}</span>
            <span className="text-text-dim">rev. {b.ishlatilgan}</span>
            {eskirgan && <span className="fz-stamp fz-stamp--warn">{t('Eskirgan: joriy')} rev. {b.joriy}</span>}
            {eskirgan && <button type="button" className={tugma} disabled={band} onClick={() => void bajar({ qatorId: b.qator_id, aosrId: b.aosr_id, harakat: 'qosh', revizya: b.joriy! })}>{t('Joriy revizyaga yangilash')}</button>}
            <button type="button" className={tugma} disabled={band} onClick={() => void bajar({ qatorId: b.qator_id, aosrId: b.aosr_id, harakat: 'ochir', revizya: b.ishlatilgan })}>{t('Olib tashlash')}</button>
          </li>);
      })}</ul>
      {joriy && (
        <div className="flex flex-wrap items-center gap-2">
          <QatorTanlagich obyektId={toplam.obyekt_id} tanlangan={qator} onTanla={setQator} />
          <button type="button" className={tugma} disabled={band || !qator} onClick={() => void bajar({ qatorId: qator!.id, harakat: 'qosh', revizya: joriy.revizya })}>{t('Joriy revizyaga bog‘lash')}</button>
        </div>)}
    </div>
  );
}

/* ───────────── Sahifa ───────────── */
export default function ChizmaReestri() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const qidiruv = useMemo(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search), []);
  const [toplamlar, setToplamlar] = useState<ToplamKorinishi[] | null>(null);
  const [boglanishlar, setBoglanishlar] = useState<Boglanish[]>([]);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [xato, setXato] = useState('');
  const [obyektFiltr, setObyektFiltr] = useState<number | ''>('');
  const [filtr, setFiltr] = useState<string>(qidiruv.get('holat') ?? (qidiruv.get('taklif') ? 'taklif' : ''));
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const perm = (joriy as { permissions?: string[] } | null)?.permissions;
  const loyihachi = perm ? perm.includes('design.write') : ['loyihachi', 'boss', 'admin', 'superadmin'].includes(joriy?.rol ?? '');

  const yukla = useCallback(async () => {
    if (!kompaniyaId) return;
    const r = await chizmalarOl(kompaniyaId, obyektFiltr === '' ? null : obyektFiltr);
    if (!r.ok) { setXato(r.error); return; }
    setXato(''); setToplamlar(r.natija.toplamlar);
    const b = await chizmaTaasiriOl(kompaniyaId, obyektFiltr === '' ? null : obyektFiltr);
    if (b.ok) setBoglanishlar(b.natija.boglanishlar);
  }, [kompaniyaId, obyektFiltr]);
  useEffect(() => { void yukla(); }, [yukla]);
  useEffect(() => { if (kompaniyaId) void aloqalarOl(kompaniyaId).then((r) => { if (r.ok) setAloqalar(r.natija); }); }, [kompaniyaId]);

  const holatlar = useMemo(() => revizyaHolatlari(toplamlar ?? []), [toplamlar]);
  const obyektlar = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of toplamlar ?? []) m.set(x.obyekt_id, x.obyekt_nom ?? `#${x.obyekt_id}`);
    return [...m].map(([id, nom]) => ({ id, nom }));
  }, [toplamlar]);
  const korinadigan = useMemo(() => (toplamlar ?? []).filter((x) => {
    if (filtr === 'qoralama') return x.revizyalar.some((r) => r.holat === 'qoralama');
    if (filtr === 'kelgan') return !x.egasi && x.revizyalar.some((r) => r.taqdim_holat === 'yuborilgan');
    if (filtr === 'eskirgan') return boglanishlar.some((b) => b.toplam_id === x.id && b.joriy != null && b.ishlatilgan < b.joriy);
    if (filtr === 'taklif') return x.revizyalar.some((r) => r.taklif_yangi > 0);
    return true;
  }), [toplamlar, filtr, boglanishlar]);

  if (!kompaniyaId) return <KompaniyaKerak nima="Chizmalar" />;
  const FILTRLAR: Array<[string, string]> = [['', 'Hammasi'], ['qoralama', 'Qoralama'], ['kelgan', 'Yangi kelgan'], ['eskirgan', 'Eskirgan chizmaga tayangan'], ['taklif', 'Smeta takliflari']];
  return (
    <Sahifa sarlavha="Chizmalar" tavsif="Obyekt bo‘yicha chizmalar va revizyalar: loyihachi chiqaradi → pudratchi va texnadzor qabul qiladi → smeta va АОСР joriy revizyaga bog‘lanadi">
      <div className="space-y-3">
        {loyihachi && <Bolim sarlavha="Yangi chizma varag‘i"><YangiVaraq kompaniyaId={kompaniyaId} aloqalar={aloqalar} onTayyor={() => void yukla()} /></Bolim>}
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t('Obyekt')} className={inp} value={obyektFiltr} onChange={(e) => setObyektFiltr(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('Barcha obyektlar')}</option>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select>
          <div className="inline-flex flex-wrap overflow-hidden rounded border text-xs">{FILTRLAR.map(([k, nom]) => (
            <button key={k} type="button" onClick={() => setFiltr(k)} className={'px-3 py-1.5 ' + (filtr === k ? 'bg-accent/15 text-accent' : '')}>{t(nom)}</button>))}</div>
        </div>
        {xato && <div role="alert" className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
        {toplamlar == null && !xato && <p className="text-sm text-text-dim">{t('Yuklanmoqda…')}</p>}
        {toplamlar != null && korinadigan.length === 0 && <p className="text-sm text-text-dim">{t('Chizma yo‘q')}</p>}
        <div className="space-y-2">{korinadigan.map((x) => {
          const joriy2 = joriyRevizyasi(x.revizyalar);
          const ochiq = tanlangan === x.id;
          return (
            <Bolim key={x.id} sarlavha={`${x.marka}-${x.varaq} · ${x.bosqich}${x.nom ? ` · ${x.nom}` : ''}`}
              amal={<button type="button" className="text-xs text-accent underline" onClick={() => setTanlangan(ochiq ? null : x.id)}>{ochiq ? t('Yopish') : t('Ochish')}</button>}>
              <div className="text-xs text-text-dim">{x.obyekt_nom}{!x.egasi && x.egasi_nom ? ` · ${x.egasi_nom}` : ''} · {joriy2 ? `${t('Joriy')}: rev. ${joriy2.revizya}` : t('Hali chiqarilmagan')}</div>
              {ochiq && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-2">{x.revizyalar.map((r) => (
                    <RevizyaQator key={r.id} kompaniyaId={kompaniyaId} toplam={x} r={r} korinish={holatlar.get(r.id) ?? 'ruxsatsiz'} aloqalar={aloqalar} taklifOch={filtr === 'taklif'} yangila={() => void yukla()} />))}</ul>
                  {x.egasi && loyihachi && <YangiRevizya kompaniyaId={kompaniyaId} toplam={x} onTayyor={() => void yukla()} />}
                  {!x.egasi && <Boglanishlar kompaniyaId={kompaniyaId} toplam={x} boglanishlar={boglanishlar} yangila={() => void yukla()} />}
                </div>)}
            </Bolim>);
        })}</div>
      </div>
    </Sahifa>
  );
}
