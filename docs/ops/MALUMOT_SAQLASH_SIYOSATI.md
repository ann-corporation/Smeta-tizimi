# Ma'lumot saqlash siyosati (issiq / sovuq, R2)

Holat: 2026-11-15. Egasi qarori: keraksiz tarix va versiyalar R2 da; yuklangan asl hujjatlarning hammasi R2 da (cloud); Google Drive kerak emas.
Real summa/nom bu hujjatda yo'q.

## 1. Tamoyillar
- Postgres = issiq, o'zgaruvchan biznes ma'lumoti. R2 = o'zgarmas fayllar va sovuq tarix.
- Postgres'da fayl baytlari saqlanmaydi (bytea/base64 ustun yo'q; yangi migratsiyada CI rad etadi).
- R2 ga yozish faqat `frontend/functions/_shared/r2-saqlash.ts` (`r2Yoz`) orqali. Yangi yuklash yo'li shu xizmatni (yoki `/api/hujjat-yukla`) ishlatadi.
- Hech narsa tasdiqlanmasdan bazadan o'chirilmaydi: R2 ga yoz -> HEAD -> qayta o'qi -> sha256 -> qator soni -> manifest -> o'chirish.

## 2. Reyestr (yagona manba)
`frontend/functions/_shared/arxiv-siyosat.ts` (nusxa: DB `t2_arxiv_siyosat`). Har tarix/log/versiya/snapshot/qoralama jadvali: issiq muddat, format, tiklash usuli.
CI guard (`src/lib/saqlash/arxiv-siyosat.test.ts`): `20261224100000` dan keyin migratsiyada `*_log, *_tarix, *_audit, *_ozgarish, *_qoralama, *_versiya, *_jurnal` yoki `snapshot.*` jadval yaratilsa va reyestrda bo'lmasa test yiqiladi.

| Jadval | Issiq muddat | Rejim |
|---|---|---|
| t2_onboarding_command_log, t2_addrepl_command, t2_ozgarish, t2_audit_log | 30 kun | qator-arxiv (ndjson.gz) |
| t2_f2_import_draft_qator (hal_qilinmagan bundan mustasno) | 14 kun | qator-arxiv |
| snapshot.bolak_mazmun | 30 kun | snapshot-sovuq (mavjud snapshot.sovuq_* oqimi) |
| t2_smeta_revision, t2_qator_muhr va boshqa biznes/FK jadvallar | - | saqlanadi (sababi reyestrda) |
Muddatni egasi o'zgartiradi: reyestr + `t2_arxiv_siyosat` seed (migratsiya) birga.

## 3. Arxivlovchi
- GitHub Actions `arxiv-tungi.yml` 21:30 UTC -> `POST /api/arxiv-tick` (X-Cron-Kalit = BILDIRISHNOMA_CRON_KALIT; Postgres R2 ga yoza olmaydi).
- Oyna 21:00-24:00 UTC; chaqiruvga <= 2 partiya/jadval, partiya <= 1000 qator (DB cheklovi 2000), partiyalar orasida 1,5 s va chaqiruvlar orasida 30 s pauza; statement_timeout 30 s, lock_timeout 3 s.
- R2 kaliti: `arxiv/<jadval>/<yyyy>/<mm>/<bosh>-<oxir>-<sha8>.ndjson.gz`; manifest `t2_arxiv_bolak(jadval, kalit_oraligi, r2_key, qator_soni, sha256, yaratildi)`.
- Idempotent: kalit mazmun xeshiga bog'liq; qisman xatoda baza butun qoladi va keyingi kecha shu partiya qayta urinadi.
- Monitoring: `t2_arxiv_ish_jurnal`; admin «Tizim holati» (DbHajmPanel) da baza hajmi + oxirgi ish + sutkada ko'chgan qator/MB + xatolar. Ogohlantirish: ish xatosi yoki baza > 450 MB (`ARXIV_OGOH_MB`, standart 450; reja chegarasi `DB_LIMIT_MB`) -> superadminlarga bildirishnoma (kuniga bir marta).

## 4. Tiklash
- Qator-arxiv: `POST /api/arxiv-tick {amal:'tikla', jadval, r2_key, sha256}` (manifestdagi qiymatlar) -> R2 dan o'qiydi, sha256 tekshiradi, `t2_arxiv_tikla_v1` mavjud qatorlarni o'tkazib qaytaradi.
- Snapshot: `snapshot_qaytar` / `snapshot_farq` (MCP) sovuq blokni R2 dan avtomatik tiklaydi (`mcp/smeta-mcp/src/snapshot-r2.ts`, DB `snapshot.sovuq_tikla` sha256 ni qayta tekshiradi).

## 5. Asl hujjatlar
- Yagona yo'l: brauzer -> `/api/hujjat-yukla` -> `R2_CANONICAL` (+ `t2_document_registry`), kalit `docs/{kompaniya}/{loyiha|0}/{obyekt|0}/d{id}/r{seq}`; sha256 bo'yicha dublikat birlashtiriladi.
- Chegara: 512 MiB (`CANONICAL_MAX_UPLOAD_BYTES`); bajariladigan turlar (exe, bat, js, ...) rad etiladi.
- Mijoz tomonda yangi fayl kiritish komponenti `aslFaylSaqla` (`src/api/t2-asl-fayl.ts`) ni ishlatadi; `src/lib/saqlash/yuklash-qoriqchi.test.ts` yangi chetlab o'tishni rad etadi. Hali ulanmagan eski komponentlar testdagi `BOSHLIQ` ro'yxatida (faqat qisqaradi).
- Google Drive: ixtiyoriy ham emas; ustunlarni o'chirish `20261230000000` (faqat Drive-only hujjat qolmaganda).
