import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { titleForPath } from './lib/pageTitle';
import { ToastContainer } from './umumiy/ui/Toast';
import SahifaTopilmadi from './umumiy/ui/SahifaTopilmadi';
import KirishSahifa from './kirish/KirishSahifa';

const AdminShell = lazy(() => import('./admin/AdminShell'));
const BossShell = lazy(() => import('./boss/BossShell'));

// Admin pages
import { HolatNative } from './admin/sahifalar/HolatNative';
import { FaktNative } from './admin/sahifalar/FaktNative';
import { Shartnoma } from './admin/sahifalar/Shartnoma';
import { Sklad } from './admin/sahifalar/Sklad';
import { Monitoring } from './admin/sahifalar/Monitoring';
import { Sozlamalar } from './admin/sahifalar/Sozlamalar';
import FaylBoglash from './admin/sahifalar/FaylBoglash';
import Hujjatlar from './admin/sahifalar/Hujjatlar';
import ShaxsiySmeta from './admin/sahifalar/ShaxsiySmeta';
import SupabaseSozlama from './admin/sahifalar/SupabaseSozlama';
import TezlikSinovi from './admin/sahifalar/TezlikSinovi';
/* TIZIM_02 — Supabase sinov muhiti. Tizim_01 ga TEGMAYDI. */
const TestShell     = lazy(() => import('./test02/TestShell'));
const TestKorzinka  = lazy(() => import('./test02/TestKorzinka'));
const TestXarita    = lazy(() => import('./test02/TestXarita'));
const TestLoyiha    = lazy(() => import('./test02/TestLoyiha'));
const TestKontragent = lazy(() => import('./test02/TestKontragent'));
const TestObyektlar = lazy(() => import('./test02/TestObyektlar'));
const WrapperPortfel = lazy(() => import('./test02/WrapperPortfel'));
const WrapperMoliya = lazy(() => import('./test02/WrapperMoliya'));
const WrapperLogistika = lazy(() => import('./test02/WrapperLogistika'));
const WrapperCRM = lazy(() => import('./test02/WrapperCRM'));
const TestSmetaBirlashgan = lazy(() => import('./test02/TestSmetaBirlashgan'));
const TestNarxlar   = lazy(() => import('./test02/TestNarxlar'));
const TestF2        = lazy(() => import('./test02/TestF2'));
const TestSklad     = lazy(() => import('./test02/TestSklad'));
const TestZayavka   = lazy(() => import('./test02/TestZayavka'));
const TestBirja     = lazy(() => import('./test02/TestBirja'));
const TestInvite    = lazy(() => import('./test02/TestInvite'));
const TestTolov     = lazy(() => import('./test02/TestTolov'));
const TestFaktura   = lazy(() => import('./test02/TestFaktura'));
const TestHujjat    = lazy(() => import('./test02/TestHujjat'));
const TestHisobot   = lazy(() => import('./test02/TestHisobot'));
const TestErp       = lazy(() => import('./test02/TestErp'));
const TestSozlama   = lazy(() => import('./test02/TestSozlama'));
const TestShartnoma = lazy(() => import('./test02/TestShartnoma'));
const TestTizim     = lazy(() => import('./test02/TestTizim'));
const TestAosr      = lazy(() => import('./test02/TestAosr'));
const TestGrafik    = lazy(() => import('./test02/TestGrafik'));
const TestSpravochnik = lazy(() => import('./test02/TestSpravochnik'));
const TestDaraxt    = lazy(() => import('./test02/TestDaraxt'));
const TestSaqlash   = lazy(() => import('./test02/TestSaqlash'));
const BossDashboard = lazy(() => import('./admin/sahifalar/BossDashboard'));
const DocumentsPage = lazy(() => import('./admin/pages/DocumentsPage'));
const HujjatNazoratPage = lazy(() => import('./admin/pages/HujjatNazoratPage'));
const ParticipantsPage = lazy(() => import('./admin/pages/ParticipantsPage'));
const SystemControlPage = lazy(() => import('./admin/pages/SystemControlPage'));
const KompaniyaPage = lazy(() => import('./admin/pages/KompaniyaPage'));
const ShartnomaLiniya = lazy(() => import('./admin/sahifalar/ShartnomaLiniya'));
const SaytXaritasi = lazy(() => import('./admin/sahifalar/SaytXaritasi'));
const AiAgentlar = lazy(() => import('./admin/sahifalar/AiAgentlar'));
const NarxManbalari = lazy(() => import('./admin/sahifalar/NarxManbalari'));
const NarxDalil = lazy(() => import('./admin/sahifalar/NarxDalil'));
const DocumentCenterDemo = lazy(() => import('./admin/document-center/DocumentCenterDemo'));
const ParticipantNetworkDemo = lazy(() => import('./admin/participants/ParticipantNetworkDemo'));
const SystemControlDemo = lazy(() => import('./admin/system-control/SystemControlDemo'));
import F2ImportV3 from './admin/sahifalar/F2ImportV3';
import M29Native from './admin/sahifalar/M29Native';
import { F2TayyorlashNative } from './admin/sahifalar/F2TayyorlashNative';
import NakopitelniyVedomost from './admin/sahifalar/NakopitelniyVedomost';
import NakrutkaNative from './admin/sahifalar/NakrutkaNative';
import F2TarixNative from './admin/sahifalar/F2TarixNative';
import SmetaNarxlashResNative from './admin/sahifalar/SmetaNarxlashResNative';
import OfertaNative from './admin/sahifalar/OfertaNative';
import { Narxlar } from './admin/sahifalar/Narxlar';
import { Ierarxiya } from './admin/sahifalar/Ierarxiya';
import { Fakturalar } from './admin/sahifalar/Fakturalar';
import { Buxgalteriya } from './admin/sahifalar/Buxgalteriya';
import { CommandPalette } from './umumiy/ui/CommandPalette';
import { AiHelper } from './umumiy/ui/AiHelper';

