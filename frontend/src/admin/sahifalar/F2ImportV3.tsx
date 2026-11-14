import { ObyektOptionlari } from '../../umumiy/ui/ObyektOptionlari';
import { yaxlit2 } from '../../lib/hisob-yadro';
import { fayldanKalitBog } from '../../lib/f2-kalit-bogla';
import { avvalgiF2Ol, f2RaqamNormal, qoralamaAktmi, type AvvalgiF2 } from '../../lib/f2-moslash-v3/takror';
import { f2ObyektFayldan, f2OyFayldan, f2RaqamFayldan } from '../../lib/f2-moslash-v3/fayl-nomi';
import { podvalYorliq } from '../../lib/podval-yorliq';
import { keyingiF2Raqam } from '../../lib/f2-tayyorlash-korinish';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';

/** JQA-07: faol ish (ij) va serverdagi job/akt URL'da ham turadi (`?job=…&akt=…`, replace — tarixga yozilmaydi).
 *  F2 bo'limi tablari (BolimTablari) shu tabning oxirgi URL'ini eslab qoladi — boshqa tabga o'tib qaytganda
 *  qoralama mount'dagi odatiy `job`/`akt` o'qish orqali o'zi tiklanadi. Biz yozgan paramlar ish tugaganda o'chiriladi.
 *  Alohida komponent: F2ImportV3 Router'siz (testlarda) ham render bo'ladi. */
function F2UrlSinxron({ faol, jobId, aktId }: { faol: boolean; jobId: number | null; aktId: number | null }) {
  const [, setSearchParams] = useSearchParams();
  const yozildi = useRef(false);
  useEffect(() => {
    const bor = faol && jobId != null;
    if (!bor && !yozildi.current) return;
    yozildi.current = bor;
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (bor) { n.set('job', String(jobId)); if (aktId != null) n.set('akt', String(aktId)); else n.delete('akt'); }
      else { n.delete('job'); n.delete('akt'); }
      return n;
    }, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faol, jobId, aktId]);
  return null;
}
import {
  sbOqi, sbT2AktYaratV2, sbT2F2QoralamaYangila, sbT2DaraxtOl, sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt, type T2Qator,
} from '../../api/supabase';
import { t2NakopitelniyToliq } from '../../api/t2-nakopitelniy';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { SummaJuft } from '../../umumiy/ui/SummaJuft';
import { useUstamaliSumma } from '../../umumiy/ui/useUstamaliSumma';
import { qolganSummaMatni } from './f2-qolgan-summa';
import { katKesimNomalumBilan, katKesimYigish } from '../../lib/ustamali-summa';
import { usePTOWorkspace } from '../../umumiy/kontekst/PTOWorkspaceContext';
import { ZanjirChizigi } from '../components/ZanjirChizigi';
import { F2TekshiringRoyxat } from './F2TekshiringRoyxat';
import { tiyingaYaxlitla, type F2Akt, type F2Tugun } from '../../lib/smeta-anatomiya/f2';
import { f2AktlarniOqiFonda, f2MoslashV3Fonda } from '../../lib/f2-moslash-v3/fonda';
import type { F2MoslashNatija, SmetaQator } from '../../lib/f2-moslash-v3';
import {
  avtoBogmi, avtoBoglarniUz, bogla, boshlangich, f2Indeks, ishlarResurslariniBogla, smetaIndeks, tarkibniMosla, type IshJoyi,
} from '../../lib/f2-moslash-v3/ishJoyi';
import { exactWrite, exactWriteIzohlar } from '../../lib/f2-exact-write';
import { qoldiqOshishlari, qoralamaBandi, type BandManba } from '../../lib/f2-moslash-v3/band';
import { kumulyativmi, kumulyativQolla, kumulyativReja } from '../../lib/f2-moslash-v3/kumulyativ';
import { dvigatelDaraxti, podvalTaklifQosh } from '../../lib/f2-moslash-v3/podval';
import { tkmBirlikmi, tkmTaklif } from '../../lib/f2-moslash-v3/tkm';
import { bogIdlari, guruhHisobla, snapshotdanBog } from '../../lib/f2-moslash-v3/ishJoyi';
import { f2DavomRoyxatOl, type T2F2DavomQator } from '../../api/t2-f2-davom';
import { eskiYozilmagan } from '../../lib/f2-ketma-ketlik';
import { VARAQ_MOSLIK_NOMI, keyingiVaraq, manfiyVaraqmi, summaniOqi, varaqReestrMos } from '../../lib/f2-moslash-v3/varaq-tanlov';
import { qoshilganOzgardi as qoshilganOzgardiLib } from '../../lib/f2-moslash-v3/qoshilgan';
import { F2V3Workbench } from './F2V3Workbench';
import { F2DavomRoyxat } from './F2DavomRoyxat';
import { F2EgizakNusxa } from './F2EgizakNusxa';
import { F2DublikatPanel } from './F2DublikatPanel';
import { F2MoslashHisoboti } from './F2MoslashHisoboti';
import { toast } from '../../umumiy/ui/Toast';
import { moslikHisobla, moslikTuzilma, type MoslikNatija } from '../../lib/ish-material-moslik';
import { IshMaterialOgohRoyxat } from '../../components/fakt/IshMaterialOgoh';
import { moslashHisoboti } from '../../lib/f2-moslash-v3/moslashHisoboti';
import { bloklarmi, dublikatTekshiruv, pereraschetBelgisi, type DAkt } from '../../lib/f2-dublikat/tekshiruv';
import { egizakRaqamMasalasi } from '../../lib/f2-moslash-v3/egizak';
import { abcXato, ishAbcOchir, ishAbcSaqla, resursIshZamena, type ResursIshInput } from '../../api/t2-ish-abc';
import { katAniqla } from '../../lib/ish-abc';
import { BOSH_QADAMLAR, F2YozishOynasi, type Qadam, type QadamHolat, type QadamId } from './F2YozishOynasi';
import type { ModalRejali } from './F2AddReplModal';
import { BOLIM_ILDIZ, SMETASIZ_RZ, resursTuri, type OchirishBuyruq, ijniAlmashtir, vaqtinchami, rejaliniYoz, rejaliniYozilganlardanTozala, type YozilganQator, rejaliOchir, rejaliBuyruqQosh, otadiganResurslar, rejaliQatorlar, rejaliSurish, rejaliSurishMumkin, yangiTempIdlar, type RejaliBuyruq, type RejaliYaratish } from '../../lib/f2-moslash-v3/rejali';
import { sbT2IshResurslarBilanYarat, sbT2QoshimchaIshYarat, sbT2ResursBolaQosh, sbT2ZamenaAlmashtirishBelgila, sbT2ZamenaIshYarat } from '../../api/t2-additional-replacement';
import { faylBaytlari, faylExplorerOl } from '../../api/t2-fayl';
import { aktPodvalYoz } from '../../api/t2-akt-podval';
import { olchov, type Olchov } from '../../lib/vaqt-olchov';
import { nakQoldiqXaritalari } from '../../lib/f2-moslash-v3/nakQoldiq';
import { bolimXato, smetaBolimYarat } from '../../api/t2-smeta-bolim';
import type { Fayl } from '../../lib/fayl-daraxt';
import { t } from '../../i18n/til';
import { aktualVorisOl, faktYozuvlariOl } from '../../api/t2-f2-aktual';
import { sbFaktYoz } from '../../api/t2-fakt';
import { faktDeltaReja, faktMavjudYigish, xotiraniAktualla, type FaktReja } from '../../lib/f2-moslash-v3/aktual';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { tasdiqSora } from '../../umumiy/ui/Tasdiq';
import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { useHotkeys } from '../../lib/hotkeys/useHotkeys';
import { f2IshchiOl, f2IshchiSaqla, f2ServerCorrectionSaqla, f2PendingCorrectionOl, type F2PendingCorrection, f2MinusTaklif, f2QoralamaBogTekshir, f2QoralamaYozish, f2ServerOl, f2ManbaMosla, f2BuzilganniBoshat, f2ServerSaqla, f2ServerSaqlaBardoshli, F2ServerZiddiyat, type F2IshchiQoralama, type F2ServerQoralama } from '../../lib/f2-ishchi-qoralama';

/**
 * F2 IMPORT V3 (docs/architecture/F2_IMPORT_V3.md): fayl → akt (davr, jami, ogohlantirishlar
 * fayldan, ustun raqamlari so'ralmaydi) → operator tugmasi bilan moslash → ikki oynali drag-drop
 * ish joyi → F2 qoralamasi (`t2_akt_yarat_v2`), manba fayl R2 da.
 * Qoralama aktga faqat tasdiqlangan bog'lanishlar yoziladi; qolganlari ish qoralamasida saqlanadi.
 */

