import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { tasdiqSora } from '../umumiy/ui/Tasdiq';
import {
  Building2, Warehouse, FileText, Truck, HardHat, FolderKanban,
  Users, Plus, X, ZoomIn, ZoomOut, RefreshCcw, Unlink, Move,
  Handshake, Link2, MoreHorizontal, LayoutGrid, Maximize2, Save, Trash2, ExternalLink, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useKompaniya } from './KompaniyaTanlov';
import { Graf2D } from './Graf2D';
import { MindmapXarita, KorinishTanlagich, type MindmapKorinishTuri } from '../components/mindmap';
import type { PultTugatdi } from '../components/mindmap/PultAmalModal';
import { mindmapMasulRuxsati, mindmapTahrirRuxsati, tahrirYopiqMatni } from '../lib/mindmap-ruxsat';
import { amalKorishQur } from '../lib/mindmap-amallar';
import { grafgaYamoq } from '../lib/mindmap-pult';
import { pultYozuvchi, obyektBolimlariOl } from '../api/t2-mindmap-pult';
import { topshiriqBer, topshiriqXato } from '../api/t2-topshiriq';
import { SAHIFA_YOLI, belgiYoli, obyektZayavkaYoli } from '../lib/mindmap-yollar';
import { t } from '../i18n/til';
import { toast } from '../umumiy/ui/Toast';
import { pulQisqa } from '../lib/format';
import { sbObyektHodisalariOl, qachon, MODUL_RANG, type Hodisa } from '../api/t2-hodisa';
import { onEntityChanged } from '../api/entity-consistency';
import { taklifYubor, grantSaqla, grantBekor, aloqaHolati } from '../api/t2-tomon';
import { BoglanishTasdiq, AmalQatlami, type AmalQatlamiRef } from './KartaQatlam';
import type { MaxsusAmal } from '../components/mindmap/useTugunAmallar';
import { BOS_TOMON_KARTA, chiziqKalit, rolNomi, tomonKartasiniOl, tomonlarLinzasi, type TomonKarta } from './karta-tomon';
import { boglanishQoidasi, uzishQoidasi, type Qoida, type TugunTavsif } from '../lib/mindmap-boglanish';
import { uzishniBajar, type BajarDeps } from '../lib/mindmap-boglanish-bajar';
import { daraxtQur } from '../lib/mindmap-korinish';
import { kartaAvtoJoylash, NODE_W, TUGUN_BALANDLIGI, type XY } from './karta-joylash';
import { HOLAT_RANG } from '../components/mindmap/holat';
import { mindmapCreateValidation, mindmapEntityNodeId, mindmapRoleValidation } from './mindmap-create-ux';
import {
  sbMindmapGrafOl, sbMindmapMasul, grafOdamsiz, sbMindmapBog, sbMindmapBogOchir, sbMindmapTugunYarat,
  sbMindmapJoylashuvSaqla, sbMindmapTugunOchir, bogTuriniTop, RUXSAT_BOGLANISH, OCHIRSA_BOLADI,
  type MindmapGraf, type MindmapTugun, type TugunTur, type MindmapBelgi, type ShartnomaMeta, type MindmapSignal,
} from '../api/t2-mindmap';

/* Belgi turi → tugundagi qisqa yozuv. To'liq matn `title` da ko'rinadi. */
const BELGI_QISQA: Record<MindmapBelgi['tur'], string> = {
  zayavka: 'zayavka',
  narx_yoq: 'narxsiz',
  kozgu: 'ko\'zgu eski',
  smeta_yoq: 'smeta yo\'q',
  resurs_yoq: 'resurs yo\'q',
  ortiqcha: 'F2 ortiqcha',
  fakt_yoq: 'fakt kiritilmagan',
};

/* ⚡ 2026-08-28 (2-bosqich) — foydalanuvchi shikoyatlari bo'yicha:
 *
 *   «yana yangidan qurayapdi, tayyor yaratilgan datalarni ko'rmayapdi»
 *      → JOYLASHUV SAQLANMASDI. Har ochilganda tugunlar avtomatik
 *        ustunlarga qayta terilardi — odam terib qo'ygan tartib
 *        yo'qolardi va "yangidan qurayotgandek" ko'rinardi. Endi har
 *        tugun joyi `t2_mindmap_joylashuv` da saqlanadi.
 *
 *   «bitta joyda qotib turadi hammasi... surib tartiblab taxlash kerak»
 *      → Tugunlar QAT'IY ustunlarga mixlangan edi, sudrab bo'lmasdi.
 *        Endi har tugunni sudrab istalgan joyga qo'yish mumkin.
 *
 *   «maydon ham qimirlamay qolgan, hamma joyga sayr qilish kerak»
 *      → Pan buzuq edi: tugun ustida bosilganda ham pan boshlanardi,
 *        hodisalar aralashib ketardi. Endi bitta ANIQ rejim mexanizmi
 *        (`rejim.current`): bo'sh joy=pan, tugun=sudrash, nuqta=chiziq.
 * `setPointerCapture` bilan kursor maydondan chiqsa ham ishlaydi.
 *        G'ildirak kursor ostidagi nuqtani joyida saqlab zumlaydi.
 */

/** Kompaniya grafi xotirada (sahifalar orasida): qayta ochish — bir zumda, yangilanish fonda. */
const grafKesh = new Map<number, { g: MindmapGraf; t: number }>();
const GRAF_KESH_MS = 10 * 60_000;

const KANVAS_W = 6000;
const KANVAS_H = 4000;

const TUR_RANG: Record<TugunTur, string> = {
  kompaniya: '#b9a2f5', loyiha: '#86a6ff', obyekt: '#62c97a', shartnoma: '#2ec4b6',
  sklad: '#e9a94f', texnika: '#f0b450', kadr: '#74b8f2', kontragent: '#ff7a6e',
  zayavka: '#5fd6ca', foydalanuvchi: '#c0c8c6', tomon: '#f28bd0',
};
const TUR_IKONKA: Record<TugunTur, any> = {
  kompaniya: Building2, loyiha: FolderKanban, obyekt: Building2, shartnoma: FileText,
  sklad: Warehouse, texnika: Truck, kadr: HardHat, kontragent: Users,
  zayavka: FileText, foydalanuvchi: Users, tomon: Handshake,
};
const TUR_NOM: Record<TugunTur, string> = {
  kompaniya: 'Kompaniya', loyiha: 'Loyiha', obyekt: 'Obyekt', shartnoma: 'Shartnoma',
  sklad: 'Sklad', texnika: 'Texnika', kadr: 'Xodim', kontragent: 'Kontragent',
  zayavka: 'Ta’minot zayavkasi', foydalanuvchi: 'A’zo', tomon: 'Tomon',
};

const BOG_TUR_NOM: Record<string, string> = {
  loyiha_kompaniya: 'Kompaniya ↔ loyiha (Tuzilmaviy aloqa)',
  tomon_aloqa: 'Tomon aloqasi (boshqa kompaniya, rol bilan)',
  tomon_grant: 'Tomonning ko‘rish huquqi (nimani ko‘ra oladi)',
  masul_obyekt: 'Obyektga mas’ul odam',
  masul_loyiha: 'Loyihaga mas’ul odam',
  obyekt_loyiha: 'Loyiha tarkibidagi obyekt',
  shartnoma_loyiha: 'Loyiha bo\'yicha tuzilgan shartnoma',
  shartnoma_obyekt: 'Shartnoma asosida bajariladigan obyekt',
  sklad_obyekt: 'Obyektni ta\'minlovchi ombor',
  texnika_obyekt: 'Obyektga biriktirilgan texnika',
  kadr_obyekt: 'Obyektga biriktirilgan xodim',
  qatnashchi: 'Loyiha qatnashchisi (Rol: Kontragent)',
};


const YARATSA_BOLADI: { tur: TugunTur; maydonlar: { kalit: string; nom: string; majburiy?: boolean }[] }[] = [
  { tur: 'loyiha',     maydonlar: [{ kalit: 'nom', nom: 'Loyiha nomi', majburiy: true }, { kalit: 'hudud', nom: 'Hudud' }] },
  { tur: 'shartnoma',  maydonlar: [{ kalit: 'nom', nom: 'Shartnoma raqami', majburiy: true }, { kalit: 'taraf', nom: 'Taraf (kim bilan)' }] },
  { tur: 'sklad',      maydonlar: [{ kalit: 'nom', nom: 'Sklad nomi', majburiy: true }, { kalit: 'manzil', nom: 'Manzil' }, { kalit: 'masul', nom: "Mas'ul shaxs" }] },
  { tur: 'texnika',    maydonlar: [{ kalit: 'nom', nom: 'Texnika nomi', majburiy: true }, { kalit: 'davlat_raqami', nom: 'Davlat raqami' }] },
  { tur: 'kadr',       maydonlar: [{ kalit: 'nom', nom: 'Ism sharif', majburiy: true }, { kalit: 'lavozim', nom: 'Lavozim', majburiy: true }] },
  { tur: 'kontragent', maydonlar: [{ kalit: 'nom', nom: 'Kompaniya nomi', majburiy: true }, { kalit: 'inn', nom: 'STIR (9 raqam)' }] },
];

const ROLLAR = [
  { kalit: 'zakazchik', nom: 'Zakazchik (buyurtmachi)' },
  { kalit: 'bosh_pudratchi', nom: 'Bosh pudratchi' },
  { kalit: 'subpudratchi', nom: 'Subpudratchi' },
  { kalit: 'loyihachi', nom: 'Loyihachi' },
  { kalit: 'taminotchi', nom: "Ta'minotchi" },
];

type Rejim =
  | { tur: 'pan'; boshPan: XY; boshKursor: XY }
  | { tur: 'tugun'; id: string; siljish: XY; kochdi: boolean }
  | { tur: 'chiziq'; manba: string }
  | null;

/** Ko'rinish tanlovi: birinchi marta — VIZUAL xarita (egasi 2026-11-12: jadval emas); tanlangan ko'rinish eslab qolinadi. */
const KORINISH_KALIT = 'mindmap-korinish-v2';
const SAQLANADIGAN: MindmapKorinishTuri[] = ['tahrir', 'xarita', 'pult', 'royxat', '2d'];
/** Birinchi marta: KARTA (chiziq tortib quriladigan va boshqariladigan kanvas); tahrir ruxsati yo‘q odamga — avto-xarita. */
function korinishBoshlangich(tahrirMumkin: boolean): MindmapKorinishTuri {
  try { const k = window.localStorage.getItem(KORINISH_KALIT); if (k && (SAQLANADIGAN as string[]).includes(k)) return k as MindmapKorinishTuri; } catch { /* saqlash yo'q — sukut */ }
  return tahrirMumkin ? 'tahrir' : 'xarita';
}
function korinishSakla(k: MindmapKorinishTuri) {
  if (!SAQLANADIGAN.includes(k)) return;
  try { window.localStorage.setItem(KORINISH_KALIT, k); } catch { /* ruxsat yo'q */ }
}

