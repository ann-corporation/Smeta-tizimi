# SMETA_USTASI_V1 - «AI smeta ustasi» (1-hafta: poydevor)

Holat: QORALAMA (draft PR). Shablonlar - **EGASI TEKSHIRISHI KERAK** (pastda).
Maqsad: foydalanuvchi uyni erkin matn bilan tasvirlaydi -> tizim savol beradi -> normalar va resurslar bilan smeta qoralamasi (Studio'da, foydalanuvchi qo'shadi). Model smeta yozmaydi.

## 1. Norma -> resurslar (RES) katalogi qayerda (ochiq savolga javob)

Manba: ABC4/TN bazasi jadvallari (Access manbasi: `basis` ishlar, `basisres` retsept, `material` resurslar, `bprice` hudud narxlari). Repoda ma'lumot YO'Q - R2 da, faqat o'qiladi:

| Qatlam | Yo'l | Mazmun |
|---|---|---|
| Eski katalog (REVIEW_ONLY) | R2 `R2_CANONICAL`: `norm-katalog/<rev>/{manifest,tree,works}.json` + `norm-katalog/<rev>/s/NNNN.json` (sbornik shard, gzip, sha256 manifestda). Endpoint: `functions/api/norm-katalog.ts` (`GET ?f=current`, `?rev=&f=`) | `works.json` - 54 013 ish; shard: `recipes[workId] = [rid, resourceCode, resourceIdCode, norm(NormaR), status, candidates...]`, `resources[rid] = [code, idCode, name, unit, Tip]`, `prices[resourceCode] = [pid, region(Rajon), Cena, Transp]` |
| Yangi kutubxona (Studio tanlovi) | R2: `norm-library/review-releases/66bb1a23bd18c63006d447b5/` (`navigation.json`, `works.jsonl.gz`, `collection-000..111.json.gz`, `coefficient-rules.json`). Endpoint: `functions/api/norm-library.ts`. Hujjat: `docs/architecture/NORM_LIBRARY_STUDIO_20261023.md` | 48 083 ish, 112 sbornik, 432 277 resurs qatori; har resurs kategoriyasi aniq (mehnat/mashinist/mashina/material); 2 411 normada resurs tarkibi yo'q |

Brauzer klientlari (bitta interfeys): `RemoteNormCatalog.open()` (`src/lib/catalog-extraction/norm-remote.ts`) va `NormLibraryCatalog.open()` (`norm-library.ts`) -> `await catalog.load(workId)` (sbornik shardini yuklaydi, sha256 tekshiradi) -> `catalog.detail(workId)` = `{recipes:[{resourceCode, norm, candidates:[{name, unitCode, type}], prices:[...]}]}`. Smetaga muzlatish: `snapshotWork()` (`src/lib/smeta-studio/catalog-bridge.ts`), qoralama qatori: `buildNormDraftLine()` (`norm-draft.ts`).

