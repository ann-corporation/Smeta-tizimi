# smeta-mcp — Smeta tizimi (T2) uchun MCP server

Claude Code va Codex tizim bilan **to'g'ridan-to'g'ri** ishlaydi: Postgres (Supabase, project `tuoyrzadkgoltpqkdiyx`) ga
`pg` orqali ulanadi. Brauzer va skrinshot kerak emas. Har nuqtani o'qish va tahrirlash mumkin — cheklov yo'q;
himoya = **avtomatik snapshot + audit + dry_run**, rad etish emas.

Hisob-kitob frontend sof mantig'idan olinadi (`frontend/src/lib/*` bundle qilinadi, nusxa yozilmagan):
pereraschet, ustamali summa (kaskad + podval), bo'lim summalari, F2 import (parser → moslash → exact yozish),
F2 dublikat tekshiruvi, Qamrov %. Pul — NDS siz; har summa ustamasiz va ustamali (ИТОГО-4), NDS alohida; `null` — noma'lum (0 emas).

## Toollar

| Tool | Tur | Nima qiladi |
|---|---|---|
| `sql_oqish(sql, params, limit, offset, jami, format)` | o'qish | istalgan SELECT (READ ONLY tranzaksiya), sahifalash, markdown jadval |
| `sxema(jadval? \| funksiya? \| qidir?)` | o'qish | jadvallar, ustunlar, PK/FK, indeks, trigger, RLS, view/funksiya ta'rifi |
| `obyektlar(kompaniya_id?)` | o'qish | obyektlar ro'yxati |
| `obyekt_holat(obyekt_id, daraja?, bolim_id?)` | o'qish | bo'lim daraxti: smeta/fakt/F2/qoldiq/almashtirilgan (ustamasiz+ustamali), Nakopitelniy jami |
| `qator(id)` / `qator_qidir(obyekt_id, matn\|kod\|tur)` | o'qish | qator + ota zanjiri + bolalar + fakt/F2 tarixi |
| `f2_royxat(obyekt_id, tur?)` / `f2(akt_id)` | o'qish | aktlar; akt qatorlari va jami |
| `pereraschet(obyekt_id, bolim_id?)` | o'qish | `lib/pereraschet.ts` — ortiqcha/olinmagan/narx farqi/chegirma |
| `snapshot_royxat`, `snapshot_farq` | o'qish | `snapshot` sxemasi |
| `aktor(qidir?)`, `aktor_tanla(id)` | sessiya | RPC aktorini tanlash (t2_foydalanuvchi) |
| `rpc(nom, args, obyekt_id?, dry_run)` | **yozish** | istalgan RPC; `p_actor_id`/`p_kim`/`p_actor_label`/`p_operation_id` avtomatik |
| `fakt_qamrov(obyekt_id, qamrov_id, foiz, sana, …, dry_run)` | **yozish** | Qamrov % (`lib/fakt-qamrov.ts`) → `t2_fakt_yoz_v2` |
| `f2_import(obyekt_id, fayl_yoli, …, dry_run)` | **yozish** | lokal Excel F2 → qoralama akt (`t2_akt_yarat_v2`) |
| `qator_tahrir(id, maydonlar)`, `qator_qosh`, `qator_ochir` | **yozish** | `t2_qator` to'g'ridan-to'g'ri (asl smeta — ogohlantirish bilan) |
| `sql_yozish(sql, params, obyekt_id?, dry_run)` | **yozish** | istalgan DML/DDL |
| `snapshot_ol`, `snapshot_qaytar` | **yozish** | qo'lda snapshot / qaytarish |

