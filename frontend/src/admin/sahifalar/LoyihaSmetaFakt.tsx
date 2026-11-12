/**
 * LoyihaSmetaFakt.tsx — /admin/loyiha-smeta. PTO uchun: chizma jadvallarini brauzerda o'qish (pdf.js, qoida profillari) -> taklif -> tasdiq ->
 * Loyiha | Smeta | Fakt uch ustunli solishtirma, pul ta'siri (lib/hisob-yadro) va har farq uchun qaror (mavjud zamena / qo'shimcha ish RPC lari).
 * Asl smeta o'zgarmaydi. AI bilan o'qish (rasm) alohida PR #266 (`/api/ai-loyiha`) ga tayanadi: bu yerda faqat taklif ro'yxati.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { MoneyInput } from '../../umumiy/ui/MoneyInput';
import { toast } from '../../umumiy/ui/Toast';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../../api/supabase';
import { sbT2QoshimchaIshYarat, sbT2ZamenaIshYarat } from '../../api/t2-additional-replacement';
import { loyihaXaritaOl, loyihaXaritaYoz, loyihaBoglash, loyihaFarqOl, loyihaQaror, loyihaRoyxatOl, loyihaSmetaOl, loyihaTasdiq, loyihaYoz, type MiqdorQatori } from '../../api/t2-loyiha-smeta';
import { dublikatTanla, hujjatniTahlilQil, type SahifaNatija } from '../../lib/loyiha-smeta/tahlil';
import { pdfdanMatn, manbaKorinishi, sha256Hex } from '../../lib/loyiha-smeta/pdf-oqish';
import { keshdanOl, keshgaSaqla, manbaR2 } from '../../lib/loyiha-smeta/ekstraksiya-kesh';
import type { MatnBo } from '../../lib/loyiha-smeta/jadval';
import { aiElementlar, aiHududi, aiNarxi, aiOqi, hududKaliti, hududniRasmga, keshdaBor, keshgaYoz, keshKaliti } from '../../lib/loyiha-smeta/ai-oqish';
import { tokenHolatOl, type TokenHolat } from '../../api/t2-token';
import { sbNarxManbalarOl, sbNarxManbaQidiruvQatorlariOl } from '../../api/t2-narx-dalil';
import { narxTakliflari, type ManbaMeta, type ManbaQator, type NarxTaklifi } from '../../lib/loyiha-smeta/narx-taklif';
import { bolimXaritasi, moslash, MOSLASH_STANDART, type MoslashSababi, type SmetaQator } from '../../lib/loyiha-smeta/moslash';
import { regexOqi, regexSaqla, regexTekshir } from '../../lib/loyiha-smeta/moslash-sozlama';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { katKesimJamiBilan } from '../../lib/ustamali-summa';
import { farqJami, farqJamiTarkibi, farqlarniHisobla, type FarqMiqdor, type FarqQator, type FarqTuri, type QarorTuri } from '../../lib/loyiha-smeta/farq';
import { belgisizVaraqlar, type VaraqElement } from '../../lib/loyiha-smeta/topilmagan';
import { revizyaFarqi } from '../../lib/loyiha-smeta/revizya';
import { birlikkaQaytar } from '../../lib/loyiha-smeta/birlik';
import { solishtirmaHujjatXlsx } from '../../lib/loyiha-smeta/solishtirma-export';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { t } from '../../i18n/til';
import { Bolim } from '../zakazchik/tomon-ui';
import { inp, tugma, tugmaAsosiy } from '../zakazchik/tomon-yordam';

const FARQ_NOMI: Record<FarqTuri, string> = {
  loyihada_bor_smetada_yoq: 'Loyihada bor — smetada yo‘q', smetada_bor_loyihada_yoq: 'Smetada bor — loyihada yo‘q', hajm_farqi: 'Hajm farqi',
  almashgan: 'Almashgan (sinf/marka farqi)', fakt_oshgan: 'Fakt loyihadan oshgan',
};
const SABAB_NOMI: Record<MoslashSababi, string> = {
  bolim_belgi: 'bo‘lim nomida shu varaq belgisi', bolim_yoq: 'bo‘limda varaq belgisi topilmadi', birlik_mos: 'birlik mos', birlik_farq: 'birlik farqli', tur_mos: 'ish turi mos',
  sinf_mos: 'beton sinfi mos', sinf_farq: 'beton sinfi farqli', sinf_daraja: 'beton sinfi ish turiga mos', sinf_daraja_farq: 'beton sinfi ish turiga mos emas', diametr_mos: 'diametr mos', qalinlik_mos: 'qalinlik mos', soz_mos: 'nomida umumiy so‘zlar',
};
const TASNIF_NOMI: Record<'boshqa_nom' | 'smetada_yoq' | 'noaniq' | 'miqdorsiz', string> = { boshqa_nom: 'boshqa nom ostida bo‘lim bor', smetada_yoq: 'ehtimol smetada yo‘q', noaniq: 'noaniq (qisman mos)', miqdorsiz: 'solishtiriladigan miqdor yo‘q' };
const QAROR_NOMI: Record<QarorTuri, string> = { boglandi: 'Bog‘langan', zamena: 'Zamena', qoshimcha: 'Qo‘shimcha ish', pereraschet: 'Pereraschet', etibor_yoq: 'E’tiborsiz' };
const fmt = (n: number | null, d = 2) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d }).format(n));

type Yuklangan = { nom: string; buf: ArrayBuffer; sha: string; items: MatnBo[]; sahifalar: (SahifaNatija & { fayl: number })[] };

export default function LoyihaSmetaFakt() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useState<number | ''>('');
  const [royxat, setRoyxat] = useState<MiqdorQatori[]>([]);
  const [farqD, setFarqD] = useState<{ taklif_soni: number; tasdiqlangan_soni: number; miqdorlar: FarqMiqdor[] } | null>(null);
  const [smeta, setSmeta] = useState<(SmetaQator & { versiya?: number | null })[]>([]);
  const [xato, setXato] = useState('');
  const [fayllar, setFayllar] = useState<Yuklangan[]>([]);
  const [revizyalar, setRevizyalar] = useState<Record<string, number>>({});
  const [band, setBand] = useState(false);
  const [filtrTur, setFiltrTur] = useState<FarqTuri | ''>('');
  const [filtrVaraq, setFiltrVaraq] = useState('');
  const [minPul, setMinPul] = useState(0);
  const [narxlar, setNarxlar] = useState<Record<number, string>>({});
  const [tanlov, setTanlov] = useState<Record<number, number>>({});
  const [belgilangan, setBelgilangan] = useState<Set<number>>(new Set());
  const [oyna, setOyna] = useState<{ f: FarqQator; tur: 'zamena' | 'qoshimcha' } | null>(null);
  const [manba, setManba] = useState<string | null>(null);

  useEffect(() => { if (kompaniyaId) void sbT2ObyektlarOlKomp(kompaniyaId).then((r) => setObyektlar((r.ok ? r.qatorlar ?? [] : []) as T2Obyekt[])); }, [kompaniyaId]);

  const yukla = useCallback(async () => {
    if (!kompaniyaId || obyektId === '') return;
    const [a, b, c, d] = await Promise.all([loyihaRoyxatOl(kompaniyaId, obyektId), loyihaFarqOl(kompaniyaId, obyektId), loyihaSmetaOl(kompaniyaId, obyektId), loyihaXaritaOl(kompaniyaId, obyektId)]);
    if (!a.ok) { setXato(a.error); return; }
    setXato(''); setRoyxat(a.natija.miqdorlar); if (b.ok) setFarqD(b.natija); if (c.ok) setSmeta(c.natija.qatorlar); setXaritaQ(d.ok ? d.natija.xarita : []);
  }, [kompaniyaId, obyektId]);
  useEffect(() => { setRoyxat([]); setFarqD(null); setSmeta([]); void yukla(); }, [yukla]);

  const [xaritaQ, setXaritaQ] = useState<{ varaq: string; bolim_qator_id: number; manba: 'qolda' | 'taklif' }[]>([]);
  const qolda = useMemo(() => { const m = new Map<string, Set<number>>(); for (const x of xaritaQ) m.set(x.varaq, new Set([...(m.get(x.varaq) ?? []), x.bolim_qator_id])); return m; }, [xaritaQ]);
  const [belgiRegex, setBelgiRegex] = useState<string>(MOSLASH_STANDART.belgiRegex);
  const [regexQoralama, setRegexQoralama] = useState('');
  const [regexNamuna, setRegexNamuna] = useState('РАЗДЕЛ ОБРАЗЕЦ (КР-5)');
  useEffect(() => { if (kompaniyaId) { const r = regexOqi(kompaniyaId); setBelgiRegex(r); setRegexQoralama(r); } }, [kompaniyaId]);
  const regexNatija = useMemo(() => regexTekshir(regexQoralama, regexNamuna), [regexQoralama, regexNamuna]);
  const xarita = useMemo(() => bolimXaritasi(smeta, belgiRegex, qolda), [smeta, belgiRegex, qolda]);
  const smetaBelgilari = useMemo(() => { const s = new Set<string>(); for (const v of xarita.values()) for (const b of v.belgilar) s.add(b); return s; }, [xarita]);
  const belgisiz = useMemo(() => {
    const g = new Map<string, VaraqElement[]>();
    for (const x of royxat) if (!x.eskirgan && x.holat !== 'rad') g.set(x.varaq, [...(g.get(x.varaq) ?? []), { tur: x.tur, nom: x.nom, birlik: x.birlik, miqdor: x.miqdor }]);
    return smeta.length ? belgisizVaraqlar(g, smeta, smetaBelgilari) : [];
  }, [royxat, smeta, smetaBelgilari]);
  const bolimlar = useMemo(() => smeta.filter((q) => q.tur === 'rz'), [smeta]);
  const [qoldaTanlov, setQoldaTanlov] = useState<Record<string, number>>({});
  async function xaritaBelgila(varaq: string, bolimId: number, manba: 'qolda' | 'taklif', sabab?: string, harakat: 'qosh' | 'ochir' = 'qosh') {
    if (!kompaniyaId || obyektId === '') return;
    const r = await loyihaXaritaYoz(kompaniyaId, { obyektId, varaq, bolimId, harakat, manba, sabab });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Xarita saqlandi'), 'ok'); await yukla();
  }
  const taklifVaraq = useMemo(() => {
    const m = new Map<string, MiqdorQatori[]>();
    for (const x of royxat) if (x.holat === 'taklif' && !x.eskirgan) m.set(x.varaq, [...(m.get(x.varaq) ?? []), x]);
    return m;
  }, [royxat]);
  const nomzodlar = useMemo(() => {
    const m = new Map<number, ReturnType<typeof moslash>>();
    for (const x of royxat) if (x.holat === 'taklif' && !x.eskirgan) m.set(x.id, moslash({ nom: x.nom, belgi: x.belgi, birlik: x.birlik, tur: x.tur, varaq: x.varaq }, smeta, xarita, { ...MOSLASH_STANDART, belgiRegex }));
    return m;
  }, [royxat, smeta, xarita, belgiRegex]);
  const bogli = useMemo(() => new Set(royxat.flatMap((x) => x.boglar)), [royxat]);
  const farqlar = useMemo(() => farqlarniHisobla(farqD?.miqdorlar ?? [], smeta, bogli, {
    belgiRegex,
    taxminiyNarx: (id) => { const v = Number((narxlar[id] ?? '').replace(/\s/g, '').replace(',', '.')); return narxlar[id] && Number.isFinite(v) && v > 0 ? v : null; },
  }), [farqD, smeta, bogli, narxlar, belgiRegex]);
  const jami = useMemo(() => farqJami(farqlar), [farqlar]);
  const tarkib = useMemo(() => farqJamiTarkibi(farqlar), [farqlar]);
  const korinadigan = farqlar.filter((f) => (!filtrTur || f.tur === filtrTur) && (!filtrVaraq || f.varaq === filtrVaraq) && Math.abs(f.pulQQSbilan ?? 0) >= minPul);
  const varaqlar = [...new Set(farqlar.map((f) => f.varaq).filter(Boolean))] as string[];
  const smetaById = useMemo(() => new Map(smeta.map((q) => [q.id, q])), [smeta]);

  /* ───── 1. PDF yuklash va o'qish ───── */
  async function faylTanlandi(files: FileList | null) {
    if (!files?.length) return;
    setBand(true);
    try {
      const out: Yuklangan[] = [];
      for (const f of Array.from(files)) {
        const buf = await f.arrayBuffer();
        const sha = await sha256Hex(buf);
        let items = await keshdanOl(kompaniyaId!, sha);   // R2 keshi: shu PDF qayta tahlil qilinmaydi
        if (!items) { items = (await pdfdanMatn(buf)).items; void keshgaSaqla(kompaniyaId!, sha, items); }
        const idx = fayllar.length + out.length;
        out.push({ nom: f.name, buf, sha, items, sahifalar: hujjatniTahlilQil(items).map((s) => ({ ...s, fayl: idx })) });
      }
      setFayllar((x) => [...x, ...out]);
    } catch (e) { toast(t('PDF o‘qilmadi') + ': ' + (e instanceof Error ? e.message : ''), 'danger'); } finally { setBand(false); }
  }
  const hamma = useMemo(() => fayllar.flatMap((f) => f.sahifalar), [fayllar]);
  const { tanlangan, almashgan } = useMemo(() => dublikatTanla(hamma.filter((s) => s.elementlar.length > 0)), [hamma]);
  const aiKerak = hamma.filter((s) => s.aiTaklifi);
  const [aiTanlangan, setAiTanlangan] = useState<Set<string>>(new Set());
  const [tokenD, setTokenD] = useState<TokenHolat | null>(null);
  useEffect(() => { if (kompaniyaId) void tokenHolatOl(kompaniyaId).then((r) => setTokenD(r.ok ? r.natija : null)); }, [kompaniyaId]);
  const aiKalit = (s: SahifaNatija & { fayl: number }) => keshKaliti(fayllar[s.fayl]?.sha ?? '', s.sahifa, aiHududi(fayllar[s.fayl]?.items.filter((i) => i.sahifa === s.sahifa) ?? []));
  const aiNarx = aiNarxi(aiKerak.filter((s) => aiTanlangan.has(`${s.fayl}:${s.sahifa}`)).map(aiKalit), tokenD?.narxlar, tokenD?.sozlama);
  async function aiBilanOqi() {
    if (!kompaniyaId) return;
    setBand(true);
    let n = 0;
    for (const s of aiKerak.filter((x) => aiTanlangan.has(`${x.fayl}:${x.sahifa}`))) {
      const f = fayllar[s.fayl]; const quti = aiHududi(f.items.filter((i) => i.sahifa === s.sahifa));
      try {
        const rasm = await hududniRasmga(f.buf, s.sahifa, quti);
        const r = await aiOqi({ kompaniyaId, faylSha: f.sha, sahifa: s.sahifa, varaq: s.varaq, hudud: hududKaliti(quti), rasm });
        if (!r.ok) { toast(`${s.varaq ?? s.sahifa}: ${r.xabar}`, 'danger'); continue; }
        keshgaYoz(aiKalit(s));
        const els = aiElementlar(r.items, s.sahifa, quti, { x0: 0, y0: 0, x1: 1e5, y1: 1e5 });
        setFayllar((all) => all.map((y, i) => (i !== s.fayl ? y : { ...y, sahifalar: y.sahifalar.map((z) => (z.sahifa === s.sahifa ? { ...z, elementlar: els, profil: 'ai', aiTaklifi: false, sabab: null } : z)) })));
        n += els.length;
      } catch (e) { toast(`${s.sahifa}: ${e instanceof Error ? e.message : ''}`, 'danger'); }
    }
    setAiTanlangan(new Set()); setBand(false);
    toast(t('AI o‘qidi: {n} ta element (taklif, tasdiq kerak)', { n }), n ? 'ok' : 'warn');
  }
  const guruhlar = useMemo(() => {
    const m = new Map<string, (typeof tanlangan)>();
    for (const s of tanlangan) { const k = s.varaq ?? `БЕЛГИСИЗ-${s.sahifa}`; m.set(k, [...(m.get(k) ?? []), s]); }   // shtampsiz bet: «БЕЛГИСИЗ-N» — mazmun bo'yicha bo'lim taklif qilinadi
    return m;
  }, [tanlangan]);
  const mavjudRev = (varaq: string) => Math.max(-1, ...royxat.filter((x) => x.varaq === varaq && !x.eskirgan).map((x) => x.revizya));
  const yangiRev = (varaq: string, aniq: number | null) => revizyalar[varaq] ?? Math.max(aniq ?? 0, mavjudRev(varaq) + 1);

  async function saqla() {
    if (!kompaniyaId || obyektId === '') return;
    setBand(true);
    let n = 0;
    for (const [varaq, sahifalar] of guruhlar) {
      const aniq = sahifalar.map((s) => s.revizya).filter((x): x is number => x != null);
      const items = sahifalar.flatMap((s) => s.elementlar.map((e) => ({ nom: e.nom, belgi: e.belgi, birlik: e.birlik, miqdor: e.miqdor, tur: e.tur, ishonch: e.ishonch, manba_r2: manbaR2(kompaniyaId, fayllar[s.fayl].sha), manba_sahifa: e.sahifa, manba_ref: e.manbaRef })));
      const r = await loyihaYoz(kompaniyaId, { obyektId, varaq, revizya: yangiRev(varaq, aniq.length ? Math.max(...aniq) : null), items });
      if (!r.ok) { toast(`${varaq}: ${r.error}`, 'danger'); continue; }
      n += items.length;
    }
    setBand(false);
    if (n) { toast(t('Takliflar saqlandi: {n} ta (tasdiqlanmaguncha pulga kirmaydi)', { n }), 'ok'); setFayllar([]); await yukla(); }
  }

  async function manbaKo(x: MiqdorQatori) {
    const f = fayllar.find((y) => manbaR2(kompaniyaId!, y.sha) === x.manba_r2);
    const el = f?.sahifalar.flatMap((s) => s.elementlar).find((e) => e.manbaRef === x.manba_ref);
    if (!f || !el) { toast(t('Manba fayli shu seansda yuklanmagan: PDF ni qayta tanlang'), 'warn'); return; }
    setManba(await manbaKorinishi(f.buf, el.sahifa, el.qutisi));
  }

  /* ───── 2. Tasdiq ───── */
  async function tasdiqla(varaq: string) {
    if (!kompaniyaId) return;
    const qatorlar = (taklifVaraq.get(varaq) ?? []).filter((x) => belgilangan.has(x.id));
    if (!qatorlar.length) return;
    const r = await loyihaTasdiq(kompaniyaId, qatorlar.map((x) => x.id), 'tasdiqlangan');
    if (!r.ok) { toast(r.error, 'danger'); return; }
    for (const x of qatorlar) {
      const q = tanlov[x.id] ?? (nomzodlar.get(x.id)?.ishonchli ? nomzodlar.get(x.id)?.nomzodlar[0]?.qatorId : undefined);
      if (q) await loyihaBoglash(kompaniyaId, { miqdorId: x.id, qatorId: q, ball: nomzodlar.get(x.id)?.nomzodlar.find((n) => n.qatorId === q)?.ball ?? null, sabab: 'qo‘lda tasdiq', harakat: 'qosh' });
    }
    setBelgilangan(new Set()); toast(t('Tasdiqlandi: {n} ta', { n: qatorlar.length }), 'ok'); await yukla();
  }

  const [narxTakliflar, setNarxTakliflar] = useState<Record<number, NarxTaklifi[]>>({});
  const [narxManbasi, setNarxManbasi] = useState<Record<number, string>>({});
  const [manbaBazasi, setManbaBazasi] = useState<{ qatorlar: ManbaQator[]; meta: Map<number, ManbaMeta> } | null>(null);
  async function narxTakliflariOl(f: FarqQator) {
    if (!kompaniyaId || f.miqdorId == null) return;
    let baza = manbaBazasi;
    if (!baza) {
      const [q, m] = await Promise.all([sbNarxManbaQidiruvQatorlariOl(kompaniyaId), sbNarxManbalarOl(kompaniyaId)]);
      baza = { qatorlar: (q.ok ? q.qatorlar ?? [] : []) as ManbaQator[], meta: new Map(((m.ok ? m.qatorlar ?? [] : []) as ManbaMeta[]).map((x) => [x.id, x])) };
      setManbaBazasi(baza);
    }
    setNarxTakliflar((s) => ({ ...s, [f.miqdorId as number]: narxTakliflari({ nom: f.nom, birlik: f.birlik }, baza.qatorlar, baza.meta) }));
  }

  async function vedomost() {
    if (!kompaniyaId || obyektId === '') return;
    setBand(true);
    try {
      const nom = obyektlar.find((o) => o.id === obyektId)?.nom ?? String(obyektId);
      const x = solishtirmaHujjatXlsx(farqlar, jami, { obyektNomi: nom });
      const r = await hujjatTokenBilan({ kompaniyaId, bytes: x.bytes, hujjat: 'LOYIHA_SMETA_FAKT', sabab: `Ведомость сопоставления проекта, сметы и факта · ${nom}`, obyekt: obyektId }, () => downloadBlob(x.bytes, x.faylNomi));
      toast(r.ok ? (r.xabar || t('Vedomost tayyor')) : r.xabar, r.ok ? 'ok' : 'danger');
    } catch { toast(t('Excel fayli tuzilmadi. Qayta urinib ko‘ring.'), 'danger'); } finally { setBand(false); }
  }

  /* ───── 3. Qarorlar ───── */
  const miqdorOf = (id: number | null) => (id == null ? null : royxat.find((x) => x.id === id) ?? null);
  async function oddiyQaror(f: FarqQator, tur: QarorTuri, sabab?: string, qatorId?: number | null) {
    if (!kompaniyaId || f.miqdorId == null) return;
    if (tur === 'etibor_yoq' && !(sabab && sabab.trim().length >= 3)) { toast(t('Sababni yozing'), 'warn'); return; }
    const r = await loyihaQaror(kompaniyaId, { miqdorId: f.miqdorId, tur, qatorId: qatorId ?? f.qatorId, sabab });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Qaror yozildi'), 'ok'); await yukla();
  }
  function bogla(f: FarqQator) {
    const q = f.miqdorId != null ? tanlov[f.miqdorId] : undefined;
    if (f.tur === 'loyihada_bor_smetada_yoq' && kompaniyaId && f.miqdorId != null) {
      if (!q) { toast(t('Avval nomzod qatorni tanlang'), 'warn'); return; }
      void loyihaBoglash(kompaniyaId, { miqdorId: f.miqdorId, qatorId: q, sabab: 'qo‘lda tanlov', harakat: 'qosh' }).then(async (r) => { if (r.ok) { await oddiyQaror(f, 'boglandi', undefined, q); } else toast(r.error, 'danger'); });
    } else void oddiyQaror(f, 'boglandi');
  }

  if (!kompaniyaId) return <KompaniyaKerak nima="Loyiha va smeta solishtirmasi" />;
  const rev = (v: string) => royxat.filter((x) => x.varaq === v && !x.eskirgan);

  return (
    <Sahifa sarlavha="Loyiha ↔ Smeta ↔ Fakt" tavsif="Chizma jadvallarini o‘qiydi, smeta qatorlariga moslaydi va loyiha ≠ smeta ≠ fakt farqlarini pul ta’siri bilan ko‘rsatadi. Asl smeta o‘zgarmaydi.">
      <div className="space-y-3">
        <select aria-label={t('Obyekt')} className={inp} value={obyektId} onChange={(e) => setObyektId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">{t('Obyektni tanlang')}</option>{obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</select>
        {xato && <p className="text-sm text-danger">{xato}</p>}
        <details className="text-xs">
          <summary>{t('Varaq belgisi qoidasi (kompaniya nomlashi)')}</summary>
          <div className="space-y-1 p-2">
            <p>{t('Smeta bo‘lim nomidan varaq belgisini oladigan regex (1-guruh = belgi). Bu brauzerda saqlanadi.')}</p>
            <input className={inp + ' w-full font-mono'} aria-label={t('Regex')} value={regexQoralama} onChange={(e) => setRegexQoralama(e.target.value)} />
            <input className={inp + ' w-full'} aria-label={t('Namuna bo‘lim nomi')} value={regexNamuna} onChange={(e) => setRegexNamuna(e.target.value)} />
            <p>{regexNatija.ok ? `${t('Topilgan belgilar')}: ${regexNatija.belgilar.join(', ') || '—'}` : t('Regex yaroqsiz yoki 1-guruh yo‘q')}</p>
            <div className="flex gap-2">
              <button type="button" className={tugmaAsosiy} disabled={!regexNatija.ok || !kompaniyaId} onClick={() => { if (kompaniyaId) { regexSaqla(kompaniyaId, regexQoralama); setBelgiRegex(regexQoralama); toast(t('Qoida saqlandi'), 'ok'); } }}>{t('Saqlash')}</button>
              <button type="button" className={tugma} onClick={() => { if (kompaniyaId) { regexSaqla(kompaniyaId, null); setBelgiRegex(MOSLASH_STANDART.belgiRegex); setRegexQoralama(MOSLASH_STANDART.belgiRegex); } }}>{t('Standart')}</button>
            </div>
          </div>
        </details>

        {obyektId !== '' && (
          <Bolim sarlavha="1. Chizma PDF ni o‘qish (brauzerda)">
            <input type="file" accept="application/pdf" multiple disabled={band} onChange={(e) => void faylTanlandi(e.target.files)} aria-label={t('Chizma PDF fayllari')} />
            {band && <p className="mt-2 text-xs">{t('O‘qilmoqda…')}</p>}
            {fayllar.length > 0 && (
              <div className="mt-3 space-y-2 text-[13px]">
                {[...guruhlar].map(([v, sh]) => {
                  const eski = rev(v).map((x) => ({ tur: x.tur, belgi: x.belgi, nom: x.nom, birlik: x.birlik, miqdor: x.miqdor, qarorBor: x.qaror != null }));
                  const yangi = sh.flatMap((s) => s.elementlar);
                  const fq = eski.length ? revizyaFarqi(eski, yangi) : null;
                  const aniq = sh.map((s) => s.revizya).filter((x): x is number => x != null);
                  return (
                    <div key={v} className="rounded border p-2">
                      <b>{v}</b> · {t('{n} ta element', { n: yangi.length })} · {t('profil')}: {[...new Set(sh.map((s) => s.profil))].join(', ')}
                      <label className="ml-3">{t('Revizya')} <input type="number" min={0} className={inp + ' w-16'} value={yangiRev(v, aniq.length ? Math.max(...aniq) : null)} onChange={(e) => setRevizyalar((r) => ({ ...r, [v]: Number(e.target.value) }))} /></label>
                      {fq && <p className="mt-1 text-xs">{t('Oldingi revizyaga nisbatan')}: {t('yangi')} {fq.yangi.length}, {t('o‘zgargan')} {fq.ozgargan.length}, {t('o‘zgarmagan')} {fq.ayni.length}, {t('olingan')} {fq.olingan.length}{fq.eskiradigan.length > 0 && ` · ${t('qarori eskiradi')}: ${fq.eskiradigan.length}`}</p>}
                    </div>
                  );
                })}
                {almashgan.length > 0 && <p className="text-xs">{t('Bir varaqning eski nusxalari tashlandi (yuqori revizya olindi)')}: {almashgan.length}</p>}
                {aiKerak.length > 0 && (
                  <div className="rounded border p-2 text-xs">
                    <p>{t('Qoida bilan o‘qilmagan sahifalar (AI bilan o‘qish yoki qo‘lda kerak)')}: {aiKerak.length}. {t('AI bilan o‘qish narxi ishga tushirishdan oldin ko‘rsatiladi va tokenlardan yechiladi; keshdagi sahifa takror yechilmaydi.')}</p>
                    <div className="my-1 flex flex-wrap gap-2">{aiKerak.map((s) => {
                      const k = `${s.fayl}:${s.sahifa}`;
                      return <label key={k}><input type="checkbox" checked={aiTanlangan.has(k)} onChange={(e) => setAiTanlangan((x) => { const n = new Set(x); if (e.target.checked) n.add(k); else n.delete(k); return n; })} /> {s.varaq ?? '?'} · {t('bet')} {s.sahifa}{keshdaBor(aiKalit(s)) ? ` · ${t('keshda (bepul)')}` : ''}</label>;
                    })}</div>
                    <p>{aiNarx.token == null ? t('Narx noma‘lum — token narxlarini yuklab bo‘lmadi, ishga tushirib bo‘lmaydi') : t('Taxminiy narx: {n} token ({b} sahifa keshdan bepul)', { n: aiNarx.token, b: aiNarx.bepul })}</p>
                    <button type="button" className={tugma} disabled={band || aiNarx.token == null || aiTanlangan.size === 0} onClick={() => void aiBilanOqi()}>{t('AI bilan o‘qish')}</button>
                  </div>)}
                <button type="button" className={tugmaAsosiy} disabled={band || guruhlar.size === 0} onClick={() => void saqla()}>{t('Taklif sifatida saqlash')}</button>
              </div>
            )}
          </Bolim>
        )}

        {belgisiz.length > 0 && (
          <Bolim sarlavha="Belgisi smetada topilmagan varaqlar">
            <p className="mb-2 text-xs">{t('Varaq belgisi hech bir smeta bo‘limi nomida yo‘q. Mazmun bo‘yicha (beton/armatura miqdori) mos bo‘lim taklif qilinadi; tasdiqlasangiz xarita eslab qolinadi. Asl smeta o‘zgarmaydi.')}</p>
            {belgisiz.map((v) => (
              <div key={v.varaq} className="mb-2 rounded border p-2 text-[13px]">
                <b>{v.varaq}</b> · {t(TASNIF_NOMI[v.turi])} · {v.mosSoni}/{v.elementSoni} {t('miqdor mos')}
                {v.takliflar.slice(0, 2).map((b) => (
                  <div key={b.bolimId} className="text-xs">{b.bolimNomi.slice(0, 80)} · {b.mos} {t('miqdor teng')}
                    <button type="button" className={tugma + ' ml-2'} onClick={() => void xaritaBelgila(v.varaq, b.bolimId, 'taklif', `${b.mos}/${v.elementSoni} miqdor teng`)}>{t('Tasdiqlash')}</button></div>))}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <select className={inp} aria-label={t('Smeta bo‘limi')} value={qoldaTanlov[v.varaq] ?? ''} onChange={(e) => setQoldaTanlov((s) => ({ ...s, [v.varaq]: Number(e.target.value) }))}><option value="">{t('Bo‘limni qo‘lda tanlang')}</option>{bolimlar.map((b) => <option key={b.id} value={b.id}>{b.nom.slice(0, 70)}</option>)}</select>
                  <button type="button" className={tugma} disabled={!qoldaTanlov[v.varaq]} onClick={() => void xaritaBelgila(v.varaq, qoldaTanlov[v.varaq], 'qolda')}>{t('Bog‘lash')}</button>
                </div>
              </div>))}
          </Bolim>
        )}
        {xaritaQ.length > 0 && (
          <Bolim sarlavha="Eslab qolingan varaq xaritasi">
            {xaritaQ.map((x) => (
              <div key={`${x.varaq}:${x.bolim_qator_id}`} className="text-xs">{x.varaq} → {smetaById.get(x.bolim_qator_id)?.nom.slice(0, 80) ?? x.bolim_qator_id} · {x.manba === 'qolda' ? t('qo‘lda') : t('tasdiqlangan taklif')}
                <button type="button" className="ml-2 underline" onClick={() => void xaritaBelgila(x.varaq, x.bolim_qator_id, x.manba, undefined, 'ochir')}>{t('Olib tashlash')}</button></div>))}
          </Bolim>
        )}
        {taklifVaraq.size > 0 && (
          <Bolim sarlavha="2. Takliflar: tasdiqlang (tasdiqlanmagani pulga kirmaydi)">
            {[...taklifVaraq].map(([v, qatorlar]) => (
              <div key={v} className="mb-3">
                <div className="mb-1 flex items-center gap-2"><b>{v}</b><span className="text-xs">{t('{n} ta taklif', { n: qatorlar.length })}</span>
                  <button type="button" className={tugma} onClick={() => setBelgilangan(new Set(qatorlar.filter((x) => !nomzodlar.get(x.id)?.odamKerak && x.miqdor != null).map((x) => x.id)))}>{t('Aniq o‘qilganlarini belgilash')}</button>
                  <button type="button" className={tugmaAsosiy} disabled={!qatorlar.some((x) => belgilangan.has(x.id))} onClick={() => void tasdiqla(v)}>{t('Belgilanganlarni tasdiqlash ({n})', { n: qatorlar.filter((x) => belgilangan.has(x.id)).length })}</button></div>
                <table className="w-full text-[13px]"><tbody>
                  {qatorlar.map((x) => {
                    const m = nomzodlar.get(x.id);
                    return (
                      <tr key={x.id} className="border-t align-top">
                        <td><input type="checkbox" aria-label={t('Belgilash')} checked={belgilangan.has(x.id)} onChange={(e) => setBelgilangan((s) => { const n = new Set(s); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} /></td>
                        <td>{x.belgi ?? ''} {x.nom}{x.revizya_farq === 'ozgargan' && <em className="ml-1 text-warn">{t('o‘zgargan')} ({t('oldingi')}: {fmt(x.oldingi_miqdor, 3)})</em>}</td>
                        <td className="num">{fmt(x.miqdor, 3)} {x.birlik}</td>
                        <td className="text-xs">{x.ishonch != null ? Math.round(x.ishonch * 100) + '%' : '—'} <button type="button" className="underline" onClick={() => void manbaKo(x)}>{t('manba')}</button></td>
                        <td className="text-xs">
                          {m?.odamKerak ? <span>{t('Odam tasdiqlashi kerak')}</span> : m && m.nomzodlar.length > 0 && (
                            <select className={inp} aria-label={t('Smeta qatori')} value={tanlov[x.id] ?? (m.ishonchli ? m.nomzodlar[0].qatorId : '')} onChange={(e) => setTanlov((s) => ({ ...s, [x.id]: Number(e.target.value) }))}>
                              <option value="">—</option>
                              {m.nomzodlar.map((n) => <option key={n.qatorId} value={n.qatorId}>{Math.round(n.ball * 100)}% · {smetaById.get(n.qatorId)?.nom.slice(0, 60)} ({n.sabab.map((s) => t(SABAB_NOMI[s])).join(', ')})</option>)}
                            </select>)}
                        </td>
                      </tr>);
                  })}</tbody></table>
              </div>
            ))}
          </Bolim>
        )}

        {farqD && (
          <Bolim sarlavha="3. Loyiha | Smeta | Fakt solishtirmasi">
            <div className="mb-2 grid gap-2 text-sm sm:grid-cols-3">
              <div><b>{t('Smetaga kirmagan ish')}</b><SummaJuft obyektId={Number(obyektId)} ustamasiz={jami.kirmaganQQSsiz} katKesim={katKesimJamiBilan(tarkib.kirmagan, (f) => smetaById.get(f.qatorId ?? -1)?.kat ?? null, (f) => f.pulQQSsiz, jami.kirmaganQQSsiz)} /><div className="text-xs">{jami.kirmaganSoni} {t('ta')}</div></div>
              <div><b>{t('Hujjatlashtirilgani')}</b><SummaJuft obyektId={Number(obyektId)} ustamasiz={jami.hujjatQQSsiz} katKesim={katKesimJamiBilan(tarkib.hujjat, (f) => smetaById.get(f.qatorId ?? -1)?.kat ?? null, (f) => f.pulQQSsiz, jami.hujjatQQSsiz)} /><div className="text-xs">{jami.hujjatSoni} {t('ta')}</div></div>
              <div className="text-xs">{t('Narxsiz (summa noma‘lum, «—»)')}: {jami.narxsizSoni} · {t('Tasdiqlanmagan takliflar pulga kirmaydi')}: {farqD.taklif_soni}</div>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className={tugmaAsosiy} disabled={band || farqlar.length === 0} onClick={() => void vedomost()}>{t('Solishtirma vedomosti (Excel)')}</button>
              <select className={inp} aria-label={t('Farq turi')} value={filtrTur} onChange={(e) => setFiltrTur(e.target.value as FarqTuri | '')}><option value="">{t('Barcha turlar')}</option>{(Object.keys(FARQ_NOMI) as FarqTuri[]).map((k) => <option key={k} value={k}>{t(FARQ_NOMI[k])}</option>)}</select>
              <select className={inp} aria-label={t('Varaq')} value={filtrVaraq} onChange={(e) => setFiltrVaraq(e.target.value)}><option value="">{t('Barcha varaqlar')}</option>{varaqlar.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              <label className="text-xs">{t('Kamida (so‘m, QQS bilan)')} <MoneyInput className={inp + ' w-32'} value={minPul} numericValue onValueChange={(r) => setMinPul(Number(r) || 0)} /></label>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-[13px]">
              <thead><tr className="text-left"><th>{t('Varaq')}</th><th>{t('Ish')}</th><th className="num">{t('Loyiha')}</th><th className="num">{t('Smeta')}</th><th className="num">{t('Fakt')}</th><th className="num">{t('Farq')}</th><th className="num">{t('Pul (QQS bilan / siz)')}</th><th>{t('Qaror')}</th></tr></thead>
              <tbody>{korinadigan.map((f, i) => {
                const m = miqdorOf(f.miqdorId); const nz = m ? nomzodlar.get(m.id) : null;
                return (
                  <tr key={i} className="border-t align-top">
                    <td>{f.varaq ?? '—'}</td>
                    <td>{f.nom}<div className="text-xs">{t(FARQ_NOMI[f.tur])}{f.izoh.includes('taxminiy_narx') && ` · ${t('taxminiy narx')}`}</div></td>
                    <td className="num">{fmt(f.loyiha, 3)} {f.birlik}</td><td className="num">{fmt(f.smeta, 3)}</td><td className="num">{fmt(f.fakt, 3)}</td>
                    <td className="num">{fmt(f.farq, 3)}</td>
                    <td className="num">{fmt(f.pulQQSbilan)}<div className="text-xs">{fmt(f.pulQQSsiz)}</div>
                      {f.tur === 'loyihada_bor_smetada_yoq' && f.miqdorId != null && <MoneyInput className={inp + ' w-28'} aria-label={t('Taxminiy birlik narxi (QQS siz)')} placeholder={t('narx (QQS siz)')} value={narxlar[f.miqdorId] ?? ''} onValueChange={(r) => { setNarxlar((s) => ({ ...s, [f.miqdorId as number]: r })); setNarxManbasi((s) => ({ ...s, [f.miqdorId as number]: '' })); }} />}
                      {f.tur === 'loyihada_bor_smetada_yoq' && f.miqdorId != null && (
                        <div className="text-xs">
                          <button type="button" className="underline" onClick={() => void narxTakliflariOl(f)}>{t('Narx manbalaridan taklif')}</button>
                          {narxManbasi[f.miqdorId] && <div>{t('Manba')}: {narxManbasi[f.miqdorId]}</div>}
                          {(narxTakliflar[f.miqdorId] ?? []).map((n) => (
                            <div key={n.qatorId}><button type="button" className="underline" onClick={() => { setNarxlar((s) => ({ ...s, [f.miqdorId as number]: String(n.narxQQSsiz) })); setNarxManbasi((s) => ({ ...s, [f.miqdorId as number]: `${n.manba} — ${n.qatorNom.slice(0, 50)}${n.ndsdan ? ` (${t('NDS siz ga keltirilgan')})` : ''}` })); }}>{fmt(n.narxQQSsiz)}</button> · {n.manba}</div>))}
                          {narxTakliflar[f.miqdorId]?.length === 0 && <div>{t('Manbalarda mos narx yo‘q — qo‘lda kiriting')}</div>}
                        </div>)}</td>
                    <td className="text-xs">
                      {f.qaror && <div>{t(QAROR_NOMI[f.qaror])}{f.qarorEskirgan && <b className="text-warn"> · {t('revizya o‘zgargan, qayta ko‘ring')}</b>}</div>}
                      {f.miqdorId != null && (
                        <div className="flex flex-wrap gap-1">
                          {f.tur === 'loyihada_bor_smetada_yoq' && nz && nz.nomzodlar.length > 0 && (
                            <select className={inp} aria-label={t('Smeta qatori')} value={tanlov[f.miqdorId] ?? ''} onChange={(e) => setTanlov((s) => ({ ...s, [f.miqdorId as number]: Number(e.target.value) }))}><option value="">—</option>{nz.nomzodlar.map((n) => <option key={n.qatorId} value={n.qatorId}>{smetaById.get(n.qatorId)?.nom.slice(0, 50)}</option>)}</select>)}
                          <button type="button" className={tugma} onClick={() => bogla(f)}>{t('Mavjud qatorga bog‘lash')}</button>
                          <button type="button" className={tugma} onClick={() => setOyna({ f, tur: 'zamena' })}>{t('Zamena')}</button>
                          <button type="button" className={tugma} onClick={() => setOyna({ f, tur: 'qoshimcha' })}>{t('Qo‘shimcha ish')}</button>
                          <button type="button" className={tugma} onClick={() => { void oddiyQaror(f, 'pereraschet', t('Pereraschet / smeta o‘zgarishiga yuborildi')); window.open(`/admin/smeta-studio?obyekt=${obyektId}`, '_blank'); }}>{t('Pereraschet')}</button>
                          <button type="button" className={tugma} onClick={() => { const s = window.prompt(t('Nega e’tiborsiz? (sabab majburiy)')); if (s) void oddiyQaror(f, 'etibor_yoq', s); }}>{t('Loyiha xato / e’tiborsiz')}</button>
                        </div>)}
                    </td>
                  </tr>);
              })}</tbody></table></div>
            {korinadigan.length === 0 && <p className="text-sm">{t('Farq topilmadi yoki tasdiqlangan miqdor yo‘q')}</p>}
          </Bolim>
        )}
      </div>
      {oyna && kompaniyaId && obyektId !== '' && (
        <QarorOyna f={oyna.f} tur={oyna.tur} kompaniyaId={kompaniyaId} obyektId={obyektId} smeta={smeta} xarita={xarita} miqdor={miqdorOf(oyna.f.miqdorId)} nomzod={oyna.f.miqdorId != null ? tanlov[oyna.f.miqdorId] : undefined}
          onYop={() => setOyna(null)} onTayyor={() => { setOyna(null); void yukla(); }} />
      )}
      {manba && (<div role="dialog" aria-label={t('Manba')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setManba(null)}><img src={manba} alt={t('Manba sahifasi')} className="max-h-full max-w-full bg-white" /></div>)}
    </Sahifa>
  );
}

/** Zamena / qo'shimcha ish: mavjud server amallari (sbT2ZamenaIshYarat / sbT2QoshimchaIshYarat) oldindan to'ldirilgan holda. Yangi o'zgarish mantig'i YO'Q. */
function QarorOyna(p: { f: FarqQator; tur: 'zamena' | 'qoshimcha'; kompaniyaId: number; obyektId: number; smeta: (SmetaQator & { versiya?: number | null })[]; xarita: ReturnType<typeof bolimXaritasi>;
  miqdor: MiqdorQatori | null; nomzod?: number; onYop: () => void; onTayyor: () => void }) {
  const aloqa = p.smeta.find((q) => q.id === (p.f.qatorId ?? p.nomzod)) ?? null;
  const bolim = aloqa ? null : p.smeta.find((q) => (q.tur === 'rz' || q.tur === 'bl') && p.f.varaq != null && p.xarita.get(q.id)?.belgilar.has(p.f.varaq)) ?? null;
  const otaId = aloqa?.ota_id ?? bolim?.id ?? null;
  const birlik = aloqa?.birlik || p.f.birlik;
  const boshHajm = p.f.farq != null ? Math.abs(p.f.farq) : (p.miqdor?.miqdor != null ? birlikkaQaytar(p.miqdor.miqdor, birlik) ?? p.miqdor.miqdor : null);
  const [nom, setNom] = useState(p.f.nom);
  const [hajm, setHajm] = useState(boshHajm == null ? '' : String(boshHajm));
  const [sabab, setSabab] = useState(`${t('Loyiha')} ${p.f.varaq ?? ''}${p.miqdor ? ` rev.${p.miqdor.revizya}` : ''}${p.miqdor?.belgi ? `, ${t('poz.')} ${p.miqdor.belgi}` : ''}`);
  const [band, setBand] = useState(false);
  const yubor = async () => {
    const h = Number(hajm.replace(',', '.'));
    const yaroqsiz = !otaId || !nom.trim() || !Number.isFinite(h) || h <= 0 || sabab.trim().length < 3;
    if (yaroqsiz) { toast(t('Bo‘lim, nom, hajm va sabab kerak'), 'warn'); return; }
    setBand(true);
    const baza = { kompaniyaId: p.kompaniyaId, obyektId: p.obyektId, operationId: yangiOperationId(), expectedVersion: aloqa?.versiya ?? 1, sabab: sabab.trim(), otaQatorId: otaId, nom: nom.trim().toUpperCase(), birlik: birlik || 'м3', hajm: h, keyinQatorId: aloqa?.id };
    const r = p.tur === 'zamena' && aloqa ? await sbT2ZamenaIshYarat({ ...baza, almashtirilayotganQatorId: aloqa.id }) : await sbT2QoshimchaIshYarat(baza);
    if (!r.ok) { setBand(false); toast(r.error || r.xabar || t('Bajarilmadi'), 'danger'); return; }
    if (p.f.miqdorId != null) await loyihaQaror(p.kompaniyaId, { miqdorId: p.f.miqdorId, tur: p.tur, qatorId: aloqa?.id ?? null, refJadval: 't2_qator', refId: r.qator_id ?? null, sabab: sabab.trim() });
    setBand(false); toast(t('Yozildi'), 'ok'); p.onTayyor();
  };
  return (
    <div role="dialog" aria-label={p.tur === 'zamena' ? t('Zamena') : t('Qo‘shimcha ish')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="fz-card w-full max-w-md space-y-2 p-4 text-[13px]">
        <h3 className="fz-card__title">{p.tur === 'zamena' ? t('Zamena') : t('Qo‘shimcha ish')}</h3>
        <p className="text-xs">{aloqa ? `${t('Bog‘liq smeta qatori')}: ${aloqa.nom.slice(0, 80)}` : t('Bog‘liq qator yo‘q: qo‘shimcha ish bo‘limga qo‘shiladi')}</p>
        {p.tur === 'zamena' && !aloqa && <p className="text-xs text-danger">{t('Zamena uchun avval almashtiriladigan smeta qatorini tanlang')}</p>}
        <input className={inp + ' w-full'} aria-label={t('Ish nomi')} value={nom} onChange={(e) => setNom(e.target.value)} />
        <div className="flex gap-2"><input className={inp + ' w-28'} aria-label={t('Hajm')} inputMode="decimal" value={hajm} onChange={(e) => setHajm(e.target.value)} /><span>{birlik}</span></div>
        <textarea className={inp + ' w-full'} aria-label={t('Sabab va manba')} rows={2} value={sabab} onChange={(e) => setSabab(e.target.value)} />
        <div className="flex justify-end gap-2"><button type="button" className={tugma} onClick={p.onYop}>{t('Bekor')}</button><button type="button" className={tugmaAsosiy} disabled={band || (p.tur === 'zamena' && !aloqa)} onClick={() => void yubor()}>{t('Yuborish')}</button></div>
      </div>
    </div>
  );
}
