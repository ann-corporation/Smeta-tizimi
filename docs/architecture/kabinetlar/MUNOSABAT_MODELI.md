# Ko'p rolli munosabat modeli — kabinet arxitekturasining umurtqasi

Holat: 1-bosqich (tadqiq va loyiha), kod yo'q. Sana: 2026-11-14. Dalil: kod `fayl:qator`, prod faqat o'qish (`sql_oqish`), son bilan. «TAXMIN» — tekshirilmagan.

## 0. Qisqa xulosa

Tizim «men kimman»ni **ikki joyda alohida** biladi: a'zolik roli (kompaniya ichidagi lavozim) va aloqa roli (ikki kompaniya orasidagi munosabat). Ikkinchisi serverda tayyor (`t2_tomon_aloqalar_v1` → `men_rol`/`qarshi_rol`), lekin **menyu va kontekst uni umuman o'qimaydi**. Yetishmayotgan narsa yangi jadval emas — «aloqalardan kabinetlar ro'yxatini hosil qiluvchi» bitta o'qish funksiyasi va uning klient kontekstiga ulanishi.

## 1. Hozir «men kimman» qayerdan biladi

| Qatlam | Manba | Nimani aytadi | Dalil |
|---|---|---|---|
| Kompaniya ichidagi lavozim | `t2_azolik.rol` (boss/admin/pto/prorab…) | ruxsatlar (capability) | `t2_men_v1` (prod funksiya matni); `navFiltr.ts:63-72` faqat `rol` + `permissions` |
| Kompaniya «turi» | `t2_kompaniya.turi` (shaxsiy/tashkilot) | Telegram modeli: shaxsiy ish joyi yoki tashkilot | `t2_men_v1` qaytaradi; `KompaniyaKontekst.tsx` `turi` |
| Kompaniya «mavqe» | `t2_kompaniya.mavqe` (pudratchi, bosh_pudratchi…) | erkin matn belgi | prod: 4 ta NULL, 123 = `pudratchi`; `KompaniyaKontekst.tsx` «`mavqe` — t2_men_v1 bermaydi, hozircha null» → klientda **doim null** |
| Aloqa roli | `t2_tomon_aloqa.taklif_rol/qabul_rol` | men shu kompaniyaga NIMAMAN | `t2_tomon_aloqalar_v1`: `men_rol`, `qarshi_rol`; klient faqat sub/tomon sahifalarida chaqiradi |
| Doira | `t2_tomon_grant` (resurs × obyekt/loyiha/shartnoma), `t2_tomon_vakolat` | nimani ko'raman | `_t2_tomon_ruxsat_togri` (grant, aloqa faol, beruvchi obyekti) |
| Shartnoma tomonlari | `t2_shartnoma.zakazchik_*` matn; `zakazchik_kompaniya_id` | buyurtmachi kim | prod: 6 shartnoma, `zakazchik_kompaniya_id` **0 ta to'ldirilgan** |
| Obyekt/loyiha ishtirokchisi | `t2_obyekt_imzochi` (rol, tomon_kompaniya_id) | imzo uchun rol | prod: 1 qator (daraja=loyiha) |

