# «smeta» MCP — PTO qamrovi auditi (v1, 2026-11-09)

Maqsad: AI operator MCP orqali PTO web ilovada qiladigan hamma ishni qila olishi. Bu hujjat — web ilovaning server
amallari va prod `t2_*` RPC'lari ↔ MCP toollari xaritasi, bo'shliqlar va shu PR'da yopilganlari.

## Manbalar

- Web ilova yozish amallari: `frontend/src/lib/sayt-xaritasi/generated.ts → writeActions` (`/api/sb-yoz` amal → RPC):
  **216** noyob RPC (barcha domenlar, jumladan HR/sotuv/tender/logistika/buxgalteriya).
- Web ilova o'qishi: `frontend/functions/api/sb.ts` (OQISH jadvallari/view'lar), `hujjat-nazorat.ts` (nakopitelniy, forma3,
  smeta o'zgarish, workbench), `normativ-qidir.ts`, `object-financials.ts`, `obyekt-paket.ts`, `f2-moslash.ts`.
- Prod: `pg_proc` dagi `public.t2_*` (`_pre_` nusxalarisiz) — **758** funksiya (≈40% trigger/ichki yordamchi).
- Audit faqat PTO domenlarini baholaydi (quyidagi 12 guruh). HR, sotuv, tender, yuk birjasi, transport, buxgalteriya,
  agentlar, telegram, token, desktop — PTO ishi emas, ular `rpc` orqali erishiladi va hisobga kirmaydi.

## Belgilar

| belgi | ma'nosi |
|---|---|
| ✅ | maxsus MCP tool bor (tekshiruv, dry_run, snapshot, audit, aktor) |
| 🟡 | faqat umumiy `rpc` / `sql_oqish` / `sql_yozish` orqali yoki tool vazifaning bir qismini qiladi |
| ❌ | MCP orqali amalda qilib bo'lmaydi (fayl yaratish/yuklash, brauzer eksporti) |

«Oldin» — shu PR'gacha (31 tool), «Keyin» — shu PR bilan (42 tool). **Og'riq** — 2026-11 kunlari Claude xom `sql_yozish`/DO blok
ishlatishga majbur bo'lgan joylar.

## 1. Smeta va versiyalar

| amal (web ilova) | RPC / manba | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Smeta daraxti / qator / qidiruv | t2_qator, t2_qator_holat, t2_daraxt | ✅ | ✅ | qator, qator_qidir, obyekt_holat, obyektlar |
| Qator qo'shish / tahrir / o'chirish (to'g'ridan) | t2_qator_qosh, t2_qator_tahrir | 🟡 | 🟡 | qator_qosh, qator_tahrir, qator_ochir (jadvalga to'g'ridan, RPC emas) |
| Bo'lim yaratish | t2_smeta_bolim_yarat_v1 | 🟡 | 🟡 | rpc |
| Smeta import (Excel bo'laklari) | t2_smeta_import_boshla/bolak/yakunla/bekor/bulk_v1, t2_smeta_paket_import_* | ❌ | ❌ | — (fayl tahlili brauzerda) |
| Versiya yaratish / faollashtirish / bekor / qaror | t2_smeta_versiya_yarat/faollashtir/bekor/qaror_v1 | 🟡 | 🟡 | rpc |
| Versiya moslik / pozitsiya | t2_smeta_versiya_moslik_yoz_v1, t2_smeta_versiya_pozitsiya_yoz_v1 | 🟡 | 🟡 | rpc |
| Smeta o'zgarish (yarat/tasdiq/qaytar/ro'yxat) | t2_smeta_ozgarish_*_v1/v2 | 🟡 | 🟡 | rpc |
| RES narxlash | t2_smeta_narxla_res_v3 | 🟡 | 🟡 | narx_tuzat (to'g'ridan formula), rpc |
| Snapshot / qaytarish | snapshot.* | ✅ | ✅ | snapshot_ol/royxat/farq/qaytar |
| Obyekt yaratish / yangilash / yakunlash | t2_obyekt_yarat_v1, t2_obyekt_yangila, t2_obyekt_yakunlash_v1 | 🟡 | 🟡 | rpc |

## 2. Fakt (jurnal, qamrov, bajarilmadi, egizak)

| amal | RPC / manba | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Fakt yozish (delta) | t2_fakt_yoz_v2 | ✅ | ✅ | fakt_yoz |
| Qamrov % | t2_fakt_yoz_v2 (+ lib/fakt-qamrov) | ✅ | ✅ | fakt_qamrov |
| Fakt jurnali (tarix, sof fakt) | t2_akt_qator × t2_akt (tur=fakt) | 🟡 | ✅ | **fakt_jurnal** (oldin — faqat `qator` bitta qator uchun) |
| Fakt hujjatini bekor qilish | t2_akt_bekor | 🟡 | ✅ | **akt_bekor** — og'riq |
| «Bajarilmadi» belgila / bekor | t2_bajarilmadi_belgila_v1 / _bekor_v1 | ✅ | ✅ | bajarilmadi |
| «Bajarilmadi» ro'yxati | t2_bajarilmadi_royxat_v1 | 🟡 | 🟡 | rpc / sql_oqish |
| Fakt belgilash (eski) | t2_fakt_belgila_v2 | 🟡 | 🟡 | rpc |
| Smetadan tashqari fakt | t2_fakt_smetadan_tashqari_v1 | 🟡 | 🟡 | qoshimcha_ish (yangi yo'l), rpc |
| Egizak obyekt ma'lumoti (F2 moslash) | lib/f2-moslash-v3/egizak | 🟡 | 🟡 | f2_import ichida qisman |

## 3. Zamena / qo'shimcha ish

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Qo'shimcha ish + resurslar | t2_ish_abc_saqla_v1 (additional) | ✅ | ✅ | qoshimcha_ish |
| Zamena: ish o'rniga ish + resurslar | t2_ish_abc_saqla_v1 (replacement) | 🟡 | ✅ | **zamena_qosh** rejim ish — og'riq |
| Zamena: resurs o'rniga resurs | t2_ish_abc_saqla_v1 (resurs_zamena) | 🟡 | ✅ | **zamena_qosh** rejim resurs |
| Zamena qoplash hajmi (birlik farqli) | t2_zamena_almashtirish_belgila_v1 | 🟡 | ✅ | zamena_qosh `almashtirish_hajm` |
| Qo'shilgan ish/zamenani o'chirish | t2_ish_abc_ochir_v2 / _v1 | 🟡 | ✅ | **ish_ochir** (QATOR_TARIXDA: sof nol fakt xavfsiz tozalanadi) — og'riq |
| Qo'shilgan ishni tahrirlash | t2_ish_abc_tahrir_v2 | 🟡 | 🟡 | rpc |
| Resurs o'rniga ish(lar) | t2_resurs_ish_zamena_v1 | 🟡 | 🟡 | rpc |
| Zamena ish (eski yo'l) | t2_zamena_ish_yarat_v1, t2_qoshimcha_ish_yarat_v1 | 🟡 | 🟡 | rpc |
| Resurs yaratish/yangilash/bekor/bola | t2_resurs_yarat_v2/yangila_v2/bekor_v2, t2_resurs_bola_qosh_v1, t2_resurs_kategoriya_belgila_v1 | 🟡 | 🟡 | rpc |

## 4. F2 (yaratish, tahrir, lifecycle, storno, import, reestr, raqam)

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| F2 qoralama fakt qoldig'idan | t2_akt_yarat_v2 | ✅ | ✅ | f2_qoralama_yarat |
| F2 aniq certified_* qatorlar bilan | t2_akt_yarat_v2 | 🟡 | ✅ | **f2_yarat** (bl/narx 0 → price_intentionally_absent; raqam bandligi oldindan) — og'riq |
| Qoralama qatorlarini tahrirlash | t2_f2_qoralama_yangila_v1 | ✅ | ✅ | f2_qoralama_tahrir |
| Qoralamani ommaviy yangilash (fakt + narx max) | t2_f2_qoralama_yangila_v1 | 🟡 | ✅ | **f2_qoralama_yangila** — og'riq |
| Lifecycle (submit/check/approve/reject/cancel) | t2_akt_lifecycle_transition_v1 | ✅ | ✅ | f2_holat, akt_bekor (cancel) |
| Lifecycle tarixi | t2_akt_lifecycle_history_v1 | 🟡 | 🟡 | rpc |
| Tuzatish / storno | t2_akt_correction_create_v1 | 🟡 | 🟡 | rpc |
| Excel F2 import (lokal fayl) | t2_akt_yarat_v2 (+ f2-moslash-v3) | ✅ | ✅ | f2_import |
| Import job / draft (server navbati) | t2_f2_import_job_*_v1, t2_f2_import_draft_saqla_v1 | 🟡 | 🟡 | rpc |
| F2 reestr | t2_f2_reestr_yoz_v1 | 🟡 | 🟡 | rpc |
| F2 podval | t2_akt_podval_yoz_v1 | 🟡 | 🟡 | rpc |
| F2 o'qish / ro'yxat | t2_akt, t2_akt_qator, t2_f2_exact_qatorlar_v1 | ✅ | ✅ | f2, f2_royxat |
| Pul yoyilmasi | (yadro) | ✅ | ✅ | yoyilma |

## 5. F3 / Форма 3

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| F3 ro'yxati | t2_forma3_royxat_v1 | 🟡 | ✅ | **forma3** amal royxat |
| F3 yaratish | t2_forma3_yarat_v1 | 🟡 | ✅ | **forma3** amal yarat |
| F3 ↔ F2 bog'lash / qoida | t2_forma3_f2_bog_v1, t2_forma3_qoida_belgila_v1 | 🟡 | 🟡 | rpc |
| F3 xlsx | lib/forma3-export.ts | ❌ | ❌ | — |

## 6. Nakopitelniy, vedomost, eksport

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Nakopitelniy vedomost (qatorlar, davrlar, jami) | t2_nakopitelniy_v2 | 🟡 | ✅ | **nakopitelniy** (bo'lim kesimi, barcha sahifalar) — og'riq; oldin faqat `obyekt_holat` jami |
| Shartnoma svodi | t2_shartnoma_svod_v1 | 🟡 | 🟡 | yoyilma (shartnoma_id), rpc |
| Obyekt moliya / workbench | t2_object_financials_v1, t2_workbench_exact_v1 | 🟡 | 🟡 | rpc |
| Hujjat paketi | t2_obyekt_paket_v1 | 🟡 | 🟡 | rpc |
| XLSX eksportlar (F2 hujjat, nakopitelniy, slichitelniy, paket) | brauzer (exceljs) | ❌ | ❌ | — |

## 7. Pereraschet

| amal | manba | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Pereraschet hisobi | lib/pereraschet-yagona.ts | ✅ | ✅ | pereraschet |
| Storno yozish | t2_akt_correction_create_v1 | 🟡 | 🟡 | rpc |

## 8. Shartnoma va DS

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Shartnoma saqlash / o'chirish / obyekt bog'i | t2_shartnoma_saqla_v2, t2_shartnoma_ochir, t2_shartnoma_bog_saqla | 🟡 | 🟡 | rpc |
| Hujjat bog'lash/ajratish, qamrov, oylik paket | t2_shartnoma_hujjat_bogla/ajrat_v1, t2_shartnoma_qamrov_saqla_v1, t2_shartnoma_oylik_paket_saqla_v1, t2_contract_scope_set_v1 | 🟡 | 🟡 | rpc |
| Shartnoma pozitsiyalari ↔ smeta qatorlari | (yangi, faqat o'qish) | ❌ | ✅ | **shartnoma_moslash** |

## 9. Narx (manba, max qoidasi, podval)

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Narxni tuzatish / nusxalash | t2_qator (formula) | ✅ | ✅ | narx_tuzat |
| F2 da narx = max(smeta, xarid) | — | 🟡 | ✅ | f2_qoralama_yangila `narxlar` + `narx_qoida` |
| Podval foizlari | t2_nakrutka_podval_saqla_v1 | ✅ | ✅ | podval_tahrir |
| Narx manbasi / protokol / dalil / price basis | t2_narx_manba_yoz_v1, t2_narx_protokol_*, t2_narx_dalil_*, t2_price_basis_yarat_v1 | 🟡 | 🟡 | rpc |
| Nakrutka koef | t2_nakrutka_koef_saqla_v1 | 🟡 | 🟡 | rpc |

## 10. Normativ / ShNK / katalog qidiruvi

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| ShNK hujjat qidiruvi | t2_normativ_qidir_v1 | 🟡 | ✅ | **normativ_qidir** tur normativ |
| Resurs variantlari (narx bilan) | t2_resurs_qidir_v1 | 🟡 | ✅ | normativ_qidir tur resurs |
| Ish turi variantlari (tarkib, norma) | t2_ish_turi_qidir_v1 | 🟡 | ✅ | normativ_qidir tur ish |
| Katalog (bozor) qidiruvi | t2_katalog_qidir_v1 | 🟡 | 🟡 | rpc |

## 11. Ostatka / zamena qozoni

| amal | manba | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Qator / bo'lim qoldig'i (almashtirilgan, zamena reja) | t2_qator_holat (almashtirilgan_hajm/summa, asl_smeta_hajm, versiya_holat) | 🟡 | ✅ | **ostatka** — og'riq; oldin `obyekt_holat` (bo'lim), `qator` (bitta) |

## 12. Hujjatlar reestri, foydalanuvchilar/rollar, migratsiya

| amal | RPC | oldin | keyin | MCP tool |
|---|---|---|---|---|
| Hujjatlar reestri | t2_document_registry_v1, t2_obyekt_hujjat_yoz/ochir, t2_document_canonical_* | 🟡 | 🟡 | rpc (fayl R2 ga yuklash — ❌) |
| Foydalanuvchilar ro'yxati / aktor | t2_foydalanuvchi | ✅ | ✅ | aktor, aktor_tanla |
| A'zolik / rol / ruxsat | t2_azolik_qosh/rol_ozgartir/ochir_v1, t2_azolik_ruxsat_* | 🟡 | 🟡 | rpc |
| Migratsiya qo'llash | supabase/migrations | 🟡 | 🟡 | sql_yozish (DDL) — og'riq; maxsus tool yo'q (ataylab: prod sxema — egasi jarayoni) |

## Hisob

PTO domenlaridagi **69** amal (yuqoridagi jadval qatorlari):

| | to'liq (✅) | qisman (🟡) | yo'q (❌) |
|---|---|---|---|
| oldin | 16 (23%) | 49 | 4 |
| keyin | 33 (48%) | 33 | 3 |

Shu PR yopgan og'riqlar: replacement/resurs zamena (resurslar bilan), QATOR_TARIXDA bilan bloklangan o'chirish, ommaviy F2
qoralama yangilash, certified_* F2 yaratish (price_intentionally_absent avtomatik), F2/fakt bekor qilish, nakopitelniy o'qish,
bo'lim bo'yicha ostatka. Qolgan og'riq: migratsiya qo'llash (ataylab tool qilinmadi).

## Shu PR'dagi yangi toollar

| tool | turi | RPC |
|---|---|---|
| zamena_qosh | yozadi | t2_ish_abc_saqla_v1 (replacement / resurs_zamena), t2_zamena_almashtirish_belgila_v1 |
| ish_ochir | yozadi | t2_ish_abc_ochir_v2 (tarixsiz) / t2_ish_abc_ochir_v1 (sof nol fakt — arxiv bilan) |
| f2_qoralama_yangila | yozadi | t2_f2_qoralama_yangila_v1 |
| f2_yarat | yozadi | t2_akt_yarat_v2 |
| akt_bekor | yozadi | t2_akt_bekor (fakt), t2_akt_lifecycle_transition_v1 (F2 cancelled) |
| forma3 | o'qish/yozadi | t2_forma3_royxat_v1, t2_forma3_yarat_v1 |
| nakopitelniy | o'qish | t2_nakopitelniy_v2 |
| ostatka | o'qish | t2_qator_holat |
| shartnoma_moslash | o'qish | t2_qator |
| fakt_jurnal | o'qish | t2_akt_qator × t2_akt |
| normativ_qidir | o'qish | t2_normativ_qidir_v1, t2_resurs_qidir_v1, t2_ish_turi_qidir_v1 |

Barcha yozuvchi yangi toollar: `dry_run` standart **true** (server RPC tekshiruvlari bilan ROLLBACK), `dry_run:false` da
avtomatik snapshot (`snapshot.ol`) → amal → bazadagi audit → COMMIT; aktor — SMETA_AKTOR_ID / `aktor_tanla`; idempotentlik — `operation_id`.

## Keyingi navbat (tavsiya, qiymat bo'yicha)

1. `f2_tuzatish` — t2_akt_correction_create_v1 (storno / tuzatish hujjati) + lifecycle tarixi.
2. `ish_tahrir` — t2_ish_abc_tahrir_v2 va t2_resurs_ish_zamena_v1 (resurs o'rniga ish).
3. `smeta_versiya` — versiya yaratish/faollashtirish/qaror va smeta o'zgarish (yarat/tasdiq/qaytar).
4. `shartnoma` — saqlash, obyekt bog'i, hujjat bog'lash, oylik paket; `f2_reestr` — t2_f2_reestr_yoz_v1.
5. `narx_manba` — manba/protokol/dalil yozish (narx_tuzat bilan birga isbotli narx).
6. XLSX eksportlar — MCP'da exceljs bilan hujjat yaratish (hozir brauzerda).
