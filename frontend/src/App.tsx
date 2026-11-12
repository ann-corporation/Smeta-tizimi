import { lazy, Suspense } from 'react';
import { t } from './i18n/til';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { titleForPath } from './lib/pageTitle';
import { SahifaYuklanmoqda } from './umumiy/ui/SahifaYuklanmoqda';
import { TasdiqContainer } from './umumiy/ui/Tasdiq';
import { ToastContainer } from './umumiy/ui/Toast';
import SahifaTopilmadi from './umumiy/ui/SahifaTopilmadi';
import KirishSahifa from './kirish/KirishSahifa';
import QoshilSahifa from './kirish/QoshilSahifa';
import UlashSahifa from './kirish/UlashSahifa';

const AdminShell = lazy(() => import('./admin/AdminShell'));
const BossShell = lazy(() => import('./boss/BossShell'));
const TgKirish = lazy(() => import('./telegram/TgKirish'));

// Admin pages — tez yuklash (2026-10-30): hammasi lazy; Suspense + xato chegarasi qobiq Outlet'ida
// (`SahifaChegarasi`), shuning uchun kirish sahifasi bu og'ir sahifalarni yuklamaydi.
const HolatNative = lazy(() => import('./admin/sahifalar/HolatNative'));
const FaktNative = lazy(() => import('./admin/sahifalar/FaktNative'));
const GrafikSahifa = lazy(() => import('./admin/sahifalar/GrafikSahifa'));
const UstaBugun = lazy(() => import('./admin/sahifalar/UstaBugun'));
const FaylBoglash = lazy(() => import('./admin/sahifalar/FaylBoglash'));
/* TIZIM_02 — Supabase sinov muhiti. Tizim_01 ga TEGMAYDI. */
const TestShell     = lazy(() => import('./test02/TestShell'));
const TestKorzinka  = lazy(() => import('./test02/TestKorzinka'));
const TestXarita    = lazy(() => import('./test02/TestXarita'));
const TestLoyiha    = lazy(() => import('./test02/TestLoyiha'));
const Kontragentlar = lazy(() => import('./admin/tomonlar/Kontragentlar'));
const YetkazuvchiBugun = lazy(() => import('./admin/yetkazuvchi/YetkazuvchiBugun'));
const SubpudratchiBugun = lazy(() => import('./admin/subpudratchi/SubpudratchiBugun'));
const SubpudratBoshqaruv = lazy(() => import('./admin/subpudratchi/SubpudratBoshqaruv'));
const TestObyektlar = lazy(() => import('./test02/TestObyektlar'));
const WrapperMoliya = lazy(() => import('./test02/WrapperMoliya'));
const WrapperLogistika = lazy(() => import('./test02/WrapperLogistika'));
const TestSmetaBirlashgan = lazy(() => import('./test02/TestSmetaBirlashgan'));
const TestZayavka   = lazy(() => import('./test02/TestZayavka'));
const TenderSahifa  = lazy(() => import('./admin/tender/TenderSahifa'));
const YukBirjasiSahifa = lazy(() => import('./admin/yuk-birjasi/YukBirjasiSahifa'));
const YukChaqirish = lazy(() => import('./admin/yuk-tashish/YukChaqirish'));
const HaydovchiSahifa = lazy(() => import('./admin/yuk-tashish/HaydovchiSahifa'));
const YukOchiq = lazy(() => import('./admin/yuk-tashish/YukOchiq'));
const TestTolov     = lazy(() => import('./test02/TestTolov'));
const TestFaktura   = lazy(() => import('./test02/TestFaktura'));
const TestHisobot   = lazy(() => import('./test02/TestHisobot'));
const TestErp       = lazy(() => import('./test02/TestErp'));
const TestSozlama   = lazy(() => import('./test02/TestSozlama'));
const TestTizim     = lazy(() => import('./test02/TestTizim'));
const TestAosr      = lazy(() => import('./test02/TestAosr'));
const TestDaraxt    = lazy(() => import('./test02/TestDaraxt'));
const TestSaqlash   = lazy(() => import('./test02/TestSaqlash'));
const BossDashboard = lazy(() => import('./admin/sahifalar/BossDashboard'));
const DirektorPult = lazy(() => import('./admin/sahifalar/DirektorPult'));
const DocumentsPage = lazy(() => import('./admin/pages/DocumentsPage'));
const HujjatNazoratPage = lazy(() => import('./admin/pages/HujjatNazoratPage'));
const ParticipantsPage = lazy(() => import('./admin/pages/ParticipantsPage'));
const SystemControlPage = lazy(() => import('./admin/pages/SystemControlPage'));
const KompaniyaPage = lazy(() => import('./admin/pages/KompaniyaPage'));
const ShartnomaLiniya = lazy(() => import('./admin/sahifalar/ShartnomaLiniya'));
const Qarzdorlik = lazy(() => import('./admin/sahifalar/Qarzdorlik'));
const Hr = lazy(() => import('./admin/sahifalar/Hr'));
const Buxgalteriya = lazy(() => import('./admin/sahifalar/Buxgalteriya'));
const SotuvSahifa = lazy(() => import('./admin/sotuv/SotuvSahifa'));
const HujjatDizayni = lazy(() => import('./admin/sahifalar/HujjatDizayni'));
const SmetaStudio = lazy(() => import('./admin/sahifalar/SmetaStudio'));
const Tokenlar = lazy(() => import('./admin/sahifalar/Tokenlar'));
const IshJoylarim = lazy(() => import('./admin/sahifalar/IshJoylarim'));
const Topshiriqlar = lazy(() => import('./admin/sahifalar/Topshiriqlar'));
const Mutaxassis = lazy(() => import('./admin/sahifalar/Mutaxassis'));
const BoshqaruvPanel = lazy(() => import('./admin/sahifalar/BoshqaruvPanel'));
const AkkauntMarkazi = lazy(() => import('./admin/sahifalar/AkkauntMarkazi'));
const SozlamalarMarkazi = lazy(() => import('./admin/sahifalar/SozlamalarMarkazi'));
const SaytXaritasi = lazy(() => import('./admin/sahifalar/SaytXaritasi'));
const TizimXaritasi = lazy(() => import('./admin/sahifalar/TizimXaritasi'));
const AiAgentlar = lazy(() => import('./admin/sahifalar/AiAgentlar'));
const NarxManbalari = lazy(() => import('./admin/sahifalar/NarxManbalari'));
const ZakazchikKabinet = lazy(() => import('./admin/zakazchik/ZakazchikKabinet'));
const ObyektPortali = lazy(() => import('./admin/zakazchik/ObyektPortali'));
const TomonlarAloqa = lazy(() => import('./admin/zakazchik/TomonlarAloqa'));
const TaqdimlarInbox = lazy(() => import('./admin/zakazchik/TaqdimlarInbox'));
const Murojaatlar = lazy(() => import('./admin/zakazchik/Murojaatlar'));
const NazoratUy = lazy(() => import('./admin/nazorat/NazoratUy'));
const TekshiruvForma = lazy(() => import('./admin/nazorat/TekshiruvForma'));
const TekshiruvJurnal = lazy(() => import('./admin/nazorat/TekshiruvJurnal'));
const LabKabinet = lazy(() => import('./admin/laboratoriya/LabKabinet'));
const ChizmaReestri = lazy(() => import('./admin/loyihachi/ChizmaReestri'));
const LoyihachiBugun = lazy(() => import('./admin/loyihachi/LoyihachiBugun'));
const HujjatAylanish = lazy(() => import('./admin/zakazchik/HujjatAylanish'));
const NarxDalil = lazy(() => import('./admin/sahifalar/NarxDalil'));
const NarxTekshiruv = lazy(() => import('./admin/sahifalar/NarxTekshiruv'));
const Naryad = lazy(() => import('./admin/sahifalar/Naryad'));
const F2Reestr = lazy(() => import('./admin/sahifalar/F2Reestr'));
const DocumentCenterDemo = lazy(() => import('./admin/document-center/DocumentCenterDemo'));
const ParticipantNetworkDemo = lazy(() => import('./admin/participants/ParticipantNetworkDemo'));
const SystemControlDemo = lazy(() => import('./admin/system-control/SystemControlDemo'));
const F2ImportV3 = lazy(() => import('./admin/sahifalar/F2ImportV3'));
const M29Native = lazy(() => import('./admin/sahifalar/M29Native'));
const F2TayyorlashNative = lazy(() => import('./admin/sahifalar/F2TayyorlashNative'));
const NakopitelniyVedomost = lazy(() => import('./admin/sahifalar/NakopitelniyVedomost'));
const NakrutkaNative = lazy(() => import('./admin/sahifalar/NakrutkaNative'));
const F2TarixNative = lazy(() => import('./admin/sahifalar/F2TarixNative'));
const SmetaNarxlashResNative = lazy(() => import('./admin/sahifalar/SmetaNarxlashResNative'));
const OfertaNative = lazy(() => import('./admin/sahifalar/OfertaNative'));
const Narxlar = lazy(() => import('./admin/sahifalar/Narxlar'));
const RolBoshSahifa = lazy(() => import('./admin/RolBoshSahifa'));
const BolimTablari = lazy(() => import('./admin/BolimTablari'));
const FotoLenta = lazy(() => import('./admin/sahifalar/FotoLenta'));
// AiHelper (48 KB) faqat admin'dan tashqari sahifalarda — lazy, kirish sahifasini og'irlashtirmaydi.
const AiHelperLazy = lazy(() => import('./umumiy/ui/AiHelper').then((m) => ({ default: m.AiHelper })));
function AiHelper() { return <Suspense fallback={null}><AiHelperLazy /></Suspense>; }