const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Smetada allaqachon yozilgan qo'shimcha qatorlar (operation_id bilan) — rejali buyruqlar bajarilganligini aniqlash uchun. */
async function rejaliniTozala(oid: number, rejali: RejaliBuyruq[], ij: IshJoyi): Promise<{ rejali: RejaliBuyruq[]; ij: IshJoyi; soni: number }> {
  if (!rejali.length) return { rejali, ij, soni: 0 };
  const r = await sbOqi<YozilganQator>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${oid}&qoshimcha=eq.true`, ustunlar: 'id,ota_id,operation_id,tur,nom,tartib', limit: 50000 });
  if (!r.ok) return { rejali, ij, soni: 0 };
  const { qolgan, map } = rejaliniYozilganlardanTozala(rejali, r.qatorlar ?? []);
  return { rejali: qolgan, ij: map.size ? ijniAlmashtir(ij, map) : ij, soni: rejali.length - qolgan.length };
}
/** Oylik F2 paketidan «+ F2 yuklash»: /admin/f2?davr=YYYY-MM — fayldan davr o'qilmasa shu oy oldindan qo'yiladi. */
function urlDavr(): string {
  const d = new URLSearchParams(window.location.search).get('davr') ?? '';
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(d) ? d : '';
}

/** Server qoralamasi (yordamchi qadam) xatosi — foydalanuvchi tilida; akt yozishni to'xtatmaydi. */
function serverXatoMatni(e: unknown): string {
  if (e instanceof F2ServerZiddiyat) return `${e.uidlar.length} ${t('qatorda server qarori boshqacha bog‘langan (boshqa joyda o‘zgartirilgan)')}`;
  const m = e instanceof Error ? e.message : '';
  if (/TERMINAL_JOB/.test(m)) return t('Bu qoralama bekor qilingan');
  if (/STALE/.test(m)) return t('Qoralama boshqa joyda o‘zgargan');
  return m || t('Server qoralamasi saqlanmadi.');
}
/** Tizimda (R2) saqlangan F2 fayllar: avval import qilingan manba va arxivlangan tasdiqlangan F2 — qayta yuklash shart emas. */
const TIZIM_F2_TURLARI = ['f2_akt', 'f2_hujjat'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Dublikat qo'riqchi uchun akt qatorlari (band hajm, avvalgi import fayl+varaq). */
type AktQatorBand = { akt_id: number; qator_id: number; hajm: number | null; certified_quantity: number | null; raw_snapshot: { manba?: string; qatorlar?: SnapQator[]; fayl?: string; varaq?: string; fayl_sha256?: string } | null };
const nullga = () => null;
type AktQisqa = { id: number; raqam: string | null; oy: string | null; holat: string; tur: string; hujjat_jami?: number | null; manba?: string | null };
const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n));

/** F2 import uchun kerakli smeta ustunlari (prod profil 2026-10-24: 25k qatorda d1–d3/obyekt nomi har qatorda ~28% hajm). */
const F2_SMETA_USTUNLAR = 'id,obyekt_id,ota_id,daraja,tartib,tur,kod,nom,birlik,hajm,narx,kat,summa,narx_usul,qoshimcha,zamena,versiya,raqam,norma';

function smetaQatorlari(rows: T2Qator[]): SmetaQator[] {
  return rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx, norma: (q as T2Qator & { norma?: number | null }).norma ?? null, tartib: q.tartib, kat: q.kat }));
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
  /** Egizak nusxadan keyin F2 raqami ko‘chirilmaydi: yangi raqam so‘raladi (a — egizak F2 ning raqami, takrorlanmasin). */
  const [egizakRaqam, setEgizakRaqam] = useState<{ a: string } | null>(null);
  /** «✎ Tahrirlash»: shu akt (qoralama) qayta ochilgan - «F2 ni yozish» uning qatorlarini almashtiradi (qo'shimcha tasdiq so'ralmaydi). */
  const [tahrirAkt, setTahrirAkt] = useState<number | null>(null);
  /** Kumulyativ varaq rejimi (operator yoqadi): oldingi F2 lar hajmi shu varaqdan ayriladi — faqat yozish proyeksiyasi. */
  const [kumRejim, setKumRejim] = useState(false);
  /** Maqsad: F2 qoralama (standart) yoki FAKT delta (ekspertizadan oldingi qo'lda F2/LRV fayllari). */
  const [faktRejim, setFaktRejim] = useState(false);
  const [faktMavjud, setFaktMavjud] = useState<{ map: Map<number, number>; yetim: number } | null>(null);
  const [faktXato, setFaktXato] = useState('');
  /** Shu obyektning server qoralamalari (ketma-ketlik nazorati: eskiroq yozilmagan F2 bo'lsa ogohlantirish). */
  const [davomRoyxat, setDavomRoyxat] = useState<T2F2DavomQator[]>([]);
  const [ketmaKetBartaraf, setKetmaKetBartaraf] = useState<number | null>(null);
  /** Faylda transport qatori yo'q: smetadagi ТН·КМ qatoriga bog'langan F2 qatori sifatida qo'shilgan hajm (smeta qatori id -> hajm). */
  const [tkmQosh, setTkmQosh] = useState<ReadonlyMap<number, number>>(new Map());
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
  const [oldingi, setOldingi] = useState(new Map());
  /** Zamena qoplagan hajm (asl qator id -> hajm): asl qoldig'idan ayriladi (lib/zamena-qoldiq). */
  const [almashtirilgan, setAlmashtirilgan] = useState(new Map());
  // Dublikat qo'riqchi: boshqa (bekor qilinmagan) F2 qoralamalaridagi hajmlar va shu faylning avvalgi importlari.
  const [bandLines, setBandLines] = useState<BandManba[]>([]);
  const [avvalKiritilgan, setAvvalKiritilgan] = useState<Array<{ aktId: number; fayl: string; varaq: string; sha?: string }>>([]);
  const [obyektAktlari, setObyektAktlari] = useState<DAkt[]>([]);
  const [aktNomlari, setAktNomlari] = useState(new Map<number, { raqam: string | null; oy: string | null; holat: string }>());
  const [faylSha, setFaylSha] = useState('');
  // Har varaq = alohida F2 (egasi 2026-10-23): reestr summasi bo'yicha varaqni topish va ketma-ket import.
  const [reestrMatn, setReestrMatn] = useState('');
  const [sessiyaKiritilgan, setSessiyaKiritilgan] = useState<ReadonlySet<string>>(new Set());
  const [qoldiq, setQoldiq] = useState(new Map());
  const [xotira, setXotira] = useState(new Map<string, number>());
  const [rzBog, setRzBog] = useState(new Map<string, number>());
  const [natija, setNatija] = useState<F2MoslashNatija | null>(null);
  const [ij, setIj] = useState<IshJoyi | null>(null);
  const [busy, setBusy] = useState(false);
  const [holat, setHolat] = useState('Obyekt va F2 faylni tanlang.');
  const [xato, setXato] = useState('');
  const [aktZiddiyat, setAktZiddiyat] = useState(false);
  /** Maqsad akt: tizimda yasalgan (manba hujjatsiz) QORALAMA - yangi fayl shu aktga yuklanadi (yozish: sbT2F2QoralamaYangila, akt id/raqam saqlanadi). */
  const [maqsadAkt0, setMaqsadAkt] = useState<{ id: number; raqam: string | null; oy: string; obyektId: number } | null>(null);
  /* F2 raqami bo'sh qolsa (fayl nomida yo'q) — obyektdagi keyingi raqam taklif qilinadi (yozish qo'lda tasdiqlanadi); mavjud aktni yangilashda tegilmaydi. */
  useEffect(() => {
    if (!aktlar.length || maqsadAkt0 || !objectId) return;
    const r = keyingiF2Raqam(obyektAktlari);
    if (r) setRaqam((x) => (x.trim() ? x : r));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obyektAktlari, aktlar.length, objectId]);
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
  /* JQA-07: faol ish va serverdagi job/akt URL'da ham turadi — pastdagi <F2UrlSinxron/> (faqat Router ichida). */
  const routerda = useInRouterContext();
  const [serverHolat, setServerHolat] = useState('');
  const keyingiHalRef = useRef<(() => void) | null>(null);
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
      const tz = await rejaliniTozala(d.objectId, d.rejali ?? [], restored);
      setRejali(tz.rejali); setOchirish(d.ochirishlar ?? []);
      // No auto-match effect may reset recovered manual decisions.
      oxirgiKalit.current = `${d.objectId}|${d.aktIdx}|${d.davr}|${d.aktlar[d.aktIdx].fayl}`;
      void faylShaHisobla(rawFile.current = new File([d.source.blob], d.source.name, { type: d.source.blob.type, lastModified: d.source.lastModified }));
      sourceDoc.current = d.source.documentId; sourceOp.current = d.sourceOperationId; operation.current = d.operationId;
      serverDraft.current = d.server;
      setObjectId(String(d.objectId)); workspace.setObjectId(d.objectId);
      setAktlar(d.aktlar); setAktIdx(d.aktIdx); setDavr(d.davr); setRzBog(d.rzBog); setRaqam(d.raqam ?? ''); setAlmashtirTasdiq(null);
      setNatija(d.natija); tarixniTozala(); setIj(tz.ij); setDone(null);
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
  const urlAkt = useRef<number | null>((() => { const j = Number(new URLSearchParams(window.location.search).get('akt')); return Number.isSafeInteger(j) && j > 0 ? j : null; })());
  const urlJob = useRef<number | null>((() => { const j = Number(new URLSearchParams(window.location.search).get('job')); return Number.isSafeInteger(j) && j > 0 ? j : null; })());
  useEffect(() => {
    if (!objects.length || ij || busy) return;
    if (urlJob.current == null && urlAkt.current != null) {
      // F2 tarixidagi «✎ Tahrirlash»: akt -> uning server ish qoralamasi (eng so'nggi yangilangani).
      const aktId = urlAkt.current; urlAkt.current = null;
      const oid = Number(new URLSearchParams(window.location.search).get('obyekt'));
      void f2DavomRoyxatOl(companyId, Number.isSafeInteger(oid) && oid > 0 ? oid : null).then((r) => {
        const q = (r.ok ? r.qatorlar : []).filter((x) => x.akt_id === aktId).sort((a, b) => String(b.yangilandi).localeCompare(String(a.yangilandi)))[0];
        void tahrirlash(q?.job_id ?? null, aktId, Number.isSafeInteger(oid) && oid > 0 ? oid : (q?.obyekt_id ?? 0));
      }).catch(() => setXato(t('F2 qoralamalari o‘qilmadi')));
      return;
    }
    if (urlJob.current == null) return;
    const id = urlJob.current; urlJob.current = null;
    const aktU = urlAkt.current; urlAkt.current = null;
    if (aktU != null) void tahrirlash(id, aktU, Number(new URLSearchParams(window.location.search).get('obyekt')) || 0); else void serverdanTikla(id);
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


  const maqsadAkt = maqsadAkt0 && Number(objectId) === maqsadAkt0.obyektId ? maqsadAkt0 : null;
  /** Maqsad akt rejimida fayl tanlangach davr va raqam aktniki bo'ladi - kalit mavjud qoralamaga mos tushib, odatdagi almashtirish yo'li ishlaydi. */
  useEffect(() => {
    if (!maqsadAkt || !aktlar.length) return;
    setRaqam(maqsadAkt.raqam ?? ''); setDavr(maqsadAkt.oy);
  }, [maqsadAkt, aktlar]);
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
  /** Qoralama id → server qaytargan oxirgi versiya (t2_f2_qoralama_yangila_v1, PR #294). */
  const qoralamaVersiya = useRef(new Map());
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
    setAktIdx(i); setDavr(maqsadAkt ? maqsadAkt.oy : aktlar[i]?.davr ?? davr); setRaqam(maqsadAkt?.raqam ?? ''); setAlmashtirTasdiq(null); setJarayon(null);
  }
  const avvalgiImport = useMemo(() => {
    if (!akt) return [];
    return avvalKiritilgan.filter((k) => k.aktId !== mavjudQoralama?.id && k.varaq === akt.varaq && (k.sha ? !!faylSha && k.sha === faylSha : k.fayl === akt.fayl));
  }, [avvalKiritilgan, akt, faylSha, mavjudQoralama?.id]);
  useEffect(() => { if (tahrirAkt != null && mavjudQoralama?.id === tahrirAkt && almashtirTasdiq !== tahrirAkt) setAlmashtirTasdiq(tahrirAkt); }, [tahrirAkt, mavjudQoralama?.id, almashtirTasdiq]);
  const tahrirdaQoralama = tahrirAkt != null && mavjudQoralama?.id === tahrirAkt ? mavjudQoralama : null;
  const maqsadMosEmas = !!maqsadAkt && !!akt && !takrorTekshirilmoqda && mavjudQoralama?.id !== maqsadAkt.id; // maqsad qoralama topilmasa YANGI akt yaratilmasin
  const saqlashBlok = takrorTekshirilmoqda || (!!joriyAvvalgi?.akt && !mavjudQoralama) || almashtirishKutilmoqda || maqsadMosEmas;
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
  // Ish narxi tarkibi (Stella protokoli): resurslar summasi ish summasiga teng bo'lsa — avtomatik hal; tarixga yozilmaydi.
  useEffect(() => {
    if (!ij || !ind) return;
    const yangi = tarkibniMosla(ij, ind, S);
    if (yangi !== ij) setIj(yangi);
  }, [ij, ind, S]);
  // Podval ◐ takliflari smeta yangilanganda ham (masalan operator hozirgina «Таможенные расходы» ni qo'shdi) qayta
  // hisoblanadi — faqat bog'lanmagan va o'tkazilmagan podval qatorlari; operator uzgan taklif ij o'zgarishida qaytmaydi.
  useEffect(() => {
    const cur = ijRef.current;
    if (!cur || !ind) return;
    const next = podvalTaklifQosh(cur, ind.qatorlar, rows);
    if (next !== cur) { ijRef.current = next; setIj(next); }
  }, [rows, ind]);
  const raw = useMemo(() => new Map(rowsK.map((r) => [r.id, r])), [rowsK]);
  // Zamena qatori → u almashtirgan ASL smeta qatori (t2_daraxt da yo'q — alohida, faqat zamena qatorlari uchun).
  const [zamenaAsl, setZamenaAsl] = useState<ReadonlyMap<number, number>>(new Map());
  /** Birlik farqli zamenaning kiritilgan almashtirish hajmi (aslning birligida) -- yozilgan zamenalar uchun. */
  const [zamenaMiqdor, setZamenaMiqdor] = useState<ReadonlyMap<number, number>>(new Map());
  const zamenaKalit = useMemo(() => rows.filter((r) => r.zamena).map((r) => r.id).join(','), [rows]);
  useEffect(() => {
    const idlar = zamenaKalit ? zamenaKalit.split(',') : [];
    if (!idlar.length || !objectId) { setZamenaAsl(new Map()); setZamenaMiqdor(new Map()); return; }
    let active = true;
    void sbOqi<{ id: number; replaces_line_id: number | null; almashtirish_hajm?: number | null }>({ jadval: 't2_qator', filtr: `obyekt_id=eq.${objectId}&id=in.(${idlar.slice(0, 2000).join(',')})`, ustunlar: 'id,replaces_line_id,almashtirish_hajm', limit: 2000 })
      .then((d) => {
        if (!active || !d.ok) return;
        setZamenaAsl(new Map((d.qatorlar ?? []).filter((x) => x.replaces_line_id != null).map((x) => [Number(x.id), Number(x.replaces_line_id)])));
        setZamenaMiqdor(new Map((d.qatorlar ?? []).filter((x) => x.replaces_line_id != null && x.almashtirish_hajm != null).map((x) => [Number(x.id), Number(x.almashtirish_hajm)])));
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
  /** Zamena qatori -> kiritilgan almashtirish hajmi (aslning birligida): yozilganlar + rejali (hali yaratilmagan) zamenalar. */
  const zamenaMiqdorK = useMemo(() => {
    const qosh = rejali.filter((b) => (b.kind === 'replacement' || b.kind === 'resurs_ish') && b.almashtirilayotganQatorId != null && b.almashtirishHajm != null);
    if (!qosh.length) return zamenaMiqdor;
    const m = new Map(zamenaMiqdor);
    for (const b of qosh) m.set(b.tempId, b.almashtirishHajm as number);
    return m;
  }, [zamenaMiqdor, rejali]);

  function tozala() {
    // Scope/file switch must flush pending decisions before clearing in-memory state.
    setAvtoMoslandi(false);
    const draft = lastWorkingDraft.current;
    if (draft) void f2IshchiSaqla(draft).catch((e) => setIshXato(e instanceof Error ? e.message : 'Oldingi ish saqlanmadi.'));
    pendingCorrection.current = undefined; setEgizakRaqam(null);
    ++saveGeneration.current; setIshSaqlandi(''); setServerHolat(''); serverDraft.current = undefined;
    setNatija(null); setKumRejim(false); setTkmQosh(new Map()); tarixniTozala(); setRejali([]); setOchirish([]); setIj(null); setDone(null); setXato(''); setRzBog(new Map()); operation.current = '';
  }

  /** `mavjudHujjatId` berilsa — fayl tizimdagi R2 hujjatidan olingan: yozishda QAYTA yuklanmaydi, o'sha hujjat manba bo'ladi. */
  async function faylTanla(file: File, mavjudHujjatId?: number) {
    oxirgiKalit.current = '';
    tozala(); setAktlar([]); setBusy(true); setHolat('Fayl o‘qilmoqda…');
    void faylShaHisobla(rawFile.current = file); sourceDoc.current = mavjudHujjatId; sourceOp.current = yangiOperationId();
    /* Fayl nomidan TAKLIF (operator o'zgartira oladi): F2 raqami; obyekt tanlanmagan bo'lsa — aniq bitta mos obyekt. */
    setRaqam(f2RaqamFayldan(file.name) ?? ''); setAlmashtirTasdiq(null);
    if (!objectId) { const oid = f2ObyektFayldan(file.name, objects); if (oid != null) { setObjectId(String(oid)); workspace.setObjectId(oid); } }
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Fayl 50 MB dan katta.');
      // Fayl o'qish va akt tahlili FONDA (Web Worker) — katta faylda sahifa qotmaydi.
      const a = await f2AktlarniOqiFonda(file.name, file);
      if (!a.length) throw new Error('Faylda F2 akt varag‘i topilmadi (ishlar ro‘yxati bor LRV shaklidagi varaq kerak).');
      setAktlar(a); setAktIdx(0); setDavr(a[0].davr ?? (urlDavr() || f2OyFayldan(file.name) || ''));
      setHolat(a[0].davr || urlDavr() ? 'Akt o‘qildi. Mos qatorlarni bog‘lash tugmasini bosing yoki qo‘lda bog‘lang.' : 'Akt o‘qildi. Hisobot davrini tanlang.');
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
  async function malumotYukla(oid: number, oy: string, joriymi = () => true, o?: Olchov) {
    const q = <T,>(k: string, p: Promise<T>) => (o ? o.qadam(k, p) : p);
    const [d, nak, xot, aktRoyxat] = await Promise.all([
      q('smeta', sbT2DaraxtOl(oid, F2_SMETA_USTUNLAR)),
      // Faqat faol qatorlar (F2/fakt harakati bor) — qolganlari smetadan to'ldiriladi (nakQoldiqXaritalari), natija bir xil.
      q('nakopitelniy', t2NakopitelniyToliq(oid, oy + '-01', true).catch(() => null)),
      q('xotira', sbOqi<AktQatorBand>({
        jadval: 't2_akt_qator', filtr: `obyekt_id=eq.${oid}`, ustunlar: 'akt_id,qator_id,hajm,certified_quantity,raw_snapshot', limit: 50000,
      }).catch(nullga)),
      q('aktlar', sbOqi<AktQisqa>({
        jadval: 't2_akt', filtr: `obyekt_id=eq.${oid}&tur=eq.f2`, ustunlar: 'id,raqam,oy,holat,tur,hujjat_jami,manba', limit: 5000,
      }).catch(() => null)),
    ]);
    if (!d.ok) throw new Error('Smeta o‘qilmadi.');
    const r = (d.qatorlar || []) as T2Qator[];
    // Smetasi yo'q obyekt ham ochiladi (egasi 2026-10-20): F2 ishlari «Smetadan tashqari ishlar» ga qo'shimcha bo'lib yoziladi.
    let old = new Map(), qol = new Map(), alm = new Map();
    if (!joriymi()) return { r, qol, x: new Map<string, number>() };
    if (nak && nak.ok) {
      // Tasdiqlangan F2 — davrgacha VA shu davrdagi (bir oyda bir necha F2 bo'lishi mumkin): jami_hajm.
      ({ old, qol, alm } = nakQoldiqXaritalari(nak.qatorlar, r));
      setOgoh('');
    } else setOgoh('Nakopitelniy o‘qilmadi — qoldiq ko‘rsatilmaydi, hajm nazorati faqat smeta hajmi bo‘yicha.');
    const x = new Map<string, number>();
    if (xot && xot.ok) for (const q of xot.qatorlar || []) {
      const s = q.raw_snapshot;
      if (s?.manba === 'f2_v3') for (const m of s.qatorlar ?? []) if (m.imzo) x.set(m.imzo, q.qator_id);
    }
    // Aktual smeta: o'tgan F2 imzolari eski (almashtirilgan) qatorga ishora qilsa — voris zanjiri bo'yicha faol qatorga (lib/f2-moslash-v3/aktual).
    {
      const faolIds = new Set(r.map((q) => q.id));
      if ([...x.values()].some((id) => !faolIds.has(id))) {
        const v = await aktualVorisOl(oid, r.map((q) => ({ id: q.id, otaId: q.ota_id ?? null, kod: q.kod ?? null, nom: q.nom ?? null, birlik: q.birlik ?? null, faol: true }))).catch(() => new Map());
        const ak = xotiraniAktualla(x, faolIds, v);
        x.clear(); for (const [k, id] of ak.xotira) x.set(k, id);
      }
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
    setObyektAktlari(aktRoyxat && aktRoyxat.ok ? (aktRoyxat.qatorlar ?? []).map((a) => ({ id: a.id, raqam: a.raqam, oy: a.oy, holat: a.holat, hujjat_jami: a.hujjat_jami == null ? null : Number(a.hujjat_jami), manba: a.manba ?? null })) : []);
    setRows(r); setOldingi(old); setAlmashtirilgan(alm); setQoldiq(qol); setXotira(x);
    return { r, qol, x };
  }

  async function moslash(a: F2Akt, r: T2Qator[], qol: Map<number, number>, x: Map<string, number>, rb: Map<string, number>, avvalgi?: IshJoyi | null) {
    setHolat('Moslashtirilmoqda (fonda)…');
    // Moslashtirish FONDA (Web Worker) — 30 ming qatorli smetada ham sahifa javob beradi.
    const ishBog = new Map([...avvalgi?.bog ?? []].filter(([, b]) => b.holat !== 'taklif').map(([uid, b]) => [uid, b.qatorId]));
    const n = await f2MoslashV3Fonda(dvigatelDaraxti(a.daraxt), smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb, ishBog });
    // Podval qo'lda qatorlari dvigatelga berilmaydi; smetada nom o'xshash + summa aynan qator bo'lsa ◐ taklif.
    // Hisoblash paytida operator qaror qabul qilgan bo'lishi mumkin (avto-moslash fonda ketadi) — oxirgi holat saqlanadi, qarorlar yo'qolmaydi.
    setNatija(n); ijOzgar(podvalTaklifQosh(boshlangich(n, ijRef.current ?? avvalgi ?? undefined), f2Indeks(a.daraxt).qatorlar, r));
    const { aniq, xotira: xt, taklif, topilmadi } = n.stat;
    setHolat(`Moslashtirildi: ✓ ${aniq + xt} · ◐ ${taklif} · ✕ ${topilmadi}. ◐ larni tasdiqlang, ✕ larni torting.`);
  }

  /** Avto-moslashdan keyin ishlarning resurslari ham bir marta (jim) bog'lanadi — `ij` yangilangach. */
  const [avtoMoslandi, setAvtoMoslandi] = useState(false);
  const [avtoTick, setAvtoTick] = useState(0);
  useEffect(() => {
    if (!avtoTick || !ijRef.current || !ind) return;
    ishResurslariniBogla(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avtoTick]);
  // Fayl tanlanganda smeta/xotira o'qiladi va ishonchli moslar avtomatik bog'lanadi (yozish — faqat operator «Yozish» bosganda).
  const kalit = objectId && akt && /^\d{4}-(0[1-9]|1[0-2])$/.test(davr) ? `${objectId}|${aktIdx}|${davr}|${akt.fayl}` : '';
  const oxirgiKalit = useRef('');
  useEffect(() => {
    if (!kalit || !akt || kalit === oxirgiKalit.current) return;
    oxirgiKalit.current = kalit;
    let active = true;
    tozala(); setBusy(true); setHolat('Smeta, Nakopitelniy va xotira o‘qilmoqda…');
    void (async () => {
      try {
        const { r, qol, x } = await malumotYukla(Number(objectId), davr, () => active);
        if (!active) return;
        // Tizim chiqargan Ф-2 (yashirin КАЛИТ ustuni): qatorlar aniq bog'lanadi; kalitsiz/tahrirlangan qatorlar oddiy moslashda qoladi.
        const qatorlarF2 = f2Indeks(akt.daraxt).qatorlar;
        const kalitBog = await fayldanKalitBog(rawFile.current, akt.varaq, qatorlarF2, r);
        if (!active) return;
        setNatija({ natijalar: new Map(), rzDiag: [], stat: { aniq: kalitBog.size, xotira: 0, taklif: 0, topilmadi: qatorlarF2.length - kalitBog.size } });
        tarixniTozala(); setIj({ bog: kalitBog, otkaz: new Set() });
        operation.current = yangiOperationId();
        /* Avto-moslash (egasi 2026-11-12): ishonchli moslar (✓ aniq / xotira) o'zi bog'lanadi; ◐ va ✕ — «Tekshiring» ro'yxatida.
         * Hech narsa yozilmaydi (yozish — faqat oxirgi «Yozish» bosilganda); har bog'lanishni uzish/qaytarish mumkin (Avto bog'lanishlarni uzish, Orqaga). */
        try {
          await moslash(akt, r, qol, x, new Map(), { bog: kalitBog, otkaz: new Set() });
          if (active) { setAvtoMoslandi(true); setAvtoTick((n) => n + 1); }
        } catch (e) {
          if (active) { setHolat('F2 va smeta tayyor. Mos qatorlarni bog‘lash tugmasini bosing yoki qo‘lda bog‘lang.'); setXato(e instanceof Error ? e.message : 'Avto-moslash bajarilmadi.'); }
        }
      } catch (e) { if (active) setXato(e instanceof Error ? e.message : 'Smeta yuklanmadi.'); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kalit, akt]);

  async function aniqBogla() {
    if (!akt || !ij || busy || done) return;
    setBusy(true); setXato('');
    try {
      await moslash(akt, rows, qoldiq, xotira, rzBog, ijRef.current);
      // Ish va uning resurslari bitta guruh: bog'langan ishlarning resurslari ham shu bosishda bog'lanadi.
      ishResurslariniBogla(true);
    }
    catch (e) { setXato(e instanceof Error ? e.message : 'Moslashtirish bajarilmadi.'); }
    finally { setBusy(false); }
  }

  /** Bog'langan barcha F2 ishlarining bog'lanmagan resurslari — o'z smeta ishi ichidan (✓ yoki ◐ taklif). */
  function ishResurslariniBogla(jim = false) {
    const cur = ijRef.current;
    if (!cur || !ind) return;
    const r = ishlarResurslariniBogla(cur, ind, S);
    if (r.ij !== cur) ijOzgar(r.ij);
    if (!jim || r.boglandi || r.taklif) {
      setHolat(`${t('Ish resurslari')}: ✓ ${r.boglandi} ${t('bog‘landi')}, ◐ ${r.taklif} ${t('taklif (tasdiqlang)')}, ✕ ${r.qoldi} ${t('smeta ishida mos resurs yo‘q (qo‘shimcha/zamena)')}`);
    }
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

  // Hisoblagich ISH darajasida (ish + resurslari bitta guruh): ◐ — tasdiq kutayotgan ishlar soni.
  const taklifSoni = useMemo(() => (ij && ind ? guruhHisobla(ind, ij).taklif : 0), [ij, ind]);
  const avtoSoni = useMemo(() => { let n = 0; if (ij) for (const b of ij.bog.values()) if (avtoBogmi(b)) n++; return n; }, [ij]);
  /** Kumulyativ reja: faqat hujjatda «ранее» > 0 bo'lsa hisoblanadi; rejim yoqilmaguncha yozishga TA'SIR QILMAYDI. */
  const kumReja = useMemo(() => (akt && ind && ij && kumulyativmi(akt.jami)
    ? kumulyativReja({ ind, ij, oldingi, band, narx: (id) => raw.get(id)?.narx ?? null, jami: akt.jami })
    : null), [akt, ind, ij, oldingi, band, raw]);
  /** Oldingi oylar yozilgan (tasdiqlangan/qoralama aktlarda hajm bor) — kumulyativ varaqda ayirish avtomatik TAVSIYA qilinadi. */
  const oldingiYozilgan = oldingi.size > 0 || band.size > 0;
  const indYoz = useMemo(() => (ind && kumReja && kumRejim ? kumulyativQolla(ind, kumReja) : ind), [ind, kumReja, kumRejim]);
  const yozish = useMemo(() => (indYoz && ij ? f2QoralamaYozish(indYoz, ij, S) : null), [indYoz, ij, S]);
  /** Yozishdan oldingi moslash hisoboti: har manba qatori — yo'li, smeta qatori, ishonch, sabab (shubhali/xato jim o'tmaydi). */
  const hisobot = useMemo(() => (ind && ij ? moslashHisoboti({ ind, ij, S, natija }) : null), [ind, ij, S, natija]);
  const payload = useMemo(() => {
    if (!yozish || yozish.toxtatish.length) return null;
    try {
      // Qo'shilgan ТН·КМ qatorlari: smetadagi т·км qatoriga bog'langan F2 qatori (hajm = taklif, narx = smeta narxi).
      const qosh = [...tkmQosh].flatMap(([qid, hajm]) => {
        const narx = raw.get(qid)?.narx;
        return hajm > 0 ? [{ uid: `tkm:${qid}`, hajm, narx: narx ?? undefined, summa: narx != null ? yaxlit2(hajm * narx) : undefined, tur: 'rs' as const, summaYozilgan: narx != null }] : [];
      });
      const mapping = new Map(yozish.mapping);
      for (const n of qosh) mapping.set(n.uid, Number(n.uid.slice(4)));
      const hammasi = [...yozish.nodes, ...qosh];
      return { rows: exactWrite(hammasi, mapping), izohlar: exactWriteIzohlar(hammasi, mapping), error: '' };
    }
    catch (e) { return { rows: [], izohlar: [] as string[], error: e instanceof Error ? e.message : 'Tekshiruv kerak.' }; }
  }, [yozish, tkmQosh, raw]);
  // FAKT rejimi: mavjud fakt (eski qatordagisi ham, faol vorisga yig'ilgan) — rejim yoqilganda o'qiladi.
  useEffect(() => {
    if (!faktRejim || !objectId) { setFaktMavjud(null); return; }
    let jonli = true;
    setFaktXato('');
    void (async () => {
      try {
        const yoz = await faktYozuvlariOl(Number(objectId));
        const faolIds = new Set(rows.map((r) => r.id));
        const v = yoz.some((y) => !faolIds.has(y.qatorId))
          ? await aktualVorisOl(Number(objectId), rows.map((q) => ({ id: q.id, otaId: q.ota_id ?? null, kod: q.kod ?? null, nom: q.nom ?? null, birlik: q.birlik ?? null, faol: true })))
          : new Map();
        const y = faktMavjudYigish(yoz, faolIds, v);
        if (jonli) setFaktMavjud({ map: y.mavjud, yetim: y.yetim });
      } catch (e) { if (jonli) setFaktXato(e instanceof Error ? e.message : t('Mavjud fakt o‘qilmadi.')); }
    })();
    return () => { jonli = false; };
  }, [faktRejim, objectId, rows, done]);
  /** delta = fayl hajmi − tizimdagi fakt; faqat musbat deltalar yoziladi (resurs qatorlari ish normasidan ergashadi). */
  const faktReja = useMemo<FaktReja | null>(() => {
    if (!faktRejim || !faktMavjud || !payload || payload.error) return null;
    const bogOf = new Map([...(ij?.bog ?? [])].map(([, b]) => [b.qatorId, b]));
    return faktDeltaReja(payload.rows.map((x) => {
      const q = raw.get(x.qatorId);
      const b = bogOf.get(x.qatorId);
      return { qatorId: x.qatorId, tur: q?.tur ?? null, kod: q?.kod ?? null, nom: q?.nom ?? null, birlik: q?.birlik ?? null, faylHajm: Number(x.certifiedQuantity ?? 0), smetaHajm: q?.hajm ?? null, ishonch: b?.holat ?? null, usul: b?.usul ?? null };
    }), faktMavjud.map);
  }, [faktRejim, faktMavjud, payload, raw, ij]);
  async function faktgaYoz() {
    if (!faktReja || !akt || busy || done || !faktReja.yoziladi.length) return;
    setBusy(true); setFaktXato('');
    try {
      const r = await sbFaktYoz({ obyektId: Number(objectId), sana: new Date().toISOString().slice(0, 10), operationId: yangiOperationId(),
        qatorlar: faktReja.yoziladi.map((x) => ({ qator_id: x.qatorId, hajm: x.delta })), izoh: `F2/LRV fayldan fakt: ${akt.fayl} / ${akt.varaq} / ${davr} (delta)` });
      if (!r.ok) { setFaktXato(`${r.xabar || r.error || t('Fakt yozilmadi.')}`); return; }
      setDone(`${t('Fakt yozildi')} (akt #${r.akt_id ?? '?'}, ${faktReja.yoziladi.length} ${t('qator')}). ${faktReja.bor.length} ${t('tasi tizimda bor — yozilmadi.')}`);
    } catch (e) { setFaktXato(e instanceof Error ? e.message : t('Fakt yozilmadi.')); }
    finally { setBusy(false); }
  }
  /** Qoldiqdan oshgan qatorlar — FAQAT KO'RSATISH (egasi 2026-10-23: loyiha hajmlari xato bo'lishi normal, blok yo'q).
   *  smeta − tasdiqlangan − boshqa qoralamalar − shu F2. Qo'shimcha/zamena qatorlari ko'rsatilmaydi. */
  const oshishlar = useMemo(() => {
    if (!payload || payload.error) return [];
    const smetaH = new Map<number, number | null>(rowsK.map((r) => [r.id, r.hajm ?? null]));
    const ozgarish = new Set(rowsK.filter((r) => (r as { qoshimcha?: boolean }).qoshimcha || (r as { zamena?: boolean }).zamena).map((r) => r.id));
    return qoldiqOshishlari(payload.rows.map((r) => ({ qatorId: r.qatorId, hajm: r.certifiedQuantity })), smetaH, oldingi, band, ozgarish);
  }, [payload, rowsK, oldingi, band]);
  /** Ish ↔ material hajm muvofiqligi (egasi 2026-11-11; lib/ish-material-moslik): F2 ga kiradigan ish hajmi shu F2 dagi materiallar hajmiga mosmi.
   *  FAQAT KO'RSATISH (hajm bloklanmaydi); F2 hujjat manbasi o'zgarmaydi — taklif qiymati nusxalanadi, tuzatish manbada/fakt jurnalida. */
  const moslikTuz = useMemo(() => moslikTuzilma(rowsK), [rowsK]);
  const moslikOgoh = useMemo(() => {
    if (!payload || payload.error) return [] as MoslikNatija[];
    const h = new Map<number, number>();
    for (const r of payload.rows) if (r.certifiedQuantity != null && Number.isFinite(r.certifiedQuantity)) h.set(r.qatorId, (h.get(r.qatorId) ?? 0) + r.certifiedQuantity);
    return moslikHisobla(moslikTuz, h);
  }, [payload, moslikTuz]);
  const moslikNusxa = (n: MoslikNatija) => {
    const v = String(n.taklif).replace('.', ',');
    const yoz = navigator.clipboard?.writeText(v);
    if (!yoz) { toast(t('Taklifni nusxalash bajarilmadi.'), 'warn'); return; }
    void yoz.then(() => toast(t('Taklif nusxalandi: {v}. F2 manbasida ish hajmini shu qiymatga tuzating.', { v }), 'ok'), () => toast(t('Taklifni nusxalash bajarilmadi.'), 'warn'));
  };
  /** DUBLIKAT HIMOYASI (egasi 2026-10-25): yozishdan oldin tekshiruv. Blok — faqat aniq takror (shu fayl varag‘i allaqachon yozilgan,
   *  shu obyektda shu raqam bor); summa / pereraschet — ogohlantirish. */
  const dublikatlar = useMemo(() => {
    if (!akt || !payload || payload.error || !objectId || done) return [];
    const jami = payload.rows.some((r) => r.certifiedAmount != null) ? payload.rows.reduce((s, r) => s + (r.certifiedAmount ?? 0), 0) : null;
    return dublikatTekshiruv({ aktlar: obyektAktlari, oy: davr, raqam: raqamN, jami, ozAktId: mavjudQoralama?.id ?? maqsadAkt?.id ?? null,
      manbaAktIdlar: avvalgiImport.map((k) => k.aktId), pereraschet: pereraschetBelgisi(rows, payload.rows.map((r) => r.qatorId)) });
  }, [akt, payload, objectId, done, obyektAktlari, davr, raqamN, mavjudQoralama?.id, maqsadAkt?.id, avvalgiImport, rows]);
  const egizakMasala = egizakRaqamMasalasi(!!egizakRaqam, egizakRaqam?.a, raqam);
  const dublikatMasalalar = useMemo(() => (egizakMasala ? [egizakMasala, ...dublikatlar] : dublikatlar), [egizakMasala, dublikatlar]);
  const dublikatBlok = bloklarmi(dublikatMasalalar);
  /** Ustamali summa uchun kategoriya kesimlari (egasi 2026-10-24): kat — bog'langan smeta qatoridan (t2_qator.kat);
   *  bog'lanmagan/kat'siz qator «kat noma'lum» bo'lib qoladi (taxminiy deb ko'rsatiladi, o'ylab topilmaydi). */
  const yozishKesimi = useMemo(() => (payload && !payload.error
    ? katKesimYigish(payload.rows, (r) => raw.get(r.qatorId)?.kat, (r) => r.certifiedAmount ?? null) : null), [payload, raw]);
  /** Tasdiq oynalaridagi summalar uchun ustama (SummaJuft bilan bir manba). */
  const ustama = useUstamaliSumma(objectId ? Number(objectId) : null, { kompaniyaId: companyId });
  const qatorlarKesimi = useMemo(() => {
    if (!ind || !ij) return null;
    return katKesimYigish(ind.qatorlar.filter((q) => q.barg), (q) => {
      const b = ij.bog.get(q.uid);
      return b && !ij.otkaz.has(q.uid) ? raw.get(b.qatorId)?.kat : null;
    }, (q) => q.summa);
  }, [ind, ij, raw]);

  /** ТН·КМ qatorlari: taklif (blok emas) — A = shu F2 dagi tonnali mos material Σ tonna × km; B = F2/smeta ulushi × smeta т·км. */
  const tkmQatorlar = useMemo(() => {
    if (!ind) return [];
    const boshqa = (uid: string) => ind.qatorlar.filter((x) => x.uid !== uid && !tkmBirlikmi(x.birlik)).map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: x.hajm }));
    const smetaM = rowsK.filter((r) => (r.tur === 'bl' || r.tur === 'rs') && r.hajm != null && !tkmBirlikmi(r.birlik)).map((r) => ({ nom: r.nom ?? '', birlik: r.birlik, hajm: Number(r.hajm) }));
    return ind.qatorlar.filter((x) => tkmBirlikmi(x.birlik)).flatMap((x) => {
      const bog = ij?.bog.get(x.uid);
      const tkmHajm = bog ? Number(raw.get(bog.qatorId)?.hajm ?? NaN) : NaN;
      const tk = tkmTaklif({ nom: x.nom }, boshqa(x.uid), { materiallar: smetaM, tkmHajm: Number.isFinite(tkmHajm) ? tkmHajm : null });
      return tk ? [{ uid: x.uid, nom: x.nom, hajm: x.hajm, tk }] : [];
    });
  }, [ind, ij, rowsK, raw]);

  useEffect(() => {
    if (!companyId || !objectId || !akt) { setDavomRoyxat([]); return; }
    let faol = true;
    void f2DavomRoyxatOl(companyId, Number(objectId)).then((r) => { if (faol) setDavomRoyxat(r.ok ? r.qatorlar : []); }).catch(() => { if (faol) setDavomRoyxat([]); });
    return () => { faol = false; };
  }, [companyId, objectId, akt, done]);
  /** Kechroq oyni yozmoqchi bo'lganda shu obyektda eskiroq yozilmagan qoralama bor — bitta banner (blok emas). */
  const eskiQoralama = useMemo(
    () => (objectId && /^\d{4}-\d{2}$/.test(davr) ? eskiYozilmagan(davomRoyxat, Number(objectId), davr, serverDraft.current?.jobId ?? null) : null),
    [davomRoyxat, objectId, davr],
  );

  /** Faylda transport qatori YO'Q, smetada ТН·КМ qatori bor: F2 qatori sifatida qo'shishni taklif (qo'shimcha ish EMAS, blok yo'q). */
  const tkmQoshTaklif = useMemo(() => {
    if (!ind || ind.qatorlar.some((x) => tkmBirlikmi(x.birlik))) return [];
    const f2 = ind.qatorlar.map((x) => ({ nom: x.nom, birlik: x.birlik, hajm: x.hajm }));
    const smetaM = rowsK.filter((r) => (r.tur === 'bl' || r.tur === 'rs') && r.hajm != null && !tkmBirlikmi(r.birlik)).map((r) => ({ nom: r.nom ?? '', birlik: r.birlik, hajm: Number(r.hajm) }));
    return rowsK.filter((r) => (r.tur === 'rs' || r.tur === 'bl') && r.id > 0 && tkmBirlikmi(r.birlik) && r.hajm != null).flatMap((r) => {
      const tk = tkmTaklif({ nom: r.nom ?? '' }, f2, { materiallar: smetaM, tkmHajm: Number(r.hajm) });
      return tk ? [{ qatorId: r.id, nom: r.nom ?? '', tk }] : [];
    });
  }, [ind, rowsK]);

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

  async function serverdanTikla(jobId?: number, tahrirAktId?: number): Promise<boolean | undefined> {
    const id = jobId ?? Number(serverId);
    if (!Number.isSafeInteger(id) || id <= 0 || busy || ij) return undefined;
    setBusy(true); setXato('');
    const o = olchov('F2 ochish');
    try {
      const d = await o.qadam('qoralama', f2ServerOl(id));
      setServerId(String(id));
      if (!objects.some((o) => o.id === d.objectId)) throw new Error('Qoralama tanlangan kompaniya obyektiga tegishli emas.');
      const c = d.cursor;
      const docId = Number(c.sourceDocumentId), idx = Number(c.actIdx), month = String(c.month ?? '');
      if (!Number.isSafeInteger(docId) || docId <= 0 || !Number.isSafeInteger(idx) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Qoralama manbasi yoki davri noaniq.');
      // Unumdorlik (prod profil 2026-10-24): smeta/Nakopitelniy/xotira yuklash fayl yuklash va o'qish bilan PARALLEL boshlanadi.
      const malumotP = o.qadam('malumot', malumotYukla(d.objectId, month, undefined, o));
      void malumotP.catch(() => undefined);
      const bytes = await o.qadam('fayl', faylBaytlari(docId));
      const file = new File([bytes.slice()], String(c.file), { type: XLSX_MIME });
      const acts = await o.qadam('fayl_oqish', f2AktlarniOqiFonda(file.name, file));
      const a = acts[idx];
      if (!a) throw new Error('Qoralamadagi akt varag‘i manba faylida topilmadi.');
      // Versiyaga chidamli tiklash: parser yaxshilanganda saqlangan qoralamalar buzilmaydi. Har qator uid bo'yicha alohida
      // baholanadi: mos — bog'lanish tiklanadi; yangi parse da paydo bo'lgan — bog'lanmagan holda qo'shiladi;
      // topilmagan/qiymati boshqa — faqat o'sha qatorlar «qayta tekshiring» ga tushadi.
      const indA = f2Indeks(a.daraxt);
      const mosla = f2ManbaMosla(d.sourceRows, indA);
      if (!mosla.mos && d.sourceRows.length) throw new Error('Manba fayli saqlangan qoralamaga umuman mos emas (birorta qator mos kelmadi). Bog‘lanishlar taxmin bilan tiklanmaydi.');
      const { r, qol, x } = await malumotP;
      o.belgi('malumot_tayyor');
      const rb = new Map(c.rzBog as Array<[string, number]>);
      const result = await o.qadam('moslash', f2MoslashV3Fonda(dvigatelDaraxti(a.daraxt), smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: rb }));
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
      // Oldingi «F2 ni yozish» urinishida smetaga allaqachon yozilgan rejali buyruqlar — haqiqiy qatorga o'tkaziladi (dublikat yo'q).
      o.belgi('tiklash_oldi');
      const tz = await o.qadam('rejali', rejaliniTozala(d.objectId, serverRejali(c), restored));
      setRejali(tz.rejali); setOchirish(serverOchirish(c));
      const tiklangan = podvalTaklifQosh(f2BuzilganniBoshat(tz.ij, mosla.buzilgan), indA.qatorlar, r);
      tarixniTozala(); setIj(tiklangan); setDone(null); setTahrirAkt(tahrirAktId ?? null);
      o.belgi('holat_yozildi');
      // Birinchi chizishdan keyin (ish oynasi ko'rinadigan payt) umumiy vaqt.
      requestAnimationFrame(() => setTimeout(() => o.yoz(), 0));
      setServerHolat(`Serverdagi F2 ish qoralamasi #${id} tiklandi. Hal qilinmagan qatorlar ham saqlangan.`
        + (tz.soni ? ` ${tz.soni} ${t('ta qo‘shimcha qator smetada allaqachon yozilgan — qayta yaratilmaydi')}.` : '')
        + (mosla.yangi.length ? ` ${t('Fayl yangi usulda o‘qildi')}: +${mosla.yangi.length} ${t('qator')}.` : '')
        + (mosla.buzilgan.size ? ` ${mosla.buzilgan.size} ${t('qator qayta tekshirilsin (fayldagi qiymati o‘zgargan yoki topilmadi)')}.` : ''));
      return true;
    } catch (e) { setXato(e instanceof Error ? e.message : 'Server qoralamasi tiklanmadi.'); return false; }
    finally { setBusy(false); }
  }

  /**
   * «✎ Tahrirlash», ish qoralamasi (job) yo'q yoki tiklanmasa: yozilgan akt qatorlaridan tiklash.
   * Manba hujjat (rawSnapshot.hujjat_id) qayta o'qiladi; bog'lanishlar t2_akt_qator (qator_id <- manba uid) dan olinadi.
   * Fayldagi qiymati o'zgargan / topilmagan / smetada yo'q qatorlar BOG'LANMAGAN (✕) qoladi - hech narsa taxmin qilinmaydi.
   */
  async function aktdanTikla(aktId: number, obyektId: number): Promise<boolean> {
    if (busy || ij) return false;
    setBusy(true); setXato('');
    try {
      const [qs, ak] = await Promise.all([
        sbOqi<AktQatorBand>({ jadval: 't2_akt_qator', filtr: `akt_id=eq.${aktId}&obyekt_id=eq.${obyektId}`, ustunlar: 'akt_id,qator_id,hajm,certified_quantity,raw_snapshot', limit: 50000 }),
        sbOqi<AktQisqa & { versiya: number | null; lifecycle_status: string | null }>({ jadval: 't2_akt', filtr: `id=eq.${aktId}&obyekt_id=eq.${obyektId}`, ustunlar: 'id,raqam,oy,holat,tur,versiya,lifecycle_status', limit: 1 }),
      ]);
      const aktQ = ak.ok ? ak.qatorlar?.[0] : null;
      if (!qs.ok || !aktQ || !aktQ.oy) throw new Error('Akt o‘qilmadi.');
      const snaps = (qs.qatorlar ?? []).filter((q) => q.raw_snapshot?.manba === 'f2_v3');
      const s0 = snaps[0]?.raw_snapshot as (AktQatorBand['raw_snapshot'] & { hujjat_id?: number }) | undefined;
      const docId = Number(s0?.hujjat_id);
      if (!snaps.length) {
        // Manba hujjati yo'q: tizimda (F2 tayyorlash) yasalgan. Faylni YANGI hujjat sifatida shu qoralamaga yuklash rejimi.
        if (aktQ.holat !== 'qoralama' || (aktQ.lifecycle_status ?? 'draft') !== 'draft') throw new Error(t('Tasdiqlangan yoki yuborilgan F2 ni fayl bilan yangilab bo‘lmaydi (tuzatuvchi akt alohida yaratiladi).'));
        tozala(); setAktlar([]); setObjectId(String(obyektId)); workspace.setObjectId(obyektId);
        setMaqsadAkt({ id: aktId, raqam: aktQ.raqam, oy: String(aktQ.oy).slice(0, 7), obyektId }); setTahrirAkt(aktId); setRaqam(aktQ.raqam ?? ''); setAlmashtirTasdiq(null);
        setHolat(t('Yangi F2 faylini tanlang - u shu qoralamaga yuklanadi.'));
        return true;
      }
      if (!s0 || !Number.isSafeInteger(docId) || docId <= 0 || !s0.fayl || !s0.varaq) throw new Error('Bu aktning manba hujjati yozilmagan (import orqali yaratilmagan) - uni faylni qayta import qilib almashtiring.');
      const month = String(aktQ.oy).slice(0, 7);
      const malumotP = malumotYukla(obyektId, month);
      void malumotP.catch(() => undefined);
      const bytes = await faylBaytlari(docId);
      const file = new File([bytes.slice()], String(s0.fayl), { type: XLSX_MIME });
      const acts = await f2AktlarniOqiFonda(file.name, file);
      const idx = acts.findIndex((a) => a.varaq === s0.varaq);
      if (idx < 0) throw new Error('Aktning varag‘i manba faylida topilmadi.');
      const a = acts[idx];
      const indA = f2Indeks(a.daraxt);
      const { r, qol, x } = await malumotP;
      const result = await f2MoslashV3Fonda(dvigatelDaraxti(a.daraxt), smetaQatorlari(r), { qoldiq: qol, xotira: x, rzBog: new Map() });
      const mavjud = new Set(r.map((q) => q.id));
      const yozilgan: Array<{ uid: string; hajm?: unknown; narx?: unknown; summa?: unknown }> = [];
      const bogYozuv: Array<{ uid: string; qatorId: number; taqsimHajm?: unknown }> = [];
      for (const q of snaps) for (const m of (q.raw_snapshot?.qatorlar ?? []) as Array<{ uid: string; hajm?: unknown; narx?: unknown; summa?: unknown; taqsimHajm?: unknown }>) {
        if (!m?.uid) continue;
        yozilgan.push(m);
        if (indA.byUid.has(m.uid) && mavjud.has(q.qator_id)) bogYozuv.push({ uid: m.uid, qatorId: q.qator_id, taqsimHajm: m.taqsimHajm });
      }
      const bog = snapshotdanBog(bogYozuv);
      const mosla = f2ManbaMosla(yozilgan, indA);
      const tiklangan = podvalTaklifQosh(f2BuzilganniBoshat({ bog, otkaz: new Set() }, mosla.buzilgan), indA.qatorlar, r);
      tozala();
      oxirgiKalit.current = `${obyektId}|${idx}|${month}|${a.fayl}`;
      void faylShaHisobla(rawFile.current = file); sourceDoc.current = docId; sourceOp.current = yangiOperationId(); operation.current = '';
      setObjectId(String(obyektId)); workspace.setObjectId(obyektId);
      setAktlar(acts); setAktIdx(idx); setDavr(month); setRzBog(new Map()); setNatija(result);
      setRaqam(aktQ.raqam ?? ''); setAlmashtirTasdiq(null);
      setIj(tiklangan); setTahrirAkt(aktId);
      setServerHolat(t('Akt qatorlaridan tiklandi: {mos} qator bog‘langan, {yangi} qator bog‘lanmagan yoki fayldan farq qiladi - tekshiring.', { mos: tiklangan.bog.size, yangi: Math.max(0, indA.qatorlar.length - tiklangan.bog.size) }));
      return true;
    } catch (e) { setXato(e instanceof Error ? e.message : 'Aktdan tiklanmadi.'); return false; }
    finally { setBusy(false); }
  }

  /** Tahrirlash: avval server ish qoralamasi, bo'lmasa / tiklanmasa - akt qatorlaridan. */
  async function tahrirlash(jobId: number | null, aktId: number, obyektId: number) {
    if (jobId != null && (await serverdanTikla(jobId, aktId)) !== false) return;
    await aktdanTikla(aktId, obyektId);
  }

  /** Modal tasdiqlagan qo'shimcha/zamena/resurs — DARHOL qoralamaga (serverga emas). F2 qatori vaqtinchalik qatorga bog'lanadi. */
  function onRejali(f: F2Tugun, b: ModalRejali) {
    if (!ijRef.current) return;
    // Boshqa joyga bog'langan bola qatorlar o'z bog'lanishini saqlaydi (egasi 2026-10-25) — rejaliBuyruqQosh himoyasi.
    const { buyruq, ij: joriy } = rejaliBuyruqQosh(rejaliRef.current, ijRef.current, f, b, (id) => raw.get(id)?.ota_id);
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
      const bolimlar = new Map<string, number>();
    for (const r of rowsK) if (r.tur === 'rz') bolimlar.set(`${r.ota_id ?? 0}|${nomK(r.nom)}`, r.id);
    const oxirgiBolim = new Map();
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
            onRejali(r, { kind: 'resource', tur: resursTuri(r.birlik, r.tur), otaQatorId: bogl.qatorId, nom: r.nom, birlik: r.birlik || 'шт', hajm: rh, kod: r.kod ?? undefined,
              sabab: t('F2 import: qo‘shimcha resurs (to‘liq o‘tkazish)'), resurslar: [], operationId: yangiOperationId() });
            qoshildi++;
          }
          continue;
        }
        const hajm = Number(f.hajm);
        if (!(hajm > 0)) { otkazildi.push(f.nom.slice(0, 40)); continue; }
        // Boshqa joyga bog'langan/o'tkazilgan resurslar o'z qarorini saqlaydi — yangi ishga faqat bog'lanmaganlar.
        const resIdx = ishmi ? otadiganResurslar(f, ij0).filter((r) => Number(r.hajm) > 0) : [];
        const resurslar = resIdx.map((r) => ({ tur: resursTuri(r.birlik, r.tur), nom: r.nom, birlik: r.birlik || 'шт', hajm: r.hajm, kod: r.kod, narx: r.narx }));
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
    const bog = new Map([...ijRef.current.bog].filter(([, v]) => !bogIdlari(v).some((id) => yashir.has(id))));
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
      const yangiId = tekshir(rr);
      await zamenaMiqdori(b, yangiId);
      return { qatorId: yangiId, resursIdlar: rr.resurs_qator_idlar ?? [], otaVersiya: (rr as { parent_version?: number | null }).parent_version ?? null };
    }
    const r = b.kind === 'replacement'
      ? await sbT2ZamenaIshYarat({ ...asos, almashtirilayotganQatorId: real.almashtirilayotganQatorId as number })
      : b.kind === 'additional' && b.tur === 'bl' ? await sbT2QoshimchaIshYarat(asos)
        : await sbT2ResursBolaQosh({ ...asos, tur: b.tur === 'bl' || b.tur === 'rz' ? 'rs' : b.tur, hajm: b.hajm });
    const yangiQ = tekshir(r);
    await zamenaMiqdori(b, yangiQ);
    return { qatorId: yangiQ, resursIdlar: [], otaVersiya: (r as { parent_version?: number | null }).parent_version ?? null };
  };
  /** Birlik farqli zamena: «aslning qancha hajmini almashtiradi» (ixtiyoriy) -- zamena yaratilgach yoziladi. */
  async function zamenaMiqdori(b: { kind: string; almashtirishHajm?: number | null }, qatorId: number) {
    if (b.kind !== 'replacement' || b.almashtirishHajm == null) return;
    const m = await sbT2ZamenaAlmashtirishBelgila({ kompaniyaId: companyId, qatorId, hajm: b.almashtirishHajm });
    if (!m.ok) throw new Error(m.xabar || m.error || t('Almashtirish hajmi saqlanmadi.'));
  }
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
  // Egizak obyektdan ko'chirilgan bog'lanishlar state ga tushgach — server ish qoralamasiga saqlanadi (F2 yozilmaydi).
  const [egizakSaqla, setEgizakSaqla] = useState(false);
  useEffect(() => {
    if (!egizakSaqla || busy || !ij) return;
    setEgizakSaqla(false);
    void servergaSaqla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [egizakSaqla, busy, ij]);
  // Rejali yozilgach state yangilanadi (haqiqiy id lar) — shundan keyin akt avtomatik saqlanadi.
  useEffect(() => {
    if (!davomEt || busy || rejali.length) return;
    setDavomEt(false);
    void saqla();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [davomEt, busy, rejali]);

  // Yagona klaviatura moduli (lib/hotkeys, «?» yordam): Ctrl+Z - oxirgi lokal amalni qaytarish, Ctrl+Enter - «F2 ni yozish».
  useHotkeys('f2-import', t('F2 import'), [
    { id: 'f2import.undo', keys: 'ctrl+z', nom: t('Oxirgi bog‘lash amalini qaytarish'), run: () => { if (!tarix.current.length) return false; orqaga(); } },
    { id: 'f2import.yoz', keys: 'ctrl+enter', nom: t('F2 ni yozish'), inInput: true,
      run: () => { if (busy || !payload || saqlashBlok || dublikatBlok || done || faktRejim) return false; void saqla(); } },
  ]);
   /** «F2 ni yozish»: ish davomidagi barcha qoralama amallari shu yerda, qadam-baqadam, ko'rinib turgan holda yoziladi. */
  async function saqla() {
    if (!akt || !ind || !yozish || !payload || busy || done) return;
    setJarayon((old) => old ?? BOSH_QADAMLAR());
    setXato(''); setAktZiddiyat(false);
    // 1. Tekshiruv
    qadam('tekshiruv', 'ishlayapti');
    if (payload.error) { qadam('tekshiruv', 'xato', payload.error); return; }
    if (dublikatBlok) { qadam('tekshiruv', 'xato', dublikatMasalalar.filter((m) => m.daraja === 'blok').map((m) => m.matn).join(' ')); return; }
    // Ogohlantirishlar (summa takrori, pereraschet) bloklamaydi — lekin operator ko‘rib, ongli tasdiqlaydi.
    const dublikatOgoh = dublikatlar.filter((m) => m.daraja === 'ogoh');
    if (dublikatOgoh.length && !(await tasdiqSora({ xavfli: true, sarlavha: t('Dublikat ogohlantirishi'), tasdiqMatni: t('Baribir yozish'), matn: `${dublikatOgoh.map((m) => m.matn).join('\n\n')}\n\n${t('Baribir yozasizmi?')}` }))) {
      qadam('tekshiruv', 'xato', t('Yozish bekor qilindi — dublikat ogohlantirishini tekshiring.')); return;
    }
    if (saqlashBlok) {
      qadam('tekshiruv', 'xato', takrorTekshirilmoqda ? t('Avvalgi F2 tekshirilmoqda — bir lahzadan so‘ng qayta urinib ko‘ring.')
        : almashtirishKutilmoqda ? t('Shu raqamdagi F2 qoralamasini almashtirish tasdiqlanmagan. Boshqa F2 bo‘lsa, uning raqamini kiriting.')
        : t('Bu obyekt va oy uchun tasdiqlangan F2 bor — yangi akt yozilmaydi. F2 tarixini oching.'));
      return;
    }
    // Bog'lanmagan qatorlar bilan yozish — ongli qaror (egasi sinovi 2026-10-24: 76 qator jim tushib qolardi; pul yo'qolmasin).
    if (yozish.qolgan.length) {
      const pul = yozish.qolgan.filter((n) => n.barg && n.summa != null).reduce((a, n) => a + Number(n.summa), 0);
      // Ustamali (asosiy) + ustamasiz: kat — taklif qilingan smeta qatoridan; bog'lanmagani kat noma'lum (≈).
      const kesim = katKesimYigish(yozish.qolgan.filter((n) => n.barg && n.summa != null), (n) => { const b = ij?.bog.get(n.uid); return b ? raw.get(b.qatorId)?.kat : null; }, (n) => Number(n.summa));
      const ok = await tasdiqSora({ xavfli: true, sarlavha: t('Bog‘lanmagan qatorlar bor'), tasdiqMatni: t('Baribir yozish'), matn: `${qolganSummaMatni(yozish.qolgan.length, pul, ustama.hisobla(kesim))} ${t('hali bog‘lanmagan — aktga KIRMAYDI. Baribir yozasizmi? (Keyin «✎ Tahrirlash» bilan qo‘shish mumkin.)')}` });
      if (!ok) { qadam('tekshiruv', 'xato', t('Yozish bekor qilindi — bog‘lanmagan qatorlarni hal qiling.')); return; }
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
      // Server qoralamasi — YORDAMCHI qadam: xato bo'lsa ham akt yoziladi (egasi 2026-10-24: TERMINAL_JOB / STALE_VERSION aktni to'xtatmasin).
      let serverOgoh = '';
      let serverXato = '';
      try { const s = await f2ServerSaqlaBardoshli(draft, docId, serverDraft.current); draft.server = s.state; serverOgoh = s.ogohlantirish ? t(s.ogohlantirish) : ''; }
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
          } catch (e2) { serverXato = serverXatoMatni(e2); }
        } else { serverXato = serverXatoMatni(e); }
      }
      serverDraft.current = draft.server; await ishniSaqla(draft);
      if (draft.server && !serverXato) {
        setServerId(String(draft.server.jobId));
        qadam('qoralama', 'tayyor', `#${draft.server.jobId}${serverOgoh ? ` · ${serverOgoh}` : ''}`);
      } else {
        // Yordamchi qadam bajarilmadi — akt baribir yoziladi; ish holati brauzerda saqlandi.
        qadam('qoralama', 'otkazildi', `${t('Server qoralamasi saqlanmadi')}: ${serverXato || t('noma‘lum xato')} — ${t('akt baribir yoziladi, ish holati brauzerda saqlandi')}`);
      }
      // 5. Akt
      qadam('akt', 'ishlayapti', mavjudQoralama ? `${t('Mavjud qoralama yangilanmoqda')} #${mavjudQoralama.id}` : undefined);
      const manba = new Map<number, Array<Record<string, unknown>>>();
      for (const n of yozish.nodes) {
        const id = yozish.mapping.get(n.uid)!;
        // Taqsim bo'lagi: snapshot asl F2 uid i bilan, bo'lak hajmi/summasi alohida (aktdan tiklashda taqsim qayta quriladi).
        const asl = yozish.aslUid.get(n.uid) ?? n.uid;
        const tg = ind.byUid.get(asl)!;
        const a = manba.get(id) ?? [];
        a.push({ uid: asl, imzo: yozish.imzolar.get(n.uid), kod: tg.kod, nom: tg.nom, birlik: tg.birlik, hajm: tg.hajm, narx: tg.narx, summa: tg.summa, bog: ij?.bog.get(asl)?.usul,
          ...(asl !== n.uid ? { taqsimHajm: n.hajm, taqsimSumma: n.summa ?? null } : {}) });
        manba.set(id, a);
      }
      const qatorlar = payload.rows.map((q) => ({
          ...q, rawSnapshot: { manba: 'f2_v3', hujjat_id: docId, fayl: akt.fayl, varaq: akt.varaq, fayl_sha256: faylSha || undefined, davr, qatorlar: manba.get(q.qatorId),
            import_job_id: draft.server?.jobId, partial: yozish.qolgan.length > 0,
            unresolved_count: yozish.qolgan.length },
        }));
      const r = mavjudQoralama
        // PR #294 shartnomasi: server har saqlashda versiyani oshiradi — keyingi saqlash qaytgan versiya bilan (eski serverda versiya qaytmaydi).
        ? await sbT2F2QoralamaYangila({ kompaniyaId: companyId, aktId: mavjudQoralama.id, kutilganVersiya: Math.max(qoralamaVersiya.current.get(mavjudQoralama.id) ?? 0, mavjudQoralama.versiya), operationId: yangiOperationId(), qatorlar })
        : await sbT2AktYaratV2({ obyektId: Number(objectId), oy: davr + '-01', operationId: operation.current, qatorlar, raqam: raqamN || undefined });
      if (!r.ok) {
        const code = (r as { code?: string }).code;
        if (code === 'F2_ACT_NUMBER_CONFLICT') {
          const m = t('Shu obyekt va oy uchun bu raqamdagi F2 allaqachon mavjud. Tasdiqlangan aktni qayta import bilan almashtirib bo‘lmaydi.');
          setAktZiddiyat(true); setXato(m); qadam('akt', 'xato', m);
        }
        else if (code === 'STALE_VERSION') { setTekshiruv((v) => v + 1); qadam('akt', 'xato', t('Qoralama boshqa oynada o‘zgargan — qayta yuklang.')); }
        else qadam('akt', 'xato', `${r.xabar || r.error || r.sabab || t('xato')}`);
        return;
      }
      { const v = (r as { versiya?: unknown }).versiya; if (mavjudQoralama && typeof v === 'number') qoralamaVersiya.current.set(mavjudQoralama.id, v); }
      // Hujjatning O'Z podvali (egasi 2026-11-03): foizlari isbotlangan bo'lsa t2_akt_podval ga yoziladi, aks holda smeta podvali qoladi.
      let podvalIzoh = '';
      if (akt.podval && r.akt_id) {
        if (!akt.podval.tekshiruv.toliq) podvalIzoh = ` ${t('Hujjat podvali isbotlanmadi (smeta podvali qoladi):')} ${akt.podval.tekshiruv.isbotsiz.map(podvalYorliq).join(', ') || t('ziddiyatli foizlar')}.`;
        else {
          const pr = await aktPodvalYoz({ kompaniyaId: companyId, aktId: Number(r.akt_id), manba: 'import', podval: akt.podval }).catch(() => null);
          podvalIzoh = pr?.ok ? ` ${t('Hujjat podvali saqlandi.')}` : ` ${t('Hujjat podvali saqlanmadi (smeta podvali qoladi).')}`;
        }
      }
      // Avto podval (server, 20261221810000): smeta podvali topilmasa qulf yo'q — faqat ogohlantirish.
      if (r.podval?.bor === false && r.podval.ogohlantirish) podvalIzoh += ` ${t('Diqqat: obyektning smeta podvali topilmadi, nakrutka foizlari shartnoma yoki standart stavka boʻyicha hisoblanadi.')}`;
      setTekshiruv((v) => v + 1);
      qadam('akt', 'tayyor', `#${r.akt_id ?? '?'}· ${payload.rows.length} ${t('qator')}`);
      setSessiyaKiritilgan((s) => new Set([...s, akt.varaq]));
      setDone(`F2 qoralamasi ${mavjudQoralama ? 'yangilandi' : 'saqlandi'} (akt #${r.akt_id ?? '?'}, ${payload.rows.length} qator). Tasdiqlangach Nakopitelniyga kiradi — F2 tarixi sahifasida.${podvalIzoh}`);
      if (yozish.qolgan.length) setServerHolat(`Diqqat: ${yozish.qolgan.length} ta bog‘lanmagan yoki tasdiqlanmagan qator aktga kiritilmadi. Ular manba faylida ${draft.server ? `va server ish qoralamasi #${draft.server.jobId} da ` : ''}saqlangan. Akt faqat tasdiqlangan bog‘lanishlardan tuzildi.`);
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
  /* Tekshiruv — yozishdan oldingi BARCHA ogohlantirish va to'siqlar bitta ro'yxatda (har qator: nima, qancha, qayerda). */
  type TekshiruvBand = { id: string; daraja: 'ok' | 'warn' | 'bad'; matn: string; amal?: { nom: string; run: () => void } };
  const sakra = (nom: string) => () => { document.querySelector(`[${'aria-label'}=${JSON.stringify(nom)}]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
  const tekshiruvBandlari: TekshiruvBand[] = [];
  if (akt && ij && !done) {
    if (payload?.error) tekshiruvBandlari.push({ id: 'payload', daraja: 'bad', matn: t('Yozish ma‘lumotida xato bor — xabar pastda'), amal: { nom: t('Ko‘rsatish'), run: sakra('Aktga kirmaydiganlar') } });
    const dubBlok = dublikatMasalalar.filter((m) => m.daraja === 'blok').length;
    const dubOgoh = dublikatMasalalar.length - dubBlok;
    if (dubBlok) tekshiruvBandlari.push({ id: 'dub-blok', daraja: 'bad', matn: t('Dublikat nazorati to‘sig‘i: {n}', { n: dubBlok }), amal: { nom: t('Ko‘rsatish'), run: sakra('Dublikat tekshiruvi') } });
    if (dubOgoh) tekshiruvBandlari.push({ id: 'dub-ogoh', daraja: 'warn', matn: t('Dublikat nazorati ogohlantirishi: {n}', { n: dubOgoh }), amal: { nom: t('Ko‘rsatish'), run: sakra('Dublikat tekshiruvi') } });
    if (takrorTekshirilmoqda) tekshiruvBandlari.push({ id: 'takror', daraja: 'bad', matn: t('Avvalgi F2 tekshirilmoqda — bir lahzadan so‘ng qayta urinib ko‘ring.') });
    else if (almashtirishKutilmoqda) tekshiruvBandlari.push({ id: 'almashtir', daraja: 'bad', matn: t('Shu raqamdagi F2 qoralamasini almashtirish tasdiqlanmagan. Boshqa F2 bo‘lsa, uning raqamini kiriting.'), amal: { nom: t('Ko‘rsatish'), run: sakra('Allaqachon kiritilgan') } });
    else if (saqlashBlok) tekshiruvBandlari.push({ id: 'blok', daraja: 'bad', matn: maqsadMosEmas ? t('Maqsad qoralama topilmadi yoki o‘zgargan - saqlash to‘xtatildi (yangi akt yaratilmaydi). Sahifani qayta oching.') : t('Bu obyekt va oy uchun tasdiqlangan F2 bor — yangi akt yozilmaydi. F2 tarixini oching.') });
    if (yozish && yozish.toxtatish.length > 0) tekshiruvBandlari.push({ id: 'toxtatish', daraja: 'bad', matn: yozish.toxtatish.join(' '), amal: { nom: t('Ko‘rsatish'), run: sakra('Moslash hisoboti') } });
    if (hisobot && (hisobot.stat.shubhali > 0 || hisobot.stat.xato > 0)) tekshiruvBandlari.push({ id: 'hisobot', daraja: hisobot.stat.xato > 0 ? 'bad' : 'warn',
      matn: t('Moslash hisoboti: shubhali {s}, xato {x} — PTO tekshirmaguncha jim yozilmasin', { s: hisobot.stat.shubhali, x: hisobot.stat.xato }), amal: { nom: t('Ko‘rsatish'), run: sakra('Moslash hisoboti') } });
    if (yozish && yozish.qolgan.length > 0) tekshiruvBandlari.push({ id: 'qolgan', daraja: 'warn', matn: t('Bog‘lanmagan qatorlar aktga kirmaydi: {n}', { n: yozish.qolgan.length }), amal: { nom: t('Qatorga o‘tish'), run: () => { sakra('F2 akt')(); keyingiHalRef.current?.(); } } });
    if (taklifSoni > 0) tekshiruvBandlari.push({ id: 'taklif', daraja: 'warn', matn: t('Tasdiq kutayotgan takliflar (aktga faqat tasdiqlanganlar kiradi): {n}', { n: taklifSoni }), amal: { nom: t('Qatorga o‘tish'), run: () => { sakra('F2 akt')(); keyingiHalRef.current?.(); } } });
    if (moslikOgoh.length > 0) tekshiruvBandlari.push({ id: 'moslik', daraja: 'warn', matn: t('Ish–material muvofiqligi: ogohlantirishlar {n} (bloklamaydi)', { n: moslikOgoh.length }), amal: { nom: t('Ko‘rsatish'), run: sakra('Ish va material hajmi muvofiqligi') } });
    if (oshishlar.length > 0) tekshiruvBandlari.push({ id: 'oshish', daraja: 'warn', matn: t('Smeta qoldig‘idan oshadigan qatorlar: {n}', { n: oshishlar.length }), amal: { nom: t('Ko‘rsatish'), run: sakra('Dublikat hajm nazorati') } });
    if (jamiFarq != null && tiyingaYaxlitla(jamiFarq) !== 0) tekshiruvBandlari.push({ id: 'jami', daraja: 'warn', matn: t('Manba jami va qatorlar yig‘indisi mos emas: {n} so‘m', { n: `${jamiFarq > 0 ? '+' : ''}${fmt(jamiFarq)}` }), amal: { nom: t('Ko‘rsatish'), run: sakra('Akt') } });
    if (eskiQoralama && ketmaKetBartaraf !== eskiQoralama.job_id) tekshiruvBandlari.push({ id: 'ketma', daraja: 'warn', matn: t('Avval {oy} F2 si yozilmagan — ochasizmi?', { oy: (eskiQoralama.oy ?? '').slice(0, 7) + (eskiQoralama.raqam ? ` №${eskiQoralama.raqam}` : '') }), amal: { nom: t('Ko‘rsatish'), run: sakra('F2 ketma-ketligi') } });
    if (rejali.length + ochirish.length > 0) tekshiruvBandlari.push({ id: 'rejali', daraja: 'warn', matn: t('Serverga hali yozilmagan o‘zgarishlar: {n} — «F2 ni yozish» bosilganda hammasi bittada yoziladi', { n: rejali.length + ochirish.length }), amal: { nom: t('Ko‘rsatish'), run: sakra('Saqlanmagan o‘zgarishlar') } });
    if (payload && !payload.error && !tekshiruvBandlari.some((x) => x.daraja === 'bad')) tekshiruvBandlari.push({ id: 'kiradi', daraja: 'ok', matn: t('Aktga kiradigan qatorlar: {n}', { n: payload.rows.length }) });
  }
  const tekshiruvYomon = tekshiruvBandlari.filter((x) => x.daraja === 'bad').length;
  const tekshiruvOgoh = tekshiruvBandlari.filter((x) => x.daraja === 'warn').length;
  const yolIdx = !akt || !ij ? 0 : done ? 2 : 1;
  const yolIzoh = [
    akt ? `${akt.fayl} · ${akt.varaq}` : t('Obyektni tanlang va F2 faylni yuklang'),
    ij ? (payload && !payload.error ? t('Aktga kiradi: {n}', { n: payload.rows.length }) : t('Qatorlarni bog‘lang')) : t('Fayl yuklangach ochiladi'),
    done ? t('Yozildi') : jarayon?.find((q) => q.holat === 'ishlayapti')?.nom ?? t('Tekshiruv → yozish'),
  ];
  return (
    <Sahifa sarlavha="F2 import" tavsif="Fayl → akt → moslash → qoralamaga yozish. Har bosqichda nimani tekshirish kerakligi ko‘rsatiladi.">
    <div className="w-full space-y-3">
      <ZanjirChizigi joriy="f2" />
      {routerda &&<F2UrlSinxron faol={!!ij} jobId={Number.isSafeInteger(Number(serverId)) && Number(serverId) > 0 ? Number(serverId) : null} aktId={tahrirAkt} />}
      <p role="status" className="m-0 text-[13px] text-text-dim">{holat}</p>
      <section className="fz-card flex flex-wrap items-center gap-2 p-4 text-[12px]" aria-label={t('Ish holati')}>
        <ol className="fz-yol m-0 w-full list-none p-0" aria-label={t('Qadamlar')}>
          {[t('1. Obyekt va F2 fayl'), t('2. Bog‘lash (hammasi qoralamada)'), t('3. F2 ni yozish')].map((nom, i) => (
            <li key={nom} aria-current={i === yolIdx ? 'step' : undefined}
              className={`fz-yol__q ${i < yolIdx || (i === 2 && !!done) ? 'fz-yol__q--done' : i === yolIdx ? 'fz-yol__q--now' : ''}`}>
              <span className="fz-yol__nuqta" aria-hidden="true" />
              <span className="fz-yol__nom">{nom}</span>
              <span className="fz-yol__izoh">{yolIzoh[i]}</span>
            </li>
          ))}
        </ol>
        <span className="ml-auto text-text-dim">{ishSaqlandi || t('Ish shu brauzerda avtomatik saqlanadi.')}</span>
        {ishXato && <p role="alert" className="w-full text-danger">{ishXato} {t('Saqlanganini tasdiqlamaguncha sahifani yopmang.')}</p>}
        {!ij && saqlanganIsh && objects.some((o) => o.id === saqlanganIsh.objectId) && <button type="button" className="fz-btn fz-btn--primary" disabled={busy} onClick={() => void ishniTikla()}>
          {t('Saqlangan ishni davom ettirish:')} {saqlanganIsh.source.name} · {saqlanganIsh.davr}
        </button>}
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/50 pt-2">
          <span className="text-text-dim">{t('Boshqa kompyuterda davom ettirish')}:</span>
          <div className="flex flex-wrap items-center gap-2">
            {ij && <button type="button" className="fz-btn" disabled={busy} onClick={() => void ishniSaqla()}>{t('Ish holatini saqlash (davom ettirish uchun)')}</button>}
            {ij && !done && <button type="button" className="fz-btn" disabled={busy} onClick={() => void servergaSaqla()}>{t('Server ish holatini saqlash')}</button>}
            {!ij && <label className="block text-[12px]">{t('Server qoralamasi raqami')}
              <input aria-label={t('Server qoralamasi raqami')} type="number" min="1" value={serverId} onChange={(e) => setServerId(e.target.value)} className="input mx-2" />
              <button type="button" className="fz-btn" disabled={busy || !serverId} onClick={() => void serverdanTikla()}>{t('Serverdagi qoralamani davom ettirish')}</button>
            </label>}
          </div>
        </div>
        {serverHolat && <p role="status" className="w-full">{serverHolat}</p>}
      </section>
      {!ij && <F2DavomRoyxat kompaniyaId={companyId} obyektId={objectId ? Number(objectId) : workspace.scope.objectId ?? null} band={busy} onOchish={(id, aktId) => (aktId != null ? void tahrirlash(id, aktId, Number(objectId)) : void serverdanTikla(id))} />}
      <fieldset disabled={busy} className="karta grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-[12px] font-medium text-text">{t('Obyekt')}
          <select aria-label="Obyekt" value={objectId} onChange={(e) => { oxirgiKalit.current = ''; tozala(); setObjectId(e.target.value); workspace.setObjectId(e.target.value ? Number(e.target.value) : null); }}
            className="input mt-1.5 block h-9 w-full px-2 text-[13px]">
            <option value="">Tanlang</option><ObyektOptionlari obyektlar={objects} />
          </select>
        </label>
        {maqsadAkt && <div role="status" className="rounded-lg border border-accent/40 bg-accent/5 p-2 text-[12px] text-text">
          <b>{t('Mavjud F2 qoralamani fayldan yangilash')}: № {maqsadAkt.raqam || '—'} · {maqsadAkt.oy} (akt #{maqsadAkt.id})</b>
          <p className="text-text-dim">{t('Yangi (masalan, texnadzor tuzatgan) faylni tanlang: moslash odatdagidek, saqlash esa yangi akt yaratmaydi - shu qoralama yangilanadi, raqami saqlanadi.')}</p>
          {maqsadMosEmas && <p className="text-danger">{t('Maqsad qoralama topilmadi yoki o‘zgargan - saqlash to‘xtatildi (yangi akt yaratilmaydi). Sahifani qayta oching.')}</p>}
          <a className="underline text-accent" href={`/admin/f2-tayyorlash?obyekt=${maqsadAkt.obyektId}&akt=${maqsadAkt.id}`}>{t('Tizimda tahrirlash (F2 tayyorlash)')}</a>
        </div>}
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
            <input type="month" value={davr} onChange={(e) => setDavr(e.target.value)} disabled={(!!ij && !!done) || !!maqsadAkt}
              className="input mt-1.5 block h-9 w-full px-2 text-[13px]" />
          </label>
        )}
        {akt && (
          <label className="block text-[12px] font-medium text-text">{t('F2 raqami (akt №)')}
            <input aria-label={t('F2 raqami (akt №)')} value={raqam} maxLength={100} placeholder={t('masalan F2-07')} disabled={!!done || !!maqsadAkt}
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
            {reestrMos.length === 1 && reestrMos[0].i !== aktIdx && <button type="button" className="fz-btn fz-btn--primary h-8" disabled={busy}
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
            <span className="inline-flex items-start gap-1 text-text-dim">Hujjat ИТОГО ПРЯМЫЕ: <SummaJuft rejim="ustamali" obyektId={Number(objectId)} kompaniyaId={companyId} ustamasiz={akt.jami.pryamye}
              katKesim={qatorlarKesimi ? katKesimNomalumBilan(qatorlarKesimi, jamiFarq == null ? null : -jamiFarq) : null} /></span>
            <span className="inline-flex items-start gap-1 text-text-dim">Qatorlar yig‘indisi: <span className={jamiFarq != null && Math.abs(jamiFarq) > 1 ? 'text-warn' : 'text-ok'}>
              <SummaJuft rejim="ustamali" obyektId={Number(objectId)} kompaniyaId={companyId} ustamasiz={akt.qatorlarJami} katKesim={qatorlarKesimi} /></span></span>
            {akt.jami.ranee != null && <span className="text-text-dim">Ранее оформленным: <b className="tabular-nums text-text">{fmt(akt.jami.ranee)}</b></span>}
          </div>
          {kumReja && !done && (
            <p className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface-2/40 px-2 py-1.5 text-[12px] text-text-dim" aria-label={t('Kumulyativ varaq')}>
              <span className="min-w-0 flex-1">{kumRejim
                ? t('Kumulyativ rejim: oldingi F2 lar hajmi ayirildi ({n} qator, −{pul} so‘m).', { n: kumReja.qatorlar.size, pul: fmt(kumReja.ayirilganPul) })
                : oldingiYozilgan
                  ? t('Oldingi oylar F2 si yozilgan, hujjatda «Ранее оформленным» bor — hajm kumulyativ. Oldingi F2 lar ayirilishi tavsiya etiladi.')
                  : t('Hujjatda «Ранее оформленным» bor — hajm kumulyativ ko‘rinadi. Oldingi F2 lar ayirilsinmi?')}
                {kumRejim && kumReja.nazorat && <> {kumReja.nazorat.mos
                  ? <b className="text-ok">{t('Jami = ВСЕГО − ранее ✓')}</b>
                  : <b className="text-warn">{t('ВСЕГО − ранее dan farq: {n} so‘m', { n: fmt(kumReja.nazorat.natija - kumReja.nazorat.kutilgan) })}</b>}</>}
                {kumRejim && kumReja.storno.length > 0 && <> {t('Storno taklifi: {n} qator ({pul} so‘m) — oldingi F2 da bor, bu varaqda yo‘q; minus qator sifatida qo‘lda kiriting.', { n: kumReja.storno.length, pul: fmt(kumReja.storno.reduce((s, x) => s + x.pul, 0)) })}</>}
              </span>
              <button type="button" className={oldingiYozilgan && !kumRejim ? 'fz-btn fz-btn--primary' : 'fz-btn'} disabled={busy} onClick={() => setKumRejim((v) => !v)}>{kumRejim ? t('Ayirishni bekor qilish') : t('Oldingi F2 larni ayirish')}</button>
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
      {akt && !done && tahrirdaQoralama && <section role="status" className="karta border border-accent/50 bg-accent/10 p-3 text-[13px] font-semibold text-text" aria-label={t('Tahrirlanmoqda')}>
        {t('Tahrirlanmoqda: F2 №{raqam}, {oy} - saqlanganda shu akt qatorlari almashtiriladi', { raqam: tahrirdaQoralama.raqam || '-', oy: tahrirdaQoralama.oy.slice(0, 7) })}
      </section>}
      {akt && !done && ((avvalgiKalit && (takrorTekshirilmoqda || joriyAvvalgi?.error || joriyAvvalgi?.akt)) || avvalgiImport.length !== 0) && <section
        role={joriyAvvalgi?.akt || joriyAvvalgi?.error || avvalgiImport.length !== 0 ? 'alert' : 'status'} className="karta border border-warn/50 bg-warn/10 p-3 text-[13px] text-warn" aria-label={t('Allaqachon kiritilgan')}>
        {avvalgiImport.length !== 0 && <p className="font-semibold">⚠ {t('Bu varaq allaqachon kiritilgan')}: {avvalgiImport.map((k) => { const a = aktNomlari.get(k.aktId); return `F2 ${a?.raqam ?? '#' + k.aktId} (${(a?.oy ?? '').slice(0, 7)}, ${a?.holat ?? ''})`; }).join('; ')}. {t('Takror kiritish hajmni ikki marta yopadi.')}</p>}
        {!avvalgiKalit ? null : takrorTekshirilmoqda ? <p>{t('Avval kiritilgan F2 tekshirilmoqda…')}</p> : joriyAvvalgi?.error ? <>
          <p>{t('Avvalgi F2 tekshirilmadi. Takroriy akt yaratmaslik uchun qayta tekshiring. Bog‘lanishlar saqlanadi.')}</p>
          <button type="button" className="fz-btn mt-2" onClick={() => setTekshiruv((v) => v + 1)}>{t('Qayta tekshirish')}</button>
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
      {akt && !done && <F2DublikatPanel masalalar={dublikatMasalalar} obyektId={objectId ? Number(objectId) : null} yangilaHref={(id) => `/admin/f2?obyekt=${Number(objectId)}&akt=${id}`} />}
      {akt && !done && eskiQoralama && ketmaKetBartaraf !== eskiQoralama.job_id && (
        <section role="status" className="karta flex flex-wrap items-center gap-2 border border-warn/40 bg-warn/5 p-2 text-[12px] text-warn" aria-label={t('F2 ketma-ketligi')}>
          <span className="min-w-0 flex-1">{t('Avval {oy} F2 si yozilmagan — ochasizmi?', { oy: (eskiQoralama.oy ?? '').slice(0, 7) + (eskiQoralama.raqam ? ` №${eskiQoralama.raqam}` : '') })}</span>
          <a className="fz-btn fz-btn--sm" href={`/admin/f2?obyekt=${eskiQoralama.obyekt_id}&job=${eskiQoralama.job_id}`} target="_blank" rel="noopener noreferrer">{t('Ochish')}</a>
          <button type="button" className="fz-btn fz-btn--sm" onClick={() => setKetmaKetBartaraf(eskiQoralama.job_id)}>{t('Baribir yozish')}</button>
        </section>
      )}
      {ogoh && <p className="text-[12px] text-warn">{ogoh}</p>}
      {xato && <div role="alert" className="text-[13px] text-danger"><p>{xato}</p>{aktZiddiyat && <a
        href={`/admin/f2-tarix?obyekt=${Number(objectId)}`} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-block underline text-accent">{t('Mavjud F2 tarixini boshqa oynada ochish')}</a>}</div>}

      {akt && ij && (rows.length === 0 ? <section className="karta space-y-2 border border-[var(--info)] p-3 text-[13px]" style={{ background: 'var(--info-soft)' }} aria-label={t('Smetasi yo‘q obyekt')}>
        <p className="font-semibold text-text">{t('Bu obyektda smeta yo‘q. F2 ni baribir kiritish mumkin: F2 dagi ishlar smetaga o‘z bo‘limlari bilan qo‘shimcha ish (resurslari bilan) bo‘lib yoziladi va akt shularga bog‘lanadi.')}</p>
        <button type="button" className="fz-btn fz-btn--primary" disabled={busy || !!done} onClick={f2ToliqOtkaz}>{t('F2 dagi barcha ishlarni qoralamaga qo‘shish')}</button>
      </section> : <section className="karta flex flex-wrap items-center gap-2 border border-[var(--info)] p-2 text-[12px]" style={{ background: 'var(--info-soft)' }} aria-label={t('F2 ni to‘liq o‘tkazish')}>
        <span className="min-w-0 flex-1 text-text-dim">{t('Smetada yo‘q ishlar ko‘pmi? Bog‘lanmagan barcha F2 ishlarini bo‘limlari bilan smetaga qo‘shimcha qilib qoralamaga qo‘shing (bog‘langanlari tegilmaydi).')}</span>
        <button type="button" className="fz-btn" disabled={busy || !!done} onClick={f2ToliqOtkaz}>{t('Bog‘lanmagan F2 ni smetaga o‘tkazish')}</button>
      </section>)}
      {akt && ij && ind && objectId && !done && rows.length > 0 && <F2EgizakNusxa companyId={companyId} objectId={Number(objectId)} objects={objects} ind={ind}
        jobId={serverDraft.current?.jobId ?? null} busy={busy} yarat={rejaliYarat} versiya={otaVersiya} smetaYangila={smetaYangila}
        ijQoy={(next, izoh, aRaqam) => { ijOzgar(next); setHolat(izoh); setRaqam(''); setAlmashtirTasdiq(null); setEgizakRaqam({ a: aRaqam }); setEgizakSaqla(true); }} />}

      {akt && ij && ind && avtoMoslandi && !done && <F2TekshiringRoyxat qatorlar={ind.qatorlar} ota={ind.ota} ij={ij} />}
      {akt && ij && (
        <section className="karta sticky top-0 z-20 flex flex-wrap items-center gap-3 border-2 border-accent/50 bg-surface p-3 shadow-md" aria-label={t('Moslashtirish')}>
          <button type="button" className="fz-btn fz-btn--primary" disabled={busy || !!done} onClick={() => void aniqBogla()}>{t('Mos qatorlarni bog‘lash')}</button>
          <button type="button" className="fz-btn" disabled={busy || !!done || !avtoSoni}
            title={t('Dvigatel qilgan barcha bog‘lanishlarni (✓ aniq, xotira, ◐ taklif) uzadi. Qo‘lda bog‘langan va tasdiqlanganlar qoladi. Orqaga (Ctrl+Z) bilan qaytariladi.')}
            onClick={async () => {
              if (!ij || !(await tasdiqSora({ xavfli: true, tasdiqMatni: t('Uzish'), matn: `${avtoSoni} ${t('ta avtomatik bog‘lanish uziladi. Qo‘lda bog‘langanlar qoladi. Davom etasizmi?')}` }))) return;
              const r = avtoBoglarniUz(ijRef.current ?? ij); ijOzgar(r.ij);
              setHolat(`${r.uzildi} ${t('ta avtomatik bog‘lanish uzildi. Qaytarish: «Orqaga» (Ctrl+Z).')}`);
            }}>✕ {t('Avto bog‘lanishlarni uzish')}{avtoSoni ? ` (${avtoSoni})` : ''}</button>
          <button type="button" className="fz-btn" disabled={busy || !!done}
            title={t('Bog‘langan har bir ishning bog‘lanmagan resurslarini o‘sha smeta ishi ichidan bog‘laydi: aniq mosi ✓, o‘xshashi ◐ taklif. Orqaga (Ctrl+Z) bilan qaytariladi.')}
            onClick={() => ishResurslariniBogla()}>⇣ {t('Ish resurslarini bog‘lash')}</button>
          <button type="button" className="fz-btn" disabled={busy || !!done || !tarixSoni} onClick={orqaga} title={t('Oxirgi bog‘lash, uzish yoki tasdiqni qaytarish (Ctrl+Z)')}>↶ {t('Orqaga')}{tarixSoni ? ` (${tarixSoni})` : ''}</button>
          <span className="flex flex-wrap gap-x-3 text-[12px] text-text-dim" aria-label={t('Holat')}>
            <span className="inline-flex items-start gap-1 text-ok">✓ {payload && !payload.error ? payload.rows.length : 0} {t('aktga kiradi')}
              {yozishKesimi && payload && !payload.error && <SummaJuft obyektId={Number(objectId)} kompaniyaId={companyId} kichik
                ustamasiz={payload.rows.reduce((s, r) => s + (r.certifiedAmount ?? 0), 0)} katKesim={yozishKesimi} />}</span>
            {taklifSoni > 0 && <span className="text-warn">◐ {taklifSoni} {t('tasdiq kutmoqda')}</span>}
            {!!yozish?.qolgan.length && <span>✕ {yozish.qolgan.length} {t('kiritilmaydi')}</span>}
            {rejali.length + ochirish.length > 0 && <span style={{ color: 'var(--info)' }}>⏳ {rejali.length + ochirish.length} {t('o‘zgarish qoralamada')}</span>}
          </span>
          {done && keyingi != null && <button type="button" className="fz-btn fz-btn--primary ml-auto" disabled={busy} onClick={() => varaqniTanla(keyingi)}>
            {t('Keyingi varaq → yangi F2')}: {aktlar[keyingi]?.varaq}</button>}
          {done ? (!jarayon && <p className="ml-auto text-[13px] text-ok">{done}</p>) : (
            <>
            {faktRejim && (
            <button type="button" className="fz-btn fz-btn--primary ml-auto" disabled={busy || !faktReja || !faktReja.yoziladi.length} onClick={() => void faktgaYoz()}>
              {t('Faktga yozish')}{faktReja ? ` (${faktReja.yoziladi.length} ${t('qator')})` : ''}
            </button>
          )}
            {!faktRejim && (
            <button type="button" className="fz-btn fz-btn--primary ml-auto" disabled={busy || !payload || saqlashBlok || dublikatBlok}
              onClick={() => void saqla()}>
              {t('F2 ni yozish')}{payload && !payload.error ? ` (${payload.rows.length} ${t('qator')}${rejali.length + ochirish.length ? ` + ${rejali.length + ochirish.length} ${t('o‘zgarish')}` : ''})` : ''}
            </button>
            )}
            </>
          )}
        </section>
      )}

      {akt && ij && !done && (
        <section className="fz-card p-4" aria-label={t('Maqsad')}>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={faktRejim} disabled={busy} onChange={(e) => setFaktRejim(e.target.checked)} />
            <span>{t('Fakt sifatida kiritish (F2 qoralama yaratilmaydi): faqat tizimdagi fakt ustiga qo‘shimcha hajm yoziladi')}</span>
          </label>
          {faktRejim && (
            <div className="mt-2 text-[12px]" data-fakt-reja>
              {faktXato && <p className="text-bad">{faktXato}</p>}
              {!faktReja && !faktXato && <p className="text-text-dim">{t('Mavjud fakt o‘qilmoqda…')}</p>}
              {faktMavjud && faktMavjud.yetim > 0 && <p className="text-warn">{`${faktMavjud.yetim} `}{t('ta fakt yozuvi eski qatorda, aktual vorisi yo‘q — hisobga olinmadi.')}</p>}
              {faktReja && (
                <>
                  <p>{`✓ ${faktReja.yoziladi.length} ${t('qator yoziladi (delta)')} · ${faktReja.bor.length} ${t('tizimda bor — yozilmaydi')}`}</p>
                  <ul className="m-0 max-h-60 list-none overflow-auto p-0">
                    {faktReja.yoziladi.slice(0, 200).map((x) => (
                      <li key={`y${x.qatorId}`}>{`+${x.delta} (${t('fayl')} ${x.faylHajm}, ${t('tizimda')} ${x.mavjud}) ${x.kod ?? ''} ${x.nom ?? ''}${x.ishonch ? ` [${x.ishonch}]` : ''}`}{x.ogohlantirish ? <span className="text-warn">{` ⚠ ${x.ogohlantirish}`}</span> : null}</li>
                    ))}
                    {faktReja.bor.slice(0, 200).map((x) => (
                      <li key={`b${x.qatorId}`} className="text-text-dim">{`– ${x.kod ?? ''} ${x.nom ?? ''}: ${x.sabab}`}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {akt && ij && !done && (
        <section className="fz-card p-4" aria-label={t('Tekshiruv')}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="fz-panel__h m-0">{t('Tekshiruv')} — {t('yozishdan oldin')}</h3>
            <span className={`fz-stamp ml-auto ${tekshiruvYomon ? 'fz-stamp--danger' : tekshiruvOgoh ? 'fz-stamp--warn' : 'fz-stamp--ok'}`}>
              {tekshiruvYomon ? t('To‘siq: {n}', { n: tekshiruvYomon }) : tekshiruvOgoh ? t('Ogohlantirish: {n}', { n: tekshiruvOgoh }) : t('Tayyor')}
            </span>
          </div>
          <ul className="fz-check m-0 list-none p-0">
            {tekshiruvBandlari.map((x) => (
              <li key={x.id} data-tekshiruv={x.daraja} className={`fz-check__q fz-check__q--${x.daraja}`}>
                {x.daraja === 'ok' ? <CheckCircle2 aria-hidden /> : x.daraja === 'warn' ? <AlertTriangle aria-hidden /> : <XCircle aria-hidden />}
                <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>{x.matn}</span>
                {x.amal && <button type="button" className="fz-btn fz-btn--sm" onClick={x.amal.run}>{x.amal.nom}</button>}
              </li>
            ))}
            {!tekshiruvBandlari.length && <li className="fz-check__q"><Info aria-hidden /><span>{t('Tekshiriladigan narsa yo‘q — qatorlar hisoblanmoqda.')}</span></li>}
          </ul>
        </section>
      )}
      {akt && ij && !done && hisobot && <F2MoslashHisoboti hisobot={hisobot} />}
        {akt && ij && !done && <IshMaterialOgohRoyxat natijalar={moslikOgoh} onTuzat={moslikNusxa} tuzatNomi={(n) => t('Nusxalash: {v}', { v: String(n.taklif).replace('.', ',') })} />}

      {akt && ind && natija && ij && (
        <F2V3Workbench keyingiRef={keyingiHalRef} akt={akt} ind={ind} natija={natija} S={S} raw={raw} oldingi={oldingi} almashtirilgan={almashtirilgan} band={band}
          ij={ij} onIj={ijOzgar} onRzBog={rzOrgat} companyId={companyId} objectId={Number(objectId)}
          onYaratildi={yaratildi} zamenaAsl={zamenaAslK} zamenaMiqdor={zamenaMiqdorK}onQoshilganOzgardi={qoshilganOzgardi} onRejali={onRejali} onRejaliOchir={onRejaliOchir} onOchirishRejali={onOchirishRejali} onTahrirRejali={onTahrirRejali} onBolimRejali={bolimRejali} rejaliIdlar={() => rejaliRef.current.map((b) => b.tempId)} disabled={busy || !!done} />
      )}

      {ochirish.length > 0 && <section className="karta space-y-1 border border-danger/40 bg-danger/5 p-3 text-[12px]" aria-label={t('O‘chirishga belgilangan')}>
        <p className="font-semibold text-text">🗑 {ochirish.length} {t('ta qator o‘chirishga belgilangan — «F2 ni yozish» bosilganda o‘chiriladi.')}</p>
        <ul className="max-h-32 space-y-0.5 overflow-auto">{ochirish.map((o) => <li key={o.qatorId} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate line-through decoration-danger/70">{o.nom}</span>
          <button type="button" className="fz-btn fz-btn--sm" disabled={busy} onClick={() => ochirishniBekor(o.qatorId)}>{t('Bekor qilish')}</button>
        </li>)}</ul>
      </section>}
      {rejali.length > 0 && <section className="karta space-y-1 border border-[var(--info)] p-3 text-[12px]" style={{ background: 'var(--info-soft)' }} aria-label={t('Saqlanmagan o‘zgarishlar')}>
        <p className="font-semibold text-text">⏳ {rejali.length} {t('ta qo‘shimcha/zamena qoralamada — «Saqlash» bosilganda hammasi bittada yoziladi.')}</p>
        <ul className="max-h-40 space-y-0.5 overflow-auto">{rejali.map((b) => <li key={b.tempId} className="flex items-center gap-2">
          <span className={`rounded px-1 text-[10px] font-semibold ${b.kind === 'replacement' || b.kind === 'resurs_ish' ? 'bg-warn/25 text-warn' : 'bg-[var(--info-soft)] text-[var(--info)]'}`}>{b.kind === 'replacement' || b.kind === 'resurs_ish' ? t('zamena') : b.kind === 'resource' ? t('resurs') : b.kind === 'bolim' ? t('bo‘lim') : t('qo‘shimcha')}</span>
          <span className="min-w-0 flex-1 truncate">{b.nom} · {b.hajm ?? '—'} {b.birlik}{b.resurslar.length ? ` · ${b.resurslar.length} ${t('resurs')}` : ''}</span>
          {([-1, 1] as const).map((yon) => <button key={yon} type="button" className="fz-btn fz-btn--sm" disabled={busy || !rejaliSurishMumkin(rejali, b.tempId, yon)} onClick={() => onRejaliSurish(b.tempId, yon)} aria-label={`${yon < 0 ? t('Yuqoriga') : t('Pastga')}: ${b.nom}`}>{yon < 0 ? '▲' : '▼'}</button>)}
          <button type="button" className="fz-btn fz-btn--sm" disabled={busy} onClick={() => onRejaliOchir(b.tempId)} aria-label={`${t('Olib tashlash')}: ${b.nom}`}>✕</button>
        </li>)}</ul>
      </section>}

      {tkmQatorlar.length !== 0 && !done && (
        <details className="karta p-3 text-[12px]" aria-label={t('ТН·КМ taklifi')}>
          <summary className="cursor-pointer font-semibold text-text">{t('ТН·КМ taklifi')}: {tkmQatorlar.length} {t('qator')}</summary>
          <ul className="mt-1 space-y-1 text-text-dim">{tkmQatorlar.map((q) => <li key={q.uid}>
            <b className="text-text">{q.nom.slice(0, 80)}</b> — {t('faylda')}: {q.hajm != null ? fmt(q.hajm) : '—'}
            {q.tk.a && <> · {q.tk.a.izoh} = <b className="tabular-nums text-text">{fmt(q.tk.a.qiymat)}</b></>}
            {q.tk.b && <> · {q.tk.b.izoh} = <b className="tabular-nums text-text">{fmt(q.tk.b.qiymat)}</b></>}
          </li>)}</ul>
        </details>
      )}

      {tkmQoshTaklif.length !== 0 && !done && (
        <details className="karta p-3 text-[12px]" aria-label={t('ТН·КМ qatori faylda yo‘q')}>
          <summary className="cursor-pointer font-semibold text-text">{t('ТН·КМ qatori faylda yo‘q')}: {tkmQoshTaklif.length} {t('qator')}</summary>
          <ul className="mt-1 space-y-1 text-text-dim">{tkmQoshTaklif.map((q) => <li key={q.qatorId} className="flex flex-wrap items-center gap-2">
            <b className="text-text">{q.nom.slice(0, 80)}</b>
            {([['A', q.tk.a], ['B', q.tk.b]] as const).map(([k, v]) => v && <button key={k} type="button" className="fz-btn fz-btn--sm" title={v.izoh} disabled={busy} onClick={() => setTkmQosh((o) => new Map(o).set(q.qatorId, v.qiymat))}>{k}: {fmt(v.qiymat)}</button>)}
            {tkmQosh.has(q.qatorId) && <><span className="text-ok">✓ {fmt(tkmQosh.get(q.qatorId)!)} {t('F2 qatori sifatida qo‘shiladi')}</span>
              <button type="button" className="fz-btn fz-btn--sm" onClick={() => setTkmQosh((o) => { const n = new Map(o); n.delete(q.qatorId); return n; })}>{t('Bekor qilish')}</button></>}
            <span className="w-full text-text-mute">{[q.tk.a?.izoh, q.tk.b?.izoh].filter(Boolean).join(' · ')}</span>
          </li>)}</ul>
        </details>
      )}

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

      {yozish && (yozish.qolgan.length > 0 || yozish.toxtatish.length > 0 || yozish.ogohlantirish.length > 0 || !!payload?.izohlar.length || payload?.error) && (
        <section className="karta space-y-2 p-3" aria-label={t('Aktga kirmaydiganlar')}>
          {!!yozish.qolgan.length && <div className="text-[12px] text-warn"><p>{t('Bog‘lanmagan yoki tasdiqlanmagan qatorlar aktga kiritilmaydi; ular manba va server ish qoralamasida saqlanadi. Qoralama aktni saqlash mumkin. Minuslar kiritilmasa, ular oldingi hajmlarni kamaytirmaydi.')} ({yozish.qolgan.length})</p>
            <ul className="mt-1 max-h-24 overflow-auto pl-4 text-text-dim">{yozish.qolgan.map((n) => <li key={n.uid}>{n.manzil.varaq}!{n.manzil.qator} · {n.nom} · {fmt(n.hajm)} {n.birlik}</li>)}</ul>
          </div>}
          {akt && ij && ind?.qatorlar.some((q) => q.hajm != null && q.hajm < 0 && !ij.bog.has(q.uid) && !ij.otkaz.has(q.uid)) && <button type="button" className="fz-btn" disabled={busy || !!done} onClick={() => {
            const result = f2MinusTaklif(akt, ij); ijOzgar(result.ij);
            setHolat(`${result.soni} ta minus qator uchun ayni aktdagi aniq bog‘lanish asosida taklif berildi. Har birini tekshirib tasdiqlang; boshqa qatorlarni qo‘lda bog‘lang.`);
          }}>{t('Minus qatorlarga bog‘lanish taklif qilish')}</button>}
          {yozish.toxtatish.map((m, i) => <p key={i} className="text-[12px] text-warn">{m}</p>)}
          {[...yozish.ogohlantirish, ...(payload?.izohlar ?? [])].map((m, i) => <p key={`o${i}`} className="text-[12px] text-text-dim">ℹ {m}</p>)}
          {payload?.error && <p role="alert" className="text-[12px] text-danger">{payload.error}</p>}
        </section>
      )}

      {jarayon && <F2YozishOynasi qadamlar={jarayon} natija={done} band={busy || davomEt}
        onQayta={() => void saqla()} onYop={() => setJarayon(null)} />}
    </div>
    </Sahifa>
  );
}

export default function F2ImportV3() {
  const { joriy, yuklanmoqda } = useKompaniya();
 if (yuklanmoqda) return <p>Kompaniya yuklanmoqda…</p>;
  if (!joriy?.id) return <p>Kompaniyani tanlang.</p>;
  return <Sessiya key={joriy.id} companyId={joriy.id} />;
}
