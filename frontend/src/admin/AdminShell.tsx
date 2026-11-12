import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSessiya } from '../api/hooks';
import { HotkeyYordam } from '../lib/hotkeys/HotkeyYordam';
import { AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Crown } from 'lucide-react';
import { Map, LogOut, Building2, Tags, Calculator, FileOutput, HardHat, ShieldAlert, Settings, FileText, Link2, FileStack, Gauge, FlaskConical, LayoutDashboard, BarChart, ClipboardList, Briefcase, Box, Trash2, Users, FolderKanban, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Inbox, Truck, User, Search } from 'lucide-react';
import F2NavbatChip from '../umumiy/ui/F2NavbatChip';
import { menyuTekshirDev } from '../umumiy/marshrutTekshir';
import { KompaniyaProvider, useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaLogoRasm } from '../umumiy/hujjat/KompaniyaLogo';
import { KompaniyaTanlagich } from '../umumiy/kontekst/KompaniyaTanlagich';
import { PTOWorkspaceBar, PTOWorkspaceProvider } from '../umumiy/kontekst/PTOWorkspaceContext';
import { YordamchiSahifaYozuvchi } from '../lib/yordamchi/sahifa-store';
import { PredpisaniyaOgohlantirish } from './nazorat/PredpisaniyaOgohlantirish';
import { RuxsatGuard } from '../umumiy/kontekst/RuxsatGuard';
import { SahifaChegarasi } from '../umumiy/ui/XatoChegarasi';
import { tizimdanChiq } from '../umumiy/kontekst/chiqish';
import { t } from '../i18n/til';
import { TilTanlagich } from '../i18n/TilTanlagich';
import { AkkauntTugmasi } from '../components/akkaunt/AkkauntTugmasi';
import { Qongiroqcha } from '../components/hujjat-aylanish/Qongiroqcha';
import { OrqaOldinga } from '../umumiy/ui/OrqaOldinga';
import { SIDEBAR_HODISA } from '../components/akkaunt/korinish-sozlama';
import { AiHelper, AiHelperTugma } from '../umumiy/ui/AiHelper';
import { CommandPalette } from '../umumiy/ui/CommandPalette';
import { QollanmaBoshqaruv } from '../components/qollanma/QollanmaKarta';
import { KursYordam } from '../components/kurs/KursYordam';
import { KursYurish } from '../components/kurs/KursYurish';
import { NimaYangiBelgi } from '../components/qollanma/NimaYangiBelgi';
import { BolimTablariKontekst } from './bolimTablariKontekst';
import { NAV_GURUHLAR, NAV_SAHIFALAR, navSahifa, type NavIkonka } from '../lib/nav/navReestr';
import { menyuQur, ilovalarRoyxati, kundalikIshlar, type NavKontekst } from '../lib/nav/navFiltr';
import { ILOVA_MAP, type IlovaKod } from '../lib/ilova/ilovalar';
import { IlovaIshgaTushirgich } from '../components/ilova/IlovaIshgaTushirgich';
import { useTizimRuxsat } from '../api/t2-tizim-xaritasi';
import { useModullar } from '../api/t2-modul';
import { menyuModulYoqilgan } from '../lib/modullar';

/* 2026-10-26 (egasi; tizim xaritasi S1/P2): menyu tuzilmasi va rol filtri — YAGONA navigatsiya reestrida
 * (lib/nav/navReestr.ts) va sof filtrda (lib/nav/navFiltr.ts). Bu yerda faqat ikonka xaritasi va ulash.
 * Qatlamlar: ish (qurilish zanjiri) → ⚙ Kompaniya → Shaxsiy → Platforma (faqat superadmin).
 * `tablar` — bitta band ostidagi bir nechta sahifa: sidebarda BITTA band, sahifa tepasida tablar (BolimTablari). */
