import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSessiya } from '../api/hooks';
import { AlertTriangle, ChevronDown, ChevronRight, Archive, ShieldCheck, Crown } from 'lucide-react';
import { Map, LogOut, Building2, FileInput, Activity, Tags, Network, Calculator, FileOutput, HardHat, ShieldAlert, Settings, FileText, Link2, FileStack, NotebookPen, Database, Gauge, FlaskConical, LayoutDashboard, BarChart, ClipboardList, Briefcase, Box, Trash2, Users, FolderKanban, Menu, X } from 'lucide-react';
import F2NavbatChip from '../umumiy/ui/F2NavbatChip';
import { menyuTekshirDev } from '../umumiy/marshrutTekshir';
import { KompaniyaProvider, useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaLogoRasm } from '../umumiy/hujjat/KompaniyaLogo';
import { KompaniyaTanlagich } from '../umumiy/kontekst/KompaniyaTanlagich';
import { PTOWorkspaceBar, PTOWorkspaceProvider } from '../umumiy/kontekst/PTOWorkspaceContext';
import { RuxsatGuard } from '../umumiy/kontekst/RuxsatGuard';
import { tizimdanChiq } from '../umumiy/kontekst/chiqish';
import { t } from '../i18n/til';
import { TilTanlagich } from '../i18n/TilTanlagich';

/* 2026-10-02 (egasi): menyu product relsi bo'yicha qayta tuzildi — "oddiy PTO ham, o'zim ham
 * adashmasin". Tartib = ish ketma-ketligi: PTO ish yo'li → narx → loyiha/shartnoma → kompaniya
 * boshqaruvi → hisob → tizim. Rol faqat KO'RINISHNI qisqartiradi (pastdagi filtr), tuzilma hamma
 * uchun bir xil. Har yo'l faqat BIR joyda (takror yo'q). Server tekshiruvi — yakuniy qo'riqchi. */
