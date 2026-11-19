# Android paritet: Ombor (sayt -> Android chek-list)

Manba: `frontend/src/components/ombor/{OmborIshJoyi,OmborKiritish,OmborHisobot,OmborLugat,OmborOvozYordam}.tsx` (sayt «Ta'minot va sklad», omborchi ish joyi), server `/api/ombor-buyruq`.
Android: `android-native/app/.../feature/ombor/*` (OmborScreen, OmborEntry, OmborCommandUi, OmborReportUi, OmborViewModel), umumiy `shared/.../feature/ombor/*`.
Holat: CHEK-LIST. Amalga oshirish hali boshlanmagan (pastdagi tartib bilan alohida PR'lar). O'qilgan: faqat yuqoridagi sayt fayllari; sahifa darajasidagi ombor tanlash («Barcha omborlar», Navoiy bog' birlashgan ombori) va `KELDI/BERDIM` buyruq lug'ati sayt tarafdan hali o'qilmagan.

## Model farqi (eng muhim)
Saytda hamma narsa **bitta omborga (`skladId`)** bog'langan: ish joyi tanlangan ombor uchun ochiladi. Android'da esa «qamrov» (Hamma obyektlar / obyekt / markaziy ombor) modeli: kirim/chiqim obyekt bo'yicha yoziladi. Ombor-birinchi (warehouse-first) bo'lish uchun Android ham avval omborni tanlashi, keyin shu omborning ish joyini ochishi kerak.

| № | Saytda | Android | Holat |
|---|---|---|---|
| 1 | Ish joyi tablari: Bugun / Hisobot / Qoldiq / Ombor lug'ati | Ostatka / Kirim / Chiqim / Hisobot | GAP (tablar boshqa; «Bugun», «Qoldiq» sanasi bilan, «Ombor lug'ati» yo'q) |
| 2 | Yagona kiritish paneli: Kirim / Chiqim tugmasi + bitta qator (matn yoki ovoz) + takliflar | Pastda buyruq qatori (matn/ovoz) + alohida «Kirim»/«Chiqim» tugmalari va forma dialogi | GAP (forma dialogi saytda yo'q: bitta qator + tasdiq kartasi) |
| 3 | Takliflar shu omborning tarixidan (`taklif`): material, birlik, odatiy miqdor, oxirgi narx (QQS bilan/siz), yetkazuvchi; yetkazuvchi tanlansa uning materiallari | Takliflar mavjud zaxiradan (`StockRow`), narx/yetkazuvchi taklifi yo'q | GAP |
| 4 | Tasdiq kartasi: material, birlik, miqdor, narx (ixtiyoriy, QQS siz), yetkazuvchi/«Kimga», sana, bitta «Saqlash» | Forma: nom, birlik, miqdor, sana, tomon, manba/maqsad obyekt, izoh; narx yo'q | GAP (narx, QQS bilan/siz rejimi, sana `max=bugun`) |
| 5 | Narx QQS bilan / QQS siz tugmalari (ombor bo'yicha eslab qolinadi), «Narxi ma'lummi? (o'tkazib yuborish mumkin)» bir marta | yo'q | GAP |
| 6 | Gap/ovoz buyrug'i: `omborTahlilMatn/Ovoz` -> tasdiq kartasi (`tasdiq_kerak`), `savol` + variant tugmalari, `material_topilmadi`, `javob` (qoldiq), `hisobot`, `yozuv_tanlang`, QQS rejimi savoli | Buyruq oqimi bor (preview, variant tugmalari `savol`, ovoz) | TEKSHIRILMAGAN (holatlar to'liq qoplanganmi: `material_topilmadi`, `yozuv_tanlang`, `narx_rejim_sorov`) |
| 7 | Qoldiq jadvali: qidiruv (lotin/kirill), sana bo'yicha ostatka (`omborQoldiqSana`), tur filtri, «Faqat ostatkasi bor», 50 tadan sahifalash, Excel eksport | Ostatka ro'yxati + qidiruv + skaner; sanali ostatka, tur filtri, Excel yo'q | GAP |
| 8 | Material kartasi: tarix (100), «Tuzatish» (miqdor + sabab) va bekor qilish, teskari yozuv chizilgan | Material varag'i (`ItemSheet`) + tarix; tuzatish/bekor yo'q | GAP |
| 9 | Hisobot paneli (`OmborHisobotPaneli`): davr, jami birlik bo'yicha, summa QQS siz/bilan, narxsiz kirim soni | `OmborReportPanel` mavjud | TEKSHIRILMAGAN (matnlar va maydonlar) |
| 10 | Ombor lug'ati (`OmborLugat`: nom variantlarini birlashtirish) | yo'q | GAP (BFF `lias` Android'ga ataylab yopilgan, ochish kerakmi — qaror kerak) |
| 11 | Matnlar: sayt i18n kalitlari (`Kirim`, `Chiqim`, `Saqlash`, `Tasdiqlash`, `Ostatka`, ...) | `strings.xml` o'z matnlari | GAP (SiteI18n ga o'tkazish) |

## Tavsiya etilgan tartib (har biri alohida PR, mantiq serverdan)
1. Ombor tanlash (warehouse-first) va ish joyi tablari: Bugun / Hisobot / Qoldiq, sayt kalitlari bilan.
2. Yagona kiritish paneli: Kirim/Chiqim, takliflar (`taklif`), narx va QQS rejimi, tasdiq kartasi, ovoz/gap holatlari to'liq.
3. Qoldiq: sanali ostatka, filtrlar, sahifalash; material kartasi: tarix, tuzatish/bekor.
4. Excel eksport (`eksport` BFF'da yopiq: token yechadi va ikkilik fayl, alohida qaror) va Ombor lug'ati.
