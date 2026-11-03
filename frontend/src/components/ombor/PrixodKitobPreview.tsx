import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, LoaderCircle, Search, ShieldAlert, Upload, X } from 'lucide-react';
import { t, raqamFormatla } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import { prixodKitobFonda } from '../../lib/ombor-prixod/read-fonda';
import { varaqNomlari } from '../../lib/ombor-prixod/kitob';
import { PrixodQatorEditor } from './PrixodQatorEditor';
import { hujjatTokenBilan } from '../../lib/token-hujjat';
import { downloadBlob } from '../../lib/construction-document-control/export/download-helper';
import { omborDavrExcel, type OmborDavr, type OmborHisobotQator } from '../../lib/ombor-prixod/davr-eksport';
import { materialTaklifQur } from '../../lib/ombor-prixod/taklif';
import { prixodQoralama, qoralamaQator, qoralamaTasdiqlangan, type PrixodQoralama } from '../../lib/ombor-prixod/qoralama';
import type { PrixodKitob, PrixodQator, PrixodXato, PrixodOgoh } from '../../lib/ombor-prixod/turlar';
import {
  KIRIM_VARAQ, kirimRejaBajar, kirimRejaQur, rejaKaliti, rejaOqi, rejaYoz, takrorBelgila, yozilganSoni, type KirimReja,
} from '../../lib/ombor-prixod/yozish';
import { sbSkladKirimImport, sbSkladKirimYozilganQatorlar } from '../../api/t2-sklad-kirim';
import { hujjatYukla } from '../../api/t2-hujjat-canonical';

const SAHIFA_HAJMI = 50;
/** hujjat-yukla.ts: shu chegaradan kichik fayl serverda qayta hash qilinadi (sha256_verified) — import faqat shunday faylni oladi. */
const SERVER_HASH_CHEGARA = 25 * 1024 * 1024;
type Filtr = 'hammasi' | 'yangi' | 'takror' | 'xato';
type Yozish =
  | { holat: 'yoq' }
  | { holat: 'yuklanmoqda' }
  | { holat: 'yozilmoqda'; yozildi: number; jami: number }
  | { holat: 'uzildi'; xabar: string; yozildi: number; jami: number }
  | { holat: 'tugadi'; yozildi: number; takror: number; xato: number };

const XATO_MATN: Record<PrixodXato, string> = {
  SANA_YOQ: 'Sana kiritilmagan', SANA_XATO: 'Sana formati noto‘g‘ri', NOM_YOQ: 'Tovar nomi kiritilmagan',
  BIRLIK_YOQ: 'O‘lchov birligi kiritilmagan', MIQDOR_YOQ: 'Miqdor kiritilmagan', MIQDOR_XATO: 'Miqdor musbat son bo‘lishi kerak',
  MIQDOR_SANA: 'Miqdor sana ko‘rinishida; ustunni tekshiring',
};
const OGOH_MATN: Record<PrixodOgoh, string> = {
  YETKAZUVCHI_YOQ: 'Yetkazuvchi ko‘rsatilmagan', MIQDOR_FORMULA: 'Miqdor formuladan olingan',
  NOM_SARLAVHASI: 'Nom ustuni sarlavhasi o‘zgargan — nomlar D ustunidan olindi.', RAQAM_YOQ: 'Manba raqami ko‘rsatilmagan',
};
const PARSER_XATO_MATNI: Record<string, string> = {
  PRIXOD_SHEET_REQUIRED: 'Faylda «Приход» varag‘i topilmadi.',
  PRIXOD_HEADER_REQUIRED: 'Kirim ustunlari topilmadi. Sana, nom, birlik va miqdor ustunlarini tekshiring.',
  PRIXOD_SCOPE_INVALID: 'Avval kompaniya va omborni tanlang.',
};
const SERVER_XATO_MATNI: Record<string, string> = {
  SOURCE_DOCUMENT_NOT_VERIFIED: 'Fayl serverda tekshirilmadi (25 MB dan katta yoki saqlanmagan). Kichikroq fayl bilan qayta urinib ko‘ring.',
  WAREHOUSE_SCOPE_MISMATCH: 'Ombor topilmadi yoki bu kompaniyaga tegishli emas.',
  OPERATION_ID_CONFLICT: 'Bu bo‘lak avval boshqacha yuborilgan. Faylni qayta tanlab, takrorlarni qayta tekshiring.',
  SOURCE_ROW_INVALID: 'Bo‘lakda noto‘g‘ri qator bor — hech narsa yozilmadi. Xato qatorlarni tekshiring.',
  BATCH_INVALID: 'Bo‘lak noto‘g‘ri — hech narsa yozilmadi.',
  PERMISSION_DENIED: 'Bu kompaniyada omborga yozish huquqingiz yo‘q.',
  SOURCE_ROW_ALREADY_POSTED: 'Bu qatorlar allaqachon yozilgan. Takrorlarni qayta tekshiring.',
};

