# Ish joyi + rol (kabinet) — server-driven ish stoli, V1

Holat: V1 kodlandi (server + Android + veb), migratsiyasiz. Sana: 2026-11-16. Dalil: kod `fayl`. Sintetik ma'lumot; real summa/INN yo'q.

## 0. Muammo va qaror

Egasi fikri: native ilova «hamma uchun bir xil», dala va har tomonga moslanmagan; ilova ichida mantiq qayta yozilsa, har o'zgarish har ilovada takrorlanadi.

Qaror: **ish stoli ta'rifi serverda bitta** (`/api/ish-joyi?bolim=ish_stoli`). Server foydalanuvchi + kabinet uchun tartiblangan bo'limlar va tezkor amallarni qaytaradi (ruxsat allaqachon tekshirilgan). Veb, Android, Windows, Telegram faqat chizadi. Yangi rol yoki amal = `functions/_shared/ish-stoli.ts` da bitta yozuv.

## 1. Topilmalar (o'rganish)

| Mavzu | Hozirgi holat | Dalil |
|---|---|---|
| `/api/ish-joyi` | GET `bolim=joylarim` (`t2_ish_joylarim_v1`: nom, turi, rol), `takliflar`; POST yarat/turi/taklif/qoshil. Mobil BFF'da allaqachon ochiq | `functions/api/ish-joyi.ts`, `functions/api/mobil/bff.ts` |
| Vakolat | `roleAuthority` (`t2_men_v1`, 60 s kesh): `kompaniyalar[{id,rol}]`, `permissionsByCompany`, `modullarOffByCompany` | `functions/_shared/role-authority.ts` |
| Ruxsat nomlari | `fakt.write`, `self.work.write`, `warehouse.receive/write`, `quality.inspect/decide`, `f2.approve`, `procurement.*`, `supply.*`, `financial.*` | `functions/_shared/permission-policy.ts` |
| Munosabat (tomon) | `t2_tomon_aloqa` (`men_rol`/`qarshi_rol`, holat), `t2_tomon_grant`, `t2_tomon_vakolat`; `/api/tomon?bolim=aloqalar` | `docs/architecture/kabinetlar/MUNOSABAT_MODELI.md` |
| Veb «Bugun» | rol profili `ROL_PROFILLARI` (klientda qattiq yozilgan) + `navFiltr` | `src/lib/reestr/tomonProfil.ts`, `src/admin/sahifalar/Bugun.tsx` |
| Android hub | klient katalogi `ModuleCatalog` (ruxsat/modul filtri), hamma uchun bir xil to'r | `core/data/Modules.kt`, `feature/hub/HubScreen.kt` |
| Modul tanlovi | `/api/modullarim` — faqat ko'rinish (pin/tartib), ruxsat bermaydi | `functions/api/modullarim.ts` |

Asosiy xulosa (MUNOSABAT_MODELI bilan mos): **a'zolik roli** «kabinet ichida nima qila olaman»ni, **aloqa roli** «qaysi kabinetlarim bor»ni belgilaydi. Yangi jadval kerak emas.

## 2. Kabinet

Kabinet = (kompaniya, tomon). Saqlanmaydi — har so'rovda hosila:

