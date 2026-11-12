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