export default function TestXarita({ ichki = false, kompaniyaId }: {
  /** Boshqa sahifa ichiga joylangan nusxa (Rahbar paneli): sahifaning `?tugun=` parametrini O'QIMAYDI (u BossDashboard/TugunDosye tanlovi). */
  ichki?: boolean;
  /** Ko'rsatiladigan kompaniya (berilmasa — kontekstdagi). Joriy kompaniyadan farq qilsa — faqat o'qish. */
  kompaniyaId?: number;
} = {}) {
  const [params] = useSearchParams();
  const { joriy, superadmin } = useKompaniya();
  const aktKomp = kompaniyaId ?? joriy?.id ?? 0;
  const ruxsat = useMemo(() => mindmapTahrirRuxsati({ superadmin, joriy, kompaniyaId }), [superadmin, joriy, kompaniyaId]);
  const tahrirMumkin = ruxsat.mumkin;
  const yopiqMatn = tahrirYopiqMatni(ruxsat);

  /** `graf` — odamlarsiz (eski tahrir kanvasi/2D/3D odamni bilmaydi); `grafToliq` — v4 (odamlar + doira) yangi «Xarita»/«Ro'yxat» uchun. */
  const [grafAsos, setGraf] = useState<MindmapGraf>({ tugunlar: [], bogichlar: [] });
  const [grafToliq, setGrafToliq] = useState<MindmapGraf>({ tugunlar: [], bogichlar: [] });
  const [joylar, setJoylar] = useState<Record<string, XY>>({});
  /** Karta: tomon va odam tugunlari serverda emas — joyi shu brauzerda (kompaniya bo‘yicha) saqlanadi. */
  const [kartaJoy, setKartaJoy] = useState<Record<string, XY>>({});
  const [tomonKarta, setTomonKarta] = useState<TomonKarta>(BOS_TOMON_KARTA);
  const [yashirinTur, setYashirinTur] = useState<Set<string>>(() => new Set(['foydalanuvchi']));
  const [ulashManba, setUlashManba] = useState<string | null>(null);
  const [tasdiqQoida, setTasdiqQoida] = useState<Extract<Qoida, { holat: 'ishlaydi' }> | null>(null);
  const amalRef = useRef<AmalQatlamiRef>(null);
  /** Karta grafi: server grafi + tomonlar (boshqa kompaniyalar) + odamlar (filtr bilan yashiriladi). Faqat kanvas/2D shuni ko‘radi. */
  const graf = useMemo<MindmapGraf>(() => {
    const odam = grafToliq.tugunlar.filter((t) => t.tur === 'foydalanuvchi');
    const odamIdlar = new Set(odam.map((t) => t.id));
    return {
      ...grafAsos,
      tugunlar: [...grafAsos.tugunlar, ...tomonKarta.tugunlar, ...odam],
      bogichlar: [...grafAsos.bogichlar, ...tomonKarta.bogichlar, ...grafToliq.bogichlar.filter((b) => b.tur.startsWith('masul_') && odamIdlar.has(b.manba))],
    };
  }, [grafAsos, grafToliq, tomonKarta]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xato, setXato] = useState('');
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [oxirgiYangilanish, setOxirgiYangilanish] = useState<Date | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [holatFiltri, setHolatFiltri] = useState<'barchasi' | 'etibor' | 'zayavka'>('barchasi');

  const [pan, setPan] = useState<XY>({ x: 60, y: 40 });
  const [zoom, setZoom] = useState(0.85);
  const [kursor, setKursor] = useState<XY>({ x: 0, y: 0 });
  /* Rejim ref'da — har piksel siljishda qayta render qilmasin.
 `rejimNishon` faqat KO'RINISH uchun (chiziq rejimida nishonlash). */
  const rejim = useRef<Rejim>(null);
  const [chiziqManbaId, setChiziqManbaId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  const [yaratModal, setYaratModal] = useState<TugunTur | null>(null);
  const [maydonlar, setMaydonlar] = useState<Record<string, string>>({});
  const [rolModal, setRolModal] = useState<{ manbaId: number; maqsadId: number } | null>(null);
  const [rolTanlov, setRolTanlov] = useState('');
  const [rolSaqlanmoqda, setRolSaqlanmoqda] = useState(false);
  const [rolXato, setRolXato] = useState('');
  const [boglanishSaqlanmoqda, setBoglanishSaqlanmoqda] = useState(false);
  const [yaratSaqlanmoqda, setYaratSaqlanmoqda] = useState(false);
  const [yaratXato, setYaratXato] = useState('');
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  /** Egasi 2026-09-30: Obsidian grafigi uslubi (sukut) yoki tahrir kanvasi (bog'lash/yaratish/joylash). */
  /** Ko'rinish: 3D graf (sukut), 2D graf (Obsidian uslubi — egasi: "eskisini ham o'chirma") yoki tahrir kanvasi. */
  /** Egasi 2026-10-25: sukut — «Kompaniya xaritasi» (2D ierarxiya, real holat bilan); telefonda — ro'yxat.
      3D/2D graf va tahrir kanvasi ixtiyoriy ko'rinish sifatida saqlanadi. */
  const [korinish, setKorinishIchki] = useState<MindmapKorinishTuri>(() => (!ichki && params.get('tugun') ? 'xarita' : korinishBoshlangich(tahrirMumkin)));
  const setKorinish = useCallback((k: MindmapKorinishTuri) => { setKorinishIchki(k); korinishSakla(k); }, []);
  const [tanlanganBog, setTanlanganBog] = useState<MindmapGraf['bogichlar'][number] | null>(null);
  const [obyektHodisalari, setObyektHodisalari] = useState<Hodisa[]>([]);
  const [hodisaYuklanmoqda, setHodisaYuklanmoqda] = useState(false);
  const [hodisaXato, setHodisaXato] = useState('');
  const navigate = useNavigate();

  /** Saqlangan joyi yo'q tugunlarni ustunlarga teradi (mavjudlarga TEGMAYDI) */
  const avtoJoylash = kartaAvtoJoylash;

  /* Ta'minot drilldown rejimi (obyekt id). Fon yangilash (polling, entity-o'zgarish) shu rejimni
     BUZMAYDI; faqat qo'lda «Yangilash» (yukla) umumiy ko'rinishga qaytaradi. */
  const taminotRef = useRef<number | null>(null);
  /* Eskirgan javob yangisini bosib ketmasin. */
  const sorovNomeri = useRef(0);
  /** Sekin RPC so'rovi yo'lda — polling yangisini ustiga qo'ymasin. */
  const sorovYolda = useRef(false);

  /** Server grafini holatga qo'llaydi. Sudralayotgan tugun joyi yangilanishda O'ZGARMAYDI. */
  const qollaGraf = useCallback((gToliq: MindmapGraf) => {
    const g = grafOdamsiz(gToliq);
    setGrafToliq(gToliq);
    setGraf(g);
    setOxirgiYangilanish(new Date());
    const saqlangan: Record<string, XY> = {};
    g.tugunlar.forEach((tg) => {
      if (tg.x != null && tg.y != null) saqlangan[tg.id] = { x: Number(tg.x), y: Number(tg.y) };
    });
    setJoylar((oldingi) => {
      const r = rejim.current;
      if (r?.tur === 'tugun' && oldingi[r.id]) saqlangan[r.id] = oldingi[r.id];
      return avtoJoylash(g.tugunlar, saqlangan);
    });
  }, [avtoJoylash]);

  const yukla = useCallback(async () => {
    if (!aktKomp) return;
    const nom = ++sorovNomeri.current;
    setYuklanmoqda(true);
    setXato('');
    sorovYolda.current = true;
    const r = await sbMindmapGrafOl(aktKomp);
    if (nom !== sorovNomeri.current) return;
    sorovYolda.current = false;
    setYuklanmoqda(false);
    if (!r.ok) { setXato(r.error); return; }
    taminotRef.current = null;
    grafKesh.set(aktKomp, { g: r.graf, t: Date.now() });
    qollaGraf(r.graf);
  }, [aktKomp, qollaGraf]);

  const taminotDrilldown = useCallback(async (obyektId: number) => {
    if (!aktKomp || !Number.isInteger(obyektId) || obyektId <= 0) return;
    const nom = ++sorovNomeri.current;
    setYuklanmoqda(true); setXato('');
    const r = await sbMindmapGrafOl(aktKomp, { mode: 'taminot', obyektId });
    if (nom !== sorovNomeri.current) return;
    setYuklanmoqda(false);
    if (!r.ok) { setXato(r.error); return; }
    taminotRef.current = obyektId;
    qollaGraf(r.graf);
  }, [aktKomp, qollaGraf]);

  /** Fon yangilash: ta'minot drilldown ochiq bo'lsa — o'sha ko'rinish qayta o'qiladi (o'chib ketmaydi). */
  const yangila = useCallback(async () => {
    const id = taminotRef.current;
    if (id != null) await taminotDrilldown(id); else await yukla();
  }, [taminotDrilldown, yukla]);

  /* Tezlik: qayta ochilganda oxirgi graf darhol ko'rinadi (10 daqiqagacha), yangisi fonda keladi. */
  useEffect(() => {
    const k = grafKesh.get(aktKomp);
    if (k && Date.now() - k.t < GRAF_KESH_MS) qollaGraf(k.g);
    yukla();
  }, [yukla, aktKomp, qollaGraf]);

  /* Module satridagi `?tugun=texnika:44` bevosita o'sha REAL node'ni
     ochadi; nom yoki vaqtinchalik client ID orqali izlash yo'q. */
  useEffect(() => {
    if (ichki) return;   // ichki nusxada `?tugun=` sahifaniki (BossDashboard/TugunDosye), xaritaniki emas
    const nodeKey = params.get('tugun');
    if (nodeKey && grafToliq.tugunlar.some((tg) => tg.id === nodeKey)) setTanlangan(nodeKey);
  }, [ichki, params, grafToliq.tugunlar]);

  /* Module tabdagi real mutation ham shu grafni qayta o'qitadi.  UI hech
     qachon vaqtinchalik node'ni authoritative holat deb qabul qilmaydi. */
  useEffect(() => onEntityChanged((event) => {
    if (event.detail.kompaniyaId === aktKomp) void yangila();
  }), [aktKomp, yangila]);

  /* Faqat frontend polling: rahbar oynasi yangi zayavka/belgilarni
     qo'lda Yangilash tugmasisiz ham ko'rsatsin. */
  /* Yashirin tab (document.hidden) da so'rov yuborilmaydi; sudrash/pan/chiziq paytida ham. Tab qaytganda — bir marta. */
  useEffect(() => {
    if (!aktKomp) return;
    const tik = () => { if (document.hidden || rejim.current || sorovYolda.current) return; void yangila(); };
    const timer = window.setInterval(tik, 30_000);
    const korindi = () => { if (!document.hidden) tik(); };
    document.addEventListener('visibilitychange', korindi);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', korindi); };
  }, [aktKomp, yangila]);

  /* Ruxsat yo'qolsa/kelmasa — tahrir kanvasi ochiq qolmaydi. */
  useEffect(() => { if (!tahrirMumkin && korinish === 'tahrir') setKorinish('xarita'); }, [tahrirMumkin, korinish]);

  /* Karta: tomonlar (boshqa kompaniyalar) va ularning huquqlari — faqat karta ko‘rinishida va ichki bo‘lmaganda o‘qiladi. */
  const kompaniyaTugunId = useMemo(() => grafToliq.tugunlar.find((tg) => tg.tur === 'kompaniya')?.id ?? null, [grafToliq.tugunlar]);
  const tomonlarniYukla = useCallback(async () => {
    if (!aktKomp || !kompaniyaTugunId) return;
    try { setTomonKarta(await tomonKartasiniOl(aktKomp, kompaniyaTugunId)); } catch { /* tomon qatlami ixtiyoriy */ }
  }, [aktKomp, kompaniyaTugunId]);
  useEffect(() => { if (korinish === 'tahrir') void tomonlarniYukla(); }, [korinish, tomonlarniYukla]);
  useEffect(() => {
    try { const q = window.localStorage.getItem('mindmap-karta-joy-v1:' + aktKomp); setKartaJoy(q ? JSON.parse(q) : {}); } catch { setKartaJoy({}); }
  }, [aktKomp]);
  const kartaJoyniSakla = useCallback((id: string, p: XY) => {
    setKartaJoy((o) => { const n = { ...o, [id]: p }; try { window.localStorage.setItem('mindmap-karta-joy-v1:' + aktKomp, JSON.stringify(n)); } catch { /* saqlash yo‘q */ } return n; });
  }, [aktKomp]);
  const sebTugun = (id: string) => id.startsWith('tomon:') || id.startsWith('foydalanuvchi:');
  const daraxtK = useMemo(() => daraxtQur(grafToliq), [grafToliq]);
  const [, qaytaChiz] = useState(0);
  useEffect(() => { qaytaChiz((n) => n + 1); }, [grafToliq, aktKomp]);   // amal qatlami (ref) o‘rnatilgach tugun tugmalari chiqsin
  /** Joylar: serverdagi + (tomon/odam) mahalliy; qolgan yangilari avto-joylashadi. */
  const joylarK = useMemo(() => avtoJoylash(graf.tugunlar.filter((tg) => sebTugun(tg.id)), { ...kartaJoy, ...joylar }), [graf.tugunlar, kartaJoy, joylar, avtoJoylash]);

  const kanvasKoord = useCallback((cx: number, cy: number): XY => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom };
  }, [pan, zoom]);

  /* ── ZUM: kursor ostidagi nuqta JOYIDA qoladi ── */
  const gildirak = (e: React.WheelEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const yangi = Math.min(2.5, Math.max(0.2, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setPan({ x: mx - ((mx - pan.x) / zoom) * yangi, y: my - ((my - pan.y) / zoom) * yangi });
    setZoom(yangi);
  };

  /* ── HODISALAR ── */
  const bosildiBoshJoy = (e: React.PointerEvent) => {
    if (rejim.current) return;                       // tugun/chiziq allaqachon boshlangan
    wrapRef.current?.setPointerCapture(e.pointerId);
    rejim.current = { tur: 'pan', boshPan: pan, boshKursor: { x: e.clientX, y: e.clientY } };
  };

  const bosildiTugun = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();                             // pan boshlanmasin
    if (!tahrirMumkin) return;                       // faqat o'qish: sudrash (joylashuv yozuvi) yo'q, bosish tanlaydi
    const joy = joylarK[id];
    if (!joy) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    const k = kanvasKoord(e.clientX, e.clientY);
    rejim.current = { tur: 'tugun', id, siljish: { x: k.x - joy.x, y: k.y - joy.y }, kochdi: false };
  };

  const bosildiNuqta = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();                             // tugun sudrash boshlanmasin
    if (!tahrirMumkin) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    rejim.current = { tur: 'chiziq', manba: id };
    setChiziqManbaId(id);
    setKursor(kanvasKoord(e.clientX, e.clientY));
  };

  const harakat = (e: React.PointerEvent) => {
    const r = rejim.current;
    if (!r) return;
    if (r.tur === 'pan') {
      setPan({ x: r.boshPan.x + (e.clientX - r.boshKursor.x), y: r.boshPan.y + (e.clientY - r.boshKursor.y) });
    } else if (r.tur === 'tugun') {
      const k = kanvasKoord(e.clientX, e.clientY);
      r.kochdi = true;
      setJoylar((j) => ({ ...j, [r.id]: { x: Math.round(k.x - r.siljish.x), y: Math.round(k.y - r.siljish.y) } }));
    } else if (r.tur === 'chiziq') {
      setKursor(kanvasKoord(e.clientX, e.clientY));
    }
  };

  /* ⚠️ 2026-08-28 KRITIK TUZATISH — «bog'lab bo'lmaydi» shikoyatining ildizi.
   * Chiziq tortilganda `setPointerCapture` wrapper'ga qo'yilgan edi, ya'ni
   * BARCHA keyingi pointer hodisalari (shu jumladan `pointerup`) wrapper'ga
   * YO'NALTIRILADI — nishon tugundagi `onPointerUp` HECH QACHON ishlamasdi.
   * Natijada chiziq tortilardi, lekin hech qachon TUGALLANMASDI: sklad,
   * texnika, xodim tugunlari osilib qolardi.
   * Yechim: nishonni kursor koordinatasidan `elementFromPoint` bilan
   * topamiz — capture bilan ham ishlaydi. */
  const nishonTugunniTop = (cx: number, cy: number): string | null => {
    const el = document.elementFromPoint(cx, cy);
    const tugun = (el as HTMLElement | null)?.closest('[data-tugun]');
    return tugun?.getAttribute('data-tugun') || null;
  };

  const qoyibYuborildi = async (e: React.PointerEvent) => {
    const r = rejim.current;
    rejim.current = null;
    setChiziqManbaId(null);

    if (r?.tur === 'chiziq') {
      const maqsadId = nishonTugunniTop(e.clientX, e.clientY);
      if (maqsadId && maqsadId !== r.manba) await chiziqniBogla(r.manba, maqsadId);
      return;
    }
    if (r?.tur !== 'tugun' || !r.kochdi || !aktKomp) return;
    const joy = joylar[r.id];
    if (!joy) return;
    if (sebTugun(r.id)) { kartaJoyniSakla(r.id, joy); return; }
    setSaqlanmoqda(true);
    const nat = await sbMindmapJoylashuvSaqla(aktKomp, [{ tugun_id: r.id, x: joy.x, y: joy.y }]);
    setSaqlanmoqda(false);
    if (!nat.ok) toast('Joylashuv saqlanmadi: ' + (nat.error || ''), 'danger');
  };

  /** Ikki tugunni bog‘laydi: avval QOIDA (lib/mindmap-boglanish) — mumkin bo‘lmasa sabab; mumkin bo‘lsa — tasdiq kartasi. Odam teskari tortsa ham to‘g‘ri tushuniladi. */
  const tavsifOl = (id: string): TugunTavsif | null => {
    const g = graf.tugunlar.find((tg) => tg.id === id);
    return g ? { id: g.id, tur: g.tur, nom: g.nom, meta: (g.meta ?? null) as Record<string, unknown> | null } : null;
  };
  const chiziqniBogla = async (manbaId: string, maqsadId: string) => {
    const a = tavsifOl(manbaId), b = tavsifOl(maqsadId);
    if (!a || !b) return;
    const q = boglanishQoidasi(a, b, { tahrir: tahrirMumkin, yopiqSabab: yopiqMatn || null, masulMumkin: mindmapMasulRuxsati({ superadmin, joriy, kompaniyaId }) });
    if (q.holat !== 'ishlaydi') { toast(q.sabab, 'danger'); return; }
    if (q.amal === 'sub_topshir' && q.yol) { setTasdiqQoida(q); return; }   // tasdiq kartasi → «Davom etish» mavjud topshirish sahifasini ochadi
    setTasdiqQoida(q);
  };
  /** Mavjud yozuvchilar (API qatlami): qoida bajarilganda aynan shularga boradi. */
  const bajarDeps = useMemo<BajarDeps>(() => ({
    bog: (tur, m, q, v, rol) => sbMindmapBog(aktKomp, tur, m, q, v, rol),
    bogOchir: (tur, m, q, v, rol) => sbMindmapBogOchir(aktKomp, tur, m, q, v, rol),
    taklif: (p) => taklifYubor(aktKomp, { qabulInn: p.qabulInn, qabulNom: p.qabulNom, taklifRol: p.taklifRol, qabulRol: p.qabulRol }),
    grantSaqla: (aloqaId, g) => grantSaqla(aktKomp, aloqaId, g),
    grantBekor: (id) => grantBekor(aktKomp, id),
    aloqaToxtat: (id) => aloqaHolati(aktKomp, id, 'toxtatish'),
    masul: (a) => sbMindmapMasul(aktKomp, a),
  }), [aktKomp]);
  const rolniTasdiqla = async () => {
    if (!rolModal || !tahrirMumkin) return;
    const rolXabari = mindmapRoleValidation(rolTanlov);
    if (rolXabari) { setRolXato(rolXabari); return; }
    const target = graf.tugunlar.find((t) => t.id === 'loyiha:' + rolModal.maqsadId);
    const expectedVersion = Number(target?.meta?.versiya);
    if (!target || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      toast('Loyiha versiyasi mavjud emas, qayta yuklang', 'danger');
      return;
    }
    if (rolSaqlanmoqda) return;
    setRolSaqlanmoqda(true);
    setRolXato('');
    try {
      const r = await sbMindmapBog(aktKomp, 'qatnashchi', rolModal.manbaId, rolModal.maqsadId, expectedVersion, rolTanlov);
      if (r.ok) {
        setRolModal(null);
        toast(`Qatnashchi biriktirildi · ${rolTanlov}`, 'ok');
        await yangila();
      } else {
        setRolXato(r.error || 'Bog\'lanmadi');
        toast(r.error || 'Bog\'lanmadi', 'danger');
      }
    } catch (error) {
      const xabar = error instanceof Error ? error.message : String(error);
      setRolXato(xabar);
      toast(xabar, 'danger');
    } finally {
      setRolSaqlanmoqda(false);
    }
  };

  const chiziqUz = async (b: MindmapGraf['bogichlar'][number]) => {
    if (!tahrirMumkin) { toast(yopiqMatn || t('Faqat ko‘rish rejimi'), 'danger'); return; }
    if (b.tur === 'tomon_grant' || b.tur === 'tomon_aloqa' || b.tur === 'masul_obyekt' || b.tur === 'masul_loyiha') {
      const q = uzishQoidasi(b, { tahrir: tahrirMumkin, yopiqSabab: yopiqMatn || null, masulMumkin: mindmapMasulRuxsati({ superadmin, joriy, kompaniyaId }) });
      if (q.holat !== 'ishlaydi') { toast(q.sabab, 'danger'); return; }
      if (!(await tasdiqSora({ matn: q.tavsif + '\n\n' + t('Davom etasizmi?'), xavfli: true }))) return;
      const idSon = (id: string) => Number(id.split(':')[1]);
      const g = tomonKarta.grantlar.get(chiziqKalit(b.manba, b.maqsad));
      const r = q.amal === 'mindmap_bog_ochir' ? { ok: false as const, error: 'Bu amal bu yerda ishlatilmaydi' } : await uzishniBajar(q.amal, {
        grantIdlar: g?.grantIdlar, aloqaId: b.tur === 'tomon_aloqa' ? idSon(b.maqsad) : g?.aloqaId,
        ...(b.maqsad.startsWith('obyekt:') ? { obyektId: idSon(b.maqsad) } : { loyihaId: idSon(b.maqsad) }), foydalanuvchiId: idSon(b.manba),
      }, bajarDeps);
      if (r.ok) { setTanlanganBog(null); toast(r.xabar, 'ok'); void yangila(); void tomonlarniYukla(); } else toast(r.error, 'danger');
      return;
    }
    // Ishtirokchi chizig'ini server ROL bo'yicha topadi; rol kelmasa (eski server shakli) taxmin qilib uzmaymiz.
    if (b.tur === 'qatnashchi' && !b.rol) { toast(t('Qatnashchi roli serverdan kelmadi — uzib bo‘lmaydi (server yangilanmagan).'), 'danger'); return; }
    if (!b.uzsa_boladi) { toast('Bu tuzilmaviy bog\'lanish — uzib bo\'lmaydi', 'danger'); return; }
    if (!(await tasdiqSora({ matn: 'Bog\'lanishni uzasizmi? (Yozuvlarning o\'zi O\'CHMAYDI)', xavfli: true, tasdiqMatni: 'Uzish' }))) return;
    const target = graf.tugunlar.find((t) => t.id === b.maqsad);
    const expectedVersion = Number(target?.meta?.versiya);
    if (!target || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      toast('Tugun versiyasi mavjud emas, qayta yuklang', 'danger');
      return;
    }
    const r = await sbMindmapBogOchir(aktKomp, b.tur, Number(b.manba.split(':')[1]), Number(b.maqsad.split(':')[1]), expectedVersion, b.rol);
    if (r.ok) { setTanlanganBog(null); toast('Bog\'lanish uzildi', 'ok'); void yangila(); }
    else toast(r.error || 'Uzilmadi', 'danger');
  };

  const tugunYarat = async () => {
    if (!yaratModal || !aktKomp || !tahrirMumkin) return;
    const maydonlarTarifi = YARATSA_BOLADI.find((y) => y.tur === yaratModal)?.maydonlar || [];
    const validatsiyaXatosi = mindmapCreateValidation(yaratModal, maydonlarTarifi, maydonlar);
    if (validatsiyaXatosi) { setYaratXato(validatsiyaXatosi); return; }
    if (yaratSaqlanmoqda) return;
    setYaratSaqlanmoqda(true);
    setYaratXato('');
    try {
      const r = await sbMindmapTugunYarat(yaratModal, aktKomp, maydonlar);
      if (r.ok && Number.isInteger(r.entity_id) && r.entity_id! > 0) {
        const entityId = mindmapEntityNodeId(yaratModal, r.entity_id);
        const nom = maydonlar.nom.trim();
        setYaratModal(null);
        setMaydonlar({});
        if (entityId) setTanlangan(entityId);
        await yangila();
        const id = entityId?.split(':')[1];
        const ochish = id && SAHIFA_YOLI[yaratModal]
          ? { label: 'Bo\'limda ochish', onClick: () => navigate(SAHIFA_YOLI[yaratModal]!(Number(id), nom)) }
          : undefined;
        toast(`${TUR_NOM[yaratModal]} #${id} yaratildi`, 'ok', undefined, 10000, ochish);
      } else if (r.ok) {
        const xabar = 'Baza real entity ID qaytarmadi — yaratildi deb ko\'rsatilmadi';
        setYaratXato(xabar);
        toast(xabar, 'danger');
      } else {
        setYaratXato(r.error || 'Server create so\'rovini rad etdi');
        toast(r.error || 'Yaratilmadi', 'danger');
      }
    } catch (error) {
      const xabar = error instanceof Error ? error.message : String(error);
      setYaratXato(xabar);
      toast(xabar, 'danger');
    } finally {
      setYaratSaqlanmoqda(false);
    }
  };

  /** Hammasini ustunlarga qayta terib SAQLAYDI */
  const hammasiniQaytaTer = async () => {
    if (!aktKomp || !tahrirMumkin) return;
    const yangi = avtoJoylash(graf.tugunlar.filter((tg) => !sebTugun(tg.id)), {});
    setJoylar({ ...yangi, ...avtoJoylash(graf.tugunlar.filter((tg) => sebTugun(tg.id)), {}) });
    setKartaJoy({}); try { window.localStorage.removeItem('mindmap-karta-joy-v1:' + aktKomp); } catch { /* ruxsat yo‘q */ }
    setSaqlanmoqda(true);
    const r = await sbMindmapJoylashuvSaqla(aktKomp,
      Object.entries(yangi).map(([tugun_id, p]) => ({ tugun_id, x: p.x, y: p.y })));
    setSaqlanmoqda(false);
    if (r.ok) toast('Qayta terildi va saqlandi', 'ok');
    else toast(r.error || 'Saqlanmadi', 'danger');
  };

  /** Barcha tugun ko'rinadigan qilib zum/pan tanlaydi */
  const ekrangaSigdir = () => {
    const p = Object.values(joylar);
    if (!p.length || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const minX = Math.min(...p.map((a) => a.x)), maxX = Math.max(...p.map((a) => a.x)) + NODE_W;
    const minY = Math.min(...p.map((a) => a.y)), maxY = Math.max(...p.map((a) => a.y)) + 140;
    const z = Math.min(2, Math.max(0.2,
      Math.min((r.width - 80) / Math.max(1, maxX - minX), (r.height - 80) / Math.max(1, maxY - minY))));
    setZoom(z);
    setPan({ x: 40 - minX * z, y: 40 - minY * z });
  };

  const tanlanganTugun = tanlangan ? graf.tugunlar.find((t) => t.id === tanlangan) || null : null;
  const tanlanganBoglar = tanlangan
    ? graf.bogichlar.filter((b) => b.manba === tanlangan || b.maqsad === tanlangan) : [];
  const tanlanganObyektHolati = tanlanganTugun?.tur === 'obyekt' ? tanlanganTugun.meta : null;

  useEffect(() => {
    if (!tanlanganTugun || tanlanganTugun.tur !== 'obyekt') {
      setObyektHodisalari([]);
      setHodisaXato('');
      return;
    }
    const obyektId = Number(tanlanganTugun.id.split(':')[1]);
    if (!Number.isFinite(obyektId)) return;
    let bekor = false;
    setHodisaYuklanmoqda(true);
    setHodisaXato('');
    sbObyektHodisalariOl(aktKomp, obyektId, 8).then((r) => {
      if (bekor) return;
      if (r.error) { setHodisaXato(r.error); setObyektHodisalari([]); }
      else setObyektHodisalari(r.qatorlar || []);
      setHodisaYuklanmoqda(false);
    }).catch((e: any) => {
      if (bekor) return;
      setHodisaXato(e?.message || 'Hodisa tarixi o\'qilmadi');
      setHodisaYuklanmoqda(false);
    });
    return () => { bekor = true; };
  }, [aktKomp, tanlanganTugun?.id, tanlanganTugun?.tur]);

  const tugunOchir = async (tg: MindmapTugun) => {
    if (!tahrirMumkin) { toast(yopiqMatn || t('Faqat ko‘rish rejimi'), 'danger'); return; }
    if (!(await tasdiqSora({ matn: '«' + tg.nom + '» o\'chirilsinmi? (Bekor qilinadi, butunlay yo\'qolmaydi)', xavfli: true, tasdiqMatni: 'O‘chirish' }))) return;
    const expectedVersion = Number(tg.meta?.versiya);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      toast('Tugun versiyasi mavjud emas, qayta yuklang', 'danger');
      return;
    }
    const r = await sbMindmapTugunOchir(aktKomp, tg.tur, Number(tg.id.split(':')[1]), expectedVersion);
    if (r.ok) { toast('O\'chirildi', 'ok'); setTanlangan(null); void yangila(); }
    else toast(r.error || 'O\'chirilmadi', 'danger');
  };

  /* Owner (2026-09-10): «mind mapda egri chiziqlar juda chalkashtirar ekanda
   * ... to'g'ri chiziqlarda ideal ajraladigan tushunsa bo'ladigan qilib ber».
   *
   * Bezier egri chiziqlari bir-birini kesib o'tganda qaysi chiziq qayerga
   * borishini ko'z bilan kuzatib bo'lmasdi. O'rniga ORTOGONAL marshrut
   * (org-chart uslubi): manbadan gorizontal chiqadi, o'rtada vertikal
   * tushadi, maqsadga gorizontal kiradi -- burchaklar tik, yo'nalish aniq.
   *
   * `siljish` -- bir xil hududdagi bir nechta chiziqning vertikal segmenti
   * ustma-ust tushib, bitta qalin chiziqqa aylanib qolmasligi uchun. */
  const ortoYol = (x1: number, y1: number, x2: number, y2: number, siljish = 0) => {
    if (Math.abs(y1 - y2) < 1) return 'M ' + x1 + ' ' + y1 + ' H ' + x2;
    const cx = (x1 + x2) / 2 + siljish;
    return 'M ' + x1 + ' ' + y1 + ' H ' + cx + ' V ' + y2 + ' H ' + x2;
  };

  /** Tomon tugunining amallari (kabinet, huquqlar, aloqani tugatish) — mavjud t2_tomon_* yozuvchilari va aloqa sahifasi. */
  const tomonMaxsus = useCallback((id: string) => {
    if (!id.startsWith('tomon:')) return null;
    const tg = graf.tugunlar.find((x) => x.id === id);
    if (!tg) return null;
    const aloqaId = Number(id.split(':')[1]);
    const toxtagan = tg.meta?.holat === 'toxtatilgan';
    const yol = '/admin/kontragentlar?tab=aloqa';
    const asos = { ikon: 'kontragent' as const, modal: null, panel: null };
    const yozuv = { mumkin: tahrirMumkin, sabab: tahrirMumkin ? null : (yopiqMatn || null) };
    const huquqlar = [...tomonKarta.grantlar.entries()].filter(([kalit]) => kalit.startsWith(id + '>')).flatMap(([, g]) => g.grantIdlar);
    const amallar: MaxsusAmal[] = [
      { ...asos, kalit: 'tomon:kabinet', nom: t('Tomon kabineti (aloqa sahifasi)'), bajar: 'yol', yol, mumkin: true, sabab: null },
      { ...asos, kalit: 'tomon:huquq', nom: t('Kim nimani ko‘radi — huquqlarni o‘zgartirish'), bajar: 'yol', yol, mumkin: true, sabab: null },
      { ...asos, ...yozuv, ikon: 'uzish', kalit: 'tomon:huquq-bekor', nom: t('Barcha ko‘rish huquqlarini bekor qilish'), bajar: 'yol', yol: null, mumkin: yozuv.mumkin && huquqlar.length > 0, sabab: yozuv.mumkin ? (huquqlar.length ? null : t('Berilgan huquq yo‘q')) : yozuv.sabab,
        fn: async () => { if (!(await tasdiqSora({ matn: t('Tomonning barcha ko‘rish huquqlari bekor qilinadi. Hujjatlarning o‘zi o‘chmaydi. Davom etasizmi?'), xavfli: true }))) return; void uzishniBajar('tomon_grant_bekor', { grantIdlar: huquqlar }, bajarDeps).then((r) => { toast(r.ok ? r.xabar : r.error, r.ok ? 'ok' : 'danger'); void tomonlarniYukla(); }); } },
      { ...asos, ...yozuv, ikon: 'uzish', kalit: 'tomon:toxtat', nom: toxtagan ? t('Aloqani davom ettirish') : t('Aloqani to‘xtatish (tugatish)'), bajar: 'yol', yol: null,
        fn: async () => { if (!(await tasdiqSora({ matn: toxtagan ? t('Aloqa qayta faollashtiriladi. Davom etasizmi?') : t('Aloqa to‘xtatiladi: tomon endi hech narsani ko‘ra olmaydi. Keyin davom ettirish mumkin. Davom etasizmi?'), xavfli: !toxtagan }))) return; void (toxtagan ? aloqaHolati(aktKomp, aloqaId, 'davom') : aloqaHolati(aktKomp, aloqaId, 'toxtatish')).then((r) => { toast(r.ok ? t('Bajarildi') : (r.error || t('Bajarilmadi')), r.ok ? 'ok' : 'danger'); void tomonlarniYukla(); }); } },
    ];
    return { nom: tg.nom, amallar };
  }, [graf.tugunlar, tahrirMumkin, yopiqMatn, tomonKarta, bajarDeps, tomonlarniYukla, aktKomp]);

  /** Tugunga bosish: «Bog‘lash» rejimida — ikkinchi tugun (tap-tap); aks holda tafsilot paneli + tugun amallari menyusi (jadvaldagi bilan bir xil). */
  const tugunBosildi = (id: string, px: number, py: number) => {
    if (ulashManba) { const m = ulashManba; setUlashManba(null); if (m !== id) void chiziqniBogla(m, id); return; }
    setTanlangan(id); setTanlanganBog(null);
    if (tahrirMumkin) amalRef.current?.ochish(id, px, py);
  };
  const chiziqManba = chiziqManbaId ? joylarK[chiziqManbaId] : null;

  const tafsilot = (t: MindmapTugun) => {
    const m = t.meta || {};
    if (t.tur === 'obyekt') return m.lat != null ? '📍 ' + m.lat + ', ' + m.lng : 'lokatsiya belgilanmagan';
    if (t.tur === 'loyiha') return m.byudjet != null ? 'Byudjet: ' + Number(m.byudjet).toLocaleString() : 'byudjet belgilanmagan';
    if (t.tur === 'shartnoma') { const tm = ((m.tomonlar ?? []) as { nom?: string | null }[]).map((x) => x.nom).filter(Boolean); return tm.length ? tm.join(' · ') : (m.taraf || 'taraf ko\'rsatilmagan'); }
    if (t.tur === 'sklad') return m.manzil || 'manzil yo\'q';
    if (t.tur === 'texnika') return m.davlat_raqami || 'davlat raqami yo\'q';
    if (t.tur === 'kadr') return m.lavozim || '';
    if (t.tur === 'kontragent') return m.inn ? 'STIR ' + m.inn : 'STIR kiritilmagan';
    if (t.tur === 'zayavka') return (m.status || '—') + ' · qoldiq: ' + (m.remaining_qty ?? '—');
    return 'Bosh tashkilot';
  };

  /* Rahbar muammo chiqqan joyni tez ajratib olishi uchun canvas filtrlari.
     Filtr faqat ko'rinishni o'zgartiradi — grafdagi hech qanday yozuvni
     o'chirmaydi yoki yashirincha qayta bog'lamaydi. */
  /** Mas'ul biriktirish: ruxsat (UI oldindan) + saqlagach grafni qayta o'qish. Server baribir yakuniy to'siq. */
  const masulMumkin = useMemo(() => mindmapMasulRuxsati({ superadmin, joriy, kompaniyaId }), [superadmin, joriy, kompaniyaId]);
  const masul = useMemo(() => ({
    mumkin: masulMumkin,
    onSaqla: async (a: Parameters<typeof sbMindmapMasul>[1]) => {
      const r = await sbMindmapMasul(aktKomp, a);
      if (r.ok) await yukla();
      return r;
    },
  }), [masulMumkin, aktKomp, yukla]);
  /** Tugun amallari menyusi: sahifa ruxsatlari (menyu bilan bir manba) va «Topshiriq berish» (mavjud /api/topshiriq). */
  const amalKorish = useMemo(() => amalKorishQur({ superadmin, joriy, kompaniyaId }), [superadmin, joriy, kompaniyaId]);
  const vazifa = useMemo(() => ({
    onBer: async (a: { sarlavha: string; muddat?: string; obyektId?: number | null; foydalanuvchiId?: number | null }) => {
      const r = await topshiriqBer({ kompaniyaId: aktKomp, sarlavha: a.sarlavha, muddat: a.muddat, obyektId: a.obyektId ?? null, ijrochiFoydalanuvchiId: a.foydalanuvchiId ?? null });
      return r.ok ? { ok: true } : { ok: false, error: topshiriqXato(r) };
    },
  }), [aktKomp]);

  /** Boshqaruv pulti: mavjud buyruqlar (ruxsat/audit serverda). Yozuvdan keyin ekran yamoq bilan DARHOL yangilanadi, so'ng fonda qayta o'qiladi. */
  const pultYoz = useMemo(() => pultYozuvchi(aktKomp), [aktKomp]);
  const pult = useMemo(() => ({
    kontekst: { tahrir: ruxsat, yozuvchi: pultYoz },
    bolimlarOl: obyektBolimlariOl,
    onTugadi: ({ yamoq }: PultTugatdi) => {
      if (yamoq) {
        // Xotira keshi ham yamoqlanadi: qayta ochilganda eski bog'lanish ko'rinib qolmasin.
        setGrafToliq((g) => { const n = grafgaYamoq(g, yamoq); grafKesh.set(aktKomp, { g: n, t: Date.now() }); return n; });
        setGraf((g) => grafgaYamoq(g, yamoq));
      }
      void yangila();
    },
  }), [ruxsat, pultYoz, yangila, aktKomp]);

  const tugunMuammolari = (t: MindmapTugun) => (Array.isArray(t.meta?.belgi) ? t.meta.belgi : []) as MindmapBelgi[];
  const qidiruvKalit = qidiruv.trim().toLocaleLowerCase('uz-UZ');
  const korsatilganTugunlar = graf.tugunlar.filter((t) => {
    const belgilar = tugunMuammolari(t);
    const nomMos = !qidiruvKalit || t.nom.toLocaleLowerCase('uz-UZ').includes(qidiruvKalit);
    const holatMos = holatFiltri === 'barchasi'
      || (holatFiltri === 'etibor' && belgilar.length > 0)
      || (holatFiltri === 'zayavka' && belgilar.some((b) => b.tur === 'zayavka'));
    return nomMos && holatMos && !yashirinTur.has(t.tur);
  });
  const korsatilganIdlar = new Set(korsatilganTugunlar.map((t) => t.id));
  const korsatilganBoglar = graf.bogichlar.filter((b) => korsatilganIdlar.has(b.manba) && korsatilganIdlar.has(b.maqsad));
  // Graf komponentlariga barqaror massivlar: tuzilish o'zgarmasa simulyatsiya qayta boshlanmaydi.
  const grafKalit = korsatilganTugunlar.map((t) => t.id + '|' + t.nom + '|' + t.tur).join('~') + '#' + graf.bogichlar.map((b) => b.manba + '>' + b.maqsad).join('~');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grafTugunlar = useMemo(() => korsatilganTugunlar.map((t) => ({ id: t.id, nom: t.nom, tur: TUR_NOM[t.tur] ?? t.tur, rang: TUR_RANG[t.tur] ?? '#8a9593', markaz: t.tur === 'kompaniya' })), [grafKalit]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grafBoglar = useMemo(() => graf.bogichlar.map((b) => ({ manba: b.manba, maqsad: b.maqsad })), [grafKalit]);
  const tanlanganBogManba = tanlanganBog ? graf.tugunlar.find((t) => t.id === tanlanganBog.manba) : null;
  const tanlanganBogMaqsad = tanlanganBog ? graf.tugunlar.find((t) => t.id === tanlanganBog.maqsad) : null;

  if (korinish === 'pult' || korinish === 'xarita' || korinish === 'royxat') {
    return (
      <MindmapXarita graf={grafToliq} masul={masul} amalKorish={amalKorish} vazifa={vazifa} pult={aktKomp ? pult : undefined} yuklanmoqda={yuklanmoqda} xato={xato} oxirgiYangilanish={oxirgiYangilanish} onYangila={yukla}
        tanlangan={tanlangan} onTanla={(id) => { setTanlangan(id); setTanlanganBog(null); }}
        korinish={korinish} onKorinish={setKorinish}
        hodisalar={{ qatorlar: obyektHodisalari, yuklanmoqda: hodisaYuklanmoqda, xato: hodisaXato }}
        tahrir={ruxsat}
        onTahrirdaOch={tahrirMumkin ? (id) => { setKorinish('tahrir'); setTanlangan(id); } : undefined} />
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text overflow-hidden">
      {/* BOSHQARUV */}
      <div className="flex-shrink-0 border-b border-border bg-surface px-5 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Move size={18} className="text-[var(--info)]" /> {t('Boshqaruv pulti')}
              {saqlanmoqda && <span className="text-[10px] text-[var(--warn)] inline-flex items-center gap-1"><Save size={11} /> saqlanmoqda…</span>}
            </h1>
            <p className="text-[11px] text-text-dim mt-0.5">
              {t('Obyekt ustidagi belgi — shu obyekt bo‘yicha real e’tibor talab qiladigan holat.')}
              {' '}{t('Xarita har 30 soniyada yangilanadi (yashirin tabda to‘xtaydi)')}{tahrirMumkin ? ' · ' + t('tugunni sudrang, nuqtadan chiziq torting') : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {oxirgiYangilanish && <span className="text-[10px] text-text-mute inline-flex items-center gap-1 mr-1"><Clock size={11} /> {oxirgiYangilanish.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>}
            <KorinishTanlagich joriy={korinish} onTanla={setKorinish} className="mr-1" tahrirMumkin={tahrirMumkin} />
            {tahrirMumkin && (
              <button onClick={hammasiniQaytaTer} title={t('Hamma tugunni avtomatik joylashtirish (siz surgan joylar bekor bo‘ladi)')}
                className="px-2.5 py-2 bg-surface-2 hover:bg-[var(--surface-3)] rounded-lg inline-flex items-center gap-1.5 text-[11px]">
                <LayoutGrid size={14} /> {t('Avto-joylashtirish')}
              </button>
            )}
            <button onClick={ekrangaSigdir} title="Ekranga sig'dirish"
              className="p-2 bg-surface-2 hover:bg-[var(--surface-3)] rounded-lg"><Maximize2 size={15} /></button>
            <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.15))} className="p-2 bg-surface-2 hover:bg-[var(--surface-3)] rounded-lg"><ZoomOut size={15} /></button>
            <span className="text-[11px] text-text-mute w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} className="p-2 bg-surface-2 hover:bg-[var(--surface-3)] rounded-lg"><ZoomIn size={15} /></button>
            <button onClick={yukla} className="p-2 bg-surface-2 hover:bg-[var(--surface-3)] rounded-lg"><RefreshCcw size={15} className={yuklanmoqda ? 'animate-spin' : ''} /></button>
          </div>
        </div>

        {tahrirMumkin ? (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[11px] text-text-mute mr-1">Yangi qo'shish:</span>
            {YARATSA_BOLADI.map((y) => {
              const Ik = TUR_IKONKA[y.tur];
              return (
                <button key={y.tur} onClick={() => { setYaratModal(y.tur); setMaydonlar({}); setYaratXato(''); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border hover:bg-[var(--surface-3)] transition-colors"
                  style={{ borderColor: TUR_RANG[y.tur] + '55', color: TUR_RANG[y.tur] }}>
                  <Plus size={12} /> <Ik size={12} /> {TUR_NOM[y.tur]}
                </button>
              );
            })}
            <span className="text-[10px] text-text-mute ml-2">
              (Obyekt — «Obyektlar» sahifasidan, unga Drive papkasi ham kerak)
            </span>
          </div>
        ) : (
          <p role="note" data-testid="mindmap-faqat-oqish" className="mt-3 text-[11px] text-text-mute">{yopiqMatn}</p>
        )}

        {graf.jamlanma && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[color-mix(in_srgb,var(--info)_15%,transparent)] bg-[color-mix(in_srgb,var(--info)_5%,transparent)] px-3 py-2 text-[11px]">
            <span className="font-semibold text-[var(--info)] inline-flex items-center gap-1.5"><CheckCircle2 size={13} /> Tashkilot holati</span>
            <span className="text-text-dim">{graf.jamlanma.obyekt_soni} ta obyekt</span>
            <span className="text-text-dim">{t('Smeta (ustamasiz)')}: <b className="text-text">{pulQisqa(graf.jamlanma.smeta_jami)}</b></span>
            <span className="text-text-dim">Fakt: <b className="text-text">{pulQisqa(graf.jamlanma.fakt_jami)}</b></span>
            <span className="text-text-dim">{t('F2 (tasdiqlangan)')}: <b className="text-text">{pulQisqa(graf.jamlanma.f2_jami)}</b>
              {graf.jamlanma.f2_qoralama_jami != null && <> · {t('qoralama: {x}', { x: pulQisqa(graf.jamlanma.f2_qoralama_jami) })}</>}
              {graf.jamlanma.f2_asos !== 'tasdiqlangan' && <span className="text-[var(--warn)]"> · {t('asosi noma’lum (server yangilanmagan)')}</span>}</span>
            {graf.jamlanma.zayavka_kutilmoqda > 0 && <span className="text-[var(--warn)]">{graf.jamlanma.zayavka_kutilmoqda} ta ochiq zayavka</span>}
            {graf.jamlanma.narxsiz_obyekt > 0 && <span className="text-[var(--warn)]">{graf.jamlanma.narxsiz_obyekt} ta obyektda narx yo'q</span>}
            {graf.jamlanma.smetasiz_obyekt > 0 && <span className="text-[var(--danger)]">{graf.jamlanma.smetasiz_obyekt} ta obyektda smeta yo'q</span>}
            {(graf.jamlanma.resurssiz_obyekt ?? 0) > 0 && <span className="text-[var(--warn)]">{t('{n} ta obyektda resurs qatorlari yo‘q', { n: graf.jamlanma.resurssiz_obyekt ?? 0 })}</span>}
            {(graf.jamlanma.ortiqcha_obyekt ?? 0) > 0 && <span className="text-[var(--warn)]">{t('{n} ta obyektda F2 ortiqcha', { n: graf.jamlanma.ortiqcha_obyekt ?? 0 })}</span>}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <input
              value={qidiruv}
              onChange={(e) => { setQidiruv(e.target.value); setTanlangan(null); setTanlanganBog(null); }}
              placeholder="Obyekt, loyiha yoki resursni qidiring…"
              aria-label="Mindmap tugunlarini qidirish"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-text outline-none placeholder:text-text-mute focus:border-[color-mix(in_srgb,var(--info)_60%,transparent)]"
            />
          </div>
          <span className="text-[10px] text-text-mute">Ko'rinish:</span>
          {([
            ['barchasi', 'Barchasi'],
            ['etibor', "E'tibor kerak"],
            ['zayavka', 'Ochiq zayavka'],
          ] as const).map(([kalit, nom]) => (
            <button
              key={kalit}
              type="button"
              onClick={() => { setHolatFiltri(kalit); setTanlangan(null); setTanlanganBog(null); }}
              className={'rounded-lg border px-2.5 py-1.5 text-[10px] transition-colors ' +
                (holatFiltri === kalit ? 'border-[color-mix(in_srgb,var(--info)_60%,transparent)] bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)]' : 'border-border bg-surface-2 text-text-dim hover:text-text')}
            >{nom}</button>
          ))}
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('Tugun turlari (belgi va filtr)')} data-testid="karta-legenda">
            {([...new Set(graf.tugunlar.map((tg) => tg.tur))] as TugunTur[]).map((tur) => (
              <button key={tur} type="button" aria-pressed={!yashirinTur.has(tur)} onClick={() => setYashirinTur((o) => { const n = new Set(o); if (n.has(tur)) n.delete(tur); else n.add(tur); return n; })}
                className={'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ' + (yashirinTur.has(tur) ? 'opacity-50' : '')} style={{ borderColor: TUR_RANG[tur] + '66', color: TUR_RANG[tur] }}>
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: TUR_RANG[tur] }} />{tur === 'foydalanuvchi' ? t('Odamlar') : t(TUR_NOM[tur])}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-text-mute ml-auto">{korsatilganTugunlar.length}/{graf.tugunlar.length} tugun</span>
        </div>
      </div>

      {xato && <div className="m-3 p-3 bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[var(--danger)] rounded-lg text-sm">{xato}</div>}

      {korinish !== 'tahrir' && (
        <div className="flex-1 min-h-0">
          <Graf2D tugunlar={grafTugunlar} boglar={grafBoglar} onTanla={(id) => setTanlangan(id)} onBogla={(a, b) => void chiziqniBogla(a, b)} />
        </div>
      )}

      {/* KANVAS (tahrir rejimi) */}
      <div
        ref={wrapRef}
        className="flex-1 relative overflow-hidden touch-none"
        style={{
          display: korinish !== 'tahrir' ? 'none' : undefined,
          cursor: chiziqManbaId ? 'crosshair' : 'grab',
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: (24 * zoom) + 'px ' + (24 * zoom) + 'px',
          backgroundPosition: pan.x + 'px ' + pan.y + 'px',
        }}
        onPointerDown={bosildiBoshJoy}
        onPointerMove={harakat}
        onPointerUp={qoyibYuborildi}
        onPointerCancel={qoyibYuborildi}
        onWheel={gildirak}
      >
        <div className="absolute top-0 left-0 origin-top-left"
          style={{ transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')', width: KANVAS_W, height: KANVAS_H }}>

          <svg className="absolute inset-0 pointer-events-none" width={KANVAS_W} height={KANVAS_H}>
            {korsatilganBoglar.map((b, i) => {
              const m = joylarK[b.manba], q = joylarK[b.maqsad];
              if (!m || !q) return null;
              const manbaTur = graf.tugunlar.find((t) => t.id === b.manba)?.tur || 'obyekt';
              const rang = TUR_RANG[manbaTur];
              const d = ortoYol(
                m.x + NODE_W, m.y + TUGUN_BALANDLIGI(graf.tugunlar.find(x => x.id === b.manba)?.tur) / 2,
                q.x, q.y + TUGUN_BALANDLIGI(graf.tugunlar.find(x => x.id === b.maqsad)?.tur) / 2,
                ((i % 5) - 2) * 12,
              );
              const bogTanlangan = tanlanganBog?.manba === b.manba && tanlanganBog?.maqsad === b.maqsad && tanlanganBog?.tur === b.tur;
              return (
                <g key={b.tur + '_' + i} className="pointer-events-auto"
                  style={{ cursor: b.uzsa_boladi ? 'pointer' : 'default' }}
                  onClick={(e) => { e.stopPropagation(); setTanlanganBog(b); setTanlangan(null); }}>
                  <title>{(RUXSAT_BOGLANISH.find(r => r.tur === b.tur)?.nom || BOG_TUR_NOM[b.tur] || b.tur)} · {b.uzsa_boladi ? 'Tekshirish yoki uzish uchun bosing' : 'Tuzilmaviy bog\'lanish'}</title>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                  <path d={d} fill="none" stroke={bogTanlangan ? 'var(--text)' : rang} strokeWidth={bogTanlangan ? 4 : 2}
                    strokeOpacity={bogTanlangan ? 1 : (b.uzsa_boladi ? 0.6 : 0.25)}
                    strokeDasharray={b.tur === 'tomon_grant' ? '2,5' : b.tur === 'tomon_aloqa' ? '8,4' : b.uzsa_boladi ? 'none' : '4,4'} />
                  {(b.tur === 'tomon_aloqa' || b.tur === 'tomon_grant') && (() => {
                    const mx = (m.x + NODE_W + q.x) / 2, my2 = (m.y + q.y) / 2 + 27;
                    const oqim = tomonKarta.oqim.get(chiziqKalit(b.manba, b.maqsad));
                    return (
                      <g data-chiziq-yorliq={b.tur} className="pointer-events-none">
                        {b.tur === 'tomon_aloqa' && <text x={mx} y={my2 - 4} textAnchor="middle" fontSize={11} fill={rang}>{rolNomi(b.rol ?? '')}</text>}
                        {oqim && <g data-oqim transform={`translate(${mx} ${my2 + 8})`}><rect x={-62} y={-9} width={124} height={16} rx={8} fill="var(--warn-soft)" stroke="var(--warn)" /><text textAnchor="middle" y={3} fontSize={10} fill="var(--warn)">{oqim.matn}</text></g>}
                      </g>
                    );
                  })()}
                </g>
              );
            })}
            {chiziqManba && (
              <path d={ortoYol(chiziqManba.x + NODE_W, chiziqManba.y + TUGUN_BALANDLIGI(graf.tugunlar.find(x => x.id === chiziqManbaId)?.tur) / 2, kursor.x, kursor.y)}
                fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6,4" />
            )}
          </svg>

          {korsatilganTugunlar.map((tg) => {
            const joy = joylarK[tg.id];
            if (!joy) return null;
            const Ik = TUR_IKONKA[tg.tur];
            const rang = TUR_RANG[tg.tur];
            const nishon = chiziqManbaId != null && chiziqManbaId !== tg.id;
            const manbaTugun = chiziqManbaId ? graf.tugunlar.find((x) => x.id === chiziqManbaId) : null;
            const boglashMumkin = !!manbaTugun && (bogTuriniTop(manbaTugun.tur, tg.tur) || bogTuriniTop(tg.tur, manbaTugun.tur));
            return (
              <div key={tg.id}
                data-tugun={tg.id}
                onPointerDown={(e) => bosildiTugun(e, tg.id)}
                tabIndex={0} role="button" aria-label={tg.nom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); tugunBosildi(tg.id, e.currentTarget.getBoundingClientRect().left, e.currentTarget.getBoundingClientRect().bottom + 4); }
                  else if (e.key.toLowerCase() === 'l' && tahrirMumkin) { e.preventDefault(); setUlashManba(tg.id); }
                  else if (e.key === 'Escape') setUlashManba(null);
                }}
                onClick={(e) => { if (!rejim.current) tugunBosildi(tg.id, e.clientX, e.clientY); }}
                className={'absolute rounded-xl border bg-surface px-3 py-2 flex flex-col justify-center select-none shadow-lg ' +
                  (nishon && boglashMumkin ? 'ring-2 ring-[color-mix(in_srgb,var(--info)_70%,transparent)]' : '') + (nishon && !boglashMumkin ? 'opacity-50 ring-2 ring-[color-mix(in_srgb,var(--danger)_70%,transparent)]' : '') + (tanlangan === tg.id ? ' ring-2 ring-[var(--text)]' : '')}
                style={{ left: joy.x, top: joy.y, width: NODE_W, height: TUGUN_BALANDLIGI(tg.tur), borderColor: rang + '66', cursor: tahrirMumkin ? 'move' : 'pointer' }}>
                
                  {/* ⚠️ 2026-08-28 (Claude) — SOXTA BELGI OLIB TASHLANDI.
                      Avval shart bunday edi:
                        tg.tur === 'obyekt' && tg.nom.includes('Yangi')
                      va ekranga QATTIQ YOZILGAN «90m parog (Zayavka)»
                      chiqarilardi. Ya'ni nomida «Yangi» bo'lgan har qanday
                      obyekt hech qanday zayavkasiz ham bildirishnoma
                      ko'rsatardi — bu loyihaning eng qat'iy qoidasini
                      (soxta ma'lumot) buzardi.

                      Endi belgilar bazada HAQIQIY manbadan hisoblanadi
                      (`t2_mindmap_grafi` → `meta.belgi`): kutilayotgan
                      zayavka, narxsiz qator, eskirgan ko'zgu, yuklanmagan
                      smeta. Manba bo'sh bo'lsa belgi CHIQMAYDI. */}
                  {(() => {
                    const belgilar = (tg.meta?.belgi ?? []) as MindmapBelgi[];
                    if (!belgilar.length) return null;
                    const ogoh = belgilar.some((b) => b.daraja === 'ogoh');
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(belgiYoli(tg, belgilar[0]));
                        }}
                        title={belgilar.map((b) => '• ' + b.matn).join('\n')}
                        className={'absolute -top-2 -left-2 text-[10px] font-bold ' +
 'px-2 py-0.5 rounded-full border-2 border-[var(--surface)] shadow-lg ' +
 'flex items-center gap-1 z-20 ' +
                          (ogoh ? 'bg-[var(--warn)] hover:brightness-110' : 'bg-[var(--info)] hover:brightness-110') + ' text-[var(--on-accent)]'}>
                        <AlertTriangle size={11} />
                        {belgilar.length === 1
                          ? (belgilar[0].soni ?? '') + ' ' + (BELGI_QISQA[belgilar[0].tur] ?? belgilar[0].tur)
                          : belgilar.length + ' ogohlantirish'}
                      </button>
                    );
                  })()}

                  <div className="flex items-center gap-1.5 font-semibold text-[12px] truncate" style={{ color: rang }}>
                  <Ik size={13} className="flex-shrink-0" /><span className="truncate">{tg.nom}</span>
                </div>
                <div className="text-[10px] text-text-mute truncate">{tafsilot(tg)}</div>
                {tg.tur === 'obyekt' && tg.meta && (
                  <div className="mt-1.5 pt-1.5 border-t border-border text-[9px] text-text-dim space-y-0.5">
                    <div className="flex justify-between"><span>{t('Smeta (ustamasiz)')}:</span><span className="text-text font-medium">{tg.meta.smeta != null ? pulQisqa(tg.meta.smeta) : '—'}</span></div>
                    <div className="flex justify-between"><span>Fakt:</span><span className="text-text font-medium">{tg.meta.fakt != null ? pulQisqa(tg.meta.fakt) : '—'} {tg.meta.fakt_foiz != null ? `(${tg.meta.fakt_foiz}%)` : ''}</span></div>
                    <div className="flex justify-between"><span>{t('F2 (tasdiqlangan)')}:</span><span className="text-text font-medium">{tg.meta.f2 != null ? pulQisqa(tg.meta.f2) : '—'} {tg.meta.f2_foiz != null ? `(${tg.meta.f2_foiz}%)` : ''}</span></div>
                    {(tg.meta.signal_count ?? 0) > 0 && (
                      <div className="flex justify-between"><span>{t('Signallar')}:</span><span className={(tg.meta.critical_count ?? 0) > 0 ? 'text-[var(--danger)] font-medium' : 'text-[var(--warn)] font-medium'}>{tg.meta.signal_count}{(tg.meta.critical_count ?? 0) > 0 ? ' · ' + t('{n} kritik', { n: tg.meta.critical_count ?? 0 }) : ''}</span></div>
                    )}
                  </div>
                )}
                {(() => { const dx = tg.tur === 'loyiha' || tg.tur === 'obyekt' || tg.tur === 'shartnoma' ? daraxtK.tugunlar.get(tg.id) : null; return dx ? <div aria-hidden data-holat={dx.holat} className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ background: HOLAT_RANG[dx.holat] }} /> : null; })()}
                {tg.tur === 'tomon' && <div className="mt-0.5 text-[10px] text-text-dim truncate">{rolNomi(String(tg.meta?.rol ?? ''))}{tg.meta?.holat && tg.meta.holat !== 'faol' ? ' · ' + String(tg.meta.holat) : ''}</div>}
                {tg.tur === 'loyiha' && (() => { const dx = daraxtK.tugunlar.get(tg.id); return dx ? <div className="text-[10px] text-text-dim truncate" data-loyiha-raqam>{t('{n} ta obyekt', { n: dx.obyektSoni })} · {dx.smeta == null ? '—' : pulQisqa(dx.smeta)}{(dx.signalSoni ?? 0) > 0 ? ' · ⚠ ' + dx.signalSoni : ''}</div> : null; })()}
                <div data-boshqaruv className="absolute -top-2.5 right-1 z-20 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                  {tahrirMumkin && tg.tur !== 'kompaniya' && (<button type="button" data-karta-ulash aria-label={t('Bog‘lash') + ': ' + tg.nom} title={t('Bog‘lash: shu tugunni bosing, keyin ikkinchi tugunni')} onClick={(e) => { e.stopPropagation(); setUlashManba(tg.id); }} className="grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-text-dim hover:text-text"><Link2 size={11} /></button>)}
                  {amalRef.current?.yaratishBor(tg.id) && (<button type="button" data-karta-yarat aria-label={t('Yangi qo‘shish') + ': ' + tg.nom} title={t('Yangi qo‘shish')} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); amalRef.current?.ochish(tg.id, r.left, r.bottom + 4, true); }} className="grid h-5 w-5 place-items-center rounded-full border border-[var(--accent)] bg-surface text-[var(--accent-text)]"><Plus size={12} /></button>)}
                  {(amalRef.current?.amalSoni(tg.id) ?? 0) > 0 && (<button type="button" data-karta-amal aria-label={t('Amallar') + ': ' + tg.nom} title={t('Barcha amallar')} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); amalRef.current?.ochish(tg.id, r.left, r.bottom + 4); }} className="grid h-5 w-5 place-items-center rounded-full border border-border bg-surface text-text-dim hover:text-text"><MoreHorizontal size={12} /></button>)}
                </div>
                {tg.tur !== 'kompaniya' && tahrirMumkin && (
                  <div onPointerDown={(e) => bosildiNuqta(e, tg.id)}
                    title="Bog'lash uchun shu nuqtadan chiziq torting"
                    aria-label={tg.nom + ' uchun bog\'lash porti'}
                    className="absolute -right-[7px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg)] cursor-crosshair hover:scale-150 transition-transform"
                    style={{ background: rang }} />
                )}
              </div>
            );
          })}

          {chiziqManbaId && (
            <div className="absolute left-4 top-4 z-10 rounded-lg border border-[color-mix(in_srgb,var(--info)_30%,transparent)] bg-surface px-3 py-2 text-[10px] text-[var(--info)] shadow-lg backdrop-blur">
              Ko'k halqali tugunlar — ulash mumkin · xira tugunlar — bu tur bilan ulash mumkin emas
            </div>
          )}

          {ulashManba && (
            <div role="status" data-testid="karta-ulash-banner" className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-surface px-3 py-2 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
              <Link2 size={13} /> {t('«{x}» tanlandi — endi bog‘lanadigan ikkinchi tugunni bosing', { x: graf.tugunlar.find((tg) => tg.id === ulashManba)?.nom ?? '' })}
              <button type="button" className="fz-btn fz-btn--sm" onClick={() => setUlashManba(null)}>{t('Bekor qilish')}</button>
            </div>
          )}

          {!yuklanmoqda && graf.tugunlar.length <= 1 && (
            <div className="absolute text-text-mute text-sm" style={{ left: 60, top: 100, width: 520 }}>
              Hali tugun yo'q. Tepadagi «Yangi qo'shish» tugmalaridan loyiha, sklad,
              texnika yoki kontragent yarating — keyin ularni chiziq bilan bog'laysiz.
            </div>
          )}
          {!yuklanmoqda && graf.tugunlar.length > 1 && korsatilganTugunlar.length === 0 && (
            <div className="absolute text-text-mute text-sm" style={{ left: 60, top: 100, width: 520 }}>
              Qidiruv yoki tanlangan filtrga mos tugun topilmadi. «Barchasi»ni tanlab, qidiruvni tozalang.
            </div>
          )}
        </div>
      </div>

      {/* BOG'LANISH INSPEKTORI — noto'g'ri chiziqni avval ko'rib,
          keyin ongli ravishda uzish uchun. Chiziq endi darhol o'chmaydi. */}
      {tanlanganBog && tanlanganBogManba && tanlanganBogMaqsad && (
        <div className="absolute right-4 top-4 z-20 w-[320px] rounded-xl border border-border bg-surface p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--info)]">Bog'lanish tekshiruvi</div>
              <div className="mt-1 text-sm font-semibold text-text">{BOG_TUR_NOM[tanlanganBog.tur] || tanlanganBog.tur}</div>
            </div>
            <button type="button" onClick={() => setTanlanganBog(null)} className="text-text-mute hover:text-text" aria-label="Bog'lanish panelini yopish"><X size={16} /></button>
          </div>
          <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px]">
            <div className="flex items-center gap-2"><span className="truncate" style={{ color: TUR_RANG[tanlanganBogManba.tur] }}>{tanlanganBogManba.nom}</span><span className="text-text-mute">→</span><span className="truncate" style={{ color: TUR_RANG[tanlanganBogMaqsad.tur] }}>{tanlanganBogMaqsad.nom}</span></div>
          </div>
          {tahrirMumkin && <p className="mt-2 text-[10px] leading-relaxed text-text-dim">Chiziq noto'g'ri bo'lsa, «Bog'lanishni uzish»ni bosing. Bu tegishli yozuvlarni o'chirmaydi, faqat ular orasidagi aloqani bekor qiladi.</p>}
          {tanlanganBog.uzsa_boladi && !tahrirMumkin ? (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[10px] text-text-mute">{yopiqMatn}</div>
          ) : tanlanganBog.uzsa_boladi ? (
            <button type="button" onClick={() => chiziqUz(tanlanganBog)} className="mt-3 w-full rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[11px] font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]">Bog'lanishni uzish</button>
          ) : (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[10px] text-text-mute">Bu tuzilmaviy bog'lanish. Uni uzib bo'lmaydi.</div>
          )}
        </div>
      )}

      {/* TAFSILOT PANELI — tugun bosilganda o'ngda ochiladi */}
      {tanlanganTugun && (
        <div className="absolute right-0 top-0 bottom-0 w-[300px] bg-surface border-l border-border z-30 flex flex-col shadow-2xl">
          <div className="p-4 border-b border-border flex justify-between items-start">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider" style={{ color: TUR_RANG[tanlanganTugun.tur] }}>
                {TUR_NOM[tanlanganTugun.tur]}
              </div>
              <div className="font-bold truncate">{tanlanganTugun.nom}</div>
              <div className="text-[11px] text-text-mute mt-0.5">{tafsilot(tanlanganTugun)}</div>
            </div>
            <button onClick={() => setTanlangan(null)} className="text-text-mute hover:text-text flex-shrink-0"><X size={16} /></button>
          </div>
          {SAHIFA_YOLI[tanlanganTugun.tur] && (
            <div className="px-4 pt-3">
              <button onClick={() => navigate(SAHIFA_YOLI[tanlanganTugun.tur]!(Number(tanlanganTugun.id.split(':')[1]), tanlanganTugun.nom))} className="w-full flex items-center justify-center gap-2 bg-[var(--info)] hover:brightness-110 text-[var(--on-accent)] py-2 rounded-lg text-[11px] font-semibold transition-colors">
                To'liq sahifaga o'tish <ExternalLink size={13} />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {(tanlanganTugun.tur === 'obyekt' || tanlanganTugun.tur === 'loyiha' || tanlanganTugun.tur === 'shartnoma') && (() => {
                const lid = tanlanganTugun.meta?.loyiha_id != null ? ['loyiha:' + tanlanganTugun.meta.loyiha_id] : [];
                const linza = tomonlarLinzasi(tomonKarta, tanlanganTugun.id, lid);
                return (
                  <div data-testid="karta-tomonlar" className="mb-4 rounded-xl border border-border bg-surface-2 p-3">
                    <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--info)]"><Handshake size={12} /> {t('Tomonlar: kim nimani ko‘radi')}</h4>
                    {linza.length === 0 ? <p className="text-[11px] text-text-mute">{t('Hali hech bir tomonga ko‘rsatilmagan. Tomon tugunidan shu tugunga chiziq torting.')}</p> : (
                      <ul className="space-y-1.5">{linza.map((q) => (
                        <li key={q.tomon.id + q.doira} className="text-[11px]"><b>{q.tomon.nom}</b> <span className="text-text-dim">({rolNomi(String(q.tomon.meta?.rol ?? ''))})</span><div className="text-text-dim">{q.resurslar.join(', ')}{q.doira !== tanlanganTugun.id ? ' · ' + t('loyiha bo‘yicha') : ''}</div></li>
                      ))}</ul>
                    )}
                  </div>
                );
              })()}
              {tanlanganObyektHolati && (
                <div className="space-y-3 mb-6 bg-surface-2 p-3 rounded-xl border border-border">
                  <h4 className="text-[11px] font-bold text-[var(--info)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 size={12} /> Obyekt holati</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-surface-2 p-2 rounded-lg border border-border">
                      <div className="text-[10px] text-text-mute">{t('Smeta (ustamasiz)')}</div>
                      <div className="text-[12px] font-bold text-[var(--ok)]">{pulQisqa(tanlanganObyektHolati.smeta)}</div>
                    </div>
                    <div className="bg-surface-2 p-2 rounded-lg border border-border">
                      <div className="text-[10px] text-text-mute">{t('F2 (tasdiqlangan)')}</div>
                      <div className="text-[12px] font-bold text-[var(--info)]">{pulQisqa(tanlanganObyektHolati.f2)}</div>
                      <div className="text-[10px] text-text-mute">{t('qoralama: {x}', { x: pulQisqa(tanlanganObyektHolati.f2_qoralama) })}</div>
                    </div>
                  </div>
                  {tanlanganObyektHolati.f2_asos !== 'tasdiqlangan' && (
                    <div className="text-[10px] text-[var(--warn)]">{t('F2 asosi noma’lum: server hali yangilanmagan, qoralama ham hisoblangan bo‘lishi mumkin.')}</div>
                  )}
                  {(tanlanganObyektHolati.signal_count ?? 0) > 0 && (
                    <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-2.5 space-y-1.5" data-testid="tahrir-signallar">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--danger)]"><AlertTriangle size={12} /> {t('Ochiq signallar')}: {tanlanganObyektHolati.signal_count}{(tanlanganObyektHolati.critical_count ?? 0) > 0 ? ' · ' + t('{n} kritik', { n: tanlanganObyektHolati.critical_count ?? 0 }) : ''}</div>
                      {(tanlanganObyektHolati.top_signals ?? []).slice(0, 3).map((sg: MindmapSignal, i: number) => <div key={i} className="text-[11px] text-text">{sg.title || t('Nomsiz signal')}</div>)}
                    </div>
                  )}
                  {(tanlanganObyektHolati.belgi?.length ?? 0) > 0 && (
                    <div className="rounded-lg border border-[color-mix(in_srgb,var(--warn)_25%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--warn)]"><AlertTriangle size={12} /> E'tibor kerak</div>
                      {tanlanganObyektHolati.belgi?.map((b: MindmapBelgi, i: number) => <div key={i} className="text-[11px] text-[var(--warn)]">{b.matn}</div>)}
                    </div>
                  )}
                  <div className="bg-surface-2 p-2 rounded-lg border border-border space-y-2 text-[11px]">
                    <div className="flex justify-between"><span className="text-text-dim">Fakt</span><span className="text-text font-bold">{pulQisqa(tanlanganObyektHolati.fakt)}</span></div>
                    <div className="flex justify-between"><span className="text-text-dim">{t(tanlanganObyektHolati.foiz_maxraj === 'joriy' ? 'Fakt / (smeta + o‘zgarishlar)' : 'Fakt / smeta (ustamasiz)')}</span><span className="text-text font-bold">{tanlanganObyektHolati.fakt_foiz == null ? '—' : tanlanganObyektHolati.fakt_foiz + '%'}</span></div>
                    <div className="flex justify-between"><span className="text-text-dim">{t(tanlanganObyektHolati.foiz_maxraj === 'joriy' ? 'F2 (tasdiqlangan) / (smeta + o‘zgarishlar)' : 'F2 (tasdiqlangan) / smeta')}</span><span className="text-text font-bold">{tanlanganObyektHolati.f2_foiz == null ? '—' : tanlanganObyektHolati.f2_foiz + '%'}</span></div>
                    <div className="flex justify-between"><span className="text-text-dim">Resurs qatorlari</span><span className="text-text font-bold">{tanlanganObyektHolati.resurs_qatori ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-text-dim">Narxsiz qatorlar</span><span className={(tanlanganObyektHolati.narxsiz ?? 0) > 0 ? 'text-[var(--warn)] font-bold' : 'text-[var(--ok)] font-bold'}>{tanlanganObyektHolati.narxsiz ?? '—'}</span></div>
                    <div className="flex justify-between"><span className="text-text-dim">Hisob holati</span><span className={tanlanganObyektHolati.toliq === false ? 'text-[var(--warn)] font-bold' : 'text-[var(--ok)] font-bold'}>{tanlanganObyektHolati.toliq == null ? '—' : tanlanganObyektHolati.toliq ? 'To‘liq' : 'To‘liq emas'}</span></div>
                    <button type="button" onClick={() => navigate(obyektZayavkaYoli(tanlanganTugun!.entity_id ?? Number(tanlanganTugun!.id.split(':')[1])))} className="w-full mt-1 rounded-lg bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-2 py-1.5 text-[var(--warn)] hover:bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-left">
                      Ochiq zayavkalar: <b>{tanlanganObyektHolati.zayavka ?? '—'}</b>
                    </button>
                  </div>
                </div>
              )}

              {tanlanganTugun.tur === 'shartnoma' && (() => {
                const sm = (tanlanganTugun.meta ?? {}) as ShartnomaMeta;
                const loyihaNom = sm.loyiha_id != null ? graf.tugunlar.find((x) => x.id === 'loyiha:' + sm.loyiha_id)?.nom : undefined;
                const obyektNomlari = (sm.obyekt_idlar ?? []).map((id) => graf.tugunlar.find((x) => x.id === 'obyekt:' + id)?.nom ?? '#' + id);
                const tomonlar = (sm.tomonlar ?? []).filter((x) => x.nom);
                return (
                  <div className="space-y-3 mb-6 bg-surface-2 p-3 rounded-xl border border-border" data-testid="shartnoma-malumot">
                    <h4 className="text-[11px] font-bold text-[var(--ok)] uppercase tracking-wider mb-2 flex items-center gap-1.5"><FileText size={12} /> {t('Shartnoma holati')}</h4>
                    <div className="bg-surface-2 p-2 rounded-lg border border-border space-y-2 text-[11px]">
                      <div className="flex justify-between"><span className="text-text-dim">{t('Summa (NDS bilan)')}:</span><span className="text-text font-bold">{sm.summa != null ? pulQisqa(sm.summa) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-text-dim">{t('Summa (NDS siz)')}:</span><span className="text-text font-bold">{sm.summa_bez_nds != null ? pulQisqa(sm.summa_bez_nds) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-text-dim">{t('Holat')}:</span><span className="text-text font-bold capitalize">{sm.holat || '—'}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-text-dim">{t('Tomonlar')}:</span><span className="text-text font-bold text-right">{tomonlar.length ? tomonlar.map((x) => (x.rol ? x.rol + ': ' : '') + x.nom).join(' · ') : (sm.taraf || '—')}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-text-dim">{t('Loyiha')}:</span><span className="text-text font-bold text-right">{sm.loyiha_id == null ? '—' : (loyihaNom ?? '#' + sm.loyiha_id)}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-text-dim">{t('Obyektlar')}:</span><span className="text-text font-bold text-right">{sm.obyekt_soni == null ? '—' : sm.obyekt_soni === 0 ? t('biriktirilmagan') : obyektNomlari.join(', ')}</span></div>
                    </div>
                  </div>
                );
              })()}
              {tanlanganTugun?.tur === 'obyekt' && (
                <div className="rounded-xl border border-border bg-surface-2 p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-dim"><Clock size={12} /> So'nggi hodisalar</h4>
                  {hodisaYuklanmoqda && <div className="text-[10px] text-text-mute">Hodisa tarixi yuklanmoqda…</div>}
                  {!hodisaYuklanmoqda && hodisaXato && <div className="text-[10px] text-[var(--warn)]">Hodisa tarixi mavjud emas: {hodisaXato}</div>}
                  {!hodisaYuklanmoqda && !hodisaXato && obyektHodisalari.length === 0 && <div className="text-[10px] text-text-mute">Bu obyekt uchun hali muhim hodisa yozilmagan.</div>}
                  {!hodisaYuklanmoqda && obyektHodisalari.length > 0 && (
                    <div className="space-y-2">
                      {obyektHodisalari.slice(0, 5).map((h) => (
                        <div key={h.id} className="flex gap-2 text-[10px]">
                          <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: MODUL_RANG[h.modul] || 'var(--text-mute)' }} />
                          <div className="min-w-0 flex-1"><div className="text-text">{h.satr || h.tafsilot || h.amal_turi}</div><div className="mt-0.5 text-text-mute">{qachon(h.yaratilgan_vaqt)}{h.kim ? ' · ' + h.kim : ''}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="text-[11px] text-text-dim mb-2">Bog'lanishlari ({tanlanganBoglar.length})</div>
              {tanlanganBoglar.length === 0 && (
                <p className="text-[11px] text-text-mute">{tahrirMumkin ? 'Hali hech narsaga bog\'lanmagan — o\'ng chetidagi nuqtadan chiziq torting.' : 'Hali hech narsaga bog\'lanmagan.'}</p>
              )}
              <div className="space-y-1.5">
                {tanlanganBoglar.map((b, i) => {
                  const qarshi = b.manba === tanlangan ? b.maqsad : b.manba;
                  const qt = graf.tugunlar.find((t) => t.id === qarshi);
                  if (!qt) return null;
                  const Ik = TUR_IKONKA[qt.tur];
                  return (
                    <div key={i} onClick={(e) => { e.stopPropagation(); setTanlanganBog(b); setTanlangan(null); }} className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-2 py-1.5 cursor-pointer hover:border-[color-mix(in_srgb,var(--info)_40%,transparent)]">
                      <Ik size={13} style={{ color: TUR_RANG[qt.tur] }} className="flex-shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-[11px] truncate">{qt.nom}</span><span className="block text-[9px] truncate text-text-mute">{b.rol ? `${RUXSAT_BOGLANISH.find(r => r.tur === b.tur)?.nom || BOG_TUR_NOM[b.tur] || b.tur} (${b.rol})` : (RUXSAT_BOGLANISH.find(r => r.tur === b.tur)?.nom || BOG_TUR_NOM[b.tur] || b.tur)}</span></span>
                      {b.uzsa_boladi && tahrirMumkin && (
                        <button onClick={() => chiziqUz(b)} title="Bog'lanishni uzish"
                          className="text-text-mute hover:text-[var(--danger)] flex-shrink-0"><Unlink size={12} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              {tanlanganTugun.tur === 'kontragent' && (
                <div className="rounded-xl border border-border bg-surface-2 p-3 mb-2">
                  <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-dim"><Users size={12} /> Ishtirok ma'lumotlari</h4>
                  <div className="space-y-2 text-[11px]">
                     <div className="flex justify-between"><span className="text-text-dim">STIR (INN):</span><span className="text-text font-bold">{tanlanganTugun.meta?.inn || '—'}</span></div>
                     <div className="mt-2 border-t border-border pt-2 text-text-dim">Loyihalardagi rollari:</div>
                     {tanlanganBoglar.filter(b => b.tur === 'qatnashchi').length === 0 ? <span className="text-text-mute">Hali loyihalarga biriktirilmagan</span> : null}
                     {tanlanganBoglar.filter(b => b.tur === 'qatnashchi').map((b, idx) => {
                         const l = graf.tugunlar.find(t => t.id === (b.manba === tanlanganTugun.id ? b.maqsad : b.manba));
                         return <div key={idx} className="flex justify-between"><span className="text-text-dim truncate max-w-[150px]">{l?.nom || '—'}</span><span className="text-[var(--info)] font-bold">{b.rol || 'Biriktirilgan'}</span></div>;
                     })}
                  </div>
                </div>
              )}
              {tanlanganTugun.tur === 'obyekt' && (
                <>
                  <button type="button" onClick={() => taminotDrilldown(tanlanganTugun.entity_id ?? Number(tanlanganTugun.id.split(':')[1]))}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] py-2 text-[12px] text-[var(--warn)] hover:bg-[color-mix(in_srgb,var(--warn)_25%,transparent)]">
                    <FileText size={13} /> Mindmapda zayavkalarni ko'rish
                  </button>
                  <button type="button" onClick={() => navigate(obyektZayavkaYoli(tanlanganTugun.entity_id ?? Number(tanlanganTugun.id.split(':')[1])))}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] py-2 text-[12px] text-[var(--warn)] hover:bg-[color-mix(in_srgb,var(--warn)_25%,transparent)] mt-2">
                    <AlertTriangle size={13} /> Zayavkalarni boshqarish
                  </button>
                  <button type="button" onClick={() => navigate(obyektZayavkaYoli(tanlanganTugun.entity_id ?? Number(tanlanganTugun.id.split(':')[1]), true))} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] py-2 text-[12px] text-[var(--accent-text)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] mt-2">
                    <Plus size={13} /> Yangi zayavka
                  </button>
                </>
              )}
              {SAHIFA_YOLI[tanlanganTugun.tur] && (
                <button onClick={() => navigate(SAHIFA_YOLI[tanlanganTugun.tur]!(Number(tanlanganTugun.id.split(':')[1]), tanlanganTugun.nom))}
                  className="w-full inline-flex items-center justify-center gap-2 bg-surface-2 hover:bg-[var(--surface-3)] py-2 rounded-lg text-[12px]">
                  <ExternalLink size={13} /> To'liq sahifada ochish
                </button>
              )}
              {OCHIRSA_BOLADI.includes(tanlanganTugun.tur) && tahrirMumkin && (
                <button onClick={() => tugunOchir(tanlanganTugun)}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[color-mix(in_srgb,var(--danger)_35%,transparent)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_35%,transparent)] text-[var(--danger)] py-2 rounded-lg text-[12px]">
                  <Trash2 size={13} /> O'chirish
                </button>
              )}
              {tanlanganTugun.tur === 'obyekt' && (
                <p className="text-[10px] text-text-mute">
                  Obyekt mindmapdan o'chirilmaydi — unda smeta/F2/pul bor, «Obyektlar» sahifasi orqali.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QO'LLANMA */}
      <div className="flex-shrink-0 border-t border-border bg-surface px-5 py-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
        {RUXSAT_BOGLANISH.map((r) => (
          <span key={r.tur} className="text-[10px] text-text-mute">
            <span style={{ color: TUR_RANG[r.manba] }}>{TUR_NOM[r.manba]}</span>
            <span className="mx-1">→</span>
            <span style={{ color: TUR_RANG[r.maqsad] }}>{TUR_NOM[r.maqsad]}</span>
          </span>
        ))}
        <span className="text-[10px] text-text-mute inline-flex items-center gap-1 ml-auto">
          {tahrirMumkin ? <><Unlink size={11} /> chiziqni bosing → tekshirib uzing</> : yopiqMatn}
        </span>
      </div>

      {/* YANGI TUGUN */}
      {yaratModal && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] flex items-center justify-center z-50 p-4" onClick={() => !yaratSaqlanmoqda && setYaratModal(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="mindmap-create-title" className="cc-panel p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <div className="cc-kicker">Yangi yozuv</div>
                <h3 id="mindmap-create-title" className="font-bold mt-1" style={{ color: TUR_RANG[yaratModal] }}>{TUR_NOM[yaratModal]} yaratish</h3>
                <p className="text-[11px] text-text-dim mt-1">Saqlangandan keyin real ID bilan xaritada paydo bo‘ladi.</p>
              </div>
              <button disabled={yaratSaqlanmoqda} onClick={() => setYaratModal(null)} className="text-text-mute hover:text-text disabled:opacity-40" aria-label="Yopish"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {YARATSA_BOLADI.find((y) => y.tur === yaratModal)?.maydonlar.map((m) => (
                <div key={m.kalit}>
                  <label className="block text-[11px] text-text-dim mb-1">
                    {m.nom}{m.majburiy && <span className="text-[var(--danger)]"> *</span>}
                  </label>
                  <input value={maydonlar[m.kalit] || ''}
                    onChange={(e) => setMaydonlar({ ...maydonlar, [m.kalit]: e.target.value })}
                    autoFocus={m.majburiy}
                    disabled={yaratSaqlanmoqda}
                    aria-required={m.majburiy}
                    className="cc-field w-full px-3 py-2 text-sm outline-none disabled:opacity-60" />
                </div>
              ))}
            </div>
            {yaratXato && (
              <div role="alert" className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[11px] text-[var(--danger)]">
                <div className="font-semibold">Yaratib bo‘lmadi</div>
                <div className="mt-1">{yaratXato}</div>
                <details className="mt-2 text-text-dim"><summary className="cursor-pointer">Texnik tafsilot</summary><code className="mt-1 block break-words text-[10px]">{yaratXato}</code></details>
              </div>
            )}
            <button onClick={tugunYarat} disabled={yaratSaqlanmoqda} className="w-full mt-4 bg-[var(--info)] hover:brightness-110 text-[var(--on-accent)] py-2 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-wait inline-flex items-center justify-center gap-2">
              {yaratSaqlanmoqda && <RefreshCcw size={14} className="animate-spin" />}
              {yaratSaqlanmoqda ? 'Saqlanmoqda…' : 'Yaratish'}
            </button>
          </div>
        </div>
      )}

      {/* KARTA: chiziq tasdiq kartasi + tugun amallari (jadvaldagi bilan bir xil) */}
      {tasdiqQoida && (
        <BoglanishTasdiq qoida={tasdiqQoida} kompaniyaId={aktKomp} deps={bajarDeps} rollar={ROLLAR} onYop={() => setTasdiqQoida(null)} onYol={(yol) => { setTasdiqQoida(null); navigate(yol); }}
          onTugadi={(xabar) => { setTasdiqQoida(null); toast(xabar, 'ok'); void yangila(); void tomonlarniYukla(); }} />
      )}
      <AmalQatlami ref={amalRef} maxsusOl={tomonMaxsus} graf={grafToliq} pult={aktKomp ? pult : undefined} amalKorish={amalKorish} masul={masul} vazifa={vazifa} onTanla={(id) => { setTanlangan(id); setTanlanganBog(null); }} />

      {/* ROL TANLASH */}
      {rolModal && (
        <div className="fixed inset-0 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] flex items-center justify-center z-50 p-4" onClick={() => !rolSaqlanmoqda && setRolModal(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="mindmap-role-title" className="cc-panel p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="cc-kicker">Participant relation</div>
                <h3 id="mindmap-role-title" className="font-bold text-[var(--kat-ob)] mb-1 mt-1">Loyihadagi rolni tanlang</h3>
                <p className="text-[11px] text-text-dim mb-4">Rol tanlanmaguncha aloqa saqlanmaydi.</p>
              </div>
              <button disabled={rolSaqlanmoqda} onClick={() => setRolModal(null)} className="text-text-mute hover:text-text disabled:opacity-40" aria-label="Yopish"><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {ROLLAR.map((r) => (
                <button key={r.kalit} type="button" aria-pressed={rolTanlov === r.kalit} onClick={() => { setRolTanlov(r.kalit); setRolXato(''); }}
                  className={'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ' + (rolTanlov === r.kalit ? 'border-[color-mix(in_srgb,var(--kat-ob)_70%,transparent)] bg-[color-mix(in_srgb,var(--kat-ob)_15%,transparent)] text-text' : 'bg-surface-2 border-border hover:border-[color-mix(in_srgb,var(--kat-ob)_50%,transparent)] text-text-dim')}>
                  {r.nom}
                </button>
              ))}
            </div>
            {rolXato && <div role="alert" className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[11px] text-[var(--danger)]">{rolXato}</div>}
            <button type="button" onClick={rolniTasdiqla} disabled={rolSaqlanmoqda} className="w-full mt-4 bg-[var(--kat-ob)] hover:brightness-110 text-[var(--on-accent)] py-2 rounded-lg font-medium text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {rolSaqlanmoqda && <RefreshCcw size={14} className="animate-spin" />}
              {rolSaqlanmoqda ? 'Rol saqlanmoqda…' : 'Rolni saqlash'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
