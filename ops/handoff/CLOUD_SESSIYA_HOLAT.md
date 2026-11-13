# Cloud sessiya holati (Claude@cloud → lokal agent) — 2026-11-13

Sessiya: https://claude.ai/code/session_01RZTNHRQ7RnNsEZxefQtyva
Egasi 13.11: noutbuk o'chgani uchun cloud ishni davom ettirdi; endi noutbuk yondi — **boshqaruv lokal agentga qaytadi**. Cloud yangi ish boshlamaydi; ishlab turgan sub-agentlari tugagach tarmoqlarini push qiladi (pastda).

## ⚠ BIRINCHI NAVBATDA: prod bazani tekshiring (holat NOMA'LUM)
Cloud `20261219000000_t2_pul_bilan_yopiladi_v1` (tarmoq `claude/smeta-jami-asl`) ni prodga **bitta tranzaksiyada** qo'llashga urindi: migratsiya + md5 tekshiruv + acceptance (savepoint ichida) + 7 obyektda eski/yangi `t2_nakopitelniy_v2` regressiya solishtiruvi + COMMIT. So'rov MCP'ning 60 s chegarasida uzildi, keyin Supabase MCP «Service Unavailable» berdi — **commit bo'lganmi yoki yo'qmi tekshirib bo'lmadi**. Sayt `/api/soglik` 200 (baza REST ishlayapti).

Tekshiruv (faqat o'qish):
```sql
select to_regprocedure('public.t2_pul_bilan_yopiladi_v1(text,numeric)') is not null as predikat,
       to_regprocedure('public.t2_nakopitelniy_v2_pre_20261219000000(bigint,bigint,date,integer,boolean,integer)') is not null as eski_nusxa,
       (select md5(prosrc) from pg_proc where oid = 'public.t2_nakopitelniy_v2(bigint,bigint,date,integer,boolean,integer)'::regprocedure) as md5_hozir,
       (select count(*) from public.t2_kompaniya where nom = '_TEST_PUL_') as test_qoldiq;
-- osilib qolgan tranzaksiya: select pid, state, now()-xact_start from pg_stat_activity where state like 'idle in transaction%' or query ilike '%t2_pul_bilan_yopiladi_v1%';
```
- `predikat=false` → hech narsa qo'llanmagan (tranzaksiya bekor bo'lgan). Migratsiyani o'zingiz sinab qo'llang; regressiya solishtiruvini 1–2 obyektda yoki `statement_timeout` ni hisobga olib yurgizing.
- `predikat=true` va `md5_hozir = ea235bc346791ffe509f316c246585d3` → to'liq qo'llangan (acceptance va regressiya o'tgan — aks holda commit bo'lmasdi). `test_qoldiq` 0 bo'lishi shart.
- Boshqa holat (masalan `idle in transaction`) → tranzaksiyani tugating (`pg_terminate_backend`) va qaytadan tekshiring.
- Frontend (`claude/smeta-jami-asl`) migratsiyasiz ham ishlaydi: «Asl smeta: noma'lum (server yangilanishi kutilmoqda)» ko'rsatadi.

## Bugun main'ga qo'shilgan
| PR | Nima |
|---|---|
| #383, #399 | Lokal agentning reestr zanjiri (7 ish joyi menyusi, Amal reestri) |
| #422 | Barqarorlik (sanaga bog'liq testlar, eksport tokeni serverda) |
| #423 | Jarvis: dars-qo'llanma faqat haqiqiy «qanday qilaman» savoliga (egasi skrinshoti) |
| #424 | Pudratchi menyusi: «Obyektlar», АОСР bitta nom, «Oy», «Loyihachi: bugun» pto/prorabdan yashirildi |

Prodga qo'llangan migratsiya: `20261218400000_t2_jarvis_suhbat_v1` (BEGIN..ROLLBACK da acceptance o'tdi, keyin qo'llandi).

## Ochiq PR'lar (CI yurmoqda — yashil bo'lsa birlashtiring)
- **#420** `claude/jarvis-yadro-3` — main qo'shildi + qamrov jadvaliga `imzo`, `ruxsatlar-jadvali` (head 0e45fb06). Migratsiyasi prodda.
- **#378** `claude/mindmap-vizual-pult` — main qo'shildi + `TestXarita.tsx` da 3 ta `confirm()` → `tasdiqSora` (head c2cba344). Lokal to'liq vitest yuklama ostida 2 ta beqaror test bilan yiqildi (alohida o'tadi); main + uchala tarmoq birgalikda 916 fayl / 6999 test yashil.

