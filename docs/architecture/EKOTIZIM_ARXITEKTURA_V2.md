# EKOTIZIM ARXITEKTURASI V2 — yagona reestr va 7 ish joyi

Holat: QABUL QILINGAN (egasi: «hammasini davom ettir», 2026-11-11). Muallif: L0 (Claude). Asos: jonli sayt auditi (112 band) va kod inventari.

## 1. Muammo
Bitta «sahifa / amal» ni ~15 ta alohida ro'yxat tasvirlaydi va ular bir-biridan uzoqlashgan:
menyu `lib/nav/navReestr.ts`, sahifa himoyasi `lib/company-authorization/route-permission.ts`, kontekst `umumiy/kontekst/routeScope.ts`,
rol boshi `lib/nav/boshSahifa.ts`, modul `lib/modullar.ts` (MENYU_MODUL) va `lib/ilova/ilovalar.ts` (ikkinchi modul lug'ati),
yozish siyosati `functions/_shared/write-command-policy.ts` + `permission-policy.ts`, mindmap `lib/mindmap-yollar.ts`,
sayt xaritasi `lib/sayt-xaritasi/pageCatalog.ts`, yo'riqnoma, sozlamalar, AI vositalari (3 to'plam).
Natija: menyu va himoya turli ruxsat so'raydi; bitta ish 4–10 joyda; obyekt tanlash 6 joyda; yangi xodim topa olmaydi.

## 2. Maqsad
**7 ta yopiq ish joyi** (`IshJoyi`): `bugun` · `obyekt` · `hujjatlar` · `taminot` · `moliya` · `tomonlar` · `kompaniya`
(+ `sotuv` faqat modul yoqilganda; `platforma` faqat superadmin, menyuda emas). Mindmap — `obyekt`/`tomonlar` ning «Xarita» ko'rinishi.

**Yagona reestr** `frontend/src/lib/reestr/` (sof ma'lumot, React yo'q):
- `sahifa.ts` — `Sahifa { kalit, yol, eskiYollar?, ishJoyi, tab?, tartib, ilova, nom, sinonimlar, ruxsat, scope, kontekst?, holat:'tayyor'|'beta'|'texnik', bosh?, tomonlar?, mindmap?, aiNiyat? }`
- `amal.ts` — `Amal { kalit, turi:'oqish'|'yozish', rpc, capability, ilova, sahifa?, ai?{tavsif,kirish,xavf,dryRun}, tokenNarx?, mindmapAmal? }`
- `tugun.ts` — mindmap tugun turlari: `{ sahifa, yaratAmal, bogAmal[], otaTurlari[] }`
- `tomonProfil.ts` — `t2_yonalish` kaliti → `{ defaultIlovalar[], boshIshJoyi, kabinetSahifalar[] }`
Hamma iste'molchi (menyu, himoya, route, rol boshi, sayt xaritasi, qidiruv, Jarvis manifesti, mindmap, server yozish siyosati) shundan **hosila** bo'ladi.

