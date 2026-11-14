# TIZIM_02 — HISOB VA HUJJAT TO'G'RILIGI AUDITI (2026-11-13)

Tartib: faqat o'qish. Kod/baza o'zgartirilmadi (bazaga faqat SELECT). Kompaniya 123 (36 faol obyekt + 2 bekor). Absolyut summa va kontragent nomi yozilmadi — faqat nisbat/foiz va obyekt id.
Belgilar: [S] = SQL natijasi bilan tasdiqlandi; [K] = kod o'qildi (fayl:qator); [?] = tekshirilmadi / faraz.

---------------------------------------------------------------------
## 0. QISQA XULOSA
1. Pul zanjiri (smeta → ustama → ITOGO-4 → QQS 12%) frontendda BITTA yadroda (`frontend/src/lib/hisob-yadro/`), uni qo'riqchi test himoya qiladi; ustamali hisob serverda ham BITTA kanonik funksiyada (`_t2_nakrutka_kaskad_v1`), rahbar paneli / obyekt paketi / `_t2_summa_paket_v1` / nakrutka view bir obyektda tiyinigacha mos [S]. Lekin bazada yana ikkita eski kaskad (`t2_nakrutka_hisob`, `hisob_nakrutka`) tirik va ikkinchi F3 (qisqa shakl) alohida arifmetika ishlatadi.
2. «Smeta jami» bitta son emas: tizim ichida kamida 3 xil «smeta» bor — `smeta` (faqat asl qatorlar, qo'shimcha/zamena kirmaydi), `smeta_joriy` (asl − almashtirilgan + qo'shimcha + zamena) va nakopitelniy `smeta_summa` (faqat rs/mat/ob barglar, qo'shimchalar bilan). Obyekt 152 da bu farq 651% (F2/smeta). Egasining «smetadagi ish faktga mos emas» sezgisining ASOSIY sababi shu + fakt kiritishning yoshligi (2026-10 dan).
3. P0 ma'lumot xatosi: obyekt 152 da 2 ta TASDIQLANGAN F2 qatorida «hajm = pul, narx = 1» (13.3 mlrd dan ortiq, F2/fakt ning ~33.7%i), `baseline_summa` ≈ 2e20 — nakopitelniy `narx_variance_summa` shu sabab ma'nosiz (−2.17e20) [S].
4. «≈48,7 mlrd» ni aynan takrorlab bo'lmadi (pastda §2). Eng yaqin nomzod — obyekt 152 F2 «QQS bilan» (≈ +2.5%).
5. Hujjatlarda: «с начала строительства» ustuni F3 to'liq shaklda hisobot oyini KIRITMAYDI, F3 qisqa shaklda va nakopitelniyda KIRITADI — bir xil nom, har xil ma'no [K].

---------------------------------------------------------------------
## 1. PUL ZANJIRI

### 1.1 Zanjir (kod va baza bir xil tartibda)
Kategoriya jamilari (ЧЕЛ/МАШ/МАТ/ОБ + М/К, КАБ, БЕЗ СКЛАД) → ПРЯМЫЕ → транспорт-материал, склад-материал, склад-МК, транспорт-кабель → ИТОГО-1 → ПРОЧИЕ подрядчика → ИТОГО-2 → транспорт/заготовка-оборудование → ИТОГО-3 → страхование, риск → ИТОГО-4 (QQS siz) → НДС 12% → ВСЕГО.
- Frontend: `frontend/src/lib/hisob-yadro/podval.ts:64` (`standartPodval`), baholovchi `podval.ts:161` (`podvalBahola`), QQS `hisob-yadro/nds.ts:11` (`qqsSumma` = ROUND(asos×foiz/100,2)), yaxlitlash `yaxlit.ts` (`yaxlit2`, Excel ROUND).
- Server: `_t2_nakrutka_kaskad_v1(p_cats,p_nk,p_yaxlit)` (har qadam round2) ← `t2_nakrutka_hisobla_v1` ← `_t2_summa_paket_hisob_v1` (+ `_t2_kaskad_yakun_v1`: kat noma'lum / svod yaxlit qismlar ITOGO-4 ga ustamasiz qo'shiladi, QQS bir marta).
- Sinov: nk foizlari (obyekt 151/152: tr_mat 5, skl_mat 2, prochie 18, strax 0.32, risk 0, НДС 12).

### 1.2 Necha joyda hisoblanadi? (yadro bitta, lekin to'liq emas)
| # | Joy | Holat |
|---|-----|-------|
| 1 | `hisob-yadro/podval.ts` (TS) | kanonik, qo'riqchi test: `hisob-yadro/hisob-yadro.guard.test.ts` kaskad qadamlari, `/100`, `Math.round(x*100)/100`, `/1.12` ni boshqa fayllarda taqiqlaydi (PUL_RUXSAT:39) |
| 2 | `_t2_nakrutka_kaskad_v1` (SQL) | kanonik server nusxasi, TS bilan «paritet» (migratsiya `*hisob_yadro_sql_moslash*`, `paritet.test.ts`) |
| 3 | `t2_nakrutka_hisob(...)` (SQL) | ESKI: yaxlitlashsiz, `skl_mat` ga skl_mk ni qo'shib yuboradi; `t2_nakrutka_koef`, eski 1-argli `t2_obyekt_nakrutka(bigint)` funksiyasi chaqiradi. Yadroga ulanmagan [S] |
| 4 | `hisob_nakrutka(shartnoma_id,…)` (SQL) | LEGACY: alohida `nakrutka` jadvaliga tayanadi, NUMERIC(20,2) ga har qadam avtomatik yaxlitlanadi; yadrodan tashqarida. Frontenddan chaqirilmaydi (`reestr/domen.ts:107` faqat katalog) [S][K] |
| 5 | `nakopitelniy-svod.ts:41-45` `tiyin()` | o'z Excel-ROUND nusxasi (yaxlit2 dublikati); qo'riqchi ruxsat ro'yxatida emas, regex `Math.round(x*100)/100` ni tutmaydi, chunki shakli boshqa [K] |
| 6 | `forma3-export.ts:1381` + `nakopitelniy-svod.ts:199` QQS ajratish | `qqsAjratTiyin` (yadro) ishlatadi — to'g'ri, lekin ADDITIV (`qqsSumma`: asos×12%) va AJRATUVCHI (jami/1.12) ikki konventsiya bir hujjat oilasida; ±1 tiyin farq mumkin |

Xulosa: yangi kod tomondan «har joyda o'z formulasi» YO'Q (qo'riqchi ishlayapti), lekin bazada 2 ta eski kaskad o'chirilmagan (P1: o'chirish/`deprecated`).

### 1.3 Kompaniya 123 obyektlari bo'yicha mosligi [S]
Obyekt 154 (to'liq tekshirildi): `_t2_summa_paket_v1('smeta')` = `t2_rahbar_panel_v1` portfel.smeta = `t2_nakopitelniy_v2.jami.smeta_nakrutka` — ustamasiz, ITOGO-4, QQS, ВСЕГО bo'yicha 0.00 farq. F2: nakopitelniy `jami_tasdiqlangan_summa` = paket `f2.ustamasiz` (0.00 farq). Fakt: rahbar panel fakt = paket fakt (0.00).

Mos KELMAGAN joylar:
- Nakopitelniy `smeta_summa` (barglar rs/mat/ob Σ summa) vs paket `smeta.ustamasiz`: obyekt 154 da +0.13% (summa_agg svod/yaxlit tarkibi va kat-nomalum tufayli) [S].
- Obyekt 152: paket `smeta` (asl) ustamasiz = X; nakopitelniy `smeta_summa` va `smeta_nakrutka.pryamye` ≈ 7.8X (≈ `smeta_joriy`). Ya'ni nakopitelniy/ob'ekt ustamasi 152 da `smeta_joriy` ma'nosida, rahbar paneli portfeli esa `smeta` ma'nosida [S]. Sabab: 152 da 41 mlrd+ qatorlar `qoshimcha=true, change_type IS NULL` (eski bayroq), `t2_qator_asl_v1` ularni «asl emas» deb chiqarib tashlaydi, nakopitelniy tushirmaydi.
- Obyekt 153: smeta_joriy / smeta = +29.4% (209.0/161.6 mlrd ustamasiz) [S]. Kompaniya bo'yicha smeta_joriy/smeta = +19.7% (QQS bilan 688.8 / 575.5 mlrd) [S].
- Ustama manbasi farqi: obyektlar 182, 282, 353 `nk_manba='kompaniya'` — склад-материал 0%, склад-МК 0%, заготов-оборуд 0%; smeta-podvali obyektlarda 2% / 0.75% / 1.2%. Ya'ni bir kompaniya ichida ustama turli. 182 (ikkinchi katta obyekt) ustamasi kam hisoblangan bo'lishi mumkin [S][?: shartnoma talabi tekshirilmadi].
- Aktlar bo'yicha taqsimot: `t2_rahbar_panel_v1` har aktga obyekt F2 paketining ulushini beradi (`akt prямые / obyekt прямые`), alohida aktni `_t2_summa_paket_v1('aktlar')` bilan hisoblasa — o'z podvali bilan farq qilishi mumkin; F3 «за отчетный месяц» esa har akt O'Z podvali bilan (`forma3-export.ts` M12). Uch xil yo'l — tekshirilmadi (faqat 152/153 aktlar ro'yxati olindi) [?].
- `t2_rahbar_panel_v1` portfel kartasida `shartnoma_qqs_bilan` BUTUN shartnoma summasi (obyekt 154 uchun 9 obyektli shartnoma: 25-sh) obyekt smetasi yonida turadi — ko'lam (scope) aralashadi [S].

---------------------------------------------------------------------
## 2. «48.7 MLRD QQS BILAN» — QAYERDAN CHIQISHI MUMKIN
Natija: aynan ≈48,7 mlrd ni takrorlay olmadim. Tekshirilgan:
- Kompaniya 123 jami (smeta, smeta_joriy, f2, f2_qoralama, fakt): QQS bilan 575.5 / 688.8 / 264.3 / 63.3 / 359.1 mlrd — hech biri mos emas [S].
- Har obyektning barcha o'lchovlari (±5 so'm) va obyektlar kombinatsiyasi (subset-sum, ustamasiz/ustamali/QQS bilan, ×1.12 va /1.12 variantlari) — mos kelmadi [S].
- Shartnoma, DS, F3, akt `hujjat_jami` (×1.12 ham /1.12 ham) — mos emas [S].
- Eng yaqin: obyekt 152 `f2` QQS bilan = 49.9 mlrd (farq ≈ +2.5%). 152 da F2 jami 2 ta xato qatorni (13.3 mlrd, §3.3) o'z ichiga oladi; Jarvis tomonidan oldingi holat (xato qator qo'shilmasdan/boshqa davr filtri) berilgan bo'lishi mumkin [?].
- Ehtimoliy sabablar: (a) Jarvis `smeta` MCP vositalari (`f2`/`forma3`/`nakopitelniy`) bitta obyekt/akt bo'yicha QQS BILAN beradi, nima (smeta/F2/fakt, qaysi davr) ekanini yozmaydi; (b) ustamali ITOGO-4 ga QQS qo'shilgani tushuntirilmaydi; (c) «jami» 3 ta «smeta» ta'rifidan qaysi biri ekani ko'rsatilmaydi (§1.3).
Kompaniya bo'yicha jami smetani ham ikki marta sanash xavfi bor:
- Bekor qilingan/almashtirilgan qatorlar qo'shilmaydi: `_t2_summa_agg_v1` 'smeta'/'smeta_joriy' da `versiya_holat='faol'` filtri bor [K/S]. 'fakt' o'lchovida filtr yo'q (tarix qatori ham kiradi) — obyekt 175 da 1 qator ≈ 5.9% smeta (faqat shu 1 xato qator), 162/163/165/166 da kichik [S].
- Obyekt ikki marta sanalgan: 156/157, 158/159, 163/164/165, 167/168 juftliklarida smeta jamlari BIR XIL (165 da farq 0.00000002%), nomlari boshqa, bir shartnomaga bog'langan. Kompaniya jami smeta QQS bilan ≈ 14.2 mlrd (2.5%) ortiqcha bo'lishi mumkin [S][?: bu nusxami yoki alohida bo'lim — egasidan so'rash].
- Rahbar panel `v_ob` = kompaniyaning HAMMA obyektlari (bekor ham, holat filtri yo'q) — hozir bekor obyektlarda faol qator 0, ta'siri yo'q, ammo keyin xavf (P2).

---------------------------------------------------------------------
## 3. FAKT ↔ SMETA NOMUVOFIQLIGI (kompaniya 123)

### 3.1 Qamrov [S]
- Faol barg qatorlar 87 014; faktli: 6 900 = 7.9% (summa bo'yicha 45.4% — 152 va 153 dagi yirik qatorlar siljitadi, qator bo'yicha 7.9% asosiy ko'rsatkich).
- F2 qatorlari (tasdiqlangan) 9 974; ulardan 5 182 (52.0%) da fakt YO'Q. Faktda bor, F2 da yo'q: 2 089 qator.
- Fakt > smeta hajmi: 1 319 qator (faktli qatorlarning 19.1%); 153 obyektida 1 269 (46% faktli qator): 780 tasi bitta yozuvda ortiq, 489 tasi bir nechta yozuv yig'indisi (376 tasida har bir yozuv smetadan kichik, yig'indisi katta → kumulyativ kiritish ehtimoli) [S].
- «Smetada yo'q ish»ga yozilgan fakt: `qoshimcha=true` qatorlarda 1 579 fakt qator (faktning 22.9%); eski (almashtirilgan) qatorda 102 fakt yozuvi (`versiya_holat<>'faol'`), asosan 175/162/163/165/166 [S].
- Fakt aktlari: 502 ta, HAMMASI `qoralama`; tasdiqlangan fakt akti 0. Fakt 2026-10 da boshlangan (10-oy: 53 akt, 11-oy 13-sanagacha: 449 akt, ~23 qator/akt) — F2 aktlari (2025-07..2026-03) fakt tizimidan OLDIN yozilgan [S].
- Fakt narxsiz: 12 941 fakt yozuvidan 2 398 (18.5%) da narx NULL → fakt summasi noma'lum; F2 qatorlarida 31 432 dan 5 406 (17.2%) summa NULL, tasdiqlangan 49 aktning 46 tasida narxsiz qator bor, ya'ni 94% rasmiy F2 jami to'liq emas [S].

### 3.2 Eng muammoli 5 obyekt (ustamasiz summa nisbatlari, smeta = `smeta` o'lchovi)
| Obyekt | F2/smeta | fakt/smeta | fakt qamrovi (qator/summa) | izoh |
|---|---|---|---|---|
| 152 | 651% | 650% | 10.6% / 85.1% | smeta jami 41 mlrd+ `qoshimcha` qatorni chiqarib tashlaydi (smeta_joriy ga nisbatan F2 83.4%); 2 ta narx=1 xato qator |
| 151 | 33.3% | 50.9% | 12.6% / 25.2% | F2 qatorlarining 83% (2128/2575) da fakt yo'q; narxsiz 423 qator (smeta_joriy da 1568) |
| 182 | 0% | 8.2% | 0.7% / 4.2% | 12 812 qatorli yirik smeta, fakt deyarli yo'q; ustama manbasi «kompaniya» |
| 153 | 86.0% | 93.4% | 13.4% / 68.6% | fakt>smeta 1 149 qator; smeta_joriy ga nisbatan F2 66.5% (qo'shimcha +29.4%) |
| 160 | 35.5% | 0% | 0% / – | F2 349 qator bor, fakt 0 qator (mos kelmaydi) |
Qo'shimcha: 155 (F2 34.3%, fakt 41.3%, F2 qatorining 85% da fakt yo'q), 158/159 (F2 18.5%, fakt 30.9%), 172 va 238 (685 / 218 qator, fakt 0), 170 (fakt 38.0%, F2 tasdiqlanmagan — faqat qoralama 26.9%).

### 3.3 P0: «hajm = pul, narx = 1» qatorlar [S]
`t2_akt_qator` id 21899 va 36258 (akt 328 va 399, obyekt 152, F2 tasdiqlangan, `narx_manba='qol_nomalum'`): hajm ≈ 5.8 mlrd va 7.5 mlrd, narx = 1, summa = hajm. Bu so'm summasi «hajm» ustuniga tushgan. Ta'siri: obyekt 152 F2 va fakt jamining ~33.7% (13.3 mlrd), `baseline_narx` 1.6e10, `baseline_summa` ≈ 9.5e19 va 1.2e20 → nakopitelniy `jami.baseline_summa` = 2.17e20, `narx_variance_summa` = −2.17e20. Fakt qoralamasida 152 da shunga o'xshash 1 yozuv (narx=1, hajm>1e6) va narxi >1e9 bo'lgan 3 yozuv bor; obyekt 175 da ham 1 ta bekor F2 va 1 ta fakt qoralama yozuvi (1.25 mlrd, almashtirilgan qatorda). Jami «narx=1 va hajm>1e6» shartiga mos 5 yozuv (152: 2 tasdiqlangan F2 + 1 fakt; 175: 1 bekor F2 + 1 fakt) [S].

### 3.4 Sabab: tizimdami yoki kiritilmaganmi?
- Kiritilmagan (asosiy): fakt moduli 2026-10 da yuritilgan; tarixiy F2 lar import bilan kelgan, fakt «orqaga» to'ldirilmagan; egasi qoidasi — F2 dan fakt chiqarilmaydi (`nakopitelniy-vedomost-export.ts`, `slichitelniy-vedomost.ts` izohlari).
- Tizimdagi sabab (bartaraf qilsa bo'ladi): (1) «smeta» ta'rifi uchta (§1.3) — 152/153/151 da F2 > smeta ko'rinadi; (2) fakt `qoralama` holatida jami ga kirib ketadi (`_t2_fakt_olchov_v1`: `a.holat <> 'bekor'`) va tasdiqlash oqimi ishlatilmaydi; (3) versiya almashganda fakt eski qatorda qolgan (102 yozuv) va 'fakt' o'lchovi `versiya_holat` filtrini qo'llamaydi, `smeta_hajm=0` bilan ko'rinadi; (4) fakt har kiritish uchun yangi akt (449 akt/13 kun) — qator-akt bo'linishi, kumulyativ kiritish (376 qator) bilan «fakt>smeta» ni ham ko'paytiradi [?: UI qulayligi kodda tekshirilmadi].

---------------------------------------------------------------------
## 4. HUJJATLAR (kod bo'yicha)
Umumiy: hujjat yozuvchi `frontend/src/lib/hujjat-yozuvchi/` (imzo: `imzo.ts:30`, blok: `rasmiy.ts:751`). Imzo bloki hamma hujjatda bir xil: tashkilot nomi + imzo chizig'i + «(подпись)» + М.П.; sana, lavozim, F.I.O. qatori yo'q (F3 to'liq shakldan tashqari).

| Hujjat | Generator | Topilgan nuqta |
|---|---|---|
| F-2 (KS-2) | `f2-hujjat.ts` (`f2Hujjat`, ЖИВОЙ formulalar) | (a) `f2-hujjat.ts:406-413` storno bloklarida `summa ?? 0` — narxsiz storno qatori jamga 0 bo'lib kiradi (NULL≠0 buzilishi, `eskiDaraxtYoz`); (b) `f2-hujjat.ts:503-510` «Округление построчных сумм (не более 1 сум)» — jamlar farqi ≤1 so'm bo'lsa o'zi to'ldiruvchi qator qo'shib, sverkani doim 0.00 qiladi: rasmiy hujjatda «plug» qatori (audit uchun xavfli); (c) imzo bloklarida Главный бухгалтер/Руководитель qatori yo'q; (d) 49 tasdiqlangan F2 dan 3 tasi raqamsiz, 46 tasida narxsiz qator (jami to'liq emas, hujjatda «Внимание: N строк без цены» yozilgan) [S] |
| F-3 (KS-3, to'liq) | `forma3-export.ts` | (a) `forma3-export.ts:297-303, 519, 548, 1141`: «с начала строительства» = faqat hisobot OYIDAN OLDINGI F2 (yozilgan: «до отчетного месяца»), «с начала года» ham shunday; rasmiy ma'no odatda «с начала строительства» hisobot davrini ham o'z ichiga oladi; (b) `forma3-export.ts:941-952` qator yaxlitlash farqi izoh sifatida ochiq yoziladi — to'g'ri |
| F-3 (qisqa, sotuv) | `forma3SotuvdanXlsx` + `nakopitelniy-svod.ts:192-226` | `boshidan = jamiQqs(gacha)` (`nakopitelniy-svod.ts:210,225`) shu F3 ni KIRITADI → to'liq F3 bilan ma'no mos emas; `forma3-export.ts:1381` shartnoma QQS siz = jami/1.12 (ajratuvchi) — boshqa joyda additiv; imzo bloki oddiy (`forma3-export.ts:1369,1390`), Руководитель/Главный бухгалтер qatorlari faqat to'liq shaklda (`:960-971`) |
| Nakopitelniy vedomost | `nakopitelniy-vedomost-export.ts` | (a) «С НАЧАЛА СТРОИТЕЛЬСТВА» = oldingi + joriy (hisobot oyi KIRADI) (`:115-117, 229`), F3 to'liq bilan farqli; (b) «с начала года» ustuni yo'q (F3 da bor); (c) `:154` `smeta += q.smeta_summa ?? 0` (narxsiz qator 0 deb jamga, «egasi qoidasi», izoh bilan); `:229-230` `?? 0`; `:158` `r = x => x` — Σ yaxlitlanmaydi (floating, tiyin xatosi mumkin); (d) DB `t2_nakopitelniy_v2`: `oldingi_hajm/joriy_hajm` = `aq.hajm` (certified_quantity ishlatilmaydi), summa esa `certified_amount` — hajm/summa bir xil asosda emas; (e) `baseline_summa` 152 da 2e20 (§3.3) |
| M-29 | `m29/index.ts`, `m29/export.ts` | `index.ts:135` `smetaHajm += r.hajm ?? 0`; norma yo'q bo'lsa `normaOy=0` (diqqat qatori bilan); davr/raqam: «Отчёт №» oy tartib raqami (`export.ts:58-62`) — obyekt/yil bo'yicha oyiga bitta; subpudrat/ma'lumot varaqlari [?: shakl M-29 ga mosligi to'liq tekshirilmadi] |
| AOSR | `aosr-export.ts` | ШНК 3.01.01-22 Прил. 6 shabloni (`:2, :173`); raqam foydalanuvchi kiritadi (avto-raqamlash yo'q), sana mavjud; pul yo'q — jami/QQS masalasi yo'q |
| Slichitelniy | `slichitelniy-vedomost.ts` | `:164-165` `f2Hajm/f2Summa ?? 0` (V-versiya bilan birga `f2SummaV` NULL saqlanadi); smeta hajmi `q.hajm` (`:~162`), nakopitelniy esa `coalesce(zr.v,q.hajm)` — zamena (replacement) qatorlarda farq chiqishi mumkin [?]; imzolar 4 ta rol (`:500`) |
| Akt-sverka | alohida generator YO'Q | faqat 1C sverka IMPORT/tahlil (`lib/sverka-1c/tahlil.ts`, `sverka-import`) va `lrv-res-sverka-export.ts` (resurs sverkasi, boshqa hujjat). «Акт сверки» chiqarish — tekshirilmadi/yo'q |

Qo'shimcha: `hisob-yadro` rasmiy jami formulasi: ITOGO = bo'limlar yig'indisi, podval SUMIF → kaskad → НДС; QQS qatori alohida («НДС 12%») va «ВСЕГО К ОПЛАТЕ (с НДС)», so'z bilan yozilishi `summaSozBilan` orqali — shakl jihatidan to'g'ri.

---------------------------------------------------------------------
## 5. NULL ≠ 0 VA YAXLITLASH
Baza [S] (faol barg rs/mat/ob 87 014):
- Narxsiz va hajmli: 6 094 (7.0%) — `summa IS NULL`; agregatda `narxsiz_soni` bilan belgilanadi, jami = faqat ma'lum qism (to'g'ri, lekin jami «to'liq emas» yorlig'i har ekranda emas).
- `narx = 0`: 7 205 qator (8.3%), hammasi hajmli: МАШ 5 980, МАТ 1 077 (!), mat 29 — 0 va NULL ajratilmaydi; МАТ narx=0 qatorlar summaga 0 bo'lib kiradi, narxsiz deb belgilanmaydi (egasidan so'rash: «заказчик материали» yoki to'ldirilmagan narx).
- `summa ≠ ROUND(hajm×narx,2)`: smetada 390 qator (farq ≤ 1 so'm; 0 ta >1), F2/fakt qatorlarida 31+6+15+10+2 qator (tiyin darajasida) [S].
- Tasdiqlangan F2 aktlari: `hujjat_jami` = qatorlar Σ (49/49, farq 0.00) [S].
Kod [K]:
- `podval.ts:167` `Number(s[h.kat] ?? 0)` — kategoriya summasi yo'q = 0 (qasddan, hujjatlangan), foiz yo'q bo'lsa null.
- SQL `_t2_nakrutka_kaskad_v1` va `_t2_summa_paket_hisob_v1`: `coalesce(foiz,0)` — kalit yo'q bo'lsa foiz 0 deb hisoblanadi (izoh: nk doim to'liq) — TS yadro null qaytaradi; ikki yadro xulq-atvori farqli (P1, hozir 4 obyektda tekshirilgan nk to'liq [S]).
- Hujjatlarda `?? 0` joylari: §4 jadvalida (f2-hujjat.ts:406-413; nakopitelniy-vedomost-export.ts:154,229,230; slichitelniy-vedomost.ts:164-165; m29/index.ts:135; nakopitelniy-svod.ts:41 `tiyin(null)=0`).
- Yaxlitlash tafovuti: F2 vedomost ≤1 so'm «Округление» qatori (§4); F3 da qator yaxlitlash izohi ochiq; nakopitelniyJamilar Σ yaxlitlanmaydi (`:158`).

---------------------------------------------------------------------
## 6. TAKLIF (ustuvorlik bilan)

### Birinchi 5 ta
1. **P0 — 152 dagi «hajm=pul, narx=1» qatorlarni tuzatish va oldini olish.** Fayl/funksiya: ma'lumot (t2_akt_qator id 21899, 36258; akt 328, 399) + import/qol-nomalum yo'li (`narx_manba='qol_nomalum'`, `f2-exact-write.ts`/akt yozuvchi RPC) ga cheklov: `narx=1 AND hajm>1e6` yoki `baseline_narx>1e9` — rad. Tekshiruv: SQL `select count(*) from t2_akt_qator where narx=1 and hajm>1e6` = 0; test: `t2_akt_yarat_v2` ga bunday qator yuborilsa xato; nakopitelniy `baseline_summa` ma'qul diapazonda.
2. **P0 — «smeta» ta'rifini birlashtirish va yorliq qo'yish.** `_t2_summa_agg_v1` (`smeta` vs `smeta_joriy`), nakopitelniy `jami.smeta_summa`, view `t2_obyekt_nakrutka`, `qoshimcha=true AND change_type IS NULL` qatorlar (152: 41 mlrd+). Bitta kanonik «Joriy smeta» va uning «asl (shartnoma) qismi»; har ekranda qaysi ekani yorlig'i. Tekshiruv: 152/153 da rahbar panel = nakopitelniy = obyekt paketi (smeta ustamasiz bir xil), pariter SQL test (`select … where abs(a−b)>0.01` bo'sh).
3. **P0/P1 — jami ko'rsatkichlarni tushuntirish («QQS bilan 48.7 mlrd» kabi).** Hisobot/Jarvis (`mcp__smeta` `f2`/`forma3`/`nakopitelniy` javoblari, `frontend/src/umumiy/ui/SummaJuft.tsx`) har jami yoniga: o'lchov (smeta/smeta_joriy/F2/fakt), davr, obyekt soni, ustamasiz → ustama → ITOGO-4 → QQS 12% → ВСЕГО («qanday hisoblangan» yoyilmasi, `ustama` jsonb allaqachon bor — ko'rsatish yetishmaydi). Tekshiruv: bitta obyekt uchun UI sonlaridan qo'lda zanjirni qayta hisoblash testi (`hisob-yadro.paritet.test.ts` ga yozish).
4. **P1 — takroriy obyektlarni aniqlash/belgilash va kompaniya jamidan chiqarish.** 156/157, 158/159, 163/164/165, 167/168 (smeta jami bir xil, 2.5% kompaniya jami). `t2_rahbar_panel_v1` (`v_ob`), `_t2_summa_paket_jam_v1` — `holat='faol'` filtri + «nusxa» bayrog'i. Tekshiruv: kompaniya jami = takror obyektlarsiz Σ; `select` bilan bir xil smeta hash'li obyektlar ro'yxati.
5. **P1 — F3/nakopitelniy «с начала строительства» ma'nosini yagona qilish.** `forma3-export.ts:297-303,519` va `nakopitelniy-svod.ts:210,225`, `nakopitelniy-vedomost-export.ts:115`. Bitta qoida (Узбекистон КС-3: «с начала проведения работ» hisobot davri bilan) yoki ustun nomida aniq «до отчётного месяца»; nakopitelniyga «с начала года» ustuni. Tekshiruv: bir F2 majmuasi uchun F3 (to'liq) va F3 (qisqa) va nakopitelniy «с начала» ustunlari teng (`forma3-export.hujjat.test.ts` ga paritet test).

### Qolganlari
- **P1** Eski SQL kaskadlarini (`t2_nakrutka_hisob`, `t2_nakrutka_koef`, `hisob_nakrutka`, eski `t2_obyekt_nakrutka(bigint)`) `_t2_nakrutka_kaskad_v1` ga yo'naltirish yoki o'chirish; migratsiya + `reestr` katalogi. Test: funksiya ro'yxatida pul formulasi 1 ta.
- **P1** `_t2_nakrutka_kaskad_v1` / `_t2_summa_paket_hisob_v1` da `coalesce(foiz,0)` → kalit yo'q bo'lsa NULL («noma'lum»), TS yadro bilan bir xil. Test: nk dan bir kalit olib tashlansa natija NULL.
- **P1** `narx=0` (1 077 МАТ qator) NULL emasligini hal qilish: 0 narx = ongli nolmi? `narxsiz` ro'yxatiga olish yoki `narx_usul` bilan belgilash. Test: `select count(*) … narx=0 and kat='МАТ'` o'zgarishi.
- **P1** Fakt: `_t2_fakt_olchov_v1` ga `qoralama`/`tasdiqlangan` ajratish (jami faqat tasdiqlangan yoki «qoralama» yorlig'i) va `versiya_holat` bo'yicha eski qator faktini avtomatik yangi qatorga ko'chirish/ogohlantirish (102 yozuv); kumulyativ kiritish tekshiruvi (376 qator). Test: fakt hajmi Σ ≤ smeta hajmi diqqat bayrog'i.
- **P1** Fakt backfill: tasdiqlangan F2 qatori bor (5 182 qator) lekin faktsiz — «F2 dan fakt taklif qilish» (egasi qoidasi F2 dan fakt chiqarmaslikni talab qiladi: faqat TAKLIF, tasdiq bilan).
- **P1** Ustama manbasi bir xil emasligi (182/282/353 «kompaniya» vs smeta podvali): obyekt kartasida `nk_manba` va склад foizi farqi ogohlantirishi.
- **P2** F2 vedomost «Округление ≤1 so'm» qatori (`f2-hujjat.ts:503-510`): plug o'rniga farq ogohlantirishi; storno `?? 0` (`:406-413`) → null-saqlovchi yig'indi.
- **P2** `nakopitelniyJamilar` (`:158`) va `tiyin()` (`nakopitelniy-svod.ts:41`) — `yaxlit2/yigindi2` yadro funksiyalariga o'tkazish; `tiyin(null)` → null.
- **P2** `t2_nakopitelniy_v2`: `oldingi_hajm/joriy_hajm` uchun `certified_quantity` ni hisobga olish (summa bilan bir asosda).
- **P2** `t2_versiya_xabardorlik_audit_v1()` bo'sh bo'lishi shart — hozir 3 qator (`_t2_kesh_t2_qator_ins/upd/del`) [S]: izoh/ruxsat qo'shish.
- **P2** Hujjat imzo bloklari: F.I.O./lavozim/sana qatori, F2 da Главный бухгалтер; AOSR avto-raqam; akt-sverka generatori (yo'q).
- **P2** `rahbar_panel`: `v_ob` ga `holat='faol'` filtri; portfel kartasida `shartnoma_qqs_bilan` ko'lamini aniq yozish.

---------------------------------------------------------------------
## 7. TEKSHIRILMAGAN
- «≈48,7 mlrd» ning aniq manbasi.
- Jarvis (MCP `smeta`) javob matnining aniq formulasi, UI da fakt kiritish qulayligi (kod/UX), F2 hujjatining rasmiy KS-2 shakli bilan ustunma-ustun muvofiqligi (ustunlar tuzilmasi o'qildi, rasmiy shablon bilan solishtirilmadi), M-29 shakli.
- `t2_obyekt_nakrutka` view tanasining oxirgi qismi (faqat boshi o'qildi), 152 da view smeta_nakrutka nega 47.5 mlrd (asl filtri bilan ziddiyat): qo'shimcha tekshirish kerak.
- Aktlar bo'yicha (alohida akt) paket va F3 oy jami mosligi — faqat 152/153 aktlar ro'yxati.