Xulosa va oqibatlar:
- **RES kengaytirish = `catalog.detail(tanlangan ish id)`**; yangi jadval/RPC yaratilmaydi. Ish tanlangach resurslar (mehnat/mashina/material) normasi shu yerdan keladi, narx esa alohida (`src/lib/narx-katalog/price-remote.ts`, hudud bo'yicha; narx doim QQS siz).
- Server tomonda (Pages Function) shu fayllarni `R2_CANONICAL` orqali o'qish mumkin, lekin hozirgi quvur (tanlov, birlik tekshiruvi, snapshot) brauzerda; ustasi 1-bosqichda ham shunday qoladi (server faqat Scope beradi).
- Eval (oflayn): `NormLibraryCatalog.open()` ga fayl-fetcher beriladi (lokal reliz papkasi) - tarmoq/DB kerak emas.
- `t2_normativ_qidir_v1` (`functions/api/normativ-qidir.ts`) bu ISH normasi emas, ShNQ **hujjat matni** (PDF dalili) qidiruvi - RES manbai emas; ustasi uni faqat «normativ asos» ko'rsatish uchun ishlatadi.
- Kompaniya o'z ish-ABC (`ish_abc_saqla_v1`, `IshAbcModal.tsx`) va yuklangan smetalar tajribasi (`t2_ish_tajriba_qidir_v1`, `t2_norma_tajriba_v1`) - ikkinchi darajali manba (kompaniya darajasi), katalogni almashtirmaydi.
- Ochiq: 2 411 norma resurs tarkibisiz - ular «tayyor ish» sifatida qo'shilmaydi (mavjud qoida).

## 2. Quvur (pipeline)

```
matn (+ keyin: fayl dalillari)
  -> [MODEL] ustasi_scope: Scope {elementlar, olchamlar{value,unit,source}, taxminlar, savollar}     (aiHisobli, smeta_ai / smeta_ustasi_scope)
  -> [KOD]   scopeTekshir: sxema, chegara, birlik almashtirish, "user" son matnda bormi, ro'yxatda yo'q = rad
  -> [KOD]   kengaytir: element + agar(shart) -> qoida; formula o'lchami tekshirilgan; hajm = aniq hisob + yaxlit2
  -> IshNiyati[] (mavjud protokol: qidiruv ibora, toplam ishora, hajmIfoda, taxmin, holat) + savollar
  -> [MAVJUD QUVUR] nomzodlarTop (BM25) -> tanla (model, nomzodlar orasida) -> smetaga qo'shish (Studio, 1 bosish, 1 bekor)
  -> [KEYINGI HAFTALAR] RES: catalog.detail -> narx (price-remote) -> koeffitsient takliflari
```

`ustasi_scope` hech narsa yozmaydi (faqat taklif) - `write-command-policy` ga qo'shilmaydi (smeta-ai boshqa amallari kabi); rol/kompaniya a'zoligi mavjud tekshiruv orqali. Token yechish `aiHisobli` ichida (limit, hamyon).

## 3. Model va kod chegarasi

| Model (ma'no) | Kod (aniqlik) |
|---|---|
| Matndan element/o'lcham ajratish, aytilmaganini savolga aylantirish | Shablon tanlash, shart tekshirish |
| (keyin) nomzodlar orasidan ma'no bo'yicha tanlash | Hajm formulasi, birlik/o'lcham tekshiruvi, yaxlit2 |
| Taxmin sababini yozish | Birlik moslik, norma kodi/narx/summa - HECH QACHON modeldan emas |

Qoidalar: jim sukut qiymat yo'q (yetishmagan parametr = savol + ish HAJM_KERAK); model "user" deb belgilagan son matnda bo'lmasa "assumed" ga tushadi; taxminli qiymat ishlatilgan ish `taxmin` bilan foydalanuvchi tasdig'ini kutadi; foydalanuvchi matni ichidagi ko'rsatmalar bajarilmaydi (prompt-injection). Pul hisoblari ustasida YO'Q (summa Studio/hisob-yadro).

## 4. Shablonlar - EGASI TEKSHIRISHI KERAK

`frontend/src/lib/smeta-ustasi/shablon/xususiy-uy.json` (v0.1.0, holat `EGASI_TEKSHIRISHI_KERAK`). 1-2 qavatli xususiy uy: yer ishlari, poydevor (lenta/plita), devor (g'isht/gazoblok + armopoyas), oraliq yopma (monolit), tom (profnastil/shifer/metallocherepitsa), deraza/eshik, suvoq, pol, muhandislik (joy-egasi). Norma KODI YO'Q - faqat rus qidiruv iboralari va to'plam ishoralari (E01, E06, E08, E10, E11, E12, E15, E16-E20; manba: `src/lib/smeta-ai/prompt.ts`; ishora filtr emas). Statik tekshiruv (`shablonXatolari`): formula o'lchami birlikka mos, parametrlar mavjud, shartlar to'g'ri, qidiruv ruscha va kodsiz.

Egasi albatta ko'rib chiqsin:
1. Har qoidaning formulasi va izohi (ayniqsa: yalpi pol maydoni, ochiqlik ayirish, lenta balandligi = transheya - podbetonka, plita kotlovani, armopoyas, yopma soni).
2. Rus qidiruv iboralari va to'plam ishoralari; gidroizolyatsiya to'plami belgilanmagan (tekshirilmagan).
3. Tushib qolgan ishlar: ichki devor (peregorodka) va ularning suvog'i, shift, pol osti qatlami, zinalar, sokol, vertikal gidroizolyatsiya, armatura/qolip alohida (norma tarkibiga kirishini tekshirish - `foundationSourceContext` qoidasi), qo'shimcha koeffitsientlar (seysmik, qish).
4. Parametr chegaralari (min/max) va tavsiya qiymatlari; stropila normasi birligi (m3 bo'lsa qo'lda).
5. Muhandislik joy-egalari (hajm loyihadan).

## 5. Metrikalar va chegaralar (taklif)

Eval: `frontend/scripts/smeta-ustasi-eval.mjs` (Vite SSR orqali TS modullar; qo'shimcha bog'liqlik yo'q). Keyslar repodan TASHQARIDA (`D:\BOG_MIYASI\ESLATMA_EVAL\`, tuzilma o'sha papkaning README'sida), kutilgan ishlar `smetaAnatomiya` (asosiy LRV) dan olinadi - parallel parser yo'q. Repoda faqat sintetik fixture (`src/lib/smeta-ustasi/eval/fixture/`).

| Metrika | MVP chegarasi |
|---|---|
| top-3: kutilgan norma kodi nomzod ro'yxatining dastlabki 3 tasida | >= 70% |
| ish recall: kutilgan kodlarning hosil ro'yxatda bo'lish ulushi | >= 70% |
| jami summa +-15% (hosil / kutilgan) keyslarning | >= 60% |
| (kuzatuv) top-1, top-15 (nomzod recall), katalogda yo'q ulushi | - |

Baseline hozir: joriy leksik matcher (`nomzodlarTop`, BM25) kutilgan ish NOMLARI bo'yicha - bu tavsifdan ishlar chiqarishdan oson, shuning uchun top-3 yuqori chiqishi mumkin; ustasining haqiqiy recall'i `hosil.json` (quvur natijasi) berilganda o'lchanadi. "Katalogda yo'q" ishlar (kod katalogda topilmadi) maxrajdan chiqariladi va alohida hisoblanadi.

Keys talabi (egasidan): 15-30 ta tasdiqlangan xususiy uy smetasi (g'isht/gazoblok, lenta/plita, 1/2 qavat, tom turlari), har biriga uyning erkin matnli tavsifi (smetachi yozadigandek, o'lchamlar bilan).

## 6. Fazalar

1. (shu PR) RES manbasi aniqlandi; xususiy uy shabloni (qoralama); `ustasi_scope` + deterministik kengaytirish; oflayn eval + baseline.
2. UI: Scope savollari -> javob -> qayta kengaytirish (savol/javob bosqichi); fayl dalillari (loyiha PDF/rasm) `fayl_idlar` orqali.
3. IshNiyati -> nomzodlar -> tanlov (mavjud quvur) -> RES (`catalog.detail`) -> narx -> koeffitsient takliflari.
4. Shablonlar kengayishi (egasi tasdig'i bilan), eval keyslari o'sishi, chegaralar bo'yicha qaror.
5. Kompaniya/platforma tajribasidan o'rganish (`tajriba.ts`) - shablon qoidalari takliflari egasi tasdig'iga.

## 7. Studio bilan integratsiya nuqtalari (bu PR'da Studio fayllari O'ZGARTIRILMAGAN)

- `/api/smeta-ai` `amal: 'ustasi_scope'` -> `{scope, rad, kengaytma:{ishlar: IshNiyati[], savollar, otkazilgan}, shablon}`; `ishlar` mavjud `suhbat` javobidagi `ishlar` bilan bir xil shakl (`AiIsh` ga `birlashtir()` orqali).
- Studio'dagi `nomzodlarTop`/`tanlovSorovi`/`smetagaQoshish` (worker.ts) o'zgarishsiz qayta ishlatiladi.
- Taxminli ish (`taxmin`) va HAJM_KERAK mavjud tasdiq oqimiga tushadi (`tasdiqKerak`).
- UI (Codex Studio lane): savollar paneli + qayta kengaytirish tugmasi - alohida PR, shu kontraktga tayanadi.
