# Supabase dietasi — 2026-11 (free plan, 500 MB; prod 455 MB)

Holat: TAKLIF + bitta xavfsiz migratsiya (`20261212100000_t2_supabase_dieta_v1`, PRODGA QO'LLANMAGAN).
Qoida (egasi): o'zgarmas ma'lumotnoma — R2, o'zgaruvchan biznes ma'lumoti — Supabase. Snapshot chunklarni R2 ga sovitish
(`sovutish.ts`, `snapshot-r2-sovut.mjs`) allaqachon ishlaydi — bu yerda takrorlanmaydi. O'lchovlar 2026-11-11, faqat o'qish so'rovlari.

## 1. Joy qayerga ketyapti

| Jadval | Hajm | Izoh |
|---|---|---|
| public.t2_qator | 125 MB (heap 71, indeks 55) | 140k jonli + 20,6k o'lik qator; so'nggi autovacuum 10-29. Asl smeta — const, tegilmaydi |
| public.t2_qator_muhr | 66 MB (heap 49, idx 17) | INSERT-ONLY muhr (SMETA CONST isboti): har qator uchun tur/kod/nom/birlik/kat/ota/hajm/narx/norma nusxasi + SHA-256. O'quvchilar: view `t2_qator_muhr_farq`, `/api/sb`, `MuhrFarqXulosa.tsx`, `lib/qator-muhr/farq.ts`. Trigger o'chirish/o'zgartirishni rad etadi |
| snapshot.bolak_mazmun | 65 MB toast | issiq oxirgi snapshotlar — dizayn bo'yicha qoladi |
| public.t2_akt_qator | 58 MB (heap 44, idx 14) | 65k qator; `raw_snapshot` jsonb ≈ 27 MB (xom import nusxasi) |
| t2_onboarding_command_log | 12 MB | ASLIDA universal idempotentlik daftari (barcha native buyruqlar). 10 MB — faqat `f2_qoralama_yangila.eski_qatorlar` (128 yozuv) |
| t2_signal 11, t2_smeta_versiya_pozitsiya 9, t2_smeta_revision 9, t2_f2_import_draft_qator 9, t2_ozgarish 8,5, t2_addrepl_command 6,4 | | hammasi 30 kundan yosh (eng eskisi 2026-10-23) — yoshga qarab tozalash hozir hech narsa bo'shatmaydi |

## 2. Indekslar: kod bilan tekshirilgan qaror

| Indeks | Hajm / skan | Qaror |
|---|---|---|
| t2_qator_paket_manba_idx | 6,7 MB / 29 | **PARTIAL qilinadi** (`where smeta_paket_manba_id is not null`; 16k/140k qatorda qiymat bor). FK indeksi vazifasi saqlanadi. ≈ −5,9 MB |
| t2_qator_manba_idx | 2,2 MB / 5 | `manba_id` va `xom_qator` prodda 140k qatorda 100 % NULL → **PARTIAL** (`where manba_id is not null`). ≈ −2,2 MB |
| t2_qator_bl_nom_fts | 6,6 MB / 1 | **QOLADI**: `t2_ish_tajriba_qidir_v1` (frontend/functions/api/smeta-ai.ts:193, AI «tajriba»). Indekssiz 140k qator to_tsvector seq-scan bo'lardi |
| t2_qator_object_source_document_idx | 2,3 MB / 28 | **QOLADI**: dublikat guard (`t2_smeta_import_dublikat_guard_v1`), testi indeksni majburlaydi (`t2_smeta_import_dublikat_guard.test.cjs`) |
| t2_qator_muhr_obyekt_ix | 6 MB / 578 | QOLADI: faol muhrlar bo'yicha view; partial (yopildi is null) ≈ hamma qator, ya'ni foyda yo'q |
| t2_qator_muhr_pkey 3,9 MB, t2_signal_pkey | 0 skan | PK — tushirib bo'lmaydi (identity) |
| ix_fk_t2_akt_qator_kompaniya_id_fkey (0,9 MB), ..._reference_basis_line_id_fkey (0,9 MB) | 28 / 12 | QOLADI: `t2_baza_gigiyena_v1` ataylab qo'shgan FK indekslari; ota qator o'chirilganda t2_akt_qator (65k) seq-scan bo'lmasligi uchun. Foyda < 2 MB |

Ehtimoliy ortiqchalik (isbotlanmagan, tegilmadi): `t2_qator_obyekt_idx (obyekt_id, tartib)` 4,5 MB / 8k skan va `t2_qator_komp_idx (kompaniya_id, obyekt_id)` 2,9 MB — `t2_qator_obyekt_id_kursor_idx`, `t2_qator_tur_idx` bilan qisman qoplanadi. Tushirishdan oldin pg_stat_statements bilan har so'rov shakli tekshirilsin (≈ 4–7 MB).

## 3. Bu PR nima bo'shatadi

1. Ikki indeksni partial qilish: ≈ **8 MB** (darhol; DROP/CREATE bilan joy qaytadi).
2. `t2_dieta_log_kompakt_v1(7, false)`: 7 kundan eski `f2_qoralama_yangila` natijasidan `eski_qatorlar` olinadi (takror chaqiriq uni o'qimaydi: `v_prev - '_request' - 'eski_qatorlar'`). Diskdagi ta'sir ≈ 5–9 MB, lekin **joy faqat `VACUUM FULL public.t2_onboarding_command_log` dan keyin** qaytadi (jadval kichik, soniyalar; migratsiya ichida bajarib bo'lmaydi). Bir xil funksiya keyin 3 kunga tushirilsa ≈ 9 MB gacha.
3. Jami ≈ **13–17 MB** (455 → ≈ 440 MB). Bu kichik qadam; asosiy yutuq 4-bo'limda.

Xavf: (a) indeks DROP/CREATE `t2_qator` ga qisqa ACCESS EXCLUSIVE qulf (partial qurish 140k qator, ≈ sekundlar) — kam yuk vaqtida; (b) `eski_qatorlar` qaytarilmaydi (kodda o'quvchi yo'q, lekin agar kimdir F2 qoralama tahriridan «oldingi qiymat» sifatida foydalansa) — migratsiyadan oldin Supabase backup; muddatni oshirish mumkin.

## 4. Katta tuzilmaviy variantlar (bu PR'da YO'Q)

| Variant | Tejash | Xavf |
|---|---|---|
| **t2_qator_muhr → R2.** Muhr INSERT-ONLY, ya'ni qoidasiga ko'ra o'zgarmas ma'lumotnoma. Obyekt bo'yicha gzip JSON (bosqich 0 + hash) R2 ga; Supabase'da faqat ochiq korrektirovka muhrlari + (qator_id, bosqich, muhr) yoki obyekt darajasidagi umumiy xesh qoladi. Farq ko'rinishi R2 dan o'qiydi (sovuq snapshot yo'li bilan bir xil `sovuq.ts` naqshi) | **≈ 45–55 MB** (66 MB dan; matn ustunlari atigi 12 MB, qolgani 340 B/qator qator-overhead + 17 MB indeks) | O'rta-yuqori: const isboti saqlanishi (R2 yozuvi o'zgarmas, xesh Supabase'da), farq view va `/api/sb` o'qish yo'lini qayta yozish, atomiklik (yozish R2→so'ng DB). Alohida ADR kerak |
| **t2_akt_qator.raw_snapshot → R2** (27 MB xom import nusxasi; oxirgi o'quvchilar `raw_snapshot->>…` filtrlari bor — pg_stat_statements'da ko'rinadi) | ≈ 15–25 MB | O'rta: filtrlovchi so'rovlar (`raw_snapshot->>$2 = $3`) ustun qoldirishni talab qiladi; faqat «tasdiqlangan va yopilgan» aktlar uchun |
| **t2_qator ustunlarini toraytirish** (507 B/qator; xom/foydalanilmaydigan ustunlar — masalan manba_id, xom_qator 100 % NULL → tashlash) | ≈ 3–8 MB | Past-o'rta: ustunlar frontend tiplari (`api/supabase.ts`, desktop sxemasi) va read-model view'larida bor (`t2_obyekt_read_model_filtr_v2` xom_qator ni chiqaradi) — migratsiya + ko'p fayl |
| **Davriy VACUUM / pg_repack** (t2_qator: 20,6k o'lik ≈ 15 % heap; muhr/akt_qator ham) | ≈ 10–15 MB (VACUUM FULL, jadvalni qisqa bloklaydi) | Past, lekin ish vaqtida qulf: tunda, jadval ketma-ket |
| Resolved signal / consumed draft retention (30–60 kun) | hozir ≈ 0 (hammasi < 30 kun); o'sishni cheklaydi: signal ≈ 11 MB/30 kun | Past, lekin signal `resolved` tarixi hisobot manbai bo'lishi mumkin — avval R2 arxiv |

Reja tartibi: (1) bu PR + VACUUM FULL log; (2) muhr → R2 ADR; (3) `raw_snapshot` siyosati; (4) tunda VACUUM.

## 5. So'rov yuki (pg_stat_statements, jami vaqt bo'yicha)

- `t2_mindmap_grafi_v4` — 323 chaqiruv × 5,7 s, **338 mln blok**: eng og'ir RPC. Natijani kompaniya bo'yicha keshlash (jamoa grafi kam o'zgaradi) yoki `snapshot`ga o'xshash versiyali kesh.
- `t2_rahbar_panel_v1` — 65 × 16,3 s, 147 mln blok: panel har ochilishda hisoblanadi. 60–120 s TTL server keshi (`/api/sb-rahbar-panel`) arzon yutuq.
- `t2_nakopitelniy_v2` — 1005 × 2,4 s, 36 mln blok (`hujjat-nazorat.ts`, sahifa ≤ 5000): sahifalab qayta-qayta chaqirilyapti; mijozda `staleTime` va F3/eksportda bitta to'liq chaqiruv.
- `t2_obyekt_nakrutka_v1` — **5998 chaqiruv** × 308 ms: `useUstamaliSumma` allaqachon 60 s `staleTime` beradi, lekin obyekt/shartnoma kaliti bo'yicha har ekranda alohida chaqiruv (fan-out). Obyektlar ro'yxatida bitta paketli RPC yoki `staleTime` ni 5 daqiqaga ko'tarish.
- `t2_f2_versiya_kochirma_v1` — 185 × 7,2 s (yozuvchi; kamdan-kam, normal).
- `t2_akt_qator_qator_idx` 189 mln skan: tashqi PostgREST so'rovlari emas (jami bir necha yuz chaqiruv), balki RPC/view ichidagi qator-bo'yicha qidiruvlar (ayniqsa mindmap/rahbar panel/fakt hisoblari — correlated subquery). Ya'ni N+1 SQL ichida; yechim — shu uch funksiyada `t2_akt_qator` ni bir marta agregatlab (CTE + group by qator_id) JOIN qilish. Alohida PR, funksiya ta'riflarini o'qib.
- `select row_to_json(x) … from t2_akt_qator order by ctid limit/offset` — 9 chaqiruv × 121 s: zaxira/eksport skripti (OFFSET sahifalash O(n²)); keyset (`id > $last`) ga o'tkazish kerak.

## 6. Qo'llash tartibi (egasi qarori bilan)

1. Supabase backup. 2. Migratsiya (kam yuk vaqti). 3. `VACUUM (FULL, ANALYZE) public.t2_onboarding_command_log;`. 4. Rollback: `.rollback.sql` indekslarni tiklaydi; `eski_qatorlar` tiklanmaydi.
