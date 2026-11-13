import { MoneyInput } from '../umumiy/ui/MoneyInput';
import { downloadBlob } from '../lib/construction-document-control/export/download-helper';
/**
 * TestAosr.tsx — Ijro hujjatlari: АОСР (ШНК 3.01.01-22 Прил.6) va laboratoriya.
 * ═══════════════════════════════════════════════════════════════════
 * 2026-08-27: birinchi reestr (T1 `45_Hujjatlar.js` dan). 2026-10-01 (egasi):
 * to'liq blank maydonlari, komissiya, Excel (egasining blanki tuzilmasida,
 * kompaniya logosi va kolontitul bilan), laboratoriya — alohida kompaniya
 * (kontragent, roli `laboratoriya`) protokollari, aktlarga bog'lash, invoys summalari.
 *
 * "Aktlar" varag'i:
 *   chap — bajarilgan (FAKT>0) ishlar: yashirin ish belgisi, akt bor/yo'q;
 *          belgilanganlardan yangi akt qoralamasi (ish tavsifi, materiallar);
 *   o'ng — akt reestri; tanlangan akt — to'liq forma + Excel.
 * "Laboratoriya" varag'i: protokollar ro'yxati, forma, aktlarga bog'lash, jami.
 * Qiymat yo'q bo'lsa — bo'sh qoladi (o'ylab topilmaydi); Excel'da to'ldirish chizig'i.
 */
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Layers, ClipboardList, Plus, Link2, Unlink, AlertTriangle, CheckCircle2, FileSpreadsheet, Save, FlaskConical, X, ShieldCheck, FileArchive } from 'lucide-react';
import { ArxivTugma } from '../components/arxiv/ArxivTugma';
import { sbAosrCoverageOl, sbAosrBekor, sbAosrBogSaqla, sbAosrBogOl, sbAosrBogHajmOl, sbQatorMetaOl, type AosrCoverage, type QatorMetaYozuv } from '../api/t2-aosr';
import {
  sbAosrV2Ol, sbAosrYozV2, sbLabProtokollarOl, sbLabProtokolYoz, sbLabProtokolBekor, sbLabProtokolBogSaqla,
  sbKompaniyaLogoOl, SINOV_TURI_NOM, SINOV_NATIJA_NOM,
  type AosrV2, type AosrMalumot, type AosrKomissiyaYozuv, type LabProtokol, type LabProtokolMalumot, type SinovTuri, type SinovNatija,
} from '../api/t2-ijro';
import { sbKontragentlarOl, sbKontragentSaqla, type Kontragent } from '../api/t2-kontragent';
import { sbT2ObyektlarOlKomp, yangiOperationId, type T2Obyekt } from '../api/supabase';
import { aosrExcel, aosrKitobExcel, aosrKitobFaylNomi, aosrFaylNomi, aosrKomissiyaTartibi, type AosrKirish } from '../lib/aosr-export';
import { hajmQatorlari, labIlovaQur, LAB_SOROV_TURI } from '../lib/aosr-ilova';
import { avtoQoralamami, bekorQilsaBoladigan, keyingiAosrRaqam } from '../lib/aosr-zanjir';
import { AosrZanjir } from './AosrZanjir';
import { qoralamaTanlangandan } from '../lib/aosr-qoralama';
import { aosrReestrXlsx, labReestrXlsx } from '../lib/ijro-reestr-export';
import { toast } from '../umumiy/ui/Toast';
import { hujjatTokenBilan, xlsxYacheykaSoni } from '../lib/token-hujjat';
import { narxHisob, tokenHolatOl } from '../api/t2-token';
import { useGlobalObyektId, usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { useKompaniya } from './KompaniyaTanlov';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import { aosrQoplama, protokolXulosa } from '../lib/aosr-korinish';
import { aosrTartibMeta, aosrTartibla, raqamTekshiruv, razdelXaritasi, yetishmayotganlar } from '../lib/ijro-tayyorla';
import { labYetishmaydi, LAB_TALAB_NOM, aktSifatMuammolari, aktDublikatlari, AKT_SIFAT_NOM } from '../lib/ijro-qoida';
import { zipSync } from 'fflate';
import { AosrYetishmaydi } from './AosrYetishmaydi';
import { AosrTaklif } from './AosrTaklif';
import { obyektZakazchikNomi } from '../lib/pto-markazi/obyekt-zakazchik';
import { obyektImzochiSaqla, type ImzochiRol } from '../api/obyekt-imzochi';
import { useSearchParams } from 'react-router-dom';
import { ZakazchigaYuborish } from '../admin/zakazchik/ZakazchigaYuborish';
import { HolatBelgi } from '../admin/zakazchik/tomon-ui';
import { taqdimlarOl, type TaqdimHolat } from '../api/t2-tomon';
import { aosrTaqdimHolatlari } from '../lib/aosr-yuborilgan';
import { AosrFotoBiriktir } from '../admin/nazorat/AosrFotoBiriktir';
import { AosrChizmaTanlash } from '../admin/loyihachi/AosrChizmaTanlash';
import { OpsKpi, OpsKpiQator, OpsTablar } from '../components/kompaniya-ops/OpsUi';
import { SinovSorovYubor, type SorovKontekst } from '../admin/laboratoriya/SinovSorovYubor';
import { SorovlarRoyxati } from '../admin/laboratoriya/SorovlarRoyxati';
import { aosrSinovHolatiOl, type AosrSinovHolati } from '../api/t2-lab-sorov';
import { aosrSinovMatni } from '../lib/laboratoriya/sinov-maslahat';
import { ZanjirChizigi } from '../admin/components/ZanjirChizigi';

const ROL_NOMI: Record<string, string> = {
  smo: 'Qurilish-montaj tashkiloti (СМО)', subpudratchi: 'Subpudratchi', bosh_pudratchi: 'Bosh pudratchi',
  texnadzor: 'Texnik nazorat (buyurtmachi)', loyihachi: 'Loyihachi (avtorlik nazorati)', boshqa: 'Boshqa',
};
const TUR_NOMI: Record<AosrV2['tur'], string> = { aosr: 'АОСР (yashirin ishlar)', oraliq_qabul: 'Oraliq qabul (mas’ul konstruksiyalar)', sinov: 'Sinov akti' };
const HOLAT_NOMI: Record<string, string> = { yangi: 'Qoralama', tasdiqlangan: 'Tasdiqlangan', qogoz: 'Qog‘ozda imzolangan', bekor: 'Bekor' };

const inp = 'w-full h-8 px-2 text-[13px]';
const inpKop = 'w-full px-2 py-1.5 text-[13px]';
const lbl = 'mb-0.5 block text-[11.5px] font-medium text-text-dim';
const HOLAT_STAMP: Record<string, string> = { yangi: 'fz-stamp--draft', tasdiqlangan: 'fz-stamp--ok', qogoz: 'fz-stamp--frozen', bekor: 'fz-stamp--danger' };
const NATIJA_STAMP: Record<string, string> = { mos: 'fz-stamp--ok', mos_emas: 'fz-stamp--danger', kutilmoqda: 'fz-stamp--warn' };

type AktForma = AosrMalumot & { id?: number; versiya?: number };

/** Ro'yxat belgisi: qoralama АОСР qarshi tomonga yuborilgan bo'lsa — «Qoralama» emas, taqdim holati (yuborilgan / qaror). */
function aktHolatBelgisi(holat: string, taqdim: TaqdimHolat | undefined) {
  if (holat === 'yangi' && taqdim) return <HolatBelgi holat={taqdim} turi="taqdim" />;
  return <span className={`fz-stamp ${HOLAT_STAMP[holat] ?? ''}`}>{t(HOLAT_NOMI[holat] ?? holat)}</span>;
}

export default function TestAosr() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  /* Obyekt: ?obyekt= (qadam chizig'i/boshqa sahifalardan) — birinchi obyektga o'zi tushmaydi (audit 47). */
  const [qidiruv, setQidiruv] = useSearchParams();
  const urlObyekt = Number(qidiruv.get('obyekt')) || null;
  const [varaq, setVaraq] = useState<'akt' | 'lab'>('akt');
  const [obyektlar, setObyektlar] = useState<T2Obyekt[]>([]);
  const [obyektId, setObyektId] = useGlobalObyektId(); // yagona yuqori tanlov (navigatsiya oqimi)
  const ws = usePTOWorkspace();
  const [aktlar, setAktlar] = useState<AosrV2[]>([]);
  const [coverage, setCoverage] = useState<AosrCoverage[]>([]);
  const [protokollar, setProtokollar] = useState<LabProtokol[]>([]);
  const [lablar, setLablar] = useState<Kontragent[]>([]);
  const [belgilangan, setBelgilangan] = useState<Set<number>>(new Set());
  const [forma, setForma] = useState<AktForma | null>(null);
  const [pForma, setPForma] = useState<(LabProtokolMalumot & { id?: number; versiya?: number; aosr_ids?: number[] }) | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [faqatAktsiz, setFaqatAktsiz] = useState(false);
  const [qatorMeta, setQatorMeta] = useState<QatorMetaYozuv[]>([]);
  const [bog, setBog] = useState<Map<number, number[]>>(new Map());
  const [bekorKorsat, setBekorKorsat] = useState(false);
  const [paketBand, setPaketBand] = useState(false);
  /** «Sanasiz chop etish» — akt/boshlanish/tugash sanalari bo'sh (egasi o'zi qo'yadi). */
  const [sanasiz, setSanasiz] = useState(false);
  /** Zanjirli qoralama paneli (belgilangan ishlardan bosqichlar zanjiri). */
  const [zanjirOchiq, setZanjirOchiq] = useState(false);
  /** Akt → qator → bog'langan hajm (ijro hajm hisobi ilovasi uchun). */
  const [bogHajm, setBogHajm] = useState<Map<number, Map<number, number | null>>>(new Map());
  /** Reestr/paket sarlavhasidagi «Заказчик» — obyekt shartnomasidan (bo'sh qoldirilmasin). */
  const [zakazchikNomi, setZakazchikNomi] = useState<string | null>(null);
  useEffect(() => {
    setZakazchikNomi(null);
    if (!kompaniyaId || !obyektId) return;
    let faol = true;
    void obyektZakazchikNomi(kompaniyaId, obyektId).then((n) => { if (faol) setZakazchikNomi(n); });
    return () => { faol = false; };
  }, [kompaniyaId, obyektId]);
  /* Sinov so'rovlari (laboratoriya): АОСР bo'yicha holat (bloklangan / kutilmoqda), so'rov formasi, ro'yxat yangilanishi. */
  const [sinovHolat, setSinovHolat] = useState<Map<number, AosrSinovHolati>>(new Map());
  /* Qarshi tomonga yuborilgan АОСР lar: ro'yxatda «Qoralama» o'rniga taqdim holati ko'rinadi. */
  const [yuborilgan, setYuborilgan] = useState<Map<number, TaqdimHolat>>(new Map());
  const [sorovKontekst, setSorovKontekst] = useState<SorovKontekst | null>(null);
  const [sorovYangila, setSorovYangila] = useState(0);

  useEffect(() => {
    if (!kompaniyaId) { setObyektlar([]); return; }
    sbT2ObyektlarOlKomp(kompaniyaId).then((r) => {
      const q = r.ok ? r.qatorlar ?? [] : [];
      setObyektlar(q);
      setObyektId((eski) => (eski && q.some((o) => o.id === eski) ? eski : urlObyekt && q.some((o) => o.id === urlObyekt) ? urlObyekt : q[0]?.id ?? null));
    });
    sbKontragentlarOl(kompaniyaId).then((r) => { setLablar((r.qatorlar ?? []).filter((k) => k.mavqe === 'laboratoriya')); setBoshqaKontragent((r.qatorlar ?? []).filter((k) => k.mavqe !== 'laboratoriya' && !!k.inn?.trim())); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kompaniyaId]);

  const yukla = () => {
    if (!obyektId || !kompaniyaId) return;
    setYuklanmoqda(true);
    Promise.all([sbAosrV2Ol(kompaniyaId, obyektId), sbAosrCoverageOl(obyektId), sbLabProtokollarOl(kompaniyaId, obyektId)]).then(([a, c, p]) => {
      setYuklanmoqda(false);
      const aq = a.ok ? a.qatorlar ?? [] : [];
      setAktlar(aq);
      setCoverage(c.ok ? c.qatorlar ?? [] : []);
      // Tartib uchun razdel ma'lumoti (olinmasa — faqat sana bo'yicha tartib).
      void Promise.all([sbQatorMetaOl(obyektId), sbAosrBogOl(kompaniyaId, aq.map((x) => x.id)), sbAosrBogHajmOl(kompaniyaId, aq.map((x) => x.id))]).then(([m, b, h]) => { setQatorMeta(m); setBog(b); setBogHajm(h); });
      setProtokollar(p.ok ? p.qatorlar ?? [] : []);
      void aosrSinovHolatiOl(kompaniyaId, obyektId).then((s) => setSinovHolat(new Map((s.ok ? s.natija : []).map((x) => [x.aosr_id, x] as const))));
      setBelgilangan(new Set());
      void taqdimlarOl(kompaniyaId, { yonalish: 'yuborilgan' }).then((q) => setYuborilgan(aosrTaqdimHolatlari(q.ok ? q.natija : [])));
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukla(); setForma(null); setPForma(null); }, [obyektId, kompaniyaId]);

  const faolAktlar = aktlar.filter((a) => a.holat !== 'bekor');
  /* Reestr tartibi (bir xil hamma joyda): razdel tartibi → ish sanasi → raqam; laboratoriya talabi kalit so'z qoidasidan. */
  const rz = useMemo(() => razdelXaritasi(qatorMeta), [qatorMeta]);
  const tartibMeta = useMemo(() => new Map(aktlar.map((a) => [a.id, aosrTartibMeta(a, bog.get(a.id) ?? [], rz)] as const)), [aktlar, bog, rz]);
  const labYoq = useMemo(() => new Map(aktlar.map((a) => [a.id, labYetishmaydi(a, protokollar.filter((p) => p.aosr_ids?.includes(a.id)).map((p) => p.sinov_turi))] as const)), [aktlar, protokollar]);
  const tartiblangan = useMemo(() => aosrTartibla(aktlar.filter((a) => bekorKorsat || a.holat !== 'bekor'), tartibMeta), [aktlar, tartibMeta, bekorKorsat]);
  const raqamHolati = useMemo(() => raqamTekshiruv(faolAktlar), [aktlar]); // eslint-disable-line react-hooks/exhaustive-deps
  const sifat = useMemo(() => new Map(aktlar.map((a) => [a.id, aktSifatMuammolari(a)] as const)), [aktlar]);
  const dublikat = useMemo(() => new Set(aktDublikatlari(aktlar)), [aktlar]);
  const tartibNomi = useMemo(() => { const m = new Map<number, number>(); let n = 0; for (const a of tartiblangan) if (a.holat !== 'bekor') m.set(a.id, ++n); return m; }, [tartiblangan]);
  const reestrTartib = useMemo(() => new Map([...tartibMeta].map(([id, m]) => [id, { ...m, labYetishmaydi: labYoq.get(id) ?? [] }] as const)), [tartibMeta, labYoq]);
  const guruhlar = useMemo(() => yetishmayotganlar(coverage, qatorMeta), [coverage, qatorMeta]);
  const yashirinAktsiz = coverage.filter((c) => c.yashirin && !c.akt_bor).length;
  const korinadiganIshlar = faqatAktsiz ? coverage.filter((c) => !c.akt_bor) : coverage;

  /** Imzochilar (t2_obyekt_imzochi) bo'sh bo'lsa — shu formada bir marta kiritiladi. */
  const [imzochiForma, setImzochiForma] = useState<{ rol: ImzochiRol; fio: string; lavozim: string }>({ rol: 'texnadzor', fio: '', lavozim: '' });
  const imzochiniSaqla = async () => {
    if (!kompaniyaId || !obyektId) return;
    if (!imzochiForma.fio.trim()) { toast(t('F.I.Sh. ni kiriting'), 'warn'); return; }
    const r = await obyektImzochiSaqla(kompaniyaId, obyektId, imzochiForma.rol, 'obyekt', null, { fio: imzochiForma.fio.trim(), lavozim: imzochiForma.lavozim.trim() || null });
    if (!r.ok) { toast(r.error || t('Xato'), 'danger'); return; }
    // Formadagi mos bo'sh komissiya a'zosiga ham qo'yiladi (shu akt uchun darhol ko'rinsin).
    setForma((x) => (x ? { ...x, komissiya: (x.komissiya ?? []).map((k) => (k.rol === imzochiForma.rol && !String(k.fio ?? '').trim() ? { ...k, fio: imzochiForma.fio.trim(), lavozim: k.lavozim || imzochiForma.lavozim.trim() || undefined } : k)) } : x));
    toast(t('✓ Imzochi obyekt uchun saqlandi'), 'ok');
  };

  /** Oxirgi aktning komissiyasi — yangi akt uchun sukut (har safar qayta yozmaslik uchun). */
  const oxirgiKomissiya = (): AosrKomissiyaYozuv[] => {
    const a = faolAktlar.find((x) => Array.isArray(x.komissiya) && x.komissiya.length);
    return a ? a.komissiya.map((k) => ({ ...k })) : aosrKomissiyaTartibi('subpudratchisiz', []).map((k) => ({ rol: String(k.rol) }));
  };
  const keyingiRaqam = () => String(keyingiAosrRaqam(aktlar));

  const yangiAkt = (tanlanganlardan: boolean) => {
    const q = tanlanganlardan ? coverage.filter((c) => belgilangan.has(c.qator_id)) : [];
    const oxirgi = faolAktlar[0];
    setForma(({
      tur: 'aosr', raqam: keyingiRaqam(), sana: new Date().toISOString().slice(0, 10), blank_varianti: oxirgi?.blank_varianti ?? 'subpudratchisiz',
      loyiha_tashkiloti: oxirgi?.loyiha_tashkiloti ?? '', chetlanishlar: 'Нет', komissiya: oxirgiKomissiya(),
      ...(q.length ? qoralamaTanlangandan(q) : {}),
    }));
  };

  /* Forma ochilganda ko'rinishga suriladi (audit 74: forma sahifa pastida ochilib, foydalanuvchi ko'rmasdi). */
  const formaOchiq = forma !== null;
  useEffect(() => { if (formaOchiq) document.getElementById('aosr-akt-forma')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, [formaOchiq]);

  const saqla = async () => {
    if (!forma || !obyektId || !kompaniyaId) return;
    if (!String(forma.ish_nomi ?? '').trim()) { toast(t('Ish nomini kiriting'), 'warn'); return; }
    setSaqlanmoqda(true);
    const { id, versiya, ...malumot } = forma;
    // «Tasdiqlangan» — qarshi tomon qarori natijasi: muallif yubormaydi (server ham rad etadi).
    if (malumot.holat === 'tasdiqlangan') delete malumot.holat;
    const r = await sbAosrYozV2({ kompaniyaId, obyektId, malumot, id, kutilganVersiya: versiya, operationId: id ? undefined : yangiOperationId() });
    setSaqlanmoqda(false);
    if (!r.ok) { toast(r.sabab === 'versiya' ? t('Akt boshqa joyda o‘zgargan — qayta yuklang') : r.error || t('Xato'), 'danger'); return; }
    // Yangi akt belgilangan ishlardan yaratilgan bo'lsa — ularni darhol bog'laymiz.
    if (!id && r.id && belgilangan.size) await sbAosrBogSaqla([r.id], Array.from(belgilangan));
    toast(t('✓ Akt saqlandi'), 'ok');
    setForma(null);
    yukla();
  };

  /** Akt → eksport kirishi: blank maydonlari + ilovalar (ijro hajm hisobi, laboratoriya/sertifikat ro'yxati). */
  const aktKirish = (a: AosrV2, logo: Awaited<ReturnType<typeof sbKompaniyaLogoOl>>): AosrKirish => {
    const qIds = bog.get(a.id) ?? [];
    const ishlar = qIds.map((id) => coverage.find((c) => c.qator_id === id)).filter((c): c is AosrCoverage => !!c);
    const ilova = {
      hajm: hajmQatorlari(ishlar, bogHajm.get(a.id) ?? null, ishlar.map((c) => c.qator_id)),
      lab: labIlovaQur(a, ishlar),
    };
    return {
    ilova,
    tur: a.tur, raqam: a.raqam, sana: a.sana, ishNomi: a.ish_nomi, obyektNomi: a.obyekt,
    ishTavsifi: a.ish_tavsifi, smoNomi: joriy?.nom ?? null, loyihaTashkiloti: a.loyiha_tashkiloti,
    loyihaHujjati: a.loyiha_hujjati, materiallar: a.materiallar, chetlanishlar: a.chetlanishlar,
    boshlanishSana: a.boshlanish_sana, tugashSana: a.tugash_sana, keyingiIshlar: a.keyingi_ishlar,
    blankVarianti: a.blank_varianti, komissiya: a.komissiya ?? [],
    protokollar: protokollar.filter((p) => p.aosr_ids?.includes(a.id)).map((p) => ({
      raqam: p.raqam, sana: p.sana, laboratoriya: p.laboratoriya, sinovTuri: p.sinov_turi, natija: p.natija,
    })),
    logo: logo ? { base64: logo.data_b64, ext: logo.mime === 'image/png' ? 'png' : 'jpeg' } : null,
    };
  };
  const aktBaytlari = (a: AosrV2, logo: Awaited<ReturnType<typeof sbKompaniyaLogoOl>>) => aosrExcel(aktKirish(a, logo), { sanasiz });

  /** «Pechat kitobi»: hamma faol aktlar (razdel tartibida) bitta xlsx da — har akt alohida varaq + ilovalari. Avto-qoralamalar kirmaydi. */
  const pechatKitobi = async () => {
    if (!kompaniyaId || !obyektId) { toast(t('Kompaniyani tanlang'), 'warn'); return; }
    const royxat = tartiblangan.filter((a) => a.holat !== 'bekor' && !avtoQoralamami(a));
    if (!royxat.length) { toast(t('Kitob uchun akt yo‘q'), 'warn'); return; }
    setPaketBand(true);
    try {
      const logo = await sbKompaniyaLogoOl(kompaniyaId);
      const bytes = await aosrKitobExcel(royxat.map((a) => aktKirish(a, logo)), { sanasiz });
      const obyektNomi = obyektlar.find((o) => o.id === obyektId)?.nom ?? 'Объект';
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'AOSR', sabab: `Печатная книга АОСР · ${obyektNomi} · ${royxat.length} акт`, obyekt: obyektId }, () => {
        downloadBlob(bytes, aosrKitobFaylNomi(obyektNomi, royxat.length, sanasiz ? null : new Date().toISOString().slice(0, 10)));
      });
      if (!tk.ok) toast(tk.xabar, 'danger'); else if (tk.xabar) toast(tk.xabar, 'ok');
      else toast(t('✓ Pechat kitobi tayyor: {n} akt', { n: royxat.length }), 'ok');
    } catch (e) {
      toast(t('Kitob yasalmadi: {x}', { x: e instanceof Error ? e.message : String(e) }), 'danger');
    } finally { setPaketBand(false); }
  };

  /** Tizim o'zi yasagan (avto) qoralamalar: qarshi tomonga yuborilmagan, protokolsiz — bekor qilinadi (o'chirilmaydi, tarixda qoladi). */
  const avtoIdlar = useMemo(() => bekorQilsaBoladigan(aktlar, new Set(yuborilgan.keys())), [aktlar, yuborilgan]);
  const avtoBekor = async () => {
    if (!avtoIdlar.length) return;
    if (!(await tasdiqSora({ sarlavha: t('Avto-qoralamalarni bekor qilish'), matn: t('Tizim avtomatik yasagan {n} ta qoralama bekor qilinsinmi? (o‘chirilmaydi, tarixda qoladi; yuborilgan va protokolli aktlarga tegilmaydi)', { n: avtoIdlar.length }), tasdiqMatni: t('Bekor qilish'), xavfli: true }))) return;
    let ok = 0; let xato = '';
    for (const id of avtoIdlar) {
      const a = aktlar.find((x) => x.id === id);
      const r = await sbAosrBekor(id, a?.versiya);
      if (r.ok) ok++; else { xato = r.error || t('Xato'); break; }
    }
    if (ok) toast(t('✓ {n} ta avto-qoralama bekor qilindi', { n: ok }), 'ok');
    if (xato) toast(xato, 'danger');
    yukla();
  };

  const excel = async (a: AosrV2) => {
    try {
      const logo = kompaniyaId ? await sbKompaniyaLogoOl(kompaniyaId) : null;
      const bytes = await aktBaytlari(a, logo);
      if (!kompaniyaId) { toast(t('Kompaniyani tanlang'), 'warn'); return; }
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: 'AOSR', sabab: `АОСР № ${a.raqam ?? ''} · ${a.obyekt ?? ''}` }, () => {
        downloadBlob(bytes, aosrFaylNomi(a.obyekt, a.raqam, a.sana)); // tizim imzosi shu yo'lda qo'yiladi
      });
      if (!tk.ok) toast(tk.xabar, 'danger'); else if (tk.xabar) toast(tk.xabar, 'ok');
    } catch (e) {
      toast(t('Excel yasalmadi: {x}', { x: e instanceof Error ? e.message : String(e) }), 'danger');
    }
  };

  /** Reestr Excel (РЕЕСТР АОСР / РЕЕСТР ПРОТОКОЛОВ) — joriy obyekt bo'yicha. */
  const reestr = async (tur: 'aosr' | 'lab') => {
    try {
      if (!kompaniyaId) { toast(t('Kompaniyani tanlang'), 'warn'); return; }
      const obyektNomi = obyektlar.find((o) => o.id === obyektId)?.nom ?? 'Объект';
      const imzo = { pudratchi: joriy?.nom, zakazchik: zakazchikNomi ?? undefined };
      const { bytes, faylNomi } = tur === 'aosr' ? aosrReestrXlsx(aktlar, { obyektNomi, imzo, tartib: reestrTartib }) : labReestrXlsx(protokollar, { obyektNomi, imzo });
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes, hujjat: tur === 'aosr' ? 'REESTR_AOSR' : 'REESTR_LAB', sabab: `${tur === 'aosr' ? 'Реестр АОСР' : 'Реестр протоколов'} · ${obyektNomi}`, obyekt: obyektId }, () => {
        downloadBlob(bytes, faylNomi);
      });
      if (!tk.ok) toast(tk.xabar, 'danger'); else if (tk.xabar) toast(tk.xabar, 'ok');
    } catch (e) {
      toast(t('Reestr yasalmadi: {x}', { x: e instanceof Error ? e.message : String(e) }), 'danger');
    }
  };

  /** Butun obyekt ijro paketi (bitta ZIP): reestr (tartib bilan) + hamma АОСР + protokollar reestri. Mavjud eksportchilar; har fayl o'z yo'lida token oladi. */
  const paket = async () => {
    if (!kompaniyaId || !obyektId) { toast(t('Kompaniyani tanlang'), 'warn'); return; }
    if (!tartiblangan.some((a) => a.holat !== 'bekor')) { toast(t('Paket uchun akt yo‘q'), 'warn'); return; }
    setPaketBand(true);
    try {
      const obyektNomi = obyektlar.find((o) => o.id === obyektId)?.nom ?? 'Объект';
      const imzo = { pudratchi: joriy?.nom, zakazchik: zakazchikNomi ?? undefined };
      const logo = await sbKompaniyaLogoOl(kompaniyaId);
      const fayllar: Record<string, Uint8Array> = {};
      const sana = new Date().toISOString().slice(0, 10);
      /* Paket: fayllar avval TO'PLANADI (token yechilmaydi); narx tasdiqdan OLDIN ko'rsatiladi; oxirida BITTA paket sifatida
       * bir marta yechiladi (audit 93: 32 ta alohida yechim). O'zgarmagan paketni qayta yuklash — bepul (mazmun xeshi). */
      const qosh = (bytes: Uint8Array, nom: string) => { fayllar[nom] = bytes; };
      const r = aosrReestrXlsx(aktlar, { obyektNomi, imzo, tartib: reestrTartib });
      qosh(r.bytes, `00_${r.faylNomi}`);
      if (protokollar.length) {
        const l = labReestrXlsx(protokollar, { obyektNomi, imzo });
        qosh(l.bytes, `00_${l.faylNomi}`);
      }
      let no = 0;
      for (const a of tartiblangan.filter((x) => x.holat !== 'bekor' && !avtoQoralamami(x))) {
        no++;
        qosh(await aktBaytlari(a, logo), `${String(no).padStart(3, '0')}_${aosrFaylNomi(a.obyekt, a.raqam, a.sana)}`);
      }
      const zip = zipSync(fayllar, { level: 6 });
      const fayllarSoni = Object.keys(fayllar).length;
      const fayllarYacheyka = Object.values(fayllar).map((b) => xlsxYacheykaSoni(b));
      const holat = await tokenHolatOl(kompaniyaId);
      const narxQoidasi = holat.ok ? holat.natija.narxlar.find((n) => n.amal === 'hujjat') : undefined;
      /* Paket narxi = har fayl narxining yig'indisi (server 	2_token_hisobla_paket_v1 bilan bir xil); yashirin chegirma yo'q. */
      const hisoblar = holat.ok ? fayllarYacheyka.map((c) => narxHisob(narxQoidasi, c, holat.natija.sozlama)) : [];
      const narx = hisoblar.length && hisoblar.every((x) => x != null) ? { token: hisoblar.reduce((s, x) => s + (x?.token ?? 0), 0), yakuniy_som: hisoblar.reduce((s, x) => s + (x?.yakuniy_som ?? 0), 0) } : null;
      if (narx && !(await tasdiqSora({ sarlavha: t('Ijro paketi'), matn: t('{n} fayl, bitta paket: {tk} token (≈ {som} so‘m). Avval to‘langan o‘zgarmagan paketni qayta yuklash bepul. Davom etasizmi?', { n: fayllarSoni, tk: narx.token, som: Math.round(narx.yakuniy_som).toLocaleString('ru-RU') }), tasdiqMatni: t('Yuklab olish') }))) return;
      const tk = await hujjatTokenBilan({ kompaniyaId, bytes: zip, hujjat: 'AOSR_PAKET', sabab: `Ijro paketi · ${obyektNomi} · ${fayllarSoni} fayl`, obyekt: obyektId, fayllar: fayllarYacheyka },
        () => downloadBlob(zip, `${obyektNomi.replace(/[\\/:*?"<>|]+/g, '_')}_ИСПОЛНИТЕЛЬНАЯ_ДОКУМЕНТАЦИЯ_${sana}.zip`, 'application/zip'));
      if (!tk.ok) { toast(tk.xabar, 'danger'); return; }
      if (tk.xabar) toast(tk.xabar, 'ok');
      toast(t('✓ Ijro paketi tayyor: {n} fayl', { n: fayllarSoni }), 'ok');
    } catch (e) {
      toast(t('Paket yasalmadi: {x}', { x: e instanceof Error ? e.message : String(e) }), 'danger');
    } finally { setPaketBand(false); }
  };

  const ulash = async () => {
    if (!forma?.id || belgilangan.size === 0) { toast(t('Aktni oching va kamida bitta ish belgilang'), 'warn'); return; }
    const r = await sbAosrBogSaqla([forma.id], Array.from(belgilangan));
    if (r.ok) { toast(t('✓ {n} ta ish ulandi', { n: r.yangi_boglanish ?? 0 }), 'ok'); yukla(); }
    else toast(r.error || t('Xato'), 'danger');
  };

  const bekorQil = async (a: AosrV2) => {
    if (!(await tasdiqSora({ sarlavha: t('Aktni bekor qilish'), matn: t('Akt № {r} bekor qilinsinmi? (o‘chirilmaydi, tarixda qoladi)', { r: a.raqam ?? '' }), tasdiqMatni: t('Bekor qilish'), xavfli: true }))) return;
    const r = await sbAosrBekor(a.id, a.versiya);
    if (r.ok) { toast(t('Akt bekor qilindi'), 'ok'); setForma(null); yukla(); }
    else toast(r.error || t('Xato'), 'danger');
  };

  /* ── Laboratoriya ── */
  /** Laboratoriya kontragentini shu yerning o'zida qo'shish (Logistika → Kontragentlar ga bormasdan). */
  const [yangiLab, setYangiLab] = useState({ nom: '', inn: '' });
  /** Mavjud kontragent (STIR bor) — laboratoriya roli berish uchun (upsert STIR bo'yicha, dublikat yaratilmaydi). */
  const [boshqaKontragent, setBoshqaKontragent] = useState<Kontragent[]>([]);
  const [tanlanganKontragent, setTanlanganKontragent] = useState('');
  const kontragentniLabQil = async () => {
    const k = boshqaKontragent.find((x) => String(x.id) === tanlanganKontragent);
    if (!k || !kompaniyaId) return;
    if (!(await tasdiqSora({ sarlavha: t('Laboratoriya roli'), matn: t('«{nom}» kontragentining roli «laboratoriya» ga o‘zgaradi. Davom etasizmi?', { nom: k.nom }), tasdiqMatni: t('Ha, laboratoriya qilish') }))) return;
    const r = await sbKontragentSaqla({ kompaniyaId, inn: k.inn ?? undefined, nom: k.nom, rahbar: k.rahbar ?? undefined, manzil: k.manzil ?? undefined, mfo: k.mfo ?? undefined, hisobRaqam: k.hisob_raqam ?? undefined, qqsTolovchi: k.qqs_tolovchi ?? undefined, mavqe: 'laboratoriya' });
    if (!r.ok) { toast(r.error || t('Xato'), 'danger'); return; }
    const q = await sbKontragentlarOl(kompaniyaId);
    const royxat = (q.qatorlar ?? []).filter((x) => x.mavqe === 'laboratoriya');
    setLablar(royxat);
    setBoshqaKontragent((q.qatorlar ?? []).filter((x) => x.mavqe !== 'laboratoriya' && !!x.inn?.trim()));
    const yangi = royxat.find((x) => x.inn === k.inn);
    if (yangi) setPForma((x) => (x ? { ...x, laboratoriya_id: yangi.id } : x));
    setTanlanganKontragent('');
    toast(t('✓ Laboratoriya tanlandi'), 'ok');
  };
  const labQosh = async () => {
    if (!kompaniyaId || !yangiLab.nom.trim()) { toast(t('Laboratoriya nomini kiriting'), 'warn'); return; }
    const r = await sbKontragentSaqla({ kompaniyaId, nom: yangiLab.nom.trim(), inn: yangiLab.inn.trim() || undefined, mavqe: 'laboratoriya' });
    if (!r.ok) { toast(r.error || t('Xato'), 'danger'); return; }
    const q = await sbKontragentlarOl(kompaniyaId);
    const royxat = (q.qatorlar ?? []).filter((k) => k.mavqe === 'laboratoriya');
    setLablar(royxat);
    const yangi = royxat.find((k) => k.nom === yangiLab.nom.trim());
    if (yangi) setPForma((x) => (x ? { ...x, laboratoriya_id: yangi.id } : x));
    setYangiLab({ nom: '', inn: '' });
    toast(t('✓ Laboratoriya qo‘shildi'), 'ok');
  };
  /** Aktga ilova belgilanganda bo'sh maydonlar aktdan/bog'langan ishdan to'ldiriladi (mavjud qiymat bosilmaydi). */
  const aktdanToldir = (a: AosrV2) => setPForma((x) => {
    if (!x) return x;
    const ish = (bog.get(a.id) ?? []).map((id) => coverage.find((c) => c.qator_id === id)).find((c) => c && Number(c.fakt_hajm) > 0);
    return {
      ...x,
      konstruksiya: x.konstruksiya?.trim() ? x.konstruksiya : a.ish_nomi ?? x.konstruksiya,
      hajm: x.hajm == null || String(x.hajm) === '' ? (ish ? (String(ish.fakt_hajm) as unknown as number) : x.hajm) : x.hajm,
      birlik: x.birlik?.trim() ? x.birlik : ish?.birlik ?? x.birlik,
    };
  });  const pSaqla = async () => {
    if (!pForma || !obyektId || !kompaniyaId) return;
    if (!String(pForma.raqam ?? '').trim()) { toast(t('Protokol raqamini kiriting'), 'warn'); return; }
    setSaqlanmoqda(true);
    const { id, versiya, aosr_ids, ...malumot } = pForma;
    const r = await sbLabProtokolYoz({ kompaniyaId, obyektId, malumot, id, kutilganVersiya: versiya, operationId: id ? undefined : yangiOperationId() });
    if (r.ok && r.id) {
      const eski = protokollar.find((p) => p.id === r.id);
      const b = await sbLabProtokolBogSaqla(kompaniyaId, r.id, aosr_ids ?? [], eski?.qator_ids ?? []);
      if (!b.ok) toast(t('Protokol saqlandi, lekin aktlarga bog‘lanmadi: {x}', { x: b.error || '' }), 'warn');
    }
    setSaqlanmoqda(false);
    if (!r.ok) { toast(r.sabab === 'versiya' ? t('Protokol boshqa joyda o‘zgargan — qayta yuklang') : r.error || t('Xato'), 'danger'); return; }
    toast(t('✓ Protokol saqlandi'), 'ok');
    setPForma(null);
    yukla();
  };
  const pBekor = async (p: LabProtokol) => {
    if (!kompaniyaId) return;
    if (!(await tasdiqSora({ sarlavha: t('Protokolni bekor qilish'), matn: t('Protokol № {r} bekor qilinsinmi?', { r: p.raqam }), tasdiqMatni: t('Bekor qilish'), xavfli: true }))) return;
    const r = await sbLabProtokolBekor(kompaniyaId, p.id, p.versiya);
    if (r.ok) { toast(t('Protokol bekor qilindi'), 'ok'); setPForma(null); yukla(); } else toast(r.error || t('Xato'), 'danger');
  };
  const labJami = useMemo(() => {
    const m = new Map<string, { soni: number; summa: number | null; nomalum: number; mosEmas: number }>();
    for (const p of protokollar) {
      const k = p.laboratoriya ?? t('— laboratoriya ko‘rsatilmagan —');
      const x = m.get(k) ?? { soni: 0, summa: 0, nomalum: 0, mosEmas: 0 };
      x.soni++;
      if (p.summa == null) x.nomalum++; else x.summa = (x.summa ?? 0) + Number(p.summa);
      if (p.natija === 'mos_emas') x.mosEmas++;
      m.set(k, x);
    }
    return [...m.entries()];
  }, [protokollar]);

  const qoplama = useMemo(() => aosrQoplama(coverage), [coverage]);
  const labX = useMemo(() => protokolXulosa(protokollar), [protokollar]);
  const f = (k: keyof AktForma) => (e: { target: { value: string } }) => setForma((x) => (x ? { ...x, [k]: e.target.value } : x));
  const pf = (k: keyof LabProtokolMalumot) => (e: { target: { value: string } }) => setPForma((x) => (x ? { ...x, [k]: e.target.value } : x));

  const pul2 = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2 });
  const foiz = (u: number | null) => (u == null ? '—' : `${Math.round(u * 100)}%`);

  return (
    <Sahifa
      sarlavha="Yashirin ishlar akti (АОСР)"
      tavsif="Yashirin ishlar dalolatnomasi (АОСР) bajarilgan har yashirin ishni qoplashi kerak; laboratoriya protokollari aktlarga ilova qilinadi."
      amallar={ws.isProvider ? undefined : <label className="inline-flex items-center gap-1.5 text-[12px] text-text-dim">{t('Obyekt')}
        <select aria-label={t('Obyekt')} className="h-8 max-w-xs px-2 text-[13px]" value={obyektId ?? ''} onChange={(e) => { const id = Number(e.target.value); setObyektId(id); setQidiruv((p) => { const x = new URLSearchParams(p); x.set('obyekt', String(id)); return x; }, { replace: true }); }}>
          {obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
        </select></label>}
    >
      <div className="flex flex-col gap-3">
        {obyektId ? <ZanjirChizigi joriy="aosr" obyektId={obyektId} aosr={coverage.length > 0 ? { yashirin: qoplama.yashirinJami, aktsiz: qoplama.yashirinAktsiz } : null} /> : null}
        <OpsKpiQator yorliq={t('Ijro hujjatlari ko‘rsatkichlari')}>
          <OpsKpi nom={t('Yashirin ishlar qoplamasi')} rang={qoplama.yashirinAktsiz ? 'var(--warn)' : 'var(--ok)'}
            qiymat={<span className={qoplama.yashirinAktsiz ? 'text-warn' : ''}>{foiz(qoplama.yashirinUlush)}</span>}
            ost={<span className="flex flex-col gap-1">
              <span className={`fz-meter ${qoplama.yashirinAktsiz ? 'fz-meter--over' : ''}`} data-testid="aosr-qoplama" title={t('{a} / {j} yashirin ish АОСР bilan', { a: qoplama.yashirinAktli, j: qoplama.yashirinJami })}>
                <span className="fz-meter__t"><i className="fz-meter__shu" style={{ width: `${(qoplama.yashirinUlush ?? 0) * 100}%`, background: qoplama.yashirinAktsiz ? 'var(--warn)' : 'var(--ok)' }} /></span>
              </span>
              <span>{qoplama.yashirinJami ? t('{a} / {j} yashirin ish АОСР bilan', { a: qoplama.yashirinAktli, j: qoplama.yashirinJami }) : t('yashirin ish belgilanmagan')}</span>
            </span>} />
          <OpsKpi nom={t('Aktsiz yashirin ish')} rang="var(--danger)" qiymat={<span className={qoplama.yashirinAktsiz ? 'text-danger' : ''}>{qoplama.yashirinAktsiz}</span>} ost={t('F2 bloklanmaydi — ogohlantirish')} />
          <OpsKpi nom={t('Faol aktlar')} qiymat={faolAktlar.length} ost={t('{n} tasi tasdiqlangan yoki imzolangan', { n: faolAktlar.filter((a) => a.holat === 'tasdiqlangan' || a.holat === 'qogoz').length })} />
          <OpsKpi nom={t('Laboratoriya protokollari')} rang={labX.mosEmas ? 'var(--danger)' : 'var(--ok)'} qiymat={protokollar.length}
            ost={t('mos: {m} · mos emas: {e} · kutilmoqda: {k}', { m: labX.mos, e: labX.mosEmas, k: labX.kutilmoqda })} />
        </OpsKpiQator>

        <OpsTablar<'akt' | 'lab'> yorliq={t('Ijro hujjatlari bo‘limlari')} joriy={varaq} onTanla={setVaraq} tablar={[
          { id: 'akt', nom: t('Aktlar (АОСР)'), ikon: <ClipboardList />, soni: faolAktlar.length },
          { id: 'lab', nom: t('Laboratoriya'), ikon: <FlaskConical />, soni: protokollar.length },
        ]} />

        {varaq === 'akt' && !yuklanmoqda && kompaniyaId && obyektId && (
          <AosrYetishmaydi kompaniyaId={kompaniyaId} obyektId={obyektId} guruhlar={guruhlar} aktlar={aktlar} onTayyor={yukla} />
        )}
        {varaq === 'akt' && !yuklanmoqda && (
          <AosrTaklif aktlar={aktlar} qatorMeta={qatorMeta} coverage={coverage} onTayyor={yukla} kompaniyaId={kompaniyaId ?? undefined} />
        )}
        {varaq === 'akt' && zanjirOchiq && kompaniyaId && obyektId && (
          <AosrZanjir kompaniyaId={kompaniyaId} obyektId={obyektId} coverage={coverage} qatorMeta={qatorMeta} tanlangan={belgilangan} aktlar={aktlar}
            onYopish={() => setZanjirOchiq(false)} onTayyor={() => { setZanjirOchiq(false); yukla(); }} />
        )}
        {yashirinAktsiz > 0 && varaq === 'akt' && (
          <p className="text-[11.5px] text-text-mute">{t('F2 bloklanmaydi — АОСР yo‘qligi faqat ogohlantirish.')}</p>
        )}

        {yuklanmoqda ? <div className="skel h-48 rounded-xl" /> : varaq === 'akt' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* CHAP: bajarilgan ishlar */}
            <section className="fz-card" aria-label={t('Bajarilgan ishlar')}>
              <div className="fz-card__head">
                <div><h2 className="fz-card__title">{t('Bajarilgan ishlar')}</h2><p className="fz-card__sub">{t('Belgilang → akt yarating yoki ochiq aktga ulang')}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-[12px] text-text-dim"><input type="checkbox" checked={faqatAktsiz} onChange={(e) => setFaqatAktsiz(e.target.checked)} /> {t('faqat aktsiz')}</label>
                  <button type="button" onClick={() => yangiAkt(true)} disabled={belgilangan.size === 0} className="fz-btn fz-btn--sm fz-btn--primary"><Plus /> {t('Belgilanganlardan akt ({n})', { n: belgilangan.size })}</button>
                  <button type="button" onClick={() => void ulash()} disabled={!forma?.id || belgilangan.size === 0} className="fz-btn fz-btn--sm" title={t('Ochiq aktga ulash')}><Link2 /> {t('Ochiq aktga ulash')}</button>
                  <button type="button" onClick={() => setZanjirOchiq(true)} disabled={belgilangan.size === 0} className="fz-btn fz-btn--sm" data-testid="aosr-zanjir-tugma"
                    title={t('Tanlangan ishning yashiriladigan bosqichlari bo‘yicha АОСР qoralamalari (zamin → … → qoplama asosi)')}><Layers /> {t('Zanjirli qoralama')}</button>
                </div>
              </div>
              <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {korinadiganIshlar.length === 0 && <div className="p-4 text-center text-[13px] text-text-mute">{t('Bajarilgan ish topilmadi')}</div>}
                {korinadiganIshlar.map((c) => (
                  <label key={c.qator_id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
                    style={c.yashirin && !c.akt_bor ? { boxShadow: 'inset 3px 0 0 var(--warn)' } : undefined}>
                    <input type="checkbox" checked={belgilangan.has(c.qator_id)} onChange={() => setBelgilangan((s) => { const n = new Set(s); if (n.has(c.qator_id)) n.delete(c.qator_id); else n.add(c.qator_id); return n; })} className="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-text" title={c.nom ?? ''}>{c.nom}</div>
                      <div className="text-[11.5px] text-text-mute">{c.kod} · {c.kat} · {c.fakt_hajm} {c.birlik}</div>
                    </div>
                    {c.yashirin && <span className="fz-chip fz-chip--warn" title={t('Yashirin ish — akt talab qilinadi')}><AlertTriangle size={11} />{t('yashirin')}</span>}
                    {c.akt_bor
                      ? <span className="fz-stamp fz-stamp--ok"><CheckCircle2 size={11} />{t('akt')}</span>
                      : <span className="fz-stamp fz-stamp--draft">{t('aktsiz')}</span>}
                  </label>
                ))}
              </div>
            </section>

            {/* O'NG: reestr + forma */}
            <section className="fz-card" aria-label={t('Akt reestri')}>
              <div className="fz-card__head">
                <h2 className="fz-card__title">{t('Akt reestri ({n})', { n: faolAktlar.length })}</h2>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1 text-[12px] text-text-dim"><input type="checkbox" checked={bekorKorsat} onChange={(e) => setBekorKorsat(e.target.checked)} /> {t('bekor qilinganlar')}</label>
                  <button type="button" onClick={() => void paket()} disabled={!faolAktlar.length || paketBand} className="fz-btn fz-btn--sm" title={t('Butun obyekt ijro paketi (ZIP): reestr + hamma АОСР')}><FileArchive /> {paketBand ? t('Yig‘ilmoqda…') : t('Butun paket')}</button>
                  <label className="inline-flex items-center gap-1 text-[12px] text-text-dim" title={t('Akt, boshlanish va tugash sanalari bo‘sh chop etiladi — sanani o‘zingiz qo‘yasiz')}><input type="checkbox" checked={sanasiz} onChange={(e) => setSanasiz(e.target.checked)} data-testid="aosr-sanasiz" /> {t('sanasiz chop')}</label>
                  <button type="button" onClick={() => void pechatKitobi()} disabled={!faolAktlar.length || paketBand} className="fz-btn fz-btn--sm" data-testid="aosr-pechat-kitobi" title={t('Bitta Excel: har akt alohida varaq (ШНК 3.01.01-22 Прил.6) + hajm hisobi va laboratoriya ilovalari')}><BookOpen /> {t('Pechat kitobi')}</button>
                  {avtoIdlar.length > 0 && <button type="button" onClick={() => void avtoBekor()} className="fz-btn fz-btn--sm fz-btn--ghost" data-testid="aosr-avto-bekor" title={t('Tizim avtomatik yasagan, yuborilmagan qoralamalarni bekor qilish')}><Unlink /> {t('Avto-qoralamalar ({n})', { n: avtoIdlar.length })}</button>}
                  <button type="button" onClick={() => void reestr('aosr')} disabled={!faolAktlar.length} className="fz-btn fz-btn--sm fz-btn--ghost" title={t('РЕЕСТР АОСР (Excel)')}><FileSpreadsheet /> {t('Reestr')}</button>
                  <button type="button" onClick={() => yangiAkt(belgilangan.size > 0)} className="fz-btn fz-btn--sm fz-btn--primary"><Plus /> {t('Yangi akt')}</button>
                </div>
              </div>
              {forma ? (
                <div id="aosr-akt-forma" className="max-h-[75vh] space-y-2.5 overflow-y-auto p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] font-semibold text-text">{forma.id ? t('Akt № {r}', { r: forma.raqam ?? '' }) : t('Yangi akt')}</div>
                    <button type="button" onClick={() => setForma(null)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Yopish')}><X /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div><span className={lbl}>{t('Turi')}</span><select className={inp} value={forma.tur ?? 'aosr'} onChange={f('tur')}>{Object.entries(TUR_NOMI).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></div>
                    <div><span className={lbl}>{t('Raqam')}</span><input className={inp} value={forma.raqam ?? ''} onChange={f('raqam')} /></div>
                    <div><span className={lbl}>{t('Akt sanasi')}</span><input type="date" className={inp} value={forma.sana ?? ''} onChange={f('sana')} /></div>
                    <div><span className={lbl}>{t('Blank')}</span><select className={inp} value={forma.blank_varianti ?? 'subpudratchisiz'} onChange={f('blank_varianti')}><option value="subpudratchisiz">{t('Subpudratchisiz')}</option><option value="subpudratchili">{t('Subpudratchili')}</option></select></div>
                  </div>
                  <div><span className={lbl}>{t('Ish nomi (sarlavha) *')}</span><input className={inp} value={forma.ish_nomi ?? ''} onChange={f('ish_nomi')} /></div>
                  <div><span className={lbl}>{t('1. Taqdim etilgan ishlar (har qator — alohida band)')}</span><textarea rows={3} className={inpKop} value={forma.ish_tavsifi ?? ''} onChange={f('ish_tavsifi')} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className={lbl}>{t('2. Loyiha tashkiloti')}</span><input className={inp} value={forma.loyiha_tashkiloti ?? ''} onChange={f('loyiha_tashkiloti')} /></div>
                    <div><span className={lbl}>{t('Chizmalar № / sana')}</span><input className={inp} value={forma.loyiha_hujjati ?? ''} onChange={f('loyiha_hujjati')} />
                      {kompaniyaId && obyektId && <AosrChizmaTanlash kompaniyaId={kompaniyaId} obyektId={obyektId} aosrId={forma.id} onToldir={(m) => setForma((x) => (x ? { ...x, loyiha_hujjati: m } : x))} />}</div>
                  </div>
                  <div><span className={lbl}>{t('3. Qo‘llangan materiallar (sertifikat/hujjat havolasi bilan)')}</span><textarea rows={2} className={inpKop} value={forma.materiallar ?? ''} onChange={f('materiallar')} /></div>
                  <div><span className={lbl}>{t('4. Loyihadan chetlanishlar')}</span><input className={inp} value={forma.chetlanishlar ?? ''} onChange={f('chetlanishlar')} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className={lbl}>{t('5. Boshlanish')}</span><input type="date" className={inp} value={forma.boshlanish_sana ?? ''} onChange={f('boshlanish_sana')} /></div>
                    <div><span className={lbl}>{t('Tugash')}</span><input type="date" className={inp} value={forma.tugash_sana ?? ''} onChange={f('tugash_sana')} /></div>
                  </div>
                  <div><span className={lbl}>{t('Keyingi ishlarga ruxsat (ishlar va konstruksiyalar)')}</span><input className={inp} value={forma.keyingi_ishlar ?? ''} onChange={f('keyingi_ishlar')} /></div>

                  {!forma.id && (forma.komissiya ?? []).every((k) => !String(k.fio ?? '').trim()) && (
                    <div className="fz-note fz-note--warn flex-col items-stretch gap-1.5" data-testid="aosr-imzochi-taklif">
                      <span>{t('Bu obyekt uchun imzochilar kiritilmagan. Bir marta kiriting — keyingi barcha aktlar va hujjatlarda o‘zi chiqadi.')}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        <select aria-label={t('Imzochi roli')} className="h-8 px-2 text-[13px]" value={imzochiForma.rol} onChange={(e) => setImzochiForma((y) => ({ ...y, rol: e.target.value as ImzochiRol }))}>
                          {([['texnadzor', 'Texnik nazorat'], ['zakazchik', 'Buyurtmachi'], ['pudratchi', 'Pudratchi'], ['loyihachi', 'Loyihachi']] as const).map(([r, n]) => <option key={r} value={r}>{t(n)}</option>)}
                        </select>
                        <input aria-label={t('F.I.Sh.')} className="h-8 min-w-[9rem] flex-1 px-2 text-[13px]" placeholder={t('F.I.Sh.')} value={imzochiForma.fio} onChange={(e) => setImzochiForma((y) => ({ ...y, fio: e.target.value }))} />
                        <input aria-label={t('Lavozim')} className="h-8 w-32 px-2 text-[13px]" placeholder={t('Lavozim')} value={imzochiForma.lavozim} onChange={(e) => setImzochiForma((y) => ({ ...y, lavozim: e.target.value }))} />
                        <button type="button" className="fz-btn fz-btn--sm" onClick={() => void imzochiniSaqla()}>{t('Obyekt uchun saqlash')}</button>
                      </div>
                    </div>
                  )}
                  <div className="fz-panel">
                    <div className="fz-panel__h"><span>{t('Komissiya va imzolar')}</span>
                      <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setForma((x) => (x ? { ...x, komissiya: [...(x.komissiya ?? []), { rol: 'boshqa' }] } : x))}><Plus /> {t('a’zo')}</button></div>
                    {(forma.komissiya ?? []).map((k, i) => {
                      const set = (p: Partial<AosrKomissiyaYozuv>) => setForma((x) => (x ? { ...x, komissiya: (x.komissiya ?? []).map((y, j) => (j === i ? { ...y, ...p } : y)) } : x));
                      return (
                        <div key={i} className="grid grid-cols-[1.1fr_1fr_1fr_1.2fr_auto] gap-1.5">
                          <select className={inp} value={k.rol} onChange={(e) => set({ rol: e.target.value })}>{Object.entries(ROL_NOMI).map(([r, n]) => <option key={r} value={r}>{t(n)}</option>)}</select>
                          <input className={inp} placeholder={t('F.I.Sh.')} value={k.fio ?? ''} onChange={(e) => set({ fio: e.target.value })} />
                          <input className={inp} placeholder={t('Lavozim')} value={k.lavozim ?? ''} onChange={(e) => set({ lavozim: e.target.value })} />
                          <input className={inp} placeholder={t('Tashkilot')} value={k.tashkilot ?? ''} onChange={(e) => set({ tashkilot: e.target.value })} />
                          <button type="button" className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('A’zoni olib tashlash')} onClick={() => setForma((x) => (x ? { ...x, komissiya: (x.komissiya ?? []).filter((_, j) => j !== i) } : x))}><X /></button>
                        </div>
                      );
                    })}
                  </div>
                  {forma.id && kompaniyaId && obyektId && (
                    <div className="fz-panel">
                      <div className="fz-panel__h"><span>{t('Laboratoriya sinovi')}</span>
                        <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setSorovKontekst({ obyektId, aosrId: forma.id, aosrNom: forma.raqam ?? String(forma.id) })}><FlaskConical /> {t('Sinov so‘rovi')}</button></div>
                      {(() => {
                        const talab = labIlovaQur(forma)?.talablar ?? [];
                        if (!talab.length) return null;
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-2 text-[12px] text-text-dim" data-testid="aosr-lab-talab">
                            <span>{t('Talab qilinadi:')}</span>
                            {talab.map((x) => (
                              <button key={x} type="button" className="fz-btn fz-btn--ghost fz-btn--sm"
                                onClick={() => setSorovKontekst({ obyektId, aosrId: forma.id, aosrNom: forma.raqam ?? String(forma.id), sinovTuri: LAB_SOROV_TURI[x], konstruksiya: forma.ish_nomi ?? undefined })}>
                                <FlaskConical /> {t('Laboratoriyaga so‘rov')}: {LAB_TALAB_NOM[x]}</button>
                            ))}
                            <span className="text-[11px] text-text-mute">{t('Kubik seriyasi va sertifikatlar ro‘yxati Excel ilovasida (Прил) chiqadi.')}</span>
                          </div>
                        );
                      })()}
                      {sorovKontekst?.aosrId === forma.id && <div className="p-2"><SinovSorovYubor kompaniyaId={kompaniyaId} kontekst={sorovKontekst} onYopish={() => setSorovKontekst(null)} onYuborildi={() => { setSorovKontekst(null); setSorovYangila((x) => x + 1); yukla(); }} /></div>}
                      <div className="p-2"><SorovlarRoyxati kompaniyaId={kompaniyaId} yonalish="yuborilgan" obyektId={obyektId} aosrId={forma.id} yangilash={sorovYangila}
                        onQayta={(s) => setSorovKontekst({ obyektId, aosrId: forma.id, aosrNom: forma.raqam ?? String(forma.id), qatorId: s.qator_id, aslSorovId: s.id })} /></div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {forma.holat === 'tasdiqlangan'
                      ? <span className="fz-stamp fz-stamp--ok" title={t('Tasdiqlangan holatni buyurtmachi / texnadzor qarori qo‘yadi')}>{t(HOLAT_NOMI.tasdiqlangan)}</span>
                      : <div className="flex flex-col gap-0.5"><select aria-label={t('Akt holati')} className={inp + ' max-w-[200px]'} value={forma.holat ?? 'yangi'} onChange={f('holat')}>{['yangi', 'qogoz'].map((h) => <option key={h} value={h}>{t(HOLAT_NOMI[h])}</option>)}</select>
                        <span className="text-[10.5px] text-text-mute">{t('«Tasdiqlangan» — buyurtmachi / texnadzor qarori: ro‘yxatdan «Zakazchikka yuborish»')}</span></div>}
                    <button type="button" onClick={() => void saqla()} disabled={saqlanmoqda} className="fz-btn fz-btn--primary"><Save /> {t('Saqlash')}</button>
                  </div>
                </div>
              ) : (
                <div className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                  {faolAktlar.length === 0 && <div className="p-4 text-center text-[13px] text-text-mute">{t('Akt yo‘q — chapdan ishlarni belgilab akt yarating')}</div>}
                  {(raqamHolati.yoq.length > 0 || raqamHolati.takror.length > 0) && (
                    <div className="fz-note fz-note--warn m-3"><AlertTriangle /><span>
                      {raqamHolati.yoq.length > 0 && t('Raqamlarda bo‘shliq: {x}. ', { x: raqamHolati.yoq.slice(0, 12).join(', ') })}
                      {raqamHolati.takror.length > 0 && t('Takror raqamlar: {x}.', { x: raqamHolati.takror.join(', ') })}
                    </span></div>
                  )}
                  {tartiblangan.map((a) => (
                    <div key={a.id} className={`cursor-pointer px-4 py-2.5 hover:bg-surface-2 ${a.holat === 'bekor' ? 'opacity-60' : ''}`} onClick={() => setForma({ ...a, komissiya: Array.isArray(a.komissiya) ? a.komissiya : [], holat: a.holat === 'bekor' ? 'yangi' : a.holat })}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-right text-[11.5px] tabular-nums text-text-mute">{a.holat === 'bekor' ? '' : tartibNomi.get(a.id)}</span>
                            <span className="truncate text-[13px] font-medium text-text">№ {a.raqam || '—'} · {a.ish_nomi || '—'}</span>
                            {aktHolatBelgisi(a.holat, yuborilgan.get(a.id))}
                            {avtoQoralamami(a) && !yuborilgan.has(a.id) && <span className="fz-chip fz-chip--warn" data-testid="aosr-avto-belgi" title={t('Tizim avtomatik yasagan qoralama — haqiqiy akt emas. Tekshiring yoki bekor qiling.')}>{t('avto-qoralama')}</span>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11.5px] text-text-mute">
                            <span>{t(TUR_NOMI[a.tur])}</span><span>·</span><span>{a.sana ?? t('sana yo‘q')}</span>
                            <span className="fz-chip">{t('{n} ish', { n: a.boglangan_ish_soni })}</span>
                            <span className={`fz-chip ${a.protokol_soni ? 'fz-chip--accent' : ''}`}>{t('{n} protokol', { n: a.protokol_soni })}</span>
                            {tartibMeta.get(a.id)?.razdel.nom && <span className="truncate" title={tartibMeta.get(a.id)?.razdel.nom}>{tartibMeta.get(a.id)?.razdel.nom}</span>}
                            {a.holat !== 'bekor' && (sifat.get(a.id) ?? []).length > 0 && (
                              <span className="fz-chip" title={(sifat.get(a.id) ?? []).map((x) => t(AKT_SIFAT_NOM[x])).join('; ')}>{t('{n} kamchilik', { n: (sifat.get(a.id) ?? []).length })}</span>
                            )}
                            {dublikat.has(a.id) && <span className="fz-chip fz-chip--warn" title={t('Shu obyektda bir xil ish nomli akt bor')}>{t('dublikat?')}</span>}
                            {a.holat !== 'bekor' && aosrSinovMatni(sinovHolat.get(a.id)) && (
                              <span className={`fz-chip ${sinovHolat.get(a.id)?.bloklangan ? 'fz-chip--warn' : ''}`} data-testid="aosr-sinov-chip" title={aosrSinovMatni(sinovHolat.get(a.id)) ?? ''}><AlertTriangle size={11} />{sinovHolat.get(a.id)?.holat.nomos.length ? t('Sinov mos emas — yuborib bo‘lmaydi') : t('Sinov natijasi kutilmoqda — yuborib bo‘lmaydi')}</span>
                            )}
                            {a.holat !== 'bekor' && (labYoq.get(a.id) ?? []).length > 0 && (
                              <span className="fz-chip fz-chip--warn" title={t('Bu ish turiga laboratoriya protokoli kerak, lekin ulanmagan')}><AlertTriangle size={11} />{t('protokol yo‘q: {x}', { x: (labYoq.get(a.id) ?? []).map((x) => LAB_TALAB_NOM[x]).join(', ') })}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {a.holat === 'yangi' && kompaniyaId && <span onClick={(e) => e.stopPropagation()}><ZakazchigaYuborish kompaniyaId={kompaniyaId} aktId={a.id} resurs="aosr" kamchiliklar={(sifat.get(a.id) ?? []).map((x) => AKT_SIFAT_NOM[x])} onYuborildi={yukla} /></span>}
                  {a.holat !== 'bekor' && kompaniyaId && <span onClick={(e) => e.stopPropagation()}><AosrFotoBiriktir kompaniyaId={kompaniyaId} aosrId={a.id} /></span>}
                          <button type="button" onClick={(e) => { e.stopPropagation(); void excel(a); }} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Excel (blank)')} aria-label={t('Excel (blank)')}><FileSpreadsheet /></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); void bekorQil(a); }} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" title={t('Bekor qilish')} aria-label={t('Bekor qilish')}><Unlink /></button>
                          {a.holat === 'yangi' && <ArxivTugma tur="aosr" id={a.id} nom={`№ ${a.raqam ?? ''}`} ikonFaqat onDone={() => { setForma(null); yukla(); }} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          /* ── LABORATORIYA ── */
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="fz-card" aria-label={t('Laboratoriya protokollari')}>
              <div className="fz-card__head">
                <h2 className="fz-card__title">{t('Laboratoriya protokollari ({n})', { n: protokollar.length })}</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void reestr('lab')} disabled={!protokollar.length} className="fz-btn fz-btn--sm fz-btn--ghost" title={t('РЕЕСТР ПРОТОКОЛОВ (Excel)')}><FileSpreadsheet /> {t('Reestr')}</button>
                  <button type="button" onClick={() => setPForma({ sinov_turi: 'beton', natija: 'kutilmoqda', laboratoriya_id: lablar[0]?.id ?? null, sana: new Date().toISOString().slice(0, 10), aosr_ids: [] })}
                    className="fz-btn fz-btn--sm fz-btn--primary"><Plus /> {t('Protokol')}</button>
                </div>
              </div>
              {lablar.length === 0 && <p className="fz-note fz-note--info m-3">{t('Laboratoriya kompaniyasi hali yo‘q — protokol formasida shu yerning o‘zida qo‘shing.')}</p>}
              {protokollar.length > 0 && (
                <div className="px-4 pt-3">
                  <div className="fz-split" role="img" aria-label={t('mos: {m} · mos emas: {e} · kutilmoqda: {k}', { m: labX.mos, e: labX.mosEmas, k: labX.kutilmoqda })}>
                    {labX.mos > 0 && <i style={{ background: 'var(--ok)', flexGrow: labX.mos }} />}
                    {labX.mosEmas > 0 && <i style={{ background: 'var(--danger)', flexGrow: labX.mosEmas }} />}
                    {labX.kutilmoqda > 0 && <i style={{ background: 'var(--warn)', flexGrow: labX.kutilmoqda }} />}
                  </div>
                </div>
              )}
              <div className="max-h-[70vh] overflow-auto p-3">
                <div className="fz-table-wrap">
                  <table className="fz-table">
                    <thead><tr>
                      <th>{t('№ / sana')}</th><th>{t('Laboratoriya')}</th><th>{t('Sinov')}</th>
                      <th>{t('Konstruksiya · marka')}</th><th className="fz-c-num">{t('Hajm')}</th><th>{t('Natija')}</th>
                      <th className="fz-c-num">{t('Summa')}</th><th>{t('Akt')}</th></tr></thead>
                    <tbody>
                      {protokollar.map((p) => (
                        <tr key={p.id} className="cursor-pointer" onClick={() => setPForma({ ...p, aosr_ids: p.aosr_ids ?? [] })}>
                          <td className="whitespace-nowrap">{p.raqam}<span className="block text-[11px] text-text-mute">{p.sana ?? '—'}</span></td>
                          <td>{p.laboratoriya ?? '—'}</td>
                          <td>{SINOV_TURI_NOM[p.sinov_turi]}</td>
                          <td>{p.konstruksiya ?? '—'}{p.marka ? ' · ' + p.marka : ''}</td>
                          <td className="fz-c-num">{p.hajm == null ? '' : Number(p.hajm).toLocaleString('ru-RU') + ' ' + (p.birlik ?? '')}</td>
                          <td><span className={`fz-stamp ${NATIJA_STAMP[p.natija] ?? ''}`}>{SINOV_NATIJA_NOM[p.natija]}</span></td>
                          <td className="fz-c-num">{p.summa == null ? '—' : pul2(Number(p.summa))}</td>
                          <td>{p.aosr_ids?.length ? p.aosr_ids.map((id) => aktlar.find((a) => a.id === id)?.raqam ?? id).join(', ') : <span className="text-warn">{t('ilova qilinmagan')}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {labJami.length > 0 && (
                <div className="space-y-1 border-t border-border px-4 py-3 text-[12px]">
                  <div className="font-semibold text-text-dim">{t('Laboratoriyalar bo‘yicha jami')}</div>
                  {labJami.map(([nom, x]) => (
                    <div key={nom} className="flex justify-between gap-2 text-text-dim">
                      <span>{nom} · {t('{n} protokol', { n: x.soni })}{x.mosEmas ? <b className="text-danger"> · {t('{n} mos emas', { n: x.mosEmas })}</b> : null}</span>
                      <span className="tabular-nums">{x.nomalum ? t('{n} ta summasiz', { n: x.nomalum }) + ' · ' : ''}{pul2(x.summa ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="fz-card p-4" aria-label={t('Protokol')}>
              {!pForma ? <p className="text-[13px] text-text-mute">{t('Protokolni tanlang yoki yangisini qo‘shing.')}</p> : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between"><div className="text-[14px] font-semibold text-text">{pForma.id ? t('Protokol № {r}', { r: pForma.raqam ?? '' }) : t('Yangi protokol')}</div>
                    <button type="button" onClick={() => setPForma(null)} className="fz-btn fz-btn--ghost fz-btn--icon fz-btn--sm" aria-label={t('Yopish')}><X /></button></div>
                  <div><span className={lbl}>{t('Laboratoriya')}</span>
                    <select className={inp} value={pForma.laboratoriya_id ?? ''} onChange={(e) => setPForma((x) => (x ? { ...x, laboratoriya_id: e.target.value ? Number(e.target.value) : null } : x))}>
                      <option value="">{t('— tanlanmagan —')}</option>{lablar.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select>
                    <details className="mt-1 text-[12px]" open={lablar.length === 0}><summary className="cursor-pointer text-accent">{t('Yangi laboratoriya qo‘shish')}</summary>
                      <div className="mt-1 flex flex-wrap items-center gap-1"><input aria-label={t('Laboratoriya nomi')} className="h-8 min-w-[10rem] flex-1 px-2 text-[13px]" value={yangiLab.nom} onChange={(e) => setYangiLab((y) => ({ ...y, nom: e.target.value }))} placeholder={t('Laboratoriya nomi')} />
                        <input aria-label={t('STIR')} className="h-8 w-28 px-2 text-[13px]" inputMode="numeric" value={yangiLab.inn} onChange={(e) => setYangiLab((y) => ({ ...y, inn: e.target.value }))} placeholder={t('STIR')} />
                        <button type="button" className="fz-btn fz-btn--sm" onClick={() => void labQosh()}><Plus /> {t('Qo‘shish')}</button></div>
                      {boshqaKontragent.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1"><select aria-label={t('Mavjud kontragent')} className="h-8 min-w-[10rem] flex-1 px-2 text-[13px]" value={tanlanganKontragent} onChange={(e) => setTanlanganKontragent(e.target.value)}><option value="">{t('— mavjud kontragentdan —')}</option>{boshqaKontragent.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}</select>
                        <button type="button" className="fz-btn fz-btn--sm" disabled={!tanlanganKontragent} onClick={() => void kontragentniLabQil()}>{t('Laboratoriya qilish')}</button></div>}</details></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className={lbl}>{t('Protokol № *')}</span><input className={inp} value={pForma.raqam ?? ''} onChange={pf('raqam')} /></div>
                    <div><span className={lbl}>{t('Sana')}</span><input type="date" className={inp} value={pForma.sana ?? ''} onChange={pf('sana')} /></div>
                    <div><span className={lbl}>{t('Sinov turi')}</span><select className={inp} value={pForma.sinov_turi ?? 'beton'} onChange={(e) => setPForma((x) => (x ? { ...x, sinov_turi: e.target.value as SinovTuri } : x))}>{Object.entries(SINOV_TURI_NOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                    <div><span className={lbl}>{t('Natija')}</span><select className={inp} value={pForma.natija ?? 'kutilmoqda'} onChange={(e) => setPForma((x) => (x ? { ...x, natija: e.target.value as SinovNatija } : x))}>{Object.entries(SINOV_NATIJA_NOM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                    <div><span className={lbl}>{t('Konstruksiya')}</span><input className={inp} value={pForma.konstruksiya ?? ''} onChange={pf('konstruksiya')} placeholder={t('Фундамент Фм-1')} /></div>
                    <div><span className={lbl}>{t('Marka / klass')}</span><input className={inp} value={pForma.marka ?? ''} onChange={pf('marka')} placeholder="B25" /></div>
                    <div><span className={lbl}>{t('Hajm')}</span><input className={inp} inputMode="decimal" value={pForma.hajm ?? ''} onChange={(e) => setPForma((x) => (x ? { ...x, hajm: e.target.value === '' ? null : (e.target.value.replace(',', '.') as unknown as number) } : x))} /></div>
                    <div><span className={lbl}>{t('Birlik')}</span><input className={inp} value={pForma.birlik ?? ''} onChange={pf('birlik')} placeholder={t('м3')} /></div>
                    <div><span className={lbl}>{t('Invoys №')}</span><input className={inp} value={pForma.invoys_raqam ?? ''} onChange={pf('invoys_raqam')} /></div>
                    <div><span className={lbl}>{t('Invoys sanasi')}</span><input type="date" className={inp} value={pForma.invoys_sana ?? ''} onChange={pf('invoys_sana')} /></div>
                    <div className="col-span-2"><span className={lbl}>{t('Summa (bo‘sh — noma’lum)')}</span><MoneyInput className={inp} inputMode="decimal" value={pForma.summa ?? ''} onValueChange={(moneyValue) => setPForma((x) => (x ? { ...x, summa: moneyValue === '' ? null : (moneyValue.replace(/\s/g, '').replace(',', '.') as unknown as number) } : x))} /></div>
                  </div>
                  <div><span className={lbl}>{t('Izoh')}</span><input className={inp} value={pForma.izoh ?? ''} onChange={pf('izoh')} /></div>
                  <div><span className={lbl}>{t('Qaysi aktlarga ilova')}</span>
                    <div className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-border p-1.5">
                      {faolAktlar.length === 0 && <div className="text-[11.5px] text-text-mute">{t('Akt yo‘q')}</div>}
                      {faolAktlar.map((a) => (
                        <label key={a.id} className="flex items-center gap-1.5 text-[12px] text-text">
                          <input type="checkbox" checked={pForma.aosr_ids?.includes(a.id) ?? false}
                            onChange={(e) => { setPForma((x) => (x ? { ...x, aosr_ids: e.target.checked ? [...(x.aosr_ids ?? []), a.id] : (x.aosr_ids ?? []).filter((y) => y !== a.id) } : x)); if (e.target.checked && !pForma.id) aktdanToldir(a); }} />
                          № {a.raqam ?? '—'} · {a.ish_nomi ?? ''}
                        </label>
                      ))}
                    </div></div>
                  <div className="flex justify-between pt-1">
                    {pForma.id ? <button type="button" onClick={() => { const p = protokollar.find((x) => x.id === pForma.id); if (p) void pBekor(p); }} className="fz-btn fz-btn--sm fz-btn--ghost">{t('Bekor qilish')}</button> : <span />}
                    <button type="button" onClick={() => void pSaqla()} disabled={saqlanmoqda} className="fz-btn fz-btn--primary"><Save /> {t('Saqlash')}</button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        <p className="flex items-center gap-1.5 text-[11.5px] text-text-mute"><ShieldCheck size={13} />{t('Qiymat yo‘q bo‘lsa — bo‘sh qoladi (o‘ylab topilmaydi); Excel blankida to‘ldirish chizig‘i chiqadi.')}</p>
      </div>
    </Sahifa>
  );
}
