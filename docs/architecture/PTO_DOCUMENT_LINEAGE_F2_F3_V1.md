# PTO hujjatlar lineage'i — F2/F3 V1

Status: SOURCE-READY, productionga qo'llanmagan.

## Maqsad

F2, Nakopitelniy va F3 eksportlari bir xil canonical doirada qolishini
fail-closed tekshirish:

`company → project → object → contract → period → approved F2 rows`

Hujjat nomi, fayl nomi, sheet nomi yoki ko'rinadigan qator tartibi identity
emas. Identity mavjud `kompaniya_id`, `loyiha_id`, `obyekt_id`,
`shartnoma_id`, `akt_id` va `qator_id` orqali keladi.

## Hozirgi canonical manbalar

- `t2_nakopitelniy_v2` — obyekt/project va F2 davrlari read modeli.
- `t2_f2_tafsilot` — tasdiqlangan F2 qatorlari va exact `summa`.
- `t2_shartnoma` — kompaniya/project contract truth.
- `t2_shartnoma_bog` — object ↔ contract explicit active relation.
- `t2_forma3` — Forma-3 period container; legal/payment/tax formula hali
  `FORMA3_RULE_UNRESOLVED` doirasida.

## Runtime gate

`frontend/src/lib/pto-document-lineage/index.ts` quyidagilarni tekshiradi:

1. Barcha canonical ID lar musbat, xavfsiz integer.
2. Davr `YYYY-MM` formatida.
3. Project/object/contract company va project parentlari mos.
4. Object ↔ contract relation mavjud bo'lishi shart.
5. F3 faqat tasdiqlangan F2 manbalarini oladi.
6. F3 source davri hisobot davridan keyingi bo'lishi mumkin emas; oldingi
   tasdiqlangan davrlar cumulative uchun ruxsat.
7. Bitta `(object, period, qator_id)` manbalar orasida ikki marta kelmaydi.
8. F2 source hujjat ID si va `qator_id` si noma'lum bo'lsa export bloklanadi.

## Export oqimi

`NakopitelniyVedomost.tsx` obyektning active contract relation'ini oladi,
company/project/object/contract scope yaratadi va shu scope'ni
`forma3Hujjat(..., { lineage, lineageRequired: true })` ga beradi. F3
manbalari `t2_f2_tafsilot`dagi `akt_id`, davr va `qator_id` bilan quriladi.
Nakopitelniy va F2 exportlari ham shu scope gate'dan o'tadi.

`forma3-export.ts`ga lineage majburiy berilgan real UI oqimida scope
tekshirilmay turib workbook ishlab chiqarilmaydi. Eski unit fixturelar
backward-compatible qoladi, chunki ular export primitive'ini alohida testlaydi.

## DB guard

`20261102100000_t2_forma3_lineage_guard_v1.sql` additive trigger function
yaratadi. `t2_forma3` mavjud bo'lsa, insert/update paytida company/project,
object/project, contract/company/project va object-contract active relation
nomuvofiqligini rad etadi. Rollback faqat trigger va yangi functionni olib
tashlaydi; mavjud hujjatlarni o'chirmaydi.

Migratsiya source-only. Production apply va live acceptance bu taskda
bajarilmaydi.

## Qasddan kiritilmagan narsalar

- Yangi F2/Nakopitelniy/F3 business truth yoki jadval yaratilmaydi.
- F2 import parser/matcher o'zgartirilmaydi; u `F2-IMPORT-V3-001` faol
  lane'ining owns pathidir.
- Forma-3ning qonuniy jami, soliq, to'lov yoki payment-due formulasi
  uydirilmaydi. Buning uchun verified country/contract rule pack kerak.
- AI canonical match, narx yoki hujjat relationship'ini tasdiqlamaydi.

## Tekshiruv chegarasi

### PTO line ledger semantikasi

`frontend/src/lib/pto-document-lineage/ledger.ts` client-side projection layeri
quyidagi qiymatlarni alohida saqlaydi va `NULL`ni nolga aylantirmaydi:

- `smetaRemaining*` = baseline estimate minus effective Fakt;
- `f2Available*` = effective Fakt minus approved/certified F2;
- `contractualRemaining*` = approved entitlement minus approved/certified F2;
- `cumulative*` = canonical read-model bergan exact approved F2 amount/quantity.

Bu ikkinchi business truth emas, faqat bir xil ko‘rsatish/reconciliation layeridir.
Manfiy F2 mavjudligi `OVER_CERTIFIED` sifatida saqlanadi; u yashirilmaydi yoki jim
`0`ga qisqartirilmaydi. Previous/current cumulative tafovutlari ham explicit issue bo‘lib qoladi.

Backend uchun ham additive source contract tayyor: `20261102110000_t2_nakopitelniy_ledger_semantics_v1.sql`
`t2_nakopitelniy_v2`ni o‘zgartirmasdan `t2_nakopitelniy_ledger_v1` wrapperini beradi.
U `smeta_qoldiq_*`, `f2_mumkin_summa` va `contract_qoldiq_*` maydonlarini aniq nomlaydi.
Migration hali productionga qo‘llanmagan; gateway migration mavjudligi isbotlanmaguncha
eski v2 compatibility pathdan foydalanadi.

Static/type/unit evidence quyidagilarda bor: lineage validator, F3 export
call-site va migration acceptance SQL. Real authenticated Excel/print smoke,
real approved F2 equality va migration rollback/runtime acceptance — alohida
owner muhitida bajarilishi kerak.
