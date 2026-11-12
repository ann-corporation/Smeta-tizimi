# DOMEN SHARTNOMALARI - kim nimaga egalik qiladi (bounded contexts)

Holat: QABUL QILINGAN (egasi talabi, 2026-11-12). Muallif: L0 (Claude). Fayllar ko'chirilmaydi, jadvallar qayta nomlanmaydi - faqat EGALIK e'lon qilinadi va avtomatik majburlanadi.
Mashina o'qiydigan reestr: `frontend/src/lib/reestr/domen.ts`. Jonli katalog nusxasi (faqat nomlar): `domen-katalog.snapshot.json` (2026-11-12: 401 jadval/ko'rinish, 1178 funksiya).
Qo'riqchi testlar: `frontend/src/lib/reestr/domen.arxitektura.test.ts` (vitest, DB kerak emas, ~1 s). Sahifa/menyu reestri (`reestr/sahifa.ts`) navigatsiyani tartiblaydi; BU hujjat esa MA'LUMOT egaligini tartiblaydi.

## 1. Nega kerak
Ikki kunda ~15 parallel agent yangi modullar qo'shdi. Har biri raqamni (summa, qoldiq, fakt, ruxsat) o'zicha qayta hisobladi va o'xshash mexanizm yaratdi. Endi har obyekt AYNAN BITTA domenga tegishli; boshqa domen faktini faqat uning NOMLI funksiyasi orqali o'qiydi; yozish - faqat egasi orqali.

## 2. Domenlar (jonli katalog bo'yicha, jadval+ko'rinish / funksiya)
| Domen | Obyekt | Nima uchun javob beradi |
|---|---|---|
| smeta | 84 / 218 | asl smeta qatorlari, versiya, podval/nakrutka, norma, narx manbasi, SUMMA YADROSI |
| ijro | 48 / 156 | fakt, F2 akt, Forma 3, nakopitelniy, AOSR, laboratoriya, chizma, nazorat, subpudrat akti |
| platforma | 53 / 180 | kompaniya, a'zolik, rol/capability, audit, outbox, signal, token, obuna, telegram, desktop |
| moliya | 33 / 106 | shartnoma, to'lov, xarajat, provodka (bux), qarz, 1C sverka, F2 reestr summasi (signal) |
| tomonlar | 19 / 89 | aloqa, grant, taqdim, murojaat, xat, topshiriq, ish joyi, tomon kabinetlari |
| logistika | 26 / 81 | yuk berish (yb), park, reys, tarif, yo'l puli |
| ai | 28 / 69 | Jarvis: agent, buyruq, harakat, xotira, kasb, byudjet |
| loyiha | 18 / 56 | obyekt, loyiha, ishtirokchi, hudud, mindmap xaritasi, yakunlash |
| hujjat | 22 / 54 | registry, R2 kanonik, papka/fayl, arxiv, hujjat zanjiri |
| tender | 3 / 45 | tender, raund, baholash, ochiq lot |
| bozor | 15 / 36 | e'lon, taklif, yuk birjasi (RFQ), mutaxassis, baho/reyting |
| resurs | 23 / 34 | buyurtma, sklad, M-29, texnika, viborka |
| kadr | 18 / 32 | xodim, tabel, oylik, KPI, naryad |
| sotuv | 11 / 22 | uy sotish: birlik, bron, bitim, grafik (qurilish puli bilan ARALASHMAYDI) |
Jami 1579 obyekt. Prefiks qoidasi bilan 1507 tasi, 72 tasi `ISTISNO` (aniq nom) bilan egalandi; egasi aniq bo'lmagani 2 ta (`t2_tmp_eq_lot1` vaqtinchalik jadval, `t2_sinov_bonus`) - `noaniq` belgisi bilan.
"Bozor / Tender / Logistika" - bitta oila, lekin uch domen (uch alohida jadval oilasi va capability).
Eslatma: `t2_token_*` (token daftari) PLATFORMA da: sarfni hujjat va AI chaqiradi (`t2_token_sarfla_v1`), daftar esa bitta.

