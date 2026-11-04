/**
 * OYLIK F2 PAKETI (egasi 2026-10-25): tanlangan oyning barcha F2 lari obyektlar bo'yicha, oy jami, tekshiruvlar (bloklamaydi)
 * va bitta ZIP — F2 Excel lari + oylik reestr/svod + shu oy Forma-3 lari. F2 reestri sahifasining bo'limi (yangi menyu yo'q).
 * Summa NDS SIZ (ustamasiz va ustamali = ИТОГО-4), NDS alohida; noma'lum summa «noma'lum» (0 emas). Hamma hisob — lib/f2-oylik-paket.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import type { ReestrMalumot } from '../../api/t2-f2-reestr';
import { oyObyektOl, f3SvodOl } from '../../api/f2-oylik-paket';
import { tokenBilan, mazmunXeshi } from '../../api/t2-token';
import { f2HujjatKaliti } from '../../api/f2-hujjat-kontekst';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { Forma3ShaklTanlagich } from '../../components/forma3/Forma3ShaklTanlagich';
import { f3PaketTanlovOl, f3PaketTanlovSaqla, forma3SotuvFayllari, type PaketF3Tanlov } from '../../lib/forma3-shakl-tanlov';
import { hujjatFaylNomi } from '../../lib/hujjat-yozuvchi';
import { oylikReestrXlsx, paketTarkibiMatni, paketZip, tarkibBaytlari, TARKIB_FAYL_NOMI } from '../../lib/f2-oylik-paket/eksport';
import { NDS_SUKUT_FOIZ, sverkaXlsx } from '../../lib/nakopitelniy-vedomost-export';
import { obyektHujjatlariniYigish, type ObyektHujjatlariNatija } from '../../lib/oylik-hujjat/paket';
import { paketImzosiOl } from '../../lib/oylik-hujjat/ostatka-slichitelniy';
import { pudratchiNomiOl } from '../../lib/oylik-hujjat/m29';
import {
  barchaShartnomalar, manifestQur, shartnomaObyektlari, shartnomaPaketYigish, sha256Hex, tayyorgarlikHisobla,
  type Forma3Holat, type KirishFayl, type M29Holat, type YaratilganHujjatlar,
} from '../../lib/f2-oylik-paket/shartnoma';
import type { SvodShartnoma } from '../../lib/nakopitelniy-svod';
import { oyFaktSoni, oyM29Holati, oylikPaketniTopshir, paketZipniSaqla, yangiTopshirishId } from '../../api/t2-shartnoma-oylik-paket';
import { TayyorgarlikJadvali } from '../../components/oylik-paket/TayyorgarlikJadvali';
import { PaketArxivi } from '../../components/oylik-paket/PaketArxivi';
import {
  NDS_FOIZ, aktExcel, aktHisob, mavjudOylar, oyAktlari, oyF3lar, oyJami, oyKaliti, paketFayllari, paketTekshiruvlari, sukutTanlov,
  type OyObyekt, type PaketAkt, type PaketFayl, type PaketFaylTuri, type Tekshiruv, type TekshiruvKodi,
} from '../../lib/f2-oylik-paket/oylik';
import type { Summa } from '../../lib/f2-reestr/reestr';

const pul = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BOSQICH_NOMI = { tasdiqlangan: 'Tasdiqlangan', jarayonda: 'Tekshirilmoqda / qoralama', rad: 'Rad etilgan', bekor: 'Bekor qilingan' } as const;
const BOSQICH_RANG = { tasdiqlangan: 'text-ok', jarayonda: 'text-warn', rad: 'text-danger', bekor: 'text-text-mute' } as const;

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

function PaketIchi({ kompaniyaId, malumot, tashkilot }: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null }) {
  const oylar = useMemo(() => mavjudOylar(malumot.aktlar), [malumot]);
  const [oy, setOy] = useState(() => oylar[0] ?? new Date().toISOString().slice(0, 7));
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
  const obyektKesh = useRef(new Map<string, Promise<OyObyekt>>());
  const versiya = useRef(0);
  // Shartnoma rejimi (egasi 2026-11-03): bir shartnoma x bir oy. Shartnomalar bo'lmasa — eski loyiha rejimi.
  const shartnomalarRoyxati = useMemo(() => barchaShartnomalar(malumot), [malumot]);
  const [rejim, setRejim] = useState<'shartnoma' | 'loyiha'>(() => (barchaShartnomalar(malumot).length ? 'shartnoma' : 'loyiha'));
  const [faktSoni, setFaktSoni] = useState<Map<number, number | null>>(new Map());
  const [m29, setM29] = useState<Map<number, M29Holat>>(new Map());
  const [svod, setSvod] = useState<SvodShartnoma[] | null | undefined>(undefined);
  const [arxivVer, setArxivVer] = useState(0);
  /** Paketda HAQIQATAN yaratilgan obyekt hujjatlari (Nakopitelniy / M-29 / Ostatka / Slichitelniy): «Tayyorgarlik» katagi shundan. */
  const [yaratilgan, setYaratilgan] = useState<YaratilganHujjatlar>(new Map());
  const topshirishId = useRef<string | null>(null);
  const sh = rejim === 'shartnoma';

  useEffect(() => { obyektKesh.current = new Map(); setHisoblar(new Map()); }, [kompaniyaId, malumot]);
  useEffect(() => { setYaratilgan(new Map()); }, [oy, shartnomaId, rejim, kompaniyaId]);

  const loyihalar = useMemo(() => [...malumot.loyihalar].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'ru')), [malumot]);
  const shartnomalar = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of malumot.obyektlar) {
      if (loyihaId != null && o.loyiha_id !== loyihaId) continue;
      for (const s of malumot.shartnomalar.get(o.id) ?? []) m.set(s.id, `№ ${s.raqam}${s.nom ? ` · ${s.nom}` : ''}`);
    }
    return [...m].map(([id, nom]) => ({ id, nom }));
  }, [malumot, loyihaId]);
  useEffect(() => { if (!sh && shartnomaId != null && !shartnomalar.some((s) => s.id === shartnomaId)) setShartnomaId(null); }, [shartnomalar, shartnomaId, sh]);
  useEffect(() => { if (sh && shartnomaId == null && shartnomalarRoyxati.length) setShartnomaId(shartnomalarRoyxati[0].id); }, [sh, shartnomaId, shartnomalarRoyxati]);
  const tanlanganShartnoma = sh && shartnomaId != null ? shartnomalarRoyxati.find((s) => s.id === shartnomaId) ?? null : null;
  const shObyektlar = useMemo(() => (sh && shartnomaId != null ? shartnomaObyektlari(malumot, shartnomaId) : []), [malumot, sh, shartnomaId]);

  const asos = useMemo(() => oyAktlari(malumot, { oy, loyihaId: sh ? null : loyihaId, shartnomaId }), [malumot, oy, loyihaId, shartnomaId, sh]);
  const rows: PaketAkt[] = useMemo(() => asos.map((r) => {
    const h = hisoblar.get(r.akt.id);
    return h ? { ...r, moliya: h.moliya, uchastkalar: h.uchastkalar, moliyaXato: h.xato } : r;
  }), [asos, hisoblar]);
  const asosKalit = asos.map((r) => r.akt.id).join(',');

  // Tanlov: har oy/filtr o'zgarganda sukut — faqat tasdiqlanganlar.
  useEffect(() => { setTanlov(sukutTanlov(asos)); }, [asosKalit]); // eslint-disable-line react-hooks/exhaustive-deps

  const obyektYukla = useCallback((obyektId: number, aktOylari: string[]): Promise<OyObyekt> => {
    const kalit = `${obyektId}|${[...new Set(aktOylari)].sort().join(',')}`;
    let p = obyektKesh.current.get(kalit);
    if (!p) {
      p = oyObyektOl(kompaniyaId, obyektId, [...new Set(aktOylari)]).catch((e) => { obyektKesh.current.delete(kalit); throw e; });
      obyektKesh.current.set(kalit, p);
    }
    return p;
  }, [kompaniyaId]);

  // Har obyekt bir marta o'qiladi (smeta + F2 qatorlari + ustama), keyin har aktning summalari hisoblanadi.
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
            const m = await obyektYukla(obyektId, aktlar.map((r) => r.akt.oy));
            for (const r of aktlar) { const h = aktHisob(m, r.akt); yangi.set(r.akt.id, { moliya: h.moliya, uchastkalar: h.uchastkalar, xato: false }); }
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

  // Tayyorgarlik uchun: shartnoma obyektlarining fakt aktlari soni, M-29 holati va shartnoma svodi (Forma-3 / akt-sverka). Hammasi faqat o'qish.
  const shObyektKalit = shObyektlar.map((o) => o.id).join(',');
  useEffect(() => {
    if (!sh || !shObyektlar.length) return;
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
  }, [sh, shObyektKalit, oy]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sh) return;
    let faol = true;
    setSvod(undefined);
    void f3SvodOl(kompaniyaId).then((s) => { if (faol) setSvod(s); }, () => { if (faol) setSvod(null); });
    return () => { faol = false; };
  }, [sh, kompaniyaId, arxivVer]);
  const f3Holat: Forma3Holat | null = useMemo(() => {
    if (!sh || shartnomaId == null || !svod) return null;
    const f = oyF3lar(svod, new Set([shartnomaId]), oy);
    return { tayyor: f.tayyor.length, qoralama: f.qoralama };
  }, [sh, shartnomaId, svod, oy]);
  const tayyorgarlik = useMemo(() => (sh ? tayyorgarlikHisobla({ obyektlar: shObyektlar, aktlar: rows, faktSoni, m29, forma3: f3Holat, tekshiruvlar, yaratilgan }) : null),
    [sh, shObyektlar, rows, faktSoni, m29, f3Holat, tekshiruvlar, yaratilgan]);

  /** Shartnoma paketini yig'adi (hujjatlar token bilan; xatolar paketni to'xtatmaydi - ПАКЕТ_СОСТАВ.txt ga yoziladi). */
  async function shartnomaPaketiniYigish() {
    if (!tanlanganShartnoma) return null;
    const otkazilgan: string[] = [];
    const obyektFayllari = new Map<number, KirishFayl[]>();
    const ildiz: KirishFayl[] = [];
    for (const r of tanlanganlar) {
      const belgi = `${r.obyektNom} · F2 № ${r.akt.raqam ?? '—'}`;
      try {
        const x = await f2Fayl(r);
        if ('fayl' in x) obyektFayllari.set(r.akt.obyekt_id, [...(obyektFayllari.get(r.akt.obyekt_id) ?? []), { nom: x.fayl.nom, bytes: x.fayl.bytes, tur: 'f2', obyektId: r.akt.obyekt_id }]);
        else otkazilgan.push(`${belgi}: ${x.xato}`);
      } catch { otkazilgan.push(`${belgi}: ${t('Ф-2 hujjatini yaratib bo‘lmadi.')}`); }
    }
    // Obyekt hujjatlari (Nakopitelniy, M-29, Ostatka, Slichitelniy): sahifalar bilan bir xil yuklagich/quruvchi (lib/oylik-hujjat), token bilan.
    const yangiYaratilgan = new Map<number, ObyektHujjatlariNatija['kataklar']>();
    const hujjatObyektlari = shObyektlar.filter((o) => tanlanganlar.some((r) => r.akt.obyekt_id === o.id));
    const pudratchi = await pudratchiNomiOl(kompaniyaId).catch(() => null);
    for (const o of hujjatObyektlari) {
      const imzo = await paketImzosiOl(kompaniyaId, o.id);
      const x = await obyektHujjatlariniYigish({ kompaniyaId, obyekt: { id: o.id, nom: o.nom }, oy, imzo, ndsFoiz: NDS_SUKUT_FOIZ, pudratchi,
        tokenla: async (q) => { const r = await hujjatTokenBilan({ kompaniyaId, bytes: q.bytes, hujjat: q.hujjat, sabab: q.sabab, obyekt: q.obyektId }, () => undefined); return r.ok ? { ok: true } : { ok: false, xabar: r.xabar }; } });
      if (x.fayllar.length) obyektFayllari.set(o.id, [...(obyektFayllari.get(o.id) ?? []), ...x.fayllar]);
      otkazilgan.push(...x.otkazilgan);
      yangiYaratilgan.set(o.id, x.kataklar);
    }
    setYaratilgan(yangiYaratilgan);
    const tayyorgarlikQatorlari = tayyorgarlikHisobla({ obyektlar: shObyektlar, aktlar: rows, faktSoni, m29, forma3: f3Holat, tekshiruvlar, yaratilgan: yangiYaratilgan }).qatorlar;
    const reestr = oylikReestrXlsx(tanlanganlar, { oy, tashkilot, loyiha: null });
    const rt = await hujjatTokenBilan({ kompaniyaId, bytes: reestr.bytes, hujjat: 'F2_OYLIK_REESTR', sabab: `Реестр и свод Ф-2 · договор № ${tanlanganShartnoma.raqam} · ${oy}` }, () => undefined);
    if (rt.ok) ildiz.push({ nom: reestr.faylNomi, bytes: reestr.bytes, tur: 'reestr' }); else otkazilgan.push(`${t('Oylik reestr')}: ${rt.xabar}`);
    const svodOl = svod ?? await f3SvodOl(kompaniyaId);
    const shSvod = svodOl?.find((x) => x.id === tanlanganShartnoma.id) ?? null;
    if (!shSvod) otkazilgan.push(`Forma-3 / ${t('Akt-sverka')}: ${t('shartnoma svodi o‘qilmadi')}`);
    else {
      for (const { sh: s, f3: x } of oyF3lar(svodOl!, new Set([tanlanganShartnoma.id]), oy).tayyor) {
        for (const h of forma3SotuvFayllari(s, x.id, f3Tanlov, { tashkilot })) {
          const q = await hujjatTokenBilan({ kompaniyaId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3${h.shakl === 'bir_qatorli' ? ' (одностр.)' : ''} · № ${s.raqam} · ${x.sotuv_sana}` }, () => undefined);
          if (q.ok) ildiz.push({ nom: h.faylNomi, bytes: h.bytes, tur: 'forma3' }); else otkazilgan.push(`Forma-3 № ${x.raqam ?? x.id}: ${q.xabar}`);
        }
      }
      const [yy, mm] = oy.split('-').map(Number);
      const oyOxiri = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
      const sv = sverkaXlsx(shSvod, { tashkilot, gacha: oyOxiri });
      const st = await hujjatTokenBilan({ kompaniyaId, bytes: sv.bytes, hujjat: 'AKT_SVERKA', sabab: `Акт сверки · договор № ${shSvod.raqam} · ${oy}` }, () => undefined);
      if (st.ok) ildiz.push({ nom: sv.faylNomi, bytes: sv.bytes, tur: 'sverka' }); else otkazilgan.push(`${t('Akt-sverka')}: ${st.xabar}`);
    }
    const jamlangan = shartnomaPaketYigish({ obyektlar: shObyektlar, obyektFayllari, shartnomaFayllari: ildiz });
    if (!jamlangan.length) return { bosh: true as const, otkazilgan };
    const tarkib = paketTarkibiMatni({ oy, fayllar: jamlangan, tekshiruvlar: tekshiruvlar.filter((x) => tanlov.has(x.aktId)), otkazilgan, shartnoma: { raqam: tanlanganShartnoma.raqam, nom: tanlanganShartnoma.nom } });
    const manifest = await manifestQur({ oy, shartnoma: tanlanganShartnoma, fayllar: jamlangan, tarkib: { yol: TARKIB_FAYL_NOMI, bytes: tarkibBaytlari(tarkib) },
      aktlar: tanlanganlar, obyektlar: shObyektlar, tayyorgarlik: tayyorgarlikQatorlari, kirmadi: otkazilgan });
    const zip = paketZip(jamlangan, tarkib);
    const zipNom = hujjatFaylNomi({ obyekt: tashkilot ?? undefined, hujjat: `ПАКЕТ_${tanlanganShartnoma.raqam}`, davr: oy, kengaytma: 'zip' });
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

  /** «Topshirildi»: paketni yig'ib kanonik saqlashga yuklaydi va yangi versiya yozadi (hech narsani bloklamaydi - faqat ogohlantiradi). */
  async function topshirish() {
    if (band || !tanlanganShartnoma || !tanlanganlar.length) return;
    setBand('topshir');
    topshirishId.current ??= yangiTopshirishId();
    try {
      const x = await shartnomaPaketiniYigish();
      if (!x || x.bosh) { toast(t('Paketga hech narsa kirmadi'), 'danger'); return; }
      // ZIP o'zi hisoblangan katak sanamaydi (ichidagi hujjatlar yuqorida to'langan); bir xil bayt qayta yuklansa - bepul.
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes: x.zip, hujjat: 'SHARTNOMA_OYLIK_PAKET', sabab: `Пакет по договору № ${tanlanganShartnoma.raqam} · ${oy}`, yacheykalar: 0 }, () => undefined);
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

  /** Bitta F2 Excel i: token F2 tarixidagi bilan bir xil kalit (bir F2 — bir marta to'lov, qayta chiqarish bepul). */
  async function f2Fayl(r: PaketAkt): Promise<{ fayl: { nom: string; bytes: Uint8Array } } | { xato: string }> {
    const m = await obyektYukla(r.akt.obyekt_id, [r.akt.oy]);
    const h = aktExcel(m, r.akt, r.obyektNom);
    if (!h) return { xato: t('chiqariladigan qator yo‘q') };
    const xesh = f2HujjatKaliti(r.akt.obyekt_id, r.akt.oy || '', r.akt.raqam) ?? `akt:${r.akt.id}:${await mazmunXeshi(h.bytes)}`;
    const q = await tokenBilan({ kompaniyaId, amal: 'f2_hujjat', birlikSoni: h.yacheykalar,
      meta: { hujjat: 'F2', sabab: `F2 №${r.akt.raqam || '—'} · ${r.obyektNom} · ${(r.akt.oy || '').slice(0, 7)}`.slice(0, 200), obyekt: r.akt.obyekt_id, akt: r.akt.id, yacheyka: h.yacheykalar, xesh } }, async () => true);
    return q.ok ? { fayl: { nom: h.faylNomi, bytes: h.bytes } } : { xato: q.xabar };
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

  async function paketniYukla() {
    if (band || !tanlanganlar.length) return;
    setBand('paket'); setF3Xabar('');
    const fayllar: Array<{ papka: string; nom: string; bytes: Uint8Array; tur: PaketFaylTuri }> = [];
    const otkazilgan: string[] = [];
    try {
      // 1) har F2 ning Excel i
      for (const r of tanlanganlar) {
        const belgi = `${r.obyektNom} · F2 № ${r.akt.raqam ?? '—'}`;
        try {
          const x = await f2Fayl(r);
          if ('fayl' in x) fayllar.push({ papka: 'F2', nom: x.fayl.nom, bytes: x.fayl.bytes, tur: 'f2' }); else otkazilgan.push(`${belgi}: ${x.xato}`);
        } catch { otkazilgan.push(`${belgi}: ${t('Ф-2 hujjatini yaratib bo‘lmadi.')}`); }
      }
      // 2) oylik reestr + svod
      const loyihaNomi = loyihaId != null ? malumot.loyihalar.get(loyihaId) ?? null : null;
      const reestr = oylikReestrXlsx(tanlanganlar, { oy, tashkilot, loyiha: loyihaNomi });
      const rt = await hujjatTokenBilan({ kompaniyaId, bytes: reestr.bytes, hujjat: 'F2_OYLIK_REESTR', sabab: `Oylik F2 reestri · ${oy}` }, () => undefined);
      if (rt.ok) fayllar.push({ papka: '', nom: reestr.faylNomi, bytes: reestr.bytes, tur: 'reestr' }); else otkazilgan.push(`${t('Oylik reestr')}: ${rt.xabar}`);
      // 3) Forma-3 (shu oyning tayyor sotuv F3 lari)
      const shIdlar = new Set(tanlanganlar.flatMap((r) => (malumot.shartnomalar.get(r.akt.obyekt_id) ?? []).map((s) => s.id)));
      if (shIdlar.size) {
        const svod = await f3SvodOl(kompaniyaId);
        if (!svod) { otkazilgan.push(`Forma-3: ${t('shartnoma svodi o‘qilmadi')}`); }
        else {
          const f3 = oyF3lar(svod, shIdlar, oy);
          for (const { sh, f3: x } of f3.tayyor) {
            for (const h of forma3SotuvFayllari(sh, x.id, f3Tanlov, { tashkilot })) {
              const q = await hujjatTokenBilan({ kompaniyaId, bytes: h.bytes, hujjat: 'F3', sabab: `Форма №3${h.shakl === 'bir_qatorli' ? ' (одностр.)' : ''} · № ${sh.raqam} · ${x.sotuv_sana}` }, () => undefined);
              if (q.ok) fayllar.push({ papka: 'Forma-3', nom: h.faylNomi, bytes: h.bytes, tur: 'forma3' }); else otkazilgan.push(`Forma-3 № ${x.raqam ?? x.id}: ${q.xabar}`);
            }
          }
          setF3Xabar(f3.tayyor.length || f3.qoralama
            ? t('Forma-3: paketga {n} ta kirdi, qoralamada qolgan: {q}', { n: f3.tayyor.length, q: f3.qoralama })
            : t('Bu oy uchun tayyor Forma-3 yo‘q — paketga kirmadi.'));
        }
      } else setF3Xabar(t('Tanlangan obyektlarga shartnoma biriktirilmagan — Forma-3 paketga kirmadi.'));
      if (!fayllar.length) { toast(t('Paketga hech narsa kirmadi'), 'danger'); return; }
      const jamlangan: PaketFayl[] = paketFayllari(fayllar);
      const tarkib = paketTarkibiMatni({ oy, fayllar: jamlangan, tekshiruvlar: tekshiruvlar.filter((x) => tanlov.has(x.aktId)), otkazilgan });
      const zip = paketZip(jamlangan, tarkib);
      downloadBlob(zip, hujjatFaylNomi({ obyekt: tashkilot ?? undefined, hujjat: 'ПАКЕТ_Ф-2', davr: oy, kengaytma: 'zip' }));
      toast(otkazilgan.length ? t('Paket yuklandi; {n} ta hujjat kirmadi (ZIP ichidagi ПАКЕТ_СОСТАВ.txt ga qarang)', { n: otkazilgan.length }) : t('Paket yuklandi'), otkazilgan.length ? 'warn' : 'ok');
    } catch { toast(t('Paketni yig‘ib bo‘lmadi.'), 'danger'); }
    finally { setBand(null); }
  }

  const sarlavha = 'px-2 py-2';
  return <section className="karta flex flex-col gap-3 p-3 text-[12px]" aria-label={t('Shartnoma oylik paketi')}>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[160px]"><p className="text-[13px] font-semibold text-text">{t('Shartnoma oylik paketi')}</p>
        <p className="text-[11px] text-text-mute">{t('Summalar NDS siz; NDS {n}% oxirida alohida', { n: NDS_FOIZ })}</p></div>
      {shartnomalarRoyxati.length > 0 && <label>{t('Rejim')}
        <select aria-label={t('Rejim')} value={rejim} onChange={(e) => { const v = e.target.value as 'shartnoma' | 'loyiha'; setRejim(v); if (v === 'shartnoma') setLoyihaId(null); else setShartnomaId(null); }} className="input mt-1 block h-8">
          <option value="shartnoma">{t('Shartnoma bo‘yicha')}</option><option value="loyiha">{t('Loyiha bo‘yicha')}</option></select></label>}
      <label>{t('Oy')}
        <input type="month" aria-label={t('Hisobot oyi')} value={oy} onChange={(e) => { if (oyKaliti(e.target.value)) setOy(e.target.value.slice(0, 7)); }} className="input mt-1 block h-8" /></label>
      {!sh && <label>{t('Loyiha')}
        <select aria-label={t('Loyiha')} value={loyihaId ?? ''} onChange={(e) => setLoyihaId(e.target.value ? Number(e.target.value) : null)} className="input mt-1 block h-8 max-w-[220px]">
          <option value="">{t('Hammasi')}</option>{loyihalar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>}
      <label>{t('Shartnoma')}
        <select aria-label={t('Shartnoma')} value={shartnomaId ?? ''} onChange={(e) => setShartnomaId(e.target.value ? Number(e.target.value) : null)} className="input mt-1 block h-8 max-w-[220px]">
          {!sh && <option value="">{t('Hammasi')}</option>}
          {(sh ? shartnomalarRoyxati.map((s) => ({ id: s.id, nom: `№ ${s.raqam}${s.nom ? ` · ${s.nom}` : ''}` })) : shartnomalar).map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></label>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <Forma3ShaklTanlagich paket qiymat={f3Tanlov} onChange={f3TanlovOzgar} disabled={!!band} />
        <a className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px]" href={`/admin/f2?davr=${encodeURIComponent(oy)}`}><Upload size={14} /> {t('+ F2 yuklash')}</a>
        <button type="button" onClick={() => void (sh ? shartnomaPaketiniYuklash() : paketniYukla())} disabled={!!band || !tanlanganlar.length}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-[color:var(--on-accent)] disabled:opacity-50">
          <Download size={14} /> {band === 'paket' ? t('Paket yig‘ilmoqda…') : t('Paketni yuklab olish ({n})', { n: tanlanganlar.length })}</button>
        {sh && <button type="button" onClick={() => void topshirish()} disabled={!!band || !tanlanganlar.length || !tanlanganShartnoma}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[12px] font-semibold text-accent disabled:opacity-50">
          {band === 'topshir' ? t('Topshirilmoqda…') : t('Topshirildi')}</button>}
      </span>
    </div>
    {sh && tayyorgarlik && <TayyorgarlikJadvali qatorlar={tayyorgarlik.qatorlar} />}

    {f3Xabar && <p role="status" className="text-[11.5px] text-text-dim">{f3Xabar}</p>}
    {hisoblanmoqda && <p role="status" className="text-[11.5px] text-text-mute">{t('Summalar (ustamali, NDS) hisoblanmoqda…')}</p>}

    {rows.length === 0 ? <p className="text-text-mute">{t('Bu oyda F2 yo‘q.')}</p> : <div className="overflow-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[1100px] text-[12.5px]">
        <thead className="bg-surface-2/60 text-left text-[11px] text-text-dim"><tr>
          <th className="w-8 px-2 py-2"><input type="checkbox" aria-label={t('Hammasini tanlash')} checked={tanlov.size === rows.length} onChange={(e) => setTanlov(e.target.checked ? new Set(rows.map((r) => r.akt.id)) : new Set())} /></th>
          <th className={sarlavha}>{t('Obyekt')}</th><th className={sarlavha}>{t('F2 raqami')}</th><th className={sarlavha}>{t('Manba')}</th><th className={sarlavha}>{t('Holat')}</th>
          <th className={`${sarlavha} text-right`}>{t('Ustamasiz')}</th><th className={`${sarlavha} text-right`}>{t('Ustamali (ИТОГО-4)')}</th>
          <th className={`${sarlavha} text-right`}>{t('NDS {n}%', { n: NDS_FOIZ })}</th><th className={`${sarlavha} text-right`}>{t('Jami (NDS bilan)')}</th>
          <th className={sarlavha}>{t('Amallar')}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const m = r.moliya;
            const tahrir = r.akt.holat === 'qoralama' && (r.akt.lifecycle_status ?? 'draft') === 'draft';
            const q = `obyekt=${r.akt.obyekt_id}&akt=${r.akt.id}`;
            return <tr key={r.akt.id} className="border-t border-border/60 align-top hover:bg-surface-2/40">
              <td className="px-2 py-2"><input type="checkbox" aria-label={t('F2 ni paketga kiritish')} checked={tanlov.has(r.akt.id)} onChange={(e) => belgila(r.akt.id, e.target.checked)} /></td>
              <td className="px-2 py-2"><div className="font-medium text-text">{r.obyektNom}</div>{r.loyiha && <div className="text-[11px] text-text-mute">{r.loyiha}</div>}</td>
              <td className="px-2 py-2">{r.akt.raqam?.trim() ? `№ ${r.akt.raqam}` : <span className="text-warn">{t('raqamsiz')}</span>}</td>
              <td className="px-2 py-2">{r.akt.manba === 'import' ? <span className="text-text-dim">{t('Import')}</span> : r.akt.manba === 'tizim' ? <span className="text-accent">{t('Tizimda')}</span> : <span className="text-warn">{t('aniqlanmadi')}</span>}</td>
              <td className={`px-2 py-2 ${BOSQICH_RANG[r.bosqich]}`}>{t(BOSQICH_NOMI[r.bosqich])}</td>
              <td className="px-2 py-2 text-right"><SonKatak v={m ? m.ustamasiz : r.akt.hujjat_jami} /></td>
              <td className="px-2 py-2 text-right">{m || r.moliyaXato ? <SonKatak v={m?.ustamali} taxminiy={m?.taxminiy} /> : <span className="text-text-mute">…</span>}</td>
              <td className="px-2 py-2 text-right">{m || r.moliyaXato ? <SonKatak v={m?.nds} /> : <span className="text-text-mute">…</span>}</td>
              <td className="px-2 py-2 text-right font-semibold">{m || r.moliyaXato ? <SonKatak v={m?.jami} /> : <span className="text-text-mute">…</span>}</td>
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
          <tr><td /><td className="px-2 py-2" colSpan={4}>{t('Oy jami — barcha F2 ({n} ta)', { n: jamiHammasi.soni })}</td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.ustamasiz} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.ustamali} /></td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.nds} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiHammasi.jami} /></td><td /></tr>
          <tr><td /><td className="px-2 py-2" colSpan={4}>{t('Paketga tanlanganlar ({n} ta)', { n: jamiTanlangan.soni })}</td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.ustamasiz} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.ustamali} /></td>
            <td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.nds} /></td><td className="px-2 py-2 text-right"><JamiKatak s={jamiTanlangan.jami} /></td><td /></tr>
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
export function F2OylikPaket(p: { kompaniyaId: number; malumot: ReestrMalumot; tashkilot: string | null }) {
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