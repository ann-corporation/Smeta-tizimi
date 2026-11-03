# Cloud sessiya holati (Claude@cloud → L0)

Sessiya: https://claude.ai/code/session_01RZTNHRQ7RnNsEZxefQtyva · yangilandi: 2026-11-03 (2).
L0 shu faylni o'qib, egasining koordinatsiya yozuvlariga ko'chiradi.

## Boshqaruv (egasi 2026-11-03)
Boshqaruv to'liq **L0 (lokal agent)** da. Cloud ishni faqat L0 dan oladi, boshlanganlarini tugatadi, parallel ish qilmaydi.

## Yakuniy taqsimot (L0 2026-11-03)
- **Cloud:**
  1. Uy sotish — #236 + ekranlar (sub-agent shu tarmoqda quryapti).
  2. Tender — #239 + ekranlar (sub-agent shu tarmoqda quryapti).
  3. Logistika #235 — FAQAT 2 ta CI xatosi, keyin to'xtash.
  4. 3D — keyinroq, faqat tadqiqot.
- **To'xtatildi:** HR/KPI, buxgalteriya, hujjat/laboratoriya rejalash agentlari, asfalt.
  - Rejalash agentlari to'xtatishdan oldin tugagan edi. Rejalar `claude/cloud-rejalar` tarmog'ida, `docs/architecture/cloud-rejalar/`: `IJRO_HUJJATLARI_LAB_TOMONLAR.md`, `HR_KPI_BUXGALTERIYA.md`. O'zgarishsiz — lokal quruvchilar uchun kirish material.
  - Asfalt Excel egasiga berilgan; tekshiruvni lokal agent qiladi.
- **130 test tokeni** — egasining qarori, cloud tegmaydi.

## Yo'llar (L0 2026-11-03)
- Cloud: **uy sotish** (0→100), **tender** (mavjud `t2_birja_*` modelini kengaytirish), **3D / virtual sayohat** (keyin; avval faqat tadqiqot + reja).
- Lokal agentlar: R2 ga ko'chirish, asfalt kalkulyatsiyasi, HR/KPI, buxgalteriya, hujjat oqimi (laboratoriya/ekspertiza/xat/tasdiq), logistika.
- Qoidalar:
  - Supabase Free 421/500 MB — katta va o'zgarmas ma'lumot R2 da (DB da kalit + sha256).
  - Migratsiya faqat fayl (+rollback +acceptance), prodga L0 qo'llaydi.
  - Gitda real summa, INN va ism yo'q.

## Vazifalar

