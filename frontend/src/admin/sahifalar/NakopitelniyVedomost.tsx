import { useEffect, useMemo, useState } from 'react';
import { Search, Download, RefreshCw, AlertTriangle, Eye } from 'lucide-react';
import { useHujjatKorinish } from '../../umumiy/hujjat/HujjatKorinish';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { sbT2DaraxtOl, sbT2ObyektlarOlKomp, sbT2KompaniyalarOl, type T2Kompaniya, type T2Obyekt } from '../../api/supabase';
import { sbT2ShartnomaBogOl, sbT2ShartnomalarOl, zakazchikRekvizit } from '../../api/t2-shartnoma';
import type { Forma3Rekvizit } from '../../lib/forma3-export';
import { t2NakopitelniyOl, t2NakopitelniyToliq, type NakopitelniyQator, type NakopitelniyDavr, type NakopitelniyJami } from '../../api/t2-nakopitelniy';
import { HujjatToliqEmasXato, NDS_SUKUT_FOIZ, nakopitelniyVedomostHujjat } from '../../lib/nakopitelniy-vedomost-export';
import { f2AktHujjat } from '../../lib/f2-akt-tn-export';
import { forma3Hujjat, type Forma3ExportOptions } from '../../lib/forma3-export';
import { sbT2F2TafsilotOl } from '../../api/t2-narx';
import { ozgarishRoyxatOl } from '../../api/t2-document-control';
import { t2ObyektNakrutka, type NakrutkaKaskad, type NakrutkaKoeffitsientlar } from '../../api/t2-nakrutka';
import { HujjatTomonlariPanel, useHujjatTomonlari } from '../../umumiy/hujjat/HujjatTomonlari';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { FmtN } from '../../lib/format';
import { buildPtoLineLedger, validatePtoHierarchy, type PtoF3LineageInput, type PtoLineageScope } from '../../lib/pto-document-lineage';

/**
 * T2-PTO-OWNER-CRITICAL-CLOSURE P0-3: the real, line-by-line PTO nakopitelniy
 * vedomost -- ISH / SMETA / FAKT / PREV F2 / CURRENT F2 / CUMULATIVE F2 /
 * REMAINING, off t2_nakopitelniy_v2 (canonical; Fakt 20261011100000, barg
 * jami + sahifalash 20261101090000). Replaces the one-line KPI
 * summary that used to stand in for this. Approved-only cumulative: a draft
 * F2 never appears in oldingi/joriy/jami -- only t2_akt.holat='tasdiqlangan'
 * rows are summed there (t2_nakopitelniy_v1's own join condition).
 */

const PAGE_SIZE = 200;

function jamiHajmSafe(q: NakopitelniyQator) { return q.smeta_hajm ?? 0; }

