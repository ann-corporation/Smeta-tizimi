# Cloud sessiya holati (Claude@cloud → L0)

Sessiya: https://claude.ai/code/session_01RZTNHRQ7RnNsEZxefQtyva · yangilandi: 2026-11-03.
L0 shu faylni o'qib, egasining koordinatsiya yozuvlariga ko'chiradi.

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

### 2. Tender — `claude/tender-v1` (sub-agent; PR hali ochilmagan)
- Mavjud `t2_birja_rfq / _qator / t2_birja_taklif / t2_buyurtma` va `t2_tender_*_v1` RPC'lari **kengaytiriladi** — parallel model yo'q (tekshirildi).
- Migratsiya `20261122000000_t2_tender_protsess_v1`: yangi jadvallar faqat `t2_tender_jurnal`, `t2_tender_savol`, `t2_tender_baho`.
- Oqim: tasdiq, muhrlangan takliflar, baholash, g'olib, audit.
- Fayllar R2 da (faqat havola); jurnal payload ≤1 KB.

### 3. 3D / virtual sayohat — navbatda (uy sotish S2 dan keyin)
- Faqat tadqiqot + reja.
- Dastlabki tavsiya: Twinmotion / Lumion fasl renderlari + 360° panorama (R2) → three.js interaktiv bino (shaxmatkaga bog'langan) → dron / Gaussian Splatting. Pixel Streaming — faqat premium.

## L0 yo'liga o'tkaziladi (cloud boshlagan edi — egasi to'g'ridan-to'g'ri so'ragan edi)
- **Logistika** — `claude/logistika-v1`, PR ann-corporation/Smeta-tizimi#235.
  - Sub-agent qurdi, migratsiya `20261123…`.
  - CI qizil: 2 test — `write-command-policy.test.ts` KATALOG ga `logistics.*`; `hisob-yadro` qo'riqchisi — lokal `r2` yaxlitlash. Sub-agent tuzatmoqda.
  - Shundan keyin PR L0 ga topshiriladi; cloud yangi logistika ishini boshlamaydi.
- **Asfalt pirogi m² kalkulyatsiyasi** — sub-agent faqat o'qish bilan Excel tayyorlamoqda. Natija L0 / egasiga beriladi, cloud davom ettirmaydi.
- **Ijro hujjatlari / laboratoriya** va **HR-KPI + buxgalteriya** — sub-agentlar faqat loyihalash hujjatlarini yozmoqda (kod yo'q). Tayyor bo'lgach lokal agentlarga kirish material sifatida topshiriladi (`docs/` yoki INBOX orqali).

## Boshqa ochiq PR'lar
- ann-corporation/Smeta-tizimi#234 — rahbar paneli tahlil (L0 merge kutmoqda).
- ann-corporation/anvar-brain#2 — egasi g'oyalari 2026-11-03 + AGENT_LOG.
- Issue ann-corporation/Smeta-tizimi#238 — egasi g'oyalari ro'yxati.
