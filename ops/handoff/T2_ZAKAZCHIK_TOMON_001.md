# T2-ZAKAZCHIK-TOMON-001 — tomonlar aloqasi va zakazchik tomoni

Holat (2026-10-05): **DB + shlyuz: SOURCE_READY, prod bazada qo'llangan, rollback-sinovdan o'tgan.** Frontend kabinet: jarayonda.
Egasi so'zi: «zakazchik tarafini qurish… maksimal ideal… pudratchilari bilan ideal ulanishi… kelajakda ko'plab qo'shimcha bog'lanishlar uchun ochiq».

## Qonunlar (buzilmaydi)
1. **Deny-by-default.** Tomon ikkinchi tomon aniq GRANT qilgan narsanigina ko'radi. Faqat `t2_tomon_ruxsat_bor(oluvchi, beruvchi, resurs, amal, obyekt_id)` orqali (faol aloqa + faol grant + beruvchi obyekti + doira).
2. **Handshake.** Aloqa: `taklif → qabul/rad → faol → to'xtatilgan → yopilgan` (yoki `bekor`). Bir tomonlama «ulab qo'yish» yo'q. Tizimda yo'q tomon — bir martalik taklif kodi (bazada faqat SHA-256 xeshi, 7 kun, brute-force limiti).
3. **Zakazchik pudratchi originalini tahrirlamaydi.** U faqat: ko'radi, izoh yozadi, `qabul / rad / tuzatish` qarori chiqaradi (rad/tuzatish — izoh majburiy). Qaror o'zgarmaydi; tuzatishdan keyin pudratchi qayta yuboradi (`oldingi_taqdim_id` zanjiri).
4. **O'zgaruvchan — Supabase, o'zgarmas — R2 (egasi qoidasi 2026-10-05).** Aloqa/grant/taqdim *holati* o'zgaruvchan → Supabase. F2 qatorlari **nusxalanmaydi**: tasdiqlangan akt o'zgarmas, `t2_akt_qator` dan o'qiladi, `snapshot_xesh` (md5) butunlikni isbotlaydi. Hujjat nusxalari (F3, nakopitelniy, АОСР PDF…) — R2 reyestridan (`t2_document_registry`, resurs `hujjat`). Supabase'ga katta blob yozilmaydi.
5. **Izolyatsiya.** `/api/sb` va `/api/sb-yoz` (bir-kompaniyali) ga TEGILMAGAN. Kompaniyalararo ko'rinish faqat `functions/api/tomon.ts` orqali, faqat sanab o'tilgan RPC lar; actor sessiyadan; a'zolik/rol bazada (`_t2_tomon_azo`).
6. **Hodisalar jurnali o'zgarmas** (`t2_tomon_hodisa` — UPDATE/DELETE trigger bilan bloklangan).

## Jadvallar (prod)
`t2_tomon_resurs` (katalog) · `t2_tomon_aloqa` · `t2_tomon_grant` · `t2_tomon_taqdim` · `t2_tomon_hodisa`. Hammasi RLS yoqilgan, anon/authenticated yo'q; RPC faqat `service_role`.
Rol → amal xaritasi: `_t2_tomon_rol_ok` (boshqarish: admin/boss/rahbar/director; taqdim: +pto; qaror: +buyurtmachi; kuzatuvchi faqat ko'radi). Yangi rol = shu funksiyada bitta qator.

## Boshqa agentlar uchun: kengaytirish nuqtalari
- **Yangi ko'rinadigan resurs** (masalan АОSR, grafik, to'lov holati): `insert into t2_tomon_resurs(kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol…)`. Hozir `aosr, remark, grafik, tolov_holati, foto, fakt` — `faol=false` (keyingi bosqich); yoqish = `faol=true` + o'qish RPC si `t2_tomon_ruxsat_bor` ni chaqirishi.
- **Yangi taqdim turi:** `t2_tomon_taqdim_yarat_v1` ichida `p_resurs` bo'yicha bitta tarmoq (hozir `f2`, `hujjat`). Hujjat egaligi `kompaniya_id` bilan tekshiriladi.
- **Yangi aloqa turi** (texnadzor, laboratoriya, subpudratchi, ta'minotchi, bank…): `turi` va rollar erkin matn — schema o'zgarmaydi.
- **O'qish RPC si yozayotgan agent:** boshqa kompaniya ma'lumotini ko'rsatadigan har funksiya `t2_tomon_ruxsat_bor` dan o'tishi SHART. Jadvalni to'g'ridan `/api/sb` ga ochmang.

## API (`/api/tomon`)
GET `?bolim=aloqalar|aloqa|taqdimlar|taqdim|obyektlar|qidir&kompaniya_id=…` · POST `{amal: taklif|javob|kod_qabul|holat|grant_saqla|grant_bekor|taqdim_yarat|qaror|taqdim_qaytar|izoh, kompaniya_id, …}`. `taklif` javobida ochiq kod BIR MARTA qaytadi.

## Tekshiruv dalili
`supabase/tests/t2_tomon_aloqa_contract.sql` (rollback bilan) — 53/53: begona kompaniya hech narsa ko'rmaydi, kuzatuvchi qaror chiqara olmaydi, grantsiz ko'rinish yo'q, begona doiraga grant yo'q, qoralama F2 yuborilmaydi, takror taqdim yo'q, jurnal o'zgarmas, kod bir martalik, yopilganda grantlar bekor, anon RPC chaqira olmaydi. + shartnoma-doira grant (3/3). `functions/api/tomon.test.ts` — 11 test.

## Bugungi baza ishlari (boshqa agentlar bilishi shart)
- `t2_narx_manba_qator.izoh` (214 407 qator, kesilgan duplikat JSON) NULL qilindi; manba kodi tuzatildi (`catalog-manba-import/parse.ts`). Eski 2025 manbalar (id 2, 3) o'chirildi.
- TIZIM_01 eski jadvallari (`narxlar, tarix, prixod, rashod, topilmaganlar, material_kerak` + `sklad_ostatka` view) o'chirildi; zaxira: `D:\Obsidian\Anvar_Brain\20_PROJECTS\Smeta-tizimi\backups\tizim01_legacy_2026-10-05\`.
- `VACUUM FULL t2_narx_manba_qator` **diskda joy yo'qligi** sabab bajarilmadi (Free reja). `T2-NARX-KATALOG-R2-001` 3-bosqichi (platforma qatorlarini DB dan o'chirish + VACUUM FULL) shu sababli ham kerak; undan oldin DB ~715 MB.
- `t2_signal` va `akt` (akt_ish FK) tegilmagan.

