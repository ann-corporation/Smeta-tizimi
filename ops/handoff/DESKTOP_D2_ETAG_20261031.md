# D2 — obyekt paketi ETag/304

Codex@noutbuk; base fc4f0ea; branch codex/desktop-d2-etag.
Maqsad: accepted desktop ADR PR1b/D2 — triggersiz muhr, bir snapshotdan body+header, ruxsatdan keyin304.

## Implementatsiya

- CLI2.122.0 yaratgan migration `20261031181105_t2_obyekt_paket_muhr_v1.sql` + rollback + read-only acceptance. Faqat shu faylni review/apply; boshqa pending migrationga tegilmaydi. CLI sanasi mavjud oldinga sanalangan migrationlardan avval: avtomatik barcha pending apply ishlatilmaydi.
- Muhr: qator/akt/akt_qator count/sum(versiya)/max(id)/sum(id), obyekt/koeffitsient/podval/svod/versiya metadata manbalari, existing snapshot restore journal. NK hisobini qayta ishlatmaydi: uning manba koef/contract-link/podval/svod yozuvlarini hash qiladi; formula yo‘q. Hisob va view ta’riflari hash bilan saltga bog‘langan — code/default o‘zgarishi ham eskirtiradi.
- Muhim source audit: live `t2_zamena_qoplash` tarixiy qatorlarni ham o‘qiydi; shuning uchun texnik muhr barcha obyekt versiyalarini qamraydi. Bu biznes smeta readeri emas — packet v1 faqat faol qatorligicha qoladi. Funksiyada `versiya: texnik` comment bor.
- `snapshot.qaytarish_jurnal` object yoki whole-company hodisasi muhrga kiradi: trigger bypass bilan restore eski keshga teng chiqmaydi. Boshqa company restore muhrni o‘zgartirmaydi.
- `t2_obyekt_paket_etag_v1` STABLE wrapper: muhr va existing package RPC bir caller snapshotida; PostgREST response.headers orqali ETag. Package format/formulalari o‘zgarmaydi. Weak ETag biznes representation uchun.
- `OBYEKT_PAKET_ETAG=1` bilangina yangi RPC. Sukut eski endpoint; production env o‘zgartirilmadi. Auth/tenant/permission checkdan OLDIN304 yo‘q. No-store saqlanadi; disk keshi faqat ilova darajasida.
- Client `obyektPaketTekshir`304ni JSONsiz qaytaradi, oldingi muhr bilan tekshiradi; eski `obyektPaketOl` shakli saqlangan.

## Dalillar

- Live metadata SELECT: 3 asosiy jadvalning t2_versiya_oshir triggerlari faol; function mazmun o‘zgarganda versiyani oshiradi. `t2_qator_holat`, `t2_almashtirilgan_hajm`, `t2_almashtirilgan_oz_hajm`, `t2_zamena_qoplash` hamda snapshot journal columns o‘qildi. Production DDL/DML bajarilmadi.
- PostgreSQL17 snapshot qoidasi: https://www.postgresql.org/docs/17/xfunc-volatility.html . Bu MVCC reasoning dalili; real concurrent PostgREST smoke o‘rnini bosmaydi.
- PGlite28 checks PASS: inserts/deletes/versions, inactive/history, metadata, code-definition/default change, restore, company isolation, body/header, grants, rollback/reapply. Fixture actor/NK/package stub — real policy yoki calculation parity claim emas.
- Focused Vitest35 PASS (API old+new, client conditional, decoder, versiya guard).
- App TS / Functions TS / lint / diff-check PASS; mavjud lint warninglar qolgan.
- Full suite: 584 fayl/4268 test PASS; 12 fayl/25 test skip (476.80s), C:/Temp/desktop-d2-vitest.log.
- Governance: avvalgi4 AKKAUNT/DIZAYN/C11 policy/owns xatosi, yangi D2 conflict yo‘q.

## Real read-only performance dalili

Eng katta mavjud obyekt uchun existing NK RPC warm93.895/74.450ms — uni har muhrda qayta hisoblash50ms mezoniga yetmaydi. Shu sabab meta output o‘rniga uning tekshirilgan barcha input manbalari fingerprint qilindi. Yangi muhrga ekvivalent SELECT (function productionga o‘rnatilmagan) EXPLAIN ANALYZE: cold1084.892ms, warm34.367ms. Bu real DB read-only o‘lchov; final PL/pgSQL RPC<50ms acceptance hali o‘tkazilmagan. Sovuq latency yashirilmaydi. Hech qanday production DDL/DML yo‘q.

## Claude review / acceptance

1. Migrationni disposable/shadow yoki o‘z transaction reviewida tekshirish; productionga faqat Claude qo‘llaydi.
2. Read-only `.acceptance.sql` real body parity va eng katta3obyektda warm probe<50ms talab qiladi. No actor/no object bo‘lsa FAIL (silent skip yo‘q). Target DB performance hali UNKNOWN.
3. PostgREST response.headers va gateway 200/304ni authenticated Preview’da tekshirish. Keyin env flagni yoqish; ungacha default off.
4. Real concurrent writer/restore, permission revoke/cached-authority TTL va client offline cache receipt smoke kerak. D1b/session va D6auth integration alohida ochiq.

GOAL ACTIVE; D2 SQL productionga qo‘llanmagan; main/prod o‘zgarmagan. Bu PR butun Windows dasturi yoki offline liniyasi ready degani emas.
