# AXLAT TOZALASH — 2026-11-11 (oqim F: o'lik kod va keraksiz fayllar)

Qamrov: faqat kod/repo. Baza (jadval, funksiya) O'ZGARTIRILMADI — faqat §4 ro'yxati.
Metod: `frontend/src` import grafi (main.tsx + functions/scripts/testlar ildizlari, `import()`, `new URL()`), `git grep` havolalari, App.tsx JSX tekshiruvi, `functions/api` chaqiruvchi qidiruvi, prod'da faqat o'qish SQL (qator soni).

## 1. O'chirilgan (qat'iy dalil)
| Element | Tur | Dalil | Amal |
|---|---|---|---|
| `src/api/t2-didox, t2-erp, t2-invite, t2-kirish, t2-kuzatuv, t2-transport, t2-viborka, t2-hujjat, t2-park-document-control, smeta-narx-agent` (10) | API mijoz | hech kim import qilmaydi; eksport nomlari 0 chaqiruv | o'chirildi |
| `components/park-closeout/*`, `components/park-document-control/*` (9 fayl), `lib/park-closeout/index.ts` | UI + barrel | marshrutda yo'q, import yo'q (faqat o'z ichida) | o'chirildi; 2 ta `testlar/*.test.cjs` dan UI o'qishi olib tashlandi |
| `components/agent-control/index.ts`, `smeta-studio-workspace/WorkspaceOverview.tsx`, `lib/pdf/pto-pdf-shrift.ts` | barrel/komponent/lib | 0 import | o'chirildi |
| `kirish/Sahna3D.tsx`, `Sahna3DXavfsiz.tsx` | 3D fon | ishlatilmaydi (Umumiy.tsx da «qayta qo'shmang» izohi); test mock'i olib tashlandi | o'chirildi |
| `test02/TestNarxlar, TestHujjat, TestGrafik, TestSpravochnik` | sahifa | App.tsx da lazy e'lon qilingan, hech qayerda render qilinmagan | o'chirildi |
| App.tsx: 9 ta ishlatilmagan `lazy()` e'loni; `/admin/buxgalteriya` ikkinchi (o'lik) redirect; `/admin/test/sozlama` takror | marshrut | birinchi mos kelgan marshrut g'olib; qolgani yetib bormaydi | olib tashlandi |
| Repo ildizi: 49 ta bir martalik patch skript (`fix_*.js`, `rewrite_*.js`, `update_*.js`, `add_*.js`, `mock_badge*`, `mindmap_panel*`, `check.js`, `chk.js`, …), `temp.tsx`, `old_umumiy.tsx`, `tmp-*.ts(x)`, `diag_log_*.txt`, `github_ga_yuklash.bat`, 0-bayt `sahifaOl(0` | skript/axlat | hech bir paket/CI/kodda havola yo'q; `sahifaOl(0` — buzuq `>` qayta yo'naltirish izi (§5) | o'chirildi |
| `temp_clone/` (54 fayl, GAS nusxasi), `Smeta tizimi/temp_pull`, `Smeta tizimi/test.bak`, `test_boss.bak` | nusxa | 0 havola | o'chirildi |
| `frontend/`: `({` (0 bayt), `diff.txt`, `parsed.txt`, `final_fix.cjs`, `fix.js`, `fix_f2.cjs`, `patch_frontend.cjs`, `test-boss.cjs/js`, `test-gas.js`, `test-ocr.cjs`, `test_regex.js`, `test_invoice.pdf`, `tmp-func.ts`, `tmp-supabase.ts` | skript | 0 havola (`.eslintignore` yangilandi) | o'chirildi |

## 2. O'chirilmadi — qaror/boshqa oqim kerak
| `src/api/t2-korzinka.ts`, `t2-overbilling.ts`, `t2-papka.ts` | importsiz, LEKIN `tizim02/MULOQOT.md` (append-only jurnal) ularni havola qiladi va `t2_navbat.test.cjs` ichki havolalarni tekshiradi (CI yiqildi) — QAYTA TIKLANDI | jurnal tuzatilgach o'chirish |
| Element | Dalil | Taklif |
|---|---|---|
| `src/desktop/entry.ts` | grafda yetim, lekin Windows dastur (Tauri) kirish nuqtasi, `desktop-auth.test` va release skriptlari bog'liq | KEEP |
| `lib/park-closeout/*`, `lib/park-document-control/*` (+fixtures, legacy-compat) | prod'dan import yo'q, faqat testlar; Navoiy park oracle'lari | egasi qaror qiladi: o'chirish yoki ulash |
| `src/ombor/*` (hisob worker, idb), `lib/transport/*`, `lib/yuk-birjasi/*`, `lib/document-understanding/*`, `lib/catalog-ingest/*` (jami ~70 fayl) | prod grafdan yetim, faqat testlar chaqiradi — tugallanmagan modullar | egasi qarori; keyingi o'tishda moduli bilan |
| `/admin/test/*` (TestSmetaBirlashgan, TestDaraxt, TestTolov, TestFaktura, TestHisobot, TestTizim, WrapperPortfel, TestKontragent) | faqat superadmin (navReestr «Sinov qobig'i (eski)»); TestKontragent CRM «Batafsil» havolasi | oqim C bilan: faktura/to'lov → `/admin/moliya` redirect; qolganini o'chirish |
| `/admin/_demo/*` (3 demo sahifa) | superadmin-yopiq, menyuda yo'q | prod'dan olib tashlash (oqim C) |
| `/boss/eski` (Umumiy.tsx, GAS davri dashboard) | `/boss` indeksi `/admin/dashboard` ga yo'naltiradi; faqat qo'lda URL | o'chirish nomzodi |
| `/admin/f2-eski`, `/admin/shaxsiy-smeta` va boshqa eski Navigate'lar | foydalanuvchi xatcho'plari uchun | KEEP (redirect arzon) |
| `functions/api/*` (68 endpoint) | chaqiruvchisiz: `didox-webhook`, `telegram/*` (tashqi webhook), `desktop/*` (dastur), `hujjat-r2` (replika worker, maxfiy), `kontekst-diag` (qo'lda diagnostika, testi bor) | hammasi KEEP; o'lik endpoint yo'q |
| Ildiz ma'lumot fayllari: `abc_resurs.csv/json` (43 MB) + `abc_parse_resur.js`, `Jihozlar_*.docx/xlsx` (16 MB, `export_tool` ishlatadi), `GitHub smeta tizimi.pdf`, `01_T2_LOYIHA_MIGRATSIYA.sql` | repo hajmini oshiradi, kodda yo'q | R2 ga ko'chirish (reja: o'zgarmas ma'lumotnoma R2'da) |
| `_f2lab/` (466 fayl, ochilgan haqiqiy xlsx'lar) | **repo PUBLIC** — haqiqiy smeta ma'lumoti bo'lishi mumkin; `lib/f2-import-parse` izohlarda tilga oladi | egasi ko'rib chiqsin; maxfiylik xavfi |
| `Viborka/`, `export_tool/`, `Akt generator/`, `Smeta tizimi/` (GAS) | eski Apps Script loyihalari | tarixiy; alohida qaror |
| `DATA_MODEL_REGISTRY.yaml` | o'chirilgan api fayllarga `file:line` havolalari | avtogenerator keyingi yurishda yangilaydi |

## 3. Menyu/UX axlati (AUDIT.md «AXLAT», 17 qator) — oqim C/A/D/E egalik qiladi
Bu oqimda KOD O'ZGARTIRILMADI (menyu/marshrut/matn boshqalarniki); prod ma'lumot: `t2_erp_*` 0 qator, `t2_hr_*` 0, `t2_papka` 0, `t2_viborka*` 0, `t2_tender_baho` 0, `t2_sotuv_bitim/mijoz/tolov` 0 (sotuv birliklari 96) — AUDIT «prodda ma'lumot 0» da'vosini tasdiqlaydi.
| AUDIT qatori | Holat |
|---|---|
| Texnik menyu bandlari (fayl-boglash, test, tizim-xaritasi, boshqaruv) | allaqachon `faqatSuperadmin` (navReestr); `/test` o'chirish → C |
| Moliya o'lik tablari, HR/ERP/Tender/Yuk birjasi/Sotuv bo'sh modullar | beta/yashirish → C (modul bayroqlari bor: `module.erp`) |
| Qarzdorlik + Buxgalteriya → Moliya ichiga | C; `/admin/buxgalteriya` o'lik redirect bu PR da olib tashlandi |
| Mindmap 3D/2D/Tahrir, dashboard «Avvalgi xulosa (portfel modeli)», «Eski (GAS) rejimga o'tish» (/narxlar) | A/E/C — kod boshqalarda |
| 4 sozlamalar sahifasi, ikki Ctrl+K, 3–4 AI yordamchi, changelog oynasi | C/E |
| **/kompaniya → Korzinka: «Tiklash» yonida «Butunlay o'chirish»** | funksiya OLIB TASHLANMAYDI (egasi talabi); faqat eslatma: tasodifiy bosilmasin deb tasdiq/ajratish → C |

## 4. BAZA tomoni axlat (FAQAT RO'YXAT, tegilmadi)
O'chirilgan API mijozlar chaqirgan RPC/jadvallar (frontenddan endi hech kim chaqirmaydi): `t2_overbilling_radar`, `t2_papka_daraxt` + jadval `t2_papka` (0 qator), `t2_hujjat_turi` (8 qator), `t2_viborka_holat`/`t2_viborka_qabul` + jadvallar `t2_viborka`, `t2_viborka_qabul` (0), `transport_ol_v1`, `t2_obyekt_hujjat_royxat` (boshqa chaqiruvchi bor-yo'qligini tekshirish kerak), park-document-control RPC'lari. Bo'sh prod jadvallari: `t2_erp_kadr/sifat/taminot/texnika`, `t2_hr_*` (xodim, tabel, oylik…), `t2_tender_baho`, `t2_sotuv_bitim/mijoz/tolov`. Bular tegishli modul beta bayrog'i ostida — modul qarori kelgach migratsiya bilan (alohida ruxsat).

## 5. Asosiy ish nusxasi ildizidagi 0-bayt fayllar
Ro'yxat: `C:\Users\anvar\AppData\Local\Temp\claude\64878c49480ed488\001994ce-5488-4c3d-91e4-71a835c0ceb6\scratchpad\axlat_fayllar.txt` (463 ta, hammasi untracked va 0 bayt; o'chirilmagan).
**Sabab:** hook EMAS. `.claude/settings.json` hook'lari (`hook-handler.cjs pre-bash/post-bash/pre-edit/...`) faqat tekshiradi/metrika yozadi, ildizga fayl yaratmaydi (pre-bash faqat xavfli buyruq qidiradi). Nomlar JS parchalari (`!r.takror)`, `0)a.fh++`, `!x.ikkalasida))`, `'`) — ya'ni agent yuborgan Bash/`node -e` buyrug'idagi qo'shtirnoqsiz `>` (masalan `a>0)…`, `x=>…`) shell tomonidan «qayta yo'naltirish» deb o'qilgan va `>` dan keyingi bo'lak nomli bo'sh fayl yaratilgan. Tuzatish: inline JS o'rniga skript fayl yoki to'liq qo'shtirnoq; ildizda `.gitignore` ga ko'ra tozalash: `git clean -n` bilan ko'rib, so'ng egasi o'chiradi.