function Sessiya({ companyId }: { companyId: number }) {
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [davrlar, setDavrlar] = useState<NakopitelniyDavr[]>([]);
  const [davr, setDavr] = useState('');
  const [qatorlar, setQatorlar] = useState<NakopitelniyQator[]>([]);
  const [jami, setJami] = useState<NakopitelniyJami | null>(null);
  const [obyektNom, setObyektNom] = useState('');
  const [loyihaId, setLoyihaId] = useState<number | null>(null);
  const [obyektKompaniyaId, setObyektKompaniyaId] = useState<number | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [busy, setBusy] = useState(false);
  const [xato, setXato] = useState('');
  const [page, setPage] = useState(0);
  const [treeMeta, setTreeMeta] = useState<Map<number, { ota_id: number | null; daraja: number | null }>>(new Map());

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then(r => { if (active && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    return () => { active = false; };
  }, [companyId]);

  // Ikki narx (egasi): hujjatda к оплате = прямые × Kf — obyekt/shartnoma nakrutka foizlari.
  const [nakrutka, setNakrutka] = useState<NakrutkaKoeffitsientlar | null>(null);
  const [nakrutkaKaskadi, setNakrutkaKaskadi] = useState<NakrutkaKaskad | null>(null);
  useEffect(() => {
    let active = true;
    setNakrutka(null);
    setNakrutkaKaskadi(null);
    if (!objectId) return;
    void t2ObyektNakrutka(Number(objectId)).then((r) => {
      if (!active || !r.ok) return;
      if (r.koeffitsientlar) setNakrutka(r.koeffitsientlar);
      if (r.nakrutka) setNakrutkaKaskadi(r.nakrutka);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [objectId]);

  /**
   * F3 (СПРАВКА-СЧЕТ-ФАКТУРА) titulidagi TO'LIQ rekvizitlar — egasi
   * (2026-09-28): "har tarafni rekvizitlarini qo'ya oladigan kuchli hujjat".
   * ПОДРЯДЧИК — kompaniyaning o'z profili (t2_kompaniya); ЗАКАЗЧИК —
   * obyektga bog'langan shartnomaning rekviziti. Ikkalasi ham bo'sh bo'lishi
   * mumkin (hali kiritilmagan) — bu holda titulda o'sha qator ko'rinmaydi
   * (`forma3-export.ts` ikkiTomonRekvizit qoidasi), o'ylab to'qilmaydi.
   */
  const [kompaniyalar, setKompaniyalar] = useState<T2Kompaniya[]>([]);
  useEffect(() => {
    let active = true;
    void sbT2KompaniyalarOl().then((r) => { if (active && r.ok) setKompaniyalar((r.qatorlar || []) as T2Kompaniya[]); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const pudratchiRek = useMemo<Forma3Rekvizit | null>(() => {
    const k = kompaniyalar.find((x) => x.id === companyId);
    return k ? { toliqNom: k.toliq_nom, manzil: k.manzil, telefon: k.telefon, hisobRaqam: k.hisob_raqam, bank: k.bank, mfo: k.mfo, inn: k.inn, oked: k.oked } : null;
  }, [kompaniyalar, companyId]);
  const [zakazchikRek, setZakazchikRek] = useState<Forma3Rekvizit | null>(null);
  const [shartnoma, setShartnoma] = useState<{ raqam: string; sana: string | null; summa: number | null } | null>(null);
  useEffect(() => {
    let active = true;
    setZakazchikRek(null); setShartnoma(null);
    if (!objectId) return;
    void (async () => {
      const bog = await sbT2ShartnomaBogOl(Number(objectId));
      if (!active || !bog.ok) return;
      const shId = (bog.qatorlar || []).find((x) => x.obyekt_id === Number(objectId))?.shartnoma_id;
      if (shId == null) return;
      const sh = await sbT2ShartnomalarOl(companyId, false);
      if (!active || !sh.ok) return;
      const s = (sh.qatorlar || []).find((x) => x.id === shId);
      if (!s) return;
      // KANONIK yo'l (egasi 2026-09-28): avval `zakazchik_kompaniya_id`
      // bog'lanishidan (rekvizit bir marta kompaniya profilida kiritiladi);
      // bog'lanmagan bo'lsa shartnomaning o'z zaxira matn maydonlaridan.
      setZakazchikRek(zakazchikRekvizit(s, (id) => kompaniyalar.find((x) => x.id === id)));
      // Shartnoma sanasi bazada alohida saqlanmaydi (faqat yaratildi — texnik
      // sana) — shuning uchun F3 titulidagi "от ..." faqat egasi qo'lda
      // kiritsa chiqadi; hozircha raqam + summa yetarli, sana UNKNOWN.
      setShartnoma({ raqam: s.raqam, sana: null, summa: s.jami_nds_bilan ?? s.summa_bez_nds });
    })().catch(() => undefined);
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, companyId, kompaniyalar]);

  const yukla = async (objId: number, tanlanganDavr: string) => {
    setBusy(true); setXato('');
    try {
      const [r, daraxt] = await Promise.all([
        t2NakopitelniyOl(objId, tanlanganDavr || null),
        sbT2DaraxtOl(objId, 'id,ota_id,daraja'),
      ]);
      if (!r.ok) { setXato(r.xato || r.code || 'Yuklanmadi'); setQatorlar([]); return; }
      const meta = new Map<number, { ota_id: number | null; daraja: number | null }>();
      if (daraxt.ok) for (const q of daraxt.qatorlar ?? []) meta.set(Number(q.id), { ota_id: q.ota_id ?? null, daraja: q.daraja ?? null });
      setTreeMeta(meta);
      setQatorlar(r.qatorlar.map(q => ({ ...q, ...(meta.get(q.qator_id) ?? {}) })));
      setJami(r.jami); setDavrlar(r.davrlar); setDavr(r.davr); setObyektNom(r.obyekt.nom);
      setLoyihaId(r.obyekt.loyiha_id);
      setObyektKompaniyaId(r.obyekt.kompaniya_id);
      setTruncated(Boolean(r.truncated));
      setPage(0);
    } catch (e) { setXato(e instanceof Error ? e.message : 'Yuklanmadi'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!objectId) { setQatorlar([]); setDavrlar([]); setTreeMeta(new Map()); return; }
    void yukla(Number(objectId), '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

  const filtr = qidiruv.trim().toLowerCase();
  const korinadigan = useMemo(() => {
    if (!filtr) return qatorlar;
    const byId = new Map(qatorlar.map(q => [q.qator_id, q]));
    const keep = new Set<number>();
    for (const q of qatorlar) {
      if ((q.kod || '').toLowerCase().includes(filtr) || (q.nom || '').toLowerCase().includes(filtr)) {
        let current: NakopitelniyQator | undefined = q;
        while (current) {
          if (keep.has(current.qator_id)) break;
          keep.add(current.qator_id);
          current = current.ota_id == null ? undefined : byId.get(current.ota_id);
        }
      }
    }
    // Eski RPC parent ID bermasa, foydalanuvchi hech bo'lmaganda bo'lim
    // sarlavhasini yo'qotmasin. Yangi canonical oqimda esa faqat haqiqiy
    // ajdodlar ko'rsatiladi.
    if (!qatorlar.some(q => q.ota_id != null)) return qatorlar.filter(q => q.tur === 'rz' || keep.has(q.qator_id));
    return qatorlar.filter(q => keep.has(q.qator_id));
  }, [qatorlar, filtr]);

  // Qator tartibi canonical tartib; ierarxiya esa ota_id/daraja bilan
  // ko'rsatiladi. Keyingi satrga qarab RZ ni o'chirish mumkin emas: ichma-ich
  // RZ bo'limlarida bunday usul bo'limlarni yo'qotadi.
  const gorunumRows = korinadigan;

  const sahifa = gorunumRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const sahifaSoni = Math.max(1, Math.ceil(gorunumRows.length / PAGE_SIZE));

  const [tomonlar, setTomonlar] = useHujjatTomonlari(companyId);
  const [ndsFoiz, setNdsFoiz] = useState(String(NDS_SUKUT_FOIZ));
  const [truncated, setTruncated] = useState(false);
  const smetaNakrutka = useMemo(() => {
    if (!nakrutkaKaskadi) return jami?.smeta_nakrutka ?? null;
    return {
      pryamye: nakrutkaKaskadi.pryamye,
      itogo4: nakrutkaKaskadi.itogo4,
      nds: nakrutkaKaskadi.nds,
      nds_foiz: nakrutka?.НДС ?? null,
      vsego: nakrutkaKaskadi.vsego,
    };
  }, [jami?.smeta_nakrutka, nakrutka, nakrutkaKaskadi]);

  /** Hujjat faqat TO'LIQ ro'yxatdan yasaladi: ekrandagi ro'yxat qisqa bo'lsa
   *  (server sukuti 500 qator) — server sahifalari avtomat oxirigacha o'qiladi
   *  (egasi qarori Q4). Baribir to'liq kelmasa — eksport bloklanadi. */
  const [eksportBusy, setEksportBusy] = useState(false);
  const toliqQatorlar = async (): Promise<NakopitelniyQator[] | null> => {
    if (!truncated) return qatorlar;
    setEksportBusy(true);
    try {
      const r = await t2NakopitelniyToliq(Number(objectId), davr || null);
      if (!r.ok) {
        setXato(r.code === 'NAKOPITELNIY_OZGARDI' ? 'O‘qish paytida smeta qatorlari o‘zgardi — qayta urinib ko‘ring.' : (r.xato || r.code || 'Yuklanmadi'));
        return null;
      }
      if (r.truncated) { setXato('Hujjat yasalmadi: server ro‘yxatni to‘liq bermadi — chala hujjat chiqarilmaydi.'); return null; }
      return r.qatorlar.map(q => ({ ...q, ...(treeMeta.get(q.qator_id) ?? {}) }));
    } finally { setEksportBusy(false); }
  };
  const stavkaOl = (): number | null => {
    const t = ndsFoiz.trim();
    if (t === '') return null;
    const x = Number(t.replace(',', '.'));
    return Number.isFinite(x) && x >= 0 ? x : null;
  };

  /** Barcha rasmiy exportlar uchun bir xil canonical company/project/object/contract gate. */
  const canonicalScopeOl = async (): Promise<PtoLineageScope | null> => {
    if (!loyihaId || !objectId || obyektKompaniyaId == null) {
      setXato('Hujjat uchun obyektning canonical company/project bog‘lanishi topilmadi.');
      return null;
    }
    const bog = await sbT2ShartnomaBogOl(Number(objectId));
    const boglar = bog.ok ? (bog.qatorlar ?? []) : [];
    if (boglar.length !== 1) { setXato('Hujjat uchun obyektning bitta faol shartnoma bog‘lanishi aniq emas.'); return null; }
    const shartnomalar = await sbT2ShartnomalarOl(companyId, false);
    const shartnoma = shartnomalar.ok ? (shartnomalar.qatorlar ?? []).find((x) => x.id === boglar[0].shartnoma_id) : undefined;
    if (!shartnoma) { setXato('Hujjat uchun shartnoma canonical ma’lumoti topilmadi.'); return null; }
    const hierarchy = validatePtoHierarchy({
      companyId, projectId: Number(loyihaId), objectId: Number(objectId), contractId: shartnoma.id,
      projectCompanyId: companyId,
      objectCompanyId: obyektKompaniyaId,
      objectProjectId: Number(loyihaId),
      contractCompanyId: shartnoma.kompaniya_id,
      contractProjectId: shartnoma.loyiha_id,
      linkedContractIds: [shartnoma.id],
    });
    if (!hierarchy.ok) { setXato(`Hujjat lineage tekshiruvi blokladi: ${hierarchy.issues[0]?.code ?? 'LINEAGE_ERROR'}`); return null; }
    return { companyId, projectId: Number(loyihaId), objectId: Number(objectId), contractId: shartnoma.id, periodId: davr };
  };

  /** ФОРМА № 3 — СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (счет-фактура
   *  к актам формы № 2). Manba: to‘liq nakopitelniy + TASDIQLANGAN F2 oylik
   *  summalari (t2_f2_tafsilot, akt_holat='tasdiqlangan') + tasdiqlangan
   *  olib_tashlash o‘zgarishlari (СМЕТНАЯ dan chiqadi). Egasi qarori (2026-09-26):
   *  jami — nakrutka kaskadi, «за отчетный период» ВСЕГО К ОПЛАТЕ = shu davr
   *  tasdiqlangan F2 к оплате jamisi (tiyingacha); farq — diqqat, yashirilmaydi. */
  const [forma3Busy, setForma3Busy] = useState(false);
  const [forma3Diqqat, setForma3Diqqat] = useState<Array<{ nom: string; sabab: string }>>([]);
  const forma3EksportQil = async (korish = false) => {
    setXato(''); setForma3Diqqat([]);
    if (!objectId || !davr) { setXato('F3 uchun tasdiqlangan F2 davri yo‘q — hujjat yasalmadi.'); return; }
    setForma3Busy(true);
    try {
      const scope = await canonicalScopeOl();
      if (!scope) return;
      const rows = await toliqQatorlar();
      if (!rows) return;
      const taf = await sbT2F2TafsilotOl({ obyektId: Number(objectId), tur: 'f2' });
      if (!taf.ok || taf.toliq === false || !taf.qatorlar) {
        setXato('F2 qatorlari to‘liq o‘qilmadi — F3 chala ma’lumot ustida tuzilmaydi.'); return;
      }
      const tasdiqlanganF2 = taf.qatorlar.filter((t) => t.akt_holat === 'tasdiqlangan');
      if (tasdiqlanganF2.some((t) => !Number.isSafeInteger(t.akt_id) || t.akt_id <= 0)) {
        setXato('Tasdiqlangan F2 manbasining akt ID si topilmadi — F3 yaratilmadi.'); return;
      }
      if (tasdiqlanganF2.some((t) => t.summa == null || !Number.isFinite(t.summa))) {
        setXato('Tasdiqlangan F2 manbasining exact summasi noma’lum — F3 yaratilmadi.'); return;
      }
      const f2Oylik = tasdiqlanganF2
        .map((t) => ({ obyekt_id: t.obyekt_id, qator_id: t.qator_id, oy: String(t.oy).slice(0, 7), summa: Number(t.summa), akt_id: Number(t.akt_id) }));
      const lineage: PtoF3LineageInput = {
        scope,
        sources: [...new Set(f2Oylik.map((x) => `${x.akt_id}:${x.oy}`))]
          .map((key) => {
            const split = key.lastIndexOf(':');
            const akt = key.slice(0, split);
            const oy = key.slice(split + 1);
            const rows = f2Oylik.filter((x) => `${x.akt_id}:${x.oy}` === key);
            return { documentId: `F2-AKT:${akt}`, scope: { ...scope, periodId: oy }, approved: true, qatorIds: rows.map((x) => x.qator_id) };
          }),
      };
      let ozgarishlar: Forma3ExportOptions['ozgarishlar'] = [];
      try {
        const oz = await ozgarishRoyxatOl(Number(objectId), 500);
        ozgarishlar = ((oz?.ozgarishlar ?? []) as Array<{ holat?: string | null; tur?: string | null; qatorlar?: Array<{ qator_id?: number | null; amal?: string | null }> }>)
          .filter((o) => o.tur === 'olib_tashlash' && o.holat === 'tasdiqlangan')
          .map((o) => ({
            holat: String(o.holat), tur: String(o.tur),
            qatorlar: (o.qatorlar ?? []).filter((z) => z.qator_id != null && !!z.amal)
              .map((z) => ({ qator_id: Number(z.qator_id), amal: String(z.amal) })),
          }));
      } catch { /* ro‘yxat o‘qilmasa СМЕТНАЯ o‘zgarmaydi — davom etamiz */ }
      const h = forma3Hujjat(
        { nakopitelniy: [{ obyekt_id: Number(objectId), obyektNom, qatorlar: rows }], f2Oylik },
        {
          obyektNom, davr, asosiyObyektId: Number(objectId), imzo: tomonlar, nakrutka, ndsFoiz: stavkaOl(),
          smetaNakrutka, ozgarishlar, lineage, lineageRequired: true,
          pudratchi: pudratchiRek, zakazchik: zakazchikRek,
          shartnomaRaqam: shartnoma?.raqam ?? null, shartnomaSana: shartnoma?.sana ?? null, shartnomaSumma: shartnoma?.summa ?? null,
        },
      );
      setForma3Diqqat(h.diqqat);
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch (e) {
      setXato(e instanceof Error ? `F3 tuzilmadi: ${e.message}` : 'F3 fayli tuzilmadi.');
    } finally { setForma3Busy(false); }
  };

  const korinish = useHujjatKorinish();
  const eksportQil = async (korish = false) => {
    setXato('');
    try {
      const rows = await toliqQatorlar();
      if (!rows) return;
      const h = nakopitelniyVedomostHujjat(rows, { obyektNom, davr, imzo: tomonlar, ndsFoiz: stavkaOl(), smetaNakrutka, nakrutka });
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch (e) { setXato(e instanceof HujjatToliqEmasXato ? 'Hujjat to‘liq emas — eksport bloklandi.' : 'Excel fayli tuzilmadi.'); }
  };

  /** Rasmiy АКТ ПРИЕМКИ ВЫПОЛНЕННЫХ РАБОТ (ФОРМА № 2) — TN Akt-2 shakli. */
  const aktEksportQil = async (korish = false) => {
    setXato('');
    try {
      const rows = await toliqQatorlar();
      if (!rows) return;
      const h = f2AktHujjat(rows, { obyektNom, davr, imzo: tomonlar, ndsFoiz: stavkaOl(), nakrutka });
      if (korish) korinish.ochish(h.bytes, h.faylNomi); else downloadBlob(h.bytes, h.faylNomi);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setXato(m.startsWith('F2_AKT_BOSH') ? 'Tanlangan davrda tasdiqlangan F2 qatori yo‘q — akt yasalmadi.' : 'Ф2 akt fayli tuzilmadi.');
    }
  };

  return (
    <div className="space-y-3 p-1">
      {korinish.oyna}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">Obyekt
          <select aria-label="Obyekt" className="ml-2 border rounded px-2 py-1"
            value={objectId} onChange={e => setObjectId(e.target.value)}>
            <option value="">Tanlang</option>
            {objects.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        {!!davrlar.length && (
          <label className="block text-sm">Davr
            <select aria-label="Davr" className="ml-2 border rounded px-2 py-1"
              value={davr} onChange={e => void yukla(Number(objectId), e.target.value)}>
              {davrlar.map(d => <option key={d.oy} value={d.oy}>{d.oy}{d.certified ? '' : ' (qoralama)'}</option>)}
            </select>
          </label>
        )}
        {qatorlar.length > 0 && (
          <label className="block text-sm flex-1 min-w-[220px]">
            <span className="sr-only">Qidirish</span>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-mute" />
              <input aria-label="Kod yoki nom bo'yicha qidirish" className="w-full border rounded pl-7 pr-2 py-1"
                placeholder="Kod yoki nom bo'yicha qidirish…" value={qidiruv}
                onChange={e => { setQidiruv(e.target.value); setPage(0); }} />
            </div>
          </label>
        )}
        <button type="button" disabled={!objectId || busy} onClick={() => void yukla(Number(objectId), davr)}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm hover:border-accent/50 disabled:opacity-50">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Yangilash
        </button>
        {qatorlar.length > 0 && (
          <button type="button" onClick={() => void eksportQil(false)} disabled={eksportBusy}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-accent text-white text-sm hover:opacity-90">
            <Download size={14} /> XLSX eksport
          </button>
        )}
        {qatorlar.length > 0 && (
          <button type="button" onClick={() => void eksportQil(true)} disabled={eksportBusy} title="Накопительная ведомость — saytda hujjatdagiday ko‘rish" aria-label="Nakopitelniy ko‘rish"
            className="h-8 px-2 inline-flex items-center rounded-lg border text-sm hover:border-accent/50"><Eye size={14} /></button>
        )}
        {qatorlar.length > 0 && (
          <button type="button" onClick={() => void aktEksportQil(false)} disabled={eksportBusy}
            title="Mijoz/bankka topshiriladigan rasmiy shakl (TN Akt-2)"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/50 text-accent text-sm hover:bg-accent/10">
            <Download size={14} /> Rasmiy Ф2 hujjati
          </button>
        )}
        {qatorlar.length > 0 && (
          <button type="button" onClick={() => void aktEksportQil(true)} disabled={eksportBusy} title="Акт Ф-2 — saytda hujjatdagiday ko‘rish" aria-label="Ф2 akt ko‘rish"
            className="h-8 px-2 inline-flex items-center rounded-lg border text-sm hover:border-accent/50"><Eye size={14} /></button>
        )}
        {qatorlar.length > 0 && !!davr && (
          <button type="button" onClick={() => void forma3EksportQil(false)} disabled={eksportBusy || forma3Busy}
            title="СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (счет-фактура к актам Ф-2)"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/50 text-accent text-sm hover:bg-accent/10">
            <Download size={14} /> Форма № 3
          </button>
        )}
        {qatorlar.length > 0 && !!davr && (
          <button type="button" onClick={() => void forma3EksportQil(true)} disabled={eksportBusy || forma3Busy} title="Форма № 3 — saytda hujjatdagiday ko‘rish" aria-label="F3 ko‘rish"
            className="h-8 px-2 inline-flex items-center rounded-lg border text-sm hover:border-accent/50"><Eye size={14} /></button>
        )}
      </div>

      {qatorlar.length > 0 && (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[280px] flex-1"><HujjatTomonlariPanel qiymat={tomonlar} onChange={setTomonlar} /></div>
          <label className="text-[12px] text-text-dim" title="F2 resurs qatorlari QQS siz; QQS hujjat oxirida bir marta qo‘shiladi">QQS (НДС) stavkasi, % — hujjat oxirida bir marta
            <input aria-label="QQS stavkasi" value={ndsFoiz} onChange={e => setNdsFoiz(e.target.value)} placeholder="bo‘sh — QQS qo‘shilmaydi"
              className="ml-2 w-24 border rounded px-2 py-1" inputMode="decimal" />
          </label>
        </div>
      )}

      {busy && <p role="status">Yuklanmoqda…</p>}
      {eksportBusy && <p role="status">To‘liq ro‘yxat serverdan sahifalab o‘qilmoqda…</p>}
      {forma3Busy && <p role="status">Форма № 3 manbalari yig‘ilmoqda (nakopitelniy + tasdiqlangan F2)…</p>}
      {truncated && !busy && (
        <p className="text-[12px] text-text-dim">Ekranda birinchi {qatorlar.length} ta qator; Excel hujjatlari obyektning barcha qatorlari bilan (avtomat) tuziladi.</p>
      )}
      {xato && <p role="alert" className="text-danger flex items-center gap-1.5"><AlertTriangle size={14} /> {xato}</p>}
      {forma3Diqqat.length > 0 && (
        <details className="text-[12px] text-text-dim border border-border rounded p-2">
          <summary className="cursor-pointer">Форма № 3 diqqatlar: {forma3Diqqat.length} ta (hujjatda ham yozilgan)</summary>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {forma3Diqqat.slice(0, 12).map((d, i) => <li key={i}><b>{d.nom}</b> — {d.sabab}</li>)}
          </ul>
        </details>
      )}

      {jami && (
        <div className="karta p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
          <div><span className="text-text-mute block">Smeta jami — to‘g‘ri xarajat</span><FmtN val={jami.smeta_summa} />
            <span className="text-text-mute block mt-1">Smeta jami — к оплате (nakrutka + QQS)</span>
            {smetaNakrutka ? <FmtN val={smetaNakrutka.vsego} /> : <span className="text-warn block">Nakrutka hisoblanmadi</span>}
            {smetaNakrutka && <span className="block text-text-mute">Farq (nakrutka + QQS): <FmtN val={smetaNakrutka.vsego - smetaNakrutka.pryamye} /></span>}
            {!nakrutkaKaskadi && <span className="block text-warn">Koeffitsientlar o‘qilmadi — eksportda alohida ogohlantirish beriladi.</span>}
            {!!jami.smeta_summa_nomalum && <span className="block text-warn">{jami.smeta_summa_nomalum} ta qatorda summa noma’lum</span>}
          </div>
          <div><span className="text-text-mute block">Fakt jami</span><FmtN val={jami.fakt_summa} /></div>
          <div><span className="text-text-mute block">Jami tasdiqlangan F2</span><FmtN val={jami.jami_tasdiqlangan_summa} /></div>
          <div><span className="text-text-mute block">Faktdan F2ga mumkin</span>
            <span className={jami.f2_mumkin_summa < 0 ? 'text-danger font-semibold' : ''}><FmtN val={jami.f2_mumkin_summa} /></span>
            <span className="block text-text-mute">Fakt − tasdiqlangan F2</span>
          </div>
        </div>
      )}

      {qatorlar.length > 0 && (
        <>
          <div className="karta overflow-auto max-h-[70vh]">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr className="text-text-mute text-center">
                  <th rowSpan={2} className="text-left px-2 py-1.5 sticky left-0 bg-surface-2 z-20 min-w-[160px]">Ish</th>
                  <th rowSpan={2} className="px-2 py-1.5">Birlik</th>
                  <th colSpan={3} className="px-2 py-1 border-l border-border">SMETA</th>
                  <th rowSpan={2} className="px-2 py-1.5 border-l border-border">FAKT<br />hajm</th>
                  <th colSpan={2} className="px-2 py-1 border-l border-border">OLDINGI F2</th>
                  <th colSpan={3} className="px-2 py-1 border-l border-border">JORIY F2</th>
                  <th colSpan={2} className="px-2 py-1 border-l border-border">JAMI (tasdiqlangan) F2</th>
                  <th colSpan={3} className="px-2 py-1 border-l border-border">QOLDIQ SEMANTIKASI</th>
                </tr>
                <tr className="text-text-mute text-right">
                  <th className="px-2 py-1 border-l border-border">Hajm</th><th className="px-2 py-1">Narx</th><th className="px-2 py-1">Summa</th>
                  <th className="px-2 py-1 border-l border-border">Hajm</th><th className="px-2 py-1">Summa</th>
                  <th className="px-2 py-1 border-l border-border">Hajm</th><th className="px-2 py-1">Narx</th><th className="px-2 py-1">Summa</th>
                  <th className="px-2 py-1 border-l border-border">Hajm</th><th className="px-2 py-1">Summa</th>
                  <th className="px-2 py-1 border-l border-border">Smeta − Fakt</th><th className="px-2 py-1">F2 mumkin</th><th className="px-2 py-1">Kontrakt − F2</th>
                </tr>
              </thead>
              <tbody>
                {sahifa.map(q => q.tur === 'rz' ? (
                  <tr key={q.qator_id} className="bg-surface-2/70">
                    <td colSpan={16} className="px-2 py-1.5 font-semibold text-text sticky left-0 bg-surface-2/70" style={{ paddingLeft: `${8 + Math.max(0, q.daraja ?? 0) * 14}px` }}>{q.nom}</td>
                  </tr>
                ) : (
                  (() => {
                    const ledger = buildPtoLineLedger({
                      lineId: q.qator_id,
                      baselineQuantity: q.smeta_hajm,
                      baselineUnitPrice: q.smeta_narx,
                      baselineAmount: q.smeta_summa,
                      factQuantity: q.fakt_hajm,
                      factAmount: q.fakt_summa,
                      previousApprovedQuantity: q.oldingi_hajm,
                      previousApprovedAmount: q.oldingi_summa,
                      currentApprovedQuantity: q.joriy_hajm,
                      currentApprovedAmount: q.joriy_summa,
                      approvedF2Quantity: q.jami_hajm,
                      approvedF2Amount: q.jami_summa,
                    });
                    return <tr key={q.qator_id} className="border-t border-border/60 hover:bg-surface-2/40 text-right">
                    <td className={'text-left px-2 py-1 sticky left-0 bg-surface ' + (q.tur === 'bl' ? 'font-medium' : '')} style={{ paddingLeft: `${8 + Math.max(0, q.daraja ?? 0) * 14}px` }} title={q.kod || ''}>{q.kod ? q.kod + ' ' : ''}{q.nom}</td>
                    <td className="text-center px-2 py-1">{q.birlik || '—'}</td>
                    <td className="px-2 py-1 border-l border-border tabular-nums"><FmtN val={jamiHajmSafe(q)} /></td>
                    <td className="px-2 py-1 tabular-nums">{q.smeta_narx == null ? '—' : <FmtN val={q.smeta_narx} />}</td>
                    <td className="px-2 py-1 tabular-nums"><FmtN val={q.smeta_summa ?? 0} /></td>
                    <td className="px-2 py-1 border-l border-border tabular-nums font-medium">{q.fakt_hajm ? <FmtN val={q.fakt_hajm} /> : '—'}</td>
                    <td className="px-2 py-1 border-l border-border tabular-nums">{q.oldingi_hajm ? <FmtN val={q.oldingi_hajm} /> : '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{q.oldingi_summa ? <FmtN val={q.oldingi_summa} /> : '—'}</td>
                    <td className="px-2 py-1 border-l border-border tabular-nums">{q.joriy_hajm ? <FmtN val={q.joriy_hajm} /> : '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{q.joriy_hajm ? <FmtN val={Math.round((q.joriy_summa / q.joriy_hajm) * 100) / 100} /> : '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{q.joriy_summa ? <FmtN val={q.joriy_summa} /> : '—'}</td>
                    <td className="px-2 py-1 border-l border-border tabular-nums font-medium">{q.jami_hajm ? <FmtN val={q.jami_hajm} /> : '—'}</td>
                    <td className="px-2 py-1 tabular-nums">{q.jami_summa ? <FmtN val={q.jami_summa} /> : '—'}</td>
                    <td className="px-2 py-1 border-l border-border tabular-nums">{ledger.smetaRemainingQuantity == null ? '—' : <FmtN val={ledger.smetaRemainingQuantity} />}</td>
                    <td className={'px-2 py-1 tabular-nums font-medium ' + (ledger.overCertified ? 'text-danger' : '')}>{ledger.f2AvailableQuantity == null ? '—' : <FmtN val={ledger.f2AvailableQuantity} />}</td>
                    <td className="px-2 py-1 tabular-nums">{ledger.contractualRemainingQuantity == null ? '—' : <FmtN val={ledger.contractualRemainingQuantity} />}</td>
                  </tr>;
                  })()
                ))}
              </tbody>
            </table>
          </div>
          {sahifaSoni > 1 && (
            <div className="flex items-center gap-2 text-[12px]">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">Oldingi</button>
              <span>{page + 1} / {sahifaSoni}</span>
              <button disabled={page + 1 >= sahifaSoni} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">Keyingi</button>
            </div>
          )}
        </>
      )}
      {objectId && !busy && !xato && !qatorlar.length && (
        <p className="text-text-mute text-sm">Bu obyektda smeta qatori topilmadi.</p>
      )}
    </div>
  );
}

export default function NakopitelniyVedomost() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
