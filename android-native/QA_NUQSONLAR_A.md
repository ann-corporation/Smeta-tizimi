# QA nuqsonlar - A hudud (smeta / akt / fakt / F-2 / nakop / obyekt) - 2026-11-19

Usul: kod auditi (sayt bilan solishtirish) + demo ma'lumot + birlik testlari; Windows ilova demo rejimida. Android emulyator (API 34, ikkinchi AVD) bu mashinada
boshqa agentlar yuklamasi tufayli "System UI isn't responding" holatida qoldi (guest load ~25-30), shuning uchun Android jonli bosqichi to'liq o'tmadi
(faqat Yana/Hub ekrani ochildi, a01 skrinshot). Haqiqiy ma'lumot, summa, nom yo'q.

Daraja: P1 - noto'g'ri ma'lumot/qoida buzilishi; P2 - ko'rinadigan nuqson; P3 - kichik.

| # | Daraja | Platforma | Nuqson | Holat | Tekshiruv |
| --- | --- | --- | --- | --- | --- |
| A1 | P1 | Windows | F-2 akt qatorlari summasida summasiz qator 0 deb qo'shilgan (null = 0), "0" ko'rinardi | tuzatildi ✅ | `ActDirectTest` (3 test) + `:desktop:compileKotlin`; ekranda endi "—" va "Narxsiz qatorlar: N" |
| A2 | P2 | Windows | Smeta daraxtida yoyish belgilari buzilgan matn (kodlash xatosi) | tuzatildi ✅ | `\u25B8/\u25BE`; Windows demo ilovada ko'rildi (w03_smeta_fix) |
| A3 | P2 | Windows | Moliya tablarida va bildirishnomada "o'qilmagan" nuqtasi buzilgan belgi | tuzatildi | kod: `\u25CF` (bildirishnoma ekrani demo da ko'rilmadi) |
| A4 | P2 | Windows | Fakt jurnali holati xom kod ("approved"...) ko'rsatardi | tuzatildi ✅ | `statusUz(...)`; Windows fakt jurnali ko'rildi |
| A5 | P2 | Android | F-2 akt kartasida "Rad etish", "Rad etish sababi", "Rad etishni tasdiqlash" faqat o'zbekcha (ru/en da tarjimasiz) | tuzatildi | 3 kalit uz/en/ru `strings_p5.xml`; `lintDebug` |
| A6 | P1 | Android | F-2 akt kartasida narxsiz/minusli qatorlar soni noma'lum bo'lsa "0" ko'rsatardi | tuzatildi | `—` ko'rsatiladi (kod) |
| A11 | P2 | Windows | Akt qatorlari yuklanmaganda "Qatorlar soni 0" va bo'sh jadval ko'rinardi (noma'lum = 0) | tuzatildi ✅ | Windows demo (w05_f2_act): faqat xato banneri |
| A12 | P1 | Windows | Smeta/F-2 yuqori qatorida uch summa (QQS bilan / ustamali / ustamasiz) orasida bo'shliq yo'q, raqamlar yopishib o'qib bo'lmasdi | tuzatildi ✅ | Windows demo (w03_smeta_fix, w05_f2_act) |
| A13 | P2 | Windows | Smeta jadvali oynadan keng: oxirgi "F-2" ustuni kesilib, sarlavha 3 qatorga bo'linardi | tuzatildi ✅ | nom ustuni moslashuvchan; w03_smeta_fix |
| A14 | P3 | Windows demo | Nakopitelniy ekrani demo rejimda "ro'yxat yuklanmadi" (demo fixture yo'q); akt qatorlari ham demo da ruxsatsiz | ochiq | faqat demo fixture; haqiqiy hisobda tekshirish kerak |
| A7 | P2 | Windows | Bosh sahifa (Bugun) yo'q: Android da bor, Windows menyusida yo'q | ochiq | yangi ekran - keyingi reliz; ro'yxat uchun qoldi |
| A8 | P2 | Windows | Smeta qatori tafsiloti (qoldiq, fakt/F-2 ajratmasi) yo'q, faqat jadval | ochiq | yangi ekran |
| A9 | P3 | Windows | Fakt jurnalida "Jami (hujjat)" QQS/ustama ajratmasisiz | ochiq | serverda akt paketi RPC qo'llanmaguncha (`akt_summa_paket_v1`) |
| A10 | P3 | Android | Emulyator jonli sinovi bu mashinada to'liq bajarilmadi | ochiq | boshqa mashinada/yengil AVD da takrorlash |

Boshqa hududga tegishli (tuzatilmadi): `SettingsScreen.kt` (profil ismi bo'sh bo'lsa "—" o'rniga buzilgan belgi), `values-ru/strings_ombor.xml` 23-qator kodlash.