## 3. Har domen: egalik, o'qish, invariant
**Loyiha/Obyekt** - egasi: obyekt/loyiha, ishtirokchi, hudud, tuzilma. O'qiydi: smeta jamisi (`_t2_summa_paket_v1`), moliya ko'rsatkichi (`t2_object_financials_v1`). Invariant: obyekt kompaniyasiz bo'lmaydi (tenant); mindmap faqat nomli amal bilan bog'laydi.
**Smeta** - egasi: `t2_qator` (asl satr), `t2_smeta_versiya*`, `t2_nakrutka*`, narx manbasi, normativ, summa yadrosi. O'qiydi: hech kimdan (ijro faktini o'qimaydi). Invariantlar: (1) ASL SMETA CONST - asl qator o'zgarmaydi, fakt/F2/o'zgarish alohida qatlam; (2) narx doim QQS siz; (3) summa tartibi: avval QQS BILAN, so'ng USTAMALI, so'ng ustamasiz - FAQAT yadro orqali; (4) nakrutka foizi faqat smeta podvalidan (shartnomadan ustun); (5) joriy smeta = `versiya_holat='faol'` (AGENTS 2c); (6) NULL != 0.
**Ijro** - egasi: akt, fakt, F2, Forma 3, nakopitelniy, AOSR, lab, chizma, subpudrat akti. O'qiydi: smeta qatori (`_t2_smeta_qatlam_qator_v1`, `t2_qator_asl_v1`). Invariantlar: (1) bitta ish - bitta fakt (`_t2_qator_holat_v2`); (2) tasdiqlangan F2 MUZLAGAN va qatorma-qator ishorasi bilan aynan ko'chiriladi; (3) F2 = nakopitelniy = F3 zanjiri; (4) fakt>=F2 YO'Q: F2 bor qatorda fakt summasi F2 narxida; (5) F2 summasi import qilingan F2 qatorlaridan, qo'lda reestr faqat signal.
**Resurs** - egasi: buyurtma, zayavka, sklad harakati, M-29, texnika. O'qiydi: smeta hajmi (viborka), ijro fakti (sklad chiqimi trigger orqali). Invariant: qoldiq = harakatlardan hosila (`t2_sklad_ombor_qoldiq_v1`); smetasiz sklad yozuvi `t2_bez_sklad_qoida` bilan.
**Moliya/Buxgalteriya** - egasi: shartnoma, to'lov, xarajat, provodka, qarz, kontragent. O'qiydi: summalar (smeta yadrosidan), F2 summasi (ijrodan). Invariantlar: provodka o'zgarmas (storno bilan); qarz summasi to'lov va aktdan hosila; 1C "Prodaja" != F2 - solishtirish signali.
**Kadr** - egasi: xodim, tabel, KPI, oylik, naryad. O'qiydi: smeta narxi (`_t2_naryad_narx_smeta`). Buxgalteriyaga FAQAT `t2_hr_oylik_buxgalteriya_v1` orqali o'tadi. Invariant: PII alohida (`t2_hr_xodim_pii`).
**Tomonlar** - egasi: `t2_tomon_aloqa`, grant, taqdim, murojaat, xat, ish joyi. Invariant: kompaniyalararo ko'rinish FAQAT aloqa+grant (`t2_tomon_ruxsat_bor`); taqdim R2 snapshot+sha256; kabinet = o'sha sahifa begona `aloqa_id` bilan.
**Hujjat** - egasi: registry, R2 kanonik, papka, arxiv, hujjat zanjiri. Invariant: kanonik = R2, Drive faqat replika; hujjat dvigateli natijasi token yechadi (`t2_token_sarfla_v1`), qayta yuklash takror yechmaydi.
**Bozor / Tender / Logistika** - ochiq bozor, tender va yuk berish: o'z jadval oilalari; obyektga faqat `obyekt_id` bilan bog'lanadi. Invariant: g'olib tanlash tomon aloqasini yaratadi (`t2_tomon_aloqa` ga yozish - nomli funksiya bilan). Logistika xarajatni obyektga faqat `t2_tr_xarajat_otkaz_v1` bilan o'tkazadi.
**Uy sotish** - alohida pul: qurilish smetasi/F2 bilan aralashmaydi, o'z capability (`sales.*`).
**Platforma** - egasi: kompaniya, a'zolik, `t2_role_permissions_v2`, audit, outbox, signal, token daftari. Invariantlar: har yozuvda tenant (`kompaniya_id`) va actor; har yozish `operation_id` bilan idempotent; rol imkoniyati YAGONA manbada; audit/outbox/signalga yozish faqat nomli funksiya (`t2_audit_yoz`, `t2_outbox_yoz`, `t2_signal_emit`).
**AI (Jarvis)** - egasi: agent jadvallari. Invariant: AI hech qachon jadvalga to'g'ridan-to'g'ri yozmaydi - faqat nomli amal (reestr `Amal`), yozuvchi amalda dry_run majburiy; har yangi funksiya AI tool'iga ham qo'shiladi.

