# TIZIM_02 SECOND MIND

Bu katalog TIZIM_02 agentlari uchun loyihaning qayta ishlatiladigan, dalilga
tayangan "ikkinchi miyasi"dir. U chat xotirasi yoki taxminlar ombori emas:

- `PROJECT_MEMORY.json` — mahsulot identiteti, invariantlar, domenlar va o‘qish
  yo‘nalishlari;
- `DECISIONS.json` — Product Owner va arxitektura qarorlari; har bir qaror
  evidence path bilan yuradi;
- `INDEX.json` — muhim governance, architecture, handoff va source fayllarning
  mavjudligi/hash indeksidir;
- `build-index.cjs` — indeksni real git daraxtidan qayta quradi;
- `verify.cjs` — second mind buzilmaganini, required evidence borligini va
  indeks eskirmaganini tekshiradi.

## Agent boot qoidası

Har qanday yangi TIZIM_02 ishida agent:

1. `AGENTS.md` boot chainini o‘qiydi;
2. `PROJECT_MEMORY.json` va `DECISIONS.json`ni o‘qiydi;
3. `INDEX.json` orqali relevant evidence fayllarni topadi;
4. source/runtime/governance holatini alohida tekshiradi;
5. `UNKNOWN`, `UNPROVEN`, `SOURCE_READY`, `DEPLOYED`ni bir-biriga
   almashtirmaydi;
6. ish tugaganda yangi dalil, qaror yoki statusni tegishli faylga yozadi va
   `node ops/second-mind/build-index.cjs`ni qayta ishga tushiradi.

## Nima avtomatik, nima inson qarori

Second mind kodni o‘zi o‘zgartirmaydi, productionga yozmaydi va AI orqali
business fact uydirmaydi. U faqat loyihani qayta topish va to‘g‘ri dalilni
o‘qish xarajatini kamaytiradi. Yangi business rule faqat:

- source code/migrationda real ko‘rinsa;
- qabul qilingan architecture/governance hujjatida bo‘lsa; yoki
- Product Owner qarori `DECISIONS.json`ga aniq yozilsa

canonical knowledge sifatida kiritiladi.

## Yangilash tartibi

```powershell
node ops/second-mind/build-index.cjs
node ops/second-mind/verify.cjs
node ops/governance-check.cjs
```

`INDEX.json`dagi hash faqat evidence fayli o‘zgarganini ko‘rsatadi; u fayl
mazmunini o‘zi authoritative deb belgilamaydi. Har bir task baribir tegishli
source/runtime testini bajarishi kerak.