// Boss pages
const Umumiy = lazy(() => import('./boss/sahifalar/Umumiy'));

// ERP pages
const ErpTexnika = lazy(() => import('./erp/sahifalar/ErpTexnika'));
const ErpTaminot = lazy(() => import('./erp/sahifalar/ErpTaminot'));
const ErpSifat = lazy(() => import('./erp/sahifalar/ErpSifat'));

function GlobalAiHelper() {
  const { pathname } = useLocation();
  return pathname === '/admin' || pathname.startsWith('/admin/') ? null : <AiHelper />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PageIdentity />
      <GlobalAiHelper />
      <Routes>
        <Route path="/" element={<KirishSahifa />} />
        {/* «Telegram modeli»: ish joyiga taklif havolasi (kirish talab qilinsa — kirgach shu yerga qaytadi). */}
        <Route path="/qoshil/:kod" element={<QoshilSahifa />} />
        {/* T5: obyektni ulashish havolasi — qabul qilgan odam obyektni o'z ish joyida faqat ko'radi. */}
        <Route path="/ulash/:kod" element={<UlashSahifa />} />
        {/* Telegram Mini App (@qur_uz_bot menyu tugmasi): imzolangan initData → oddiy sessiya → rol bosh sahifasi. */}
        <Route path="/tg" element={<Suspense fallback={<SahifaYuklanmoqda />}><TgKirish /></Suspense>} />
        <Route path="/yuk" element={<Suspense fallback={<SahifaYuklanmoqda />}><YukOchiq /></Suspense>} />

        {/* Admin shell and routes */}
        <Route path="/admin" element={
          <Suspense fallback={<div className="h-screen bg-bg flex items-center justify-center text-text-dim">Yuklanmoqda...</div>}>
            <AdminShell />
          </Suspense>
        }>
          {/* ⚡ 2026-08-27 (Claude, foydalanuvchi ko'rsatmasi bilan):
              TIZIM ALMASHUVI — Tizim_02 endi ASOSIY sahna. Avval bu yerda
              `/admin/obyektlar` (Tizim_01) turardi; endi saytga kirganda
              to'g'ridan-to'g'ri Tizim_02 ochiladi. Tizim_01 ning o'zi
              O'CHIRILMAGAN — barcha marshrutlari joyida, faqat AdminShell
              sidebar'ida "Eski Tizim (Arxiv)" degan yopiq bo'lim ostiga
              yig'ildi (pastga qara). */}
          {/* 2026-10-25 (tizim xaritasi P3): indeks har rolni o'z bosh sahifasiga yuboradi
              (boss/rahbar — rahbar paneli, PTO — obyektlar, buyurtmachi — kabinet …). */}
          <Route index element={<RolBoshSahifa />} />


          <Route path="holat" element={<HolatNative />} />
          <Route path="holat/:id" element={<HolatNative />} />
        <Route path="bugun" element={<Suspense fallback={<SahifaYuklanmoqda />}><UstaBugun /></Suspense>} />
          {/* 2026-10-25 (tizim xaritasi P1): F2 bo'limi — sidebarda bitta «F2» bandi, tepada tablar.
              Yo'lsiz layout: sahifalar va ularning URL'lari o'zgarmagan. */}
          <Route element={<BolimTablari />}>
            {/* 2026-11-12 (P2): «Fakt» bandida ikki tab — Fakt kiritish va Foto-dalil (URL'lar o'zgarmagan). */}
            <Route path="fakt" element={<FaktNative />} />
            <Route path="foto" element={<Suspense fallback={<SahifaYuklanmoqda />}><FotoLenta /></Suspense>} />
          {/* V3: direktor pulti — 6 katta plitka (tayyor hisoblar orqali tez). */}
          <Route path="pult" element={
            <Suspense fallback={<SahifaYuklanmoqda />}>
              <DirektorPult />
            </Suspense>
          } />          {/* BOSS PANEL P0 — canonical director dashboard (Supabase read model). */}
          <Route path="dashboard" element={
            <Suspense fallback={<SahifaYuklanmoqda />}>
              <BossDashboard />
            </Suspense>
          } />            <Route path="f2-tayyorlash" element={<F2TayyorlashNative />} />
            <Route path="f2" element={<F2ImportV3 />} />
            <Route path="f2-tarix" element={<F2TarixNative />} />
            <Route path="f2-reestr" element={<Suspense fallback={<SahifaYuklanmoqda />}><F2Reestr /></Suspense>} />
            <Route path="nakopitelniy" element={<NakopitelniyVedomost />} />
            {/* 2026-10-26 (yagona navigatsiya reestri, lib/nav/navReestr.ts): tabli bandlar — Obyektlar, Narxlash,
                Shartnomalar va tomonlar, Hujjatlar, Kiruvchi, Kompaniya. Yo'llar o'zgarmagan, faqat tepada tablar.
                obyektlar — faqat t2_obyekt kanonik IDlari; loyiha — production yo'l (avval faqat /admin/test/loyiha). */}
            <Route path="obyektlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><TestObyektlar /></Suspense>} />
            <Route path="loyiha" element={<Suspense fallback={<SahifaYuklanmoqda />}><TestLoyiha /></Suspense>} />
            <Route path="grafik" element={<Suspense fallback={<SahifaYuklanmoqda />}><GrafikSahifa /></Suspense>} />
            <Route path="tokenlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><Tokenlar /></Suspense>} />
            <Route path="hujjat-dizayn" element={<Suspense fallback={<SahifaYuklanmoqda />}><HujjatDizayni /></Suspense>} />
            <Route path="shartnoma-liniya" element={<Suspense fallback={<SahifaYuklanmoqda />}><ShartnomaLiniya /></Suspense>} />
            <Route path="qarzdorlik" element={<Suspense fallback={<SahifaYuklanmoqda />}><Qarzdorlik /></Suspense>} />
            <Route path="hr" element={<Suspense fallback={<SahifaYuklanmoqda />}><Hr /></Suspense>} />
            <Route path="mutaxassis" element={<Suspense fallback={<SahifaYuklanmoqda />}><Mutaxassis /></Suspense>} />
            <Route path="yuk-birjasi" element={<Suspense fallback={<SahifaYuklanmoqda />}><YukBirjasiSahifa /></Suspense>} />
            <Route path="yuk-chaqirish" element={<Suspense fallback={<SahifaYuklanmoqda />}><YukChaqirish /></Suspense>} />
            <Route path="haydovchi" element={<Suspense fallback={<SahifaYuklanmoqda />}><HaydovchiSahifa /></Suspense>} />
            <Route path="buxgalteriya" element={<Suspense fallback={<SahifaYuklanmoqda />}><Buxgalteriya /></Suspense>} />
            <Route path="nakrutka" element={<NakrutkaNative />} />
            <Route path="narx-manbalari" element={<Suspense fallback={<SahifaYuklanmoqda />}><NarxManbalari /></Suspense>} />
            <Route path="narx-dalil" element={<Suspense fallback={<SahifaYuklanmoqda />}><NarxDalil /></Suspense>} />
            <Route path="narx-tekshiruv" element={<Suspense fallback={<SahifaYuklanmoqda />}><NarxTekshiruv /></Suspense>} />
            <Route path="naryad" element={<Suspense fallback={<SahifaYuklanmoqda />}><Naryad /></Suspense>} />
            <Route path="smeta-narxlash" element={<SmetaNarxlashResNative />} />
            <Route path="oferta" element={<OfertaNative />} />
            <Route path="narxlar" element={<Narxlar />} />
            <Route path="storage" element={<TestSaqlash />} />
            <Route path="mindmap" element={<TestXarita />} />
            <Route path="documents" element={<Suspense fallback={<SahifaYuklanmoqda />}><DocumentsPage /></Suspense>} />
            <Route path="hujjat-nazorat" element={<Suspense fallback={<SahifaYuklanmoqda />}><HujjatNazoratPage /></Suspense>} />
            <Route path="participants" element={<Suspense fallback={<SahifaYuklanmoqda />}><ParticipantsPage /></Suspense>} />
            <Route path="zakazchik" element={<Suspense fallback={<SahifaYuklanmoqda />}><ZakazchikKabinet /></Suspense>} />
            {/* Tomonlar -> Kontragentlar (ekotizim V3): CRM, Logistika kontragentlari va Aloqalar bitta sahifaga birlashtirildi; eski yo'llar yo'naltiriladi. */}
            <Route path="kontragentlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><Kontragentlar /></Suspense>} />
            <Route path="aloqalar" element={<Navigate to="/admin/kontragentlar?tab=aloqa" replace />} />            <Route path="taqdimlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><TaqdimlarInbox /></Suspense>} />
            {/* Subpudratchi tomoni: «Bugun» (subpudratchi) va boshqaruv (bosh pudratchi). */}
            <Route path="subpudratchi" element={<Suspense fallback={<SahifaYuklanmoqda />}><SubpudratchiBugun /></Suspense>} />
            <Route path="subpudrat" element={<Suspense fallback={<SahifaYuklanmoqda />}><SubpudratBoshqaruv /></Suspense>} />
            <Route path="murojaatlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><Murojaatlar /></Suspense>} />
          <Route path="nazorat" element={<Suspense fallback={<SahifaYuklanmoqda />}><NazoratUy /></Suspense>} />
          <Route path="nazorat/tekshiruv" element={<Suspense fallback={<SahifaYuklanmoqda />}><TekshiruvForma /></Suspense>} />
          <Route path="nazorat/jurnal" element={<Suspense fallback={<SahifaYuklanmoqda />}><TekshiruvJurnal /></Suspense>} />
            <Route path="laboratoriya" element={<Suspense fallback={<SahifaYuklanmoqda />}><LabKabinet /></Suspense>} />
            <Route path="hujjat-aylanish" element={<Suspense fallback={<SahifaYuklanmoqda />}><HujjatAylanish /></Suspense>} />
            <Route path="chizmalar" element={<Suspense fallback={<SahifaYuklanmoqda />}><ChizmaReestri /></Suspense>} />
            <Route path="loyihachi" element={<Suspense fallback={<SahifaYuklanmoqda />}><LoyihachiBugun /></Suspense>} />
            <Route path="system-control" element={<Suspense fallback={<SahifaYuklanmoqda />}><SystemControlPage /></Suspense>} />
            <Route path="ai-agentlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><AiAgentlar /></Suspense>} />
            <Route path="kompaniya" element={<Suspense fallback={<SahifaYuklanmoqda />}><KompaniyaPage /></Suspense>} />
            <Route path="crm" element={<Navigate to="/admin/kontragentlar" replace />} />
            <Route path="aosr" element={<TestAosr />} />
            <Route path="korzinka" element={<TestKorzinka />} />
            <Route path="tizim-sozlama" element={<TestSozlama />} />
          </Route>
          {/* Eski F2 import (V2) — V3 barqarorlashguncha zaxira yo'l. */}
          <Route path="f2-eski" element={<Navigate to="/admin/f2" replace />} />
          {/* Egasi 2026-10-01: Loyiha → Shartnoma (tomonlar) → Obyektlar. */}
          {/* Egasi 2026-10-02: har hujjat turi uchun rang mavzusi. */}
          {/* Egasi 2026-10-02: token balansi, obuna, superadmin to'lov tasdig'i. */}
          {/* «Telegram modeli» markazi: barcha ish joylari + barcha joylardan «Mening ishlarim». */}
          <Route path="topshiriqlar" element={<Suspense fallback={<SahifaYuklanmoqda />}><Topshiriqlar /></Suspense>} />
          {/* Yetkazuvchi tomoni «Bugun» (ekotizim V3): kelgan so'rovlar, takliflar, buyurtmalar, transport. */}
          <Route path="yetkazuvchi" element={<Suspense fallback={<SahifaYuklanmoqda />}><YetkazuvchiBugun /></Suspense>} />
          <Route path="ish-joylarim" element={<Suspense fallback={<SahifaYuklanmoqda />}><IshJoylarim /></Suspense>} />
          {/* T6: mutaxassis profili va kompaniyalarga xizmat taklifi. */}
          {/* Egasi 2026-10-02: platforma boshqaruv paneli (faqat superadmin; server tekshiradi). */}
          <Route path="boshqaruv" element={<Suspense fallback={<SahifaYuklanmoqda />}><BoshqaruvPanel /></Suspense>} />
          <Route path="smeta-studio" element={<Suspense fallback={<SahifaYuklanmoqda />}><SmetaStudio /></Suspense>} />
          <Route path="m29" element={<M29Native />} />
          {/* Uy sotish (egasi 2026-11-03): shaxmatka, bitimlar, bron, grafik, to'lovlar, panel. */}
          <Route path="sotuv" element={<Suspense fallback={<SahifaYuklanmoqda />}><SotuvSahifa /></Suspense>} />
          {/* Tizim1 sahifalari olib tashlandi (egasi 2026-10-21/22); eski havolalar zamonaviy sahifaga yo'naltiriladi. */}
          <Route path="shartnomalar" element={<Navigate to="/admin/shartnoma-liniya" replace />} />
          <Route path="fakturalar" element={<Navigate to="/admin/moliya" replace />} />
          <Route path="sklad" element={<Navigate to="/admin/logistika" replace />} />
          <Route path="ierarxiya" element={<Navigate to="/admin/holat" replace />} />
          <Route path="monitoring" element={<Navigate to="/admin/system-control" replace />} />
          <Route path="sozlamalar" element={<Suspense fallback={<SahifaYuklanmoqda />}><SozlamalarMarkazi /></Suspense>} />
          {/* ⚡ 2026-08-16: eski GAS paneldagi «Файл боғлаш» tabi */}
          <Route path="fayl-boglash" element={<FaylBoglash />} />
          <Route path="hujjatlar" element={<Navigate to="/admin/documents" replace />} />
          <Route path="shaxsiy-smeta" element={<Navigate to="/admin/smeta-studio" replace />} />
          <Route path="supabase" element={<Navigate to="/admin/system-control" replace />} />
          <Route path="tezlik" element={<Navigate to="/admin/system-control" replace />} />
          {/* Canonical product routes; legacy /admin/test/* remains for compatibility.
              `dashboard` -> BossDashboard (declared above). */}
          <Route path="zakazchik/obyekt/:aloqaId/:obyektId" element={<Suspense fallback={<SahifaYuklanmoqda />}><ObyektPortali /></Suspense>} />
          <Route path="akkaunt" element={<Suspense fallback={<SahifaYuklanmoqda />}><AkkauntMarkazi /></Suspense>} />
          <Route path="sayt-xaritasi" element={<Suspense fallback={<SahifaYuklanmoqda />}><SaytXaritasi /></Suspense>} />
          {/* Egasi 2026-10-27: tizim darajasidagi jonli mindmap — faqat superadmin va u ruxsat berganlar (sahifa avval serverdan so'raydi). */}
          <Route path="tizim-xaritasi" element={<Suspense fallback={<SahifaYuklanmoqda />}><TizimXaritasi /></Suspense>} />
          {/* Demo harnesses — explicit, never the default route. */}
          <Route path="_demo/documents" element={<Suspense fallback={<SahifaYuklanmoqda />}><DocumentCenterDemo /></Suspense>} />
          <Route path="_demo/participants" element={<Suspense fallback={<SahifaYuklanmoqda />}><ParticipantNetworkDemo /></Suspense>} />
          <Route path="_demo/system-control" element={<Suspense fallback={<SahifaYuklanmoqda />}><SystemControlDemo /></Suspense>} />

          {/* ===== TIZIM_02 (SINOV) — alohida bo’lim =====
              Ma’lumot Supabase’dan o’qiladi. Tizim_01 ning bironta
              marshruti/sahifasi o’zgartirilmagan. */}
          <Route path="test" element={<TestShell />}>
            <Route index element={<Navigate to="/admin/loyiha" replace />} />
            
            {/* Yangi Wrapper Marshrutlar */}
            <Route path="portfel" element={<Navigate to="/admin/loyiha" replace />} /> {/* takror «Loyihalar» sahifasi — asosiy /admin/loyiha ga */}
            <Route path="moliya" element={<Navigate to="/admin/moliya" replace />} />
            <Route path="logistika" element={<Navigate to="/admin/logistika" replace />} />
            <Route path="crm" element={<Navigate to="/admin/kontragentlar" replace />} />

            <Route path="sozlama" element={<Navigate to="/admin/tizim-sozlama" replace />} />
            {/* IA consolidation (T2-COMPANY-CONTEXT-P0-FIX-001): a'zolar boshqaruvi
                endi bitta joyda — /admin/kompaniya. Eski manzil yo'naltiriladi. */}
            <Route path="xodimlar" element={<Navigate to="/admin/kompaniya" replace />} />
            <Route path="loyiha" element={<Navigate to="/admin/loyiha" replace />} />
            <Route path="korzinka" element={<Navigate to="/admin/korzinka" replace />} />
            <Route path="xarita" element={<Navigate to="/admin/mindmap" replace />} />
            <Route path="kontragent" element={<Navigate to="/admin/kontragentlar" replace />} />
            <Route path="obyektlar" element={<Navigate to="/admin/obyektlar" replace />} />
            <Route path="saqlash" element={<Navigate to="/admin/storage" replace />} />
            <Route path="smeta" element={<TestSmetaBirlashgan />} />
            <Route path="daraxt" element={<TestDaraxt />} />
            <Route path="shartnomalar" element={<Navigate to="/admin/shartnoma-liniya" replace />} />
            <Route path="tolov" element={<TestTolov />} />
            <Route path="sklad" element={<Navigate to="/admin/logistika" replace />} />
              <Route path="zayavka" element={<Navigate to="/admin/zayavka" replace />} />
            <Route path="f2native" element={<Navigate to="/admin/f2" replace />} />
            <Route path="faktura" element={<TestFaktura />} />
            <Route path="erp" element={<Navigate to="/admin/erp" replace />} />
            <Route path="hisobot" element={<TestHisobot />} />
            <Route path="tizim" element={<TestTizim />} />
            <Route path="aosr" element={<Navigate to="/admin/aosr" replace />} />
          </Route>
          {/* ERP routes for Admin */}
          <Route path="kadrlar" element={<Navigate to="/admin/hr" replace />} />
          <Route path="texnika" element={<ErpTexnika />} />
          <Route path="taminot" element={<ErpTaminot />} />
          <Route path="sifat" element={<ErpSifat />} />

          {/* T2-IA-PROD-URL-001 (2026-09-08): bu sahifalar allaqachon ishlab
              turgan mahsulot qismlari, lekin manzillari tarixiy sabab bilan
              `/admin/test/...` edi — ya'ni foydalanuvchi kundalik menyuda
              «test» so'zini ko'rib turardi. Endi ularning PRODUCTION manzili
              bor; eski `/admin/test/*` YO'Q QILINMADI (eski havolalar,
              xatcho'plar va boshqa agentlarning shoxchalari buzilmasin). */}
          <Route path="moliya" element={<WrapperMoliya />} />
          <Route path="logistika" element={<WrapperLogistika />} />
          <Route path="zayavka" element={<TestZayavka />} />
          <Route path="tender" element={<Suspense fallback={<SahifaYuklanmoqda />}><TenderSahifa /></Suspense>} />
          <Route path="erp" element={<TestErp />} />
          {/* `sozlamalar` (T1) allaqachon band — bu T2 sozlamalari. */}

          {/* WARN 2026-08-17 — ESKI MANZILLAR UCHUN KO’PRIK.
              Menyudagi `shartnoma` → `shartnomalar` xatosi tuzatilgach ham
              muammo qaytdi, chunki eski manzil FOYDALANUVCHIDA qolgan
              bo’lishi mumkin: xatcho’p, brauzer tarixi, avtoto’ldirish,
              yorliq, boshqaga yuborilgan havola. Ular hammasi eski yo’lga
              boradi. Bitta havolani tuzatish YETMAYDI — eski manzil ham
              ishlashi kerak. */}
          <Route path="shartnoma" element={<Navigate to="/admin/shartnoma-liniya" replace />} />
          <Route path="kalkulyator" element={<Navigate to="/admin/smeta-studio" replace />} />

          {/* WARN 2026-08-17 — ENG MUHIMI: noma’lum `/admin/...` manzil endi
              QOBIQ ICHIDA ochiladi. Avval u pastdagi `path="*"` ga tushib,
              foydalanuvchini KIRISH SAHIFASIGA otib yuborardi — aynan
              "шартномалар табига кирсам кириш панелига қайтариб юборайапди"
              shikoyatining ildizi shu. Adashgan manzil chiqarib yuborish
              uchun sabab EMAS. */}
          <Route path="*" element={<SahifaTopilmadi />} />
        </Route>

        {/* Boss shell and routes */}
        <Route path="/boss" element={
          <Suspense fallback={<div className="h-screen bg-bg flex items-center justify-center text-text-dim">Yuklanmoqda...</div>}>
            <BossShell />
          </Suspense>
        }>
          {/* BOSS PANEL P0: the legacy GAS/Sheets `Umumiy` dashboard is
              superseded by the canonical /admin/dashboard read model. */}
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="eski" element={<Umumiy />} />
          <Route path="holat" element={<Navigate to="/admin/holat" replace />} />
          <Route path="holat/:id" element={<BossHolatYonaltir />} />
          <Route path="fakt" element={<Navigate to="/admin/fakt" replace />} />
          {/* ERP routes for Boss */}
          <Route path="kadrlar" element={<Navigate to="/admin/hr" replace />} />
          <Route path="texnika" element={<Navigate to="/admin/texnika" replace />} />
          <Route path="taminot" element={<Navigate to="/admin/taminot" replace />} />
          <Route path="sifat" element={<Navigate to="/admin/sifat" replace />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
      <TasdiqContainer />
    </BrowserRouter>
  );
}

/** /boss/holat/:id eski havolalari (Umumiy.tsx) - production sahifaga. */
function BossHolatYonaltir() { const { id } = useParams(); return <Navigate to={`/admin/holat/${encodeURIComponent(id ?? '')}`} replace />; }

function PageIdentity() { const { pathname } = useLocation(); useEffect(() => { document.title = titleForPath(pathname); }, [pathname]); return null; }