## 3. Kengayish qoidasi
Yangi sahifa = 1 ta `Sahifa` yozuvi (+ komponent xaritasi). Yangi amal = 1 ta `Amal` + RPC migratsiyasi. Yangi tomon turi = `t2_yonalish` qatori + `tomonProfil`.
Qo'riqchi testlar (`lib/reestr/reestr.qoriqchi.test.ts`): har `/admin/*` route reestrdan; ruxsat/capability `PERMISSIONS` da bor; `tayyor` sahifada ≥3 sinonim (uz+ru) va `aiNiyat`; har sb-yoz amali va /api/sb soro uchun `Amal`; AI yozish amali `dryRun`; har `TugunTur` sahifa va yaratish amaliga ega; `modul` maydoni boshqa joyda yo'q; rol × sahifa matritsa snapshoti (ruxsat o'zgarishi diff bo'lib ko'rinadi, egasi tasdiqlaydi).

## 4. Ko'p tomonli model va kengayish
Tenant = `t2_kompaniya`; tomon roli = `t2_yonalish`; ichki rol = `t2_azolik.rol`. Kompaniyalararo ko'rinish faqat `t2_tomon_aloqa` + `t2_tomon_grant`. Kabinet = o'sha sahifa begona `aloqa_id` bilan (nusxa emas).
Hujjat oqimi: yaratish → «Yuborish» (`t2_tomon_taqdim`, R2 snapshot+sha256) → «Bugun → Kiruvchi» (`t2_kiruvchi_v1` UNION read-model, yangi jadval yo'q) → qaror / murojaat → qayta yuborish.
Kengayish: har jadvalda `kompaniya_id`, `(kompaniya_id, obyekt_id, id desc)` indekslari; eski jurnal/arxiv R2 ga (`t2_arxiv` ko'rsatkichi); `t2_hajm_v1` + har migratsiya PR'ida MB/oy bahosi; /api/sb batch (≤8); keyset sahifalash; cron → `t2_job`; kvota `_shared/kvota.ts` (`t2_obuna.limitlar`).

## 5. Bosqichlar (kichik xavfsiz PR'lar)
0 hujjat (shu) → 1 reestr turlari + `NAV_GURUHLAR` dan urug' (navReestr hosila, golden test) → {2 yagona ruxsat ifodasi, 3 amal reestri (server)} → 4 qo'riqchi testlar + CI → 5 reestrdan route + eskiYollar → 7 7 ish joyiga qayta guruhlash → {8 Bugun + Kiruvchi, 9 universal qidiruv `t2_qidir_v1`, 12a–f takroriy yuzalarni birlashtirish} → 13 tomon profillari. Parallel: 6 `IshDoirasi` (1 dan keyin), {10 Jarvis manifesti, 11 mindmap reestrdan} (3 dan keyin), 14 DB dieta, 15 repo ildizini tozalash.
Ruxsat o'zgaradigan har PR (2, 3, 13) — rol × sahifa jadvali oldin/keyin egasiga ko'rsatiladi.

## 6. Qadam 2 — ish joylari menyusi (holat: bajarilgan, PR «reestr/ish-joylari»)
Yuqori daraja = 7 ish joyi (+ `sotuv`, `platforma`). Hammasi reestrdan hosila: `lib/nav/ishJoyiMenyu.ts` (menyu), `lib/nav/ruxsatMatritsa.ts` (Kompaniya → «Ruxsatlar jadvali», faqat o'qish), `lib/reestr/qidiruv.ts` (Ctrl+K: sahifa + amal + obyekt/shartnoma/hujjat, lotin/kirill farqsiz), `lib/reestr/tomonProfil.ts` (`ROL_PROFILLARI` → «Bugun» tugmalari). Ruxsat xulqi O'ZGARMAGAN. Eski guruhli sidebar `NAV_GURUHLAR` (route ruxsati, tablar manbai, sayt xaritasi) saqlanadi; yangi menyu sidebar pastidagi tugma bilan o'chiriladi (`fz-yangi-menyu`, sukut YOQIQ, brauzerda eslab qolinadi).

## 7. Yangi sahifa / amal qo'shish (parallel agentlar uchun, 10 qator)
1. `lib/reestr/sahifa.ts` SAHIFALAR ga BITTA `Sahifa` yozuvi: `kalit`, `yol`, **`ishJoyi`** (majburiy), `tartib` (yagona), `ilova`, `nom`, `sinonimlar` (uz+ru), `ruxsat` (faqat shu yerda e'lon qilinadi), `holat`, `navGuruh`/`navBand` (tab bandi; yangi band bo'lsa `NAV_GURUH_META` ga ham).
2. Kam ishlatiladigan bo'lsa `yana: true` (butun band yana bo'lsa ish joyining «Yana…» ro'yxatiga tushadi). Yangi ish joyi QO'SHILMAYDI — 7 tadan tanlang.
3. Komponent: `App.tsx` ga `<Route path=…>` (+ `umumiy/marshrutTekshir.ts` ADMIN_MARSHRUTLARI).
4. Menyu, Ctrl+K, tablar, ruxsat jadvali, sayt xaritasi AVTOMATIK: qo'lda ro'yxatga tegmang. Fixture/sayt xaritasini qo'lda emas, `npm run site-map:generate` va fixture regeneratsiyasi bilan yangilang.
5. `lib/yordamchi/sinonim.ts` ga ru+en ibora; `lugat/qism/<mavzu>.json` ga tarjima.
6. Amal: `lib/reestr/amal.ts` AMALLAR ga `Amal` (kalit, capability ∈ PERMISSIONS, `sahifa`, `yol`, `nom`, `sinonimlar`); server RPC bo'lsa `rpc`.
7. Eski yo'lni ko'chirsangiz: `Sahifa.eskiYollar` — App.tsx avtomatik `<Navigate>` qiladi. Hech narsa o'chirilmaydi.
8. Rol uchun «Bugun» tugmasi: `ROL_PROFILLARI` ga kalit (3–6 ta).
9. Qo'riqchi testlar (`reestr.ishJoylari.test.ts`): ish joyisiz sahifa, takror kalit/yol/tartib, ruxsat ikki joyda e'lon qilinishi, matritsa snapshoti — yiqilsa, snapshotni egasi ko'rib tasdiqlaydi.
10. Hujjat dizayni/AI vositasi ham shu reestrdan o'qiydi (Jarvis manifesti — 10-qadam).

## 8. Masshtab: 200+ sahifa va yangi tomon turlari menyuni o'stirmaydi
- Yuqori daraja QAT'IY 7 ish joyi: sahifa soni o'smaydi, faqat ish joyi ichidagi band soni o'sadi. Band (tablar) 2+ sahifani bitta qatorga yig'adi; «Yana…» — kam ishlatilganlarni yashiradi; Ctrl+K hamma narsani topadi (menyu — odat, qidiruv — kafolat).
- Foydalanuvchi faqat o'z ruxsatidagini ko'radi (navFiltr), shuning uchun 200 sahifadan rolga 8–25 tasi chiqadi; «Bugun» — 4–6 tugma.
- Yangi tomon turi (haydovchi, texnadzor, laboratoriya…) = `t2_yonalish` qatori + `ROL_PROFILLARI`/`TomonProfil` yozuvi + ularning sahifalari mavjud ish joylarida (kabinet = o'sha sahifa, begona `aloqa_id` bilan). Yangi menyu bandi shart emas.
- Keyingi: sahifa sonining o'sishida ish joyi ichida «bo'lim» (sarlavha) qatlami; Ctrl+K ni server tomon `t2_qidir_v1` ga ko'chirish (9-qadam).
- **8-ish joyi yoki ommaviy mahsulot FAQAT MA'LUMOT bilan qo'shiladi** (Bozor, Tender, Yuk tashish — docs/architecture/BOZOR_TENDER_LOGISTIKA.md): (1) `ishJoyi.ts` ISH_JOYLARI ga kalit (masalan `bozor`), (2) `ISH_JOYI_META` ga yozuv (nom, ikonka, tartib; ommaviy bo'lsa `ommaviy: { yol: '/bozor' }`) — TypeScript Record to'liqligini o'zi talab qiladi, (3) o'sha `ishJoyi` bilan `Sahifa` yozuvlari + yangi `ilova` kodi (modul yoqilganda ko'rinadi). Menyu (`ISH_JOYI_NAV`), Ctrl+K, ruxsatlar jadvali va guard testlar o'zi oladi; AdminShell/navFiltr kodiga tegilmaydi. Ommaviy (login'siz) sahifalar AdminShell tashqarisida (`/bozor`…) yashaydi, lekin shu reestrda e'lon qilinadi.
- «Bugun» — bitta yo'l (`/admin/bugun`): usta/brigadir uchun telefon ekrani (UstaBugun), qolganlar uchun rol profilidan tugmalar; boshqa tomon agentlarining bosh sahifalari (yetkazuvchi, loyihachi, buyurtmachi, texnadzor, direktor) `ROL_PROFILLARI` orqali HAVOLA qilinadi, ko'chirilmaydi. «Kadrlar» (erp+hr) yangi menyuda bitta band (`Sahifa.ishBand`).
- Qidiruv natijasi shartnoma/hujjat bo'lsa, ochiladigan sahifada chuqur havola parametri (?id/?shartnoma) hozircha YO'Q (HujjatAylanish bundan mustasno) — sahifa darajasida ochiladi; parametr qo'shilganda `qidiruv.ts` yoziga `?param` qo'shish yetarli.

## 9. Amal — bitta reestr, uch yuz (Jarvis, karta, tugmalar) — 3-qadam
**Qoida («AI birinchi»):** har ish Jarvis (Ctrl+K) orqali oson bajarilishi kerak. Amal reestri (`lib/reestr/amal.ts`) ijro etiladigan: nom + sinonim (uz/ru/en), `capability`, `parametrlar` (matndan → kontekstdan → BITTA savol), `tasdiq` (`yoq` o'qish · `karta` yozuv · `ikkiTasdiq` pul/qaytarib bo'lmas), `qoplaydi` (qaysi gateway amallarini yopadi), `mavzu` (mindmap tugun turlari). Motor `amal-motor.ts` (sof: niyat → parametr → ko'rinish → tasdiq → ijro, `operation_id` bilan idempotent), ijrochilar `amal-ijro.ts` (faqat MAVJUD API klientlari: sbZayavkaYoz, tolovYoz, sbArxivla — yangi server mantiqi yo'q). Uch yuz bitta reestrdan: Jarvis (AiChat + AmalKarta), mindmap kartasi (`amal-mavzu.ts` adapteri), «Bugun»/Ctrl+K «Amallar».
**Qamrov kafolati:** `amal.qoplam.test.ts` — `sb-yoz` WRITE_COMMAND_POLICY va `yozishYuki` eksport qilgan HAR gateway (tomon, loyihachi, laboratoriya, kelgusi: yuk-tashish, bozor, tender-p1, loyiha-smeta, foto-dalil, grafik avtomatik topiladi) yozuv amali yo `Amal.qoplaydi` da, yo `amal-hali-yoq.ts` da SABAB bilan bo'lishi shart. Yangi funksiya AI yuzasiz chiqmaydi.
**Yangi amal qo'shish (parallel agentlar uchun, 10 qator):**
1. `amal.ts` AMALLAR ga bitta `Amal`: `kalit` (`soha.fe'l`), `turi`, `capability` (∈ PERMISSIONS), `ilova`, `sahifa`+`yol`, `nom`, `sinonimlar` (ru bilan, kamida bitta 2+ so'zli ibora — 1 so'zli ibora navigatsiya uchun), `en`.
2. `qoplaydi`: yangi gateway/RPC amallari (`sb-yoz` nomi yoki `gateway:amal`). Ularni `amal-hali-yoq.ts` dan O'CHIRING; qamray olmasangiz o'sha jadvalga SABAB bilan yozing.
3. `tasdiq`: o'qish `yoq`; yozuv `karta`; pul, hujjatni tasdiqlash, o'chirish/arxiv, a'zo rolini o'zgartirish `ikkiTasdiq`.
4. `parametrlar`: har majburiy qiymat uchun `{nom,tur,majburiy,kontekst?,savol}`. Pul va hajm uchun `kontekst` BERILMAYDI (taxmin qilinmaydi).
5. Ijrochi kerak bo'lsa `amal-ijro.ts` IJROCHILAR[kalit] = `{korinish, ijro}`: mavjud API klientini chaqiring (operationId uzating), summani `hisob-yadro` (yaxlit2) bilan ko'rsating. Qator/hujjat topish naqsh bilan hal bo'lmasa — `ijro: 'model'` (mavjud model oqimi).
6. `mavzu`: mindmap tugun turlari — karta menyusi `amal-mavzu.tugunAmallari/juftAmallari` orqali o'zi oladi.
7. Tarjima: `lugat/qism/<mavzu>.json` ga amal `nom` ning ru/en matni (`t(a.nom)` ishlatiladi).
8. Test: `amal-ijro.test.ts` ga niyat → ko'rinish → ijro (API mock) holati; pul amali bitta tasdiq bilan bajarilmasligi.
9. `site-map:generate` va fixture regeneratsiyasi; rol × sahifa matritsa snapshoti ruxsat o'zgarsa diff ko'rsatadi.
10. Hech qachon: pul/hajmni taxmin qilish; tasdiqsiz yozish; ruxsatsiz amalni yashirish (sababi tushuntiriladi).
**Hozirgi holat:** 29 amal reestrda (25 yozuv), 3 tasi bevosita Jarvis'da bajariladi (zayavka, to'lov, obyektni arxivlash); fakt — mavjud model oqimi (qator topish uchun); qolganlari sahifaga yo'naltiradi (navigatsiya) — ijrochilar navbat bilan qo'shiladi.