## Umumiy fayllarga tegish (additiv, kelishilgan)
`AdminShell.tsx` (yangi «Tomonlar» menyu guruhi), `App.tsx` (marshrutlar), `i18n/lugat/ru.json|en.json` (yangi kalitlar, mavjudlari o'zgarmaydi), `sayt-xaritasi/generated.ts` (regeneratsiya). Mojarodan qochish: har birini kichik commit bilan, `git fetch && merge` dan keyin.

## Murojaat primitivi (2026-10-06) — hamma tomonlar uchun bitta mexanizm
`t2_tomon_murojaat` (+ `_turi` katalogi, `_hujjat` dalil bog'lari). Oqim: **ochiq → bajarildi (ijrochi + dalil) → yopildi | qayta_ochildi (raund+1)**, yoki bekor (faqat ochiq). Asl murojaat va jurnal o'zgarmaydi.
- Turlar katalogda (yangi tur = bitta qator): remark, predpisaniya, ekspertiza_izoh, mualliflik_remark, savol (RFI), sinov_sorovi, yetkazish_talabi, boshqa. Shu bilan: zakazchik remarki, texnadzor/davlat nazorati predpisaniyasi, ekspertiza, loyihachi, laboratoriya (so'rov → protokol dalil), logistika/yetkazib beruvchi — alohida jadvalsiz.
- Qoida: faqat FAOL aloqaning ikki tomoni; qarshi tomon obyektiga — faqat `obyekt_holat` ko'rish grant bo'lsa; dalil faqat biriktiruvchining o'z (R2'da saqlangan) hujjati; qarshi tomon dalilni `t2_tomon_hujjat_ol_v1` orqali (faol aloqa) yuklab oladi.
- Sinov: `supabase/tests/t2_tomon_murojaat_contract.sql` 32/32; gateway 15 test; UI 4 test.
- **Ochiq:** `t2_document_registry.loyiha_id` NOT NULL — loyihasiz kompaniya (laboratoriya, ekspert, zakazchik) dalil yuklay olmaydi; UI shuni tushunarli xabar bilan bildiradi. Qaror: avtomatik «Umumiy» loyiha yoki ustunni bo'shatish (KOORDINATSIYA → Ochiq qaror).

## Keyingi bosqichlar
1. Frontend: Aloqalar, Taqdimlar (inbox + qaror), Zakazchik kabineti (obyektlar monitoringi), F2 tarixidan «Zakazchikka yuborish».
2. `hujjat` taqdimi uchun yuklab olish ruxsati (`/api/hujjat-ol` — taqdim asosida qabul qiluvchiga).
3. Zakazchik qabuli → F2 hayot sikli/to'lov bilan bog'lash (alohida egasi qarori).
4. ERI/Didox imzosi (ROLE_TRUST_MODEL B4), tashkilot shaxsiyatini tasdiqlash.