type MenyuTab = { yol: string; nom: string };
type MenyuQator = { yol: string; nom: string; Ikonka: typeof Crown; tablar?: MenyuTab[] };
const IKONKALAR: Record<NavIkonka, typeof Crown> = {
  Building2, Tags, Calculator, FileOutput, HardHat, ShieldAlert, Settings, FileText, Link2, FileStack, Gauge, FlaskConical,
  LayoutDashboard, BarChart, ClipboardList, Briefcase, Box, Users, FolderKanban, Crown, ShieldCheck, Map, Inbox, Truck, User, Trash2,
};

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
  /* Tizim xaritasi menyusi — faqat server ruxsat bersa (superadmin yoki berilgan grant); 5 daqiqa kesh. */
  const tizimRuxsat = useTizimRuxsat(!!sess.data);
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
    /* Navigatsiya oqimi (2026-11-11): sukut — mahkam ochiq panel (yozuvlar ko'rinadi); faqat ikonka «rels» — foydalanuvchi o'zi yig'sa. */
    try { const v = localStorage.getItem('fz-sidebar-mahkam'); return v == null ? true : v === '1'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('fz-sidebar-mahkam', mahkam ? '1' : '0'); } catch { /* brauzer xotirasi yopiq */ }
  }, [mahkam]);
  /* Akkaunt markazi («Ko‘rinish») yon panel mahkamligini o‘zgartirsa — shu yerda ham darhol aks etadi. */
  useEffect(() => {
    const f = (e: Event) => setMahkam(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(SIDEBAR_HODISA, f);
    return () => window.removeEventListener(SIDEBAR_HODISA, f);
  }, []);
  const sidebarKengaygan = mahkam || kengaygan || mobilMenyuOchiq;
  /* Ilova menyusi (ekotizim P1): sukut - faqat joriy ilova bo'limlari; «Barcha bo'limlar» - hammasi (tanlov eslab qolinadi). */
  const [hammasiRejim, setHammasiRejim] = useState<boolean>(() => {
    try { return localStorage.getItem('fz-menyu-hammasi') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('fz-menyu-hammasi', hammasiRejim ? '1' : '0'); } catch { /* brauzer xotirasi yopiq */ }
  }, [hammasiRejim]);
  const [oxirgiIlova, setOxirgiIlova] = useState<IlovaKod | null>(() => {
    try { return (localStorage.getItem('fz-ilova') as IlovaKod | null) || null; } catch { return null; }
  });
  const yolIlovasi: IlovaKod | null = navSahifa(joy.pathname)?.ilova ?? null;
  /* Oxirgi ishlatilgan ilova eslab qolinadi (yadro/platforma sahifalarida yon menyu shu ilovada qoladi). */
  useEffect(() => {
    if (!yolIlovasi || !ILOVA_MAP[yolIlovasi].ishgaTushirgich) return;
    setOxirgiIlova(yolIlovasi);
    try { localStorage.setItem('fz-ilova', yolIlovasi); } catch { /* xotira yopiq */ }
  }, [yolIlovasi]);

  // Qaysi guruhlar ochiq ekanligini saqlash
  const [ochiqGuruhlar, setOchiqGuruhlar] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {};
    NAV_GURUHLAR.forEach(g => {
      // Yuqorida «Kundalik ishlar» turadi — bo'limlar sukut YOPIQ, faqat ochiq sahifa turgan bo'lim ochiq.
      d[g.id] = g.bandlar.some(b => b.sahifalar.some(x => joy.pathname.startsWith(x.yol)));
    });
    d.kundalik = true;
    d.qoshimcha = NAV_SAHIFALAR.some(x => x.qoshimcha && joy.pathname.startsWith(x.yol));
    return d;
  });

  useEffect(() => { setMobilMenyuOchiq(false); }, [joy.pathname]);

  const toggleGuruh = (id: string) => {
    setOchiqGuruhlar(prev => ({ ...prev, [id]: !prev[id] }));
  };

  menyuTekshirDev(NAV_SAHIFALAR.map(s => s.yol));

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
  // Faqat modul ANIQ o'chirilgan bo'lsa yopiladi. Yuklanayotgan / o'qib bo'lmagan / global rejim — sahifa ochiq
  // (bu ko'rinish, xavfsizlik emas; L0 2026-10-22: Codex varianti xato bo'lganda ishni to'xtatardi).
  const moduleOpen = menyuModulYoqilgan(joy.pathname, modullar);
  /* Rol/ruxsat/modul/qatlam filtri — sof funksiya (lib/nav/navFiltr.ts, rol snapshot testlari bilan). */
  const navK: NavKontekst = { superadmin: !!k.superadmin, rol: effektivRol, permissions: k.joriy?.permissions, modullar, tizimXaritasi: tizimRuxsat.data?.ruxsat === true };
  const guruhQator = (ilova: IlovaKod | 'hammasi', qoshimcha: 'hammasi' | 'yashir' | 'faqat' = 'hammasi') => menyuQur({ ...navK, ilova, qoshimcha })
    .map(g => ({ nom: g.nom, id: g.id, Ikonka: IKONKALAR[g.ikonka], menyular: g.bandlar.map((b): MenyuQator => ({ yol: b.yol, nom: b.nom, Ikonka: IKONKALAR[b.ikonka], tablar: b.tablar })) }));
  /* Ilova ishga tushirgich + joriy ilova (yo'l ilovasi, bo'lmasa oxirgi tanlangan, bo'lmasa birinchi). */
  const ilovalar = ilovalarRoyxati(navK);
  const ilovaKodlari = ilovalar.map(i => i.kod);
  const joriyIlova: IlovaKod | null = yolIlovasi && ilovaKodlari.includes(yolIlovasi) ? yolIlovasi
    : oxirgiIlova && ilovaKodlari.includes(oxirgiIlova) ? oxirgiIlova : (ilovaKodlari[0] ?? null);
  const menyuIlova: IlovaKod | 'hammasi' = hammasiRejim || !joriyIlova || ilovalar.length < 2 ? 'hammasi' : joriyIlova;
  /* Ctrl+K va sahifa tablari — HAMMA ruxsatli bo'limlardan (ilova filtri faqat yon menyuga). */
  const hammasiGuruhlar = guruhQator('hammasi');
  /* Yon menyu: tepada «Kundalik ishlar», keyin bo'limlar, pastda yig'ilgan «Qo'shimcha bo'limlar» (hali ma'lumoti yo'q modullar —
   * o'chirilmaydi, faqat asosiy ro'yxatdan olinadi; Ctrl+K va tablar hammasini ko'radi). */
  const asosiyGuruhlar = guruhQator(menyuIlova, 'yashir');
  const qoshimchaBandlar = guruhQator('hammasi', 'faqat').flatMap(g => g.menyular);
  const kundalikBandlar: MenyuQator[] = kundalikIshlar({ ...navK, ilova: 'hammasi' }).map(b => ({ yol: b.yol, nom: b.nom, Ikonka: IKONKALAR[b.ikonka] }));
  const filtrKilinganGuruhlar = [
    ...(kundalikBandlar.length ? [{ nom: 'Kundalik ishlar', id: 'kundalik', Ikonka: IKONKALAR.HardHat, menyular: kundalikBandlar }] : []),
    ...asosiyGuruhlar,
    ...(qoshimchaBandlar.length ? [{ nom: 'Qo‘shimcha bo‘limlar', id: 'qoshimcha', Ikonka: IKONKALAR.Box, menyular: qoshimchaBandlar }] : []),
  ];
  /* Ctrl+K — sidebar bilan BIR manba: shu rol/ruxsat/modul filtridan o'tgan bandlar (tizim xaritasi P3); tablar alohida topiladi. */
  const palitraBandlari = hammasiGuruhlar.flatMap(g => g.menyular.flatMap(m => m.tablar
    ? m.tablar.map(tb => ({ yol: tb.yol, nom: tb.nom, guruh: g.nom }))
    : [{ yol: m.yol, nom: m.nom, guruh: g.nom }]));
  /* BolimTablari (sahifa tepasidagi tablar) uchun — ruxsat bo'yicha filtrlangan tab guruhlari. */
  const tabGuruhlari = hammasiGuruhlar.flatMap(g => g.menyular.flatMap(m => m.tablar ? [m.tablar] : []));
  const bandFaol = (m: MenyuQator, isActive: boolean) => isActive || !!m.tablar?.some(tb => joy.pathname === tb.yol || joy.pathname.startsWith(tb.yol + '/'));

  return (
    <div className="os-app-shell flex h-screen overflow-hidden text-text relative font-sans">
      <HotkeyYordam />
      <CommandPalette bandlar={palitraBandlari} />
      <YordamchiSahifaYozuvchi bandlar={palitraBandlari} />

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
          <nav className="fz-nav" data-kurs="menyu">
            {ilovalar.length > 1 && sidebarKengaygan && (
              <button type="button" className="fz-nav__group" aria-pressed={menyuIlova === 'hammasi'} onClick={() => setHammasiRejim(v => !v)}
                title={menyuIlova === 'hammasi' ? t('Faqat joriy ilova bo‘limlari') : t('Barcha bo‘limlar')}>
                <span className="flex-1 truncate">{menyuIlova === 'hammasi' ? t('Faqat joriy ilova bo‘limlari') : t('Barcha bo‘limlar')}</span>
              </button>
            )}
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
                    className={({ isActive }) => `fz-nav__item ${bandFaol(m, isActive) ? 'fz-nav__item--active' : ''}`}
                  >
                    {({ isActive }) => (
                      <>
                        <m.Ikonka strokeWidth={bandFaol(m, isActive) ? 2 : 1.75} />
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

      <KursYurish />
      <main className="os-workspace relative z-10 flex-1 overflow-hidden flex flex-col">
        {/* YAGONA kompaniya konteksti — barcha /admin/* sahifalari shuni ishlatadi */}
        <div className="os-context-bar flex-shrink-0 flex flex-wrap items-center gap-3 z-20">
          <button type="button" className="os-mobile-only os-menu-button" aria-label={mobilMenyuOchiq ? 'Navigatsiyani yopish' : 'Navigatsiyani ochish'} aria-expanded={mobilMenyuOchiq} onClick={() => setMobilMenyuOchiq((open) => !open)}>
            {mobilMenyuOchiq ? <X size={17} /> : <Menu size={17} />}
          </button>
          <IlovaIshgaTushirgich ilovalar={ilovalar} joriy={joriyIlova} onTanla={(kod) => { setOxirgiIlova(kod); setHammasiRejim(false); try { localStorage.setItem('fz-ilova', kod); } catch { /* xotira yopiq */ } }} />
          <OrqaOldinga />
          <span data-kurs="kompaniya-tanlagich" className="contents"><KompaniyaTanlagich /></span>
          {k.superadmin && <span className="hidden rounded-md border border-accent/25 px-2 py-1 text-[10px] text-accent 2xl:inline">{t('Platforma roli')}: superadmin</span>}
          {k.superadmin && k.joriy?.membershipRole && <span className="hidden text-[10px] text-text-dim 2xl:inline">{t('Kompaniyadagi rol')}: {k.joriy.membershipRole}</span>}
          <PTOWorkspaceBar />
          <span data-kurs="jarvis" className="contents"><AiHelperTugma /></span>
          <div className="ml-auto flex items-center gap-2"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('palitra:och'))} data-kurs="qidirish" aria-label={t('Sahifa yoki obyekt izlash...')} title={t('Sahifa yoki obyekt izlash...')} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[12px] text-text-dim hover:text-text"><Search size={14} aria-hidden="true" /><span className="hidden xl:inline">{t('Qidirish')}</span></button><NimaYangiBelgi /><KursYordam /><QollanmaBoshqaruv foydalanuvchi={sess.data?.email} /><TilTanlagich ixcham /><Qongiroqcha /><AkkauntTugmasi /></div>
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
        {!k.globalRejim && k.joriy && <PredpisaniyaOgohlantirish kompaniyaId={k.joriy.id} />}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <BolimTablariKontekst.Provider value={tabGuruhlari}>
            {moduleOpen ? <SahifaChegarasi><RuxsatGuard /></SahifaChegarasi> : <p role="alert" className="karta p-4 text-sm">{t('Bu modul kompaniyada o‘chirilgan.')}</p>}
          </BolimTablariKontekst.Provider>
        </div>
      </main>

      <F2NavbatChip />
    </div>
  );
}
