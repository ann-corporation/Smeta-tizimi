import { memo, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Download, FileSpreadsheet, FolderOpen, Info, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  OFERTA_KATEGORIYALAR, fayldagiFoizlar, ofertaHisobla, ofertaResursKaliti,
  type OfertaFoiz, type OfertaFoizYon, type OfertaGuruh, type OfertaMalumKategoriya, type OfertaNarxRejimi,
  type OfertaNarxSozlamasi, type OfertaQatorNatija, type OfertaTransportSiyosati,
} from '../../lib/tender-oferta';
import { ofertaHolatMatni, ofertaMuammoMatni, tenderOfertaXlsx } from '../../lib/tender-oferta-export';
import { ofertaResursVaraqlariniAniqla, type OfertaSheetTahlili } from '../../lib/tender-oferta-parser';
import { bugunSana, hujjatFaylNomi } from '../../lib/hujjat-yozuvchi';
import { paketFaylHisobi, paketQatorlari, paketSvodXlsx, paketZip, type OfertaPaketFayl } from '../../lib/tender-oferta-paket';
import { NAKRUTKA_STANDART, type NakrutkaQadamlar } from '../../lib/nakrutka-kaskad';
import { NAKRUTKA_KOEF_IZOH, NAKRUTKA_KOEF_KODLAR, t2NakrutkaKoefOl, type NakrutkaKoefKod, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { t } from '../../i18n/til';
import { readXlsxFonda } from '../../lib/f2-import-parse/xlsxFonda';
import type { SheetGrid } from '../../lib/f2-import-parse/types';
import { ofertaLrvHujjati } from '../../lib/tender-oferta-lrv';

const MAX_FILE_BYTES = 80 * 1024 * 1024;
const SAHIFA = 200;
const NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const fmt = (value: number | null | undefined): string => (value == null ? '—' : NUMBER.format(value));

/** Foydalanuvchi kiritgan son: bo'sh — null (0 EMAS); manfiy yoki matn — null. */
function parseInput(value: string): number | null {
  const normalized = value.replace(/[\s ]/g, '').replace(',', '.');
  if (!normalized.trim()) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function roleText(role: OfertaSheetTahlili['role']): string {
  if (role === 'res') return 'RES';
  if (role === 'transport') return 'TRANSPORT XARAJATI';
  if (role === 'lrv') return 'LRV (ishlar) — oferta LRV (F2 shakli) shundan';
  return 'Noma’lum — tekshirish kerak';
}

const ROL_MATNI: Record<string, string> = {
  RESOURCE: 'Resurs', SECTION: 'Bo‘lim', SUBTOTAL: 'Oraliq jami', GRAND_TOTAL: 'Umumiy jami',
  TRANSPORT: 'Transport', STORAGE: 'Sklad', MARKUP: 'Ustama', INFO: 'Ma’lumot', UNKNOWN: 'Noma’lum',
};

const KASKAD_QADAMLARI: Array<[keyof NakrutkaQadamlar, string]> = [
  ['pryamye', 'To‘g‘ridan-to‘g‘ri xarajatlar'], ['tr_mat', 'Material transporti'], ['skl_mat', 'Material sklad xarajati'],
  ['tr_kab', 'Kabel transporti'], ['itogo1', 'Itogo 1'], ['prochie', 'Pudratchi boshqa xarajatlari'], ['itogo2', 'Itogo 2'],
  ['tr_ob', 'Uskuna transporti'], ['zag_ob', 'Uskuna zagotovka/sklad'], ['itogo3', 'Itogo 3'], ['strax', 'Sug‘urta'],
  ['risk', 'Risk'], ['itogo4', 'Itogo 4'], ['nds', 'QQS (NDS)'], ['vsego', 'JAMI (yakuniy)'],
];

type Koef = { qiymatlar: NakrutkaKoeffitsientlar; manba: 'kompaniya' | 'standart' | 'tahrirlangan' | 'fayl' };
/** `lrv` — fayldagi LRV varag'i (oferta LRV'si F2 shaklida shundan quriladi; egasi talabi 2026-10-08). */
type PaketFayl = OfertaPaketFayl & { bytes: Uint8Array; lrv?: { nom: string; rows: SheetGrid }; varaqRows: Record<string, SheetGrid> };

/** Sukut tanlov: RES/transport, alternativ ko'rinish va YASHIRIN (eski qoralama) emas. */
function sukutTanlov(t: OfertaSheetTahlili[]): string[] {
  const auto = t.filter((s) => (s.role === 'res' || s.role === 'transport') && !s.alternativVaraq && !s.yashirin && s.qatorlar.length > 0).map((s) => s.nom);
  return auto.length ? auto : t.filter((s) => s.role === 'unknown' && !s.yashirin && s.qatorlar.length > 0).map((s) => s.nom);
}

/** Son kiritish maydoni — har klavishda emas, chiqqanda/Enter bilan qo'llanadi
 * (27 ming qatorli paketda har tugmada qayta hisoblash sahifani qotiradi). */
const SonKiritish = memo(function SonKiritish({ qiymat, onQollash, placeholder, label, className }: {
  qiymat: string; onQollash: (v: string) => void; placeholder?: string; label: string; className?: string;
}) {
  const [v, setV] = useState(qiymat);
  useEffect(() => setV(qiymat), [qiymat]);
  const qolla = () => { if (v !== qiymat) onQollash(v); };
  return <input aria-label={label} inputMode="decimal" value={v} placeholder={placeholder}
    onChange={(e) => setV(e.target.value)} onBlur={qolla} onKeyDown={(e) => { if (e.key === 'Enter') qolla(); }}
    className={className ?? 'w-32 rounded border border-border bg-surface-2 px-1.5 py-1 text-right tabular-nums'} />;
});

function Sessiya() {
  const { joriy } = useKompaniya();
  const [fayllar, setFayllar] = useState<PaketFayl[]>([]);
  const [guruhNarx, setGuruhNarx] = useState<Record<string, string>>({});
  const [guruhKat, setGuruhKat] = useState<Record<string, OfertaMalumKategoriya>>({});
  const [qatorNarx, setQatorNarx] = useState<Record<string, string>>({});
  const [asosNarx, setAsosNarx] = useState<Record<string, number>>({});
  const [qatorHajm, setQatorHajm] = useState<Record<string, string>>({});
  const [qatorKat, setQatorKat] = useState<Record<string, OfertaMalumKategoriya>>({});
  const [rejim, setRejim] = useState<OfertaNarxRejimi>('foiz');
  const [yon, setYon] = useState<OfertaFoizYon>('pasaytirish');
  const [foiz, setFoiz] = useState('0');
  const [katFoizMatn, setKatFoizMatn] = useState<Partial<Record<OfertaMalumKategoriya, { yon: OfertaFoizYon; foiz: string }>>>({});
  const [sozlama, setSozlama] = useState<OfertaNarxSozlamasi>({ rejim: 'foiz', yon: 'pasaytirish', foiz: 0 });
  const [transport, setTransport] = useState<OfertaTransportSiyosati>('kaskad');
  const [koef, setKoef] = useState<Koef>({ qiymatlar: { ...NAKRUTKA_STANDART }, manba: 'standart' });
  const [korinish, setKorinish] = useState<'guruh' | 'batafsil'>('guruh');
  const [qidiruv, setQidiruv] = useState('');
  const [faqatMuammo, setFaqatMuammo] = useState(false);
  const [sahifa, setSahifa] = useState(1);
  const [zakazchik, setZakazchik] = useState('');
  const [pudratchi, setPudratchi] = useState('');
  const [paketNomi, setPaketNomi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Nakrutka koeffitsientlari: kompaniyaniki, bo'lmasa T1 standarti (SQL t2_nakrutka_default_v1).
  useEffect(() => {
    let active = true;
    if (!joriy?.id) return;
    void t2NakrutkaKoefOl(joriy.id).then((r) => {
      if (!active) return;
      const toliq = r.ok && NAKRUTKA_KOEF_KODLAR.every((k) => Number.isFinite(Number(r.koeffitsientlar[k])));
      setKoef(toliq ? { qiymatlar: r.koeffitsientlar, manba: 'kompaniya' } : { qiymatlar: { ...NAKRUTKA_STANDART }, manba: 'standart' });
    });
    return () => { active = false; };
  }, [joriy?.id]);

  const qatorlar = useMemo(() => paketQatorlari(fayllar), [fayllar]);
  const kalitlar = useMemo(() => new Map(qatorlar.map((q) => [q.sourceId, ofertaResursKaliti(q)])), [qatorlar]);

  /* Qo'lda kiritilganlar: qator darajasidagi (batafsil ko'rinish) guruhnikidan
     ustun; guruh narxi shu materialning BARCHA varaq/obyektdagi qatorlariga. */
  const kirishlar = useMemo(() => {
    const narx: Record<string, number | null> = {};
    const kat: Record<string, OfertaMalumKategoriya> = {};
    const hajm: Record<string, number | null> = {};
    for (const q of qatorlar) {
      const k = kalitlar.get(q.sourceId)!;
      const n = qatorNarx[q.sourceId] ?? guruhNarx[k];
      if (n != null) narx[q.sourceId] = parseInput(n);
      const kt = qatorKat[q.sourceId] ?? guruhKat[k];
      if (kt) kat[q.sourceId] = kt;
      if (qatorHajm[q.sourceId] != null) hajm[q.sourceId] = parseInput(qatorHajm[q.sourceId]);
    }
    return { narx, kat, hajm };
  }, [qatorlar, kalitlar, qatorNarx, guruhNarx, qatorKat, guruhKat, qatorHajm]);

  const hisob = useMemo(() => ofertaHisobla(qatorlar, {
    sozlama, manualNarxlar: kirishlar.narx, manualHajmlar: kirishlar.hajm, manualKategoriyalar: kirishlar.kat,
    nakrutka: koef.qiymatlar, transportSiyosati: transport, asosNarxTanlovi: asosNarx,
  }), [qatorlar, sozlama, kirishlar, koef.qiymatlar, transport, asosNarx]);
  /** P4.3: podvaldagi foizlar (barcha varaqlarda bir xil bo'lsa) — faqat taklif. */
  const fayldagi = useMemo(() => fayldagiFoizlar(qatorlar), [qatorlar]);
  const fayldagiQollanmagan = fayldagi.taklif.filter((f) => koef.qiymatlar[f.kod] !== f.foiz);

  const obyektHisoblari = useMemo(() => fayllar.map((f) => ({
    fayl: f, hisob: paketFaylHisobi(hisob, f, fayllar.length > 1, hisob.koeffitsientlar, transport),
  })), [fayllar, hisob, transport]);
  const paketJami = obyektHisoblari.every((o) => o.hisob.yakuniyOferta != null) && obyektHisoblari.length
    ? obyektHisoblari.reduce((a, o) => a + (o.hisob.yakuniyOferta ?? 0), 0) : null;

  const taklifKutmoqda = hisob.qatorlar.filter((q) => q.kategoriyaTaklifi && !kirishlar.kat[q.sourceId] && q.samaraliKategoriya === 'UNKNOWN');
  const filtr = qidiruv.trim().toUpperCase();
  const korGuruh = useMemo(() => hisob.guruhlar.filter((g) => (!faqatMuammo || g.muammolar.length > 0)
    && (!filtr || `${g.nom} ${g.varaqlar.join(' ')}`.toUpperCase().includes(filtr))), [hisob.guruhlar, faqatMuammo, filtr]);
  const korQator = useMemo(() => hisob.qatorlar.filter((q) => (!faqatMuammo || q.muammolar.length > 0)
    && (!filtr || `${q.nom} ${q.shifr ?? ''} ${q.sourceSheet}`.toUpperCase().includes(filtr))), [hisob.qatorlar, faqatMuammo, filtr]);
  const jamiKor = korinish === 'guruh' ? korGuruh.length : korQator.length;
  const sahifalar = Math.max(1, Math.ceil(jamiKor / SAHIFA));
  const joriySahifa = Math.min(sahifa, sahifalar);
  useEffect(() => setSahifa(1), [korinish, faqatMuammo, filtr]);

  async function fayllarniQosh(list: FileList | null) {
    if (!list?.length) return;
    setError(''); setMessage(''); setBusy(true);
    const yangi: PaketFayl[] = [];
    const xatolar: string[] = [];
    try {
      for (const file of Array.from(list)) {
        if (!/\.(xlsx|xlsm|xls)$/i.test(file.name) || file.name.startsWith('~$')) continue;
        if (file.size > MAX_FILE_BYTES) { xatolar.push(`${file.name}: 80 MB dan katta`); continue; }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const wb = await readXlsxFonda(bytes);
          const tahlillar = ofertaResursVaraqlariniAniqla(wb);
          const lrvVaraq = tahlillar.find((s) => s.role === 'lrv' && !s.yashirin);
          const lrvRows = lrvVaraq ? wb.sheet(lrvVaraq.nom)?.rows : undefined;
          const varaqRows = Object.fromEntries(wb.sheets.map((s) => [s.name, s.rows]));
          if (!tahlillar.some((s) => s.qatorlar.length > 0 || s.role === 'lrv')) { xatolar.push(`${file.name}: RES/LRV varag‘i yo‘q (faqat svod/hisobot) — oferta uchun kerak emas`); continue; }
          yangi.push({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nom: file.name.replace(/\.(xlsx|xlsm|xls)$/i, ''), faylNomi: file.name, bytes, tahlillar, tanlanganVaraqlar: sukutTanlov(tahlillar), ...(lrvVaraq && lrvRows ? { lrv: { nom: lrvVaraq.nom, rows: lrvRows } } : {}), varaqRows });
        } catch (e) { xatolar.push(`${file.name}: ${e instanceof Error ? e.message : 'o‘qilmadi'}`); }
      }
      if (yangi.length) setFayllar((old) => [...old, ...yangi]);
      if (xatolar.length) setError(xatolar.join(' · '));
      else if (!yangi.length) setError('Excel (XLSX/XLSM/XLS) RES fayli topilmadi.');
    } finally { setBusy(false); }
  }

  function faylniOchir(id: string) {
    setFayllar((old) => old.filter((f) => f.id !== id));
    const tozala = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${id}|`)));
    setQatorNarx(tozala); setQatorHajm(tozala); setQatorKat(tozala);
  }

  /** Rolni qo'lda o'zgartirish (yadro adashsa): RES/transport — oferta qatorlariga, LRV — oferta LRV (F2) manbasiga. */
  function rolniOzgartir(faylId: string, name: string, role: OfertaSheetTahlili['role']) {
    setFayllar((old) => old.map((f) => {
      if (f.id !== faylId) return f;
      const tahlillar = f.tahlillar.map((s) => (s.nom !== name ? s : { ...s, role, confidence: 'yuqori' as const, evidence: [`qo‘lda tanlandi: ${roleText(role)}`, ...s.evidence.filter((e) => !e.startsWith('qo‘lda tanlandi'))] }));
      const sheet = tahlillar.find((s) => s.nom === name);
      const tanlanadi = (role === 'res' || role === 'transport') && !!sheet?.qatorlar.length;
      const tanlangan = f.tanlanganVaraqlar.filter((x) => x !== name);
      let lrv = f.lrv;
      if (role === 'lrv') lrv = { nom: name, rows: f.varaqRows[name] ?? [] };
      else if (lrv?.nom === name) lrv = undefined;
      return { ...f, tahlillar, tanlanganVaraqlar: tanlanadi ? [...tanlangan, name] : tanlangan, lrv };
    }));
  }

  function varaqniTanlash(faylId: string, name: string, checked: boolean) {
    setFayllar((old) => old.map((f) => {
      if (f.id !== faylId) return f;
      const sheet = f.tahlillar.find((s) => s.nom === name);
      if (sheet?.role === 'lrv') return f;
      if (!checked) return { ...f, tanlanganVaraqlar: f.tanlanganVaraqlar.filter((s) => s !== name) };
      const alternativ = [...(sheet?.alternativVaraq ? [sheet.alternativVaraq] : []), ...f.tahlillar.filter((s) => s.alternativVaraq === name).map((s) => s.nom)];
      return { ...f, tanlanganVaraqlar: [...f.tanlanganVaraqlar.filter((s) => !alternativ.includes(s)), ...(f.tanlanganVaraqlar.includes(name) ? [] : [name])] };
    }));
  }

  const yoz = <T,>(set: (f: (o: Record<string, T>) => Record<string, T>) => void) => (key: string, value: T | '') =>
    set((old) => { const next = { ...old }; if (value === '' || value == null) delete next[key]; else next[key] = value as T; return next; });
  const guruhNarxYoz = yoz(setGuruhNarx);
  const guruhKatYoz = yoz(setGuruhKat);
  const qatorNarxYoz = yoz(setQatorNarx);
  const qatorHajmYoz = yoz(setQatorHajm);
  const qatorKatYoz = yoz(setQatorKat);

  /* БЕЗСКЛАД va boshqa kategoriya takliflari avtomatik qo'llanmaydi (dalil to'liq
     isbotlanmagan) — operator bitta tugma bilan barchasini tasdiqlaydi. */
  function takliflarniQabulQilish() {
    setGuruhKat((old) => {
      const next = { ...old };
      for (const q of taklifKutmoqda) next[kalitlar.get(q.sourceId)!] = q.kategoriyaTaklifi!;
      return next;
    });
  }

  function foizniQollash() {
    const value = parseInput(foiz);
    if (value == null) { setError('Foiz 0 yoki undan katta son bo‘lishi kerak.'); return; }
    const kategoriyaFoizlari: Partial<Record<OfertaMalumKategoriya, OfertaFoiz>> = {};
    for (const [kat, v] of Object.entries(katFoizMatn) as Array<[OfertaMalumKategoriya, { yon: OfertaFoizYon; foiz: string }]>) {
      if (!v.foiz.trim()) continue;
      const n = parseInput(v.foiz);
      if (n == null) { setError(`${kat} foizi noto‘g‘ri — 0 yoki undan katta son kiriting.`); return; }
      kategoriyaFoizlari[kat] = { yon: v.yon, foiz: n };
    }
    setError(''); setRejim('foiz'); setSozlama({ rejim: 'foiz', yon, foiz: value, kategoriyaFoizlari });
  }

  /* Qo'lda rejim: smeta narxlari boshlang'ich qiymat — bir material uchun bitta
     (guruhning eng ko'p uchragan smeta narxi), summa bo'yicha qatorlar alohida. */
  function smetaNarxiniBoshlangichQil() {
    const gNarx: Record<string, string> = {};
    const qNarx: Record<string, string> = {};
    for (const g of hisob.guruhlar) {
      if (g.kalit.startsWith('#')) {
        const q = hisob.qatorlar.find((x) => x.sourceId === g.sourceIds[0]);
        const v = q?.hisobTuri === 'manba_jami' ? q.smetaSumma : q?.smetaBirlikNarx;
        if (v != null) qNarx[g.sourceIds[0]] = String(v);
        continue;
      }
      const soni = new Map<number, number>();
      for (const id of g.sourceIds) { const v = hisob.qatorlar.find((x) => x.sourceId === id)?.smetaBirlikNarx; if (v != null) soni.set(v, (soni.get(v) ?? 0) + 1); }
      const eng = [...soni.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (eng) gNarx[g.kalit] = String(eng[0]);
    }
    setGuruhNarx(gNarx); setQatorNarx(qNarx); setSozlama({ rejim: 'qolda' }); setRejim('qolda');
  }

  function koefniOzgartir(kod: NakrutkaKoefKod, value: string) {
    const n = parseInput(value);
    if (n == null) return;
    setKoef((old) => ({ qiymatlar: { ...old.qiymatlar, [kod]: n }, manba: 'tahrirlangan' }));
  }

  async function eksportQilish() {
    setError(''); setMessage('');
    if (!qatorlar.length) { setError('Avval kamida bitta RES varag‘ini tanlang.'); return; }
    setBusy(true);
    try {
      const imzo = { zakazchik, pudratchi };
      const koeffitsientManbasi = koef.manba === 'kompaniya' ? 'kompaniya koeffitsientlari' : koef.manba === 'tahrirlangan' ? 'qo‘lda tahrirlangan' : koef.manba === 'fayl' ? 'fayldagi foizlar' : 'T1 standarti';
      const natijalar: Array<{ nom: string; bytes: Uint8Array; saqlanish: string }> = [];
      const lrvIzoh: string[] = [];
      for (const o of obyektHisoblari) {
        if (!o.fayl.tanlanganVaraqlar.length || !o.hisob.qatorlar.length) continue;
        const n = await tenderOfertaXlsx({
          obyektNomi: o.fayl.nom, manbaFaylNomi: o.fayl.faylNomi, manbaBytes: o.fayl.bytes,
          tanlanganVaraqlar: o.fayl.tanlanganVaraqlar, tahlillar: o.fayl.tahlillar, hisob: o.hisob, koeffitsientManbasi, imzo,
        });
        natijalar.push({ nom: n.faylNomi, bytes: n.bytes, saqlanish: n.saqlanish });
        // Oferta LRV — F2 shaklida (to'liq bo'lim ierarxiyasi, oferta narxlari, jonli formulalar, nakrutka jadvali).
        if (o.fayl.lrv) {
          const l = await ofertaLrvHujjati({ lrvVaraqNomi: o.fayl.lrv.nom, rows: o.fayl.lrv.rows, natijalar: o.hisob.qatorlar, obyektNomi: o.fayl.nom, nk: o.hisob.koeffitsientlar, imzo });
          if (l) {
            natijalar.push({ nom: l.faylNomi, bytes: l.bytes, saqlanish: 'toliq' });
            const farq = Math.round((l.togridanJami - o.hisob.togridanJami) * 100) / 100;
            lrvIzoh.push(`${o.fayl.nom}: LRV (F2) — ${l.narxlandi}/${l.resurslar} resurs narxlandi${l.topilmadi.length ? `, ${l.topilmadi.length} tasining narxi RES da topilmadi (ro‘yxat hujjatda)` : ''}; to‘g‘ridan-to‘g‘ri xarajat LRV ${fmt(l.togridanJami)} / RES ${fmt(o.hisob.togridanJami)}${farq ? ` (farq ${fmt(farq)} — manbadagi RES hajmlari yaxlitlangan)` : ' — mos'}${l.bezSkladBor ? '; БЕЗСКЛАД resurs bor — nakrutka jadvali LRV da berilmadi, yakuniy summa oferta svodida' : ''}.`);
          }
        }
      }
      if (!natijalar.length) { setError('Eksport uchun tanlangan varaq yo‘q.'); return; }
      const qisman = natijalar.some((n) => n.saqlanish !== 'toliq') ? ' .xls fayllar .xlsx ga o‘girildi — ba’zi format qisman o‘zgargan bo‘lishi mumkin.' : '';
      if (natijalar.length === 1 && fayllar.length === 1) {
        downloadBlob(natijalar[0].bytes, natijalar[0].nom);
        setMessage(`Oferta tayyor: ${natijalar[0].nom}.${qisman}${hisob.halQilinmagan ? ` ${hisob.halQilinmagan} ta resurs narxsiz/kategoriyasiz — yakuniyga kirmadi (ro‘yxat hujjatda).` : ''}`);
      } else {
        const svod = paketSvodXlsx(obyektHisoblari.map((o) => ({ nom: o.fayl.nom, faylNomi: o.fayl.faylNomi, hisob: o.hisob })), imzo,
          paketNomi.trim() ? `СВОДНЫЙ РАСЧЕТ ОФЕРТЫ — ${paketNomi.trim()}` : undefined);
        const nom = paketNomi.trim() || 'ПАКЕТ';
        const svodNomi = hujjatFaylNomi({ obyekt: nom, hujjat: 'СВОД_ОФЕРТЫ', davr: bugunSana() });
        const zipNomi = hujjatFaylNomi({ obyekt: nom, hujjat: 'ОФЕРТА', davr: bugunSana(), kengaytma: 'zip' });
        downloadBlob(paketZip([...natijalar, { nom: svodNomi, bytes: svod }]), zipNomi, 'application/zip');
        setMessage(`Paket tayyor: ${natijalar.length} ta hujjat + svod (${zipNomi}).${qisman}${lrvIzoh.length ? ' ' + lrvIzoh.join(' ') : ''}`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Oferta fayli yaratilmadi.'); }
    finally { setBusy(false); }
  }

  const tahrirlanadi = (q: OfertaQatorNatija) => q.rol === 'RESOURCE' || (q.rol === 'TRANSPORT' && !q.hosila);
  const bosh = (joriySahifa - 1) * SAHIFA;
  const guruhSmetaNarx = (g: OfertaGuruh) => (g.smetaNarxlar.length > 1 ? `${fmt(g.smetaNarxlar[0])} … ${fmt(g.smetaNarxlar[g.smetaNarxlar.length - 1])}` : fmt(g.smetaNarxlar[0]));
  const holatRangi = (m: readonly string[]) => (m.some((x) => x !== 'SMETA_NARXI_NOL' && x !== 'NARX_HAR_XIL') ? 'font-semibold text-danger' : m.length ? 'text-warn' : 'text-ok');

  return <div className="space-y-3">
    <div className="karta grid gap-3 p-3 lg:grid-cols-[1.2fr_1fr_1fr]">
      <div className="space-y-2">
        <div className="text-[12px] font-medium text-text">RES fayllari — bitta obyekt yoki tender paketi (bir nechta obyekt)</div>
        <div className="flex flex-wrap gap-2">
          <label className="tugma tugma-asosiy h-9 cursor-pointer"><Plus size={14} /> Fayl(lar) qo‘shish
            <input aria-label="Oferta RES fayllari" type="file" multiple accept=".xlsx,.xlsm,.xls" disabled={busy} className="hidden"
              onChange={(e) => { void fayllarniQosh(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="tugma h-9 cursor-pointer"><FolderOpen size={14} /> Papka qo‘shish
            <input aria-label="Oferta RES papkasi" type="file" multiple disabled={busy} className="hidden"
              {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
              onChange={(e) => { void fayllarniQosh(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {fayllar.length > 1 && <label className="block text-[12px] font-medium text-text">Paket nomi
          <input aria-label="Paket nomi" value={paketNomi} onChange={(e) => setPaketNomi(e.target.value)} className="input mt-1 block h-8 w-full px-2 text-[12px]" placeholder="masalan: Navoiy bog‘ — 1-lot" />
        </label>}
      </div>
      <div className="grid gap-2">
        <label className="block text-[12px] font-medium text-text">Buyurtmachi (ЗАКАЗЧИК) — imzo uchun
          <input aria-label="Buyurtmachi nomi" value={zakazchik} onChange={(e) => setZakazchik(e.target.value)} className="input mt-1 block h-8 w-full px-2 text-[12px]" placeholder="tashkilot, lavozim, F.I.O." />
        </label>
        <label className="block text-[12px] font-medium text-text">Pudratchi (ПОДРЯДЧИК) — imzo uchun
          <input aria-label="Pudratchi nomi" value={pudratchi} onChange={(e) => setPudratchi(e.target.value)} className="input mt-1 block h-8 w-full px-2 text-[12px]" placeholder="tashkilot, lavozim, F.I.O." />
        </label>
      </div>
      <div className="rounded-lg border border-border/70 bg-surface-2 p-2 text-[11px] text-text-dim">
        <div className="flex items-center gap-1.5 font-semibold text-text"><Info size={14} /> Ishlash qoidasi</div>
        <p className="mt-1">Asl fayl saqlanadi: tanlangan varaqlarda asl jadval davomida КОЛ-ВО / ЦЕНА / СУММА (оферта), podval foizlari manbadagidek, oxirida imzo. Bir xil material barcha varaq va obyektlarda bitta narx oladi. Yashirin (eski) varaqlar sukut bo‘yicha tanlanmaydi.</p>
      </div>
    </div>

    {busy && <p role="status" className="text-[13px] text-text-dim">Ishlanmoqda…</p>}
    {error && <p role="alert" className="karta border-danger/40 bg-danger/5 p-3 text-[13px] text-danger">{error}</p>}
    {message && <p role="status" className="karta border-ok/40 bg-ok/5 p-3 text-[13px] text-success">{message}</p>}

    {fayllar.map((f) => <details key={f.id} className="karta p-3" open={fayllar.length === 1}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-text">{f.faylNomi}</span>
        <span className="flex items-center gap-2">
          <span className="rounded bg-surface-2 px-2 py-1 text-[11px] text-text-dim">{f.tanlanganVaraqlar.length} ta varaq tanlangan</span>
          <button type="button" className="tugma h-7 px-2 text-[11px]" onClick={(e) => { e.preventDefault(); faylniOchir(f.id); }} aria-label={`${f.faylNomi} faylini olib tashlash`}><Trash2 size={12} /></button>
        </span>
      </summary>
      {fayllar.length > 1 && <label className="mt-2 block text-[12px] font-medium text-text">Obyekt nomi
        <input aria-label={`${f.faylNomi} obyekt nomi`} value={f.nom} onChange={(e) => { const v = e.target.value; setFayllar((old) => old.map((x) => (x.id === f.id ? { ...x, nom: v } : x))); }} className="input mt-1 block h-8 w-full max-w-md px-2 text-[12px]" />
      </label>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[900px] text-[11px]">
          <thead><tr className="border-b border-border text-left text-text-mute"><th className="py-2">Qo‘shish</th><th>Varaq</th><th>Rol</th><th>Format</th><th>Ishonch</th><th>Topilmalar</th><th>Qator</th></tr></thead>
          <tbody>{f.tahlillar.map((sheet) => <tr key={sheet.nom} className={`border-b border-border/50 align-top ${sheet.yashirin ? 'opacity-60' : ''}`}>
            <td className="py-2">{sheet.role === 'lrv' ? <span className="text-text-mute">—</span> : <input aria-label={`${sheet.nom} varag‘ini tanlash`} type="checkbox" checked={f.tanlanganVaraqlar.includes(sheet.nom)} onChange={(e) => varaqniTanlash(f.id, sheet.nom, e.target.checked)} />}</td>
            <td className="py-2 font-medium text-text">{sheet.nom}{sheet.yashirin && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-text-mute">yashirin</span>}</td>
            <td className="py-2">
              <select aria-label={`${sheet.nom} varag‘i roli`} value={sheet.role} onChange={(e) => rolniOzgartir(f.id, sheet.nom, e.target.value as OfertaSheetTahlili['role'])}
                className={`input h-8 px-1 text-[12px] ${sheet.role === 'res' ? 'font-semibold text-ok' : sheet.role === 'lrv' ? 'font-semibold text-accent' : 'text-warn'}`}>
                <option value="res">{t('RES (resurslar)')}</option>
                <option value="lrv">{t('LRV (ishlar)')}</option>
                <option value="transport">{t('Transport')}</option>
                <option value="unknown">{t('E’tiborsiz / svod')}</option>
              </select>
            </td>
            <td className="py-2 text-text-dim">{sheet.format.toUpperCase()}</td>
            <td className="py-2 text-text-dim">{sheet.confidence}</td>
            <td className="max-w-[460px] py-2 text-text-dim">{sheet.evidence.join(' · ')}{sheet.alternativVaraq && <span className="ml-1 font-semibold text-warn">(alternativ: {sheet.alternativVaraq})</span>}</td>
            <td className="py-2 text-right tabular-nums text-text-dim">{sheet.qatorlar.length}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>)}

    {qatorlar.length > 0 && <>
      <section className="karta space-y-3 p-3" aria-label="Narx sozlamasi">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[12px] font-medium text-text">Narx berish usuli
            <select aria-label="Oferta narx usuli" value={rejim} onChange={(e) => { const r = e.target.value as OfertaNarxRejimi; setRejim(r); if (r === 'qolda') setSozlama({ rejim: 'qolda' }); }} className="input mt-1 block h-9 px-2 text-[12px]">
              <option value="foiz">Smeta narxidan foiz bilan</option>
              <option value="qolda">Har material bo‘yicha qo‘lda</option>
            </select>
          </label>
          {rejim === 'foiz' && <>
            <label className="block text-[12px] font-medium text-text">Umumiy amal
              <select aria-label="Oferta foiz amali" value={yon} onChange={(e) => setYon(e.target.value as OfertaFoizYon)} className="input mt-1 block h-9 px-2 text-[12px]"><option value="pasaytirish">Pasaytirish</option><option value="oshirish">Oshirish</option></select>
            </label>
            <label className="block text-[12px] font-medium text-text">Umumiy foiz
              <input aria-label="Oferta foiz miqdori" inputMode="decimal" value={foiz} onChange={(e) => setFoiz(e.target.value)} className="input mt-1 h-9 w-20 px-2 text-[12px]" />
            </label>
          </>}
          {rejim === 'qolda' && <button type="button" className="tugma h-9" onClick={smetaNarxiniBoshlangichQil}>Smeta narxlarini boshlang‘ich qilish</button>}
          <label className="block text-[12px] font-medium text-text">Transport
            <select aria-label="Transport siyosati" value={transport} onChange={(e) => setTransport(e.target.value as OfertaTransportSiyosati)} className="input mt-1 block h-9 px-2 text-[12px]">
              <option value="kaskad">Kaskad foizi (ТРАНСПОРТ_МАТЕРИАЛ)</option>
              <option value="varaq">Transport varag‘i summasi</option>
            </select>
          </label>
        </div>
        {rejim === 'foiz' && <div className="flex flex-wrap items-end gap-2">
          <span className="text-[11px] text-text-mute">Kategoriya foizi (bo‘sh — umumiy foiz; qo‘lda narx ustun):</span>
          {OFERTA_KATEGORIYALAR.map((kat) => {
            const v = katFoizMatn[kat] ?? { yon, foiz: '' };
            return <label key={kat} className="flex items-center gap-1 text-[11px] text-text">
              <span className="w-16 font-semibold">{kat}</span>
              <select aria-label={`${kat} foiz amali`} value={v.yon} onChange={(e) => setKatFoizMatn((o) => ({ ...o, [kat]: { ...v, yon: e.target.value as OfertaFoizYon } }))} className="input h-8 px-1 text-[11px]"><option value="pasaytirish">−</option><option value="oshirish">+</option></select>
              <input aria-label={`${kat} foizi`} inputMode="decimal" value={v.foiz} onChange={(e) => setKatFoizMatn((o) => ({ ...o, [kat]: { ...v, foiz: e.target.value } }))} placeholder="%" className="input h-8 w-14 px-1 text-[11px]" />
            </label>;
          })}
          <button type="button" className="tugma tugma-asosiy h-9" onClick={foizniQollash}><RefreshCw size={14} /> Foizlarni qo‘llash</button>
        </div>}
        {(fayldagiQollanmagan.length > 0 || fayldagi.ziddiyat.length > 0) && <div role="status" className="rounded-lg border border-accent/40 bg-accent/5 p-2 text-[11px] text-text">
          {fayldagiQollanmagan.length > 0 && <div className="flex flex-wrap items-center gap-2">
            <span><b>Fayldagi foizlar:</b> {fayldagiQollanmagan.map((f) => `${NAKRUTKA_KOEF_IZOH[f.kod]} ${f.foiz}% (${f.varaqlar.join(', ')})`).join('; ')}</span>
            <button type="button" className="tugma h-7 px-2 text-[11px]" onClick={() => setKoef((old) => ({ qiymatlar: { ...old.qiymatlar, ...Object.fromEntries(fayldagiQollanmagan.map((f) => [f.kod, f.foiz])) }, manba: 'fayl' }))}>Qo‘llash</button>
            <span className="text-text-dim">avtomatik qo‘llanmaydi — tekshirib qo‘llang</span>
          </div>}
          {fayldagi.ziddiyat.map((z) => <p key={z.kod} className="mt-1 text-warn">{NAKRUTKA_KOEF_IZOH[z.kod]}: varaqlarda har xil — {z.qiymatlar.map((x) => `${x.varaq}: ${x.foiz}%`).join(', ')} (taklif qilinmaydi, qo‘lda kiriting)</p>)}
        </div>}
        <details className="rounded-lg border border-border/70 p-2 text-[11px]">
          <summary className="cursor-pointer font-medium text-text">Nakrutka koeffitsientlari — {koef.manba === 'kompaniya' ? 'kompaniyaniki' : koef.manba === 'tahrirlangan' ? 'qo‘lda tahrirlangan' : koef.manba === 'fayl' ? 'fayldagi foizlar' : 'T1 standarti'}</summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {NAKRUTKA_KOEF_KODLAR.map((kod) => <label key={kod} className="flex items-center justify-between gap-2 text-text-dim" title={NAKRUTKA_KOEF_IZOH[kod]}>
              <span className="truncate">{NAKRUTKA_KOEF_IZOH[kod]}</span>
              <input aria-label={`${kod} koeffitsienti`} inputMode="decimal" defaultValue={String(koef.qiymatlar[kod] ?? '')} key={`${kod}-${koef.manba}-${koef.qiymatlar[kod]}`}
                onBlur={(e) => koefniOzgartir(kod, e.target.value)} className="input h-7 w-20 px-1 text-right" />
            </label>)}
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="tugma tugma-asosiy h-9" onClick={() => void eksportQilish()} disabled={busy}><Download size={14} /> {fayllar.length > 1 ? `Paketni oferta qilish (${fayllar.length} obyekt, ZIP)` : 'Asl RES faylini oferta qilish'}</button>
          {taklifKutmoqda.length > 0 && <button type="button" className="tugma h-9" onClick={takliflarniQabulQilish}><CheckCheck size={14} /> {taklifKutmoqda.length} ta kategoriya taklifini qabul qilish ({[...new Set(taklifKutmoqda.map((q) => q.kategoriyaTaklifi))].join(', ')})</button>}
        </div>
      </section>

      <section className="karta grid gap-3 p-3 lg:grid-cols-[1fr_1.4fr]" aria-label="Oferta jamilari">
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-2"><span className="text-[10px] text-text-mute">Smeta bo‘yicha resurslar</span><strong className="mt-1 block text-base text-text">{fmt(hisob.manbaTogridanJami)}</strong></div>
            <div className="rounded-lg border border-border p-2"><span className="text-[10px] text-text-mute">Pudratchi resurslari</span><strong className="mt-1 block text-base text-text">{fmt(hisob.togridanJami)}</strong></div>
            <div className="rounded-lg border border-border p-2"><span className="text-[10px] text-text-mute">Noyob material / qator</span><strong className="mt-1 block text-base text-text">{fmt(hisob.guruhlar.length)} / {fmt(hisob.qatorlar.filter(tahrirlanadi).length)}</strong></div>
            <div className={`rounded-lg border p-2 ${paketJami != null ? 'border-ok/40 bg-ok/5' : 'border-warn/40 bg-warn/5'}`}>
              <span className="text-[10px] text-text-mute">Yakuniy oferta (QQS bilan){fayllar.length > 1 ? ' — paket' : ''}</span>
              <strong className="mt-1 block text-base text-ok">{paketJami != null ? fmt(paketJami) : `hal qilinmagan: ${hisob.halQilinmagan} ta`}</strong>
            </div>
          </div>
          {fayllar.length > 1 && <table className="w-full text-[11px]">
            <thead><tr className="text-left text-text-mute"><th>Obyekt</th><th className="text-right">Smeta (QQS bilan)</th><th className="text-right">Oferta (QQS bilan)</th></tr></thead>
            <tbody>{obyektHisoblari.map((o) => <tr key={o.fayl.id} className="border-t border-border/40">
              <td className="py-0.5">{o.fayl.nom}</td>
              <td className="text-right tabular-nums">{fmt(o.hisob.manbaKaskad.vsego)}</td>
              <td className={`text-right tabular-nums ${o.hisob.yakuniyOferta == null ? 'text-warn' : ''}`}>{o.hisob.yakuniyOferta != null ? fmt(o.hisob.yakuniyOferta) : `${o.hisob.halQilinmagan} ta hal qilinmagan`}</td>
            </tr>)}</tbody>
          </table>}
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-text-mute"><th>Kategoriya</th><th className="text-right">Manba</th><th className="text-right">Taklif</th></tr></thead>
            <tbody>{[...OFERTA_KATEGORIYALAR, 'UNKNOWN' as const].map((kat) => <tr key={kat} className={`border-t border-border/40 ${kat === 'UNKNOWN' && hisob.kategoriyaJami.UNKNOWN ? 'text-danger' : ''}`}>
              <td className="py-0.5">{kat === 'UNKNOWN' ? 'Noma’lum (kaskadga kirmaydi)' : kat}</td>
              <td className="text-right tabular-nums">{fmt(hisob.manbaKategoriyaJami[kat])}</td>
              <td className="text-right tabular-nums">{fmt(hisob.kategoriyaJami[kat])}</td>
            </tr>)}</tbody>
          </table>
          {hisob.transportVaraqJami > 0 && <p className="text-[11px] text-text-dim">Transport varag‘i (pudratchi): {fmt(hisob.transportVaraqJami)} — {transport === 'varaq' ? 'material transporti o‘rnida ishlatiladi' : 'faqat dalil (kaskad foizi ishlatiladi)'}.</p>}
        </div>
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-text-mute"><th>Kaskad qadami{fayllar.length > 1 ? ' (paket bo‘yicha)' : ''}</th><th className="text-right">Manba asosida</th><th className="text-right">Taklif</th></tr></thead>
          <tbody>{KASKAD_QADAMLARI.map(([k, nom]) => <tr key={k} className={`border-t border-border/40 ${k.startsWith('itogo') || k === 'vsego' ? 'font-semibold text-text' : 'text-text-dim'}`}>
            <td className="py-0.5">{nom}</td>
            <td className="text-right tabular-nums">{fmt(hisob.manbaKaskad[k])}</td>
            <td className="text-right tabular-nums">{fmt(hisob.kaskad[k])}</td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className="karta p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-text"><FileSpreadsheet className="mr-1 inline" size={15} />
            {korinish === 'guruh' ? 'Materiallar (har biri bir marta)' : 'Varaqlar bo‘yicha batafsil'}
            <span className="font-normal text-text-mute"> ({fmt(jamiKor)}; muammo: {hisob.muammolarSoni})</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded border border-border text-[12px]">
              <button type="button" className={`px-2 py-1 ${korinish === 'guruh' ? 'bg-surface-2 font-semibold text-text' : 'text-text-dim'}`} onClick={() => setKorinish('guruh')}>Materiallar</button>
              <button type="button" className={`px-2 py-1 ${korinish === 'batafsil' ? 'bg-surface-2 font-semibold text-text' : 'text-text-dim'}`} onClick={() => setKorinish('batafsil')}>Batafsil</button>
            </div>
            <label className="flex items-center gap-1 text-[12px] text-text"><input type="checkbox" checked={faqatMuammo} onChange={(e) => setFaqatMuammo(e.target.checked)} /> Faqat muammolar</label>
            <input aria-label="Oferta qatorlarini qidirish" value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder="Resurs yoki varaq…" className="input h-8 w-56 px-2 text-[12px]" />
          </div>
        </div>
        <div className="max-h-[58vh] overflow-auto rounded border border-border/60">
          {korinish === 'guruh' ? <table className="w-full min-w-[1200px] text-[11px]">
            <thead className="sticky top-0 z-10 bg-surface-2 text-left text-text-mute"><tr>
              <th className="px-2 py-2">Kategoriya</th><th className="px-2">Nomi</th><th className="px-2">Birlik</th><th className="px-2 text-right">Uchraydi</th>
              <th className="px-2 text-right">Jami hajm</th><th className="px-2 text-right">Smeta narx</th><th className="px-2 text-right">Pudratchi narxi</th>
              <th className="px-2 text-right">Taklif summa</th><th className="px-2">Holat</th>
            </tr></thead>
            <tbody>{korGuruh.slice(bosh, bosh + SAHIFA).map((g) => {
              const yakka = g.kalit.startsWith('#');
              const kat = g.kategoriyalar.length === 1 ? g.kategoriyalar[0] : null;
              return <tr key={g.kalit} className="border-t border-border/50 align-top">
                <td className="px-2 py-1">{g.hisobTuri === 'yoq' ? '—' : <select aria-label={`${g.nom} kategoriyasi`} value={guruhKat[g.kalit] ?? ''} onChange={(e) => guruhKatYoz(g.kalit, e.target.value as OfertaMalumKategoriya | '')}
                  className={`rounded border px-1 py-0.5 ${g.kategoriyalar.includes('UNKNOWN') && !guruhKat[g.kalit] ? 'border-danger/60 text-danger' : 'border-border'}`}>
                  <option value="">{kat && kat !== 'UNKNOWN' ? `${kat} (fayldan)` : g.kategoriyaTaklifi ? `? taklif: ${g.kategoriyaTaklifi}` : g.kategoriyalar.length > 1 ? g.kategoriyalar.join(' / ') : 'Noma’lum'}</option>
                  {OFERTA_KATEGORIYALAR.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>}</td>
                <td className="max-w-[380px] px-2 py-1.5 font-medium text-text" title={g.varaqlar.join('\n')}>{g.nom}
                  {g.smetaNarxlar.length > 1 && <details className="mt-1 font-normal text-text-dim">
                    <summary className="cursor-pointer text-warn">Smeta narxi har xil: {g.smetaNarxlar.length} xil — qaysi varaqda qaysi narx</summary>
                    <ul className="mt-1 space-y-0.5">{g.smetaNarxlar.map((narx) => {
                      const joylar = hisob.qatorlar.filter((q) => g.sourceIds.includes(q.sourceId) && q.smetaBirlikNarx === narx);
                      const asosiy = asosNarx[g.kalit] === narx;
                      return <li key={narx} className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">{fmt(narx)}</span>
                        <span>— {joylar.map((q) => `${q.sourceSheet} (${q.sourceRow}-qator)`).join(', ')}</span>
                        {asosiy ? <span className="text-ok">asosiy (tanlangan)</span>
                          : <button type="button" className="tugma h-6 px-1.5 text-[10px]" onClick={() => setAsosNarx((o) => ({ ...o, [g.kalit]: narx }))}>Shu narxni asosiy qilish</button>}
                      </li>;
                    })}</ul>
                  </details>}
                </td>
                <td className="px-2 py-1.5 text-text-dim">{g.birlik ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-text-dim" title={g.varaqlar.join('\n')}>{g.sourceIds.length} joy / {g.varaqlar.length} varaq</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-text-dim">{fmt(g.jamiHajm)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${g.smetaNarxlar.length > 1 ? 'text-warn' : 'text-text-dim'}`}>{guruhSmetaNarx(g)}</td>
                <td className="bg-surface-2 px-2 py-1">{yakka
                  ? <SonKiritish label={`${g.nom} pudratchi ${g.hisobTuri === 'manba_jami' ? 'summasi' : 'narxi'}`} qiymat={qatorNarx[g.sourceIds[0]] ?? ''} onQollash={(v) => qatorNarxYoz(g.sourceIds[0], v)}
                      placeholder={g.hisobTuri === 'manba_jami' ? 'Taklif summasi' : fmt(g.pudratchiNarxlar[0])} />
                  : <SonKiritish label={`${g.nom} pudratchi narxi`} qiymat={guruhNarx[g.kalit] ?? ''} onQollash={(v) => guruhNarxYoz(g.kalit, v)}
                      placeholder={g.pudratchiNarxlar.length === 1 ? fmt(g.pudratchiNarxlar[0]) : g.pudratchiNarxlar.length ? 'har xil' : '—'} />}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ok">{fmt(g.jamiTaklifSumma)}</td>
                <td className={`px-2 py-1.5 ${holatRangi(g.muammolar)}`}>{g.muammolar.length ? g.muammolar.map(ofertaMuammoMatni).join('; ') : 'TAYYOR'}</td>
              </tr>;
            })}</tbody>
          </table> : <table className="w-full min-w-[1400px] text-[11px]">
            <thead className="sticky top-0 z-10 bg-surface-2 text-left text-text-mute"><tr>
              <th className="px-2 py-2">Varaq</th><th className="px-2">№</th><th className="px-2">Rol</th><th className="px-2">Kategoriya</th><th className="px-2">Nomi</th><th className="px-2">Birlik</th>
              <th className="px-2 text-right">Manba hajm</th><th className="px-2 text-right">Taklif hajmi</th><th className="px-2 text-right">Smeta narx</th><th className="px-2 text-right">Smeta summa</th>
              <th className="px-2 text-right">Pudratchi narx/summa</th><th className="px-2 text-right">Taklif summa</th><th className="px-2">Holat</th>
            </tr></thead>
            <tbody>{korQator.slice(bosh, bosh + SAHIFA).map((q) => <tr key={q.sourceId} className={`border-t border-border/50 align-top ${q.rol === 'SUBTOTAL' || q.rol === 'GRAND_TOTAL' ? 'font-semibold' : ''}`}>
              <td className="px-2 py-1.5 text-text-dim">{q.sourceSheet}</td>
              <td className="px-2 py-1.5 text-text-dim">{q.tartibRaqami ?? '—'}</td>
              <td className="px-2 py-1.5 text-text-dim">{ROL_MATNI[q.rol] ?? q.rol}{q.hosila ? ' (podval)' : ''}</td>
              <td className="px-2 py-1">{q.rol === 'RESOURCE'
                ? <select aria-label={`${q.nom} kategoriyasi`} value={qatorKat[q.sourceId] ?? ''} onChange={(e) => qatorKatYoz(q.sourceId, e.target.value as OfertaMalumKategoriya | '')}
                    className={`rounded border px-1 py-0.5 ${q.samaraliKategoriya === 'UNKNOWN' ? 'border-danger/60 text-danger' : 'border-border'}`}>
                    <option value="">{q.samaraliKategoriya && q.samaraliKategoriya !== 'UNKNOWN' ? `${q.samaraliKategoriya}` : q.kategoriyaTaklifi ? `? taklif: ${q.kategoriyaTaklifi}` : 'Noma’lum'}</option>
                    {OFERTA_KATEGORIYALAR.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                : <span className="text-text-mute">—</span>}</td>
              <td className="max-w-[320px] px-2 py-1.5 font-medium text-text" title={`${q.sourceSheet} / ${q.sourceRow}-qator`}>{q.nom}</td>
              <td className="px-2 py-1.5 text-text-dim">{q.birlik ?? '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-text-dim">{fmt(q.hajm)}</td>
              <td className="px-2 py-1">{tahrirlanadi(q) && q.hisobTuri === 'birlik'
                ? <SonKiritish label={`${q.nom} taklif hajmi`} qiymat={qatorHajm[q.sourceId] ?? ''} onQollash={(v) => qatorHajmYoz(q.sourceId, v)} placeholder={fmt(q.hajm)}
                    className={`w-24 rounded border px-1.5 py-1 text-right tabular-nums ${q.hajm == null && !qatorHajm[q.sourceId] ? 'border-warn/60' : 'border-border'}`} />
                : <span className="block text-right text-text-mute">—</span>}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-text-dim">{fmt(q.smetaBirlikNarx)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-text-dim">{fmt(q.smetaSumma)}</td>
              <td className="bg-surface-2 px-2 py-1">{tahrirlanadi(q)
                ? <SonKiritish label={`${q.nom} pudratchi ${q.hisobTuri === 'manba_jami' ? 'summasi' : 'narxi'} (faqat shu qator)`} qiymat={qatorNarx[q.sourceId] ?? ''} onQollash={(v) => qatorNarxYoz(q.sourceId, v)}
                    placeholder={q.hisobTuri === 'manba_jami' ? 'Taklif summasi' : fmt(q.pudratchiBirlikNarx)} />
                : '—'}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ok">{fmt(q.pudratchiSumma)}</td>
              <td className={`px-2 py-1.5 ${holatRangi(q.muammolar)}`}>{ofertaHolatMatni(q)}</td>
            </tr>)}</tbody>
          </table>}
        </div>
        {!jamiKor && <p className="py-6 text-center text-[12px] text-text-mute">{faqatMuammo ? 'Muammoli qator yo‘q.' : 'Qidiruv bo‘yicha topilmadi.'}</p>}
        {sahifalar > 1 && <div className="mt-2 flex items-center justify-end gap-2 text-[12px] text-text-dim">
          <button type="button" className="tugma h-7 px-2" disabled={joriySahifa <= 1} onClick={() => setSahifa(joriySahifa - 1)}>‹</button>
          <span>{joriySahifa} / {sahifalar}</span>
          <button type="button" className="tugma h-7 px-2" disabled={joriySahifa >= sahifalar} onClick={() => setSahifa(joriySahifa + 1)}>›</button>
        </div>}
      </section>
    </>}
  </div>;
}

export default function OfertaNative() {
  return <Sahifa sarlavha="Tender oferta" tavsif="RES fayli yoki tender paketidan pudratchi taklifi: materiallar bir marta narxlanadi, asl fayl shaklida XLSX, imzo va paket svodi">
    <Sessiya />
  </Sahifa>;
}
