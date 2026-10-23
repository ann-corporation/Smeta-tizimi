import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { avvalgiF2Ol, f2RaqamNormal, qoralamaAktmi, type AvvalgiF2 } from '../../lib/f2-moslash-v3/takror';
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
import { qoldiqOshishlari, qoralamaBandi, type BandManba } from '../../lib/f2-moslash-v3/band';
import { kumulyativmi, kumulyativQolla, kumulyativReja } from '../../lib/f2-moslash-v3/kumulyativ';
import { dvigatelDaraxti, podvalTaklifQosh } from '../../lib/f2-moslash-v3/podval';
import { VARAQ_MOSLIK_NOMI, keyingiVaraq, manfiyVaraqmi, summaniOqi, varaqReestrMos } from '../../lib/f2-moslash-v3/varaq-tanlov';
import { qoshilganOzgardi as qoshilganOzgardiLib } from '../../lib/f2-moslash-v3/qoshilgan';
import { F2V3Workbench } from './F2V3Workbench';
import { F2DavomRoyxat } from './F2DavomRoyxat';
import { abcXato, ishAbcOchir, ishAbcSaqla, resursIshZamena, type ResursIshInput } from '../../api/t2-ish-abc';
import { katAniqla } from '../../lib/ish-abc';
import { BOSH_QADAMLAR, F2YozishOynasi, type Qadam, type QadamHolat, type QadamId } from './F2YozishOynasi';
import type { ModalRejali } from './F2AddReplModal';
import { BOLIM_ILDIZ, SMETASIZ_RZ, type OchirishBuyruq, ijniAlmashtir, vaqtinchami, rejaliniYoz, rejaliOchir, rejaliQatorlar, rejaliSurish, rejaliSurishMumkin, yangiTempIdlar, type RejaliBuyruq, type RejaliYaratish } from '../../lib/f2-moslash-v3/rejali';
import { sbT2IshResurslarBilanYarat, sbT2QoshimchaIshYarat, sbT2ResursBolaQosh, sbT2ZamenaIshYarat } from '../../api/t2-additional-replacement';
import { faylBaytlari, faylExplorerOl } from '../../api/t2-fayl';
import { bolimXato, smetaBolimYarat } from '../../api/t2-smeta-bolim';
import type { Fayl } from '../../lib/fayl-daraxt';
import { t } from '../../i18n/til';
import { f2IshchiOl, f2IshchiSaqla, f2ServerCorrectionSaqla, f2PendingCorrectionOl, type F2PendingCorrection, f2MinusTaklif, f2QoralamaBogTekshir, f2QoralamaYozish, f2ServerOl, f2ManbaMosla, f2BuzilganniBoshat, f2ServerSaqla, type F2IshchiQoralama, type F2ServerQoralama } from '../../lib/f2-ishchi-qoralama';

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
/** Dublikat qo'riqchi uchun akt qatorlari (band hajm, avvalgi import fayl+varaq). */
type AktQatorBand = { akt_id: number; qator_id: number; hajm: number | null; certified_quantity: number | null; raw_snapshot: { manba?: string; qatorlar?: SnapQator[]; fayl?: string; varaq?: string; fayl_sha256?: string } | null };
const nullga = () => null;
type AktQisqa = { id: number; raqam: string | null; oy: string | null; holat: string; tur: string };
const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));

function smetaQatorlari(rows: T2Qator[]): SmetaQator[] {
  return rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, norma: (q as T2Qator & { norma?: number | null }).norma ?? null, tartib: q.tartib }));
}

type SnapQator = { uid: string; imzo?: string };