## Sub-agent tarmoqlari (PR hali ochilmagan)
| Tarmoq | Ish | Holat |
|---|---|---|
| `claude/smeta-jami-asl` (56e84cff) | Egasi qarori: «smeta jami» asosiy raqam = ASL smeta, joriy yonida yorliq bilan; «сум» birlikli (narx=1) qatorlar — pul bo'yicha yopiladi, hajm/narx farqidan chiqariladi. Migratsiya `20261219000000` | Push qilingan, darvozalar yashil. Migratsiya — yuqoriga qarang. Rahbar paneli/DirektorPult'da joriy qatori yo'q (kesh `smeta_joriy` bermaydi); Excel eksportlari va HolatNative yorliqlari tegilmagan |
| `claude/tezlik-obyekt-kesh` | `sbT2ObyektlarOlKomp` ning ~36 keshsiz chaqiruvi → yagona kesh; obyektlar sahifasidan `rahbar_panel_v1` fon chaqiruvini kechiktirish | Sub-agent ishlamoqda |
| `claude/pudratchi-zanjir-chizigi` | HolatNative'dagi 2 ta «Keyingi qadam» vidjeti → bitta: Smeta → Fakt → АОСР → F-2 → F-3 → To'lov; har qadam sahifasida | Sub-agent ishlamoqda |
| `claude/hujjat-paket-papka` | Egasi: F-2 paketi ZIP (papkalar, har hujjat alohida fayl); shrink-to-fit o'rniga wrap + qator balandligi; yashirin «Тип/Кат./КАЛИТ» ustunlari wrap qilinmaydi; barcha eksportlar bitta qoidaga + `docs/architecture/HUJJAT_CHIQISH_INVENTAR_2026-11.md` | Sub-agent ishlamoqda |

## Auditlar (shu PR'da, `docs/architecture/cloud-rejalar/`)
- `AUDIT_PUDRATCHI_OQIM_2026-11-13.md` — menyu/rol jadvali, takror sahifalar, uzilishlar U1–U12, o'zgarishlar C-01…C-22, birinchi 5 PR.
- `AUDIT_HISOB_HUJJAT_2026-11-13.md` — pul zanjiri (bitta yadro, mos), 3 xil «smeta jami», fakt qamrovi 7,9%, hujjat xatolari.
- `AUDIT_TEZLIK_2026-11-13.md` — `t2_obyekt_jami` 3,7 s, `t2_rahbar_panel_v1` 14 s, baza 469/500 MB.

## Egasi qarorlari (13.11)
1. Obyekt 152 dagi «сум» qatorlari — xato emas (smetasiz subpudrat ishi, pul bilan o'lchanadi). Tasdiqlangan aktlarga tegilmaydi; tizim bunday qatorni taniydi (yuqoridagi tarmoq).
2. Smeta jami bir xil obyektlar (156/157, 158/159, 163–165, 167/168) — **egizak binolar, haqiqiy alohida obyektlar**. Tegilmaydi.
3. «Smeta jami» asosiy raqam — **asl smeta**.
4. Eski F-2 lardan fakt yaratish (fakt qamrovi 7,9%) — **lokal agent hal qiladi**.

## Navbat (boshlanmagan; auditlardan)
- F-3 to'liq shakl: «с начала строительства» hisobot oyini qo'shmaydi (`forma3-export.ts:297-303`); qisqa shakl va nakopitelniy qo'shadi.
- `f2-hujjat.ts:406-413` — `summa ?? 0` (NULL≠0); 1 077 МАТ qatori `narx=0` narxsiz deb belgilanmaydi.
- Akt-sverka generatori yo'q.
- Shartnoma muharriri 2 ta, to'lov formasi 2 ta (C-04, C-05); prorab telefon «Bugun» (C-06); menyuni zanjir tartibiga o'tkazish (C-08).
- Kompaniya «turi» signali (pudratchi/subpudratchi/loyihachi/yetkazuvchi) — begona «Bugun» bandlarini yashirish uchun; egasi javobi kutilmoqda.
- Tezlik (baza): `t2_obyekt_jami` → tayyor jadval; zaxira skripti OFFSET → keyset; joy bo'shatish.
