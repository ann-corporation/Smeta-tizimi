import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sbOqi, sbT2AktYaratV2, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator,
} from '../../api/supabase';
import { t2NakopitelniyToliq } from '../../api/t2-nakopitelniy';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { tiyingaYaxlitla, type F2Akt, type F2Tugun } from '../../lib/smeta-anatomiya/f2';
import { f2AktlarniOqiFonda, f2MoslashV3Fonda } from '../../lib/f2-moslash-v3/fonda';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import {
  bogla, boshlangich, f2Indeks, smetaIndeks, yozishManbasi, type IshJoyi,
} from '../../lib/f2-moslash-v3/ishJoyi';
import { exactWrite } from './F2ImportNative';
import { F2V3Workbench } from './F2V3Workbench';

/**
 * F2 IMPORT V3 (docs/architecture/F2_IMPORT_V3.md): fayl → akt (davr, jami, ogohlantirishlar
 * fayldan, ustun raqamlari so'ralmaydi) → qavatma-qavat avto-moslash → ikki oynali drag-drop
 * ish joyi → F2 qoralamasi (`t2_akt_yarat_v2`), manba fayl R2 da.
 * Yozish faqat barcha qatorlar hal qilinganda (✓ yoki ongli "aktga kiritmaslik").
 */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));

function smetaQatorlari(rows: T2Qator[]): SmetaQator[] {
  return rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, norma: (q as T2Qator & { norma?: number | null }).norma ?? null, tartib: q.tartib }));
}

type SnapQator = { uid: string; imzo?: string };

