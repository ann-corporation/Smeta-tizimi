# Cloud sessiya holati (Claude@cloud → L0) — YAKUNIY

Sessiya: https://claude.ai/code/session_01RZTNHRQ7RnNsEZxefQtyva · yakunlandi: 2026-11-04.

## Qaror (egasi 05.11, L0 orqali)
Cloud sessiya **to'xtadi** va yangi ish olmaydi. Qolgan barcha ish lokal L0 sessiyasi va Codex'da. Cloud'da ochiq ish, ishlayotgan sub-agent yoki migratsiya qolmadi.

## Bajarildi (hammasi main'da — PR ann-corporation/Smeta-tizimi#243 orqali; migratsiyalar prodda)

| Vazifa | PR | Migratsiya |
|---|---|---|
| Rahbar paneli — tahlil (resurs, subpudrat, obyekt paneli, XLSX) | #234 | — |
| Logistika L1 — park, reys, tannarx, taqsim, narxlash | #235 | `20261123000000_t2_transport_v1` |
| Uy sotish S1 (server) + S2 (sotuvchi UI `/admin/sotuv`) | #236 | `20261124000000_t2_uy_sotuv_v1` |
| Tender — mavjud `t2_birja_*` ustida protsess + UI `/admin/tender` | #239 | `20261122000200_t2_tender_protsess_v1` (L0 qayta raqamladi) |
| Loyihalash hujjatlari (ijro hujjatlari/lab; HR-KPI/buxgalteriya) | #241 | — (`docs/architecture/cloud-rejalar/`) |
| Asfalt pirogi m² Excel | — (egasiga fayl) | — (faqat o'qish) |
| Egasi g'oyalari ro'yxati | issue #238, ann-corporation/anvar-brain#2 | — |

## Boshlanmagan (egasi: «keyinroq» — lokal quriladi)
- **Uy sotish S3 (xaridor tomoni):**
  - ochiq katalog — PII siz alohida endpoint va migratsiya kerak;
  - xonadon sahifasi, ipoteka kalkulyatori (`lib/sotuv/hisob.ts` tayyor), shaxsiy kabinet;
  - shartnoma shablonlari; Telegram/SMS eslatma; Payme/Click.
- **3D / virtual sayohat** — faqat dastlabki tavsiya bor: Twinmotion/Lumion fasl renderlari + 360° panorama (R2) → three.js interaktiv bino → dron/Gaussian Splatting.
- **Logistika L2 UI** — `claude/logistika-v1-ui` tarmog'ida tekshirilmagan qoralama. Rebase'dan keyin to'liq darvozalar kerak; PR yo'q.
- **Uy sotish, kichik:** birliklarni Excel/CSV dan import qilish; kanban drag-drop.

## Ochiq savollar (egasiga)
1. **Uy sotish:**
   - `sotuvchi` roli `project.read` orqali hujjat menyularini ham ko'radi — shunday qolsinmi?
   - Foizli (annuitet) bo'lib to'lash kerakmi? Server hozir grafik Σ = shartnoma summasi talab qiladi.
2. **Tender:**
   - yuboruvchi = tasdiqlovchi mumkinmi, yoki ikki kishi qoidasi kerakmi?
   - ro'yxatdan o'tmagan yetkazuvchiga havola-portal kerakmi?
   - eski `t2_tender_elon_v1` yopilsinmi?
   - reytingsiz yetkazuvchiga 50 ball berish to'g'rimi?
   - davlat xaridi qoidalari majburiymi?
3. **Logistika:**
   - haydovchi ijtimoiy solig'i 12% va oylik ÷ 26 to'g'rimi?
   - yoqilg'i narxi QQSsiz kiritiladimi?
   - ijaradagi mashina ham obyektlarga taqsimlanadimi?
   - kategoriya МАШ bo'lsinmi?
   - `haydovchi` roliga `machinery.read` berilsinmi?
4. **Ijro hujjatlari:**
   - E-IMZO majburiymi?
   - `t2_aosr_yoz_v2` yozuvchining o'ziga «tasdiqlangan» qo'yishiga ruxsat bermoqda — bu cheklansinmi?
   - prodda `t2_tomon_resurs` dagi `aosr`/`remark`/`foto`/`grafik`/`fakt` resurslari `faol=false` — yoqilsinmi?
5. **HR / buxgalteriya:**
   - tushum F2 ning ustamali summasidan olinadimi yoki ustamasizidan?
   - prorab bonusining foizi qancha, F2 bekor bo'lsa bonus qaytariladimi?
   - jarimani oylikdan ushlash tartibi qanday?
6. **Tokenlar:** eksport testida sarflangan 130 test tokeni — egasining qarori; cloud tegmadi.
7. **Asfalt:**
   - ko'lda alohida asfalt yo'l yo'q;
   - yo'ldagi 8 sm «asos» qatlami aslida asfaltbeton — ayirilsinmi?

## Eslatmalar L0 uchun
- `t2_kompaniya.test.cjs` dagi `KUTILGAN` ro'yxati har yangi yozish RPC bilan yangilanishi shart. Main bir necha marta shu sabab qizil bo'lgan.
- Pul yaxlitlash faqat `lib/hisob-yadro` dan olinadi — qo'riqchi test lokal `Math.round(x*100)/100` ni rad etadi.
- `write-command-policy.test.ts` dagi `KATALOG` — har yangi capability shu ro'yxatga qo'shiladi.