1. `t2_ish_joylarim_v1` har ish joyi uchun a'zolik kabineti: `tomonAniqla(rol, permissions)`.
2. Har tashkilot uchun (ko'pi bilan 8) faol aloqalar (`t2_tomon_aloqalar_v1`, faqat o'qish): `men_rol` subpudratchi → Subpudratchi kabineti; zakazchik/buyurtmachi → Texnadzor/buyurtmachi kabineti; taminotchi/yetkazuvchi → Ta'minotchi. Pudratchi/bosh_pudratchi yangi kabinet ochmaydi (a'zolikdan chiqadi).
3. Kompaniyasiz foydalanuvchi → `0:ishchi` kabineti (taklif kodi bilan qo'shilish, Jarvis); shaxsiy ish joyi egasi esa to'liq roli bilan ishlaydi.
4. Aloqa xatosi kabinetni yashirmaydi (a'zolik kabinetlari qoladi).

Kabinet id: `<kompaniya_id>:<tomon>`; tanlov `kabinet=` yoki `kompaniya_id=` (shu kompaniyaning birinchi kabineti).

## 3. Rol matritsasi

`rejim = dala` — katta tugma, oflayn navbat, foto/ovoz birinchi. `—` = bo'lim yo'q.

| Tomon (a'zolik roli) | Bosh sahifa bo'limlari (tartib bilan) | Asosiy amal | Dala yorliqlari | Yaratadigan hujjat | Ko'radigan tasdiqlar |
|---|---|---|---|---|---|
| Pudratchi rahbari (boss, admin, rahbar) | KPI (moliya.xulosa), tasdiq navbati, tezkor amallar, obyektlar | Tasdiqlash | — | hujjat_yarat, F-2 reestri | fakt, F-2, to'lov |
| PTO / smetachi (pto, loyihachi) | tezkor (F-2, fakt, smeta, narx, hujjat), fakt+F-2 navbati, obyektlar, hujjatlar | F-2 tayyorlash | — | F-2, F-3 (hujjat_yarat) | fakt, F-2 |
| Prorab / usta (dala; prorab, usta, brigadir, mexanik, haydovchi) | Dalada (katta), bugungi ishlar (joy bo'yicha), tasdiqlash, yana | Fakt yozish | fakt, foto dalil, material so'rovi, ombor chiqim | hujjat_yarat (akt) | fakt qarori (fakt.write) |
| Omborchi | Omborda (katta), qoldiq (kpi), bugungi topshiriq, yana | Ombor kirim | kirim, chiqim, material so'rovi, foto | — | — |
| Ta'minotchi | tezkor (so'rov, xarid, logistika, kirim), ochiq zayavkalar, hujjatlar | Material so'rovi | — | hujjat_yarat | — |
| Texnadzor / buyurtmachi (buyurtmachi, inspektor, kuzatuvchi; aloqa zakazchik) | Tasdiqlashim kerak, nazorat (texnik nazorat, buyurtmachi kabineti, foto, F-2 reestri), obyektlar | Tasdiqlash | — | — (faqat ko'radi) | quality.decide, F-2 |
| Subpudratchi (pudratchi; aloqa subpudratchi) | Dalada (katta), bosh pudratchidan ishlar, yana | Fakt yozish | fakt, foto, material, hujjat | hujjat_yarat | — |
| Buxgalter (bugalter) | KPI (moliya), tezkor (moliya, hujjat, F-2 reestri), tasdiq navbati | Moliya | — | hujjat_yarat | — |
| Kompaniyasiz / shaxsiy ishchi | boshlash matni, tezkor (taklif kodi, Jarvis, bugun) | Taklif kodi bilan qo'shilish | — | — | — |

Amal katalogi (har biri `ruxsat` + ixtiyoriy `modul` bilan): fakt_yoz, foto_dalil, material_sorov, ombor_kirim, ombor_chiqim, tasdiqlash, hujjat_yarat (hujjat agenti ulanadigan id), jarvis, bugun, obyektlar, smeta, narx, f2_tayyorlash, f2_reestr, moliya, hisobot, xarid, logistika, nazorat, buyurtmachi_kabinet, subpudrat_ishlari, taklif_qoshil.

Ruxsat qoidasi: amal faqat `permissionsByCompany[kompaniya]` unga ruxsat bersa chiqadi (`a|b` — bittasi), modul o'chirilgan bo'lsa chiqmaydi, superadmin hammasini ko'radi. Ruxsat snapshoti yo'q (eski DB) → eng kam huquq (bo'sh), hech narsa oshib ketmaydi. Bajarishda RPC o'zi qayta tekshiradi (ruxsat klientga ishonmaydi).

## 4. Javob shakli (versiya 1)

```
{ ok, versiya, kabinetlar:[{id,kompaniya_id,nom,tomon,tomon_nom,manba:azolik|aloqa|shaxsiy,joriy}], joriy, kompaniya_id, tomon, tomon_nom,
  rejim: dala|standart, dala:{katta_tugma,oflayn,ovoz,foto}|null,
  amallar:[{id,nom,ikonka,maqsad:{tur:native|web,kod,yol?},birlamchi?}],
  bolimlar:[{id,tur:amallar|royxat|kpi|matn,nom,manba?,guruh?:joy,amallar?:[id],amal?:id,matn?,katta?}], birlamchi_amal }
```

- `maqsad.kod` — mavjud native modul kodi (`fakt`, `foto`, `tasdiq`, `ombor`, `jarvis`, ...); `yol` — veb sahifa. Mavjud ekranlar maqsad bo'lib qoladi.
- `manba` — klient o'zi biladigan ma'lumot oqimi (`obyektlar.oxirgi`, `bugun.ishlar`, `tasdiq.navbat`, `moliya.xulosa`, `ombor.qoldiq`, `zayavka.ochiq`). Klient bilmasa bo'limni `amal` orqali «Ochish» kartasi qilib chizadi.
- Oldinga moslik: noma'lum `tur`, noma'lum amal havolasi, buzuq qator — tashlanadi, ilova yiqilmaydi. Versiya o'zgarmasdan yangi maydon qo'shish mumkin.

## 5. Klientlar

- **Android**: `core/data/Workspace.kt` (parser, repo, oflayn kesh), `feature/hub/WorkspaceSections.kt` (umumiy chizgichlar), yuqori panelda kabinet chip + `CabinetSheet`. Dala rejimida katta tugmalar (112dp), «Internetsiz ham ishlaydi» belgisi (fakt/foto mavjud outbox), bugungi ishlar obyekt (joy) bo'yicha. Eski «Barcha ilovalar» to'ri pastda qoladi; server yo'q/eski bo'lsa — oddiy launcher.
- **Veb**: `src/api/t2-ish-stoli.ts` (parser, hook), `IshStoli.tsx`, «Bugun»da javob kelsa rol bo'limlari shundan, kelmasa eski lokal profil (`ROL_PROFILLARI`). Veb `royxat/kpi` uchun hozircha «Ochish» havolasi.
- **Windows / Telegram**: javobni o'zgarishsiz ishlatadi (keyingi bosqich); Telegram `tomon`ni menyu tugmalari uchun oladi.

## 6. Cheklovlar va keyingi qadam

1. Matnlar serverdan o'zbekcha; ilova chrome matni (en/ru) lokal. Keyin: `?til=` yoki amal id bo'yicha lug'at.
2. Aloqa kabinetlari faqat birinchi 8 tashkilot uchun; ko'p tashkilotda bitta jamlama o'qish funksiyasi kerak (SQL — alohida, tasdiq bilan).
3. `royxat/kpi` ma'lumot oqimlari: Android hozir `obyektlar.oxirgi` va dala «joy» ro'yxatini chizadi; qolganlari «Ochish» kartasi. Server tomonda oqim ma'lumotini qo'shish keyingi versiya (`qiymat` maydoni).
4. Veb `ROL_PROFILLARI` va server matritsasi hozir ikkita manba; server javobi bor joyda server ustun. Keyin veb zaxirasini olib tashlash.
5. `hujjat_yarat` amali hujjat agenti ulanguncha veb sahifaga (`/admin/hujjat-aylanish`) ochiladi.
6. Offline: ish stoli oxirgi javob nusxasi bilan chiziladi; yozuvlar mavjud outbox'ga tushadi.