function Sessiya({ companyId }: { companyId: number }) {
  const workspace = usePTOWorkspace();
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [aktlar, setAktlar] = useState<F2Akt[]>([]);
  const [aktIdx, setAktIdx] = useState(0);
  const [davr, setDavr] = useState('');
  const [rows, setRows] = useState<T2Qator[]>([]);
  const [oldingi, setOldingi] = useState(new Map<number, number>());
  const [qoldiq, setQoldiq] = useState(new Map<number, number>());
  const [xotira, setXotira] = useState(new Map<string, number>());
  const [rzBog, setRzBog] = useState(new Map<string, number>());
  const [natija, setNatija] = useState<F2MoslashNatija | null>(null);
  const [ij, setIj] = useState<IshJoyi | null>(null);
  const [busy, setBusy] = useState(false);
  const [holat, setHolat] = useState('Obyekt va F2 faylni tanlang.');
  const [xato, setXato] = useState('');
  const [ogoh, setOgoh] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const rawFile = useRef<File | null>(null);
  const operation = useRef('');
  const sourceOp = useRef('');
  const sourceDoc = useRef<number | undefined>(undefined);
  const ijRef = useRef<IshJoyi | null>(null);
  ijRef.current = ij;

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then((r) => { if (active && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    return () => { active = false; };
  }, [companyId]);
  useEffect(() => {
    if (workspace.scope.objectId != null && objects.some((o) => o.id === workspace.scope.objectId)) setObjectId(String(workspace.scope.objectId));
  }, [objects, workspace.scope.objectId]);

  const akt = aktlar[aktIdx] ?? null;
  const ind = useMemo(() => (akt ? f2Indeks(akt.daraxt) : null), [akt]);
  const S = useMemo(() => smetaIndeks(smetaQatorlari(rows)), [rows]);
  const raw = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  function tozala() { setNatija(null); setIj(null); setDone(null); setXato(''); setRzBog(new Map()); operation.current = ''; }

  async function faylTanla(file: File) {
    tozala(); setAktlar([]); setBusy(true); setHolat('Fayl o‘qilmoqda…');
    rawFile.current = file; sourceDoc.current = undefined; sourceOp.current = yangiOperationId();
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Fayl 50 MB dan katta.');
      // Fayl o'qish va akt tahlili FONDA (Web Worker) — katta faylda sahifa qotmaydi.
      const a = await f2AktlarniOqiFonda(file.name, file);
      if (!a.length) throw new Error('Faylda F2 akt varag‘i topilmadi (ishlar ro‘yxati bor LRV shaklidagi varaq kerak).');
      setAktlar(a); setAktIdx(0); setDavr(a[0].davr ?? '');
      setHolat(a[0].davr ? 'Akt o‘qildi. Moslashtirilmoqda…' : 'Akt o‘qildi. Hisobot davrini tanlang.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Fayl o‘qilmadi.'); setHolat('Fayl o‘qilmadi.'); }
    finally { setBusy(false); }
  }

  /** Smeta, oldingi F2 (Nakopitelniy) va xotira (o'tgan F2 larning imzolari). */
  async function malumotYukla(oid: number, oy: string) {
    const [d, nak, xot] = await Promise.all([
      sbT2DaraxtOl(oid),
      t2NakopitelniyToliq(oid, oy + '-01').catch(() => null),
      sbOqi<{ qator_id: number; raw_snapshot: { manba?: string; qatorlar?: SnapQator[] } | null }>({
        jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: 'qator_id,raw_snapshot', limit: 50000,
      }).catch(() => null),
    ]);
    if (!d.ok) throw new Error('Smeta o‘qilmadi.');
    const r = (d.qatorlar || []) as T2Qator[];
    if (!r.length) throw new Error('Bu obyektda smeta yo‘q — avval smetani import qiling.');
    const old = new Map<number, number>(), qol = new Map<number, number>();
    if (nak && nak.ok) {
      for (const q of nak.qatorlar) {
        old.set(q.qator_id, q.oldingi_hajm ?? 0);
        if (q.smeta_hajm != null) qol.set(q.qator_id, q.smeta_hajm - (q.oldingi_hajm ?? 0));
      }
      setOgoh('');
    } else setOgoh('Nakopitelniy o‘qilmadi — qoldiq ko‘rsatilmaydi, hajm nazorati faqat smeta hajmi bo‘yicha.');
    const x = new Map<string, number>();
    if (xot && xot.ok) for (const q of xot.qatorlar || []) {
      const s = q.raw_snapshot;
      if (s?.manba === 'f2_v3') for (const m of s.qatorlar ?? []) if (m.imzo) x.set(m.imzo, q.qator_id);
    }
    setRows(r); setOldingi(old); setQoldiq(qol); setXotira(x);
    return { r, qol, x };
  }

  async function moslash(a: F2Akt, r: T2Qator[], qol: Map<number, number>, x: Map<string, number>, rb: Map<string, number>, avvalgi?: IshJoyi | null) {
    setHolat('Moslashtirilmoqda (fonda)…');
    // Moslashtirish FONDA (Web Worker) — 30 ming qatorli smetada ham sahifa javob beradi.
    const n = await f2MoslashV3Fonda(a.daraxt, smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb });
    setNatija(n); setIj(boshlangich(n, avvalgi ?? undefined));
    const { aniq, xotira: xt, taklif, topilmadi } = n.stat;
    setHolat(`Moslashtirildi: ✓ ${aniq + xt} · ◐ ${taklif} · ✕ ${topilmadi}. ◐ larni tasdiqlang, ✕ larni torting.`);
  }

  // Obyekt + akt + davr tayyor bo'lsa — avtomatik moslashtirish.
  const kalit = objectId && akt && /^\d{4}-(0[1-9]|1[0-2])$/.test(davr) ? `${objectId}|${aktIdx}|${davr}|${akt.fayl}` : '';
  const oxirgiKalit = useRef('');
  useEffect(() => {
    if (!kalit || !akt || kalit === oxirgiKalit.current) return;
    oxirgiKalit.current = kalit;
    tozala(); setBusy(true); setHolat('Smeta, Nakopitelniy va xotira o‘qilmoqda…');
    void (async () => {
      try {
        const { r, qol, x } = await malumotYukla(Number(objectId), davr);
        await moslash(akt, r, qol, x, new Map());
        operation.current = yangiOperationId();
      } catch (e) { setXato(e instanceof Error ? e.message : 'Moslashtirish bajarilmadi.'); }
      finally { setBusy(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalit]);

  function rzOrgat(f2Uid: string, sRz: number) {
    if (!akt) return;
    const rb = new Map(rzBog); rb.set(f2Uid, sRz); setRzBog(rb);
    setBusy(true);
    void moslash(akt, rows, qoldiq, xotira, rb, ijRef.current)
      .catch((e) => setXato(e instanceof Error ? e.message : 'Moslashtirish bajarilmadi.'))
      .finally(() => setBusy(false));
  }

  async function smetaYangila(): Promise<T2Qator[]> {
    const d = await sbT2DaraxtOl(Number(objectId));
    if (!d.ok) throw new Error('Smeta yangilanmadi.');
    const r = (d.qatorlar || []) as T2Qator[];
    setRows(r);
    return r;
  }
  /** Faqat ko'rsatilgan qatorlarni o'qib, joriy smetaga qo'shadi/almashtiradi — 25–30 ming
   *  qatorli smetani har zamenadan keyin qayta yuklamaslik uchun (egasi: kuttiradi). */
  async function qatorlarniYangila(idlar: number[]): Promise<T2Qator[]> {
    const toza = [...new Set(idlar.filter((x) => Number.isSafeInteger(x) && x > 0))];
    if (!toza.length) return [];
    const d = await sbOqi<T2Qator>({ jadval: 't2_daraxt', filtr: `obyekt_id=eq.${objectId}&id=in.(${toza.join(',')})`, limit: toza.length });
    if (!d.ok) throw new Error('Yangi qatorlar o‘qilmadi.');
    const kelgan = (d.qatorlar || []) as T2Qator[];
    const yangi = new Map(kelgan.map((q) => [q.id, q]));
    setRows((old) => {
      const out = old.map((q) => yangi.get(q.id) ?? q);
      for (const q of yangi.values()) if (!old.some((x) => x.id === q.id)) out.push(q);
      return out;
    });
    return kelgan;
  }
  /** Qo'shimcha/zamena ish yaratildi — resurslari o'sha BITTA server amalida birga yaratilgan
   *  (`t2_ish_resurslar_bilan_yarat_v1`); bu yerda faqat bog'lanadi va yangi qatorlar o'qiladi. */
  async function yaratildi(f: F2Tugun, qatorId: number, resursIdlar?: number[]) {
    setBusy(true); setXato('');
    try {
      let joriy = bogla(ijRef.current!, f.uid, qatorId);
      const resIdlar = resursIdlar ?? [];
      if (f.tur === 'bl') f.bolalar.forEach((r, i) => { if (resIdlar[i] != null) joriy = bogla(joriy, r.uid, resIdlar[i]); });
      setIj(joriy);
      const kelgan = await qatorlarniYangila([qatorId, ...resIdlar]);
      // Otasi (razdel/ish) versiyasi o'zgardi — keyingi amal eskirgan versiya bilan ketmasin.
      const ota = kelgan.find((q) => q.id === qatorId)?.ota_id;
      if (ota != null) await qatorlarniYangila([ota]);
      const bogsiz = f.tur === 'bl' ? f.bolalar.length - resIdlar.length : 0;
      setHolat(bogsiz > 0 ? `Smetaga qo‘shildi; ${bogsiz} ta resurs bog‘lanmadi — qo‘lda bog‘lang.` : 'Smetaga qo‘shildi va bog‘landi.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Yaratish bajarilmadi.'); await smetaYangila().catch(() => undefined); }
    finally { setBusy(false); }
  }

  const yozish = useMemo(() => (ind && ij ? yozishManbasi(ind, ij) : null), [ind, ij]);
  const payload = useMemo(() => {
    if (!yozish || yozish.toxtatish.length) return null;
    try { return { rows: exactWrite(yozish.nodes, yozish.mapping), error: '' }; }
    catch (e) { return { rows: [], error: e instanceof Error ? e.message : 'Tekshiruv kerak.' }; }
  }, [yozish]);

  async function r2gaYukla(): Promise<number> {
    if (sourceDoc.current != null) return sourceDoc.current;
    const file = rawFile.current!;
    const buf = await file.arrayBuffer();
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const loyihaId = objects.find((o) => o.id === Number(objectId))?.loyiha_id ?? null;
    const fd = new FormData();
    fd.append('fayl', file); fd.append('kompaniya_id', String(companyId));
    if (loyihaId != null) fd.append('loyiha_id', String(loyihaId));
    fd.append('obyekt_id', objectId); fd.append('turi', 'f2_akt');
    fd.append('operation_id', sourceOp.current); fd.append('sha256', sha256); fd.append('size', String(file.size));
    const r = await fetch('/api/hujjat-yukla', { method: 'POST', body: fd });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; document_id?: number } | null;
    const id = j?.ok ? Number(j.document_id) : NaN;
    if (!r.ok || !Number.isSafeInteger(id) || id <= 0) throw new Error('F2 manba fayli R2 saqlashga qabul qilinmadi — yozish to‘xtatildi.');
    sourceDoc.current = id;
    return id;
  }

  async function saqla() {
    if (!akt || !ind || !yozish || !payload || payload.error || busy || done) return;
    setBusy(true); setXato(''); setHolat('Manba fayl saqlanmoqda…');
    try {
      const docId = await r2gaYukla();
      setHolat('F2 qoralamasi yozilmoqda…');
      const manba = new Map<number, Array<Record<string, unknown>>>();
      for (const n of yozish.nodes) {
        const id = yozish.mapping.get(n.uid)!;
        const t = ind.byUid.get(n.uid)!;
        const a = manba.get(id) ?? [];
        a.push({ uid: n.uid, imzo: yozish.imzolar.get(n.uid), kod: t.kod, nom: t.nom, birlik: t.birlik, hajm: t.hajm, narx: t.narx, summa: t.summa, bog: ij?.bog.get(n.uid)?.usul });
        manba.set(id, a);
      }
      const r = await sbT2AktYaratV2({
        obyektId: Number(objectId), oy: davr + '-01', operationId: operation.current,
        qatorlar: payload.rows.map((q) => ({
          ...q, rawSnapshot: { manba: 'f2_v3', hujjat_id: docId, fayl: akt.fayl, varaq: akt.varaq, davr, qatorlar: manba.get(q.qatorId) },
        })),
      });
      if (!r.ok) { setXato(`Hujjat saqlanmadi: ${r.xabar || r.error || r.sabab || 'xato'}. Tanlovni o‘zgartirmasdan qayta urinish mumkin.`); return; }
      setDone(`F2 qoralamasi saqlandi (akt #${r.akt_id ?? '?'}, ${payload.rows.length} qator). Tasdiqlangach Nakopitelniyga kiradi — F2 tarixi sahifasida.`);
      setHolat('Tayyor.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Yozish javobi olinmadi — qayta urinish ayni operatsiyani tekshiradi.'); }
    finally { setBusy(false); }
  }

  const jamiFarq = akt && akt.jami.pryamye != null ? akt.qatorlarJami - akt.jami.pryamye : null;
  const jamiFarqFoiz = jamiFarq != null && akt?.jami.pryamye != null && Math.abs(akt.jami.pryamye) > 0.005
    ? jamiFarq / Math.abs(akt.jami.pryamye) * 100
    : null;
  const selectedObjectName = objects.find((o) => o.id === Number(objectId))?.nom;
  return (
    <section className="w-full space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">F2 import</h1>
        <p role="status" className="text-[13px] text-text-dim">{holat}</p>
      </div>
      <fieldset disabled={busy} className="karta grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-[12px] font-medium text-text">Obyekt
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { oxirgiKalit.current = ''; tozala(); setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
            <option value="">Tanlang</option>{objects.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        <label className="block text-[12px] font-medium text-text">F2 fayl (XLSX)
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void faylTanla(f); }}
            className="input mt-1.5 block h-9 w-full px-2 py-1.5 text-[12px]" />
        </label>
        {aktlar.length > 1 && (
          <label className="block text-[12px] font-medium text-text">Akt varag‘i
            <select value={aktIdx} onChange={(e) => { const i = Number(e.target.value); setAktIdx(i); setDavr(aktlar[i].davr ?? davr); }}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
              {aktlar.map((a, i) => <option key={a.varaq} value={i}>{a.varaq} ({a.ishlarSoni} ish)</option>)}
            </select>
          </label>
        )}
        {akt && (
          <label className="block text-[12px] font-medium text-text">Hisobot davri {akt.davr ? <span className="font-normal text-text-mute">(fayldan: {akt.davrMatn})</span> : <span className="font-normal text-warn">(fayldan topilmadi)</span>}
            <input type="month" value={davr} onChange={(e) => setDavr(e.target.value)} disabled={!!ij && !!done}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]" />
          </label>
        )}
      </fieldset>

      {akt && (
        <section className="karta space-y-1 p-3 text-[12px]" aria-label="Akt">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span className="font-semibold text-text">{akt.fayl} · {akt.varaq}</span>
            <span className="text-text-dim">Ish: <b className="text-text">{akt.ishlarSoni}</b></span>
            <span className="text-text-dim">Qator (pul): <b className="text-text">{akt.barglarSoni}</b></span>
            <span className="text-text-dim">Hujjat ИТОГО ПРЯМЫЕ: <b className="text-text tabular-nums">{fmt(akt.jami.pryamye)}</b></span>
            <span className="text-text-dim">Qatorlar yig‘indisi: <b className={`tabular-nums ${jamiFarq != null && Math.abs(jamiFarq) > 1 ? 'text-warn' : 'text-ok'}`}>{fmt(akt.qatorlarJami)}</b></span>
            {akt.jami.ranee != null && <span className="text-text-dim">Ранее оформленным: <b className="tabular-nums text-text">{fmt(akt.jami.ranee)}</b></span>}
          </div>
          {jamiFarq != null && tiyingaYaxlitla(jamiFarq) !== 0 && (
            <p role="alert" className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-[12px] text-warn">
              Manba jami va qatorlar yig‘indisi mos emas: <b className="tabular-nums">{jamiFarq > 0 ? '+' : ''}{fmt(jamiFarq)} so‘m{jamiFarqFoiz != null ? ` (${jamiFarq > 0 ? '+' : ''}{fmt(jamiFarqFoiz)}%)` : ''}</b>.
              Importer qiymatlarni o‘zgartirmadi. Qator summalari va hujjatning jami formulasini tekshiring.
            </p>
          )}
          {akt.hujjatSarlavhasi && (
            <p className="text-[11px] text-text-dim">
              Fayl sarlavhasi: <span className="text-text">{akt.hujjatSarlavhasi}</span>
              {selectedObjectName && <> · Tanlangan obyekt: <span className="text-text">{selectedObjectName}</span></>}
            </p>
          )}
          {akt.ogohlantirishlar.length > 0 && (
            <details>
              <summary className="cursor-pointer text-warn">Hujjat bo‘yicha {akt.ogohlantirishlar.length} ta ogohlantirish</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-dim">
                {akt.ogohlantirishlar.map((o, i) => <li key={i}><b className="text-text">{o.kod}</b> — {o.izoh}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}
      {ogoh && <p className="text-[12px] text-warn">{ogoh}</p>}
      {xato && <p role="alert" className="text-[13px] text-danger">{xato}</p>}

      {akt && ind && natija && ij && (
        <F2V3Workbench akt={akt} ind={ind} natija={natija} S={S} raw={raw} oldingi={oldingi}
          ij={ij} onIj={setIj} onRzBog={rzOrgat} companyId={companyId} objectId={Number(objectId)}
          onYaratildi={yaratildi} disabled={busy || !!done} />
      )}

      {yozish && (
        <section className="karta space-y-2 p-3" aria-label="Saqlash">
          {yozish.toxtatish.map((t, i) => <p key={i} className="text-[12px] text-warn">{t}</p>)}
          {payload?.error && <p role="alert" className="text-[12px] text-danger">{payload.error}</p>}
          {done ? <p className="text-[13px] text-ok">{done}</p> : (
            <button type="button" className="tugma tugma-asosiy" disabled={busy || !payload || !!payload.error}
              onClick={() => void saqla()}>
              F2 qoralamasini saqlash{payload && !payload.error ? ` (${payload.rows.length} qator)` : ''}
            </button>
          )}
        </section>
      )}
    </section>
  );
}

export default function F2ImportV3() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