// Boss pages
const Umumiy = lazy(() => import('./boss/sahifalar/Umumiy'));

// ERP pages
const ErpKadrlar = lazy(() => import('./erp/sahifalar/ErpKadrlar'));
const ErpTexnika = lazy(() => import('./erp/sahifalar/ErpTexnika'));
const ErpTaminot = lazy(() => import('./erp/sahifalar/ErpTaminot'));
const ErpSifat = lazy(() => import('./erp/sahifalar/ErpSifat'));

export default function App() {
  return (
    <BrowserRouter>
      <PageIdentity />
      <CommandPalette />
      <AiHelper />
      <Routes>
        <Route path="/" element={<KirishSahifa />} />
        
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
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          {/* BOSS PANEL P0 — canonical director dashboard (Supabase read model). */}
          <Route path="dashboard" element={
            <Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}>
              <BossDashboard />
            </Suspense>
          } />
          {/* Kundalik obyekt ro'yxati endi faqat t2_obyekt kanonik IDlari
              bilan ishlaydi. Eski Drive/GAS kartalari arxiv yo'liga chiqmaydi. */}
          <Route path="obyektlar" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><TestObyektlar /></Suspense>} />
          {/* T2-PTO-OWNER-CRITICAL-CLOSURE P0-1: loyiha yaratish/tanlash
              production yo'lda -- avval faqat /admin/test/loyiha ostida edi. */}
          <Route path="loyiha" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><TestLoyiha /></Suspense>} />
          <Route path="holat" element={<HolatNative />} />
          <Route path="holat/:id" element={<HolatNative />} />
          <Route path="fakt" element={<FaktNative />} />
          <Route path="f2" element={<F2ImportV3 />} />
          {/* Eski F2 import (V2) — V3 barqarorlashguncha zaxira yo'l. */}
          <Route path="f2-eski" element={<Navigate to="/admin/f2" replace />} />
          <Route path="f2-tayyorlash" element={<F2TayyorlashNative />} />
          {/* Egasi 2026-10-01: Loyiha → Shartnoma (tomonlar) → Obyektlar. */}
          <Route path="shartnoma-liniya" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><ShartnomaLiniya /></Suspense>} />
          <Route path="nakopitelniy" element={<NakopitelniyVedomost />} />
          <Route path="m29" element={<M29Native />} />
          <Route path="nakrutka" element={<NakrutkaNative />} />
          <Route path="narx-manbalari" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><NarxManbalari /></Suspense>} />
          <Route path="narx-dalil" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><NarxDalil /></Suspense>} />
          <Route path="f2-tarix" element={<F2TarixNative />} />
          <Route path="smeta-narxlash" element={<SmetaNarxlashResNative />} />
          <Route path="oferta" element={<OfertaNative />} />
          <Route path="buxgalteriya" element={<Buxgalteriya />} />
          <Route path="shartnomalar" element={<Shartnoma />} />
          <Route path="fakturalar" element={<Fakturalar />} />
          <Route path="sklad" element={<Sklad />} />
          <Route path="narxlar" element={<Narxlar />} />
          <Route path="ierarxiya" element={<Ierarxiya />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="sozlamalar" element={<Sozlamalar />} />
          {/* ⚡ 2026-08-16: eski GAS paneldagi «Файл боғлаш» tabi */}
          <Route path="fayl-boglash" element={<FaylBoglash />} />
          <Route path="hujjatlar" element={<Hujjatlar />} />
          <Route path="shaxsiy-smeta" element={<ShaxsiySmeta />} />
          <Route path="supabase" element={<SupabaseSozlama />} />
          <Route path="tezlik" element={<TezlikSinovi />} />
          {/* Canonical product routes; legacy /admin/test/* remains for compatibility.
              `dashboard` -> BossDashboard (declared above). */}
          <Route path="storage" element={<TestSaqlash />} />
          <Route path="mindmap" element={<TestXarita />} />
          <Route path="documents" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><DocumentsPage /></Suspense>} />
          <Route path="hujjat-nazorat" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><HujjatNazoratPage /></Suspense>} />
          <Route path="participants" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><ParticipantsPage /></Suspense>} />
          <Route path="system-control" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><SystemControlPage /></Suspense>} />
          <Route path="sayt-xaritasi" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><SaytXaritasi /></Suspense>} />
          <Route path="ai-agentlar" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><AiAgentlar /></Suspense>} />
          <Route path="kompaniya" element={<Suspense fallback={<div className="p-6 text-text-dim">Yuklanmoqda...</div>}><KompaniyaPage /></Suspense>} />
          {/* Demo harnesses — explicit, never the default route. */}
          <Route path="_demo/documents" element={<Suspense fallback={null}><DocumentCenterDemo /></Suspense>} />
          <Route path="_demo/participants" element={<Suspense fallback={null}><ParticipantNetworkDemo /></Suspense>} />
          <Route path="_demo/system-control" element={<Suspense fallback={null}><SystemControlDemo /></Suspense>} />

          {/* ===== TIZIM_02 (SINOV) — alohida bo’lim =====
              Ma’lumot Supabase’dan o’qiladi. Tizim_01 ning bironta
              marshruti/sahifasi o’zgartirilmagan. */}
          <Route path="test" element={<TestShell />}>
            <Route index element={<Navigate to="/admin/test/portfel" replace />} />
            
            {/* Yangi Wrapper Marshrutlar */}
            <Route path="portfel" element={<WrapperPortfel />} />
            <Route path="moliya" element={<WrapperMoliya />} />
            <Route path="logistika" element={<WrapperLogistika />} />
            <Route path="crm" element={<WrapperCRM />} />

            <Route path="sozlama" element={<TestSozlama />} />
            {/* IA consolidation (T2-COMPANY-CONTEXT-P0-FIX-001): a'zolar boshqaruvi
                endi bitta joyda — /admin/kompaniya. Eski manzil yo'naltiriladi. */}
            <Route path="xodimlar" element={<Navigate to="/admin/kompaniya" replace />} />
            <Route path="loyiha" element={<TestLoyiha />} />
            <Route path="korzinka" element={<TestKorzinka />} />
            <Route path="xarita" element={<TestXarita />} />
            <Route path="kontragent" element={<TestKontragent />} />
            <Route path="obyektlar" element={<TestObyektlar />} />
            <Route path="saqlash" element={<TestSaqlash />} />
            <Route path="smeta" element={<TestSmetaBirlashgan />} />
            <Route path="daraxt" element={<TestDaraxt />} />
            <Route path="shartnomalar" element={<TestShartnoma />} />
            <Route path="tolov" element={<TestTolov />} />
            <Route path="sklad" element={<TestSklad />} />
              <Route path="zayavka" element={<TestZayavka />} />
            <Route path="f2native" element={<Navigate to="/admin/f2" replace />} />
            <Route path="faktura" element={<TestFaktura />} />
            <Route path="erp" element={<TestErp />} />
            <Route path="hisobot" element={<TestHisobot />} />
            <Route path="sozlama" element={<TestSozlama />} />
            <Route path="tizim" element={<TestTizim />} />
            <Route path="aosr" element={<TestAosr />} />
          </Route>
          {/* ERP routes for Admin */}
          <Route path="kadrlar" element={<ErpKadrlar />} />
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
          <Route path="crm" element={<WrapperCRM />} />
          <Route path="zayavka" element={<TestZayavka />} />
          <Route path="aosr" element={<TestAosr />} />
          <Route path="korzinka" element={<TestKorzinka />} />
          <Route path="erp" element={<TestErp />} />
          {/* `sozlamalar` (T1) allaqachon band — bu T2 sozlamalari. */}
          <Route path="tizim-sozlama" element={<TestSozlama />} />

          {/* WARN 2026-08-17 — ESKI MANZILLAR UCHUN KO’PRIK.
              Menyudagi `shartnoma` → `shartnomalar` xatosi tuzatilgach ham
              muammo qaytdi, chunki eski manzil FOYDALANUVCHIDA qolgan
              bo’lishi mumkin: xatcho’p, brauzer tarixi, avtoto’ldirish,
              yorliq, boshqaga yuborilgan havola. Ular hammasi eski yo’lga
              boradi. Bitta havolani tuzatish YETMAYDI — eski manzil ham
              ishlashi kerak. */}
          <Route path="shartnoma" element={<Navigate to="/admin/shartnomalar" replace />} />
          <Route path="kalkulyator" element={<Navigate to="/admin/shaxsiy-smeta" replace />} />

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
          <Route path="holat" element={<HolatNative />} />
          <Route path="holat/:id" element={<HolatNative />} />
          <Route path="fakt" element={<FaktNative />} />
          {/* ERP routes for Boss */}
          <Route path="kadrlar" element={<ErpKadrlar />} />
          <Route path="texnika" element={<ErpTexnika />} />
          <Route path="taminot" element={<ErpTaminot />} />
          <Route path="sifat" element={<ErpSifat />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

function PageIdentity() { const { pathname } = useLocation(); useEffect(() => { document.title = titleForPath(pathname); }, [pathname]); return null; }