**Har yozish** bitta tranzaksiyada: obyekt aniqlanadi → `snapshot.ol(obyekt,'mcp_oldi',…)` (sxema bazada bo'lsa;
bo'lmasa — ogohlantirish) → amal → `t2_audit_yoz` (modul=`mcp`) → COMMIT. `dry_run:true` — to'liq preview, so'ng ROLLBACK.
Triggerlar uchun `t2.manba='mcp'`, `t2.kim='mcp:actor:<id>'`. Har tool chaqiruvi lokal auditga ham yoziladi:
`%LOCALAPPDATA%\smeta-mcp\audit.jsonl` (argumentlar maxfiy qiymatlarsiz).

## Sozlash (egasi bajaradi)

### 1. Build

```powershell
cd "<repo>\mcp\smeta-mcp"
npm ci
npm run build          # → dist\index.js
```

> Repo Google Drive papkasida bo'lsa, `node_modules` sinxronlanmasligi uchun repo'ning lokal nusxasida
> (masalan `C:\Temp\...` worktree yoki `git clone`) build qilish tavsiya etiladi. Frontend `lib/` o'zgarganda — `npm run build` qayta.

### 2. Ulanish satri (faqat muhit o'zgaruvchisi)

Supabase Dashboard → loyiha → **Connect** → **Session pooler** → URI (`postgresql://postgres.tuoyrzadkgoltpqkdiyx:[PAROL]@aws-…pooler.supabase.com:5432/postgres`),
`[PAROL]` o'rniga baza parolini qo'ying. Uni Windows **foydalanuvchi** muhitiga yozing (parol buyruqlar tarixiga tushmasligi uchun — maxfiy kiritish):

```powershell
$s = Read-Host 'SMETA_DB_URL' -AsSecureString
[Environment]::SetEnvironmentVariable('SMETA_DB_URL', [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)), 'User')
Remove-Variable s
```

Ixtiyoriy (o'zingizning `t2_foydalanuvchi.id` — `aktor` tooli bilan topiladi):

```powershell
[Environment]::SetEnvironmentVariable('SMETA_AKTOR_ID', '<id>', 'User')
```

Yangi muhit o'zgaruvchisi ko'rinishi uchun Claude Code / Codex / terminalni qayta oching.
Boshqa sozlamalar: `SMETA_MCP_AUDIT` (audit fayli yo'li), `SMETA_MCP_TIMEOUT_MS` (standart 120000),
`SMETA_DB_ROLE` (tranzaksiyada `set local role`, masalan `service_role`), `SMETA_DB_SSL=verify` (TLS sertifikatini qat'iy tekshirish).

### 3. Tekshirish (faqat o'qish)

```powershell
node "<repo>\mcp\smeta-mcp\dist\index.js" --smoke 153
```

### 4. Claude Code'ga ro'yxatdan o'tkazish

```powershell
claude mcp add smeta -s user -- node "<repo>\mcp\smeta-mcp\dist\index.js"
claude mcp list
```

(`SMETA_DB_URL` foydalanuvchi muhitidan meros oladi — config faylga yozilmaydi.)

### 5. Codex (`%USERPROFILE%\.codex\config.toml`)

```toml
[mcp_servers.smeta]
command = "node"
args = ['<repo>\mcp\smeta-mcp\dist\index.js']
env_vars = ["SMETA_DB_URL", "SMETA_AKTOR_ID", "LOCALAPPDATA"]
startup_timeout_sec = 30
tool_timeout_sec = 600
```

`env_vars` — muhit o'zgaruvchilarini nomi bo'yicha uzatadi (qiymat config'ga yozilmaydi). Parolni `env = {…}` ichiga yozmang.

## Ish oqimlari (chatdan kundalik PTO ishi)

Yuqori darajali toollar — UI'dagi amallar bilan bir xil RPC'lar orqali. **`dry_run` standart `true`**: server tekshiruvlari
(RPC ham) to'liq ishlaydi, so'ng ROLLBACK; yozish uchun `dry_run:false` (obyekt bo'yicha alohida tranzaksiya → snapshot → amal →
audit → COMMIT). Javob ixcham: sonlar, summa **ustamasiz / ustamali (ИТОГО-4) / QQS bilan** (`t2_obyekt_nakrutka` kf_*), namuna qatorlar
(`korsat`). `operation_id` (uuid) — idempotentlik (ko'p obyektda har biriga barqaror hosila). Tasdiqlangan F2 tahrirlanmaydi; null ≠ 0.

| Tool | RPC | Nima qiladi |
|---|---|---|
| `yoyilma(obyekt_idlar \| shartnoma_id, narx_override?)` | — (o'qish) | fakt / F2-mumkin / F2 qoralama / F2 tasdiqlangan — «summa qayerdan» jadvali |
| `f2_qoralama_yarat(obyekt_idlar, oy, raqam?, narx_override?, chang_pul?)` | `t2_akt_yarat_v2` | fakt qoldig'idan (f2_mumkin) F2 qoralama; ish narxsiz, resurs smeta narxida, narxsiz — avto |
| `f2_holat(akt_idlar, holat, sabab?, toliq_tasdiq?)` | `t2_akt_lifecycle_transition_v1` | draft→submitted→checked→approved, rad/bekor; xato kodlari izohli |
| `f2_qoralama_tahrir(akt_id, ozgartir?, olib_tashla?, qosh_mumkindan?)` | `t2_f2_qoralama_yangila_v1` | qoralama qatorlari: hajm/narx/narxsiz, olib tashlash, qoldiqdan qo'shish (storno tegilmaydi) |
| `podval_tahrir(obyekt_idlar, foizlar, baza?, dalil?, katak?)` | `t2_nakrutka_podval_saqla_v1` | podval foizlari (tr_mat, skl_mat, skl_mk, tr_kab, prochie, tr_ob, zag_ob, strax, risk, nds); kf/ИТОГО-4 oldin→keyin |
| `narx_tuzat(sabab, narxlar? \| nusxa?)` | t2_qator (to'g'ridan) | narx → summa = hajm×narx, ish (bl) summasi qayta; boshqa versiyadan × koef |
| `bajarilmadi(obyekt_id, amal, qatorlar, sabab_kod, faktni_nol?)` | `t2_bajarilmadi_belgila_v1` / `_bekor_v1` | «bajarilmadi» belgisi (+ faktni −delta bilan nolga) |
| `qoshimcha_ish(obyekt_id, ish, resurslar, fakt_hajm?, sabab)` | `t2_ish_abc_saqla_v1` (additional) | smetadan tashqari ish + resurslar (+ fakt) |
| `fakt_yoz(obyekt_id, qatorlar[{qator_id,hajm}], sana?, izoh?)` | `t2_fakt_yoz_v2` | fakt delta (minus — kamaytirish) |

Namunalar:

- Oy yopish: `yoyilma {obyekt_idlar:[11,12]}` → `f2_qoralama_yarat {obyekt_idlar:[11,12], oy:"2026-10", chang_pul:1000}` (preview) →
  `… dry_run:false` → narxsizlar bo'lsa `f2_qoralama_tahrir {akt_id, ozgartir:[{qator_id, narx}]}` → `f2_holat {akt_idlar:[…], holat:"approved", toliq_tasdiq:true, dry_run:false}`.
- Rad etish: `f2_holat {akt_idlar:[5], holat:"rejected", sabab:"hajm qayta tekshirilsin", dry_run:false}`.
- Podval: `podval_tahrir {obyekt_idlar:[11], foizlar:{tr_mat:4.5, prochie:8, nds:12}, dalil:"smeta podvali, 1-varaq"}`.
- Narx: `narx_tuzat {sabab:"protokol №3", narxlar:[{qator_id:101, narx:12500}]}` yoki
  `narx_tuzat {sabab:"eski versiya narxi", nusxa:{obyekt_idlar:[11], koef:1.07}}`.
- Bajarilmadi: `bajarilmadi {obyekt_id:11, qator_idlar:[201,202], sabab_kod:"loyiha_ozgardi", faktni_nol:true}`.

### PTO qamrovi v1 (to'liq xarita — `docs/mcp/QAMROV_AUDIT.md`)

| Tool | RPC | Nima qiladi |
|---|---|---|
| `zamena_qosh(obyekt_id, almashtirilayotgan_qator_id, rejim?, ish?, resurslar?, almashtirish_hajm?, sabab)` | `t2_ish_abc_saqla_v1` (replacement / resurs_zamena) | ish yoki resurs zamenasi, resurslar bilan; ota/versiya avtomatik |
| `ish_ochir(obyekt_id, qator_id, sabab, fakt_bilan?)` | `t2_ish_abc_ochir_v2` / `_v1` | qo'shilgan ish/zamenani o'chirish; sof nol fakt xavfsiz arxivlanadi, F2 da — rad |
| `f2_qoralama_yangila(akt_idlar, narxlar?, narx_qoida?, qosh_yangi?)` | `t2_f2_qoralama_yangila_v1` | qoralama hajmi = joriy fakt qoldig'i (boshqa qoralamalar ayirilgan), narx = max(smeta, xarid) |
| `f2_yarat(obyekt_id, oy, qatorlar[{qator_id,hajm,narx?,summa?}], raqam?)` | `t2_akt_yarat_v2` | aniq certified_* qatorli F2; bl/narx 0 — price_intentionally_absent |
| `akt_bekor(akt_idlar, sabab)` | `t2_akt_bekor` / lifecycle cancelled | fakt hujjati yoki F2 (qoralama va tasdiqlangan) ni bekor qilish; tasdiqlangan F2 — lifecycle, bog'liq Forma 3/storno/muhr bo'lsa DEPENDENTS_EXIST aniq ro'yxat bilan |
| `forma3(amal, obyekt_id \| loyiha_id, davr_boshi?, davr_oxiri?, akt_idlar?)` | `t2_forma3_royxat_v1` / `t2_forma3_yarat_v1` | Форма 3 ro'yxati / yaratish |
| `nakopitelniy(obyekt_id, davr?, bolim_id?, matn?)` | `t2_nakopitelniy_v2` (o'qish) | barcha sahifalar, server jami, bo'lim kesimi |
| `ostatka(obyekt_id, bolim_id?, faqat?)` | `t2_qator_holat` (o'qish) | qoldiq / ortiqcha / zamena / almashtirilgan — qator va bo'lim bo'yicha |
| `shartnoma_moslash(obyekt_idlar \| shartnoma_id, pozitsiyalar)` | — (o'qish) | shartnoma/hisob-faktura pozitsiyalari → smeta qatori nomzodlari (ishonch bilan) |
| `fakt_jurnal(obyekt_id, qator_idlar? \| bolim_id?, sana_dan?, sana_gacha?)` | — (o'qish) | fakt yozuvlari tarixi va qator bo'yicha sof fakt |
| `normativ_qidir(obyekt_id, matn, tur?)` | `t2_normativ_qidir_v1` / `t2_resurs_qidir_v1` / `t2_ish_turi_qidir_v1` | ShNK, resurs va ish turi variantlari |

## Ishlatish namunalari

- «153 obyekt holati, 2-darajagacha» → `obyekt_holat {obyekt_id:153, daraja:2}`
- F2 import: `f2_import {obyekt_id, fayl_yoli, raqam, dry_run:true}` → `qolgan`/`takliflar` ni ko'rib, `boglar`/`taklif_qabul` bilan qayta (`dry_run:false`).
- Fakt: `fakt_qamrov {obyekt_id, qamrov_id:<bo'lim>, foiz:70, dry_run:true}`.
- Xato bo'lsa: `snapshot_royxat` → `snapshot_farq` → `snapshot_qaytar {snapshot_id, tasdiq:true, obyekt_id}`.

## Ishlab chiquvchi uchun

```powershell
npm run typecheck; npm test; npm run build
```

- `stubs.mjs`: Node'da brauzer modullari almashtiriladi (`i18n/til` → oddiy `t()`, `api/supabase` → chaqirilsa xato).
  Ixtiyoriy modul (`@frontend-ixtiyoriy/fakt-qamrov`) — fayl bo'lsa haqiqiysi, bo'lmasa «yo'q» stubi.
- Testlar haqiqiy ulanishsiz (mock pg); real mijoz ma'lumoti fixture'larda yo'q.
- Ulanish satri hech qachon chop etilmaydi: `src/maxfiy.ts` (xato, javob, audit — hammasi `yashir()` dan o'tadi).
