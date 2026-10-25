import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSessiya } from '../api/hooks';
import { HotkeyYordam } from '../lib/hotkeys/HotkeyYordam';
import { AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Crown } from 'lucide-react';
import { Map, LogOut, Building2, FileInput, Tags, Calculator, FileOutput, HardHat, ShieldAlert, Settings, FileText, Link2, FileStack, NotebookPen, Gauge, FlaskConical, LayoutDashboard, BarChart, ClipboardList, Briefcase, Box, Trash2, Users, FolderKanban, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
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
import { AiHelper } from '../umumiy/ui/AiHelper';
import { CommandPalette } from '../umumiy/ui/CommandPalette';
import { routePermission } from '../lib/company-authorization/route-permission';
import { useModullar } from '../api/t2-modul';
import { MENYU_MODUL, menyuModulYoqilgan } from '../lib/modullar';

/* 2026-10-02 (egasi): menyu product relsi bo'yicha qayta tuzildi — "oddiy PTO ham, o'zim ham
 * adashmasin". Tartib = ish ketma-ketligi: PTO ish yo'li → narx → loyiha/shartnoma → kompaniya
 * boshqaruvi → hisob → tizim. Rol faqat KO'RINISHNI qisqartiradi (pastdagi filtr), tuzilma hamma
 * uchun bir xil. Har yo'l faqat BIR joyda (takror yo'q). Server tekshiruvi — yakuniy qo'riqchi. */
/* Egasi 2026-10-21 (BOSH_REJA §3–4, Smeta Network auditi): 8 guruh → 5 asosiy bo'lim; «Tizim 1 (eski)» qoldiqlari
 * menyudan butunlay olib tashlandi. Modul («Telegram modeli») o'chirilgan bo'lsa uning sahifalari ko'rinmaydi
 * (lib/modullar.ts). `eski` — avvalgi guruh: rol bo'yicha zaxira filtri o'zgarmasin. Har yo'l faqat BIR joyda. */
type MenyuQator = { yol: string; nom: string; Ikonka: typeof Crown; eski?: string };
const TIZIM_02_GURUHLAR: Array<{ nom: string; Ikonka: typeof Crown; id: string; menyular: MenyuQator[] }> = [
  {
    nom: 'Ish (PTO)',
    Ikonka: FileText,
    id: 'pto',
    menyular: [
      /* «Telegram modeli» (2026-10-22): barcha ish joylari va ulardagi navbatingiz — bitta ekranda. */
      { yol: '/admin/ish-joylarim', nom: 'Ish joylarim', Ikonka: LayoutDashboard },
      /* T6: o'z profilingiz va kompaniyalarga xizmat taklif qilish. */
      { yol: '/admin/mutaxassis', nom: 'Mening xizmatlarim', Ikonka: Briefcase },
      { yol: '/admin/obyektlar', nom: 'Obyektlar va smeta yuklash', Ikonka: Building2 },
      { yol: '/admin/smeta-studio', nom: 'Smeta studiyasi', Ikonka: Calculator },
      { yol: '/admin/holat', nom: 'Smeta va Fakt / LRV', Ikonka: FileText },
      { yol: '/admin/f2-tayyorlash', nom: 'F2 tayyorlash', Ikonka: FileOutput },
      { yol: '/admin/f2-tarix', nom: 'F2 tarixi va tasdiqlash', Ikonka: ShieldCheck },
      { yol: '/admin/f2-reestr', nom: 'F2 reestri', Ikonka: FileText },
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
    nom: 'Loyiha va tomonlar',
    Ikonka: FolderKanban,
    id: 'loyiha',
    menyular: [
      { yol: '/admin/loyiha', nom: 'Loyihalar', Ikonka: FolderKanban },
      { yol: '/admin/shartnoma-liniya', nom: 'Shartnomalar va tomonlar', Ikonka: Briefcase },
      { yol: '/admin/documents', nom: 'Hujjatlar', Ikonka: FileStack },
      { yol: '/admin/hujjat-nazorat', nom: 'Hujjat nazorati', Ikonka: FileOutput },
      { yol: '/admin/participants', nom: 'Loyiha ishtirokchilari', Ikonka: Users },
      { yol: '/admin/crm', nom: 'Kontragentlar (CRM/EDO)', Ikonka: Users },
      /* Egasi 2026-10-05: tomonlar (zakazchik ↔ pudratchi …) — handshake, ruxsat (grant), hujjat taqdimi. */
      { yol: '/admin/zakazchik', nom: 'Buyurtmachi kabineti', Ikonka: Building2, eski: 'tomonlar' },
      { yol: '/admin/taqdimlar', nom: 'Tomonlar hujjatlari', Ikonka: FileStack, eski: 'tomonlar' },
      { yol: '/admin/murojaatlar', nom: 'Murojaatlar (remark, so‘rov)', Ikonka: ClipboardList, eski: 'tomonlar' },
      { yol: '/admin/aloqalar', nom: 'Tomonlar aloqasi', Ikonka: Link2, eski: 'tomonlar' },
    ]
  },
  {
    nom: 'Kompaniya',
    Ikonka: LayoutDashboard,
    id: 'kompaniya',
    menyular: [
      { yol: '/admin/dashboard', nom: 'Rahbar paneli', Ikonka: BarChart },
      { yol: '/admin/moliya', nom: 'Moliya (to‘lov, xarajat)', Ikonka: Briefcase },
      { yol: '/admin/logistika', nom: 'Ta‘minot va sklad', Ikonka: Box },
      { yol: '/admin/zayavka', nom: 'Zayavkalar', Ikonka: ClipboardList },
      { yol: '/admin/erp', nom: 'Kadrlar va texnika', Ikonka: Users },
      { yol: '/admin/mindmap', nom: 'Mindmap (xarita)', Ikonka: Map },
      { yol: '/admin/kompaniya', nom: 'Kompaniya, a‘zolar va modullar', Ikonka: Building2, eski: 'hisob' },
      { yol: '/admin/tokenlar', nom: 'Tokenlar va obuna', Ikonka: Gauge, eski: 'hisob' },
      { yol: '/admin/hujjat-dizayn', nom: 'Hujjatlar dizayni', Ikonka: FileText, eski: 'hisob' },
      { yol: '/admin/tizim-sozlama', nom: 'Sozlamalar', Ikonka: Settings, eski: 'hisob' },
    ]
  },
  {
    nom: 'Tizim (admin)',
    Ikonka: ShieldAlert,
    id: 'tizim',
    menyular: [
      /* Platforma boshqaruvi — faqat superadmin (server ham tekshiradi). */
      { yol: '/admin/boshqaruv', nom: 'Platforma boshqaruvi', Ikonka: Crown, eski: 'boshqaruv' },
      { yol: '/admin/system-control', nom: 'Tizim boshqaruv markazi', Ikonka: ShieldAlert },
      { yol: '/admin/ai-agentlar', nom: 'AI ishchilar', Ikonka: FlaskConical },
      { yol: '/admin/sayt-xaritasi', nom: 'Sayt xaritasi', Ikonka: Map },
      { yol: '/admin/storage', nom: 'Fayl saqlash (Storage)', Ikonka: HardHat },
      { yol: '/admin/fayl-boglash', nom: 'Fayl bog‘lash', Ikonka: Link2 },
      { yol: '/admin/korzinka', nom: 'Korzinka', Ikonka: Trash2 },
    ]
  }
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
        <AiHelper />
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
  const modulQuery = useModullar(k.globalRejim ? null : k.joriy?.id);
  const joy = useLocation();
  // Effective role for THIS render: the active company's own membership
  // role, or a platform-level label when no company is selected. Never the
  // stale global session role.
  const effektivRol: string = k.superadmin ? 'superadmin' : (k.joriy?.rol ?? '');

  // Avtomatik ochish logikasi -- standart YOPIQ (2026-09-07: bu bo'lim
  // hamma vaqt ochiq turgani "sayt eski/chalkash ko'rinadi" shikoyatining
  // asosiy sababi edi -- endi faqat kerak bo'lganda, o'zi ochadi).
  // Sidebar sichqoncha kelganda kengayadi, aks holda faqat belgichalar
  // (ikonalar) qatori -- foydalanuvchi: "yon panelni sichqoncha borsa
  // katta ochiladigan bo'lmasa faqat belgichalari ko'rinib turadigan".
  const [kengaygan, setKengaygan] = useState(false);
  const [mobilMenyuOchiq, setMobilMenyuOchiq] = useState(false);
  const [mahkam, setMahkam] = useState<boolean>(() => {
    try { return localStorage.getItem('fz-sidebar-mahkam') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('fz-sidebar-mahkam', mahkam ? '1' : '0'); } catch { /* brauzer xotirasi yopiq */ }
  }, [mahkam]);
  const sidebarKengaygan = mahkam || kengaygan || mobilMenyuOchiq;

  // Qaysi guruhlar ochiq ekanligini saqlash
  const [ochiqGuruhlar, setOchiqGuruhlar] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    TIZIM_02_GURUHLAR.forEach(g => {
      // Agar ochiq sahifa shu guruhga tegishli bo'lsa, uni ochamiz
      d[g.id] = g.id === 'pto' || g.menyular.some(m => joy.pathname.startsWith(m.yol));
    });
    return d;
  });

  useEffect(() => { setMobilMenyuOchiq(false); }, [joy.pathname]);

  const toggleGuruh = (id: string) => {
    setOchiqGuruhlar(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const barchaYollar = TIZIM_02_GURUHLAR.flatMap(g => g.menyular.map(m => m.yol));
  menyuTekshirDev(barchaYollar);

  useEffect(() => {
    if (sess.isError && sess.error?.message === "Sessiya yo'q") {
      console.warn("[AdminShell] sessiya tekshiruvi 401 qaytardi.");
    }
  }, [sess.isError, sess.error]);

  const handleLogout = tizimdanChiq;

  if (sess.isLoading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
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
      <div className="h-screen bg-bg flex items-center justify-center">
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
      <div className="h-screen bg-bg flex items-center justify-center">
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
  const modullar = modulQuery.data;
  const routeModule = MENYU_MODUL[joy.pathname];
  // Faqat modul ANIQ o'chirilgan bo'lsa yopiladi. Yuklanayotgan / o'qib bo'lmagan / global rejim — sahifa ochiq
  // (bu ko'rinish, xavfsizlik emas; L0 2026-10-22: Codex varianti xato bo'lganda ishni to'xtatardi).
  const moduleOpen = !routeModule || !modullar?.some(m => m.kod === routeModule && m.holat === 'off');
  const rol = effektivRol;
  const toliq = rol === 'rahbar' || rol === 'boss' || rol === 'admin' || rol === 'superadmin';
  /** Ruxsatlar katalogi yo'q (eski DB javobi) bo'lsa — avvalgi guruh bo'yicha rol filtri (o'zgarmagan qoida). */
  const eskiRolRuxsat = (gid: string, m: MenyuQator): boolean => {
    if (gid === 'boshqaruv') return !!k.superadmin;
    if (gid === 'tizim') return rol === 'admin' || rol === 'superadmin' || !!k.superadmin;
    if (gid === 'hisob') return toliq || rol === 'pto' || rol === 'bugalter' || rol === 'prorab' || m.yol.includes('kompaniya');
    if (gid === 'tomonlar') return toliq || rol === 'pto' || rol === 'buyurtmachi' || rol === 'pudratchi' || rol === 'kuzatuvchi';
    if (toliq) return true;
    if (rol === 'pto') return gid === 'kompaniya' ? (m.yol.includes('zayavka') || m.yol.includes('logistika')) : gid === 'loyiha' ? !m.yol.includes('participants') : true;
    if (rol === 'prorab') return gid === 'pto' ? (m.yol.includes('fakt') || m.yol.includes('obyekt')) : gid === 'kompaniya' ? (m.yol.includes('logistika') || m.yol.includes('zayavka')) : gid === 'loyiha' ? m.yol.includes('loyiha') : false;
    if (rol === 'bugalter') return gid === 'kompaniya' ? m.yol.includes('moliya') : gid === 'loyiha' ? (m.yol.includes('crm') || m.yol.includes('shartnoma')) : gid === 'pto' ? (m.yol.includes('f2-tarix') || m.yol.includes('nakopitelniy')) : false;
    if (rol === 'buyurtmachi' || rol === 'pudratchi' || rol === 'kuzatuvchi') return gid === 'loyiha' ? m.yol.includes('loyiha') : gid === 'pto' ? m.yol.includes('obyekt') : false;
    return false;
  };
  const filtrKilinganGuruhlar = TIZIM_02_GURUHLAR.map(g => {
    const korinadi = (m: MenyuQator): boolean => {
      if (!menyuModulYoqilgan(m.yol, modullar)) return false;
      if (k.superadmin) return true;
      if (k.joriy?.permissions) return k.joriy.permissions.includes(routePermission(m.yol));
      return eskiRolRuxsat(m.eski ?? g.id, m);
    };
    return { ...g, menyular: g.menyular.filter(korinadi) };
  }).filter(g => g.menyular.length > 0);
  /* Ctrl+K — sidebar bilan BIR manba: shu rol/ruxsat/modul filtridan o'tgan bandlar (tizim xaritasi P3). */
  const palitraBandlari = filtrKilinganGuruhlar.flatMap(g => g.menyular.map(m => ({ yol: m.yol, nom: m.nom, guruh: g.nom })));

  return (
    <div className="os-app-shell flex h-screen overflow-hidden text-text relative font-sans">
      <HotkeyYordam />
      <CommandPalette bandlar={palitraBandlari} />

      {/* Firuza YonPanel (2026-10-25): rels (60px, faqat ikonka) yoki mahkamlangan ochiq panel (264px).
       * Rels holatda sichqoncha kelsa panel kontent USTIDA ochiladi — sahifa siljimaydi (avval kontent
       * har hoverda sakrardi). Mahkamlash tanlovi brauzerda eslab qolinadi. */}
      <div className={`fz-shell-rail ${mahkam ? 'fz-shell-rail--pinned' : ''}`}>
      <aside
        onMouseEnter={() => setKengaygan(true)}
        onMouseLeave={() => setKengaygan(false)}
        aria-label={t('Asosiy navigatsiya')}
        className={`fz-sidebar ${sidebarKengaygan ? 'fz-sidebar--open' : ''} ${sidebarKengaygan && !mahkam && !mobilMenyuOchiq ? 'fz-sidebar--float' : ''} ${mobilMenyuOchiq ? 'fz-sidebar--mobile' : ''}`}
      >
        <div className="fz-sidebar__brand">
          <KompaniyaLogoRasm
            kompaniyaId={k.globalRejim ? null : k.joriy?.id}
            className="w-8 h-8 rounded-md object-contain bg-white flex-shrink-0"
            zaxira={<span className="fz-sidebar__mark" aria-hidden="true">{(!k.globalRejim && k.joriy?.nom ? k.joriy.nom : 'S').trim().charAt(0).toUpperCase()}</span>}
          />
          {sidebarKengaygan && (
            <div className="min-w-0 flex-1">
              <span className="fz-sidebar__name" title={k.joriy?.nom}>{!k.globalRejim && k.joriy?.nom ? k.joriy.nom : 'Smeta tizimi'}</span>
              <span className="fz-sidebar__role">
                {k.superadmin ? 'Superadmin · platforma' : (k.joriy?.rol === 'boss' ? 'Kompaniya rahbari' : (k.joriy?.rol || (k.yuklanmoqda ? '…' : 'Kompaniya tanlanmagan')))}
                {k.superadmin && k.joriy?.membershipRole && <> · {k.joriy.membershipRole}</>}
              </span>
            </div>
          )}
        </div>

        <div className="fz-sidebar__scroll">
          <nav className="fz-nav">
            {filtrKilinganGuruhlar.map((guruh, gi) => (
              <div key={guruh.id}>
                {sidebarKengaygan ? (
                  <button type="button" className="fz-nav__group" aria-expanded={!!ochiqGuruhlar[guruh.id]} onClick={() => toggleGuruh(guruh.id)}>
                    <span className="flex-1 truncate">{t(guruh.nom)}</span>
                    {ochiqGuruhlar[guruh.id] ? <ChevronDown /> : <ChevronRight />}
                  </button>
                ) : gi > 0 ? <div className="fz-sidebar__sep" /> : null}
                {(!sidebarKengaygan || ochiqGuruhlar[guruh.id]) && guruh.menyular.map(m => (
                  <NavLink
                    key={m.yol}
                    to={m.yol}
                    title={sidebarKengaygan ? undefined : t(m.nom)}
                    className={({ isActive }) => `fz-nav__item ${isActive ? 'fz-nav__item--active' : ''}`}
                  >
                    {({ isActive }) => (
                      <>
                        <m.Ikonka strokeWidth={isActive ? 2 : 1.75} />
                        {sidebarKengaygan && <span>{t(m.nom)}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="fz-sidebar__foot">
          <button
            type="button"
            onClick={() => setMahkam(v => !v)}
            title={mahkam ? t('Panelni yig‘ish') : t('Panelni mahkamlash')}
            aria-pressed={mahkam}
            className="fz-nav__item os-desktop-only"
          >
            {mahkam ? <PanelLeftClose strokeWidth={1.75} /> : <PanelLeftOpen strokeWidth={1.75} />}
            {sidebarKengaygan && <span>{mahkam ? t('Panelni yig‘ish') : t('Panelni mahkamlash')}</span>}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title={t('Tizimdan chiqish')}
            className="fz-nav__item fz-nav__item--danger"
          >
            <LogOut strokeWidth={1.75} />
            {sidebarKengaygan && <span>{t('Tizimdan chiqish')}</span>}
          </button>
        </div>
      </aside>
      </div>
      {mobilMenyuOchiq && <button type="button" className="os-sidebar-backdrop" aria-label="Navigatsiyani yopish" onClick={() => setMobilMenyuOchiq(false)} />}

      <main className="os-workspace relative z-10 flex-1 overflow-hidden flex flex-col">
        {/* YAGONA kompaniya konteksti — barcha /admin/* sahifalari shuni ishlatadi */}
        <div className="os-context-bar flex-shrink-0 flex flex-wrap items-center gap-3 z-20">
          <button type="button" className="os-mobile-only os-menu-button" aria-label={mobilMenyuOchiq ? 'Navigatsiyani yopish' : 'Navigatsiyani ochish'} aria-expanded={mobilMenyuOchiq} onClick={() => setMobilMenyuOchiq((open) => !open)}>
            {mobilMenyuOchiq ? <X size={17} /> : <Menu size={17} />}
          </button>
          <KompaniyaTanlagich />
          {k.superadmin && <span className="rounded-md border border-accent/25 px-2 py-1 text-[10px] text-accent">{t('Platforma roli')}: superadmin</span>}
          {k.superadmin && k.joriy?.membershipRole && <span className="text-[10px] text-text-dim">{t('Kompaniyadagi rol')}: {k.joriy.membershipRole}</span>}
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
        {!k.globalRejim && k.joriy && (k.joriy.permissions?!k.joriy.permissions.some(p=>/\.write$|f2\.(import|prepare|approve|cancel|correct)$/.test(p)):YOZA_OLMAYDIGAN_ROLLAR.has(effektivRol)) && (
          <div className="flex-shrink-0 z-20 bg-warn/15 border-b border-warn/30 px-6 py-2 flex items-center gap-2 text-sm text-text backdrop-blur-sm">
            <AlertTriangle size={16} className="text-warn flex-shrink-0" />
            <span className="flex-1">
              <strong>«{k.joriy.nom}»</strong> kompaniyasida sizga hozir faqat ko‘rish huquqlari berilgan.
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
          {moduleOpen ? <RuxsatGuard /> : <p role="alert" className="karta p-4 text-sm">{t('Bu modul kompaniyada o‘chirilgan.')}</p>}
        </div>
      </main>

      <F2NavbatChip />
    </div>
  );
}