**Yetishmaydi:** (a) aloqa ↔ shartnoma bog'i yo'q (`t2_tomon_aloqa`da `shartnoma_id` yo'q; grantda ixtiyoriy); (b) shartnomada **yo'nalish** yo'q — «direksiya bilan bosh shartnoma» va «subga bergan shartnoma» ikkalasi `t2_shartnoma` (`kompaniya_id`=egasi), farqi faqat erkin `turi` matni (prod: 5 «Bosh shartnoma», 1 NULL); (c) rol lug'ati ikki xil: katalog `t2_yonalish` (kalit `buyurtmachi`, `bosh_pudratchi`, `yetkazuvchi`; `eski_taxalluslar`: zakazchik, pudratchi, taminotchi) bor, lekin aloqada **xom matn** saqlanadi (prod: `zakazchik`, `pudratchi`, `taminotchi`), grant shabloni esa `buyurtmachi`/`subpudratchi` bo'yicha — `t2_tomon_grant_shablon` kalitlari (`shartnoma`+`buyurtmachi`, `subpudrat`+`subpudratchi`) prod aloqalari (`turi=shartnoma`, `qabul_rol=zakazchik`/`subpudratchi`) bilan **mos tushmaydi**: shablon bo'yicha avto-grant ishlamaydi, grantlar qo'lda berilgan (29 ta, aloqa 91–96); (d) `t2_men_v1` aloqalarni qaytarmaydi, shuning uchun klient «qaysi kabinetlarim bor»ni bilmaydi.

## 2. Uch qavatli real holat: ifodalanadimi

Zanjir: Direksiya → Bosh pudratchi → Sub → (sub-sub / usta). Jadvallar **juft-aloqa** modelida: har aloqa = ikki kompaniya + ikki rol; bir kompaniya istalgancha aloqada turadi. Shuning uchun «bir vaqtda pudratchi (yuqoriga) va buyurtmachi (pastga)» **ifodalanadi**.

Sinov ma'lumoti (prod, `t2_tomon_aloqa`):

| aloqa | taklif → qabul | taklif_rol → qabul_rol | Ma'no |
|---|---|---|---|
| 91 | 123 → 433 | pudratchi → zakazchik | 123 direksiyaga nisbatan pudratchi |
| 96 | 123 → 438 | pudratchi → subpudratchi | 123 subga nisbatan **bosh pudratchi** (so'zi «pudratchi», «buyurtmachi» emas) |
| 97 | 440 → 123 | pudratchi → subpudratchi | 123 boshqa bosh pudratchiga nisbatan **subpudratchi** |

Xulosalar: (1) 123 bir vaqtda uch rolda: pudratchi (91), bosh pudratchi (96), subpudratchi (97) — jadval ko'taradi. (2) Sub oldidagi «buyurtmachi» roli alohida kabinet emas: aloqada u **pudratchi** deb yoziladi; «buyurtmachi» so'zi faqat oxirgi buyurtmachiga (aloqa 91) ishlatiladi. Demak «men subga buyurtmachiman» = Pudratchi kabinetidagi «Subpudratchilar» bo'limi (`/admin/subpudrat`), «Buyurtmachi» kabineti emas. (3) **Aloqa 97 bo'yicha grantlar 0 ta** (grantlar faqat aloqa 91–96): 123 ning «subpudratchi» ko'zi hozir bo'sh — model bor, ma'lumot bog'lanmagan. (4) 3-daraja (subning subi) **ifodalanmaydi**: `t2_sub_topshir_v1` obyekt `kompaniya_id = p_kompaniya_id` bo'lishini talab qiladi (migratsiya 20261216300000), sub esa GC obyektiga egalik qilmaydi; `t2_sub_topshiriq_qator_faol_uq` har qatorga bitta faol topshiriq. Pastga qayta topshirish yo'q (6-bo'limda taklif).

## 3. KABINETLARNI HOSIL QILISH QOIDASI

**Ta'rif.** Kabinet = (kompaniya K, ko'z `y`), `y` ∈ `t2_yonalish.kalit` (munosabat ko'zi) yoki `shaxsiy`. Kabinet **saqlanmaydi**, har safar hosil qilinadi (hosila): yangi jadval/ustun shart emas.

**Kirish:** foydalanuvchi U: a'zoliklari `M = t2_azolik(holat=faol)`; har K uchun: `turi`, `mavqe`, faol aloqalar `A(K)` (har biri `men_rol`, `qarshi_rol` — `t2_yonalish` kaliti bo'yicha **normallashtirilgan**: zakazchik→buyurtmachi, pudratchi→bosh_pudratchi, taminotchi→yetkazuvchi), olingan grantlar `G(K)`, vakolatlar `V(K)` (`vakil_kompaniya_id=K`), `superadmin`.

```
kabinetlar(U):
  natija = []
  for (K, rol_a) in M where K.faol:
    if K.turi == 'shaxsiy':
        natija += Kabinet(K, 'shaxsiy', null);  continue
    # 1. Ichki ish kabineti — «Pudratchi» (o'z obyekt/smeta/fakt/F2/moliya egasi)
    if ownObyekt(K) > 0  or  K.mavqe in {pudratchi, bosh_pudratchi}  or  K.tanlov contains 'pudratchi':
        natija += Kabinet(K, 'bosh_pudratchi', null)
    # 2. Aloqadan kelgan ko'zlar: «men NIMAMAN» = men_rol
    for a in A(K) where a.holat == 'faol':
        y = normalla(a.men_rol)
        if y in {bosh_pudratchi}: continue            # 1-qoida bilan yopilgan (sub bo'limi shu kabinet ichida)
        key = (K, y);  natija[key].kontekst += a      # bir ko'z — bir kabinet, aloqalar = kontekst
    # 3. Vakolat: texnadzor vakili (aloqa o'zida bo'lmasa ham)
    for v in V(K) where v.holat == 'faol':  natija[(K,'texnadzor')].kontekst += v
    # 4. A'zolik roli faqat KABINET ICHIDA nima qila olishni belgilaydi (capability), kabinetni ochmaydi
    #    shaxs-darajali rollar (usta, brigadir, haydovchi, omborchi) -> ularning o'z «Bugun»i, kabinet tanlovi YO'Q
  if U.superadmin: natija += Kabinet(null,'platforma') + «istalgan K ni ko'z sifatida ochish» (o'qish rejimi)
  if natija bo'sh: return [Boshlash()]   # 5-bo'lim
  return unique(natija) sort by (oxirgi_faollik desc)
```

Qoidaning mazmuni: **a'zolik «kabinet ichida nima qilaman»ni, munosabat «qaysi kabinetlarim bor»ni belgilaydi.** Kabinetdagi harakatlar ruxsati o'zgarmaydi: `navFiltr.sahifaKorinadi` (`rol`+`permissions`) kabinet ichida qoladi; kabinet — uning **oldidagi** filtr.

### Chekka holatlar

| Holat | Xulosa |
|---|---|
| Munosabati yo'q yangi kompaniya | Hech qanday kabinet hosil bo'lmaydi → «Men nima qilaman?» tanlovi: Pudratchi (o'z obyekti) · Buyurtmachi (pudratchimni taklif qilaman) · Subpudratchi (taklif/kod kutaman) · Yetkazuvchi · Logistika · Boshqa. Tanlov `K.mavqe`ga yoziladi (**boshlang'ich signal**, kabinet ochadi, lekin munosabat kelganda kabinetlar aloqadan qayta hisoblanadi). `t2_men_v1.onboarding_kerak` shu yerda ishlaydi |
| Bir kompaniya — bir necha rol | Bir K da bir nechta kabinet (123: Pudratchi + Subpudratchi→440). Sub kabineti ichida kontekst = bosh pudratchi (4-bo'lim) |
| Bir foydalanuvchi — bir necha kompaniya | `ish-joylarim` (Telegram uslubi, `IshJoylarim.tsx`) = kabinetlar ro'yxati; har karta: K nomi + uning kabinet belgilari. `t2_kompaniya_kontekst` (localStorage, `uid` bilan) kengayadi: `{uid, id, kabinet}` |
| Kompaniyasiz foydalanuvchi | `shaxsiy` (Telegram modeli) K hosil bo'ladi, `turi=shaxsiy`: «Shaxsiy» kabinet (kurs, topshiriqlar, token, taklif kodi qabul qilish); munosabat kodi bilan qo'shiladi → boshqa kabinet |
| Superadmin | `t2_men_v1` hamma faol kompaniyani qaytaradi (`v_super`). Kabinetlar ro'yxati to'liq emas, «kompaniya tanla → uning kabinetlari» + `Platforma` kabineti (faqat superadmin, `navFiltr.sahifaKorinadi` qatlam `platforma`) |
| Munosabat tugadi (`toxtatilgan/yopilgan`) | Kabinet **o'chmaydi**, «Arxiv» ko'rinishga o'tadi (o'tgan aktlar, hisob-kitob ko'rinishi): `_t2_tomon_ruxsat_togri` aloqa `faol` bo'lmasa ruxsat bermaydi → yangi ish yo'q, tarix serverda grantga bog'liq. Boshqa faol aloqasi bo'lmasa kabinet `Arxiv`; 90 kundan keyin yashirin |
| Taklif kutilmoqda (`taklif`) | Kabinet emas, «Kutilayotgan takliflar» bildirishnomasi (`kod_kutilmoqda`) |
| Aloqa bor, grant yo'q (deny-by-default) | Kabinet ochiladi, lekin «Beruvchi hali hech narsa ochmadi» bo'sh holat; ma'lumot oqmaydi (aloqa 97 holati) |

**«Kompaniya turi» ustuni** (`mavqe` / cloud handoff taklifi): **yetarli emas**, chunki rol munosabatga bog'liq: 123 ning `mavqe`=pudratchi, lekin u aloqa 97 da `subpudratchi`, aloqa 96 da sub oldida bosh pudratchi. Yagona belgi bu uch kabinetdan ikkitasini yashiradi. **Foydali joy:** (1) yangi kompaniya boshlang'ich tanlovi, (2) munosabat kelmaguncha menyuni toraytirish, (3) kompaniyani qidiruvda (`ochiq_profil`) ko'rsatish. Shuning uchun cloud taklifi («turi signali → begona «Bugun» bandlarini yashirish») to'g'ri maqsad, lekin signal `mavqe` emas, **aloqalardan hosila**: `t2_men_v1` faqat shuni qaytarsa yetadi.

## 4. Kabinet ichidagi kontekst

| Kabinet | Kontekst o'qi | Tanlov | Qayerdan |
|---|---|---|---|
| Subpudratchi | bosh pudratchi (aloqa) → obyekt | tepada «Kimdan: <bosh pudratchi>», sukut = hammasi; (aloqa,obyekt) juftlari hozir bitta ro'yxatda (`SubpudratchiBugun.tsx` `juftlar`) | `aloqalarOl` `men_rol=subpudratchi` va `sub_ishlarim` |
| Buyurtmachi | pudratchi → shartnoma/obyekt | pudratchi (aloqa) → grant doirasidagi obyektlar | `t2_zakazchik_bugun_v1`, grantlar |
| Pudratchi | obyekt (joriy tanlov) + «Kim bilan» (sub/yetkazuvchi/lab) | obyekt tanlagichi mavjud | `t2_obyekt` |
| Texnadzor | buyurtmachi → obyekt (vakolat) | vakolat doirasi | `t2_tomon_vakolat` |

**Bir hujjat — ikki ko'rinish (sub-akt).** Manba bitta qator `t2_sub_akt` (+`_qator`); ko'rinish `t2_sub_akt_royxat_v1(yonalish)`: sub `yuborilgan` («Aktlarim»), bosh pudratchi `kelgan` («Kelgan aktlar»); tafsilot `t2_sub_akt_tafsilot_v1` ikki tomonga `meniki` bayrog'i bilan (acceptance 6-qadam shuni tekshiradi). Narx ko'rinishi **asimmetrik**: sub faqat kelishilgan narx va hajmni ko'radi; bosh pudratchi smeta narxi + kelishilgan narx (marja) (`SubTopshiriq` vs `SubIsh`, `t2-sub.ts:12-27`).

**F-2 bilan bog'lanish.** Sub akti qabul qilinganda (`t2_sub_akt_qaror_v1`): `t2_fakt_yoz_v2` (deterministik `operation_id`) bosh pudratchining obyekti/smeta qatoriga **bir marta** fakt yozadi, `t2_xarajat` (toifa `subpudrat`, kelishilgan narx) va shartnoma bog'langan bo'lsa `t2_qarz_asos`; ortiqcha hajm `ORTIQCHA` bilan rad. Direksiyaga F-2 shu fakt qatorlaridan hosil bo'ladi (F2 narxi = max qoidasi bu yerda ishlaydi, sub narxi F2 ga o'tmaydi).

## 5. Ma'lumot oqimi: sub → bosh pudratchi → direksiya, qayerda uziladi

Server tomoni **uzilmagan** (isbot: `tomonlararo_zanjir_v1.acceptance.sql:338-341` — qabuldan keyin `fakt_akt_id` va `xarajat_id` bo'lishi shart). Uzilish joylari:

| # | Uzilish | Dalil |
|---|---|---|
| U-a | Prodda zanjir **hech aylanmagan**: `t2_sub_topshiriq` 2 qator, `t2_sub_akt` 0 | `sql_oqish` |
| U-b | Oltin zanjir (11 qadam)da sub-akt **o'tkazib yuboriladi** | `oltin_zanjir_v1.acceptance.sql:250` («SKIP [8 subpudrat akti]») |
| U-c | UI da sub-aktdan faktga/xarajatga/F2 ga havola yo'q: `SubpudratBoshqaruv.tsx` da `fakt_akt_id`/`xarajat_id` ishlatilmaydi (faqat toast, qator 132); F2 sahifalarida `sub_akt` manbasi yo'q | grep: 0 moslik |
| U-d | Sub to'lov holati (`t2_sub_tolov_holati_v1`) `shartnoma_id` bo'lsa ishlaydi; prodda topshiriqlarda `shartnoma_id` NULL → `tolangan` doim NULL | `sql_oqish` (2 topshiriq, ikkalasi NULL) |
| U-e | Umumiy `/admin/taqdimlar` ro'yxati `sub_akt` taqdimini filtrlamaydi (`t2_tomon_taqdimlar_v1` da `sub_akt` yo'q), qaror esa trigger bilan boshqa yo'lga yo'naltiriladi (`SUB_AKT_QAROR_BOSHQA_YOL`) — o'lik eshik (TAXMIN: UI filtri yo'q, grep `'sub_akt'` faqat sub fayllarida) | migratsiya §4 |
| U-f | Sub ustalari/naryadi: `t2_naryad_yoz_v1` o'z kompaniya obyektiga bog'liq, `t2_sub_topshiriq` ga havolasi yo'q | funksiya matni |

## 6. MINIMAL O'ZGARISH — faqat TAKLIF (yangi jadvalsiz)

| # | Taklif | Mavjudga tayanadi | Hajm |
|---|---|---|---|
| M1 | `t2_men_v1` ga `aloqalar_xulosa` qo'shish: har faol aloqa uchun `{aloqa_id, men_rol_norm, qarshi_rol_norm, qarshi_kompaniya_id, qarshi_nom, olingan_grant_soni}` + `vakolatlar`. Klient `kabinetlar(U)` ni sof funksiya sifatida shundan hosil qiladi (`lib/reestr/tomonProfil.ts` ga yoziladi, u hozir faqat `subpudratchi` yozuvli) | `t2_tomon_aloqalar_v1`, `t2_yonalish.eski_taxalluslar` | 1 funksiya + 1 sof lib |
| M2 | Rol normallashtirish: aloqa yozishda `taklif_rol/qabul_rol` ni `t2_yonalish.kalit`ga keltirish (taxalluslar orqali), grant shabloni `aloqa_turi`+kalit bo'yicha mos tushsin; eski yozuvlar o'qishda normallashtiriladi (migratsiyasiz) | `t2_yonalish` | kichik |
| M3 | Sahifa reestriga `kabinet: [..]` maydoni (`sahifa.ts` `Sahifa` ga) — menyu = `ishJoyi` ∩ `kabinet` ∩ ruxsat. Hozirgi `ishJoyi` (7 ta) saqlanadi; kabinet — undan oldingi filtr. 10+ sahifa «hammada» ko'rinmaydi | `reestr/sahifa.ts`, `navFiltr.ts` | reestr yozuvlari |
| M4 | Shartnoma yo'nalishi: `t2_shartnoma.turi` erkin matn o'rniga hosila: shartnoma qaysi aloqaga tegishli — `t2_tomon_grant.shartnoma_id` + `t2_sub_topshiriq.shartnoma_id` mavjud; qo'shimcha: `t2_tomon_aloqa` ga NULL `shartnoma_id` (yoki `t2_shartnoma_bog` kengaytmasi). `zakazchik_kompaniya_id` ni aloqa 91-turi bo'yicha avto-to'ldirish | `t2_shartnoma_bog`, aloqa | 1 ustun, to'ldirish |
| M5 | 3-daraja: `t2_sub_topshiriq.ota_topshiriq_id` (NULL) + qatordagi unikal indeksni `(qator_id, coalesce(ota,0))`ga kengaytirish; pastga topshirishda hajm ota topshiriq qoldig'idan oshmasin; sub-subning akti sub orqali tasdiqlanib, sub o'z aktida **ota topshiriq hajmi sifatida** pastga uzatadi (fakt faqat egasi qatlamda, bir marta) | `t2_sub_topshiriq` | 1 ustun + RPC cheklovlari (TAXMIN: batafsil dizayn keyin) |
| M6 | Faol aloqa uchun «grant to'plami» to'ldirilmagan bo'lsa (aloqa 97) kabinetda «Beruvchi hech narsa ochmadi» holati va beruvchiga eslatma | `t2_tomon_grant_shablon_v1` | UI |
| M7 | Arxiv rejimi: yopilgan aloqa kabineti «Arxiv» | `t2_tomon_aloqa.holat` | UI |

## 7. Qaror qilish uchun asosiy xulosalar (8–10)

1. Munosabat serverda **bor** (`men_rol`/`qarshi_rol`), lekin menyu/kontekst o'qimaydi: `navFiltr` faqat a'zolik roli + capability.
2. Juft-aloqa modeli uch qavatni ko'taradi (aloqa 91/96/97); 123 bir vaqtda uch rolda. Yangi jadval kerak emas.
3. «Sub oldida buyurtmachi» alohida kabinet emas — Pudratchi kabinetidagi «Subpudratchilar» bo'limi; Buyurtmachi kabineti faqat oxirgi buyurtmachi uchun.
4. Kabinet hosila: (kompaniya, `men_rol`) + vakolat + o'z obyekti; a'zolik roli faqat kabinet ichidagi harakatni cheklaydi.
5. `mavqe`/«kompaniya turi» yetarli emas (123: mavqe=pudratchi, aslida 3 rol) — faqat boshlang'ich tanlov va qidiruv uchun; klientda `mavqe` doim null.
6. Rol lug'ati ikkiga bo'lingan: `t2_yonalish` katalogi to'g'ri, aloqada xom matn, shablon mos tushmaydi → grantlar qo'lda.
7. Shartnoma tomonlari yetarli emas: `zakazchik_kompaniya_id` 0/6, aloqa↔shartnoma bog'i yo'q, shartnoma yo'nalishi yo'q.
8. 3-daraja (subning subi) ifodalanmaydi — M5.
9. Sub → fakt → xarajat server isbotlangan, lekin prodda aylanmagan va UI/F2 da ko'rinmaydi.
10. 123 ning «subpudratchi» ko'zi hozir bo'sh (aloqa 97, grant 0) — sinov-ma'lumot to'ldirilishi kerak.

Tekshirilmadi: brauzer sinovi; `/admin/taqdimlar` sahifasining haqiqiy filtri; sub-sub zanjiri prodda; aloqa 97 bo'yicha grant berilganda sahifa ko'rinishi.