### 1. Uy sotish — `claude/uy-sotuv-v1` · PR ann-corporation/Smeta-tizimi#236 (draft)
- **Bajarildi (S1 server):**
  - migratsiya `20261124000000_t2_uy_sotuv_v1` (+rollback, self-seeding acceptance; lokal PG16 da forward → acceptance → rollback → forward o'tdi);
  - 10 yozish + 5 o'qish RPC, `sales.*` capability, rol `sotuvchi`;
  - shlyuz (sb, sb-yoz, policy, tenant), `src/api/t2-sotuv.ts`, `src/lib/sotuv/hisob.ts` + testlar.
- **L0 dan kerak:** migratsiyani prodga qo'llash, keyin `.acceptance.sql`.
- **Keyingi (S2 UI):**
  - sotuvchi — shaxmatka, kanban, bitim kartasi, grafik, to'lovlar, panel, loyiha sozlamasi;
  - xaridor — katalog, xonadon sahifasi, ipoteka kalkulyatori, kabinet.
- Rasmlar va planirovkalar R2 da.

### 2. Tender — `claude/tender-v1` · PR ann-corporation/Smeta-tizimi#239 (draft) — ✅ server + UI tayyor
- **Asos:** mavjud `t2_birja_*` / `t2_buyurtma*` / `t2_tender_*_v1` kengaytirildi. v1 RPC buzilmagan; `supabase/tests/t2_tender_contract.sql` o'tadi.
- **Migratsiya** `20261122000000_t2_tender_protsess_v1` (+rollback, acceptance — 66 tekshiruv).
  - Yangi jadvallar: `t2_tender_jurnal` (o'zgarmas, payload ≤1 KB), `t2_tender_savol`, `t2_tender_baho`; fayllar R2 da (`t2_primitiv_dalil`).
  - RPC: 12 yozish + 4 o'qish.
  - Ruxsatlar: `procurement.*`, `supply.offer` (yangi capability yo'q).
- **Oqim:** qoralama → tasdiq → e'lon → muhrlangan takliflar → ochish → baholash (narx / ball) → BAFO raund → g'olib (qator bo'yicha bo'linma, asos majburiy) → buyurtma → yopish.
- **UI** `/admin/tender`: mening tenderlarim, menga taklif qilinganlar, ochiq e'lonlar, tahlil.
- **Darvozalar:** tsc, oxlint, site-map, tekshir va to'liq vitest (636 fayl / 4675 test) — yashil.
- **Qoldiqlar:**
  - fayl yuklash UI;
  - to'lov va ombor havolasi UI'da;
  - outbox → Telegram fan-out;
  - yetkazuvchi o'qishi `procurement.read` talab qiladi;
  - brauzerda qo'lda ko'rilmagan.
- **L0 dan kerak:** migratsiyani BEGIN..ROLLBACK da sinab qo'llash; egasiga 5 savol (PR tavsifida).

### 3. 3D / virtual sayohat — navbatda (uy sotish S2 dan keyin)
- Faqat tadqiqot + reja.
- Dastlabki tavsiya: Twinmotion / Lumion fasl renderlari + 360° panorama (R2) → three.js interaktiv bino (shaxmatkaga bog'langan) → dron / Gaussian Splatting. Pixel Streaming — faqat premium.

## L0 yo'liga o'tkaziladi (cloud boshlagan edi — egasi to'g'ridan-to'g'ri so'ragan edi)
- **Logistika** — `claude/logistika-v1`, PR ann-corporation/Smeta-tizimi#235 — ✅ CI yashil (7d2c96b9). Cloud ishi TUGADI, L0 ga topshirildi.
  - Migratsiya `20261123000000_t2_transport_v1`: jadvallar `t2_tr_*`, 10 yozish RPC + `t2_transport_ol_v1`. Tannarx, ob'ektlarga taqsim, `t2_xarajat_kirit_v1` ga МАШ provodka, narxlash va marja.
    - GPS trek, marshrut geometriyasi va fayllar Supabase'ga yozilmaydi.
  - **Acceptance** real `t2_azolik` / `t2_foydalanuvchi` ga sintetik qator yozadi. Faqat stub ustida sinalgan — real schema'da NOT NULL va CHECK larni BEGIN..ROLLBACK da tekshiring.
  - **UI qoralamasi** `claude/logistika-v1-ui` tarmog'ida (PR yo'q, TEKSHIRILMAGAN): rebase'dan keyin to'liq darvozalar kerak.
  - **Qilinmagan:**
    - ombor / xarid → reys bog'lash;
    - yetkazish isboti (R2);
    - pullik routing adapteri (hozir OSRM demo; `VITE_ROUTING_URL`);
    - haydovchi tanlagich;
    - `haydovchi` roliga `machinery.read`;
    - yoqilg'i xaridi daftari.
  - **Egasiga savollar:**
    - ijtimoiy soliq 12% to'g'rimi;
    - oylik ÷ 26 to'g'rimi;
    - yoqilg'i narxi QQSsiz kiritiladimi;
    - ijaradagi mashina ham ob'ektlarga taqsimlanadimi;
    - МАШ kategoriyasimi.
- **Asfalt pirogi m² kalkulyatsiyasi** — sub-agent faqat o'qish bilan Excel tayyorlamoqda. Natija L0 / egasiga beriladi, cloud davom ettirmaydi.
- **Ijro hujjatlari / laboratoriya** va **HR-KPI + buxgalteriya** — sub-agentlar faqat loyihalash hujjatlarini yozmoqda (kod yo'q). Tayyor bo'lgach lokal agentlarga kirish material sifatida topshiriladi (`docs/` yoki INBOX orqali).

## Boshqa ochiq PR'lar
- ann-corporation/Smeta-tizimi#234 — rahbar paneli tahlil (L0 merge kutmoqda).
- ann-corporation/anvar-brain#2 — egasi g'oyalari 2026-11-03 + AGENT_LOG.
- Issue ann-corporation/Smeta-tizimi#238 — egasi g'oyalari ro'yxati.
