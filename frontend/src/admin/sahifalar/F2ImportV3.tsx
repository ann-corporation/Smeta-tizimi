import { avvalgiF2Ol, qoralamaAktmi, type AvvalgiF2 } from '../../lib/f2-moslash-v3/takror';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sbOqi, sbT2AktYaratV2, sbT2F2QoralamaYangila, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator,
} from '../../api/supabase';
import { t2NakopitelniyToliq } from '../../api/t2-nakopitelniy';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { tiyingaYaxlitla, type F2Akt, type F2Tugun } from '../../lib/smeta-anatomiya/f2';
import { f2AktlarniOqiFonda, f2MoslashV3Fonda } from '../../lib/f2-moslash-v3/fonda';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import {
  bogla, boshlangich, f2Indeks, smetaIndeks, type IshJoyi,
} from '../../lib/f2-moslash-v3/ishJoyi';
import { exactWrite } from '../../lib/f2-exact-write';
import { qoshilganOzgardi as qoshilganOzgardiLib } from '../../lib/f2-moslash-v3/qoshilgan';
import { F2V3Workbench } from './F2V3Workbench';
import type { ModalRejali } from './F2AddReplModal';
import { ijniAlmashtir, vaqtinchami, rejaliniYoz, rejaliOchir, rejaliQatorlar, yangiTempIdlar, type RejaliBuyruq, type RejaliYaratish } from '../../lib/f2-moslash-v3/rejali';
import { sbT2IshResurslarBilanYarat, sbT2QoshimchaIshYarat, sbT2ResursBolaQosh, sbT2ZamenaIshYarat } from '../../api/t2-additional-replacement';
import { faylBaytlari, faylExplorerOl } from '../../api/t2-fayl';
import type { Fayl } from '../../lib/fayl-daraxt';
import { t } from '../../i18n/til';
import { f2IshchiOl, f2IshchiSaqla, f2ServerCorrectionSaqla, f2PendingCorrectionOl, type F2PendingCorrection, f2MinusTaklif, f2QoralamaBogTekshir, f2QoralamaYozish, f2ServerOl, f2ServerSaqla, type F2IshchiQoralama, type F2ServerQoralama } from '../../lib/f2-ishchi-qoralama';

/**
 * F2 IMPORT V3 (docs/architecture/F2_IMPORT_V3.md): fayl → akt (davr, jami, ogohlantirishlar
 * fayldan, ustun raqamlari so'ralmaydi) → operator tugmasi bilan moslash → ikki oynali drag-drop
 * ish joyi → F2 qoralamasi (`t2_akt_yarat_v2`), manba fayl R2 da.
 * Qoralama aktga faqat tasdiqlangan bog'lanishlar yoziladi; qolganlari ish qoralamasida saqlanadi.
 */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Tizimda (R2) saqlangan F2 fayllar: avval import qilingan manba va arxivlangan tasdiqlangan F2 — qayta yuklash shart emas. */
const TIZIM_F2_TURLARI = ['f2_akt', 'f2_hujjat'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));

function smetaQatorlari(rows: T2Qator[]): SmetaQator[] {
  return rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, norma: (q as T2Qator & { norma?: number | null }).norma ?? null, tartib: q.tartib }));
}

type SnapQator = { uid: string; imzo?: string };

/** Server ish qoralamasi kursoridagi rejali buyruqlar (eski qoralamada yo'q bo'lishi mumkin). */
const serverRejali = (c: unknown): RejaliBuyruq[] => {
  const r = (c as { rejali?: unknown } | null)?.rejali;
  return Array.isArray(r) ? (r as RejaliBuyruq[]) : [];
};