/** Server ish qoralamasi kursoridagi rejali buyruqlar (eski qoralamada yo'q bo'lishi mumkin). */
const serverOchirish = (c: unknown): OchirishBuyruq[] => {
  const r = (c as { ochirishlar?: unknown } | null)?.ochirishlar;
  return Array.isArray(r) ? (r as OchirishBuyruq[]) : [];
};
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
  // F2 hujjat raqami (akt №). Kalit: obyekt + oy + raqam — bir oyda bir nechta F2 (masalan Sun'iy ko'l 2025-09 da 7 ta) ajraladi.
  const [raqam, setRaqam] = useState('');
  const raqamN = f2RaqamNormal(raqam);
  // Aynan shu raqamdagi QORALAMA aktning qatorlarini almashtirishga operatorning aniq roziligi (akt id bo'yicha).
  const [almashtirTasdiq, setAlmashtirTasdiq] = useState<number | null>(null);
  /** Kumulyativ varaq rejimi (operator yoqadi): oldingi F2 lar hajmi shu varaqdan ayriladi — faqat yozish proyeksiyasi. */
  const [kumRejim, setKumRejim] = useState(false);
  const [rows, setRows] = useState<T2Qator[]>([]);
  // Rejali (hali yozilmagan) qo'shimcha/zamena/resurslar — egasi 2026-10-20: har birida kutmaslik, oxirida bittada yozish.
  const [rejali, setRejali] = useState<RejaliBuyruq[]>([]);
  const rejaliRef = useRef(rejali);
  rejaliRef.current = rejali;
  const [davomEt, setDavomEt] = useState(false);
  // O'chirishga belgilangan (avval saqlangan) qo'shilgan qatorlar — «F2 ni yozish» da o'chiriladi.
  const [ochirish, setOchirish] = useState<OchirishBuyruq[]>([]);
  const ochirishRef = useRef(ochirish);
  ochirishRef.current = ochirish;
  // «F2 ni yozish» jarayoni — har qadam foydalanuvchiga ko'rinadi.
  const [jarayon, setJarayon] = useState<Qadam[] | null>(null);
  const qadam = (id: QadamId, holat: QadamHolat, izoh?: string) =>
    setJarayon((old) => (old ?? BOSH_QADAMLAR()).map((q) => (q.id === id ? { ...q, holat, izoh } : q)));
  const [oldingi, setOldingi] = useState(new Map<number, number>());
  // Dublikat qo'riqchi: boshqa (bekor qilinmagan) F2 qoralamalaridagi hajmlar va shu faylning avvalgi importlari.
  const [bandLines, setBandLines] = useState<BandManba[]>([]);
  const [avvalKiritilgan, setAvvalKiritilgan] = useState<Array<{ aktId: number; fayl: string; varaq: string; sha?: string }>>([]);
  const [aktNomlari, setAktNomlari] = useState(new Map<number, { raqam: string | null; oy: string | null; holat: string }>());
  const [faylSha, setFaylSha] = useState('');
  // Har varaq = alohida F2 (egasi 2026-10-23): reestr summasi bo'yicha varaqni topish va ketma-ket import.
  const [reestrMatn, setReestrMatn] = useState('');
  const [sessiyaKiritilgan, setSessiyaKiritilgan] = useState<ReadonlySet<string>>(new Set());
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
      operationId: operation.current, sourceOperationId: sourceOp.current, server: serverDraft.current, correction: pendingCorrection.current, rejali: rejaliRef.current, ochirishlar: ochirishRef.current, raqam: raqamN };
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
  }, [ij, natija, rzBog, aktlar, aktIdx, davr, objectId, busy, done, rejali, ochirish, raqamN]);

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
      setRejali(d.rejali ?? []); setOchirish(d.ochirishlar ?? []);
      // No auto-match effect may reset recovered manual decisions.
      oxirgiKalit.current = `${d.objectId}|${d.aktIdx}|${d.davr}|${d.aktlar[d.aktIdx].fayl}`;
      void faylShaHisobla(rawFile.current = new File([d.source.blob], d.source.name, { type: d.source.blob.type, lastModified: d.source.lastModified }));
      sourceDoc.current = d.source.documentId; sourceOp.current = d.sourceOperationId; operation.current = d.operationId;
      serverDraft.current = d.server;
      setObjectId(String(d.objectId)); workspace.setObjectId(d.objectId);
      setAktlar(d.aktlar); setAktIdx(d.aktIdx); setDavr(d.davr); setRzBog(d.rzBog); setRaqam(d.raqam ?? ''); setAlmashtirTasdiq(null);
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
  // F2 Reestr dagi «Davom ettiriladigan F2 lar» havolasi: /admin/f2?job=… — obyektlar yuklangach bir marta tiklanadi.
  const urlJob = useRef<number | null>((() => { const j = Number(new URLSearchParams(window.location.search).get('job')); return Number.isSafeInteger(j) && j > 0 ? j : null; })());
  useEffect(() => {
    if (urlJob.current == null || !objects.length || ij || busy) return;
    const id = urlJob.current; urlJob.current = null;
    void serverdanTikla(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects]);

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
  const avvalgiKalit = akt && objectId && /^\d{4}-(0[1-9]|1[0-2])$/.test(davr) ? `${companyId}:${objectId}:${davr}:${raqamN}` : '';
  const joriyAvvalgi = avvalgi?.key === avvalgiKalit ? avvalgi : null;
  const takrorTekshirilmoqda = !!avvalgiKalit && !joriyAvvalgi;
  // Avvalgi F2 faqat YANGI aktni saqlashni to'xtatadi. Bog'lash, zamena va qo'shimcha — mahalliy/qo'shilgan qatorlar ishi,
  // ularni bloklash butun seansni qulflab qo'yardi (egasi 2026-10-20: «hech narsani bog'lab bo'lmay qoldi»).
  // Tekshiruv xatosi saqlashni to'xtatmaydi: takroriy identifikatsiyani server unique-cheklovi baribir rad etadi.
  // Kalit obyekt + oy + RAQAM: shu oyda boshqa raqamli F2 bo'lsa u tegilmaydi — yangi akt yaratiladi.
  // Aynan shu raqamdagi QORALAMA akt bo'lsa saqlash uning qatorlarini almashtiradi — faqat operator aniq tasdiqlagach;
  // tasdiqlangan/yuborilgan akt bo'lsa yangi akt saqlanmaydi.
  const mavjudQoralama = qoralamaAktmi(joriyAvvalgi?.akt) ? joriyAvvalgi!.akt! as AvvalgiF2 & { versiya: number } : null;
  const almashtirishKutilmoqda = !!mavjudQoralama && almashtirTasdiq !== mavjudQoralama.id;
  /** Boshqa qoralamalarda band hajm (tahrirlanayotgan qoralama o'zi hisobga olinmaydi). */
  const band = useMemo(() => qoralamaBandi(bandLines, mavjudQoralama?.id ?? null), [bandLines, mavjudQoralama?.id]);
  /** Shu fayl+varaq avval boshqa F2 sifatida kiritilganmi (SHA256 bo'yicha; eski yozuvlarda — fayl nomi + varaq). */
  const reestrSumma = useMemo(() => summaniOqi(reestrMatn), [reestrMatn]);
  const reestrMos = useMemo(() => (reestrSumma == null ? [] : aktlar.map((a, i) => ({ i, m: varaqReestrMos(a, reestrSumma) })).filter((x) => x.m)), [aktlar, reestrSumma]);
  /** Varaq avval kiritilganmi (bazada — SHA yoki fayl nomi+varaq bo'yicha; yoki shu seansda yozilgan). */
  function varaqKiritilgan(i: number): string | null {
    const a = aktlar[i];
    if (!a) return null;
    if (sessiyaKiritilgan.has(a.varaq)) return t('shu seansda yozildi');
    const k = avvalKiritilgan.find((x) => x.varaq === a.varaq && (x.sha ? !!faylSha && x.sha === faylSha : x.fayl === a.fayl));
    if (!k) return null;
    const n = aktNomlari.get(k.aktId);
    return `F2 ${n?.raqam ?? '#' + k.aktId} (${(n?.oy ?? '').slice(0, 7)}, ${n?.holat ?? ''})`;
  }
  const keyingi = useMemo(() => {
    const kir = new Set<number>([aktIdx]);
    aktlar.forEach((_a, i) => { if (varaqKiritilgan(i)) kir.add(i); });
    return keyingiVaraq(aktlar.length, aktIdx, kir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktlar, aktIdx, sessiyaKiritilgan, avvalKiritilgan, faylSha, aktNomlari]);
  /** Boshqa varaqni tanlash = yangi F2: raqam bo'shatiladi, davr varaqdan olinadi (kalit o'zgarib smeta qayta o'qiladi). */
  function varaqniTanla(i: number) {
    setAktIdx(i); setDavr(aktlar[i]?.davr ?? davr); setRaqam(''); setAlmashtirTasdiq(null); setJarayon(null);
  }
  const avvalgiImport = useMemo(() => {
    if (!akt) return [];
    return avvalKiritilgan.filter((k) => k.aktId !== mavjudQoralama?.id && k.varaq === akt.varaq && (k.sha ? !!faylSha && k.sha === faylSha : k.fayl === akt.fayl));
  }, [avvalKiritilgan, akt, faylSha, mavjudQoralama?.id]);
  const saqlashBlok = takrorTekshirilmoqda || (!!joriyAvvalgi?.akt && !mavjudQoralama) || almashtirishKutilmoqda;
  useEffect(() => {
    if (!avvalgiKalit) return;
    let active = true;
    setAvvalgi(null);
    void avvalgiF2Ol(sbOqi, companyId, Number(objectId), davr, raqamN)
      .then((a) => { if (active) setAvvalgi({ key: avvalgiKalit, akt: a, error: false }); })
      .catch(() => { if (active) setAvvalgi({ key: avvalgiKalit, akt: null, error: true }); });
    return () => { active = false; };
  }, [avvalgiKalit, tekshiruv, companyId, objectId, davr, akt, raqamN]);

  // Daraxtda haqiqiy qatorlar + rejali (vaqtinchalik, manfiy id) qatorlar.
  const rowsK = useMemo(() => {
    const yashir = new Set(ochirish.flatMap((o) => o.eskiIdlar));
    const asos = yashir.size ? rows.filter((r) => !yashir.has(r.id)) : rows;
    return rejali.length ? [...asos, ...rejaliQatorlar(rejali, asos)] : asos;
  }, [rows, rejali, ochirish]);
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
    const qosh = rejali.filter((b) => (b.kind === 'replacement' || b.kind === 'resurs_ish') && b.almashtirilayotganQatorId != null);
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
    setNatija(null); setKumRejim(false); tarixniTozala(); setRejali([]); setOchirish([]); setIj(null); setDone(null); setXato(''); setRzBog(new Map()); operation.current = '';
  }

  /** `mavjudHujjatId` berilsa — fayl tizimdagi R2 hujjatidan olingan: yozishda QAYTA yuklanmaydi, o'sha hujjat manba bo'ladi. */
  async function faylTanla(file: File, mavjudHujjatId?: number) {
    oxirgiKalit.current = '';
    tozala(); setAktlar([]); setBusy(true); setHolat('Fayl o‘qilmoqda…');
    void faylShaHisobla(rawFile.current = file); sourceDoc.current = mavjudHujjatId; sourceOp.current = yangiOperationId();
    setRaqam(''); setAlmashtirTasdiq(null); // yangi hujjat — raqami operator tomonidan qayta kiritiladi
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
    const [d, nak, xot, aktRoyxat] = await Promise.all([
      sbT2DaraxtOl(oid),
      t2NakopitelniyToliq(oid, oy + '-01').catch(() => null),
      sbOqi<AktQatorBand>({
        jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: 'akt_id,qator_id,hajm,certified_quantity,raw_snapshot', limit: 50000,
      }).catch(nullga),
      sbOqi<AktQisqa>({
        jadval: 't2_akt', filtr: `obyekt_id=eq.${oid}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,tur', limit: 5000,
      }).catch(() => null),
    ]);
    if (!d.ok) throw new Error('Smeta o‘qilmadi.');
    const r = (d.qatorlar || []) as T2Qator[];
    // Smetasi yo'q obyekt ham ochiladi (egasi 2026-10-20): F2 ishlari «Smetadan tashqari ishlar» ga qo'shimcha bo'lib yoziladi.
    const old = new Map<number, number>(), qol = new Map<number, number>();
    if (!joriymi()) return { r, qol, x: new Map<string, number>() };
    if (nak && nak.ok) {
      // Tasdiqlangan F2 — davrgacha VA shu davrdagi (bir oyda bir necha F2 bo'lishi mumkin): jami_hajm.
      for (const q of nak.qatorlar) {
        const tasd = q.jami_hajm ?? ((q.oldingi_hajm ?? 0) + (q.joriy_hajm ?? 0));
        old.set(q.qator_id, tasd);
        if (q.smeta_hajm != null) qol.set(q.qator_id, q.smeta_hajm - tasd);
      }
      setOgoh('');
    } else setOgoh('Nakopitelniy o‘qilmadi — qoldiq ko‘rsatilmaydi, hajm nazorati faqat smeta hajmi bo‘yicha.');
    const x = new Map<string, number>();
    if (xot && xot.ok) for (const q of xot.qatorlar || []) {
      const s = q.raw_snapshot;
      if (s?.manba === 'f2_v3') for (const m of s.qatorlar ?? []) if (m.imzo) x.set(m.imzo, q.qator_id);
    }
    // Qoralamalar (bekor qilinmagan, tasdiqlanmagan) — bir-birini ko'rmasdi; endi band hajm sifatida hisoblanadi.
    const aktlarMap = new Map<number, { raqam: string | null; oy: string | null; holat: string }>();
    for (const a of (aktRoyxat && aktRoyxat.ok ? aktRoyxat.qatorlar ?? [] : [])) aktlarMap.set(a.id, { raqam: a.raqam, oy: a.oy, holat: a.holat });
    const lines: BandManba[] = [];
    const kiritilgan = new Map<string, { aktId: number; fayl: string; varaq: string; sha?: string }>();
    if (xot && xot.ok) for (const q of xot.qatorlar || []) {
      const a = aktlarMap.get(q.akt_id);
      if (a?.holat === 'qoralama') lines.push({ aktId: q.akt_id, qatorId: q.qator_id, hajm: q.certified_quantity ?? q.hajm });
      const s = q.raw_snapshot;
      if (a && a.holat !== 'bekor' && s?.fayl && s.varaq) kiritilgan.set(`${q.akt_id}|${s.fayl}|${s.varaq}`, { aktId: q.akt_id, fayl: s.fayl, varaq: s.varaq, sha: s.fayl_sha256 });
    }
    // Qoldiq (moslash ballari uchun): smeta − tasdiqlangan − qoralamalarda band.
    const bandAll = qoralamaBandi(lines, null);
    for (const [id, v] of bandAll) if (qol.has(id)) qol.set(id, qol.get(id)! - v);
    setBandLines(lines); setAvvalKiritilgan([...kiritilgan.values()]); setAktNomlari(aktlarMap);
    setRows(r); setOldingi(old); setQoldiq(qol); setXotira(x);
    return { r, qol, x };
  }

  async function moslash(a: F2Akt, r: T2Qator[], qol: Map<number, number>, x: Map<string, number>, rb: Map<string, number>, avvalgi?: IshJoyi | null) {
    setHolat('Moslashtirilmoqda (fonda)…');
    // Moslashtirish FONDA (Web Worker) — 30 ming qatorli smetada ham sahifa javob beradi.
    const ishBog = new Map([...avvalgi?.bog ?? []].filter(([, b]) => b.holat !== 'taklif').map(([uid, b]) => [uid, b.qatorId]));
    const n = await f2MoslashV3Fonda(dvigatelDaraxti(a.daraxt), smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb, ishBog });
    // Podval qo'lda qatorlari dvigatelga berilmaydi; smetada nom o'xshash + summa aynan qator bo'lsa ◐ taklif.
    setNatija(n); ijOzgar(podvalTaklifQosh(boshlangich(n, avvalgi ?? undefined), f2Indeks(a.daraxt).qatorlar, r));
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

  const taklifSoni = useMemo(() => (ij ? [...ij.bog.values()].filter((b) => b.holat === 'taklif').length : 0), [ij]);
  /** Kumulyativ reja: faqat hujjatda «ранее» > 0 bo'lsa hisoblanadi; rejim yoqilmaguncha yozishga TA'SIR QILMAYDI. */
  const kumReja = useMemo(() => (akt && ind && ij && kumulyativmi(akt.jami)
    ? kumulyativReja({ ind, ij, oldingi, band, narx: (id) => raw.get(id)?.narx ?? null, jami: akt.jami })
    : null), [akt, ind, ij, oldingi, band, raw]);
  const indYoz = useMemo(() => (ind && kumReja && kumRejim ? kumulyativQolla(ind, kumReja) : ind), [ind, kumReja, kumRejim]);
  const yozish = useMemo(() => (indYoz && ij ? f2QoralamaYozish(indYoz, ij) : null), [indYoz, ij]);
  const payload = useMemo(() => {
    if (!yozish || yozish.toxtatish.length) return null;
    try { return { rows: exactWrite(yozish.nodes, yozish.mapping), error: '' }; }
    catch (e) { return { rows: [], error: e instanceof Error ? e.message : 'Tekshiruv kerak.' }; }
  }, [yozish]);
  /** Qoldiqdan oshgan qatorlar — FAQAT KO'RSATISH (egasi 2026-10-23: loyiha hajmlari xato bo'lishi normal, blok yo'q).
   *  smeta − tasdiqlangan − boshqa qoralamalar − shu F2. Qo'shimcha/zamena qatorlari ko'rsatilmaydi. */
  const oshishlar = useMemo(() => {
    if (!payload || payload.error) return [];
    const smetaH = new Map<number, number | null>(rowsK.map((r) => [r.id, r.hajm ?? null]));
    const ozgarish = new Set(rowsK.filter((r) => (r as { qoshimcha?: boolean }).qoshimcha || (r as { zamena?: boolean }).zamena).map((r) => r.id));
    return qoldiqOshishlari(payload.rows.map((r) => ({ qatorId: r.qatorId, hajm: r.certifiedQuantity })), smetaH, oldingi, band, ozgarish);
  }, [payload, rowsK, oldingi, band]);

  /** Fayl SHA256 — shu fayl+varaq avval kiritilganini aniqlash uchun (raw_snapshot.fayl_sha256 ga ham yoziladi). */
  async function faylShaHisobla(file: File) {
    try {
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      setFaylSha(sha);
    } catch { setFaylSha(''); }
  }

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

  async function serverdanTikla(jobId?: number) {
    const id = jobId ?? Number(serverId);
    if (!Number.isSafeInteger(id) || id <= 0 || busy || ij) return;
    setBusy(true); setXato('');
    try {
      const d = await f2ServerOl(id);
      setServerId(String(id));
      if (!objects.some((o) => o.id === d.objectId)) throw new Error('Qoralama tanlangan kompaniya obyektiga tegishli emas.');
      const c = d.cursor;
      const docId = Number(c.sourceDocumentId), idx = Number(c.actIdx), month = String(c.month ?? '');
      if (!Number.isSafeInteger(docId) || docId <= 0 || !Number.isSafeInteger(idx) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Qoralama manbasi yoki davri noaniq.');
      const bytes = await faylBaytlari(docId);
      const file = new File([bytes.slice()], String(c.file), { type: XLSX_MIME });
      const acts = await f2AktlarniOqiFonda(file.name, file);
      const a = acts[idx];
      if (!a) throw new Error('Qoralamadagi akt varag‘i manba faylida topilmadi.');
      // Versiyaga chidamli tiklash: parser yaxshilanganda saqlangan qoralamalar buzilmaydi. Har qator uid bo'yicha alohida
      // baholanadi: mos — bog'lanish tiklanadi; yangi parse da paydo bo'lgan — bog'lanmagan holda qo'shiladi;
      // topilmagan/qiymati boshqa — faqat o'sha qatorlar «qayta tekshiring» ga tushadi.
      const indA = f2Indeks(a.daraxt);
      const mosla = f2ManbaMosla(d.sourceRows, indA);
      if (!mosla.mos && d.sourceRows.length) throw new Error('Manba fayli saqlangan qoralamaga umuman mos emas (birorta qator mos kelmadi). Bog‘lanishlar taxmin bilan tiklanmaydi.');
      const { r, qol, x } = await malumotYukla(d.objectId, month);
      const rb = new Map(c.rzBog as Array<[string, number]>);
      const result = await f2MoslashV3Fonda(dvigatelDaraxti(a.daraxt), smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb });
      oxirgiKalit.current = `${d.objectId}|${idx}|${month}|${a.fayl}`;
      void faylShaHisobla(rawFile.current = file); sourceDoc.current = docId; sourceOp.current = String(c.sourceOperationId); operation.current = String(c.writeOperationId);
      serverDraft.current = d.state; setObjectId(String(d.objectId)); workspace.setObjectId(d.objectId);
      setAktlar(acts); setAktIdx(idx); setDavr(month); setRzBog(rb); setNatija(result);
      setRaqam(typeof c.aktRaqam === 'string' ? c.aktRaqam : ''); setAlmashtirTasdiq(null);
      const correction=f2PendingCorrectionOl(c.correction);
      const restored=correction ? qoshilganOzgardiLib(d.ij,f2Indeks(a.daraxt),{
        eskiIdlar:new Set(correction.oldIds),yangiId:correction.newId,mavjud:new Set(r.map((q)=>q.id)),S:smetaIndeks(smetaQatorlari(r))}).ij
        : f2QoralamaBogTekshir(d.ij,new Set([...r.map((q)=>q.id), ...serverRejali(c).flatMap((b) => [b.tempId, ...b.resursTempIds])]));
      pendingCorrection.current=undefined;
      setRejali(serverRejali(c)); setOchirish(serverOchirish(c));
      const tiklangan = podvalTaklifQosh(f2BuzilganniBoshat(restored, mosla.buzilgan), indA.qatorlar, r);
      tarixniTozala(); setIj(tiklangan); setDone(null);
      setServerHolat(`Serverdagi F2 ish qoralamasi #${id} tiklandi. Hal qilinmagan qatorlar ham saqlangan.`
        + (mosla.yangi.length ? ` ${t('Fayl yangi usulda o‘qildi')}: +${mosla.yangi.length} ${t('qator')}.` : '')
        + (mosla.buzilgan.size ? ` ${mosla.buzilgan.size} ${t('qator qayta tekshirilsin (fayldagi qiymati o‘zgargan yoki topilmadi)')}.` : ''));
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
  /** Yangi smeta bo'limi — qoralamaga (serverga «F2 ni yozish» da). Vaqtinchalik id qaytaradi.
   *  otaQatorId null — smetaning yuqori darajasi; keyinQatorId — shu darajadagi bo'limdan keyin. */
  function bolimRejali(nom: string, otaQatorId: number | null, keyinQatorId?: number): number | null {
    const toza = nom.replace(/\s+/g, ' ').trim();
    if (!toza || toza.length > 300) return null;
    const [tempId] = yangiTempIdlar(rejaliRef.current.flatMap((x) => [x.tempId, ...x.resursTempIds]), 1);
    const buyruq: RejaliBuyruq = { kind: 'bolim', tur: 'rz', tempId, resursTempIds: [], f2Uid: '', f2ResursUidlar: [],
      otaQatorId: otaQatorId ?? BOLIM_ILDIZ, keyinQatorId, nom: toza, birlik: '', sabab: t('Smetaga yangi bo‘lim'), resurslar: [], operationId: yangiOperationId() };
    const keyingi = [...rejaliRef.current, buyruq];
    rejaliRef.current = keyingi;
    setRejali(keyingi);
    return tempId;
  }
  /** Egasi 2026-10-21: «hamma F2 ni o'tkazish degan narsani o'zi yo'q». Bog'lanmagan F2 ishlari (va ishga kirmagan
   *  material/uskunalar) BO'LIMLARI bilan smetaga — qoralamaga: F2 bo'limi smetadagi bo'limga bog'langan bo'lsa o'sha
   *  bo'limga, bo'lmasa shu nomli bo'lim topiladi yoki yangisi yaratiladi (F2 tartibida). Bog'langan ishning bog'lanmagan
   *  resurslari — o'sha ishga qo'shimcha resurs. Bo'limsiz qatorlar — «СМЕТАДАН ТАШҚАРИ ИШЛАР». Serverga hech narsa
   *  yozilmaydi — «F2 ni yozish» da bittada. */
  function f2ToliqOtkaz() {
    if (!akt || !ind || !ijRef.current) return;
    const diag = new Map((natija?.rzDiag ?? []).map((d) => [d.f2Uid, d]));
    const nomK = (x: string | null | undefined) => (x ?? '').toUpperCase().replace(/Ё/g, 'Е').replace(/\s+/g, ' ').trim();
    const resTur = (birlik: string | null | undefined): 'rs' | 'mat' => (/ЧЕЛ|МАШ/i.test(birlik ?? '') ? 'rs' : 'mat');
    const bolimlar = new Map<string, number>();
    for (const r of rowsK) if (r.tur === 'rz') bolimlar.set(`${r.ota_id ?? 0}|${nomK(r.nom)}`, r.id);
    const oxirgiBolim = new Map<number, number>();
    let qoshildi = 0, bolimSoni = 0; const otkazildi: string[] = [];
    const oxirgiTemp = () => rejaliRef.current[rejaliRef.current.length - 1]?.tempId;
    const rzOl = (f: F2Tugun, ota: number | null): number | null => {
      const d = diag.get(f.uid);
      if (d?.ok && d.smetaRzIdlar[0] != null) return d.smetaRzIdlar[0];
      const kalit = `${ota ?? 0}|${nomK(f.nom)}`;
      const bor = bolimlar.get(kalit);
      if (bor != null) return bor;
      const id = bolimRejali(f.nom || t('Nomsiz bo‘lim'), ota, oxirgiBolim.get(ota ?? 0));
      if (id == null) return null;
      bolimlar.set(kalit, id); oxirgiBolim.set(ota ?? 0, id); bolimSoni++;
      return id;
    };
    const yur = (nodes: readonly F2Tugun[], smetaRz: number | null) => {
      let oldingi: number | undefined;
      for (const f of nodes) {
        if (f.tur === 'rz') { const rz = rzOl(f, smetaRz); if (rz == null) { otkazildi.push(f.nom.slice(0, 40)); continue; } yur(f.bolalar, rz); continue; }
        const ij0 = ijRef.current!;
        if (ij0.otkaz.has(f.uid)) continue;
        const ishmi = f.tur === 'bl';
        const bogl = ij0.bog.get(f.uid);
        if (bogl) {
          // Bog'langan ish: faqat bog'lanmagan resurslari — o'sha smeta ishiga qo'shimcha resurs.
          if (ishmi && !vaqtinchami(bogl.qatorId)) for (const r of f.bolalar) {
            const ijR = ijRef.current!;
            if (ijR.bog.has(r.uid) || ijR.otkaz.has(r.uid)) continue;
            const rh = Number(r.hajm);
            if (!(rh > 0)) { otkazildi.push(r.nom.slice(0, 40)); continue; }
            onRejali(r, { kind: 'resource', tur: resTur(r.birlik), otaQatorId: bogl.qatorId, nom: r.nom, birlik: r.birlik || 'шт', hajm: rh, kod: r.kod ?? undefined,
              sabab: t('F2 import: qo‘shimcha resurs (to‘liq o‘tkazish)'), resurslar: [], operationId: yangiOperationId() });
            qoshildi++;
          }
          continue;
        }
        const hajm = Number(f.hajm);
        if (!(hajm > 0)) { otkazildi.push(f.nom.slice(0, 40)); continue; }
        const resIdx = ishmi ? f.bolalar.filter((r) => Number(r.hajm) > 0) : [];
        const resurslar = resIdx.map((r) => ({ tur: resTur(r.birlik), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod, narx: r.narx }));
        if (smetaRz == null) {
          onRejali({ ...f, bolalar: resIdx }, { kind: 'smetasiz', tur: 'bl', otaQatorId: SMETASIZ_RZ, nom: f.nom, birlik: f.birlik || 'шт', hajm, kod: f.kod ?? undefined,
            sabab: t('F2 import: smetasi yo‘q obyekt'), resurslar, operationId: yangiOperationId() });
        } else {
          const tur: 'bl' | 'mat' | 'ob' = ishmi ? 'bl' : f.tur === 'ob' ? 'ob' : 'mat';
          onRejali({ ...f, bolalar: resIdx }, { kind: 'additional', tur, otaQatorId: smetaRz, keyinQatorId: oldingi, nom: f.nom, birlik: f.birlik || 'шт', hajm, kod: f.kod ?? undefined,
            sabab: t('F2 import: qo‘shimcha (to‘liq o‘tkazish)'), resurslar: tur === 'bl' ? resurslar : [], operationId: yangiOperationId() });
          oldingi = oxirgiTemp();
        }
        qoshildi++;
      }
    };
    yur(akt.daraxt, null);
    setHolat(`${qoshildi} ${t('ta qator')}${bolimSoni ? `, ${bolimSoni} ${t('ta yangi bo‘lim')}` : ''} ${t('qoralamaga qo‘shildi — «F2 ni yozish» bosilganda smetaga yoziladi.')}${otkazildi.length ? ` ${t('Hajmi yo‘q (minus/0)')}: ${otkazildi.length}` : ''}`);
  }
  /** Siz qo'shgan qatorni tahrirlash — qoralamada: eskisi o'chirishga, yangisi rejaliga; eski qatorga bog'langan F2 qatorlari
   *  yangisiga (resurslar — nomi bo'yicha) o'tadi. Serverga hech narsa yozilmaydi. */
  function onTahrirRejali(b: { eski: { qatorId: number; versiya: number; eskiIdlar: number[]; nom: string }; command: 'additional' | 'replacement' | 'resurs_zamena' | 'resurs_ish';
    otaQatorId: number | null; almashtirilayotganQatorId?: number | null; resursQatorId?: number | null; ish: unknown; resurslar: unknown[]; sabab: string; operationId: string }): number | null {
    if (!ijRef.current) return null;
    const oldBog = [...ijRef.current.bog].filter(([, v]) => b.eski.eskiIdlar.includes(v.qatorId));
    const eskiNom = new Map(rows.filter((r) => b.eski.eskiIdlar.includes(r.id)).map((r) => [r.id, (r.nom ?? '').toUpperCase().trim()]));
    onOchirishRejali({ qatorId: b.eski.qatorId, versiya: b.eski.versiya, eskiIdlar: b.eski.eskiIdlar, nom: b.eski.nom, sabab: `${t('tahrir')}: ${b.sabab}` });
    const ish = (b.ish ?? null) as { kod?: string | null; nom: string; birlik: string; hajm: number } | null;
    const resurslar = (b.resurslar as Array<{ nom: string; birlik: string; hajm?: number | null; norma?: number | null; kod?: string | null; kat?: string }>);
    const ishHajm = ish?.hajm ?? null;
    const korinish = resurslar.map((r) => ({ tur: (r.kat === 'ОБ' ? 'ob' : r.norma != null ? 'rs' : 'mat') as 'rs' | 'mat' | 'ob', nom: r.nom, birlik: r.birlik,
      hajm: r.norma != null && ishHajm != null ? r.norma * ishHajm : (r.hajm ?? null), kod: r.kod ?? null }));
    const ids = yangiTempIdlar(rejaliRef.current.flatMap((x) => [x.tempId, ...x.resursTempIds]), 1 + (ish ? korinish.length : 0));
    const otaId = b.command === 'resurs_zamena' ? (b.otaQatorId ?? 0) : (b.otaQatorId ?? 0);
    const r0 = korinish[0];
    const buyruq: RejaliBuyruq = {
      kind: 'abc', abcCommand: b.command, abcIsh: b.ish, abcResurslar: b.resurslar, tempId: ids[0], resursTempIds: ish ? ids.slice(1) : [],
      f2Uid: oldBog.find(([, v]) => v.qatorId === b.eski.qatorId)?.[0] ?? '', f2ResursUidlar: [],
      tur: ish ? 'bl' : (r0?.tur ?? 'mat'), otaQatorId: otaId, almashtirilayotganQatorId: b.almashtirilayotganQatorId ?? undefined, resursQatorId: b.resursQatorId ?? undefined,
      nom: ish?.nom ?? r0?.nom ?? b.eski.nom, birlik: ish?.birlik ?? r0?.birlik ?? '', hajm: ish?.hajm ?? r0?.hajm ?? undefined, kod: ish?.kod ?? r0?.kod ?? undefined,
      sabab: b.sabab, resurslar: ish ? korinish : [], operationId: b.operationId,
    };
    // F2 bog'lanishlari: eski ildizga bog'langanlar — yangi ildizga; resurslar — nomi mos yangi resursga.
    let joriy = ijRef.current;
    for (const [uid, v] of oldBog) {
      let yangi: number | undefined;
      if (v.qatorId === b.eski.qatorId) yangi = buyruq.tempId;
      else { const n = eskiNom.get(v.qatorId); const i = korinish.findIndex((x) => x.nom.toUpperCase().trim() === n); if (i >= 0) yangi = buyruq.resursTempIds[i]; }
      if (yangi != null) joriy = bogla(joriy, uid, yangi);
    }
    ijRef.current = joriy;
    const keyingi = [...rejaliRef.current, buyruq];
    rejaliRef.current = keyingi;
    setRejali(keyingi); tarixniTozala(); setIj(joriy);
    return buyruq.tempId;
  }
  function onOchirishRejali(b: Omit<OchirishBuyruq, 'operationId'>) {
    if (!ijRef.current || ochirishRef.current.some((o) => o.qatorId === b.qatorId)) return;
    const yashir = new Set(b.eskiIdlar);
    const bog = new Map([...ijRef.current.bog].filter(([, v]) => !yashir.has(v.qatorId)));
    const joriy = { bog, otkaz: ijRef.current.otkaz };
    ijRef.current = joriy;
    const keyingi = [...ochirishRef.current, { ...b, operationId: yangiOperationId() }];
    ochirishRef.current = keyingi;
    setOchirish(keyingi); tarixniTozala(); setIj(joriy);
  }
  function ochirishniBekor(qatorId: number) {
    const keyingi = ochirishRef.current.filter((o) => o.qatorId !== qatorId);
    ochirishRef.current = keyingi; setOchirish(keyingi);
  }
  function onRejaliOchir(tempId: number) {
    if (!ijRef.current) return;
    const r = rejaliOchir(rejaliRef.current, ijRef.current, tempId);
    rejaliRef.current = r.buyruqlar;
    setRejali(r.buyruqlar); tarixniTozala(); setIj(r.ij);
  }
  /** Saqlanmagan qatorni ▲/▼ — faqat lokal navbat (RPC yo'q), «Saqlash» shu tartibda yozadi. */
  function onRejaliSurish(tempId: number, yon: -1 | 1) {
    const keyingi = rejaliSurish(rejaliRef.current, tempId, yon);
    rejaliRef.current = keyingi; setRejali(keyingi);
  }
  const rejaliYarat: RejaliYaratish = async (b, real) => {
    const asos = { kompaniyaId: companyId, obyektId: Number(objectId), otaQatorId: real.otaQatorId, nom: b.nom, birlik: b.birlik,
      hajm: b.hajm as number, kod: b.kod, sabab: b.sabab, operationId: b.operationId, expectedVersion: real.otaVersiya, keyinQatorId: real.keyinQatorId };
    const tekshir = (r: { ok: boolean; qator_id?: number | null; xabar?: string; error?: string }) => {
      if (!r.ok || r.qator_id == null) throw new Error(r.xabar || r.error || t('Saqlanmadi.'));
      return r.qator_id;
    };
    if (b.kind === 'abc') {
      const ishInput = b.abcIsh as ResursIshInput['ish'] | null;
      const res = b.abcCommand === 'resurs_ish'
        ? await resursIshZamena({ kompaniyaId: companyId, obyektId: Number(objectId), resursQatorId: b.resursQatorId as number, sabab: b.sabab, operationId: b.operationId,
            ishlar: [{ ish: ishInput!, resurslar: (b.abcResurslar ?? []) as ResursIshInput['resurslar'] }] })
        : await ishAbcSaqla({ kompaniyaId: companyId, obyektId: Number(objectId), command: b.abcCommand as 'additional' | 'replacement' | 'resurs_zamena',
            otaQatorId: b.abcCommand === 'resurs_zamena' ? null : real.otaQatorId, almashtirilayotganQatorId: b.almashtirilayotganQatorId ?? null,
            kutilganVersiya: b.abcCommand === 'resurs_zamena' ? null : real.otaVersiya, ish: ishInput, resurslar: (b.abcResurslar ?? []) as ResursIshInput['resurslar'],
            sabab: b.sabab, operationId: b.operationId });
      if (!res.ok || res.qator_id == null) throw new Error(abcXato(res));
      const r = res as { resurs_ids?: number[]; resurs_idlar?: number[][] };
      return { qatorId: res.qator_id, resursIdlar: r.resurs_idlar?.[0] ?? r.resurs_ids ?? [] };
    }
    if (b.kind === 'bolim') {
      const res = await smetaBolimYarat({ kompaniyaId: companyId, obyektId: Number(objectId), nom: b.nom,
        otaQatorId: real.otaQatorId === BOLIM_ILDIZ ? null : real.otaQatorId, keyinQatorId: real.keyinQatorId ?? null, sabab: b.sabab, operationId: b.operationId });
      if (!res.ok || res.qator_id == null) throw new Error(bolimXato(res));
      return { qatorId: res.qator_id, resursIdlar: [] };
    }
    if (b.kind === 'smetasiz') {
      const res = await ishAbcSaqla({ kompaniyaId: companyId, obyektId: Number(objectId), command: 'additional', otaQatorId: null,
        ish: { kod: b.kod ?? null, nom: b.nom, birlik: b.birlik, hajm: b.hajm as number }, sabab: b.sabab, operationId: b.operationId,
        resurslar: b.resurslar.map((r) => ({ kat: katAniqla(null, r.tur, r.birlik), kod: r.kod ?? null, nom: r.nom, birlik: r.birlik, norma: null,
          hajm: r.hajm ?? null, narx: (r as { narx?: number | null }).narx ?? null, narx_manba: 'qolda' as const })) });
      if (!res.ok || res.qator_id == null) throw new Error(abcXato(res));
      return { qatorId: res.qator_id, resursIdlar: res.resurs_ids ?? [] };
    }
    if (b.kind === 'resurs_ish') {
      const res = await resursIshZamena({ kompaniyaId: companyId, obyektId: Number(objectId), resursQatorId: b.resursQatorId as number, sabab: b.sabab, operationId: b.operationId,
        ishlar: [{ ish: { kod: b.kod ?? null, nom: b.nom, birlik: b.birlik, hajm: b.hajm as number }, resurslar: (b.ishResurslari ?? []) as ResursIshInput['resurslar'] }] });
      if (!res.ok || res.qator_id == null) throw new Error(abcXato(res));
      return { qatorId: res.qator_id, resursIdlar: res.resurs_idlar?.[0] ?? [] };
    }
    if (b.resurslar.length && b.kind !== 'resource') {
      const rr = await sbT2IshResurslarBilanYarat({ ...asos, command: b.kind === 'replacement' ? 'replacement' : 'additional',
        almashtirilayotganQatorId: real.almashtirilayotganQatorId, resurslar: b.resurslar });
      return { qatorId: tekshir(rr), resursIdlar: rr.resurs_qator_idlar ?? [], otaVersiya: (rr as { parent_version?: number | null }).parent_version ?? null };
    }
    const r = b.kind === 'replacement'
      ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: real.almashtirilayotganQatorId as number })
      : b.kind === 'additional' && b.tur === 'bl' ? await sbT2QoshimchaIshYarat(asos)
        : await sbT2ResursBolaQosh({ ...asos, tur: b.tur === 'bl' || b.tur === 'rz' ? 'rs' : b.tur, hajm: b.hajm });
    return { qatorId: tekshir(r), resursIdlar: [], otaVersiya: (r as { parent_version?: number | null }).parent_version ?? null };
  };
  async function otaVersiya(id: number): Promise<number> {
    const d = await sbOqi<{ id: number; versiya: number }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${objectId}&id=eq.${id}`, ustunlar: 'id,versiya', limit: 1 });
    const v = d.qatorlar?.[0]?.versiya;
    if (!d.ok || v == null) throw new Error(t('Ota qator versiyasi o‘qilmadi.'));
    return Number(v);
  }
  /** Rejali buyruqlarni yozadi; muvaffaqiyatda true. Xatoda yozilganlari bog'lanadi, qolganlari qoralamada qoladi. */
  async function rejaliniQolla(): Promise<{ ok: boolean; xato?: string; yozildi: number }> {
    const jami = rejaliRef.current.length;
    setBusy(true); setXato('');
    try {
      const r = await rejaliniYoz(rejaliRef.current, { yarat: rejaliYarat, versiya: otaVersiya,
        progress: (i, n) => qadam('ozgarish', 'ishlayapti', `${i}/${n}`) });
      if (r.map.size && ijRef.current) {
        const yangiIj = ijniAlmashtir(ijRef.current, r.map);
        const otalar = rejaliRef.current.filter((b) => r.map.has(b.tempId)).map((b) => (vaqtinchami(b.otaQatorId) ? r.map.get(b.otaQatorId) : b.otaQatorId)).filter((x): x is number => x != null && x !== BOLIM_ILDIZ);
        rejaliRef.current = r.qolgan;
        setRejali(r.qolgan); tarixniTozala(); setIj(yangiIj);
        await qatorlarniYangila([...r.map.values(), ...otalar]).catch(() => smetaYangila());
      } else { rejaliRef.current = r.qolgan; setRejali(r.qolgan); }
      const yozildi = jami - r.qolgan.length;
      if (r.xato) return { ok: false, yozildi, xato: `${yozildi}/${jami} ${t('ta o‘zgarish yozildi, keyin to‘xtadi')}: ${r.xato}. ${t('Qolganlari qoralamada saqlangan.')}` };
      return { ok: true, yozildi };
    } finally { setBusy(false); }
  }
  // Rejali yozilgach state yangilanadi (haqiqiy id lar) — shundan keyin akt avtomatik saqlanadi.
  useEffect(() => {
    if (!davomEt || busy || rejali.length) return;
    setDavomEt(false);
    void saqla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [davomEt, busy, rejali]);

  /** «F2 ni yozish»: ish davomidagi barcha qoralama amallari shu yerda, qadam-baqadam, ko'rinib turgan holda yoziladi. */
  async function saqla() {
    if (!akt || !ind || !yozish || !payload || busy || done) return;
    setJarayon((old) => old ?? BOSH_QADAMLAR());
    setXato(''); setAktZiddiyat(false);
    // 1. Tekshiruv
    qadam('tekshiruv', 'ishlayapti');
    if (payload.error) { qadam('tekshiruv', 'xato', payload.error); return; }
    if (saqlashBlok) {
      qadam('tekshiruv', 'xato', takrorTekshirilmoqda ? t('Avvalgi F2 tekshirilmoqda — bir lahzadan so‘ng qayta urinib ko‘ring.')
        : almashtirishKutilmoqda ? t('Shu raqamdagi F2 qoralamasini almashtirish tasdiqlanmagan. Boshqa F2 bo‘lsa, uning raqamini kiriting.')
        : t('Bu obyekt va oy uchun tasdiqlangan F2 bor — yangi akt yozilmaydi. F2 tarixini oching.'));
      return;
    }
    qadam('tekshiruv', 'tayyor', `${payload.rows.length} ${t('qator aktga kiradi')}${yozish.qolgan.length ? `; ${yozish.qolgan.length} ${t('tasi kiritilmaydi (bog‘lanmagan)')}` : ''}`);
    // 2. Qo'shimcha/zamenalar (qoralamadagi) — avval ular, chunki akt ularning haqiqiy id lariga bog'lanadi.
    let ochirildi = 0;
    if (ochirishRef.current.length) {
      const jami = ochirishRef.current.length;
      qadam('ozgarish', 'ishlayapti', `${t('O‘chirish')} 0/${jami}`);
      setBusy(true);
      try {
        let i = 0;
        for (const o of [...ochirishRef.current]) {
          const res = await ishAbcOchir({ kompaniyaId: companyId, obyektId: Number(objectId), qatorId: o.qatorId, kutilganVersiya: o.versiya, sabab: o.sabab, operationId: o.operationId });
          if (!res.ok) { qadam('ozgarish', 'xato', `«${o.nom.slice(0, 60)}»: ${abcXato(res)}`); return; }
          const yashir = new Set(o.eskiIdlar);
          setRows((old) => old.filter((r) => !yashir.has(r.id)));
          ochirishRef.current = ochirishRef.current.filter((x) => x.qatorId !== o.qatorId);
          setOchirish(ochirishRef.current);
          qadam('ozgarish', 'ishlayapti', `${t('O‘chirish')} ${++i}/${jami}`);
        }
        ochirildi = jami;
      } catch (e) { qadam('ozgarish', 'xato', e instanceof Error ? e.message : t('Javob olinmadi.')); return; }
      finally { setBusy(false); }
    }
    if (rejaliRef.current.length) {
      const n = rejaliRef.current.length;
      qadam('ozgarish', 'ishlayapti', `0/${n}`);
      const r = await rejaliniQolla();
      if (!r.ok) { qadam('ozgarish', 'xato', r.xato); return; }
      qadam('ozgarish', 'tayyor', `${r.yozildi} ${t('ta yozildi')}`);
      setDavomEt(true); // smeta yangilangach akt davom etadi
      return;
    }
    setJarayon((old) => (old ?? BOSH_QADAMLAR()).map((q) => (q.id === 'ozgarish' && (q.holat === 'kutish' || q.holat === 'ishlayapti') ? (ochirildi ? { ...q, holat: 'tayyor', izoh: `${ochirildi} ${t('ta qator o‘chirildi')}` } : { ...q, holat: 'otkazildi', izoh: t('Qo‘shimcha/zamena yo‘q') }) : q)));
    setBusy(true);
    try {
      // 3. Manba fayl
      qadam('fayl', 'ishlayapti');
      let docId: number;
      try { docId = await r2gaYukla(); qadam('fayl', 'tayyor'); }
      catch (e) { qadam('fayl', 'xato', e instanceof Error ? e.message : t('Fayl saqlanmadi.')); return; }
      // 4. Ish qoralamasi (bog'lanmagan va minus qatorlar ham) — aktdan OLDIN.
      qadam('qoralama', 'ishlayapti');
      const draft = ishSnapshot();
      if (!draft) { qadam('qoralama', 'xato', t('F2 ish holati topilmadi.')); return; }
      draft.source.documentId = docId;
      try { await f2ServerSaqla(draft, docId, serverDraft.current); }
      catch (e) {
        // Manba hujjat eskirgan (fayl qayta yuklanib «superseded» bo'lgan) yoki boshqa obyektga tegishli — brauzerdagi asl
        // faylni shu obyektga qayta ro'yxatdan o'tkazib, bir marta qayta urinamiz (egasi 2026-10-20: SOURCE_DOCUMENT_SCOPE_MISMATCH).
        const m = e instanceof Error ? e.message : '';
        if (/SOURCE_DOCUMENT_SCOPE_MISMATCH/.test(m) && rawFile.current) {
          try {
            qadam('fayl', 'ishlayapti', t('Manba fayl eskirgan — qayta saqlanmoqda…'));
            sourceDoc.current = undefined; sourceOp.current = yangiOperationId(); serverDraft.current = undefined; draft.server = undefined;
            docId = await r2gaYukla(); draft.source.documentId = docId;
            qadam('fayl', 'tayyor', t('Manba fayl yangilandi'));
            await f2ServerSaqla(draft, docId, undefined);
          } catch (e2) { serverDraft.current = draft.server; await ishniSaqla(draft); qadam('qoralama', 'xato', e2 instanceof Error ? e2.message : t('Server qoralamasi saqlanmadi.')); return; }
        } else { serverDraft.current = draft.server; await ishniSaqla(draft); qadam('qoralama', 'xato', m || t('Server qoralamasi saqlanmadi.')); return; }
      }
      serverDraft.current = draft.server; await ishniSaqla(draft);
      setServerId(String(draft.server!.jobId));
      qadam('qoralama', 'tayyor', `#${draft.server!.jobId}`);
      // 5. Akt
      qadam('akt', 'ishlayapti', mavjudQoralama ? `${t('Mavjud qoralama yangilanmoqda')} #${mavjudQoralama.id}` : undefined);
      const manba = new Map<number, Array<Record<string, unknown>>>();
      for (const n of yozish.nodes) {
        const id = yozish.mapping.get(n.uid)!;
        const tg = ind.byUid.get(n.uid)!;
        const a = manba.get(id) ?? [];
        a.push({ uid: n.uid, imzo: yozish.imzolar.get(n.uid), kod: tg.kod, nom: tg.nom, birlik: tg.birlik, hajm: tg.hajm, narx: tg.narx, summa: tg.summa, bog: ij?.bog.get(n.uid)?.usul });
        manba.set(id, a);
      }
      const qatorlar = payload.rows.map((q) => ({
          ...q, rawSnapshot: { manba: 'f2_v3', hujjat_id: docId, fayl: akt.fayl, varaq: akt.varaq, fayl_sha256: faylSha || undefined, davr, qatorlar: manba.get(q.qatorId),
            import_job_id: draft.server!.jobId, partial: yozish.qolgan.length > 0,
            unresolved_count: yozish.qolgan.length },
        }));
      const r = mavjudQoralama
        ? await sbT2F2QoralamaYangila({ kompaniyaId: companyId, aktId: mavjudQoralama.id, kutilganVersiya: mavjudQoralama.versiya, operationId: yangiOperationId(), qatorlar })
        : await sbT2AktYaratV2({ obyektId: Number(objectId), oy: davr + '-01', operationId: operation.current, qatorlar, raqam: raqamN || undefined });
      if (!r.ok) {
        const code = (r as { code?: string }).code;
        if (code === 'F2_ACT_NUMBER_CONFLICT') {
          const m = t('Shu obyekt va oy uchun bu raqamdagi F2 allaqachon mavjud. Tasdiqlangan aktni qayta import bilan almashtirib bo‘lmaydi.');
          setAktZiddiyat(true); setXato(m); qadam('akt', 'xato', m);
        }
        else if (code === 'STALE_VERSION') { setTekshiruv((v) => v + 1); qadam('akt', 'xato', t('F2 qoralama boshqa joyda o‘zgargan — yangi holati o‘qildi, «Qayta urinish»ni bosing.')); }
        else qadam('akt', 'xato', `${r.xabar || r.error || r.sabab || t('xato')}`);
        return;
      }
      setTekshiruv((v) => v + 1);
      qadam('akt', 'tayyor', `#${r.akt_id ?? '?'} · ${payload.rows.length} ${t('qator')}`);
      setSessiyaKiritilgan((s) => new Set([...s, akt.varaq]));
      setDone(`F2 qoralamasi ${mavjudQoralama ? 'yangilandi' : 'saqlandi'} (akt #${r.akt_id ?? '?'}, ${payload.rows.length} qator). Tasdiqlangach Nakopitelniyga kiradi — F2 tarixi sahifasida.`);
      if (yozish.qolgan.length) setServerHolat(`Diqqat: ${yozish.qolgan.length} ta bog‘lanmagan yoki tasdiqlanmagan qator aktga kiritilmadi. Ular manba faylida va server ish qoralamasi #${draft.server!.jobId} da saqlangan. Akt faqat tasdiqlangan bog‘lanishlardan tuzildi.`);
      setHolat('Tayyor.');
    } catch (e) {
      setJarayon((old) => (old ?? BOSH_QADAMLAR()).map((q) => (q.holat === 'ishlayapti' ? { ...q, holat: 'xato', izoh: e instanceof Error ? e.message : t('Yozish javobi olinmadi — qayta urinish ayni operatsiyani tekshiradi.') } : q)));
    } finally { setBusy(false); }
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
      <section className="karta flex flex-wrap items-center gap-2 p-2 text-[12px]" aria-label={t('Ish holati')}>
        <ol className="flex flex-wrap items-center gap-1" aria-label={t('Qadamlar')}>
          {[t('1. Obyekt va F2 fayl'), t('2. Bog‘lash (hammasi qoralamada)'), t('3. F2 ni yozish')].map((nom, i) => {
            const joriy = !akt || !ij ? 0 : done ? 2 : 1;
            return <li key={nom} aria-current={i === joriy ? 'step' : undefined}
              className={`rounded-full px-2 py-0.5 ${i === joriy ? 'bg-accent text-white' : i < joriy ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-text-dim'}`}>{i < joriy ? '✓ ' : ''}{nom}</li>;
          })}
        </ol>
        <span className="ml-auto text-text-dim">{ishSaqlandi || t('Ish shu brauzerda avtomatik saqlanadi.')}</span>
        {ishXato && <p role="alert" className="w-full text-danger">{ishXato} {t('Saqlanganini tasdiqlamaguncha sahifani yopmang.')}</p>}
        {!ij && saqlanganIsh && objects.some((o) => o.id === saqlanganIsh.objectId) && <button type="button" className="tugma tugma-asosiy" disabled={busy} onClick={() => void ishniTikla()}>
          {t('Saqlangan ishni davom ettirish:')} {saqlanganIsh.source.name} · {saqlanganIsh.davr}
        </button>}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/50 pt-2">
          <span className="text-text-dim">{t('Boshqa kompyuterda davom ettirish')}:</span>
          <div className="flex flex-wrap items-center gap-2">
            {ij && <button type="button" className="tugma" disabled={busy} onClick={() => void ishniSaqla()}>{t('Ish holatini saqlash (davom ettirish uchun)')}</button>}
            {ij && !done && <button type="button" className="tugma" disabled={busy} onClick={() => void servergaSaqla()}>{t('Server ish holatini saqlash')}</button>}
            {!ij && <label className="block text-[12px]">{t('Server qoralamasi raqami')}
              <input aria-label={t('Server qoralamasi raqami')} type="number" min="1" value={serverId} onChange={(e) => setServerId(e.target.value)} className="input mx-2" />
              <button type="button" className="tugma" disabled={busy || !serverId} onClick={() => void serverdanTikla()}>{t('Serverdagi qoralamani davom ettirish')}</button>
            </label>}
          </div>
        </div>
        {serverHolat && <p role="status" className="w-full">{serverHolat}</p>}
      </section>
      {!ij && <F2DavomRoyxat kompaniyaId={companyId} obyektId={objectId ? Number(objectId) : null} band={busy} onOchish={(id) => void serverdanTikla(id)} />}
      <fieldset disabled={busy} className="karta grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-[12px] font-medium text-text">{t('Obyekt')}
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { oxirgiKalit.current = ''; tozala(); setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
            <option value="">Tanlang</option><ObyektOptionlari obyektlar={objects} />
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
        {akt && (
          <label className="block text-[12px] font-medium text-text">Hisobot davri {akt.davr ? <span className="font-normal text-text-mute">(fayldan: {akt.davrMatn})</span> : <span className="font-normal text-warn">(fayldan topilmadi)</span>}
            <input type="month" value={davr} onChange={(e) => setDavr(e.target.value)} disabled={!!ij && !!done}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]" />
          </label>
        )}
        {akt && (
          <label className="block text-[12px] font-medium text-text">{t('F2 raqami (akt №)')}
            <input aria-label={t('F2 raqami (akt №)')} value={raqam} maxLength={100} placeholder={t('masalan F2-07')} disabled={!!done}
              onChange={(e) => { setRaqam(e.target.value); setAlmashtirTasdiq(null); }}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]" />
            <span className="mt-1 block font-normal text-text-mute">{t('Bir oyda bir nechta F2 bo‘lsa, har biriga o‘z raqamini kiriting — aks holda ular bir-birini almashtiradi.')}</span>
          </label>
        )}
      </fieldset>

      {aktlar.length > 0 && (
        <section className="karta space-y-2 p-3 text-[12px]" aria-label={t('Fayldagi F2 varaqlari')}>
          <div className="flex flex-wrap items-end gap-3">
            <p className="mr-auto font-semibold text-text">{t('Fayldagi F2 varaqlari — har varaq alohida F2')} ({aktlar.length})</p>
            <label className="text-[12px]">{t('Reestr summasi (QQSsiz yoki QQS bilan)')}
              <input aria-label={t('Reestr summasi (QQSsiz yoki QQS bilan)')} className="input mt-1 block h-8 w-56 px-2 tabular-nums" value={reestrMatn}
                onChange={(e) => setReestrMatn(e.target.value)} placeholder="24 143 466 271" disabled={busy} />
            </label>
            {reestrMos.length === 1 && reestrMos[0].i !== aktIdx && <button type="button" className="tugma tugma-asosiy h-8" disabled={busy}
              onClick={() => varaqniTanla(reestrMos[0].i)}>{t('Mos varaqni tanlash')}</button>}
            {reestrSumma != null && reestrMos.length === 0 && <span className="text-warn">{t('Bu summaga mos varaq topilmadi.')}</span>}
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-border text-text-mute">
                <th className="px-1 text-left">{t('Varaq')}</th><th className="px-1 text-left">{t('Davr')}</th><th className="px-1 text-right">{t('Ishlar')}</th>
                <th className="px-1 text-right">{t('ИТОГО ПРЯМЫЕ')}</th><th className="px-1 text-right">{t('ВСЕГО')}</th><th className="px-1 text-left">{t('Holat')}</th>
              </tr></thead>
              <tbody>{aktlar.map((a, i) => {
                const mos = reestrSumma == null ? null : varaqReestrMos(a, reestrSumma);
                const kir = varaqKiritilgan(i);
                return (
                  <tr key={a.varaq + i} onClick={() => { if (!busy && i !== aktIdx) varaqniTanla(i); }}
                    className={`cursor-pointer border-b border-border/40 ${i === aktIdx ? 'bg-accent/10 font-semibold' : 'hover:bg-surface-2'} ${mos ? 'outline outline-2 outline-ok' : ''}`}>
                    <td className="px-1">{i === aktIdx ? '▶ ' : ''}{a.varaq}{manfiyVaraqmi(a) && <span className="ml-1 rounded bg-danger/15 px-1 text-[10px] text-danger">{t('manfiy')}</span>}</td>
                    <td className="px-1">{a.davr ?? '—'}</td>
                    <td className="px-1 text-right tabular-nums">{a.ishlarSoni}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(a.jami.pryamye)}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(a.jami.vsego)}</td>
                    <td className="px-1">{mos && <span className="mr-1 text-ok">✓ {t(VARAQ_MOSLIK_NOMI[mos])}</span>}{kir && <span className="text-text-mute">{kir}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      )}

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
          {kumReja && !done && (
            <p className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface-2/40 px-2 py-1.5 text-[12px] text-text-dim" aria-label={t('Kumulyativ varaq')}>
              <span className="min-w-0 flex-1">{kumRejim
                ? t('Kumulyativ rejim: oldingi F2 lar hajmi ayirildi ({n} qator, −{pul} so‘m).', { n: kumReja.qatorlar.size, pul: fmt(kumReja.ayirilganPul) })
                : t('Hujjatda «Ранее оформленным» bor — hajm kumulyativ ko‘rinadi. Oldingi F2 lar ayirilsinmi?')}
                {kumRejim && kumReja.nazorat && <> {kumReja.nazorat.mos
                  ? <b className="text-ok">{t('Jami = ВСЕГО − ранее ✓')}</b>
                  : <b className="text-warn">{t('ВСЕГО − ранее dan farq: {n} so‘m', { n: fmt(kumReja.nazorat.natija - kumReja.nazorat.kutilgan) })}</b>}</>}
                {kumRejim && kumReja.storno.length > 0 && <> {t('Storno taklifi: {n} qator ({pul} so‘m) — oldingi F2 da bor, bu varaqda yo‘q; minus qator sifatida qo‘lda kiriting.', { n: kumReja.storno.length, pul: fmt(kumReja.storno.reduce((s, x) => s + x.pul, 0)) })}</>}
              </span>
              <button type="button" className="tugma" disabled={busy} onClick={() => setKumRejim((v) => !v)}>{kumRejim ? t('Ayirishni bekor qilish') : t('Oldingi F2 larni ayirish')}</button>
            </p>
          )}
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
            <div>
              <p className="text-warn">Hujjat bo‘yicha {akt.ogohlantirishlar.length} ta ogohlantirish:</p>
              <ul className="mt-1 max-h-24 list-disc space-y-0.5 overflow-auto pl-5 text-text-dim">
                {akt.ogohlantirishlar.map((o, i) => <li key={i}><b className="text-text">{o.kod}</b> — {o.izoh}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}
      {akt && !done && ((avvalgiKalit && (takrorTekshirilmoqda || joriyAvvalgi?.error || joriyAvvalgi?.akt)) || avvalgiImport.length !== 0) && <section
        role={joriyAvvalgi?.akt || joriyAvvalgi?.error || avvalgiImport.length !== 0 ? 'alert' : 'status'} className="karta border border-warn/50 bg-warn/10 p-3 text-[13px] text-warn" aria-label={t('Allaqachon kiritilgan')}>
        {avvalgiImport.length !== 0 && <p className="font-semibold">⚠ {t('Bu varaq allaqachon kiritilgan')}: {avvalgiImport.map((k) => { const a = aktNomlari.get(k.aktId); return `F2 ${a?.raqam ?? '#' + k.aktId} (${(a?.oy ?? '').slice(0, 7)}, ${a?.holat ?? ''})`; }).join('; ')}. {t('Takror kiritish hajmni ikki marta yopadi.')}</p>}
        {!avvalgiKalit ? null : takrorTekshirilmoqda ? <p>{t('Avval kiritilgan F2 tekshirilmoqda…')}</p> : joriyAvvalgi?.error ? <>
          <p>{t('Avvalgi F2 tekshirilmadi. Takroriy akt yaratmaslik uchun qayta tekshiring. Bog‘lanishlar saqlanadi.')}</p>
          <button type="button" className="tugma mt-2" onClick={() => setTekshiruv((v) => v + 1)}>{t('Qayta tekshirish')}</button>
        </> : joriyAvvalgi?.akt && <>
          <p className="font-semibold">{mavjudQoralama
            ? t('Shu obyekt, oy va raqam uchun F2 qoralama bor. «F2 ni yozish» uning BARCHA qatorlarini shu fayl bilan almashtiradi.')
            : t('Bu obyekt va oy uchun F2 akt allaqachon bor. Bog‘lashni davom ettirishingiz mumkin — faqat yangi akt saqlanmaydi.')}</p>
          <p>#{joriyAvvalgi.akt.id} · {joriyAvvalgi.akt.oy.slice(0, 7)} · №{joriyAvvalgi.akt.raqam || '—'} · {joriyAvvalgi.akt.lifecycle_status ?? joriyAvvalgi.akt.holat}</p>
          {mavjudQoralama ? <>
            <p>{t('Bu boshqa F2 bo‘lsa — yuqorida uning o‘z raqamini kiriting: yangi akt alohida yaratiladi, mavjud qoralama tegilmaydi.')}</p>
            <label className="mt-2 flex items-center gap-2 font-semibold text-text">
              <input type="checkbox" checked={almashtirTasdiq === mavjudQoralama.id} disabled={busy || !!done}
                onChange={(e) => setAlmashtirTasdiq(e.target.checked ? mavjudQoralama.id : null)} />
              {t('Ha, qoralama #{id} qatorlarini shu fayl bilan almashtirish', { id: mavjudQoralama.id })}
            </label>
          </> : <p>{t('Mavjud aktni oching. Yangi fayl tuzatish bo‘lsa, uni alohida tuzatish tartibida kiriting; amaldagi akt o‘zgartirilmadi.')}</p>}
          <a href={`/admin/f2-tarix?obyekt=${Number(objectId)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>
        </>}
      </section>}
      {ogoh && <p className="text-[12px] text-warn">{ogoh}</p>}
      {xato && <div role="alert" className="text-[13px] text-danger"><p>{xato}</p>{aktZiddiyat && <a
        href={`/admin/f2-tarix?obyekt=${Number(objectId)}`} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-block underline text-accent">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>}</div>}

      {akt && ij && (rows.length === 0 ? <section className="karta space-y-2 border-2 border-sky-500/50 bg-sky-500/5 p-3 text-[13px]" aria-label={t('Smetasi yo‘q obyekt')}>
        <p className="font-semibold text-text">{t('Bu obyektda smeta yo‘q. F2 ni baribir kiritish mumkin: F2 dagi ishlar smetaga o‘z bo‘limlari bilan qo‘shimcha ish (resurslari bilan) bo‘lib yoziladi va akt shularga bog‘lanadi.')}</p>
        <button type="button" className="tugma tugma-asosiy" disabled={busy || !!done} onClick={f2ToliqOtkaz}>{t('F2 dagi barcha ishlarni qoralamaga qo‘shish')}</button>
      </section> : <section className="karta flex flex-wrap items-center gap-2 border border-sky-500/40 bg-sky-500/5 p-2 text-[12px]" aria-label={t('F2 ni to‘liq o‘tkazish')}>
        <span className="min-w-0 flex-1 text-text-dim">{t('Smetada yo‘q ishlar ko‘pmi? Bog‘lanmagan barcha F2 ishlarini bo‘limlari bilan smetaga qo‘shimcha qilib qoralamaga qo‘shing (bog‘langanlari tegilmaydi).')}</span>
        <button type="button" className="tugma" disabled={busy || !!done} onClick={f2ToliqOtkaz}>{t('Bog‘lanmagan F2 ni smetaga o‘tkazish')}</button>
      </section>)}

      {akt && ij && (
        <section className="karta sticky top-0 z-20 flex flex-wrap items-center gap-3 border-2 border-accent/50 bg-surface p-3 shadow-md" aria-label={t('Moslashtirish')}>
          <button type="button" className="tugma tugma-asosiy" disabled={busy || !!done} onClick={() => void aniqBogla()}>{t('Mos qatorlarni bog‘lash')}</button>
          <button type="button" className="tugma" disabled={busy || !!done || !tarixSoni} onClick={orqaga} title={t('Oxirgi bog‘lash, uzish yoki tasdiqni qaytarish (Ctrl+Z)')}>↶ {t('Orqaga')}{tarixSoni ? ` (${tarixSoni})` : ''}</button>
          <span className="flex flex-wrap gap-x-3 text-[12px] text-text-dim" aria-label={t('Holat')}>
            <span className="text-ok">✓ {payload && !payload.error ? payload.rows.length : 0} {t('aktga kiradi')}</span>
            {taklifSoni > 0 && <span className="text-warn">◐ {taklifSoni} {t('tasdiq kutmoqda')}</span>}
            {!!yozish?.qolgan.length && <span>✕ {yozish.qolgan.length} {t('kiritilmaydi')}</span>}
            {rejali.length + ochirish.length > 0 && <span className="text-sky-600 dark:text-sky-300">⏳ {rejali.length + ochirish.length} {t('o‘zgarish qoralamada')}</span>}
          </span>
          {done && keyingi != null && <button type="button" className="tugma tugma-asosiy ml-auto" disabled={busy} onClick={() => varaqniTanla(keyingi)}>
            {t('Keyingi varaq → yangi F2')}: {aktlar[keyingi]?.varaq}</button>}
          {done ? (!jarayon && <p className="ml-auto text-[13px] text-ok">{done}</p>) : (
            <button type="button" className="tugma tugma-asosiy ml-auto" disabled={busy || !payload || saqlashBlok}
              onClick={() => void saqla()}>
              {t('F2 ni yozish')}{payload && !payload.error ? ` (${payload.rows.length} ${t('qator')}${rejali.length + ochirish.length ? ` + ${rejali.length + ochirish.length} ${t('o‘zgarish')}` : ''})` : ''}
            </button>
          )}
        </section>
      )}

      {akt && ind && natija && ij && (
        <F2V3Workbench akt={akt} ind={ind} natija={natija} S={S} raw={raw} oldingi={oldingi} band={band}
          ij={ij} onIj={ijOzgar} onRzBog={rzOrgat} companyId={companyId} objectId={Number(objectId)}
          onYaratildi={yaratildi} zamenaAsl={zamenaAslK} onQoshilganOzgardi={qoshilganOzgardi} onRejali={onRejali} onRejaliOchir={onRejaliOchir} onOchirishRejali={onOchirishRejali} onTahrirRejali={onTahrirRejali} onBolimRejali={bolimRejali} rejaliIdlar={() => rejaliRef.current.map((b) => b.tempId)} disabled={busy || !!done} />
      )}

      {ochirish.length > 0 && <section className="karta space-y-1 border border-rose-500/40 bg-rose-500/5 p-3 text-[12px]" aria-label={t('O‘chirishga belgilangan')}>
        <p className="font-semibold text-text">🗑 {ochirish.length} {t('ta qator o‘chirishga belgilangan — «F2 ni yozish» bosilganda o‘chiriladi.')}</p>
        <ul className="max-h-32 space-y-0.5 overflow-auto">{ochirish.map((o) => <li key={o.qatorId} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate line-through decoration-rose-500/70">{o.nom}</span>
          <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={busy} onClick={() => ochirishniBekor(o.qatorId)}>{t('Bekor qilish')}</button>
        </li>)}</ul>
      </section>}
      {rejali.length > 0 && <section className="karta space-y-1 border border-sky-500/40 bg-sky-500/5 p-3 text-[12px]" aria-label={t('Saqlanmagan o‘zgarishlar')}>
        <p className="font-semibold text-text">⏳ {rejali.length} {t('ta qo‘shimcha/zamena qoralamada — «Saqlash» bosilganda hammasi bittada yoziladi.')}</p>
        <ul className="max-h-40 space-y-0.5 overflow-auto">{rejali.map((b) => <li key={b.tempId} className="flex items-center gap-2">
          <span className={`rounded px-1 text-[10px] font-semibold ${b.kind === 'replacement' || b.kind === 'resurs_ish' ? 'bg-amber-500/25' : 'bg-emerald-500/25'}`}>{b.kind === 'replacement' || b.kind === 'resurs_ish' ? t('zamena') : b.kind === 'resource' ? t('resurs') : b.kind === 'bolim' ? t('bo‘lim') : t('qo‘shimcha')}</span>
          <span className="min-w-0 flex-1 truncate">{b.nom} · {b.hajm ?? '—'} {b.birlik}{b.resurslar.length ? ` · ${b.resurslar.length} ${t('resurs')}` : ''}</span>
          {([-1, 1] as const).map((yon) => <button key={yon} type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={busy || !rejaliSurishMumkin(rejali, b.tempId, yon)} onClick={() => onRejaliSurish(b.tempId, yon)} aria-label={`${yon < 0 ? t('Yuqoriga') : t('Pastga')}: ${b.nom}`}>{yon < 0 ? '▲' : '▼'}</button>)}
          <button type="button" className="tugma h-6 px-1.5 text-[11px]" disabled={busy} onClick={() => onRejaliOchir(b.tempId)} aria-label={`${t('Olib tashlash')}: ${b.nom}`}>✕</button>
        </li>)}</ul>
      </section>}

      {oshishlar.length !== 0 && !done && (
        <section className="karta space-y-2 border border-warn/50 bg-warn/5 p-3 text-[12px]" aria-label={t('Dublikat hajm nazorati')}>
          {oshishlar.length !== 0 && <>
            <p className="font-semibold text-warn">{t('{n} ta qator smeta qoldig‘idan oshadi (ma’lumot uchun — yozish to‘xtatilmaydi).', { n: oshishlar.length })}</p>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-[11.5px]">
                <thead><tr className="text-text-mute"><th className="text-left">{t('Smeta qatori')}</th><th className="text-right">{t('Smeta')}</th><th className="text-right">{t('Tasdiqlangan F2')}</th><th className="text-right">{t('Qoralamalarda band')}</th><th className="text-right">{t('Shu F2')}</th><th className="text-right">{t('Oshdi')}</th></tr></thead>
                <tbody>{oshishlar.slice(0, 200).map((o) => <tr key={o.qatorId} className="border-t border-border/40">
                  <td className="pr-2">{raw.get(o.qatorId)?.kod ?? ''} {raw.get(o.qatorId)?.nom ?? '#' + o.qatorId}</td>
                  <td className="text-right tabular-nums">{fmt(o.smeta)}</td><td className="text-right tabular-nums">{fmt(o.tasdiqlangan)}</td>
                  <td className="text-right tabular-nums">{fmt(o.band)}</td><td className="text-right tabular-nums">{fmt(o.shu)}</td>
                  <td className="text-right font-semibold tabular-nums text-danger">{fmt(-o.qoldiq)}</td></tr>)}</tbody>
              </table>
            </div>
          </>}
        </section>
      )}

      {yozish && (yozish.qolgan.length > 0 || yozish.toxtatish.length > 0 || payload?.error) && (
        <section className="karta space-y-2 p-3" aria-label={t('Aktga kirmaydiganlar')}>
          {!!yozish.qolgan.length && <div className="text-[12px] text-warn"><p>{t('Bog‘lanmagan yoki tasdiqlanmagan qatorlar aktga kiritilmaydi; ular manba va server ish qoralamasida saqlanadi. Qoralama aktni saqlash mumkin. Minuslar kiritilmasa, ular oldingi hajmlarni kamaytirmaydi.')} ({yozish.qolgan.length})</p>
            <ul className="mt-1 max-h-24 overflow-auto pl-4 text-text-dim">{yozish.qolgan.map((n) => <li key={n.uid}>{n.manzil.varaq}!{n.manzil.qator} · {n.nom} · {fmt(n.hajm)} {n.birlik}</li>)}</ul>
          </div>}
          {akt && ij && ind?.qatorlar.some((q) => q.hajm != null && q.hajm < 0 && !ij.bog.has(q.uid) && !ij.otkaz.has(q.uid)) && <button type="button" className="tugma" disabled={busy || !!done} onClick={() => {
            const result = f2MinusTaklif(akt, ij); ijOzgar(result.ij);
            setHolat(`${result.soni} ta minus qator uchun ayni aktdagi aniq bog‘lanish asosida taklif berildi. Har birini tekshirib tasdiqlang; boshqa qatorlarni qo‘lda bog‘lang.`);
          }}>{t('Minus qatorlarga bog‘lanish taklif qilish')}</button>}
          {yozish.toxtatish.map((m, i) => <p key={i} className="text-[12px] text-warn">{m}</p>)}
          {payload?.error && <p role="alert" className="text-[12px] text-danger">{payload.error}</p>}
        </section>
      )}

      {jarayon && <F2YozishOynasi qadamlar={jarayon} natija={done} band={busy || davomEt}
        onQayta={() => void saqla()} onYop={() => setJarayon(null)} />}
    </section>
  );
}

export default function F2ImportV3() {
  const { joriy, yuklanmoqda } = useKompaniya();
  if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