function serverXatoMatni(code: string | undefined, xato: string): string {
  return code && SERVER_XATO_MATNI[code] ? t(SERVER_XATO_MATNI[code]) : xato || t('Yozib bo‘lmadi. Aloqani tekshirib, «Davom ettirish» ni bosing.');
}
const holatNomi = (q: PrixodQator) => (q.holat === 'yangi' ? t('Yangi') : q.holat === 'takror' ? t('Takror') : t('Xato'));
const xatoMatnlari = (q: PrixodQator) => [...q.xatolar.map((x) => t(XATO_MATN[x])), ...q.ogohlar.map((x) => t(OGOH_MATN[x]))];
const qatorQidiruvMatni = (q: PrixodQator) => [q.sana, q.nom, q.birlik, q.miqdorMatni, q.yetkazuvchi, q.hujjat, holatNomi(q), ...xatoMatnlari(q)].join(' ');
const son = (n: number) => raqamFormatla(n, { maximumFractionDigits: 0 });

function HolatNishoni({ q }: { q: PrixodQator }) {
  const tone = q.holat === 'yangi' ? 'fz-stamp--ok' : q.holat === 'takror' ? 'fz-stamp--warn' : 'fz-stamp--danger';
  return <span className={`fz-stamp ${tone}`}>{holatNomi(q)}</span>;
}
function Maydon({ nom, qiymat, className = '' }: { nom: string; qiymat: ReactNode; className?: string }) {
  return <td className={`block min-w-0 border-b border-border px-2 py-2 align-top md:table-cell md:px-3 ${className}`}>
    <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-mute md:hidden">{t(nom)}</span>{qiymat}
  </td>;
}
function Summary({ label, value, tone }: { label: string; value: number | string; tone: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const text = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-dim';
  return <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2">
    <div className="text-[11px] leading-4 text-text-mute">{label}</div>
    <div className={`mt-0.5 text-[20px] font-semibold leading-6 tabular-nums ${text}`}>{value}</div>
  </div>;
}

/**
 * «Excel'dan yuklash»: fayl → «Приход» varag'i → ko'rib chiqish (xato qizil, tahrirlash, yangi/takror/xato) →
 * «Tasdiqlab yozish»: asl fayl R2 (kanonik hujjat reyestri) → 1000 talik bo'laklar, progress, uzilsa shu operation_id
 * bilan davom. Narx yo'q (NULL).
 */
export function PrixodKitobPreview({ kompaniyaId, skladId, skladNomi, yozishMumkin = true, onYozildi }: {
  kompaniyaId: number; skladId: number | null; skladNomi?: string; yozishMumkin?: boolean; onYozildi?: () => void;
}) {
  const [faylNomi, setFaylNomi] = useState<string | null>(null);
  const [varaqlar, setVaraqlar] = useState<string[]>([]);
  const [kitob, setKitob] = useState<PrixodKitob | null>(null);
  const [oqilmoqda, setOqilmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [takrorXato, setTakrorXato] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const [filtr, setFiltr] = useState<Filtr>('hammasi');
  const [sahifa, setSahifa] = useState(0);
  const [qoralamalar, setQoralamalar] = useState<Map<number, PrixodQoralama>>(() => new Map());
  const [tahrirQatori, setTahrirQatori] = useState<number | null>(null);
  const [yozish, setYozish] = useState<Yozish>({ holat: 'yoq' });
  const [oldingiReja, setOldingiReja] = useState<KirimReja | null>(null);
  const [davrBoshi, setDavrBoshi] = useState('');
  const [davrOxiri, setDavrOxiri] = useState('');
  const [eksportYuklanmoqda, setEksportYuklanmoqda] = useState(false);
  const [eksportXatosi, setEksportXatosi] = useState<string | null>(null);
  const faylRef = useRef<File | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const toxtatRef = useRef(false);

  const tozala = () => {
    generationRef.current++; requestRef.current?.abort(); requestRef.current = null; faylRef.current = null;
    setFaylNomi(null); setVaraqlar([]); setKitob(null); setOqilmoqda(false); setXato(null); setTakrorXato(false);
    setQidiruv(''); setFiltr('hammasi'); setSahifa(0); setQoralamalar(new Map()); setTahrirQatori(null);
    setYozish({ holat: 'yoq' }); setOldingiReja(null);
    setDavrBoshi(''); setDavrOxiri(''); setEksportXatosi(null); setEksportYuklanmoqda(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { tozala(); return () => { generationRef.current++; requestRef.current?.abort(); }; }, [kompaniyaId, skladId]);

  const takrorTekshir = async (k: PrixodKitob, generation: number) => {
    if (skladId == null) return;
    setTakrorXato(false);
    try {
      const bor = await sbSkladKirimYozilganQatorlar({ kompaniyaId, skladId, sha256: k.sha256, varaq: KIRIM_VARAQ });
      if (generation !== generationRef.current) return;
      setKitob(takrorBelgila(k, bor));
    } catch {
      if (generation === generationRef.current) setTakrorXato(true);
    }
  };

  const faylTanla = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    tozala();
    const generation = ++generationRef.current;
    const controller = new AbortController();
    requestRef.current = controller; faylRef.current = file;
    setFaylNomi(file.name); setOqilmoqda(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nomlar = await varaqNomlari(bytes).catch(() => [] as string[]);
      if (generation !== generationRef.current) return;
      setVaraqlar(nomlar);
      const k = await prixodKitobFonda(bytes, { faylNomi: file.name, kompaniyaId, skladId }, controller.signal);
      if (generation !== generationRef.current) return;
      setKitob(k); setOqilmoqda(false);
      if (skladId != null) {
        const saqlangan = rejaOqi(rejaKaliti(kompaniyaId, skladId, k.sha256));
        if (saqlangan && saqlangan.bajarilgan.length < saqlangan.bolaklar.length) setOldingiReja(saqlangan);
      }
      await takrorTekshir(k, generation);
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const kod = error instanceof Error ? error.message : '';
      setOqilmoqda(false);
      setXato(t(PARSER_XATO_MATNI[kod] ?? 'Excel faylini o‘qib bo‘lmadi. XLSX faylini qayta tanlang.'));
    } finally {
      if (generation === generationRef.current) requestRef.current = null;
    }
  };

  const takliflar = useMemo(() => (kitob ? materialTaklifQur(kitob.qatorlar) : []), [kitob]);
  const korinadi = useMemo(() => (kitob?.qatorlar ?? []).map((source) => {
    const draft = qoralamalar.get(source.manbaQator);
    return draft && source.holat !== 'takror' ? qoralamaQator(draft) : source;
  }), [kitob, qoralamalar]);
  const jami = useMemo(() => ({
    yangi: korinadi.filter((q) => q.holat === 'yangi').length,
    takror: korinadi.filter((q) => q.holat === 'takror').length,
    xato: korinadi.filter((q) => q.holat === 'xato').length,
  }), [korinadi]);
  const tasdiqlanmagan = useMemo(() => [...qoralamalar.values()].filter((d) => !qoralamaTasdiqlangan(d) && qoralamaQator(d).holat === 'yangi').length, [qoralamalar]);
  // Faqat tasdiqlangan tahrir yoziladi; tahrirlangan, lekin tasdiqlanmagan qator yozilmaydi.
  const yoziladigan = useMemo(() => korinadi.filter((q) => {
    const d = qoralamalar.get(q.manbaQator);
    return q.holat === 'yangi' && (!d || qoralamaTasdiqlangan(d));
  }), [korinadi, qoralamalar]);
  // RU Excel: faqat tasdiqlangan (yangi) qoralamalar; takror qator hech qachon eksportga kirmaydi.
  const takrorManbalar = useMemo(() => new Set((kitob?.qatorlar ?? []).filter((q) => q.holat === 'takror').map((q) => q.manbaQator)), [kitob]);
  const eksportQatorlari = useMemo<OmborHisobotQator[]>(() => [...qoralamalar.values()]
    .filter((d) => qoralamaTasdiqlangan(d) && !takrorManbalar.has(d.manba.manbaQator))
    .map((d) => {
      const row = qoralamaQator(d);
      return { id: String(row.manbaQator), sana: row.sana!, operatsiya: 'prixod' as const, nom: row.nom, birlik: row.birlik,
        miqdor: row.miqdor!, tomon: row.yetkazuvchi, hujjat: row.hujjat, manbaQator: row.manbaQator, tasdiqlangan: true };
    }), [qoralamalar, takrorManbalar]);
  const queryKey = qidiruvKaliti(qidiruv);
  const mos = useMemo(() => korinadi.filter((q) => (filtr === 'hammasi' || q.holat === filtr)
    && (!queryKey || qidiruvKaliti(qatorQidiruvMatni(q)).includes(queryKey))), [korinadi, filtr, queryKey]);
  const sahifalar = Math.max(1, Math.ceil(mos.length / SAHIFA_HAJMI));
  const joriy = Math.min(sahifa, sahifalar - 1);
  const qatorlar = mos.slice(joriy * SAHIFA_HAJMI, (joriy + 1) * SAHIFA_HAJMI);
  const ishlayapti = yozish.holat === 'yuklanmoqda' || yozish.holat === 'yozilmoqda';
  const kattaFayl = (faylRef.current?.size ?? 0) > SERVER_HASH_CHEGARA;
  const yozishTayyor = !!kitob && skladId != null && yozishMumkin && kitob.takrorTekshirildi && !takrorXato
    && !ishlayapti && yozish.holat !== 'tugadi' && !kattaFayl && (yoziladigan.length > 0 || oldingiReja != null);

  const eksportMumkin = !!kitob && eksportQatorlari.length > 0 && davrBoshi !== '' && davrOxiri !== '' && davrBoshi <= davrOxiri
    && kompaniyaId > 0 && skladId != null && !eksportYuklanmoqda;
  const davrExcelYukla = async () => {
    if (!eksportMumkin || !kitob || skladId == null) return;
    const generation = generationRef.current;
    setEksportYuklanmoqda(true); setEksportXatosi(null);
    const davr: OmborDavr = {
      bosh: davrBoshi, oxir: davrOxiri, kompaniya: `${t('Kompaniya')} ${kompaniyaId}`,
      ombor: skladNomi || `${t('Ombor')} ${skladId}`, holat: 'qoralama', rasxodKiritilgan: false,
      manbaNomi: kitob.faylNomi, manbaSha256: kitob.sha256,
    };
    try {
      const bytes = await omborDavrExcel(eksportQatorlari, davr);
      if (generation !== generationRef.current) return;
      const nom = `Kirim_qoralama_${davrBoshi}_${davrOxiri}.xlsx`;
      const natija = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'OMBOR_QORALAMA_REESTR',
        sabab: `Черновик прихода · ${davr.bosh} — ${davr.oxir} · склад ${skladId}` }, () => {
        if (generation !== generationRef.current) throw new Error('EXPORT_SCOPE_CHANGED');
        downloadBlob(bytes, nom);
      });
      if (!natija.ok && generation === generationRef.current) setEksportXatosi(natija.xabar);
    } catch {
      if (generation === generationRef.current) setEksportXatosi(t('Excelni tayyorlab bo‘lmadi. Tasdiqlangan qatorlar va davrni tekshiring.'));
    } finally {
      if (generation === generationRef.current) setEksportYuklanmoqda(false);
    }
  };

  const bajar = async (reja: KirimReja) => {
    if (!kitob || skladId == null) return;
    const generation = generationRef.current;
    const kalit = rejaKaliti(kompaniyaId, skladId, kitob.sha256);
    toxtatRef.current = false;
    let r = reja;
    if (r.documentId == null) {
      const file = faylRef.current;
      if (!file) { setYozish({ holat: 'uzildi', xabar: t('Faylni qayta tanlang.'), yozildi: 0, jami: r.jamiQator }); return; }
      setYozish({ holat: 'yuklanmoqda' });
      const up = await hujjatYukla({ file, kompaniyaId, documentType: 'warehouse_receipt' });
      if (generation !== generationRef.current) return;
      if (!up.ok || up.data.sha256?.toLowerCase() !== kitob.sha256) {
        setYozish({ holat: 'uzildi', xabar: (!up.ok && up.xato) || t('Asl faylni saqlab bo‘lmadi. Qayta urinib ko‘ring.'), yozildi: 0, jami: r.jamiQator });
        return;
      }
      r = { ...r, documentId: up.data.document_id };
      rejaYoz(kalit, r);
    }
    setYozish({ holat: 'yozilmoqda', yozildi: yozilganSoni(r), jami: r.jamiQator });
    const natija = await kirimRejaBajar({
      reja: r,
      chaqir: ({ documentId, bolak }) => sbSkladKirimImport({ kompaniyaId, skladId, documentId, varaq: KIRIM_VARAQ, bolak }),
      yozilganlarniOl: () => sbSkladKirimYozilganQatorlar({ kompaniyaId, skladId, sha256: kitob.sha256, varaq: KIRIM_VARAQ }),
      progress: (yozildi, jamiQator) => { if (generation === generationRef.current) setYozish({ holat: 'yozilmoqda', yozildi, jami: jamiQator }); },
      saqla: (x) => rejaYoz(kalit, x),
      toxtat: () => toxtatRef.current || generation !== generationRef.current,
    });
    if (generation !== generationRef.current) return;
    if (natija.holat === 'tugadi') {
      rejaYoz(kalit, null); setOldingiReja(null);
      setYozish({ holat: 'tugadi', yozildi: natija.yozildi, takror: jami.takror + natija.takrorOtkazildi, xato: jami.xato });
      onYozildi?.();
    } else {
      setOldingiReja(natija.reja);
      setYozish({ holat: 'uzildi', yozildi: yozilganSoni(natija.reja), jami: natija.reja.jamiQator,
        xabar: natija.holat === 'toxtatildi' ? t('To‘xtatildi. «Davom ettirish» bilan qolganini yozing.') : serverXatoMatni(natija.code, natija.xato) });
    }
  };

  const tasdiqlabYoz = async () => {
    if (!kitob || skladId == null || !yozishTayyor) return;
    const reja = oldingiReja ?? await kirimRejaQur({ kompaniyaId, skladId, sha256: kitob.sha256, faylNomi: kitob.faylNomi, qatorlar: yoziladigan });
    await bajar(reja);
  };

  const filtrlar: { id: Filtr; label: string; soni: number | string; disabled?: boolean }[] = kitob ? [
    { id: 'hammasi', label: t('Barchasi'), soni: korinadi.length },
    { id: 'yangi', label: t('Yangi'), soni: jami.yangi },
    { id: 'takror', label: t('Takror'), soni: kitob.takrorTekshirildi ? jami.takror : '—', disabled: !kitob.takrorTekshirildi },
    { id: 'xato', label: t('Xato'), soni: jami.xato },
  ] : [];
  const faolQoralama = tahrirQatori == null ? null : qoralamalar.get(tahrirQatori) ?? null;

  return <section className="fz-card min-w-0" aria-label={t('Kirim hujjatini ko‘rib chiqish')}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><FileSpreadsheet size={17} className="shrink-0 text-[var(--info)]" aria-hidden="true" />
          <h2 className="m-0 text-[15px] font-semibold text-text">{t('Excel’dan yuklash')}</h2>
        </div>
        <p className="mb-0 mt-1 text-[12px] leading-4 text-text-dim">{t('Faqat «Приход» varag‘i ko‘riladi. Narx va summa hozircha noma’lum; 0 deb olinmaydi.')}</p>
      </div>
    </header>

    <div className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className={`flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-surface-2 px-3 text-center text-[14px] font-semibold text-text hover:bg-surface-3 sm:flex-1 ${ishlayapti ? 'pointer-events-none opacity-50' : ''}`}>
          <FileSpreadsheet size={18} aria-hidden="true" />{t('Excel faylini tanlang')}
          <input aria-label={t('XLSX fayli')} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={kompaniyaId <= 0 || ishlayapti} onChange={(e) => void faylTanla(e)} className="sr-only" />
        </label>
        {faylNomi && <div className="flex min-h-[56px] min-w-0 items-center justify-between gap-2 rounded-md bg-surface-2 px-3 text-[12px] text-text-dim sm:flex-1">
          <span className="truncate" title={faylNomi}>{faylNomi}</span>
          <button type="button" onClick={tozala} disabled={ishlayapti} className="fz-btn fz-btn--ghost min-h-[48px] min-w-[48px] px-2" aria-label={t('Tozalash')}><X size={16} aria-hidden="true" /></button>
        </div>}
      </div>

      {skladId == null && <div className="fz-note fz-note--warn" role="status"><ShieldAlert size={16} aria-hidden="true" />
        <span>{t('Ombor tanlanmagan. Fayl faqat ko‘rib chiqiladi; ombor yozuvi yaratilmaydi.')}</span></div>}
      {skladId != null && skladNomi && <p className="m-0 text-[12px] text-text-mute">{t('Ombor')}: <b className="text-text">{skladNomi}</b></p>}

      {varaqlar.length > 0 && <div role="radiogroup" aria-label={t('Varaqni tanlang')} className="flex flex-wrap gap-2">
        {varaqlar.map((v) => {
          const asosiy = v.normalize('NFKC').trim().toLowerCase() === KIRIM_VARAQ.toLowerCase();
          return <button key={v} type="button" role="radio" aria-checked={asosiy} disabled={!asosiy}
            className={`min-h-[48px] rounded-md border px-3 text-[13px] ${asosiy ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-text)]' : 'border-border bg-surface text-text-mute'} disabled:cursor-not-allowed`}>
            {v}{!asosiy && <span className="ml-1 text-[11px]">· {t('import qilinmaydi')}</span>}
          </button>;
        })}
      </div>}

      {oqilmoqda && <div className="fz-note fz-note--info" role="status"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" />{t('Excel fayli o‘qilmoqda…')}</div>}
      {xato && <div className="fz-note fz-note--danger" role="alert"><AlertCircle size={16} aria-hidden="true" />{xato}</div>}

      {kitob && <>
        {yozish.holat !== 'tugadi' && <section className="rounded-md border border-border bg-surface-2 p-3" aria-label={t('Tasdiqlangan qoralamalar eksporti')}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[12px] font-medium text-text-dim">
              {t('Davr boshi')}
              <input type="date" value={davrBoshi} onChange={(e) => { setDavrBoshi(e.target.value); setEksportXatosi(null); }}
                className="mt-1 h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text" />
            </label>
            <label className="min-w-0 flex-1 text-[12px] font-medium text-text-dim">
              {t('Davr oxiri')}
              <input type="date" value={davrOxiri} onChange={(e) => { setDavrOxiri(e.target.value); setEksportXatosi(null); }}
                className="mt-1 h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg px-3 text-[13px] text-text" />
            </label>
            <button type="button" disabled={!eksportMumkin} onClick={() => void davrExcelYukla()}
              className="fz-btn fz-btn--primary min-h-[48px] justify-center px-3 disabled:cursor-not-allowed disabled:opacity-50">
              {eksportYuklanmoqda ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {eksportYuklanmoqda ? t('Excel tayyorlanmoqda…') : t('Tasdiqlangan qoralamalar — RU Excel')}
            </button>
          </div>
          <p className="mb-0 mt-2 text-[11px] text-text-mute">{t('Tasdiqlangan qoralamalar: {soni}', { soni: eksportQatorlari.length })} · {t('Eksportda faqat tasdiqlangan qoralamalar olinadi.')}</p>
          <p className="mb-0 mt-1 text-[11px] text-text-mute">{t('Eksport amaldagi hujjat tarifiga kiradi.')}</p>
          {eksportXatosi && <p className="mb-0 mt-1 text-[12px] text-danger" role="alert">{eksportXatosi}</p>}
        </section>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label={t('Yangi')} value={jami.yangi} tone="ok" />
          <Summary label={t('Takror')} value={kitob.takrorTekshirildi ? jami.takror : '—'} tone="warn" />
          <Summary label={t('Xato')} value={jami.xato} tone="danger" />
          <Summary label={t('Bo‘sh shablon qatorlari')} value={kitob.boshQatorlar} tone="muted" />
        </div>
        {!kitob.takrorTekshirildi && !takrorXato && skladId != null && <div className="fz-note fz-note--info" role="status"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" />{t('Takrorlar ombor bilan solishtirilmoqda…')}</div>}
        {takrorXato && <div className="fz-note fz-note--warn" role="alert"><ShieldAlert size={16} aria-hidden="true" />
          <span className="flex-1">{t('Takrorlarni tekshirib bo‘lmadi — yozish to‘xtatildi.')}</span>
          <button type="button" className="fz-btn min-h-[48px] px-3" onClick={() => void takrorTekshir(kitob, generationRef.current)}>{t('Qayta tekshirish')}</button>
        </div>}
        {kitob.ogohlar.length > 0 && <div className="fz-note fz-note--warn" role="status"><ShieldAlert size={16} aria-hidden="true" />
          <div className="min-w-0 space-y-1">{kitob.ogohlar.map((kod, i) => <p className="m-0" key={`${kod}-${i}`}>{t(OGOH_MATN[kod])}</p>)}</div></div>}

        <YozishPaneli yozish={yozish} yoziladi={oldingiReja ? oldingiReja.jamiQator - yozilganSoni(oldingiReja) : yoziladigan.length}
          davom={oldingiReja != null} tayyor={yozishTayyor} tasdiqlanmagan={tasdiqlanmagan} yozishMumkin={yozishMumkin} kattaFayl={kattaFayl}
          onYoz={() => void tasdiqlabYoz()} onToxtat={() => { toxtatRef.current = true; }} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('Qator holati filtri')}>
            {filtrlar.map((f) => <button key={f.id} type="button" aria-pressed={filtr === f.id} onClick={() => { setFiltr(f.id); setSahifa(0); }} disabled={f.disabled}
              className={`min-h-[48px] rounded-md border px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${filtr === f.id ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'border-border bg-surface text-text-dim hover:bg-surface-2'}`}>
              {f.label}<span className="ml-1.5 tabular-nums">{f.soni}</span></button>)}
          </div>
          <label className="relative block min-w-0 sm:w-64">
            <Search size={15} className="absolute left-3 top-4 text-text-mute" aria-hidden="true" />
            <input aria-label={t('Qatorlarni qidirish')} value={qidiruv} onChange={(e) => { setQidiruv(e.target.value); setSahifa(0); }}
              placeholder={t('Nom, birlik yoki yetkazuvchi')} className="h-[48px] w-full rounded-md border border-[var(--border-strong)] bg-bg pl-9 pr-3 text-[13px] text-text outline-none focus:border-[var(--accent)]" />
          </label>
        </div>

        <div className="fz-table-wrap">
          <table className="fz-table w-full" aria-label={t('{varaq} varag‘idagi qatorlar', { varaq: kitob.varaq })}>
            <thead className="hidden md:table-header-group"><tr>
              <th>{t('Sana')}</th><th>{t('Nomi')}</th><th>{t('Birlik')}</th><th className="text-right">{t('Miqdor')}</th><th>{t('Yetkazuvchi')}</th><th>{t('Holat va izoh')}</th>
            </tr></thead>
            <tbody className="block md:table-row-group">
              {qatorlar.map((q) => {
                const izohlar = xatoMatnlari(q);
                const d = qoralamalar.get(q.manbaQator);
                const miqdor = q.miqdor == null ? (q.miqdorMatni || '—') : raqamFormatla(q.miqdor, { maximumFractionDigits: 6 });
                return <tr key={q.manbaQator} data-holat={q.holat}
                  className={`mb-2 grid grid-cols-2 overflow-hidden rounded-md border bg-surface md:mb-0 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:bg-transparent ${q.holat === 'xato' ? 'border-[var(--danger)] bg-[var(--danger-soft)] md:bg-[var(--danger-soft)]' : 'border-border'}`}>
                  <Maydon nom="Sana" qiymat={q.sana ?? '—'} className="text-text-dim" />
                  <Maydon nom="Nomi" qiymat={<span className="block break-words font-medium text-text">{q.nom || '—'}</span>} className="col-span-2 md:col-span-1" />
                  <Maydon nom="Birlik" qiymat={q.birlik || '—'} className="text-text-dim" />
                  <Maydon nom="Miqdor" qiymat={<span className="tabular-nums text-text">{miqdor}</span>} className="text-right md:text-left" />
                  <Maydon nom="Yetkazuvchi" qiymat={q.yetkazuvchi || '—'} className="col-span-2 break-words text-text-dim md:col-span-1" />
                  <td className="col-span-2 min-w-0 px-2 py-2 align-top md:table-cell md:px-3">
                    <HolatNishoni q={q} />
                    <span className="mt-1 block text-[11px] text-text-mute">{t('Manba: {qator}-qator', { qator: q.manbaQator })}</span>
                    {d && <span className={`mt-1 block text-[11px] ${qoralamaTasdiqlangan(d) ? 'text-ok' : 'text-warn'}`}>
                      {t(qoralamaTasdiqlangan(d) ? 'Kiritish tasdiqlandi — hali saqlanmagan.' : 'Tahrirlangan qoralama — tasdiqlash kerak.')}</span>}
                    {izohlar.length > 0 && <ul className="mb-0 mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-warn">{izohlar.map((s, i) => <li key={`${s}-${i}`}>{s}</li>)}</ul>}
                    {q.holat !== 'takror' && !ishlayapti && yozish.holat !== 'tugadi' && <button type="button" className="fz-btn mt-2 min-h-[48px] px-3" onClick={() => {
                      const draft = qoralamalar.get(q.manbaQator) ?? prixodQoralama(q);
                      if (!qoralamalar.has(q.manbaQator)) setQoralamalar((old) => new Map(old).set(q.manbaQator, draft));
                      setTahrirQatori(q.manbaQator);
                    }}>{t('Tahrirlash')}</button>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
          {qatorlar.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-text-mute">{t('Bu shartlarga mos qator topilmadi.')}</div>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-text-dim">{t('Ko‘rsatilmoqda {dan}–{gacha} / {jami}', {
            dan: mos.length ? String(joriy * SAHIFA_HAJMI + 1) : '0',
            gacha: String(Math.min((joriy + 1) * SAHIFA_HAJMI, mos.length)), jami: String(mos.length),
          })}</span>
          <div className="flex gap-2">
            <button type="button" className="fz-btn min-h-[48px] min-w-[48px] px-3" disabled={joriy <= 0} onClick={() => setSahifa((n) => Math.max(0, n - 1))} aria-label={t('Oldingi sahifa')}><ChevronLeft size={17} aria-hidden="true" />{t('Oldingi')}</button>
            <button type="button" className="fz-btn min-h-[48px] px-3" disabled={joriy + 1 >= sahifalar} onClick={() => setSahifa((n) => Math.min(sahifalar - 1, n + 1))} aria-label={t('Keyingi sahifa')}>{t('Keyingi')}<ChevronRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
        {faolQoralama && <PrixodQatorEditor kompaniyaId={kompaniyaId} qoralama={faolQoralama} takliflar={takliflar}
          onOzgar={(updated) => {
            setQoralamalar((old) => new Map(old).set(updated.manba.manbaQator, updated));
            if (qoralamaTasdiqlangan(updated)) setTahrirQatori(null);
          }} onYop={() => setTahrirQatori(null)} />}
      </>}

      {!kitob && !oqilmoqda && !xato && <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] px-4 py-6 text-center">
        <FileSpreadsheet size={24} className="mb-2 text-text-mute" aria-hidden="true" />
        <p className="m-0 text-[13px] font-medium text-text">{t('Excel faylini tanlab, qatorlarni tekshiring')}</p>
        <p className="mb-0 mt-1 text-[12px] text-text-mute">{t('Hali omborga yozilmagan.')}</p>
      </div>}
    </div>
  </section>;
}

function YozishPaneli({ yozish, yoziladi, davom, tayyor, tasdiqlanmagan, yozishMumkin, kattaFayl, onYoz, onToxtat }: {
  yozish: Yozish; yoziladi: number; davom: boolean; tayyor: boolean; tasdiqlanmagan: number; yozishMumkin: boolean; kattaFayl: boolean;
  onYoz: () => void; onToxtat: () => void;
}) {
  if (yozish.holat === 'tugadi') return <div className="fz-note fz-note--info" role="status"><Check size={16} className="text-ok" aria-hidden="true" />
    <span>{t('Yozildi: {yangi} ta yangi qator. Takror (o‘tkazib yuborildi): {takror}. Xato (yozilmadi): {xato}.', { yangi: son(yozish.yozildi), takror: son(yozish.takror), xato: son(yozish.xato) })}</span>
  </div>;
  const progress = yozish.holat === 'yozilmoqda' || yozish.holat === 'uzildi'
    ? <div className="space-y-1" aria-live="polite">
        <div className="text-[15px] font-semibold tabular-nums text-text">{son(yozish.yozildi)} / {son(yozish.jami)}</div>
        <div className="h-2 overflow-hidden rounded bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={yozish.jami} aria-valuenow={yozish.yozildi}>
          <div className="h-full bg-[var(--accent)]" style={{ width: `${yozish.jami ? Math.round((yozish.yozildi / yozish.jami) * 100) : 0}%` }} />
        </div>
      </div> : null;
  return <section className="space-y-2 rounded-md border border-border bg-surface-2 p-3" aria-label={t('Omborga yozish')}>
    {!yozishMumkin && <p className="m-0 text-[12px] text-warn">{t('Omborga yozish uchun «Hujjatlar bilan ishlash» huquqi kerak.')}</p>}
    {kattaFayl && <p className="m-0 text-[12px] text-danger">{t('Fayl 25 MB dan katta — serverda tekshirib bo‘lmaydi. Faylni kichraytiring.')}</p>}
    {tasdiqlanmagan > 0 && <p className="m-0 text-[12px] text-warn">{t('Tahrirlangan, lekin tasdiqlanmagan qatorlar yozilmaydi: {soni}', { soni: tasdiqlanmagan })}</p>}
    {progress}
    {yozish.holat === 'uzildi' && <p className="m-0 text-[12px] text-danger" role="alert">{yozish.xabar}</p>}
    {yozish.holat === 'yuklanmoqda' && <p className="m-0 flex items-center gap-2 text-[12px] text-text-dim"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" />{t('Asl fayl saqlanmoqda…')}</p>}
    {yozish.holat === 'yozilmoqda'
      ? <button type="button" className="fz-btn min-h-[56px] w-full justify-center text-[15px]" onClick={onToxtat}>{t('To‘xtatish')}</button>
      : <button type="button" className="fz-btn fz-btn--primary min-h-[56px] w-full justify-center text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!tayyor} onClick={onYoz}>
          <Upload size={18} aria-hidden="true" />
          {davom || yozish.holat === 'uzildi' ? t('Davom ettirish ({soni} qator qoldi)', { soni: son(yoziladi) }) : t('Tasdiqlab yozish ({soni} qator)', { soni: son(yoziladi) })}
        </button>}
  </section>;
}