function Sessiya({ companyId }: { companyId: number }) {
  const workspace = usePTOWorkspace();
  const [objects, setObjects] = useState<T2Obyekt[]>([]);
  const [objectId, setObjectId] = useState('');
  const [aktlar, setAktlar] = useState<F2Akt[]>([]);
  const [aktIdx, setAktIdx] = useState(0);
  const [davr, setDavr] = useState('');
  const [rows, setRows] = useState<T2Qator[]>([]);
  // Rejali (hali yozilmagan) qo'shimcha/zamena/resurslar — egasi 2026-10-20: har birida kutmaslik, oxirida bittada yozish.
  const [rejali, setRejali] = useState<RejaliBuyruq[]>([]);
  const rejaliRef = useRef(rejali);
  rejaliRef.current = rejali;
  const [davomEt, setDavomEt] = useState(false);
  const [oldingi, setOldingi] = useState(new Map<number, number>());
  const [qoldiq, setQoldiq] = useState(new Map<number, number>());
  const [xotira, setXotira] = useState(new Map<string, number>());
  const [rzBog, setRzBog] = useState(new Map<string, number>());
  const [natija, setNatija] = useState<F2MoslashNatija | null>(null);
  const [ij, setIj] = useState<IshJoyi | null>(null);
  const [busy, setBusy] = useState(false);
  const [holat, setHolat] = useState('Obyekt va F2 faylni tanlang.');
  const [xato, setXato] = useState('');
  const [aktZiddiyat, setAktZiddiyat] = useState(false);
  const [avvalgi, setAvvalgi] = useState<{ key: string; akt: AvvalgiF2 | null; error: boolean } | null>(null);
  const [tekshiruv, setTekshiruv] = useState(0);
  const [ogoh, setOgoh] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [tizimFayllar, setTizimFayllar] = useState<Fayl[]>([]);
  const [tizimTanlov, setTizimTanlov] = useState('');
  const [saqlanganIsh, setSaqlanganIsh] = useState<F2IshchiQoralama | null>(null);
  const [ishSaqlandi, setIshSaqlandi] = useState('');
  const [ishXato, setIshXato] = useState('');
  const saveGeneration = useRef(0);
  const unsaved = useRef(false);
  const lastWorkingDraft = useRef<F2IshchiQoralama | null>(null);
  const serverDraft = useRef<F2ServerQoralama | undefined>(undefined);
  const [serverId, setServerId] = useState('');
  const [serverHolat, setServerHolat] = useState('');
  const rawFile = useRef<File | null>(null);
  const operation = useRef('');
  const sourceOp = useRef('');
  const sourceDoc = useRef<number | undefined>(undefined);
  const pendingCorrection = useRef<F2PendingCorrection | undefined>(undefined);
  const ijRef = useRef<IshJoyi | null>(null);
  ijRef.current = ij;
  // Qaytarish (egasi 2026-10-20: «qulayliklar»): operatorning mahalliy bog'lash/uzish/tasdiq/o'tkazish amallari tarixi.
  // Server yozuvi (yaratish, tuzatish, tiklash) tarixni tozalaydi — undo hech qachon kanonik qatorni qaytarmaydi.
  const tarix = useRef<IshJoyi[]>([]);
  const [tarixSoni, setTarixSoni] = useState(0);
  function ijOzgar(next: IshJoyi) {
    const cur = ijRef.current;
    if (cur && cur !== next) { tarix.current.push(cur); if (tarix.current.length > 200) tarix.current.shift(); setTarixSoni(tarix.current.length); }
    setIj(next);
  }
  function tarixniTozala() { tarix.current = []; setTarixSoni(0); }
  function orqaga() {
    const prev = tarix.current.pop();
    setTarixSoni(tarix.current.length);
    if (prev) { setIj(prev); setHolat('Oxirgi amal qaytarildi.'); }
  }
  const scopeRef = useRef(`${companyId}:${objectId}`);
  scopeRef.current = `${companyId}:${objectId}`;

  useEffect(() => {
    let active = true;
    void f2IshchiOl(companyId, objectId ? Number(objectId) : undefined)
      .then((d) => { if (active) setSaqlanganIsh(d); })
      .catch((e) => { if (active) setIshXato(e instanceof Error ? e.message : 'Qoralama o‘qilmadi.'); });
    return () => { active = false; };
  }, [companyId, objectId]);

  function ishSnapshot(): F2IshchiQoralama | null {
    const file = rawFile.current;
    if (!file || !ij || !natija || !aktlar[aktIdx] || !objectId) return null;
    return { version: 1, companyId, objectId: Number(objectId), savedAt: Date.now(), aktlar, aktIdx, davr,
      ij, natija, rzBog, source: { blob: file, name: file.name, lastModified: file.lastModified, documentId: sourceDoc.current },
      operationId: operation.current, sourceOperationId: sourceOp.current, server: serverDraft.current, correction: pendingCorrection.current, rejali: rejaliRef.current };
  }

  async function ishniSaqla(draft = ishSnapshot(), generation = ++saveGeneration.current) {
    if (!draft) return;
    try {
      await f2IshchiSaqla(draft);
      if (generation !== saveGeneration.current) return;
      unsaved.current = false; setIshXato(''); setSaqlanganIsh(draft);
      setIshSaqlandi(`Ish holati shu brauzerda saqlandi (${new Date(draft.savedAt).toLocaleTimeString()}). Bog‘lanmagan qatorlar ham saqlangan. Bu hali F2 akti emas.`);
    } catch (e) {
      if (generation !== saveGeneration.current) return;
      setIshXato(e instanceof Error ? e.message : 'Ish holati saqlanmadi. Sahifani yopmang.');
    }
  }

  useEffect(() => {
    if (!ij || !natija || busy || done) return;
    const scope = `${objectId}|${aktIdx}|${davr}|${aktlar[aktIdx]?.fayl}`;
    if (scope !== oxirgiKalit.current) return;
    unsaved.current = true;
    setIshSaqlandi('Ish holati saqlanmoqda…');
    const generation = ++saveGeneration.current;
    const draft = ishSnapshot();
    lastWorkingDraft.current = draft;
    const timer = window.setTimeout(() => { void ishniSaqla(draft, generation); }, 300);
    return () => window.clearTimeout(timer);
  // Snapshot includes all operator decisions and original file; never gated on resolved rows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ij, natija, rzBog, aktlar, aktIdx, davr, objectId, busy, done, rejali]);

  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => { if (unsaved.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);

  async function ishniTikla() {
    const d = saqlanganIsh;
    if (!d || d.companyId !== companyId || !objects.some((o) => o.id === d.objectId) || busy) return;
    setBusy(true); setXato('');
    try {
      const { r } = await malumotYukla(d.objectId, d.davr);
      const correction = f2PendingCorrectionOl(d.correction);
      const restored = correction ? qoshilganOzgardiLib(d.ij, f2Indeks(d.aktlar[d.aktIdx].daraxt), {
        eskiIdlar:new Set(correction.oldIds),yangiId:correction.newId,mavjud:new Set(r.map((q)=>q.id)),S:smetaIndeks(smetaQatorlari(r))}).ij
        : f2QoralamaBogTekshir(d.ij, new Set([...r.map((q) => q.id), ...(d.rejali ?? []).flatMap((b) => [b.tempId, ...b.resursTempIds])]));
      pendingCorrection.current=undefined;
      setRejali(d.rejali ?? []);
      // No auto-match effect may reset recovered manual decisions.
      oxirgiKalit.current = `${d.objectId}|${d.aktIdx}|${d.davr}|${d.aktlar[d.aktIdx].fayl}`;
      rawFile.current = new File([d.source.blob], d.source.name, { type: d.source.blob.type, lastModified: d.source.lastModified });
      sourceDoc.current = d.source.documentId; sourceOp.current = d.sourceOperationId; operation.current = d.operationId;
      serverDraft.current = d.server;
      setObjectId(String(d.objectId)); workspace.setObjectId(d.objectId);
      setAktlar(d.aktlar); setAktIdx(d.aktIdx); setDavr(d.davr); setRzBog(d.rzBog);
      setNatija(d.natija); tarixniTozala(); setIj(restored); setDone(null);
      setHolat('Saqlangan ish tiklandi. Smeta va oldingi F2 qayta o‘qildi.');
      if (restored.bog.size !== d.ij.bog.size) setXato('Ayrim smeta qatorlari o‘chirilgan: ularga bog‘lanish qayta tekshirilishi kerak.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Ish tiklanmadi; zaxira saqlanib turibdi.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    void sbT2ObyektlarOlKomp(companyId).then((r) => { if (active && r.ok) setObjects((r.qatorlar || []) as T2Obyekt[]); });
    return () => { active = false; };
  }, [companyId]);
  useEffect(() => {
    if (workspace.scope.objectId != null && objects.some((o) => o.id === workspace.scope.objectId)) setObjectId(String(workspace.scope.objectId));
  }, [objects, workspace.scope.objectId]);

  // Tizimdagi F2 fayllar ro'yxati (shu kompaniya, shu obyekt): kompyuterdan qayta yuklamasdan tanlash uchun.
  useEffect(() => {
    let active = true;
    if (!objectId) { setTizimFayllar([]); setTizimTanlov(''); return () => { active = false; }; }
    void faylExplorerOl(companyId).then((e) => {
      if (!active) return;
      setTizimFayllar(e.fayllar.filter((f) => f.obyekt_id === Number(objectId) && TIZIM_F2_TURLARI.includes(f.tur))
        .sort((a, b) => String(b.sana).localeCompare(String(a.sana)) || b.versiya - a.versiya));
    }).catch(() => { if (active) setTizimFayllar([]); });
    return () => { active = false; };
  }, [companyId, objectId]);

  const orqagaRef = useRef(orqaga);
  orqagaRef.current = orqaga;
  useEffect(() => {
    function tugma(e: globalThis.KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (!tarix.current.length) return;
      e.preventDefault(); orqagaRef.current();
    }
    window.addEventListener('keydown', tugma);
    return () => window.removeEventListener('keydown', tugma);
  }, []);

  const akt = aktlar[aktIdx] ?? null;
  const ind = useMemo(() => (akt ? f2Indeks(akt.daraxt) : null), [akt]);
  const avvalgiKalit = akt && objectId && /^\d{4}-(0[1-9]|1[0-2])$/.test(davr) ? `${companyId}:${objectId}:${davr}` : '';
  const joriyAvvalgi = avvalgi?.key === avvalgiKalit ? avvalgi : null;
  const takrorTekshirilmoqda = !!avvalgiKalit && !joriyAvvalgi;
  // Avvalgi F2 faqat YANGI aktni saqlashni to'xtatadi. Bog'lash, zamena va qo'shimcha — mahalliy/qo'shilgan qatorlar ishi,
  // ularni bloklash butun seansni qulflab qo'yardi (egasi 2026-10-20: «hech narsani bog'lab bo'lmay qoldi»).
  // Tekshiruv xatosi saqlashni to'xtatmaydi: takroriy identifikatsiyani server unique-cheklovi baribir rad etadi.
  // Mavjud QORALAMA akt bo'lsa saqlash uni yangilaydi; tasdiqlangan/yuborilgan akt bo'lsa yangi akt saqlanmaydi.
  const mavjudQoralama = qoralamaAktmi(joriyAvvalgi?.akt) ? joriyAvvalgi!.akt! as AvvalgiF2 & { versiya: number } : null;
  const saqlashBlok = takrorTekshirilmoqda || (!!joriyAvvalgi?.akt && !mavjudQoralama);
  useEffect(() => {
    if (!avvalgiKalit) return;
    let active = true;
    setAvvalgi(null);
    void avvalgiF2Ol(sbOqi, companyId, Number(objectId), davr)
      .then((a) => { if (active) setAvvalgi({ key: avvalgiKalit, akt: a, error: false }); })
      .catch(() => { if (active) setAvvalgi({ key: avvalgiKalit, akt: null, error: true }); });
    return () => { active = false; };
  }, [avvalgiKalit, tekshiruv, companyId, objectId, davr, akt]);

  // Daraxtda haqiqiy qatorlar + rejali (vaqtinchalik, manfiy id) qatorlar.
  const rowsK = useMemo(() => (rejali.length ? [...rows, ...rejaliQatorlar(rejali, rows)] : rows), [rows, rejali]);
  const S = useMemo(() => smetaIndeks(smetaQatorlari(rowsK)), [rowsK]);
  const raw = useMemo(() => new Map(rowsK.map((r) => [r.id, r])), [rowsK]);
  // Zamena qatori → u almashtirgan ASL smeta qatori (t2_daraxt da yo'q — alohida, faqat zamena qatorlari uchun).
  const [zamenaAsl, setZamenaAsl] = useState<ReadonlyMap<number, number>>(new Map());
  const zamenaKalit = useMemo(() => rows.filter((r) => r.zamena).map((r) => r.id).join(','), [rows]);
  useEffect(() => {
    const idlar = zamenaKalit ? zamenaKalit.split(',') : [];
    if (!idlar.length || !objectId) { setZamenaAsl(new Map()); return; }
    let active = true;
    void sbOqi<{ id: number; replaces_line_id: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${objectId}&id=in.(${idlar.slice(0, 2000).join(',')})`, ustunlar: 'id,replaces_line_id', limit: 2000 })
      .then((d) => {
        if (!active || !d.ok) return;
        setZamenaAsl(new Map((d.qatorlar ?? []).filter((x) => x.replaces_line_id != null).map((x) => [Number(x.id), Number(x.replaces_line_id)])));
      }).catch(() => undefined);
    return () => { active = false; };
  }, [zamenaKalit, objectId]);

  const zamenaAslK = useMemo(() => {
    const qosh = rejali.filter((b) => b.kind === 'replacement' && b.almashtirilayotganQatorId != null);
    if (!qosh.length) return zamenaAsl;
    const m = new Map(zamenaAsl);
    for (const b of qosh) m.set(b.tempId, b.almashtirilayotganQatorId as number);
    return m;
  }, [zamenaAsl, rejali]);

  function tozala() {
    // Scope/file switch must flush pending decisions before clearing in-memory state.
    const draft = lastWorkingDraft.current;
    if (draft) void f2IshchiSaqla(draft).catch((e) => setIshXato(e instanceof Error ? e.message : 'Oldingi ish saqlanmadi.'));
    pendingCorrection.current = undefined;
    ++saveGeneration.current; setIshSaqlandi(''); setServerHolat(''); serverDraft.current = undefined;
    setNatija(null); tarixniTozala(); setRejali([]); setIj(null); setDone(null); setXato(''); setRzBog(new Map()); operation.current = '';
  }

  /** `mavjudHujjatId` berilsa — fayl tizimdagi R2 hujjatidan olingan: yozishda QAYTA yuklanmaydi, o'sha hujjat manba bo'ladi. */
  async function faylTanla(file: File, mavjudHujjatId?: number) {
    oxirgiKalit.current = '';
    tozala(); setAktlar([]); setBusy(true); setHolat('Fayl o‘qilmoqda…');
    rawFile.current = file; sourceDoc.current = mavjudHujjatId; sourceOp.current = yangiOperationId();
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Fayl 50 MB dan katta.');
      // Fayl o'qish va akt tahlili FONDA (Web Worker) — katta faylda sahifa qotmaydi.
      const a = await f2AktlarniOqiFonda(file.name, file);
      if (!a.length) throw new Error('Faylda F2 akt varag‘i topilmadi (ishlar ro‘yxati bor LRV shaklidagi varaq kerak).');
      setAktlar(a); setAktIdx(0); setDavr(a[0].davr ?? '');
      setHolat(a[0].davr ? 'Akt o‘qildi. Mos qatorlarni bog‘lash tugmasini bosing yoki qo‘lda bog‘lang.' : 'Akt o‘qildi. Hisobot davrini tanlang.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Fayl o‘qilmadi.'); setHolat('Fayl o‘qilmadi.'); }
    finally { setBusy(false); }
  }

  async function tizimdanTanla(id: number) {
    const f = tizimFayllar.find((x) => x.id === id);
    if (!f) return;
    setTizimTanlov(String(id)); tozala(); setAktlar([]); setBusy(true); setHolat(t('Tizimdagi F2 fayl yuklanmoqda…'));
    try {
      const bytes = await faylBaytlari(id);
      const nom = /\.xls[xm]$/i.test(f.nom) ? f.nom : f.nom + '.xlsx';
      await faylTanla(new File([bytes.slice()], nom, { type: f.mime || XLSX_MIME }), id);
    } catch (e) { setXato(e instanceof Error ? e.message : t('Tizimdagi fayl ochilmadi.')); setHolat(t('Fayl o‘qilmadi.')); setBusy(false); }
  }

  /** Smeta, oldingi F2 (Nakopitelniy) va xotira (o'tgan F2 larning imzolari). */
  async function malumotYukla(oid: number, oy: string, joriymi = () => true) {
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
    if (!joriymi()) return { r, qol, x: new Map<string, number>() };
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
    const ishBog = new Map([...avvalgi?.bog ?? []].filter(([, b]) => b.holat !== 'taklif').map(([uid, b]) => [uid, b.qatorId]));
    const n = await f2MoslashV3Fonda(a.daraxt, smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb, ishBog });
    setNatija(n); ijOzgar(boshlangich(n, avvalgi ?? undefined));
    const { aniq, xotira: xt, taklif, topilmadi } = n.stat;
    setHolat(`Moslashtirildi: ✓ ${aniq + xt} · ◐ ${taklif} · ✕ ${topilmadi}. ◐ larni tasdiqlang, ✕ larni torting.`);
  }

  // Selection only loads source/estimate. Linking requires an explicit operator action.
  const kalit = objectId && akt && /^\d{4}-(0[1-9]|1[0-2])$/.test(davr) ? `${objectId}|${aktIdx}|${davr}|${akt.fayl}` : '';
  const oxirgiKalit = useRef('');
  useEffect(() => {
    if (!kalit || !akt || kalit === oxirgiKalit.current) return;
    oxirgiKalit.current = kalit;
    let active = true;
    tozala(); setBusy(true); setHolat('Smeta, Nakopitelniy va xotira o‘qilmoqda…');
    void (async () => {
      try {
        const { r } = await malumotYukla(Number(objectId), davr, () => active);
        if (!active) return;
        setNatija({ natijalar: new Map(), rzDiag: [], stat: { aniq: 0, xotira: 0, taklif: 0, topilmadi: f2Indeks(akt.daraxt).qatorlar.length } });
        tarixniTozala(); setIj({ bog: new Map(), otkaz: new Set() });
        setHolat('F2 va smeta tayyor. Mos qatorlarni bog‘lash tugmasini bosing yoki qo‘lda bog‘lang.');
        operation.current = yangiOperationId();
      } catch (e) { if (active) setXato(e instanceof Error ? e.message : 'Smeta yuklanmadi.'); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalit, akt]);

  async function aniqBogla() {
    if (!akt || !ij || busy || done) return;
    setBusy(true); setXato('');
    try { await moslash(akt, rows, qoldiq, xotira, rzBog, ijRef.current); }
    catch (e) { setXato(e instanceof Error ? e.message : 'Moslashtirish bajarilmadi.'); }
    finally { setBusy(false); }
  }

  function rzOrgat(f2Uid: string, sRz: number) {
    if (!akt) return;
    const rb = new Map(rzBog); rb.set(f2Uid, sRz); setRzBog(rb);
    setBusy(true);
    void moslash(akt, rows, qoldiq, xotira, rb, ijRef.current)
      .catch((e) => setXato(e instanceof Error ? e.message : 'Moslashtirish bajarilmadi.'))
      .finally(() => setBusy(false));
  }

  async function smetaYangila(): Promise<T2Qator[]> {
    const scope=`${companyId}:${objectId}`;
    const d = await sbT2DaraxtOl(Number(objectId));
    if (scopeRef.current!==scope) throw new Error('F2_SCOPE_CHANGED');
    if (!d.ok || d.toliq === false) throw new Error('Smeta to‘liq yangilanmadi. Bog‘lanishlar saqlangan — qayta urinib ko‘ring.');
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
      tarixniTozala(); setIj(joriy);
      const kelgan = await qatorlarniYangila([qatorId, ...resIdlar]);
      // Otasi (razdel/ish) versiyasi o'zgardi — keyingi amal eskirgan versiya bilan ketmasin.
      const ota = kelgan.find((q) => q.id === qatorId)?.ota_id;
      if (ota != null) await qatorlarniYangila([ota]);
      const bogsiz = f.tur === 'bl' ? f.bolalar.length - resIdlar.length : 0;
      setHolat(bogsiz > 0 ? `Smetaga qo‘shildi; ${bogsiz} ta resurs bog‘lanmadi — qo‘lda bog‘lang.` : 'Smetaga qo‘shildi va bog‘landi.');
    } catch (e) { setXato(e instanceof Error ? e.message : 'Yaratish bajarilmadi.'); await smetaYangila().catch(() => undefined); }
    finally { setBusy(false); }
  }
  /** Siz qo'shgan qator tahrirlandi (server eskisini arxivlab yangisini yaratdi → yangiId) yoki o'chirildi.
   *  Smeta yangilanadi; eskisiga bog'langan F2 qatori yangisiga o'tadi yoki ✕ ga qaytadi (qayta bog'lash uchun). */
  async function qoshilganOzgardi(eskiIdlar: number[], yangiId?: number | null) {
    if (!ind || !ijRef.current) throw new Error('F2 ish holati topilmadi.');
    const scope=`${companyId}:${objectId}`;
    setBusy(true); setXato('');
    pendingCorrection.current = {oldIds:[...eskiIdlar],newId:yangiId??null};
    const draft=ishSnapshot();
    if (draft) lastWorkingDraft.current=draft;
    try {
      if (!draft) throw new Error('F2 ish holati topilmadi.');
      await f2IshchiSaqla(draft);
      await f2ServerCorrectionSaqla(draft);
      const r = await smetaYangila();
      const t2 = qoshilganOzgardiLib(ijRef.current, ind, { eskiIdlar: new Set(eskiIdlar), yangiId, mavjud: new Set(r.map((q) => q.id)), S: smetaIndeks(smetaQatorlari(r)) });
      const finalDraft={...draft,ij:t2.ij,correction:undefined,savedAt:Date.now()};
      if (draft.server && draft.source.documentId) await f2ServerSaqla(finalDraft,draft.source.documentId,draft.server);
      await f2IshchiSaqla(finalDraft);
      if (scopeRef.current!==scope) throw new Error('F2_SCOPE_CHANGED');
      pendingCorrection.current=undefined;
      tarixniTozala(); setIj(t2.ij); setSaqlanganIsh(finalDraft); lastWorkingDraft.current=finalDraft;
      setHolat(t2.uzildi ? `${t2.uzildi} ta F2 qatori bo‘shadi — ✕ belgili qatorlarni qayta bog‘lang.` : t2.qaytaBoglandi ? 'Yangi qatorga qayta bog‘landi.' : 'Smeta yangilandi.');
    } catch (e) { if (scopeRef.current===scope) setXato(e instanceof Error ? e.message : 'Smeta yangilanmadi.'); throw e; }
    finally { if (scopeRef.current===scope) setBusy(false); }
  }

  const yozish = useMemo(() => (ind && ij ? f2QoralamaYozish(ind, ij) : null), [ind, ij]);
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

  async function servergaSaqla() {
    const draft = ishSnapshot();
    if (!draft || busy) return;
    setBusy(true); setXato(''); setServerHolat('');
    try {
      const docId = await r2gaYukla();
      draft.source.documentId = docId;
      await f2ServerSaqla(draft, docId, serverDraft.current);
      serverDraft.current = draft.server; setServerId(String(draft.server!.jobId));
      await ishniSaqla(draft);
      setServerHolat(`F2 ish qoralamasi serverda saqlandi: #${draft.server!.jobId}. Bog‘lanmagan va minus qatorlar ham saqlangan. Boshqa kompyuterda shu raqam orqali davom ettirish mumkin. Akt va Nakopitelniy o‘zgarmadi.`);
    } catch (e) {
      serverDraft.current = draft.server;
      // Preserve acknowledged batch versions even when a later request fails.
      await ishniSaqla(draft);
      setXato(e instanceof Error ? e.message : 'Server qoralamasi to‘liq saqlanmadi.');
    } finally { setBusy(false); }
  }

  async function serverdanTikla() {
    const id = Number(serverId);
    if (!Number.isSafeInteger(id) || id <= 0 || busy || ij) return;
    setBusy(true); setXato('');
    try {
      const d = await f2ServerOl(id);
      if (!objects.some((o) => o.id === d.objectId)) throw new Error('Qoralama tanlangan kompaniya obyektiga tegishli emas.');
      const c = d.cursor;
      const docId = Number(c.sourceDocumentId), idx = Number(c.actIdx), month = String(c.month ?? '');
      if (!Number.isSafeInteger(docId) || docId <= 0 || !Number.isSafeInteger(idx) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Qoralama manbasi yoki davri noaniq.');
      const bytes = await faylBaytlari(docId);
      const file = new File([bytes.slice()], String(c.file), { type: XLSX_MIME });
      const acts = await f2AktlarniOqiFonda(file.name, file);
      const a = acts[idx];
      if (!a) throw new Error('Qoralamadagi akt varag‘i manba faylida topilmadi.');
      const byUid = f2Indeks(a.daraxt).byUid;
      if (f2Indeks(a.daraxt).qatorlar.length !== d.sourceRows.length || d.sourceRows.some((s) => {
        const n = byUid.get(s.uid); return !n || n.hajm !== s.hajm || n.narx !== s.narx || n.summa !== s.summa;
      })) throw new Error('Manba qatorlari saqlangan qoralamaga mos emas. Bog‘lanishlar taxmin bilan tiklanmaydi.');
      const { r, qol, x } = await malumotYukla(d.objectId, month);
      const rb = new Map(c.rzBog as Array<[string, number]>);
      const result = await f2MoslashV3Fonda(a.daraxt, smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb });
      oxirgiKalit.current = `${d.objectId}|${idx}|${month}|${a.fayl}`;
      rawFile.current = file; sourceDoc.current = docId; sourceOp.current = String(c.sourceOperationId); operation.current = String(c.writeOperationId);
      serverDraft.current = d.state; setObjectId(String(d.objectId)); workspace.setObjectId(d.objectId);
      setAktlar(acts); setAktIdx(idx); setDavr(month); setRzBog(rb); setNatija(result);
      const correction=f2PendingCorrectionOl(c.correction);
      const restored=correction ? qoshilganOzgardiLib(d.ij,f2Indeks(a.daraxt),{
        eskiIdlar:new Set(correction.oldIds),yangiId:correction.newId,mavjud:new Set(r.map((q)=>q.id)),S:smetaIndeks(smetaQatorlari(r))}).ij
        : f2QoralamaBogTekshir(d.ij,new Set([...r.map((q)=>q.id), ...serverRejali(c).flatMap((b) => [b.tempId, ...b.resursTempIds])]));
      pendingCorrection.current=undefined;
      setRejali(serverRejali(c));
      tarixniTozala(); setIj(restored); setDone(null);
      setServerHolat(`Serverdagi F2 ish qoralamasi #${id} tiklandi. Hal qilinmagan qatorlar ham saqlangan.`);
    } catch (e) { setXato(e instanceof Error ? e.message : 'Server qoralamasi tiklanmadi.'); }
    finally { setBusy(false); }
  }

  /** Modal tasdiqlagan qo'shimcha/zamena/resurs — DARHOL qoralamaga (serverga emas). F2 qatori vaqtinchalik qatorga bog'lanadi. */
  function onRejali(f: F2Tugun, b: ModalRejali) {
    if (!ijRef.current) return;
    const ids = yangiTempIdlar(rejaliRef.current.flatMap((x) => [x.tempId, ...x.resursTempIds]), 1 + b.resurslar.length);
    const buyruq: RejaliBuyruq = { ...b, tempId: ids[0], resursTempIds: ids.slice(1), f2Uid: f.uid, f2ResursUidlar: f.tur === 'bl' ? f.bolalar.map((r) => r.uid) : [] };
    let joriy = bogla(ijRef.current, f.uid, buyruq.tempId);
    if (f.tur === 'bl') f.bolalar.forEach((r, i) => { const tid = buyruq.resursTempIds[i]; if (tid != null) joriy = bogla(joriy, r.uid, tid); });
    const keyingi = [...rejaliRef.current, buyruq];
    rejaliRef.current = keyingi;
    ijRef.current = joriy;
    setRejali(keyingi); tarixniTozala(); setIj(joriy);
    setHolat(`${keyingi.length} ${t('ta o‘zgarish qoralamada — «Saqlash» bosilganda bittada yoziladi.')}`);
  }
  function onRejaliOchir(tempId: number) {
    if (!ijRef.current) return;
    const r = rejaliOchir(rejaliRef.current, ijRef.current, tempId);
    rejaliRef.current = r.buyruqlar;
    setRejali(r.buyruqlar); tarixniTozala(); setIj(r.ij);
  }
  const rejaliYarat: RejaliYaratish = async (b, real) => {
    const asos = { kompaniyaId: companyId, obyektId: Number(objectId), otaQatorId: real.otaQatorId, nom: b.nom, birlik: b.birlik,
      hajm: b.hajm as number, kod: b.kod, sabab: b.sabab, operationId: b.operationId, expectedVersion: real.otaVersiya, keyinQatorId: real.keyinQatorId };
    const tekshir = (r: { ok: boolean; qator_id?: number | null; xabar?: string; error?: string }) => {
      if (!r.ok || r.qator_id == null) throw new Error(r.xabar || r.error || t('Saqlanmadi.'));
      return r.qator_id;
    };
    if (b.resurslar.length && b.kind !== 'resource') {
      const rr = await sbT2IshResurslarBilanYarat({ ...asos, command: b.kind === 'replacement' ? 'replacement' : 'additional',
        almashtirilayotganQatorId: real.almashtirilayotganQatorId, resurslar: b.resurslar });
      return { qatorId: tekshir(rr), resursIdlar: rr.resurs_qator_idlar ?? [], otaVersiya: (rr as { parent_version?: number | null }).parent_version ?? null };
    }
    const r = b.kind === 'replacement'
      ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: real.almashtirilayotganQatorId as number })
      : b.kind === 'additional' && b.tur === 'bl' ? await sbT2QoshimchaIshYarat(asos)
        : await sbT2ResursBolaQosh({ ...asos, tur: b.tur === 'bl' ? 'rs' : b.tur, hajm: b.hajm });
    return { qatorId: tekshir(r), resursIdlar: [], otaVersiya: (r as { parent_version?: number | null }).parent_version ?? null };
  };
  async function otaVersiya(id: number): Promise<number> {
    const d = await sbOqi<{ id: number; versiya: number }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${objectId}&id=eq.${id}`, ustunlar: 'id,versiya', limit: 1 });
    const v = d.qatorlar?.[0]?.versiya;
    if (!d.ok || v == null) throw new Error(t('Ota qator versiyasi o‘qilmadi.'));
    return Number(v);
  }
  /** Rejali buyruqlarni yozadi; muvaffaqiyatda true. Xatoda yozilganlari bog'lanadi, qolganlari qoralamada qoladi. */
  async function rejaliniQolla(): Promise<boolean> {
    const jami = rejaliRef.current.length;
    setBusy(true); setXato('');
    try {
      const r = await rejaliniYoz(rejaliRef.current, { yarat: rejaliYarat, versiya: otaVersiya,
        progress: (i, n) => setHolat(`${t('O‘zgarishlar yozilmoqda')}: ${i}/${n}…`) });
      if (r.map.size && ijRef.current) {
        const yangiIj = ijniAlmashtir(ijRef.current, r.map);
        const otalar = rejaliRef.current.filter((b) => r.map.has(b.tempId)).map((b) => (vaqtinchami(b.otaQatorId) ? r.map.get(b.otaQatorId) : b.otaQatorId)).filter((x): x is number => x != null);
        rejaliRef.current = r.qolgan;
        setRejali(r.qolgan); tarixniTozala(); setIj(yangiIj);
        await qatorlarniYangila([...r.map.values(), ...otalar]).catch(() => smetaYangila());
      } else { rejaliRef.current = r.qolgan; setRejali(r.qolgan); }
      if (r.xato) {
        setXato(`${jami - r.qolgan.length}/${jami} ${t('ta o‘zgarish yozildi, keyin to‘xtadi')}: ${r.xato}. ${t('Qolganlari qoralamada saqlangan — «Saqlash»ni qayta bosing.')}`);
        return false;
      }
      setHolat(`${jami} ${t('ta o‘zgarish yozildi. Akt tuzilmoqda…')}`);
      return true;
    } finally { setBusy(false); }
  }
  // Rejali yozilgach state yangilanadi (haqiqiy id lar) — shundan keyin akt avtomatik saqlanadi.
  useEffect(() => {
    if (!davomEt || busy || rejali.length) return;
    setDavomEt(false);
    void saqla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [davomEt, busy, rejali]);

  async function saqla() {
    if (!akt || !ind || !yozish || !payload || payload.error || busy || done || saqlashBlok) return;
    if (rejaliRef.current.length) { if (await rejaliniQolla()) setDavomEt(true); return; }
    setBusy(true); setXato(''); setAktZiddiyat(false); setHolat('Manba fayl saqlanmoqda…');
    try {
      const docId = await r2gaYukla();
      // До финансового черновика сохраняем ВСЕ строки/решения, включая неразрешённые минусы.
      const draft = ishSnapshot();
      if (!draft) throw new Error('F2 ish holati topilmadi.');
      draft.source.documentId = docId;
      try { await f2ServerSaqla(draft, docId, serverDraft.current); }
      finally { serverDraft.current = draft.server; await ishniSaqla(draft); }
      setServerId(String(draft.server!.jobId));
      setHolat('F2 qoralamasi yozilmoqda…');
      const manba = new Map<number, Array<Record<string, unknown>>>();
      for (const n of yozish.nodes) {
        const id = yozish.mapping.get(n.uid)!;
        const t = ind.byUid.get(n.uid)!;
        const a = manba.get(id) ?? [];
        a.push({ uid: n.uid, imzo: yozish.imzolar.get(n.uid), kod: t.kod, nom: t.nom, birlik: t.birlik, hajm: t.hajm, narx: t.narx, summa: t.summa, bog: ij?.bog.get(n.uid)?.usul });
        manba.set(id, a);
      }
      const qatorlar = payload.rows.map((q) => ({
          ...q, rawSnapshot: { manba: 'f2_v3', hujjat_id: docId, fayl: akt.fayl, varaq: akt.varaq, davr, qatorlar: manba.get(q.qatorId),
            import_job_id: draft.server!.jobId, partial: yozish.qolgan.length > 0,
            unresolved_count: yozish.qolgan.length },
        }));
      const r = mavjudQoralama
        ? await sbT2F2QoralamaYangila({ kompaniyaId: companyId, aktId: mavjudQoralama.id, kutilganVersiya: mavjudQoralama.versiya, operationId: yangiOperationId(), qatorlar })
        : await sbT2AktYaratV2({ obyektId: Number(objectId), oy: davr + '-01', operationId: operation.current, qatorlar });
      if (!r.ok) {
        if ((r as { code?: string }).code === 'F2_ACT_NUMBER_CONFLICT') {
          setAktZiddiyat(true);
          setXato('Shu obyekt va oy uchun bu raqamdagi F2 allaqachon mavjud. Tanlovlaringiz ish qoralamasida saqlangan. Tasdiqlangan aktni qayta import bilan almashtirib bo‘lmaydi.');
        } else if ((r as { code?: string }).code === 'STALE_VERSION') {
          setTekshiruv((v) => v + 1);
          setXato('F2 qoralama boshqa joyda o‘zgargan. Yangi holati o‘qildi — «Saqlash»ni yana bosing. Bog‘lanishlar saqlangan.');
        } else setXato(`Hujjat saqlanmadi: ${r.xabar || r.error || r.sabab || 'xato'}. Tanlovni o‘zgartirmasdan qayta urinish mumkin.`);
        return;
      }
      setTekshiruv((v) => v + 1);
      setDone(`F2 qoralamasi ${mavjudQoralama ? 'yangilandi' : 'saqlandi'} (akt #${r.akt_id ?? '?'}, ${payload.rows.length} qator). Tasdiqlangach Nakopitelniyga kiradi — F2 tarixi sahifasida.`);
      if (yozish.qolgan.length) setServerHolat(`Diqqat: ${yozish.qolgan.length} ta bog‘lanmagan yoki tasdiqlanmagan qator aktga kiritilmadi. Ular manba faylida va server ish qoralamasi #${draft.server!.jobId} da saqlangan. Akt faqat tasdiqlangan bog‘lanishlardan tuzildi.`);
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
        <h1 className="text-lg font-semibold sm:text-xl">{t('F2 import')}</h1>
        <p role="status" className="text-[13px] text-text-dim">{holat}</p>
      </div>
      <section className="karta space-y-2 p-3" aria-label={t('Ish holati')}>
        <p className="text-[12px]">{ishSaqlandi || t('Bog‘lash jarayoni avtomatik shu kompyuter va brauzerda saqlanadi. Brauzer ma’lumotlarini tozalamang.')}</p>
        {ishXato && <p role="alert" className="text-danger">{ishXato} {t('Saqlanganini tasdiqlamaguncha sahifani yopmang.')}</p>}
        {ij && <button type="button" className="tugma" disabled={busy} onClick={() => void ishniSaqla()}>{t('Ish holatini saqlash (davom ettirish uchun)')}</button>}
        {ij && !done && <button type="button" className="tugma" disabled={busy} onClick={() => void servergaSaqla()}>{t('Server ish holatini saqlash')}</button>}
        {serverHolat && <p role="status">{serverHolat}</p>}
        {!ij && <label className="block text-[12px]">{t('Server qoralamasi raqami')}
          <input aria-label={t('Server qoralamasi raqami')} type="number" min="1" value={serverId} onChange={(e) => setServerId(e.target.value)} className="input mx-2" />
          <button type="button" className="tugma" disabled={busy || !serverId} onClick={() => void serverdanTikla()}>{t('Serverdagi qoralamani davom ettirish')}</button>
        </label>}
        {!ij && saqlanganIsh && objects.some((o) => o.id === saqlanganIsh.objectId) && <button type="button" className="tugma" disabled={busy} onClick={() => void ishniTikla()}>
          {t('Saqlangan ishni davom ettirish:')} {saqlanganIsh.source.name} · {saqlanganIsh.davr}
        </button>}
      </section>
      <fieldset disabled={busy} className="karta grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-[12px] font-medium text-text">{t('Obyekt')}
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { oxirgiKalit.current = ''; tozala(); setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
            <option value="">Tanlang</option>{objects.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
        </label>
        <label className="block text-[12px] font-medium text-text">F2 fayl (XLSX)
          <input type="file" accept=".xlsx,.xlsm" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setTizimTanlov(''); void faylTanla(f); } }}
            className="input mt-1.5 block h-9 w-full px-2 py-1.5 text-[12px]" />
        </label>
        {tizimFayllar.length > 0 && (
          <label className="block text-[12px] font-medium text-text">{t('Yoki tizimdagi F2 fayldan (qayta yuklanmaydi)')}
            <select aria-label={t('Tizimdagi F2 fayl')} value={tizimTanlov} onChange={(e) => { if (e.target.value) void tizimdanTanla(Number(e.target.value)); }}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
              <option value="">{t('— tizimdagi fayl —')}</option>
              {tizimFayllar.map((f) => <option key={f.id} value={f.id}>{f.nom} · v{f.versiya} · {f.davr ?? String(f.sana).slice(0, 10)}</option>)}
            </select>
          </label>
        )}
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
              Manba jami va qatorlar yig‘indisi mos emas: <b className="tabular-nums">{jamiFarq > 0 ? '+' : ''}{fmt(jamiFarq)} so‘m{jamiFarqFoiz != null ? ` (${jamiFarq > 0 ? '+' : ''}${fmt(jamiFarqFoiz)}%)` : ''}</b>.
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
      {akt && avvalgiKalit && (takrorTekshirilmoqda || joriyAvvalgi?.error || joriyAvvalgi?.akt) && <section
        role={joriyAvvalgi?.akt || joriyAvvalgi?.error ? 'alert' : 'status'} className="karta border border-warn/50 bg-warn/10 p-3 text-[13px] text-warn">
        {takrorTekshirilmoqda ? <p>{t('Avval kiritilgan F2 tekshirilmoqda…')}</p> : joriyAvvalgi?.error ? <>
          <p>{t('Avvalgi F2 tekshirilmadi. Takroriy akt yaratmaslik uchun qayta tekshiring. Bog‘lanishlar saqlanadi.')}</p>
          <button type="button" className="tugma mt-2" onClick={() => setTekshiruv((v) => v + 1)}>{t('Qayta tekshirish')}</button>
        </> : joriyAvvalgi?.akt && <>
          <p className="font-semibold">{mavjudQoralama
            ? t('Bu oy uchun F2 qoralama bor. Bog‘lashni davom ettiring — «Saqlash» shu qoralamani yangilaydi.')
            : t('Bu obyekt va oy uchun F2 akt allaqachon bor. Bog‘lashni davom ettirishingiz mumkin — faqat yangi akt saqlanmaydi.')}</p>
          <p>#{joriyAvvalgi.akt.id} · {joriyAvvalgi.akt.oy.slice(0, 7)} · {joriyAvvalgi.akt.lifecycle_status ?? joriyAvvalgi.akt.holat}</p>
          <p>{t('Mavjud aktni oching. Yangi fayl tuzatish bo‘lsa, uni alohida tuzatish tartibida kiriting; amaldagi akt o‘zgartirilmadi.')}</p>
          <a href={`/admin/f2-tarix?obyekt=${Number(objectId)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>
        </>}
      </section>}
      {ogoh && <p className="text-[12px] text-warn">{ogoh}</p>}
      {xato && <div role="alert" className="text-[13px] text-danger"><p>{xato}</p>{aktZiddiyat && <a
        href={`/admin/f2-tarix?obyekt=${Number(objectId)}`} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-block underline text-accent">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>}</div>}

      {akt && ij && <section className="karta flex flex-wrap items-center gap-3 border border-accent/30 p-3" aria-label={t('Moslashtirish')}>
        <button type="button" className="tugma tugma-asosiy" disabled={busy || !!done} onClick={() => void aniqBogla()}>{t('Mos qatorlarni bog‘lash')}</button>
        <button type="button" className="tugma" disabled={busy || !!done || !tarixSoni} onClick={orqaga} title={t('Oxirgi bog‘lash, uzish yoki tasdiqni qaytarish (Ctrl+Z)')}>↶ {t('Orqaga')}{tarixSoni ? ` (${tarixSoni})` : ''}</button>
        <p className="min-w-0 flex-1 text-[12px] text-text-dim">{t('Faqat ishonchli mosliklar bog‘lanadi. Noaniq variantlarni siz tasdiqlaysiz. Qo‘lda tasdiqlangan bog‘lanishlar saqlanadi.')}</p>
      </section>}

      {akt && ind && natija && ij && (
        <F2V3Workbench akt={akt} ind={ind} natija={natija} S={S} raw={raw} oldingi={oldingi}
          ij={ij} onIj={ijOzgar} onRzBog={rzOrgat} companyId={companyId} objectId={Number(objectId)}
          onYaratildi={yaratildi} zamenaAsl={zamenaAslK} onQoshilganOzgardi={qoshilganOzgardi} onRejali={onRejali} onRejaliOchir={onRejaliOchir} rejaliIdlar={() => rejaliRef.current.map((b) => b.tempId)} disabled={busy || !!done} />
      )}

      {rejali.length > 0 && <section className="karta space-y-1 border border-sky-500/40 bg-sky-500/5 p-3 text-[12px]" aria-label={t('Saqlanmagan o‘zgarishlar')}>
        <p className="font-semibold text-text">⏳ {rejali.length} {t('ta qo‘shimcha/zamena qoralamada — «Saqlash» bosilganda hammasi bittada yoziladi.')}</p>
        <ul className="max-h-40 space-y-0.5 overflow-auto">{rejali.map((b) => <li key={b.tempId} className="flex items-center gap-2">
          <span className={`rounded px-1 text-[10px] font-semibold ${b.kind === 'replacement' ? 'bg-amber-500/25' : 'bg-emerald-500/25'}`}>{b.kind === 'replacement' ? t('zamena') : b.kind === 'resource' ? t('resurs') : t('qo‘shimcha')}</span>
          <span className="min-w-0 flex-1 truncate">{b.nom} · {b.hajm ?? '—'} {b.birlik}{b.resurslar.length ? ` · ${b.resurslar.length} ${t('resurs')}` : ''}</span>
          <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={busy} onClick={() => onRejaliOchir(b.tempId)} aria-label={`${t('Olib tashlash')}: ${b.nom}`}>✕</button>
        </li>)}</ul>
      </section>}

      {yozish && (
        <section className="karta space-y-2 p-3" aria-label="Saqlash">
          {!!yozish.qolgan.length && <p role="alert" className="text-[12px] text-warn">{t('Bog‘lanmagan yoki tasdiqlanmagan qatorlar aktga kiritilmaydi; ular manba va server ish qoralamasida saqlanadi. Qoralama aktni saqlash mumkin. Minuslar kiritilmasa, ular oldingi hajmlarni kamaytirmaydi.')} ({yozish.qolgan.length})</p>}
          {!!yozish.qolgan.length && <details className="text-[12px] text-warn"><summary>{t('Aktga kiritilmaydigan qatorlar')}</summary>
            <ul>{yozish.qolgan.map((n) => <li key={n.uid}>{n.manzil.varaq}!{n.manzil.qator} · {n.nom} · {fmt(n.hajm)} {n.birlik}</li>)}</ul>
          </details>}
          {akt && ij && ind?.qatorlar.some((q) => q.hajm != null && q.hajm < 0 && !ij.bog.has(q.uid) && !ij.otkaz.has(q.uid)) && <button type="button" className="tugma" disabled={busy || !!done} onClick={() => {
            const result = f2MinusTaklif(akt, ij); ijOzgar(result.ij);
            setHolat(`${result.soni} ta minus qator uchun ayni aktdagi aniq bog‘lanish asosida taklif berildi. Har birini tekshirib tasdiqlang; boshqa qatorlarni qo‘lda bog‘lang.`);
          }}>{t('Minus qatorlarga bog‘lanish taklif qilish')}</button>}
          {yozish.toxtatish.map((t, i) => <p key={i} className="text-[12px] text-warn">{t}</p>)}
          {payload?.error && <p role="alert" className="text-[12px] text-danger">{payload.error}</p>}
          {done ? <p className="text-[13px] text-ok">{done}</p> : (
            <button type="button" className="tugma tugma-asosiy" disabled={busy || !payload || !!payload.error || saqlashBlok}
              onClick={() => void saqla()}>
              {t('F2 qoralama aktini saqlash')}{payload && !payload.error ? ` (${payload.rows.length} qator)` : ''}{rejali.length ? ` + ${rejali.length} ${t('o‘zgarish')}` : ''}
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