const TIZIM_02_GURUHLAR = [
  {
    /* Egasi 2026-10-02: platforma boshqaruv paneli — faqat superadmin ko'radi (server ham tekshiradi). */
    nom: 'Platforma boshqaruvi',
    Ikonka: Crown,
    id: 'boshqaruv',
    menyular: [
      { yol: '/admin/boshqaruv', nom: 'Boshqaruv paneli', Ikonka: Crown },
    ]
  },
  {
    nom: 'PTO ish yo‘li',
    Ikonka: FileText,
    id: 'pto',
    menyular: [
      { yol: '/admin/obyektlar', nom: 'Obyektlar va smeta yuklash', Ikonka: Building2 },
      { yol: '/admin/smeta-studio', nom: 'Smeta studiyasi', Ikonka: Calculator },
      { yol: '/admin/holat', nom: 'Smeta va Fakt / LRV', Ikonka: FileText },
      { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', Ikonka: FileOutput },
      { yol: '/admin/f2-tarix', nom: 'F2 tarixi va tasdiqlash', Ikonka: ShieldCheck },
      { yol: '/admin/nakopitelniy', nom: 'Nakopitelniy va F3', Ikonka: NotebookPen },
      { yol: '/admin/m29', nom: 'M-29 (material sarfi)', Ikonka: Box },
      { yol: '/admin/aosr', nom: 'АОСР va laboratoriya', Ikonka: ShieldCheck },
      { yol: '/admin/f2', nom: 'F2 import (tayyor F2 faylidan)', Ikonka: FileInput },
    ]
  },
  {
    nom: 'Narx va oferta',
    Ikonka: Tags,
    id: 'narx',
    menyular: [
      { yol: '/admin/smeta-narxlash', nom: 'Smetani narxlash (RES)', Ikonka: Tags },
      { yol: '/admin/oferta', nom: 'Tender oferta', Ikonka: FileOutput },
      { yol: '/admin/narx-manbalari', nom: 'Narx manbalari (katalog, faktura, КП)', Ikonka: Calculator },
      { yol: '/admin/narx-dalil', nom: 'Narx dalili (Обоснование цен)', Ikonka: Calculator },
      { yol: '/admin/nakrutka', nom: 'Nakrutka (ustama)', Ikonka: Calculator },
      { yol: '/admin/narxlar', nom: 'Narxlar nazorati', Ikonka: Tags },
    ]
  },
  {
    nom: 'Loyiha va shartnoma',
    Ikonka: FolderKanban,
    id: 'loyiha',
    menyular: [
      { yol: '/admin/loyiha', nom: 'Loyihalar', Ikonka: FolderKanban },
      { yol: '/admin/shartnoma-liniya', nom: 'Shartnomalar va tomonlar', Ikonka: Briefcase },
      { yol: '/admin/documents', nom: 'Hujjatlar', Ikonka: FileStack },
      { yol: '/admin/hujjat-nazorat', nom: 'Hujjat nazorati', Ikonka: FileOutput },
      { yol: '/admin/participants', nom: 'Loyiha ishtirokchilari', Ikonka: Users },
      { yol: '/admin/crm', nom: 'Kontragentlar (CRM/EDO)', Ikonka: Users },
    ]
  },
  {
    nom: 'Kompaniya boshqaruvi',
    Ikonka: LayoutDashboard,
    id: 'kompaniya',
    menyular: [
      { yol: '/admin/dashboard', nom: 'Rahbar paneli', Ikonka: BarChart },
      { yol: '/admin/moliya', nom: 'Moliya (to‘lov, xarajat)', Ikonka: Briefcase },
      { yol: '/admin/logistika', nom: 'Ta‘minot va sklad', Ikonka: Box },
      { yol: '/admin/zayavka', nom: 'Zayavkalar', Ikonka: ClipboardList },
      { yol: '/admin/erp', nom: 'Kadrlar va texnika', Ikonka: Users },
      { yol: '/admin/mindmap', nom: 'Mindmap (xarita)', Ikonka: Map },
    ]
  },
  {
    nom: 'Hisob',
    Ikonka: Settings,
    id: 'hisob',
    menyular: [
      { yol: '/admin/tokenlar', nom: 'Tokenlar va obuna', Ikonka: Gauge },
      { yol: '/admin/kompaniya', nom: 'Kompaniya va a‘zolar', Ikonka: Building2 },
      { yol: '/admin/hujjat-dizayn', nom: 'Hujjatlar dizayni', Ikonka: FileText },
      { yol: '/admin/tizim-sozlama', nom: 'Sozlamalar', Ikonka: Settings },
    ]
  },
  {
    nom: 'Tizim (admin)',
    Ikonka: ShieldAlert,
    id: 'tizim',
    menyular: [
      { yol: '/admin/system-control', nom: 'Tizim boshqaruv markazi', Ikonka: ShieldAlert },
      { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', Ikonka: FlaskConical },
      { yol: '/admin/sayt-xaritasi', nom: 'Sayt xaritasi', Ikonka: Map },
      { yol: '/admin/storage', nom: 'Fayl saqlash (Storage)', Ikonka: HardHat },
      { yol: '/admin/fayl-boglash', nom: 'Fayl bog‘lash', Ikonka: Link2 },
      { yol: '/admin/korzinka', nom: 'Korzinka', Ikonka: Trash2 },
    ]
  }
];

/* 2026-09-07: bu ro'yxat avval 16 ta yozuvdan iborat edi va yarmi
 * `TIZIM_02_GURUHLAR`dagi Wrapper sahifalar (Moliya/Logistika/ERP/AOSR)
 * bilan AYNAN bir xil funksiyani ikkinchi marta ko'rsatardi (Shartnomalar,
 * Fakturalar, Sklad, Kadrlar, Texnika, Ta'minot, Sifat, Hujjatlar,
 * Sozlamalar) -- foydalanuvchi: "bitta funksiya bir nechta joylarga
 * takrorlanganda tushunmayman, odamni chalkashtirib qo'yadi". Aniq
 * dublikatlar OLIB TASHLANDI (marshrutning o'zi App.tsx'da qoldi --
 * eski chuqur havolalar buzilmaydi, faqat menyudan yashirilgan).
 *
 * 2026-09-07 (2): foydalanuvchi -- "eski tizim1ga tegishli hammasini
 * pastdagi tizim1 oilasiga qo'shib tashla, umuman hozirgi aktual ishga
 * aralashmasin". Qolgan yozuvlarning HECH biri T2 native quvuriga
 * (Smeta/F2/Nakopitelniy/Nakrutka/Narx nazorati/Loyihalar/Obyektlar/
 * Hujjat nazorati) tegishli EMAS -- bularning barchasi T1 GAS davridan
 * qolgan mustaqil sahifalar yoki sof dev/diagnostika vositalari. Shu
 * sabab BITTA aniq "Tizim 1 (eski)" oilasiga jamlangan, standart holatda
 * YOPIQ (yuqoridagi `useState(false)`) va faqat shu bo'limda -- yuqoridagi
 * `TIZIM_02_GURUHLAR` (joriy aktual ish) bilan hech qanday umumiy nom,
 * yo'l yoki komponent bo'lishmaydi. */
const ESKI_TIZIM_MENYU = [
  { yol: '/admin/buxgalteriya', nom: 'Buxgalteriya', Ikonka: Calculator },
  { yol: '/admin/ierarxiya',  nom: 'Ierarxiya',    Ikonka: Network },
  { yol: '/admin/monitoring', nom: 'Monitoring',   Ikonka: Activity },
  { yol: '/admin/shaxsiy-smeta', nom: 'Shaxsiy smeta', Ikonka: NotebookPen },
  { yol: '/admin/supabase', nom: 'Supabase', Ikonka: Database },
  { yol: '/admin/tezlik', nom: 'Tezlik sinovi', Ikonka: Gauge },
];

/* T2-PRODUCT-RECOVERY P0: `t2_effective_authorization_core_v1`ning o'z
 * ruxsat jadvaliga mos (frontend/functions dagi RPC bilan bir xil manba
 * — biri o'zgarsa ikkinchisi ham yangilanishi kerak). Faqat shu rollarda
 * HECH QANDAY `.write` ruxsati yo'q. `boss` BU YERDA YO'Q — u to'liq
 * yozish huquqiga ega. */
const YOZA_OLMAYDIGAN_ROLLAR = new Set(['rahbar', 'buyurtmachi', 'pudratchi', 'kuzatuvchi']);

export default function AdminShell() {
  return (
    <KompaniyaProvider>
      <PTOWorkspaceProvider>
        <AdminShellInner />
      </PTOWorkspaceProvider>
    </KompaniyaProvider>
  );
}

/** T2-COMPANY-CONTROL-CLOSEOUT Phase A P0 #1/#2: the sidebar and the role
 * badge used to read `sess.data?.rol` — ONE global role from /api/sessiya,
 * ignoring which company is active. A user who is "boss" in company A and
 * "pto" in company B saw the SAME (wrong) menu after switching. This inner
 * component sits INSIDE <KompaniyaProvider/> so it can read the per-company
 * effective role (`joriy.rol`, re-derived from t2_men_v1 on every company
 * switch) instead. */
function AdminShellInner() {
  const sess = useSessiya();
  const k = useKompaniya();
  const joy = useLocation();
  // Effective role for THIS render: the active company's own membership
  // role, or a platform-level label when no company is selected. Never the
  // stale global session role.
  const effektivRol: string = k.globalRejim ? 'superadmin' : (k.joriy?.rol ?? '');

  // Avtomatik ochish logikasi -- standart YOPIQ (2026-09-07: bu bo'lim
  // hamma vaqt ochiq turgani "sayt eski/chalkash ko'rinadi" shikoyatining
  // asosiy sababi edi -- endi faqat kerak bo'lganda, o'zi ochadi).
  const eskiIchida = ESKI_TIZIM_MENYU.some((m) => joy.pathname.startsWith(m.yol));
  const [eskiOchiq, setEskiOchiq] = useState(false);
  // Sidebar sichqoncha kelganda kengayadi, aks holda faqat belgichalar
  // (ikonalar) qatori -- foydalanuvchi: "yon panelni sichqoncha borsa
  // katta ochiladigan bo'lmasa faqat belgichalari ko'rinib turadigan".
  const [kengaygan, setKengaygan] = useState(false);
  const [mobilMenyuOchiq, setMobilMenyuOchiq] = useState(false);
  const sidebarKengaygan = kengaygan || mobilMenyuOchiq;

  // Qaysi guruhlar ochiq ekanligini saqlash
  const [ochiqGuruhlar, setOchiqGuruhlar] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    TIZIM_02_GURUHLAR.forEach(g => {
      // Agar ochiq sahifa shu guruhga tegishli bo'lsa, uni ochamiz
      d[g.id] = g.id === 'pto' || g.id === 'boshqaruv' || g.menyular.some(m => joy.pathname.startsWith(m.yol));
    });
    return d;
  });

  useEffect(() => { if (eskiIchida) setEskiOchiq(true); }, [eskiIchida]);
  useEffect(() => { setMobilMenyuOchiq(false); }, [joy.pathname]);

  const toggleGuruh = (id: string) => {
    setOchiqGuruhlar(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const barchaYollar = TIZIM_02_GURUHLAR.flatMap(g => g.menyular.map(m => m.yol)).concat(ESKI_TIZIM_MENYU.map(m => m.yol));
  menyuTekshirDev(barchaYollar);

  useEffect(() => {
    if (sess.isError && sess.error?.message === "Sessiya yo'q") {
      console.warn("[AdminShell] sessiya tekshiruvi 401 qaytardi.");
    }
  }, [sess.isError, sess.error]);

  const handleLogout = tizimdanChiq;

  if (sess.isLoading) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-dim text-sm">Kirish tekshirilmoqda…</p>
        </div>
      </div>
    );
  }

  const sessiyaYoq = sess.isError && (sess.error as Error)?.message === "Sessiya yo'q";

  if (sessiyaYoq) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <AlertTriangle size={28} className="text-warn mx-auto mb-3" />
          <p className="text-text font-medium mb-1">Kirish talab qilinadi</p>
          <p className="text-text-dim text-sm mb-4">Sessiya topilmadi yoki muddati tugagan.</p>
          <button onClick={() => { window.location.href = '/'; }} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors">
            Kirish sahifasiga
          </button>
        </div>
      </div>
    );
  }

  if (sess.isError) {
    return (
      <div className="h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <AlertTriangle size={28} className="text-warn mx-auto mb-3" />
          <p className="text-text font-medium mb-1">Server bilan aloqa yo'q</p>
          <p className="text-text-dim text-sm mb-1">Vaqtinchalik nosozlik.</p>
          <button onClick={() => sess.refetch()} disabled={sess.isFetching} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50">
            {sess.isFetching ? 'Tekshirilmoqda…' : 'Qayta urinish'}
          </button>
        </div>
      </div>
    );
  }

  // Master Plan 4. ROLLAR VA WORKSPACE — endi JORIY KOMPANIYADAGI effektiv
  // roldan (`effektivRol`), sessiyadagi bitta global roldan EMAS. Shu tufayli
  // A kompaniyada boss / B kompaniyada pto bo'lgan foydalanuvchi kompaniya
  // almashtirganda menyu HAM almashadi (Antigravity FINAL-AUDIT-002 P0 #1/#2).
  //
  // 'global' (Kompaniya, Tizim boshqaruv markazi) va 'tizim' (Sozlama)
  // guruhlari HAR DOIM ko'rinadi — /admin/kompaniya har bir a'zoning o'z
  // profili/kompaniyasini boshqaradigan universal markazi, rolga bog'liq
  // emas. Faqat kompaniya-ish ('asosiy'/'operatsion') roldan kelib chiqib
  // filtrlanadi. Server tomon (RuxsatGuard, RPC ichidagi tekshiruv) yakuniy
  // qo'riqchi — bu yerdagi filtr faqat menyu tuzilishi, xavfsizlik chegarasi
  // EMAS.
  const filtrKilinganGuruhlar = TIZIM_02_GURUHLAR.map(g => {
    const rol = effektivRol;
    const toliq = rol === 'rahbar' || rol === 'boss' || rol === 'admin' || rol === 'superadmin';
    let allowed = g.menyular;
    if (g.id === 'boshqaruv') allowed = k.superadmin ? allowed : [];
    else if (g.id === 'tizim') allowed = rol === 'admin' || rol === 'superadmin' || k.superadmin ? allowed : [];
    else if (g.id === 'hisob') allowed = toliq || rol === 'pto' || rol === 'bugalter' || rol === 'prorab' ? allowed : allowed.filter(m => m.yol.includes('kompaniya'));
    else if (toliq) { /* hammasi */ }
    else if (rol === 'pto') allowed = g.id === 'kompaniya' ? allowed.filter(m => m.yol.includes('zayavka') || m.yol.includes('logistika')) : g.id === 'loyiha' ? allowed.filter(m => !m.yol.includes('participants')) : allowed;
    else if (rol === 'prorab') allowed = g.id === 'pto' ? allowed.filter(m => m.yol.includes('fakt') || m.yol.includes('obyekt')) : g.id === 'kompaniya' ? allowed.filter(m => m.yol.includes('logistika') || m.yol.includes('zayavka')) : g.id === 'loyiha' ? allowed.filter(m => m.yol.includes('loyiha')) : [];
    else if (rol === 'bugalter') allowed = g.id === 'kompaniya' ? allowed.filter(m => m.yol.includes('moliya')) : g.id === 'loyiha' ? allowed.filter(m => m.yol.includes('crm') || m.yol.includes('shartnoma')) : g.id === 'pto' ? allowed.filter(m => m.yol.includes('f2-tarix') || m.yol.includes('nakopitelniy')) : [];
    else if (rol === 'buyurtmachi' || rol === 'pudratchi' || rol === 'kuzatuvchi') allowed = g.id === 'loyiha' ? allowed.filter(m => m.yol.includes('loyiha')) : g.id === 'pto' ? allowed.filter(m => m.yol.includes('obyekt')) : [];
    else allowed = [];
    return { ...g, menyular: allowed };
  }).filter(g => g.menyular.length > 0);

  return (
    <div className="os-app-shell flex h-screen overflow-hidden text-white relative font-sans selection:bg-accent/30">

      {/* Sidebar -- 2026-09-07: standart holatda faqat belgichalar (ikonalar)
       * qatori, sichqoncha ustiga borilganda to'liq (nomlar bilan) kengayadi.
       * Foydalanuvchi: "yon panelni sichqoncha borsa katta ochiladigan
       * bo'lmasa faqat belgichalari ko'rinib turadigan qilib ber". */}
      <aside
        onMouseEnter={() => setKengaygan(true)}
        onMouseLeave={() => setKengaygan(false)}
        aria-label="Asosiy navigatsiya"
        className={`os-sidebar relative z-30 border-r backdrop-blur-xl flex flex-col flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
          mobilMenyuOchiq ? 'os-sidebar--open' : ''
        } ${
          mobilMenyuOchiq ? 'w-[min(19rem,88vw)]' : sidebarKengaygan ? 'w-64 xl:w-72' : 'w-[68px]'
        }`}
      >
        <div className={`p-4 border-b border-border flex items-center ${sidebarKengaygan ? 'gap-3' : 'justify-center'}`}>
          <KompaniyaLogoRasm
            kompaniyaId={k.globalRejim ? null : k.joriy?.id}
            className="w-8 h-8 rounded-lg object-contain bg-white flex-shrink-0"
            zaxira={<div className="os-brand-mark w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
              <FlaskConical className="text-white" size={18} />
            </div>}
          />
          {sidebarKengaygan && (
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold text-text leading-tight tracking-wider whitespace-nowrap truncate" title={k.joriy?.nom}>{!k.globalRejim && k.joriy?.nom ? k.joriy.nom : 'SMETA TIZIM 02'}</h1>
              <p className="text-[11px] text-text-dim uppercase tracking-wider font-medium mt-0.5 text-accent/80 whitespace-nowrap">
                👑 {k.globalRejim ? 'Global (superadmin)' : (k.joriy?.rol || (k.yuklanmoqda ? '…' : 'Kompaniya tanlanmagan'))}
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 space-y-4">
          {!sidebarKengaygan ? (
            /* Belgichalar qatori: guruh sarlavhalarisiz, faqat ikonalar --
             * har bir guruh orasida yupqa ajratuvchi chiziq. */
            <div className="space-y-1">
              {filtrKilinganGuruhlar.map((guruh, gi) => (
                <div key={guruh.id} className={gi > 0 ? 'space-y-1 pt-3 mt-3 border-t border-white/10' : 'space-y-1'}>
                  {guruh.menyular.map(m => (
                    <NavLink
                      key={m.yol}
                      to={m.yol}
                      title={t(m.nom)}
                      className={({ isActive }) =>
                        `os-nav-link flex items-center justify-center h-10 rounded-lg transition-colors duration-[120ms] cursor-pointer ${
                          isActive ? 'os-nav-link--active' : ''
                        }`
                      }
                    >
                      {({ isActive }) => <m.Ikonka className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />}
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              {filtrKilinganGuruhlar.map(guruh => (
                <div key={guruh.id} className="space-y-1">
                  <button
                    onClick={() => toggleGuruh(guruh.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-bold text-text-dim uppercase tracking-wider hover:text-text transition-colors group"
                  >
                    <guruh.Ikonka size={14} className="text-text-dim group-hover:text-accent transition-colors" />
                    <span className="flex-1 text-left whitespace-nowrap">{t(guruh.nom)}</span>
                    {ochiqGuruhlar[guruh.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <div className={`space-y-0.5 pl-2 ${ochiqGuruhlar[guruh.id] ? 'block' : 'hidden'}`}>
                    {guruh.menyular.map(m => (
                      <NavLink
                        key={m.yol}
                        to={m.yol}
                        className={({ isActive }) =>
                          `os-nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors duration-[120ms] cursor-pointer relative ${
                            isActive
                              ? 'os-nav-link--active'
                              : ''
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <m.Ikonka className="w-[16px] h-[16px] flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                            <span className="truncate">{t(m.nom)}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}

              <div className="h-px bg-white/10 my-4 mx-2" />

              {/* Eski Tizim -- ustma-ust tushmaydigan qolgan mustaqil sahifalar */}
              <div>
                <button
                  onClick={() => setEskiOchiq((v) => !v)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500 uppercase tracking-wider hover:text-zinc-400 transition-colors"
                >
                  <Archive size={14} />
                  <span className="flex-1 text-left whitespace-nowrap">Tizim 1 (eski) va arxiv</span>
                  {eskiOchiq ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className={`space-y-0.5 pl-2 mt-1 ${eskiOchiq ? 'block' : 'hidden'}`}>
                  {ESKI_TIZIM_MENYU.map((m) => (
                    <NavLink
                      key={m.yol}
                      to={m.yol}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors duration-[120ms] cursor-pointer ${
                          isActive
                            ? 'bg-zinc-800 text-white'
                            : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                        }`
                      }
                    >
                      <m.Ikonka className="w-[14px] h-[14px] flex-shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{t(m.nom)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={handleLogout}
            title="Tizimdan chiqish"
            className={`flex items-center w-full rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors ${
              sidebarKengaygan ? 'gap-3 px-3 py-2 text-left' : 'justify-center h-10'
            }`}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {sidebarKengaygan && <span className="text-sm font-medium whitespace-nowrap">Tizimdan Chiqish</span>}
          </button>
        </div>
      </aside>
      {mobilMenyuOchiq && <button type="button" className="os-sidebar-backdrop" aria-label="Navigatsiyani yopish" onClick={() => setMobilMenyuOchiq(false)} />}

      <main className="os-workspace relative z-10 flex-1 overflow-hidden flex flex-col">
        {/* YAGONA kompaniya konteksti — barcha /admin/* sahifalari shuni ishlatadi */}
        <div className="os-context-bar flex-shrink-0 flex flex-wrap items-center gap-3 px-6 py-2 border-b backdrop-blur-sm z-20">
          <button type="button" className="os-mobile-only os-menu-button" aria-label={mobilMenyuOchiq ? 'Navigatsiyani yopish' : 'Navigatsiyani ochish'} aria-expanded={mobilMenyuOchiq} onClick={() => setMobilMenyuOchiq((open) => !open)}>
            {mobilMenyuOchiq ? <X size={17} /> : <Menu size={17} />}
          </button>
          <KompaniyaTanlagich />
          <PTOWorkspaceBar />
          <div className="ml-auto"><TilTanlagich ixcham /></div>
        </div>

        {/* ⚠️ 2026-09-07 (Claude, P0): AVVAL bu yerda `sess.data.yozaOladi`
         * ishlatilardi — /api/sessiya'dagi BITTA GLOBAL rol asosida
         * (`functions/api/sessiya.ts`: `!(rol==='boss'||rol==='rahbar')`).
         * Bu rol foydalanuvchining "birinchi (eng kichik id) faol
         * a'zoligi"dan kelardi — QAYSI KOMPANIYA TANLANGANIGA BOG'LIQ
         * EMAS. Natija: "New Times" kompaniyasida haqiqiy BOSS bo'lgan
         * odam ham "yozish mumkin emas" ogohlantirishini ko'rardi, chunki
         * boss GLOBAL darajada har doim shu ro'yxatga tushardi.
         * Haqiqiy qonun: RUXSAT — FAOL KOMPANIYA A'ZOLIGI + SERVER
         * EFFECTIVE AUTHORIZATION (`t2_effective_authorization_v1`), hech
         * qachon global sessiya satri emas. `t2_effective_authorization_
         * core_v1`ning o'z ruxsat jadvaliga ko'ra faqat `rahbar`/
         * `buyurtmachi`/`pudratchi`/`kuzatuvchi` HAQIQATAN yozish huquqiga
         * ega emas — `boss` esa TO'LIQ yozish huquqiga ega. */}
        {!k.globalRejim && k.joriy && YOZA_OLMAYDIGAN_ROLLAR.has(effektivRol) && (
          <div className="flex-shrink-0 z-20 bg-warn/15 border-b border-warn/30 px-6 py-2 flex items-center gap-2 text-sm text-text backdrop-blur-sm">
            <AlertTriangle size={16} className="text-warn flex-shrink-0" />
            <span className="flex-1">
              Siz <strong>«{k.joriy.nom}»</strong>da <strong>{effektivRol}</strong> rolidasiz — bu rol shu kompaniyada faqat ko'rish uchun.
            </span>
          </div>
        )}

        {/* ⚠️ 2026-09-07 (Claude, T2-PRODUCT-RECOVERY P0): AVVAL bu yerda
         * `overflow-hidden` bor edi — har bir sahifa Outlet ichida
         * ATAYLAB o'z scroll konteynerini qurmasa, viewport'dan tashqarida
         * qolgan kontentga HECH QANDAY yo'l bilan yetib bo'lmasdi (sichqon
         * g'ildiragi, touchpad, PageDown — hech biri ishlamasdi, chunki
         * scroll oladigan konteyner umuman yo'q edi). Endi standart:
         * sahifa o'zi scroll qiladi. Ichki "workbench" (masalan virtual
         * jadval, o'z balandligini o'zi boshqaradigan) sahifalar bemalol
         * ichki `overflow-hidden`/`h-full` saqlaydi — bu ichki konteyner
         * shu tashqi scroll konteynerining ICHIDA, hajmi mos kelsa
         * tashqi scroll umuman ko'rinmaydi. */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <RuxsatGuard />
        </div>
      </main>

      <F2NavbatChip />
    </div>
  );
}
