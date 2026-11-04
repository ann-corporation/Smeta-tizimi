# HR + KPI v1 — kadrlar, KPI, tabel, ish haqi (qoralama)

Holat: MVP v1, egasi ko'rib chiqishi uchun. Migratsiyalar QO'LLANMAGAN (egasi qo'llaydi). Prod faqat o'qilgan.

## 0. Nima bor edi (kengaytiriladi, dublikat yo'q)

| Mavjud | Qaror |
| --- | --- |
| `t2_kadr_mustaqil` (kompaniya xodimi: ism_sharif, lavozim, oylik_maosh, `foydalanuvchi_id`) | Kanonik xodim. Yangi `t2_hr_xodim` shu jadvalga 1:1 (`kadr_id`) HR maydonlarini qo'shadi. |
| `t2_kadr_bog` (kadr <-> obyekt, mindmap yaratadi) | Kengaytiriladi: `ulush_foiz`, `rol`, `dan`, `gacha` ustunlari (mavjud qatorlar `ulush_foiz=100`). Mindmap yo'li o'zgarmaydi. |
| `t2_erp_kadr` (eski ERP, `tizim02`) | Tegilmaydi (test02 sahifasi). Yangi modul uni ishlatmaydi. |
| `ErpKadrlar.tsx` tabeli (GAS/Sheets, kun bo'yicha keldi/kelmadi/kasal) | Eski, T2 bazada emas. Qoladi; yangi tabel T2 bazada (`t2_hr_tabel`) va ish haqining manbai. Eski sahifaga «Yangi HR» havolasi. |
| Ruxsatlar `hr.read/write`, `hr.pii.read/write`, `hr.tabel.write`, `payroll.read/write` | F1 (`20261108010000`) da katalog va rollarga bog'langan; shu ruxsatlar ishlatiladi, yangisi qo'shilmaydi. |
| `t2_akt` (+`lifecycle_*`, `t2_akt_qator`, `t2_akt_podval`), `t2_azolik`, `t2_foydalanuvchi`, `t2_erp_sifat`, `t2_tolov`, `t2_xarajat` | Faqat o'qiladi (F2 hajmi/summasi, sifat nazorati havolasi). |
| `t2_mutaxassis_profil` / `t2_shaxs_yonalish` | Ommaviy kasb profili; HR ga aralashmaydi. |

## 1. Obyektlar (jadvallar — ixcham, har biri RLS yoqilgan, anon/authenticated yopiq)

- `t2_hr_xodim` (PK `kadr_id`): `rol` (prorab/brigadir/usta/ishchi/muhandis/boshqa), `grafik` (5|6), `baza_turi` (oylik|kunlik), `baza_summa` (NULL = noma'lum), `sxema_id`, `qabul_sana`, `bosh_sana`.
- `t2_hr_xodim_pii` (PK `kadr_id`): PINFL, pasport, telefon, manzil. Faqat `hr.pii.read` / `hr.pii.write`.
- `t2_hr_sxema`: KPI sxemasi (kompaniya bo'yicha sozlanadi): `f2_foiz`, `f2_baza` (ustamasiz|ustamali), `f2_rejim` (obyekt|muallif).
- `t2_hr_sozlama` (PK kompaniya): `ndfl_foiz`, `inps_foiz`, `kun_soat`. NULL = kiritilmagan (kodda qattiq stavka YO'Q).
- `t2_hr_kalendar`: kompaniya kalendarining istisnolari: `bayram` | `dam` (qo'shimcha/ko'chirilgan dam) | `ish` (ko'chirilgan ish kuni). O'zbekiston bayramlari — tahrirlanadigan MA'LUMOT (`frontend/src/lib/hr/bayram-uz.json`), «Standart bayramlarni qo'shish» tugmasi kompaniya kalendariga yozadi; Hayit va ko'chirishlar har yil qarori bilan qo'lda kiritiladi.
- `t2_hr_tatil`: otpusk / otgul / kasal rejalashtiruvchisi (`dan`..`gacha`, holat reja|tasdiqlangan|bekor).
- `t2_hr_tabel` (PK `kadr_id, oy`): oy uchun `kunlar` jsonb `{"1":"K","2":"K",...}`; belgilar K=keldi, N=kelmadi, O=otpusk, B=kasal, D=otgul. Bir xodim-oy = bir qator (ixcham).
- `t2_hr_tuzatma`: jarima va qo'lda bonus bitta jadvalda (`tur`), sabab (nuqson/kechikish/xavfsizlik/boshqa/rag'bat), `summa` YOKI `foiz` (bazadan), ixtiyoriy `obyekt_id`, `akt_id`, `sifat_id` (-> `t2_erp_sifat`), `fayl_id` (dalil: mavjud R2 hujjat yo'li, DB da fayl YO'Q), holat qoralama|tasdiqlangan|rad|bekor.
- `t2_hr_oylik` (UNIQUE `kadr_id, oy`): oylik qoralama/tasdiq tasviri + `tafsilot` jsonb (akt bo'yicha taqsimot, ishlatilgan stavkalar, ogohlantirishlar) + buxgalteriya ilgagi (`provodka_holat`, `provodka_id`).

Supabase limiti (421/500 MB) uchun: tabel oyiga bitta jsonb qator; fayllar R2 da; `t2_hr_oylik` har xodim-oy bitta qator (qayta hisoblash ustiga yoziladi).

## 2. Oqimlar

1. **Xodim kartasi**: HR (`hr.write`) xodimni yaratadi/tahrirlaydi (rol, grafik, baza, obyektlar+ulush, sxema). PII bloki alohida (`hr.pii.write`); `hr.pii.read`siz ro'yxatda PII yo'q (`pii_yopiq=true`). Maosh bazasi faqat `payroll.read` / `hr.write` ko'radi.
2. **Kalendar va tatil**: kalendar kunlari (istisnolar) + tatil rejasi (`hr.write`); oylik norma (kun, soat) 5 va 6 kunlik grafik uchun serverda hisoblanadi.
3. **Tabel**: `hr.tabel.write` (prorab/brigadir ham) oy bo'yicha belgilaydi; tasdiqlangan tatil kunlari taklif sifatida to'ldiriladi (saqlanmaguncha yozilmaydi); «tasdiqlash» `hr.write`.
4. **Jarima/bonus**: `hr.tabel.write` yoki `hr.write` qoralama yaratadi; **tasdiqlash/rad** faqat `payroll.write` (yaratgan o'zi tasdiqlay olmaydi — admin/boss/superadmin bundan mustasno). Tasdiqlanmaganlar hisobga kirmaydi, faqat ogohlantirish.
5. **KPI + ish haqi qoralamasi**: `payroll.write` «Hisoblash» (server `_t2_hr_hisob_v1`) -> `t2_hr_oylik` qoralama; «Tasdiqlash» faqat to'liq (noma'lum qismsiz) hisob uchun; «Qaytarish» qoralamaga. Excel vedomost `hujjatTokenBilan` orqali.
6. **Panel** (`payroll.read`): xodimlar reytingi (hisoblangan KPI, bonus vs jarima, F2 hajmi), jamilar.
7. **Buxgalteriya ilgagi**: `t2_hr_oylik_buxgalteriya_v1(kompaniya, actor, oy)` — tasdiqlangan qatorlarni barqaror shaklda beradi (`kadr_id, hisoblangan, ndfl, inps, sof`); provodka yozuvini buxgalteriya moduli o'zi yaratadi va `provodka_holat/provodka_id` ni yangilaydi (v1 da yo'q).

## 3. Formulalar (yagona manba — SQL `_t2_hr_hisob_v1`; pul `round(x,2)` = frontend `yaxlit2` bilan bir xil yarim-noldan-uzoq qoida; NULL != 0)

- Kun turi: istisno bo'lsa shu; aks holda 5 kunlik: Du-Ju ish; 6 kunlik: Du-Sh ish; yakshanba (va 5 kunlikda shanba) dam. `norma_kun(g)` = ish kunlari soni; `norma_soat = norma_kun * kun_soat`.
- `kun_ishlagan` = tabeldagi `K` soni. Tabel yo'q -> `kun_ishlagan = NULL` -> baza NULL (0 emas).
- Baza: kunlik: `stavka * kun_ishlagan`; oylik: `oklad * kun_ishlagan / norma_kun`. Stavka NULL yoki `norma_kun=0` -> NULL.
- F2 KPI: har tasdiqlangan F2 akt (`tur='f2'`, `holat in (tasdiqlangan, yakunlangan)`, `lifecycle_status='approved'`, tasdiq sanasi `lifecycle_approved_at` (Toshkent kuni) oy ichida) uchun
  `akt_kpi = akt_summa * f2_foiz/100 * ulush/100`.
  - `akt_summa`: `ustamasiz` = `sum(summa)` (`t2_akt_qator`; birorta qator summasi NULL bo'lsa butun summa NULL); `ustamali` = `t2_akt_podval.itogo4` yig'indisi, yo'q bo'lsa `t2_akt.hujjat_jami` (manba aktda ko'rsatiladi). Tanlangan baza NULL bo'lsa akt chetda qoladi va ogohlantiriladi (0 deb olinmaydi).
  - Bog'lash `f2_rejim`: `obyekt` — xodim shu obyektga `t2_kadr_bog` orqali biriktirilgan (`dan..gacha` tasdiq sanasini qoplasa), ulush `ulush_foiz`; `muallif` — `t2_akt.kim = 'actor:' || foydalanuvchi_id`, ulush 100.
  - Aktlar bo'lmasa KPI = 0 (ma'lum nol); aktlar bor-u hammasi summasiz bo'lsa KPI = NULL.
- Bonus (qo'lda) = tasdiqlangan `tur='bonus'`: `summa` yoki `baza * foiz/100`. Jarima shunga o'xshash. Foiz bazasi NULL bo'lsa miqdor NULL (noma'lum).
- `hisoblangan = baza + kpi + bonus - jarima` (baza NULL -> NULL; kpi NULL bo'lsa `toliq=false`, hisob mavjud qismlardan, tasdiqlab bo'lmaydi).
- Ushlanmalar: soliq bazasi `S = max(hisoblangan,0)`; `ndfl = round(S*ndfl_foiz/100,2)`, `inps = round(S*inps_foiz/100,2)` — stavka NULL bo'lsa NULL va sof NULL; `sof = hisoblangan - ndfl - inps`.
- Otpusk/kasal to'lovlari v1 da hisoblanmaydi (tabelda faqat sanaladi); keyingi bosqich.

## 4. Ruxsatlar (RPC ichida tekshiriladi; BFF reyestri qo'shimcha eshik)

| Amal | Ruxsat |
| --- | --- |
| ro'yxat/oy o'qish | `hr.read` (maosh: `payroll.read`/`hr.write`; PII: `hr.pii.read`) |
| xodim saqlash | `hr.write` (+PII `hr.pii.write`) |
| sxema/stavkalar | `payroll.write` |
| kalendar/tatil | `hr.write` |
| tabel | `hr.tabel.write` (tasdiqlash `hr.write`) |
| jarima/bonus yaratish | `hr.tabel.write` yoki `hr.write`; qaror `payroll.write` |
| KPI/ish haqi o'qish | `payroll.read` |
| hisoblash/tasdiqlash | `payroll.write` |

Barcha RPC: `security definer`, `set search_path`, a'zolik tekshiruvi, faqat `service_role` ga grant, audit `t2_audit_yoz` (4-argument `obyekt_id` yoki NULL), yozuvlarda `operation_id` idempotentligi.

## 5. Migratsiyalar (qo'llash tartibi) va qabul

1. `20261125000000_t2_hr_kpi_asos_v1` — jadvallar, `t2_kadr_bog` kengaytmasi.
2. `20261125000100_t2_hr_kpi_rpc_v1` — RPC lar.

Har biri `.rollback.sql` va `.acceptance.sql` (sintetik fixture; `BEGIN..ROLLBACK`) bilan. Frontend: `/admin/hr` sahifasi (Xodimlar, Kalendar, Tabel, Jarima/Bonus, KPI va ish haqi, Sozlamalar), ru/en i18n, «Nima yangi» yozuvi.

## 6. Keyingi bosqichlar

Otpusk/kasal haqi, qo'shimcha soat/tungi koeffitsient, ish haqi uchun ommaviy tasdiq oqimi, buxgalteriya provodkasi, jarimaga dalil faylini yuklash UI (mavjud fayl yo'lidan), eski GAS tabelidan import.

## 7. Bulutli reja bilan farqlar (`docs/architecture/cloud-rejalar/HR_KPI_BUXGALTERIYA.md`)

Shu hujjatdan olindi: mavjud kadr jadvallari (`t2_kadr_mustaqil`, `t2_kadr_bog`) ustiga qurish, `hr.*`/`payroll.*` ruxsatlari, PII ni alohida ruxsat bilan yopish, bonus/jarima oylik hisobiga QATOR bo'lib tushishi, yopilgan davr o'zgarmasligi (tuzatish keyin), «noma'lum = 0 emas», har summa asosi (aktlar bo'yicha taqsimot) ko'rinishi, soliq stavkalari kodda emas.

Farqlar (v1 qasddan tor):
- **KPI**: reja — qoida konstruktori (rol -> ko'rsatkich -> og'irlik -> maqsad). v1 — bitta aniq sxema: tasdiqlangan F2 summasining X% i (+ qo'lda bonus/jarima). Konstruktor keyingi bosqich.
- **Oylik jadvallari**: reja — `t2_payroll_davr/varaqa/qator/hujjat`. v1 — bitta `t2_hr_oylik` (xodim-oy) + `tafsilot` jsonb (akt va jarima taqsimoti); Supabase hajmi (421/500 MB) uchun ixcham.
- **Tabel**: reja — grafik, ortiqcha soat, ta'til arizalari. v1 — oy bo'yicha bitta jsonb qator (K/N/O/B/D), tatil rejalashtiruvchisi; ortiqcha soat, tungi koeffitsient, ta'til/kasallik haqi keyinga.
- **Soliqlar**: reja — sanalik versiyali `t2_hr_soliq_sozlama` va ijtimoiy soliq. v1 — kompaniya bo'yicha bitta qator (`t2_hr_sozlama`: NDFL, INPS); sanalik versiya va ish beruvchi ijtimoiy badali yo'q [T: buxgalter tasdig'i].
- **Jarima oqimi**: reja — taklif -> komissiya -> apellyatsiya. v1 — qoralama -> `payroll.write` egasi tasdiqlaydi/rad etadi (o'z yozuvini tasdiqlamaydi).
- **Ruxsat**: v1 yangi ruxsat qo'shmaydi (F1 katalogidagilar yetadi).
- **Buxgalteriya**: BU hujjat doirasida emas (buxgalteriya agenti). Ilgak: `t2_hr_oylik_buxgalteriya_v1` va `provodka_holat/provodka_id`; hisob kodlari va provodka sxemasi buxgalteriya modulida.