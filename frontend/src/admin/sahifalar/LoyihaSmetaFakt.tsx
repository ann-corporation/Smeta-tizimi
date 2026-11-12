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
import { loyihaBoglash, loyihaFarqOl, loyihaQaror, loyihaRoyxatOl, loyihaSmetaOl, loyihaTasdiq, loyihaYoz, type MiqdorQatori } from '../../api/t2-loyiha-smeta';
import { dublikatTanla, hujjatniTahlilQil, type SahifaNatija } from '../../lib/loyiha-smeta/tahlil';
import { pdfdanMatn, manbaKorinishi, sha256Hex } from '../../lib/loyiha-smeta/pdf-oqish';
import { keshdanOl, keshgaSaqla, manbaR2 } from '../../lib/loyiha-smeta/ekstraksiya-kesh';
import type { MatnBo } from '../../lib/loyiha-smeta/jadval';
import { aiElementlar, aiHududi, aiNarxi, aiOqi, hududKaliti, hududniRasmga, keshdaBor, keshgaYoz, keshKaliti } from '../../lib/loyiha-smeta/ai-oqish';
import { tokenHolatOl, type TokenHolat } from '../../api/t2-token';
import { bolimXaritasi, moslash, type MoslashSababi, type SmetaQator } from '../../lib/loyiha-smeta/moslash';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { katKesimJamiBilan } from '../../lib/ustamali-summa';
import { farqJami, farqJamiTarkibi, farqlarniHisobla, type FarqMiqdor, type FarqQator, type FarqTuri, type QarorTuri } from '../../lib/loyiha-smeta/farq';
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
    const [a, b, c] = await Promise.all([loyihaRoyxatOl(kompaniyaId, obyektId), loyihaFarqOl(kompaniyaId, obyektId), loyihaSmetaOl(kompaniyaId, obyektId)]);
    if (!a.ok) { setXato(a.error); return; }
    setXato(''); setRoyxat(a.natija.miqdorlar); if (b.ok) setFarqD(b.natija); if (c.ok) setSmeta(c.natija.qatorlar);
  }, [kompaniyaId, obyektId]);
  useEffect(() => { setRoyxat([]); setFarqD(null); setSmeta([]); void yukla(); }, [yukla]);

  const xarita = useMemo(() => bolimXaritasi(smeta), [smeta]);
  const taklifVaraq = useMemo(() => {
    const m = new Map<string, MiqdorQatori[]>();
    for (const x of royxat) if (x.holat === 'taklif' && !x.eskirgan) m.set(x.varaq, [...(m.get(x.varaq) ?? []), x]);
    return m;
  }, [royxat]);
  const nomzodlar = useMemo(() => {
    const m = new Map<number, ReturnType<typeof moslash>>();
    for (const x of royxat) if (x.holat === 'taklif' && !x.eskirgan) m.set(x.id, moslash({ nom: x.nom, belgi: x.belgi, birlik: x.birlik, tur: x.tur, varaq: x.varaq }, smeta, xarita));
    return m;
  }, [royxat, smeta, xarita]);
  const bogli = useMemo(() => new Set(royxat.flatMap((x) => x.boglar)), [royxat]);
  const farqlar = useMemo(() => farqlarniHisobla(farqD?.miqdorlar ?? [], smeta, bogli, {
    taxminiyNarx: (id) => { const v = Number((narxlar[id] ?? '').replace(/\s/g, '').replace(',', '.')); return narxlar[id] && Number.isFinite(v) && v > 0 ? v : null; },
  }), [farqD, smeta, bogli, narxlar]);
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
    for (const s of tanlangan) if (s.varaq) m.set(s.varaq, [...(m.get(s.varaq) ?? []), s]);
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
                      {f.tur === 'loyihada_bor_smetada_yoq' && f.miqdorId != null && <MoneyInput className={inp + ' w-28'} aria-label={t('Taxminiy birlik narxi (QQS siz)')} placeholder={t('narx (QQS siz)')} value={narxlar[f.miqdorId] ?? ''} onValueChange={(r) => setNarxlar((s) => ({ ...s, [f.miqdorId as number]: r }))} />}</td>
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
