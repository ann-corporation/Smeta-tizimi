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
