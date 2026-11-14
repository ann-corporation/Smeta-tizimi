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

---

# LOKAL AGENTGA YO'NALISH (egasi so'rovi 13.11: «boshqa ko'z bilan xato va kamchiliklarni, yo'nalishni aniq qilib ber»)

Egasining talabi o'zgarmagan: **pudratchi (quruvchi) tomoni — qulay interfeys, to'g'ri hisob, tez ishlash, to'g'ri hujjat.** Quyidagilar auditlar va bugungi ishdan chiqqan xulosalar; dalillar `docs/architecture/cloud-rejalar/AUDIT_*.md` da.

## Ko'rilgan xatolar (nima noto'g'ri tashkil qilingan)
1. **Kenglik chuqurlikdan ustun bo'lgan.** 82 sahifa (33 tasi beta). Bir ish bir necha joyda: fakt ≥8 yuzadan yoziladi, F-2 5 sahifada, shartnoma muharriri 2 ta, to'lov formasi 2 ta, «kiruvchi quti» 4 joyda, obyekt sahifasida 2 ta «Keyingi qadam» vidjeti. Foydalanuvchi qaysi biri «to'g'ri» ekanini bilmaydi.
2. **Tartib qurilish mantig'iga zid.** Zanjir chizig'i Faktdan boshlanadi, АОСР F-3 dan keyin, to'lov/sverka qadami yo'q. Ishlarning umumiy jurnali yo'q.
3. **Menyu shishgan.** Boss 32+14 band, PTO 27+10, prorab 24+10. Boshqa tomonlarning «Bugun» bandlari pudratchiga ko'rinadi — tizim kompaniya turini bilmaydi.
4. **Pul ta'riflari yorliqsiz.** «Smeta jami» 3 xil (asl / joriy / nakopitelniy), ekranlar qaysi biri ekanini aytmaydi → egasi summaning qayerdan chiqqanini tushunmaydi. Formula yadrosi to'g'ri (mos keladi) — muammo ta'rif va yorliqda.
5. **Fakt ishlamayapti.** Faol qatorlarning 7,9% ida fakt bor; F-2 qatorlarining 52% i faktsiz; 502 fakt akti hammasi qoralama. Fakt jurnali telefonda yaroqsiz (min-w 980px), prorab «Bugun» ekranini ololmaydi. Fakt qulay bo'lmaguncha F-2 dan oldin kiritilmaydi.
6. **Tezlik.** Obyektlar ro'yxati (3,7 s) 36 joyda keshsiz; og'ir rahbar paneli (14 s) sahifa ochilishida fonda; 30 s timeoutlar bor; baza 469/500 MB.
7. **Hujjatlar.** Paket bitta workbook; shrink-to-fit; yashirin ustunlar qatorni kengaytiradi; F-3 da «с начала строительства» ikki shaklda ikki xil; narxsiz qator 0 deb yoziladi; akt-sverka yo'q.
8. **Jarvis.** Tayyor dars javoblari haqiqiy savolni bosib ketgan — testlar «chiroyli» gaplar bilan yozilgan, egasining haqiqiy gaplari bilan emas.
9. **Birlashtirish intizomi.** PR'lar alohida yashil, birga qizil edi (yangilik id takrori, qamrov jadvali, `confirm()`), main qizil bo'lgan. `supabase_migrations.schema_migrations` 20261203 da to'xtagan — keyingi ~65 migratsiya qo'lda qo'llangan, izi yo'q.

## Yo'nalish — ustuvorlik tartibida
**P0 — to'g'ri pul va hujjat (birinchi):**
1. Prod bazani tekshirish (yuqoridagi ⚠ bo'lim), `claude/smeta-jami-asl` ni yakunlash: asl smeta asosiy raqam HAMMA joyda (rahbar paneli keshiga `smeta_joriy`, Excel eksportlar, HolatNative).
2. `claude/hujjat-paket-papka` ni qabul qilish; keyin hujjat to'g'riligi: F-3 ustuni, NULL≠0, akt-sverka generatori, rasmiy KS-2/KS-3/M-29 shakllari bilan ustunma-ustun solishtirish (audit buni tekshirmagan).
3. Har katta jami yonida «qayerdan chiqdi» yoyilmasi: o'lchov, davr, ustamasiz → ИТОГО-4 → QQS → ВСЕГО.

**P1 — pudratchi ish oqimi:**
4. `claude/pudratchi-zanjir-chizigi` ni qabul qilish (bitta zanjir).
5. Fakt: prorab/usta uchun telefon «Bugun» ekrani; fakt kiritish yuzalarini bittaga keltirish; egasi qarori 4 — eski tasdiqlangan F-2 lardan faktni tiklash (reja egasiga ko'rsatilsin: nechta qator, qaysi obyekt, qaytarish yo'li).
6. Shartnoma va to'lov — bitta joy (C-04, C-05).
7. Kompaniya «turi» signali → menyuni zanjir tartibiga o'tkazish (Obyekt · Ish · Material · Hujjat · Hisob); rol × sahifa jadvalini egasi tasdiqlaydi.

**P2 — tezlik va joy:**
8. `claude/tezlik-obyekt-kesh` ni qabul qilish; keyin bazada: `t2_obyekt_jami` tayyor jadvalga, `t2_qator_holat` rejasi, joy bo'shatish (snapshot 77 MB, muhr 66 MB).

## Ishlash qoidalari (takrorlanmasligi uchun)
- **Muzlatish:** pudratchi yadrosi (smeta → fakt → АОСР → F-2 → F-3 → to'lov) silliq bo'lmaguncha yangi modul/sahifa ochilmaydi. Beta modullar (bozor, ochiq tender, yuk logistikasi, HR, buxgalteriya) menyuda pudratchi kundalik ishiga aralashmasin.
- **Bir ish — bir joy.** Yangi yuza qo'shishdan oldin eskisini olib tashlash yoki unga yo'naltirish.
- **Birlashtirishdan oldin yig'ma tekshiruv:** main + barcha ochiq tarmoqlarni lokal birlashtirib to'liq vitest. Har PR alohida yashil bo'lishi yetarli emas.
- **Migratsiya:** fayl → prodda `BEGIN … ROLLBACK` + acceptance → qo'llash → `schema_migrations` ga yozuv. Og'ir funksiyani almashtirganda eski/yangi natijani 1–2 haqiqiy obyektda solishtirish (cloud 7 obyektda sinab 60 s chegaraga urildi).
- **Egasining o'z gaplari va fayllari — test.** Jarvis, hujjat, summa bo'yicha har shikoyat aynan o'sha kirish bilan regressiya testi bo'lsin.
- **Har summa yorliqli:** qaysi o'lchov (asl/joriy), ustamali/ustamasiz, QQS bilan/siz. NULL — «noma'lum», 0 emas.