## 4. Yagona haqiqat manbalari (authoritative read functions)
Raqamni boshqa joyda QAYTA HISOBLAMANG - mana bu funksiyani o'qing (`domen.ts` -> `OTORITET`, test mavjudligini va egasini tekshiradi):
- summalar (ustamali/ustamasiz/QQS): `_t2_summa_paket_v1`, yig'indi `_t2_summa_agg_v1`; frontendda `lib/hisob-yadro`
- nakrutka: `t2_nakrutka_podval_smeta_nk_v1`, kaskad `_t2_kaskad_yakun_v1`
- narx tanlash: `t2_price_basis_resolve_v1` (F2 narxi = max(smeta, xarid), QQS siz)
- rol imkoniyatlari: `t2_role_permissions_v2`; samarali ruxsat `t2_effective_authorization_v1`; RPC ichida `t2_require_permission_v2`
- a'zolik/tenant: `t2_actor_kompaniya_azo_tekshir`
- fakt (qator bo'yicha): `_t2_qator_holat_v2`; F2 paket `_t2_f2_akt_paket_v1`; nakopitelniy `t2_nakopitelniy_v2`; Forma 3 `t2_forma3_yarat_v1`
- tomon ko'rinishi: `t2_tomon_ruxsat_bor`; hujjat: `t2_document_registry_v1`; token: `t2_token_sarfla_v1`
- oylik: `_t2_hr_hisob_v1`; jurnal: `t2_bux_jurnal_v1`; qoldiq: `t2_sklad_ombor_qoldiq_v1`; signal/outbox/audit: `t2_signal_emit` / `t2_outbox_yoz` / `t2_audit_yoz`

## 5. Kontekst xaritasi (kim kimga bog'liq)
Yo'nalish: A -> B = "A, B ning nomli funksiyasini O'QIYDI".
```
platforma  <- hamma (tenant, rol, audit, signal, token)       [hamma -> platforma: ruxsat etilgan]
loyiha  -> smeta (jamisi)          moliya -> smeta (summa), ijro (F2 summa)
ijro    -> smeta (qator)           resurs -> smeta (hajm), ijro (fakt)
kadr    -> smeta (narx), moliya (faqat bux_ funksiyasi bilan yozadi)
tomonlar-> ijro/moliya/hujjat (taqdim: o'qiydi, qaror = nomli funksiya)
hujjat  -> hamma (faqat hujjat ko'rsatkichi); bozor/tender/logistika -> tomonlar (aloqa), obyekt_id
ai      -> hamma (faqat Amal reestri orqali)
```
TAQIQLANGAN yo'nalishlar: (1) smeta -> ijro/moliya (smeta faktni bilmaydi: asl smeta const); (2) ijro/hujjat/tomonlar -> smeta jadvaliga YOZISH; (3) har qanday domen -> boshqa domen jadvaliga to'g'ridan INSERT/UPDATE/DELETE (ruxsat etilgan "chiqish quvurlari": audit, outbox, signal, token daftari, command_log); (4) sotuv <-> qurilish moliyasi; (5) AI -> jadval; (6) tomonlar -> boshqa kompaniya ma'lumoti grantsiz.

## 6. Nima avtomatik majburlanadi (testlar)
a) har jadval va funksiya egasiga ega (yangi obyekt egasiz -> yiqiladi); b) boshqa domen jadvaliga yozish: bugungi 100 ta juft MEROS ro'yxatida (sababi bilan, `domen-meros.json`), YANGISI yiqitadi; c) pul/QQS arifmetikasi (`1.12`, `*0.12`, `round(pul,2)`) yadrodan tashqarida: bugungi 49 funksiya meros, yangisi yiqitadi; d) `when 'rol' then array[` ikkinchi ruxsat manbasi: bugungi 2 ta meros, yangisi yiqitadi; e) sb-yoz amali: capability majburiy (0 buzilish), RPC da `operation_id` majburiy (38 ta meros); f) o'xshash mexanizmlar - ogohlantirish (7-bo'lim). Meros ro'yxati faqat KAMAYADI (test chegarasi oshmaydi).
Yiqilgan testning xabari nima qilishni aytadi. Istisno kerak bo'lsa: sabab + egasi tasdig'i, so'ng `node frontend/scripts/domen-meros-yigish.mjs` va test `CHEGARA` qiymatini PR da asoslab o'zgartirish.

## 7. O'xshash mexanizmlar (ogohlantirish) - qaysi biri KANONIK
| Tushuncha | Mavjud | Kanonik va tavsiya |
|---|---|---|
| Baho/reyting | `t2_baho`, `t2_reyting_baho`, `t2_yb_baho`, `t2_tender_baho` | `t2_reyting_baho`; yangi baho jadvali yaratilmaydi |
| Xodimlar | `t2_hr_xodim`, `t2_kadr_mustaqil`, `t2_kadr_bog`, `t2_erp_kadr`, `t2_azolik` | `t2_hr_xodim` (ish haqi/tabel); kirish huquqi `t2_azolik`; qolgani ko'rinishga |
| Texnika/mashina | `t2_tr_mashina`, `t2_yb_mashina`, `t2_texnika_*`, `t2_erp_texnika` | park = `t2_tr_mashina`; `t2_texnika_*` eski |
| Haydovchi | `t2_tr_haydovchi`, `t2_yb_haydovchi` | birlashtirish (rol ustuni) |
| Akt | `t2_akt`, `t2_sub_akt`, `t2_akt_podval`, `t2_lab_protokol`, `t2_aosr` | pul akti = `t2_akt`; sub_akt - qoralama; AOSR/lab - pul emas |
| Narx manbasi | `t2_narx_manba(+qator)`, `t2_price_basis(+line)`, `t2_platforma_narx_manba`, `t2_narx_dalil` | tanlov = `t2_price_basis_resolve_v1`; yangi mexanizm yaratilmaydi |
| Jurnal/audit | `t2_audit_log`, `t2_*_hodisa`, `t2_tender_jurnal`, `t2_agent_jurnal` | biznes jurnali domenda (append-only), audit = `t2_audit_log` |
| To'lov | `t2_tolov`, `t2_tomon_tolov`, `t2_yb_tolov`, `t2_sotuv_tolov`, `t2_bux_*` | shartnoma to'lovi `t2_tolov`; boshqalari o'z domenida, buxgalteriyaga `bux_*` orqali |
| Sklad | `t2_sklad_harakat`, `t2_sklad_qoldiq`, `t2_sklad_mustaqil`, `t2_sklad_bog` | qoldiq harakatdan hosila |
| Foto/dalil | `t2_foto_dalil`, `t2_aosr_foto`, `t2_narx_dalil`, `t2_yb_dalil` | fayl bitta (R2 registry), jadvallar faqat bog'lanish |
To'liq ro'yxat: `domen.ts` -> `OXSHASHLAR` (test jadval mavjudligini tekshiradi; yangi kandidatlar test chiqishida ogohlantirish sifatida chiqadi).

## 8. Eng muhim 10 bugungi buzilish/takror (pul to'g'riligi xavfi bo'yicha). TUZATILMAGAN - alohida PR.
1. Zaxira/vaqtinchalik jadvallar prodda: `t2_qator_kat_bak_20261024`..`f` (6 ta), `t2_qator_zaxira_suniy_kol_84`, `t2_tmp_eq_lot1`, `t2_document_registry_f2slot_bak` - eski qator/summa nusxalari ikkinchi "haqiqat"ga aylanadi. Tuzatish: R2 ga arxivlab, egasi ruxsati bilan DROP.
2. Pul/QQS arifmetikasi yadrodan tashqarida 49 funksiyada; xavflisi: `t2_nakopitelniy_v2`, `t2_forma3_yarat_v1`, `_t2_qator_holat_v2` (ijro) va `t2_object_financials_v1` (moliya) - bir xil yig'indi ikki joyda. Tuzatish: `_t2_summa_agg_v1` natijasini o'qish; meros ro'yxati qisqaradi.
3. `t2_transport_ol_v1` (logistika) QQS ni `1 + qqs/100` bilan o'zi hisoblaydi. Tuzatish: qqsli summani yadro funksiyasidan olish.
4. `_t2_forma3_f2_bog` (ijro) moliyaning `t2_f2_reestr_jami` (qo'lda reestr, "signal, manba emas") jadvaliga yozadi - F2 summasi manbasi ikkilanadi. Tuzatish: faqat `t2_f2_reestr_yoz_v1` yozsin; F3 yig'indini F2 qatorlaridan olsin.
5. Bir necha jonli versiya: `t2_nakopitelniy_v1/v2/v2_eski`, `t2_pul_tahlil_v1/v2(+_eski)`, `t2_almashtirilgan_hajm(_eski)`, `t2_smeta_narxla_res_v1/v2/v3`, `t2_akt_yarat/_v2` - eskisi chaqirilsa eski formula. Tuzatish: shlyuzda faqat oxirgisi, eskilariga REVOKE keyin DROP.
6. `t2_buyurtma_qabul_yakunla_v1` (resurs) moliyaning `t2_qarz_asos` jadvaliga o'zi yozadi (+o'z `round`). Tuzatish: moliya domenining nomli funksiyasi (`t2_qarzdorlik_saqla_v1` tipida) orqali.
7. 38 yozish amalida `operation_id` yo'q (`shartnoma_saqla`, `shartnoma_ochir`, `narx_belgila`, `narx_manba_bekor`, `sotuv_tolov_bekor_v1`, `loyiha_yarat`, `qator_tahrir`...): takror yuborish ikki yozuv. Tuzatish: `p_operation_id` + command_log; birinchi navbat shartnoma/narx/to'lov amallari.
8. `t2_effective_authorization_v1` ichida hali `when 'superadmin' then array['control.global.*']` qattiq platforma ro'yxati bor (boshqa rollar main da katalogga o'tgan: `t2_role_permissions_v2`). Tuzatish: control.global.* ham katalogdan o'qilsin.
9. Uchta parallel resurs jadvali `t2_kadr_mustaqil`, `t2_sklad_mustaqil`, `t2_texnika_mustaqil` (`t2_resurs_yarat_v2` hammasiga yozadi) - xodim/qoldiq/mashina `t2_hr_xodim`, `t2_sklad_harakat`, `t2_tr_mashina` bilan uchlanadi. Tuzatish: kanonik jadvalga ko'rinish.
10. `t2_tender_elon_v1` (tender) yuk birjasining `t2_birja_rfq*` jadvallariga yozadi (24 yozish) va 4 baho jadvali (`t2_baho/reyting_baho/yb_baho/tender_baho`) - ikki e'lon va to'rt reyting mexanizmi. Tuzatish: bitta e'lon va bitta reyting jadvali (tur ustuni).

## 9. Yangi narsa qo'shish qoidasi
12 qatorlik ro'yxat `AGENTS.md` ning 6-bo'limida; PR tavsifida to'ldirilishi shart.
