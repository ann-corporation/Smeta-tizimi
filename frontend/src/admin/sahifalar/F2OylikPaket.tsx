/**
 * OYLIK F2 PAKETI (egasi 2026-10-25, 2026-11-05): tanlangan oy (yoki oylar ORALIG'I / barcha oylar) F2 lari obyektlar bo'yicha,
 * jami, tekshiruvlar (bloklamaydi) va bitta ZIP. F2 reestri sahifasining bo'limi (yangi menyu yo'q).
 *
 * Pul va Ф-2 — F2 portfeli va F2 tarixi bilan AYNAN bir yo'l (`lib/f2-akt-eksport`): aktning O'Z podvali (`t2_akt_podval`, storno
 * bloklari o'z podvali bilan), yo'q bo'lsa obyekt smeta podvali. Summa: QQS bilan asosiy, ustamali (ИТОГО-4) va ustamasiz yonida;
 * noma'lum summa «noma'lum» (0 emas).
 * Jonli: ko'rinish har doim joriy aktlardan; topshirilgan (muzlatilgan) paketdan keyin manba o'zgargan bo'lsa — «Paket eskirgan» va
 * bir bosishda «Qayta yig'ish» (yangi versiya; eskisi arxivda qoladi).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, Upload } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import { portfelObyektOl, f3SvodOl, type PortfelObyektMalumot } from '../../api/f2-oylik-paket';
import { tokenBilan, mazmunXeshi } from '../../api/t2-token';
import { f2HujjatKaliti } from '../../api/f2-hujjat-kontekst';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { Forma3ShaklTanlagich } from '../../components/forma3/Forma3ShaklTanlagich';
import { f3PaketTanlovOl, f3PaketTanlovSaqla, forma3SotuvFayllari, type PaketF3Tanlov } from '../../lib/forma3-shakl-tanlov';
import { hujjatFaylNomi } from '../../lib/hujjat-yozuvchi';
import { mundarijaXlsx, oylikReestrXlsx, paketTarkibiMatni, paketZip, tarkibBaytlari, TARKIB_FAYL_NOMI } from '../../lib/f2-oylik-paket/eksport';
import { NDS_SUKUT_FOIZ, davrMatni, sverkaXlsx } from '../../lib/nakopitelniy-vedomost-export';
import { obyektHujjatlariniYigish, type ObyektHujjatlariNatija } from '../../lib/oylik-hujjat/paket';
import { paketImzosiOl } from '../../lib/oylik-hujjat/ostatka-slichitelniy';
import { pudratchiNomiOl } from '../../lib/oylik-hujjat/m29';
import {
  barchaShartnomalar, manifestQur, oyPapkalarigaYigish, paketEskirganmi, paketF2FaylNomi, shartnomaObyektlari, shartnomaPaketYigish, sha256Hex, tayyorgarlikHisobla,
  type Forma3Holat, type KirishFayl, type M29Holat, type YaratilganHujjatlar,
} from '../../lib/f2-oylik-paket/shartnoma';
import type { SvodShartnoma } from '../../lib/nakopitelniy-svod';
import { oyFaktSoni, oyM29Holati, oylikPaketlarRoyxati, oylikPaketniTopshir, paketZipniSaqla, yangiTopshirishId, type OylikPaketYozuv } from '../../api/t2-shartnoma-oylik-paket';
import { TayyorgarlikJadvali } from '../../components/oylik-paket/TayyorgarlikJadvali';
import { PaketArxivi } from '../../components/oylik-paket/PaketArxivi';
import {
  NDS_FOIZ, mavjudOylar, oyAktlari, oyF3lar, oyJami, oyKaliti, paketFayllari, paketTekshiruvlari, sukutTanlov,
  type FaylMeta, type PaketAkt, type PaketFayl, type PaketFaylTuri, type Tekshiruv, type TekshiruvKodi,
} from '../../lib/f2-oylik-paket/oylik';
import { paketAktExcel, paketAktHisobi } from '../../lib/f2-oylik-paket/portfel';
import { avtoForma3, f3F2Farq, minimalSvod, oyF3Holati, type OyF3Holati } from '../../lib/f2-oylik-paket/forma3-avto';
import { F3_AVTO_BELGI } from '../../lib/forma3-export';
import type { MundarijaQator } from '../../lib/f2-oylik-paket/eksport';
import type { Summa } from '../../lib/f2-reestr/reestr';
import { yaxlit2 } from '../../lib/hisob-yadro';
import { raqamTozala } from '../../lib/raqam-belgi';

const pul = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BOSQICH_NOMI = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Tekshirilmoqda / qoralama', rad: 'Rad etilgan', bekor: 'Bekor qilingan' } as const;
const BOSQICH_RANG = { tasdiqlangan: 'text-ok', jarayonda: 'text-warn', rad: 'text-danger', bekor: 'text-text-mute' } as const;
const F3_HOLAT_NOMI: Record<OyF3Holati, string> = { saqlangan: 'saqlangan', avto: 'avto (F2 dan)', qoralama: 'qoralama bor — avto (F2 dan)' };
const F3_HOLAT_RANG: Record<OyF3Holati, string> = { saqlangan: 'bg-ok/10 text-ok', avto: 'bg-accent/10 text-accent', qoralama: 'bg-warn/10 text-warn' };
const BOSQICH_RU = { tasdiqlangan: 'утверждён', jarayonda: 'ЧЕРНОВИК (QORALAMA)', rad: 'отклонён (QORALAMA)', bekor: 'аннулирован' } as const;

function SonKatak({ v, taxminiy = false }: { v: number | null | undefined; taxminiy?: boolean }) {
  if (v == null) return <span className="text-warn">{t('noma’lum')}</span>;
  return <span className="tabular-nums">{taxminiy ? '≈ ' : ''}{pul(v)}</span>;
}
function JamiKatak({ s }: { s: Summa }) {
  return <span className="tabular-nums">{s.soni - s.nomalum > 0 ? pul(s.malum) : '—'}
    {s.nomalum > 0 && <span className="ml-1 block text-[10.5px] font-normal text-warn">{t('+ {n} ta summasi noma’lum', { n: s.nomalum })}</span>}</span>;
}

const TEKSHIRUV_MATNI: Record<TekshiruvKodi, string> = {
  qoralama: 'Tasdiqlanmagan (qoralamada yoki tekshiruvda)',
  raqamsiz: 'F2 raqami yo‘q',
  raqam_takror: 'Bir obyektda shu oyda raqam takrorlangan',
  summa_nomalum: 'Summa yoki NDS noma’lum / taxminiy',
  uchastka_aralash: 'Uchastkalar aralash (bir F2 da bir nechta uchastka)',
};
function tafsilotMatni(x: Tekshiruv): string {
  if (x.kod === 'summa_nomalum') {
    if (x.tafsilot === 'hujjat_jami') return t('F2 jami noma’lum');
    if (x.tafsilot === 'narxsiz') return t('narxsiz qatorlar bor');
    if (x.tafsilot === 'KAT_NOMALUM_QISM') return t('qator kategoriyasi noma’lum — ustamali taxminiy');
    if (x.tafsilot === 'oqilmadi') return t('qatorlari o‘qilmadi');
    if (x.tafsilot === 'KOEF_YOQ') return t('obyektda ustama foizlari yo‘q');
    if (x.tafsilot === 'QATOR_YOQ') return t('qatorlari yo‘q — ustamali noma’lum');
    return t('ustamali hisoblab bo‘lmadi');
  }
  return x.tafsilot && x.kod === 'uchastka_aralash' ? t('{n} ta uchastka', { n: x.tafsilot }) : '';
}

type Hisob = { moliya: PaketAkt['moliya']; uchastkalar: number | null; xato: boolean };
type F3Kirish = { svodOl: readonly SvodShartnoma[]; shIdlar: ReadonlySet<number>; oyK: string; otkazilgan: string[] };
type F3Natija = { fayllar: KirishFayl[]; tayyor: number; qoralama: number };
const oyOxiri = (oy: string) => { const [yy, mm] = oy.split('-').map(Number); return new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10); };
const f2Meta = (r: PaketAkt): FaylMeta => ({ hujjat: 'Ф-2', obyekt: r.obyektNom, oy: oyKaliti(r.akt.oy), holat: `${BOSQICH_RU[r.bosqich]} · № ${r.akt.raqam ?? '—'}`, akt: r, qoralama: r.bosqich !== 'tasdiqlangan' });

function PaketIchi({ kompaniyaId, malumot, tashkilot, yangila }: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null; yangila?: () => void }) {
  const oylar = useMemo(() => mavjudOylar(malumot.aktlar), [malumot]);
  const [oy, setOy] = useState(() => oylar[0] ?? new Date().toISOString().slice(0, 7));
  /** Oraliq oxiri (egasi 2026-11-05: pereraschet uchun butun lot). null — bitta oy. */
  const [gacha, setGacha] = useState<string | null>(null);
  const [barcha, setBarcha] = useState(false);
  const [qoralamaQosh, setQoralamaQosh] = useState(false);
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [shartnomaId, setShartnomaId] = useState<number | null>(null);
  const [hisoblar, setHisoblar] = useState<Map<number, Hisob>>(new Map());
  const [tanlov, setTanlov] = useState<Set<number>>(new Set());
  const [band, setBand] = useState<string | null>(null);
  const [f3Xabar, setF3Xabar] = useState('');
  // Forma-3 shakli paketda (egasi 2026-11-03): sukut to'liq; tanlov kompaniya bo'yicha eslanadi (faqat qulaylik).
  const [f3Tanlov, setF3Tanlov] = useState<PaketF3Tanlov>(() => f3PaketTanlovOl(kompaniyaId));
  useEffect(() => { setF3Tanlov(f3PaketTanlovOl(kompaniyaId)); }, [kompaniyaId]);
  const f3TanlovOzgar = (x: PaketF3Tanlov) => { setF3Tanlov(x); f3PaketTanlovSaqla(kompaniyaId, x); };
  const obyektKesh = useRef(new Map<string, Promise<PortfelObyektMalumot>>());
  const versiya = useRef(0);
  // Shartnoma rejimi (egasi 2026-11-03): bir shartnoma x bir oy (yoki oraliq). Shartnomalar bo'lmasa — eski loyiha rejimi.
  const shartnomalarRoyxati = useMemo(() => barchaShartnomalar(malumot), [malumot]);
  const [rejim, setRejim] = useState<'shartnoma' | 'loyiha'>(() => (barchaShartnomalar(malumot).length ? 'shartnoma' : 'loyiha'));
  const [faktSoni, setFaktSoni] = useState<Map<number, number | null>>(new Map());
  const [m29, setM29] = useState<Map<number, M29Holat>>(new Map());
  const [svod, setSvod] = useState<SvodShartnoma[] | null | undefined>(undefined);
  const [arxivVer, setArxivVer] = useState(0);
  const [oxirgi, setOxirgi] = useState<OylikPaketYozuv[] | null>(null);
  const [f3Ogoh, setF3Ogoh] = useState<string[]>([]);
  /** Paketda HAQIQATAN yaratilgan obyekt hujjatlari (Nakopitelniy / M-29 / Ostatka / Slichitelniy): «Tayyorgarlik» katagi shundan. */
  const [yaratilgan, setYaratilgan] = useState<YaratilganHujjatlar>(new Map());
  const topshirishId = useRef<string | null>(null);
  const sh = rejim === 'shartnoma';
  /** Oraliq: barcha oylar yoki dan..gacha (gacha > oy). Topshirish va tayyorgarlik — faqat bitta oy. */
  const oraliq = barcha || (gacha != null && gacha > oy);
  const davrMatn = barcha ? t('barcha oylar') : oraliq ? `${oy} — ${gacha}` : oy;

  useEffect(() => { obyektKesh.current = new Map(); setHisoblar(new Map()); }, [kompaniyaId, malumot]);
  useEffect(() => { setYaratilgan(new Map()); }, [oy, gacha, barcha, shartnomaId, rejim, kompaniyaId]);
  // Jonli: boshqa oynada F2 tahrirlab qaytilganda joriy aktlar qayta o'qiladi (nusxa saqlanmaydi).
  useEffect(() => {
    if (!yangila) return;
    const k = () => { if (document.visibilityState === 'visible') yangila(); };
    document.addEventListener('visibilitychange', k);
    return () => document.removeEventListener('visibilitychange', k);
  }, [yangila]);

  const loyihalar = useMemo(() => [...malumot.loyihalar].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'ru')), [malumot]);
  const shartnomalar = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of malumot.obyektlar) {
      if (loyihaId != null && o.loyiha_id !== loyihaId) continue;
      for (const s of malumot.shartnomalar.get(o.id) ?? []) m.set(s.id, `№ ${raqamTozala(s.raqam)}${s.nom ? ` · ${s.nom}` : ''}`);
    }
    return [...m].map(([id, nom]) => ({ id, nom }));
  }, [malumot, loyihaId]);
  useEffect(() => { if (!sh && shartnomaId != null && !shartnomalar.some((s) => s.id === shartnomaId)) setShartnomaId(null); }, [shartnomalar, shartnomaId, sh]);
  useEffect(() => { if (sh && shartnomaId == null && shartnomalarRoyxati.length) setShartnomaId(shartnomalarRoyxati[0].id); }, [sh, shartnomaId, shartnomalarRoyxati]);
  const tanlanganShartnoma = sh && shartnomaId != null ? shartnomalarRoyxati.find((s) => s.id === shartnomaId) ?? null : null;
  const shObyektlar = useMemo(() => (sh && shartnomaId != null ? shartnomaObyektlari(malumot, shartnomaId) : []), [malumot, sh, shartnomaId]);
  const raqamlar = useMemo(() => new Map(malumot.aktlar.map((a) => [a.id, a.raqam ?? null] as const)), [malumot]);

  const asos = useMemo(() => oyAktlari(malumot, { oy, gacha: oraliq && !barcha ? gacha : null, barcha, loyihaId: sh ? null : loyihaId, shartnomaId }),
    [malumot, oy, gacha, oraliq, barcha, loyihaId, shartnomaId, sh]);
  const rows: PaketAkt[] = useMemo(() => asos.map((r) => {
    const h = hisoblar.get(r.akt.id);
    return h ? { ...r, moliya: h.moliya, uchastkalar: h.uchastkalar, moliyaXato: h.xato } : r;
  }), [asos, hisoblar]);
  const asosKalit = asos.map((r) => r.akt.id).join(',');
  const paketOylari = useMemo(() => [...new Set(asos.map((r) => oyKaliti(r.akt.oy)).filter((x): x is string => !!x))].sort(), [asos]);

  // Tanlov: har oy/filtr o'zgarganda sukut — faqat tasdiqlanganlar (qoralamalar — alohida belgi bilan).
  useEffect(() => { setTanlov(qoralamaQosh ? new Set(asos.map((r) => r.akt.id)) : sukutTanlov(asos)); }, [asosKalit, qoralamaQosh]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Obyekt aktlari bir marta o'qiladi (smeta + F2 qatorlari + akt podvallari + kontekst) — F2 portfeli bilan bir xil o'qish. */
  const obyektAktlari = useMemo(() => {
    const g = new Map<number, number[]>();
    for (const r of asos) g.set(r.akt.obyekt_id, [...(g.get(r.akt.obyekt_id) ?? []), r.akt.id]);
    return g;
  }, [asos]);
  const obyektYukla = useCallback((obyektId: number): Promise<PortfelObyektMalumot> => {
    const ids = [...(obyektAktlari.get(obyektId) ?? [])].sort((a, b) => a - b);
    const kalit = `${obyektId}|${ids.join(',')}`;
    let p = obyektKesh.current.get(kalit);
    if (!p) {
      p = Promise.resolve().then(() => portfelObyektOl(kompaniyaId, obyektId, ids)).catch((e) => { obyektKesh.current.delete(kalit); throw e; });
      obyektKesh.current.set(kalit, p);
    }
    return p;
  }, [kompaniyaId, obyektAktlari]);

  // Har obyekt bir marta o'qiladi, keyin har aktning summalari yagona yadrodan (portfel bilan aynan bir xil).
  useEffect(() => {
    const v = ++versiya.current;
    const guruh = new Map<number, PaketAkt[]>();
    for (const r of asos) guruh.set(r.akt.obyekt_id, [...(guruh.get(r.akt.obyekt_id) ?? []), r]);
    void (async () => {
      const navbat = [...guruh];
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(3, navbat.length) }, async () => {
        while (i < navbat.length) {
          const [obyektId, aktlar] = navbat[i++];
          if (v !== versiya.current) return;
          const yangi = new Map<number, Hisob>();
          try {
            const m = await obyektYukla(obyektId);
            for (const r of aktlar) { const h = paketAktHisobi(m, r.akt, r.obyektNom, raqamlar); yangi.set(r.akt.id, { moliya: h.moliya, uchastkalar: h.uchastkalar, xato: false }); }
          } catch {
            for (const r of aktlar) yangi.set(r.akt.id, { moliya: null, uchastkalar: null, xato: true });
          }
          if (v === versiya.current) setHisoblar((old) => new Map([...old, ...yangi]));
        }
      }));
    })();
  }, [asosKalit, obyektYukla]); // eslint-disable-line react-hooks/exhaustive-deps

  const hisoblanmoqda = rows.some((r) => !r.moliya && !r.moliyaXato);
  const tekshiruvlar = useMemo(() => paketTekshiruvlari(rows), [rows]);
  const jamiHammasi = useMemo(() => oyJami(rows), [rows]);
  const jamiTanlangan = useMemo(() => oyJami(rows, tanlov), [rows, tanlov]);
  const tanlanganlar = rows.filter((r) => tanlov.has(r.akt.id));

  // Tayyorgarlik uchun (faqat bitta oy): shartnoma obyektlarining fakt aktlari soni, M-29 holati va shartnoma svodi. Hammasi faqat o'qish.
  const shObyektKalit = shObyektlar.map((o) => o.id).join(',');
  useEffect(() => {
    if (!sh || oraliq || !shObyektlar.length) return;
    let faol = true;
    setFaktSoni(new Map()); setM29(new Map());
    void (async () => {
      for (const o of shObyektlar) {
        const [f, m] = await Promise.all([oyFaktSoni(o.id, oy).catch(() => null), oyM29Holati(o.id, oy)]);
        if (!faol) return;
        setFaktSoni((x) => new Map(x).set(o.id, f)); setM29((x) => new Map(x).set(o.id, m));
      }
    })();
    return () => { faol = false; };
  }, [sh, oraliq, shObyektKalit, oy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sh) return;
    let faol = true;
    setSvod(undefined);
    void f3SvodOl(kompaniyaId).then((s) => { if (faol) setSvod(s); }, () => { if (faol) setSvod(null); });
    return () => { faol = false; };
  }, [sh, kompaniyaId, arxivVer]);
  // «Paket eskirgan»: shu shartnoma + oyning so'nggi topshirilgan versiyasi va undan keyingi manba o'zgarishi (server izi).
  useEffect(() => {
    if (!sh || oraliq || shartnomaId == null) { setOxirgi(null); return; }
    let faol = true;
    void oylikPaketlarRoyxati({ kompaniyaId, shartnomaId, oy }).then((r) => { if (faol) setOxirgi(r.ok ? r.paketlar : null); }, () => { if (faol) setOxirgi(null); });
    return () => { faol = false; };
  }, [sh, oraliq, kompaniyaId, shartnomaId, oy, arxivVer, malumot]);
  /** Mavjud F3 kiritish joyi — Nakopitelniy sahifasidagi «Shartnoma darajasi» bo'limi (obyekt orqali shartnoma), sana va summa oldindan. */
  const f3SaqlashHref = (m: string): string | null => {
    const o = shObyektlar[0];
    if (!o) return null;
    const j = oyJami(rows.filter((r) => r.bosqich === 'tasdiqlangan' && oyKaliti(r.akt.oy) === m)).jami;
    const summa = j.soni - j.nomalum > 0 ? String(yaxlit2(j.malum)) : '';
    return `/admin/nakopitelniy?obyekt=${o.id}&f3_sana=${oyOxiri(m)}${summa ? `&f3_summa=${summa}` : ''}#shartnoma-svod`;
  };
  const eskirish = useMemo(() => (oxirgi ? paketEskirganmi(oxirgi, oy) : null), [oxirgi, oy]);

  const f3Holat: Forma3Holat | null = useMemo(() => {
    if (!sh || shartnomaId == null || !svod) return null;
    const f = oyF3lar(svod, new Set([shartnomaId]), oy);
    return { tayyor: f.tayyor.length, qoralama: f.qoralama };
  }, [sh, shartnomaId, svod, oy]);
  const tayyorgarlik = useMemo(() => (sh && !oraliq ? tayyorgarlikHisobla({ obyektlar: shObyektlar, aktlar: rows, faktSoni, m29, forma3: f3Holat, tekshiruvlar, yaratilgan }) : null),
    [sh, oraliq, shObyektlar, rows, faktSoni, m29, f3Holat, tekshiruvlar, yaratilgan]);

  /** MUNDARIJA (ildizda, birinchi): har fayl va F2 summalari; token — mazmun xeshi bilan (qayta yuklash bepul). */
  async function mundarijaQosh(jamlangan: PaketFayl[], sarlavha: string, otkazilgan: string[], qoshimcha: readonly MundarijaQator[] = []): Promise<PaketFayl[]> {
    const qatorlar = [...jamlangan.map((f) => ({ yol: f.yol, ...(f.meta ?? { hujjat: f.tur }) })), ...qoshimcha];
    const x = mundarijaXlsx(qatorlar, { sarlavha, tashkilot });
    const q = await hujjatTokenBilan({ kompaniyaId, bytes: x.bytes, hujjat: 'PAKET_MUNDARIJA', sabab: `Содержание пакета · ${sarlavha}` }, () => undefined);
    if (!q.ok) { otkazilgan.push(`MUNDARIJA: ${q.xabar}`); return jamlangan; }
    return [{ yol: x.faylNomi, bytes: x.bytes, tur: 'reestr', obyektId: null, meta: { hujjat: 'Содержание пакета' } }, ...jamlangan];
  }

  /** Bir oyning Forma-3 fayllari (shartnoma(lar) bo'yicha; shakl — tanlagichdan: to'liq / bir qatorli / ikkalasi). */
  async function oyF3Fayllari(p: F3Kirish): Promise<F3Natija> {
    const { svodOl, shIdlar, oyK, otkazilgan } = p;
    const f = oyF3lar(svodOl, shIdlar, oyK);
    const fayllar: KirishFayl[] = [];
    for (const { sh: s, f3: x } of f.tayyor) {
      for (const h of forma3SotuvFayllari(s, x.id, f3Tanlov, { tashkilot })) {
        const q = await hujjatTokenBilan({ kompaniyaId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3${h.shakl === 'bir_qatorli' ? ' (одностр.)' : ''} · № ${raqamTozala(s.raqam)} · ${x.sotuv_sana}` }, () => undefined);
        if (q.ok) fayllar.push({ nom: h.faylNomi, bytes: h.bytes, tur: 'forma3', meta: { hujjat: h.shakl === 'bir_qatorli' ? 'Форма № 3 (одностроч.)' : 'Форма № 3', oy: oyK, holat: `№ ${x.raqam ?? x.id} · договор № ${raqamTozala(s.raqam)}` } });
        else otkazilgan.push(`Forma-3 № ${x.raqam ?? x.id}: ${q.xabar}`);
      }
    }
    return { fayllar, tayyor: f.tayyor.length, qoralama: f.qoralama };
  }

  /**
   * Shartnoma + oy Forma-3 (egasi 2026-11-05): saqlangan (qoralama emas) sotuv F3 bo'lsa — o'sha (+ MUNDARIJA da F2 jami bilan solishtiruv);
   * bo'lmasa — shu oyning tasdiqlangan F2 laridan AVTOMATIK F3 (saqlanmaydi; belgisi bilan). Token — mazmun xeshi (qayta — bepul).
   */
  async function shartnomaOyF3(p: { svodOl: readonly SvodShartnoma[] | null; shSvod: SvodShartnoma | null; oyK: string; oyRows: readonly PaketAkt[]; otkazilgan: string[]; ogoh: string[]; qoshimcha: MundarijaQator[] }): Promise<KirishFayl[]> {
    if (!tanlanganShartnoma) return [];
    const { oyK, otkazilgan } = p;
    if (p.svodOl && p.shSvod) {
      const saqlangan = await oyF3Fayllari({ svodOl: p.svodOl, shIdlar: new Set([tanlanganShartnoma.id]), oyK, otkazilgan });
      if (saqlangan.tayyor > 0) {
        for (const { f3 } of oyF3lar(p.svodOl, new Set([tanlanganShartnoma.id]), oyK).tayyor) {
          const x = f3F2Farq(f3.sotuv_summa, p.oyRows, oyK);
          p.qoshimcha.push({ yol: `${oraliq ? `${oyK}/` : ''}(проверка)`, hujjat: 'Сверка: Ф3 и Ф-2', oy: oyK, summa: f3.sotuv_summa,
            holat: `Ф3 № ${f3.raqam ?? f3.id} = ${pul(f3.sotuv_summa)}; Ф-2 утв. = ${x.f2 == null ? 'неизвестно' : pul(x.f2)}; разница: ${x.farq == null ? '—' : pul(x.farq)}` });
        }
        return saqlangan.fayllar;
      }
    }
    const sh = p.shSvod ?? minimalSvod(tanlanganShartnoma, shObyektlar);
    const birinchi = shObyektlar.find((o) => p.oyRows.some((r) => r.akt.obyekt_id === o.id));
    const imzo = birinchi ? await paketImzosiOl(kompaniyaId, birinchi.id) : {};
    const a = avtoForma3({ sh, oy: oyK, rows: p.oyRows, tanlov: f3Tanlov, tashkilot, imzo });
    if (!a) { otkazilgan.push(`Forma-3 ${oyK}: ${t('tasdiqlangan F2 (ma’lum summa) yo‘q — avtomatik F3 yasalmadi')}`); return []; }
    if (a.kamchilik.length) p.ogoh.push(`Форма № 3 ${oyK}, договор № ${raqamTozala(tanlanganShartnoma.raqam)}: не хватает — ${a.kamchilik.join('; ')}`);
    const out: KirishFayl[] = [];
    for (const h of a.fayllar) {
      const q = await hujjatTokenBilan({ kompaniyaId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3 (авто по Ф-2)${h.shakl === 'bir_qatorli' ? ' (одностр.)' : ''} · № ${raqamTozala(tanlanganShartnoma.raqam)} · ${oyK}` }, () => undefined);
      if (q.ok) out.push({ nom: h.faylNomi, bytes: h.bytes, tur: 'forma3', meta: { hujjat: h.shakl === 'bir_qatorli' ? 'Форма № 3 (одностроч.)' : 'Форма № 3', oy: oyK, summa: a.summa,
        holat: `${F3_AVTO_BELGI} · договор № ${raqamTozala(tanlanganShartnoma.raqam)}${a.nomalum ? ` · без ${a.nomalum} Ф-2 с неизвестной суммой` : ''}` } });
      else otkazilgan.push(`Forma-3 (авто) ${oyK}: ${q.xabar}`);
    }
    return out;
  }

  /** Shartnoma paketini yig'adi (bitta oy yoki oraliq — oy papkalari bilan). Xatolar paketni to'xtatmaydi - ПАКЕТ_СОСТАВ.txt ga yoziladi. */
  async function shartnomaPaketiniYigish() {
    if (!tanlanganShartnoma) return null;
    const otkazilgan: string[] = [];
    /** Forma-3: yetishmagan rekvizitlar (paket yig'iladi, ПАКЕТ_СОСТАВ.txt va ekranda aytiladi) va MUNDARIJA tekshiruv qatorlari. */
    const ogoh: string[] = [];
    const qoshimcha: MundarijaQator[] = [];
    const yangiYaratilgan = new Map<number, ObyektHujjatlariNatija['kataklar']>();
    const pudratchi = await pudratchiNomiOl(kompaniyaId).catch(() => null);
    const svodOl = svod ?? await f3SvodOl(kompaniyaId);
    const shSvod = svodOl?.find((x) => x.id === tanlanganShartnoma.id) ?? null;
    if (!svodOl) otkazilgan.push(`${t('Akt-sverka')}: ${t('shartnoma svodi o‘qilmadi')}`);
    const tOylar = [...new Set(tanlanganlar.map((r) => oyKaliti(r.akt.oy)).filter((x): x is string => !!x))].sort();
    const oyPaketlari: Array<{ oy: string; fayllar: PaketFayl[] }> = [];
    for (const oyK of tOylar) {
      const oyRows = tanlanganlar.filter((r) => oyKaliti(r.akt.oy) === oyK);
      const obyektFayllari = new Map<number, KirishFayl[]>();
      const ildiz: KirishFayl[] = [];
      for (const r of oyRows) {
        const belgi = `${oyK} · ${r.obyektNom} · F2 № ${r.akt.raqam ?? '—'}`;
        try {
          const x = await f2Fayl(r);
          if ('fayl' in x) obyektFayllari.set(r.akt.obyekt_id, [...(obyektFayllari.get(r.akt.obyekt_id) ?? []), { nom: x.fayl.nom, bytes: x.fayl.bytes, tur: 'f2', obyektId: r.akt.obyekt_id, meta: f2Meta(r) }]);
          else otkazilgan.push(`${belgi}: ${x.xato}`);
        } catch { otkazilgan.push(`${belgi}: ${t('Ф-2 hujjatini yaratib bo‘lmadi.')}`); }
      }
      // Obyekt hujjatlari (Nakopitelniy, M-29, Ostatka, Slichitelniy): sahifalar bilan bir xil yuklagich/quruvchi (lib/oylik-hujjat), token bilan.
      for (const o of shObyektlar.filter((x) => oyRows.some((r) => r.akt.obyekt_id === x.id))) {
        const imzo = await paketImzosiOl(kompaniyaId, o.id);
        const x = await obyektHujjatlariniYigish({ kompaniyaId, obyekt: { id: o.id, nom: o.nom }, oy: oyK, imzo, ndsFoiz: NDS_SUKUT_FOIZ, pudratchi,
          tokenla: async (q) => { const r = await hujjatTokenBilan({ kompaniyaId, bytes: q.bytes, hujjat: q.hujjat, sabab: q.sabab, obyekt: q.obyektId }, () => undefined); return r.ok ? { ok: true } : { ok: false, xabar: r.xabar }; } });
        if (x.fayllar.length) obyektFayllari.set(o.id, [...(obyektFayllari.get(o.id) ?? []), ...x.fayllar.map((f) => ({ ...f, meta: { hujjat: f.tur === 'nakopitelniy' ? 'Накопительная ведомость' : f.tur === 'm29' ? 'М-29' : f.tur === 'ostatka' ? 'Ведомость остатков' : f.tur === 'slichitelniy' ? 'Сличительная ведомость' : f.tur, obyekt: o.nom, oy: oyK } }))]);
        otkazilgan.push(...x.otkazilgan.map((s) => (oraliq ? `${oyK} · ${s}` : s)));
        if (!oraliq) yangiYaratilgan.set(o.id, x.kataklar);
      }
      const reestr = oylikReestrXlsx(oyRows, { oy: oyK, tashkilot, loyiha: null });
      const rt = await hujjatTokenBilan({ kompaniyaId, bytes: reestr.bytes, hujjat: 'F2_OYLIK_REESTR', sabab: `Реестр и свод Ф-2 · договор № ${raqamTozala(tanlanganShartnoma.raqam)} · ${oyK}` }, () => undefined);
      if (rt.ok) ildiz.push({ nom: reestr.faylNomi, bytes: reestr.bytes, tur: 'reestr', meta: { hujjat: 'Реестр и свод Ф-2', oy: oyK } }); else otkazilgan.push(`${t('Oylik reestr')} ${oyK}: ${rt.xabar}`);
      ildiz.push(...(await shartnomaOyF3({ svodOl, shSvod, oyK, oyRows, otkazilgan, ogoh, qoshimcha })));
      oyPaketlari.push({ oy: oyK, fayllar: shartnomaPaketYigish({ obyektlar: shObyektlar, obyektFayllari, shartnomaFayllari: ildiz }) });
    }
    if (!oraliq) setYaratilgan(yangiYaratilgan);
    // Shartnoma darajasi (ildiz): akt-sverka (oraliq oxirigacha) va oraliq bo'lsa — butun davr reestri/svodi.
    const ildiz: KirishFayl[] = [];
    if (oraliq && tOylar.length > 1) {
      const r = oylikReestrXlsx(tanlanganlar, { oy: `${tOylar[0]}_${tOylar.at(-1)}`, tashkilot, loyiha: null, davr: `${davrMatni(`${tOylar[0]}-01`)} — ${davrMatni(`${tOylar.at(-1)}-01`)}` });
      const rt = await hujjatTokenBilan({ kompaniyaId, bytes: r.bytes, hujjat: 'F2_OYLIK_REESTR', sabab: `Реестр и свод Ф-2 · договор № ${raqamTozala(tanlanganShartnoma.raqam)} · ${tOylar[0]}..${tOylar.at(-1)}` }, () => undefined);
      if (rt.ok) ildiz.push({ nom: r.faylNomi, bytes: r.bytes, tur: 'reestr', meta: { hujjat: 'Реестр и свод Ф-2 за период' } }); else otkazilgan.push(`${t('Oylik reestr')}: ${rt.xabar}`);
    }
    if (svodOl && !shSvod) otkazilgan.push(`${t('Akt-sverka')}: ${t('shartnoma svodi o‘qilmadi')}`);
    if (shSvod && tOylar.length) {
      const sv = sverkaXlsx(shSvod, { tashkilot, gacha: oyOxiri(tOylar.at(-1)!) });
      const st = await hujjatTokenBilan({ kompaniyaId, bytes: sv.bytes, hujjat: 'AKT_SVERKA', sabab: `Акт сверки · договор № ${raqamTozala(shSvod.raqam)} · ${tOylar.at(-1)}` }, () => undefined);
      if (st.ok) ildiz.push({ nom: sv.faylNomi, bytes: sv.bytes, tur: 'sverka', meta: { hujjat: 'Акт сверки', oy: tOylar.at(-1) } }); else otkazilgan.push(`${t('Akt-sverka')}: ${st.xabar}`);
    }
    // Bitta oy — avvalgi tuzilma (ildiz + obyekt papkalari); oraliq — har oy o'z papkasida.
    let jamlangan: PaketFayl[] = oraliq
      ? oyPapkalarigaYigish(oyPaketlari, ildiz)
      : [...(oyPaketlari[0]?.fayllar ?? []), ...ildiz.map((f) => ({ yol: f.nom, bytes: f.bytes, tur: f.tur, obyektId: null, ...(f.meta ? { meta: f.meta } : {}) }))];
    if (!jamlangan.length) return { bosh: true as const, otkazilgan };
    const sarlavha = `договор № ${raqamTozala(tanlanganShartnoma.raqam)}${tanlanganShartnoma.nom ? ` (${tanlanganShartnoma.nom})` : ''} · ${barcha ? 'все месяцы' : oraliq ? `${tOylar[0]} — ${tOylar.at(-1)}` : oy}`;
    jamlangan = await mundarijaQosh(jamlangan, sarlavha, otkazilgan, qoshimcha);
    setF3Ogoh(ogoh);
    if (ogoh.length) toast(t('Forma-3 yasaldi, lekin rekvizitlar yetishmaydi: {x}', { x: ogoh.join('; ') }), 'warn', undefined, 9000);
    const tayyorgarlikQatorlari = oraliq ? [] : tayyorgarlikHisobla({ obyektlar: shObyektlar, aktlar: rows, faktSoni, m29, forma3: f3Holat, tekshiruvlar, yaratilgan: yangiYaratilgan }).qatorlar;
    const davrK = oraliq ? `${tOylar[0]}_${tOylar.at(-1)}` : oy;
    const tarkib = paketTarkibiMatni({ oy: davrK, fayllar: jamlangan, tekshiruvlar: tekshiruvlar.filter((x) => tanlov.has(x.aktId)), otkazilgan, shartnoma: { raqam: tanlanganShartnoma.raqam, nom: tanlanganShartnoma.nom }, ogohlantirish: ogoh });
    const manifest = await manifestQur({ oy: davrK, shartnoma: tanlanganShartnoma, fayllar: jamlangan, tarkib: { yol: TARKIB_FAYL_NOMI, bytes: tarkibBaytlari(tarkib) },
      aktlar: tanlanganlar, obyektlar: shObyektlar, tayyorgarlik: tayyorgarlikQatorlari, kirmadi: otkazilgan });
    const zip = paketZip(jamlangan, tarkib);
    const zipNom = hujjatFaylNomi({ obyekt: tashkilot ?? undefined, hujjat: `ПАКЕТ_${tanlanganShartnoma.raqam}`, davr: davrK, kengaytma: 'zip' });
    manifest.zip = { sha256: await sha256Hex(zip), olcham: zip.byteLength, nom: zipNom };
    return { bosh: false as const, zip, zipNom, manifest, otkazilgan };
  }

  async function shartnomaPaketiniYuklash() {
    if (band || !tanlanganShartnoma || !tanlanganlar.length) return;
    setBand('paket');
    try {
      const x = await shartnomaPaketiniYigish();
      if (!x || x.bosh) { toast(t('Paketga hech narsa kirmadi'), 'danger'); return; }
      downloadBlob(x.zip, x.zipNom);
      toast(x.otkazilgan.length ? t('Paket yuklandi; {n} ta hujjat kirmadi (ZIP ichidagi ПАКЕТ_СОСТАВ.txt ga qarang)', { n: x.otkazilgan.length }) : t('Paket yuklandi'), x.otkazilgan.length ? 'warn' : 'ok');
    } catch { toast(t('Paketni yig‘ib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  /** «Topshirildi» / «Qayta yig'ish»: paketni yig'ib kanonik saqlashga yuklaydi va yangi versiya yozadi (eskisi arxivda qoladi; hech narsani bloklamaydi). */
  async function topshirish() {
    if (band || !tanlanganShartnoma || !tanlanganlar.length || oraliq) return;
    setBand('topshir');
    topshirishId.current ??= yangiTopshirishId();
    try {
      const x = await shartnomaPaketiniYigish();
      if (!x || x.bosh) { toast(t('Paketga hech narsa kirmadi'), 'danger'); return; }
      // ZIP o'zi hisoblangan katak sanamaydi (ichidagi hujjatlar yuqorida to'langan); bir xil bayt qayta yuklansa - bepul.
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes: x.zip, hujjat: 'SHARTNOMA_OYLIK_PAKET', sabab: `Пакет по договору № ${raqamTozala(tanlanganShartnoma.raqam)} · ${oy}`, yacheykalar: 0 }, () => undefined);
      if (!tk.ok) { toast(tk.xabar, 'danger'); return; }
      const loyihalar = new Set(shObyektlar.map((o) => o.loyiha_id));
      const sk = await paketZipniSaqla({ kompaniyaId, loyihaId: loyihalar.size === 1 ? [...loyihalar][0] : null, zip: x.zip, fayl: x.zipNom, oy, operationId: yangiTopshirishId() });
      if (!sk.ok) { toast(`${t('ZIP ni saqlab bo‘lmadi')}: ${sk.xato}`, 'danger'); return; }
      const r = await oylikPaketniTopshir({ kompaniyaId, shartnomaId: tanlanganShartnoma.id, oy, manifest: x.manifest, hujjatId: sk.hujjatId,
        zipSha256: x.manifest.zip?.sha256 ?? null, zipOlcham: x.manifest.zip?.olcham ?? null, operationId: topshirishId.current });
      if (!r.ok) { toast(r.error || r.xabar || r.code || t('Topshirib bo‘lmadi.'), 'danger'); return; }
      topshirishId.current = null;
      setArxivVer((n) => n + 1);
      toast(t('Paket topshirildi (v{n})', { n: String(r.versiya ?? '') }), x.otkazilgan.length ? 'warn' : 'ok');
    } catch { toast(t('Topshirib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  function belgila(id: number, on: boolean) { setTanlov((s) => { const x = new Set(s); if (on) x.add(id); else x.delete(id); return x; }); }

  /** Bitta F2 Excel i — F2 tarixi generatori; token F2 tarixidagi bilan bir xil kalit (bir F2 — bir marta to'lov, qayta chiqarish bepul). */
  async function f2Fayl(r: PaketAkt): Promise<{ fayl: { nom: string; bytes: Uint8Array } } | { xato: string }> {
    const m = await obyektYukla(r.akt.obyekt_id);
    const h = paketAktExcel(m, r.akt, r.obyektNom, raqamlar);
    if (!h) return { xato: t('chiqariladigan qator yo‘q') };
    const xesh = f2HujjatKaliti(r.akt.obyekt_id, r.akt.oy || '', r.akt.raqam) ?? `akt:${r.akt.id}:${await mazmunXeshi(h.bytes)}`;
    const q = await tokenBilan({ kompaniyaId, amal: 'f2_hujjat', birlikSoni: h.yacheykalar,
      meta: { hujjat: 'F2', sabab: `F2 №${r.akt.raqam || '—'} · ${r.obyektNom} · ${(r.akt.oy || '').slice(0, 7)}`.slice(0, 200), obyekt: r.akt.obyekt_id, akt: r.akt.id, yacheyka: h.yacheykalar, xesh } }, async () => true);
    const shRaqam = (malumot.shartnomalar.get(r.akt.obyekt_id) ?? []).find((s) => s.id === shartnomaId)?.raqam ?? (malumot.shartnomalar.get(r.akt.obyekt_id) ?? [])[0]?.raqam ?? null;
    const nom = paketF2FaylNomi({ oy: r.akt.oy, shartnoma: shRaqam, obyekt: r.obyektNom, raqam: r.akt.raqam, aktId: r.akt.id, qoralama: r.bosqich !== 'tasdiqlangan' });
    return q.ok ? { fayl: { nom, bytes: h.bytes } } : { xato: q.xabar };
  }

  async function birExcel(r: PaketAkt) {
    if (band) return;
    setBand(`akt:${r.akt.id}`);
    try {
      const x = await f2Fayl(r);
      if ('xato' in x) toast(x.xato, 'danger'); else downloadBlob(x.fayl.bytes, x.fayl.nom);
    } catch { toast(t('Ф-2 hujjatini yaratib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  /** Loyiha rejimi: F2 lar papkada, reestr ildizda, Forma-3 (har oy) va MUNDARIJA. */
  async function paketniYukla() {
    if (band || !tanlanganlar.length) return;
    setBand('paket'); setF3Xabar('');
    const fayllar: Array<{ papka: string; nom: string; bytes: Uint8Array; tur: PaketFaylTuri; meta?: FaylMeta }> = [];
    const otkazilgan: string[] = [];
    try {
      // 1) har F2 ning Excel i
      for (const r of tanlanganlar) {
        const belgi = `${r.obyektNom} · F2 № ${r.akt.raqam ?? '—'}`;
        try {
          const x = await f2Fayl(r);
          if ('fayl' in x) fayllar.push({ papka: 'F2', nom: x.fayl.nom, bytes: x.fayl.bytes, tur: 'f2', meta: f2Meta(r) }); else otkazilgan.push(`${belgi}: ${x.xato}`);
        } catch { otkazilgan.push(`${belgi}: ${t('Ф-2 hujjatini yaratib bo‘lmadi.')}`); }
      }
      // 2) reestr + svod
      const loyihaNomi = loyihaId != null ? malumot.loyihalar.get(loyihaId) ?? null : null;
      const tOylar = [...new Set(tanlanganlar.map((r) => oyKaliti(r.akt.oy)).filter((x): x is string => !!x))].sort();
      const davrK = tOylar.length > 1 ? `${tOylar[0]}_${tOylar.at(-1)}` : oy;
      const reestr = oylikReestrXlsx(tanlanganlar, { oy: davrK, tashkilot, loyiha: loyihaNomi, davr: tOylar.length > 1 ? `${davrMatni(`${tOylar[0]}-01`)} — ${davrMatni(`${tOylar.at(-1)}-01`)}` : null });
      const rt = await hujjatTokenBilan({ kompaniyaId, bytes: reestr.bytes, hujjat: 'F2_OYLIK_REESTR', sabab: `Oylik F2 reestri · ${davrK}` }, () => undefined);
      if (rt.ok) fayllar.push({ papka: '', nom: reestr.faylNomi, bytes: reestr.bytes, tur: 'reestr', meta: { hujjat: 'Реестр и свод Ф-2' } }); else otkazilgan.push(`${t('Oylik reestr')}: ${rt.xabar}`);
      // 3) Forma-3 (har oyning tayyor sotuv F3 lari)
      const shIdlar = new Set(tanlanganlar.flatMap((r) => (malumot.shartnomalar.get(r.akt.obyekt_id) ?? []).map((s) => s.id)));
      if (shIdlar.size) {
        const svodOl = await f3SvodOl(kompaniyaId);
        if (!svodOl) { otkazilgan.push(`Forma-3: ${t('shartnoma svodi o‘qilmadi')}`); }
        else {
          let tayyor = 0, qoralama = 0;
          for (const oyK of tOylar) {
            const f = await oyF3Fayllari({ svodOl, shIdlar, oyK, otkazilgan });
            tayyor += f.tayyor; qoralama += f.qoralama;
            fayllar.push(...f.fayllar.map((x) => ({ papka: 'Forma-3', nom: x.nom, bytes: x.bytes, tur: x.tur, meta: x.meta })));
          }
          setF3Xabar(tayyor || qoralama
            ? t('Forma-3: paketga {n} ta kirdi, qoralamada qolgan: {q}', { n: tayyor, q: qoralama })
            : t('Bu oy uchun tayyor Forma-3 yo‘q — paketga kirmadi.'));
        }
      } else setF3Xabar(t('Tanlangan obyektlarga shartnoma biriktirilmagan — Forma-3 paketga kirmadi.'));
      if (!fayllar.length) { toast(t('Paketga hech narsa kirmadi'), 'danger'); return; }
      const jamlangan = await mundarijaQosh(paketFayllari(fayllar), `${loyihaNomi ?? 'все проекты'} · ${davrK}`, otkazilgan);
      const tarkib = paketTarkibiMatni({ oy: davrK, fayllar: jamlangan, tekshiruvlar: tekshiruvlar.filter((x) => tanlov.has(x.aktId)), otkazilgan });
      const zip = paketZip(jamlangan, tarkib);
      downloadBlob(zip, hujjatFaylNomi({ obyekt: tashkilot ?? undefined, hujjat: 'ПАКЕТ_Ф-2', davr: davrK, kengaytma: 'zip' }));
      toast(otkazilgan.length ? t('Paket yuklandi; {n} ta hujjat kirmadi (ZIP ichidagi ПАКЕТ_СОСТАВ.txt ga qarang)', { n: otkazilgan.length }) : t('Paket yuklandi'), otkazilgan.length ? 'warn' : 'ok');
    } catch { toast(t('Paketni yig‘ib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  const sarlavha = 'px-2 py-2';
  return <section className="karta flex flex-col gap-3 p-3 text-[12px]" aria-label={t('Shartnoma oylik paketi')}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[160px]"><p className="text-[13px] font-semibold text-text">{t('Shartnoma oylik paketi')}</p>
        <p className="text-[11px] text-text-mute">{t('Summalar: QQS bilan asosiy; ustamali va ustamasiz yonida (F2 portfeli bilan bir xil hisob)')}</p></div>
      {shartnomalarRoyxati.length > 0 && <label>{t('Rejim')}
        <select aria-label={t('Rejim')} value={rejim} onChange={(e) => { const v = e.target.value as 'shartnoma' | 'loyiha'; setRejim(v); if (v === 'shartnoma') setLoyihaId(null); else setShartnomaId(null); }} className="input mt-1 block h-8">
          <option value="shartnoma">{t('Shartnoma bo‘yicha')}</option><option value="loyiha">{t('Loyiha bo‘yicha')}</option></select></label>}
      <label>{t('Oy')}
        <input type="month" aria-label={t('Oy')} value={oy} disabled={barcha} onChange={(e) => { if (oyKaliti(e.target.value)) setOy(e.target.value.slice(0, 7)); }} className="input mt-1 block h-8" /></label>
      <label>{t('gacha (oraliq)')}
        <input type="month" aria-label={t('Oraliq oxiri')} value={gacha ?? ''} min={oy} disabled={barcha} onChange={(e) => setGacha(oyKaliti(e.target.value))} className="input mt-1 block h-8" /></label>
      <label className="inline-flex items-center gap-1.5 pb-2"><input type="checkbox" checked={barcha} onChange={(e) => setBarcha(e.target.checked)} /> {t('Barcha oylar')}</label>
      {!sh && <label>{t('Loyiha')}
        <select aria-label={t('Loyiha')} value={loyihaId ?? ''} onChange={(e) => setLoyihaId(e.target.value ? Number(e.target.value) : null)} className="input mt-1 block h-8 max-w-[220px]">
          <option value="">{t('Hammasi')}</option>{loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>}
      <label>{t('Shartnoma')}
        <select aria-label={t('Shartnoma')} value={shartnomaId ?? ''} onChange={(e) => setShartnomaId(e.target.value ? Number(e.target.value) : null)} className="input mt-1 block h-8 max-w-[220px]">
          {!sh && <option value="">{t('Hammasi')}</option>}
          {(sh ? shartnomalarRoyxati.map((s) => ({ id: s.id, nom: `№ ${raqamTozala(s.raqam)}${s.nom ? ` · ${s.nom}` : ''}` })) : shartnomalar).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></label>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <Forma3ShaklTanlagich paket qiymat={f3Tanlov} onChange={f3TanlovOzgar} disabled={!!band} />
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={qoralamaQosh} onChange={(e) => setQoralamaQosh(e.target.checked)} /> {t('Qoralamalarni ham qo‘shish (QORALAMA)')}</label>
        {yangila && <button type="button" onClick={() => { obyektKesh.current = new Map(); setHisoblar(new Map()); yangila(); }} disabled={!!band}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-50"><RefreshCw size={14} /> {t('Yangilash')}</button>}
        <a className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px]" href={`/admin/f2?davr=${encodeURIComponent(oy)}`}><Upload size={14} /> {t('+ F2 yuklash')}</a>
        <button type="button" onClick={() => void (sh ? shartnomaPaketiniYuklash() : paketniYukla())} disabled={!!band || !tanlanganlar.length}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)] disabled:opacity-50">
          <Download size={14} /> {band === 'paket' ? t('Paket yig‘ilmoqda…') : t('Paketni yuklab olish ({n})', { n: tanlanganlar.length })}</button>
        {sh && <button type="button" onClick={() => void topshirish()} disabled={!!band || !tanlanganlar.length || !tanlanganShartnoma || oraliq}
          title={oraliq ? t('Topshirish faqat bitta oy uchun') : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[12px] font-semibold text-accent disabled:opacity-50">
          {band === 'topshir' ? t('Topshirilmoqda…') : t('Topshirildi')}</button>}
      </span>
    </div>
    {oraliq && <p role="status" className="text-[11.5px] text-text-dim">{t('Davr: {d} — {n} oy; ZIP da har oy o‘z papkasida, akt-sverka va davr svodi ildizda.', { d: davrMatn, n: paketOylari.length })}</p>}
    {sh && !oraliq && eskirish?.eskirgan && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/50 bg-warn/10 p-2 text-[12px]">
      <AlertTriangle size={14} className="text-warn" />
      <b className="text-warn">{t('Paket eskirgan — qayta yig‘ing')}</b>
      <span className="text-text-dim">{t('v{n} topshirilgandan keyin {k} ta obyektda F2 yoki fakt o‘zgargan. Eski nusxa arxivda qoladi.', { n: eskirish.paket.versiya, k: eskirish.farq.length })}</span>
      <button type="button" onClick={() => void topshirish()} disabled={!!band || !tanlanganlar.length} className="ml-auto rounded-lg bg-warn px-3 py-1.5 font-semibold text-[color:var(--on-accent)] disabled:opacity-50">
        {band === 'topshir' ? t('Topshirilmoqda…') : t('Qayta yig‘ish')}</button>
    </div>}
    {sh && !oraliq && eskirish && !eskirish.eskirgan && <p role="status" className="text-[11.5px] text-ok">{t('Topshirilgan paket (v{n}) dolzarb — manba F2 o‘zgarmagan.', { n: eskirish.paket.versiya })}</p>}
    {sh && shartnomaId != null && paketOylari.length > 0 && <div className="flex flex-wrap items-center gap-2 text-[11.5px]" aria-label={t('Forma-3 holati')}>
      <span className="text-text-dim">{t('Forma-3:')}</span>
      {paketOylari.map((m) => { const h = oyF3Holati(svod, shartnomaId, m);
        return <span key={m} className={`rounded px-1.5 py-0.5 ${F3_HOLAT_RANG[h]}`} data-testid={`f3-holat-${m}`}>{m}: {t(F3_HOLAT_NOMI[h])}
          {h !== 'saqlangan' && f3SaqlashHref(m) && <a className="ml-1 underline" href={f3SaqlashHref(m)!}>{t('Forma-3 ni saqlash')}</a>}</span>; })}
    </div>}
    {f3Ogoh.length > 0 && <div role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-2 text-[12px]">
      <b className="text-warn">{t('Forma-3 rekvizitlari yetishmaydi (hujjat mavjud ma’lumot bilan yasaldi):')}</b>
      <ul className="mt-1 list-disc pl-5">{f3Ogoh.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>}
    {sh && tayyorgarlik && <TayyorgarlikJadvali qatorlar={tayyorgarlik.qatorlar} />}

    {f3Xabar && <p role="status" className="text-[11.5px] text-text-dim">{f3Xabar}</p>}
    {hisoblanmoqda && <p role="status" className="text-[11.5px] text-text-mute">{t('Summalar (ustamali, QQS) hisoblanmoqda…')}</p>}

    {rows.length === 0 ? <p className="text-text-mute">{t('Bu oyda F2 yo‘q.')}</p> : <div className="overflow-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[1100px] text-[12.5px]">
        <thead className="bg-surface-2/60 text-left text-[11px] text-text-dim"><tr>
          <th className="w-8 px-2 py-2"><input type="checkbox" aria-label={t('Hammasini tanlash')} checked={tanlov.size === rows.length} onChange={(e) => setTanlov(e.target.checked ? new Set(rows.map((r) => r.akt.id)) : new Set())} /></th>
          {oraliq && <th className={sarlavha}>{t('Oy')}</th>}
          <th className={sarlavha}>{t('Obyekt')}</th><th className={sarlavha}>{t('F2 raqami')}</th><th className={sarlavha}>{t('Manba')}</th><th className={sarlavha}>{t('Holat')}</th>
          <th className={`${sarlavha} text-right`}>{t('Jami (QQS bilan)')}</th><th className={`${sarlavha} text-right`}>{t('QQS {n}%', { n: NDS_FOIZ })}</th>
          <th className={`${sarlavha} text-right`}>{t('Ustamali (ИТОГО-4)')}</th><th className={`${sarlavha} text-right`}>{t('Ustamasiz')}</th>
          <th className={sarlavha}>{t('Amallar')}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const m = r.moliya;
            const tahrir = r.akt.holat === 'qoralama' && (r.akt.lifecycle_status ?? 'draft') === 'draft';
            const q = `obyekt=${r.akt.obyekt_id}&akt=${r.akt.id}`;
            return <tr key={r.akt.id} className="border-t border-border/60 align-top hover:bg-surface-2/40">
              <td className="px-2 py-2"><input type="checkbox" aria-label={t('F2 ni paketga kiritish')} checked={tanlov.has(r.akt.id)} onChange={(e) => belgila(r.akt.id, e.target.checked)} /></td>
              {oraliq && <td className="whitespace-nowrap px-2 py-2">{oyKaliti(r.akt.oy) ?? '—'}</td>}
              <td className="px-2 py-2"><div className="font-medium text-text">{r.obyektNom}</div>{r.loyiha && <div className="text-[11px] text-text-mute">{r.loyiha}</div>}</td>
              <td className="px-2 py-2">{r.akt.raqam?.trim() ? `№ ${r.akt.raqam}` : <span className="text-warn">{t('raqamsiz')}</span>}</td>
              <td className="px-2 py-2">{r.akt.manba === 'import' ? <span className="text-text-dim">{t('Import')}</span> : r.akt.manba === 'tizim' ? <span className="text-accent">{t('Tizimda')}</span> : <span className="text-warn">{t('aniqlanmadi')}</span>}</td>
              <td className={`px-2 py-2 ${BOSQICH_RANG[r.bosqich]}`}>{t(BOSQICH_NOMI[r.bosqich])}</td>
              <td className="px-2 py-2 text-right font-semibold">{m || r.moliyaXato ? <SonKatak v={m?.jami} /> : <span className="text-text-mute">…</span>}</td>
              <td className="px-2 py-2 text-right">{m || r.moliyaXato ? <SonKatak v={m?.nds} /> : <span className="text-text-mute">…</span>}</td>
              <td className="px-2 py-2 text-right">{m || r.moliyaXato ? <SonKatak v={m?.ustamali} taxminiy={m?.taxminiy} /> : <span className="text-text-mute">…</span>}</td>
              <td className="px-2 py-2 text-right"><SonKatak v={m ? m.ustamasiz : r.akt.hujjat_jami} /></td>
              <td className="whitespace-nowrap px-2 py-2">
                <a className="mr-2 text-accent underline" href={`/admin/f2-tarix?obyekt=${r.akt.obyekt_id}`}>{t('Ochish')}</a>
                {tahrir && (r.akt.manba === 'import'
                  ? <a className="mr-2 text-accent underline" href={`/admin/f2?${q}`}>✎ {t('Tahrirlash')}</a>
                  : <><a className="mr-2 text-accent underline" href={`/admin/f2-tayyorlash?${q}`}>✎ {t('Tizimda tahrirlash')}</a><a className="mr-2 text-accent underline" href={`/admin/f2?${q}`}>⬆ {t('Fayldan yangilash')}</a></>)}
                <button type="button" onClick={() => void birExcel(r)} disabled={!!band} className="text-accent underline disabled:opacity-50">{band === `akt:${r.akt.id}` ? '…' : 'Excel'}</button>
              </td>
            </tr>;
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-surface-2/40 text-[12.5px] font-semibold">
          <tr><td colSpan={oraliq ? 2 : 1} /><td className="px-2 py-2" colSpan={4}>{oraliq ? t('Davr jami — barcha F2 ({n} ta)', { n: jamiHammasi.soni }) : t('Oy jami — barcha F2 ({n} ta)', { n: jamiHammasi.soni })}</td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.jami} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.nds} /></td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.ustamali} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.ustamasiz} /></td><td /></tr>
          <tr><td colSpan={oraliq ? 2 : 1} /><td className="px-2 py-2" colSpan={4}>{t('Paketga tanlanganlar ({n} ta)', { n: jamiTanlangan.soni })}</td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.jami} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.nds} /></td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.ustamali} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.ustamasiz} /></td><td /></tr>
        </tfoot>
      </table>
    </div>}

    {tekshiruvlar.length > 0 && <div className="rounded-lg border border-warn/40 bg-warn/5 p-3">
      <p className="font-semibold text-warn">{t('Tekshiruvlar ({n}) — paketni bloklamaydi', { n: tekshiruvlar.length })}</p>
      <ul className="mt-1 space-y-0.5 text-[12px]">
        {tekshiruvlar.map((x, i) => <li key={i}><b>{x.obyektNom}</b> · F2 № {x.raqam ?? '—'}: {t(TEKSHIRUV_MATNI[x.kod])}{tafsilotMatni(x) ? ` (${tafsilotMatni(x)})` : ''}</li>)}
      </ul>
    </div>}
    {sh && <PaketArxivi kompaniyaId={kompaniyaId} shartnomaId={shartnomaId} yangilash={arxivVer} />}
  </section>;
}

/**
 * F2 reestri sahifasidagi bo'lim: sukut bo'yicha yig'iq — obyektlar bo'yicha qatorlar/summalar faqat ochilganda o'qiladi
 * (reestr sahifasi yengil qoladi). `?paket=1` bilan to'g'ridan-to'g'ri ochiladi.
 */
export function F2OylikPaket(p: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null; yangila?: () => void }) {
  const [ochiq, setOchiq] = useState(() => { try { return new URLSearchParams(window.location.search).get('paket') === '1'; } catch { return false; } });
  if (!ochiq) {
    return <section className="karta flex flex-wrap items-center gap-3 p-3 text-[12px]" aria-label={t('Shartnoma oylik paketi')}>
      <div className="min-w-[200px] flex-1"><p className="text-[13px] font-semibold text-text">{t('Shartnoma oylik paketi')}</p>
        <p className="text-[11px] text-text-mute">{t('Oy bo‘yicha barcha F2 lar, oy jami, tekshiruvlar va bitta ZIP paket')}</p></div>
      <button type="button" onClick={() => setOchiq(true)} className="rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)]">{t('Oylik paketni tayyorlash')}</button>
    </section>;
  }
  return <div className="flex flex-col gap-1">
    <PaketIchi {...p} />
    <button type="button" onClick={() => setOchiq(false)} className="self-end text-[11px] text-text-mute underline">{t('Yig‘ish')}</button>
  </div>;
}
