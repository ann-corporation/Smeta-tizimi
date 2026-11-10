# Masofaviy MCP (smeta-mcp-remote) — istalgan AI chatdan, noutbuk o'chiq bo'lsa ham

Lokal `mcp/smeta-mcp` — stdio server, noutbukda ishlaydi va bazaga `SMETA_DB_URL` bilan ulanadi. `mcp/smeta-mcp-remote` — o'sha
toollarning **Cloudflare Worker** dagi masofaviy varianti: claude.ai (web/mobil) custom connector, ChatGPT connector / developer mode
va boshqa MCP mijozlari ulanadi. Tool mantig'i **bitta** — `mcp/smeta-mcp/src/tools/*` (fork yo'q); Worker faqat transport, OAuth,
tenant doirasi va yozish siyosatini qo'shadi.

## Arxitektura

```
AI chat (claude.ai / ChatGPT / boshqa MCP mijoz)
   │  Streamable HTTP  POST https://<worker>/mcp   (Authorization: Bearer <OAuth access token>)
   ▼
Cloudflare Worker «smeta-mcp»  (mcp/smeta-mcp-remote)
   ├─ @cloudflare/workers-oauth-provider — OAuth 2.1: /.well-known/*, /register (dinamik ro'yxat), /authorize, /token, PKCE S256,
   │     token xeshlari + grantlar KV da (OAUTH_KV); access token 1 soat, refresh 30 kun
   ├─ /authorize — Smeta tizimi login/paroli: t2_parol_tekshir_v1 (sayt bilan bir xil), t2_men_v1 (hisob faol, kompaniyalar)
   ├─ /mcp — har so'rovga yangi McpServer (@modelcontextprotocol/sdk 1.32.2, lokal server bilan bir xil), stateless JSON
   │     1) token props → foydalanuvchi_id; 2) jonli vakolat roleAuthority → t2_men_v1 (≤60 s kesh, sessiya_bekor_dan)
   │     3) argumentlardagi har id (obyekt/qator/akt/snapshot/shartnoma/loyiha/kompaniya) → kompaniya → a'zolik tekshiruvi
   │     4) yozish: dry_run standart true; haqiqiy yozish faqat dry_run:false + tasdiq:true va yozuvchi rol (mayWriteCompanies)
   │     5) umumiy toolChaqir → Muhit (snapshot → amal → audit t2_audit_yoz, aktor bilan → COMMIT / ROLLBACK)
   ▼
Hyperdrive (HYPERDRIVE) → Supabase Postgres  — RPC'lar p_actor_id = OAuth bilan kirgan foydalanuvchi
```

Nega Hyperdrive + pg (PostgREST emas): mavjud toollar SQL o'qiydi (t2_qator_holat, daraxt, snapshot sxemasi) va yozishni bitta
tranzaksiyada snapshot + RPC + audit + dry_run ROLLBACK bilan bajaradi. PostgREST bilan bu kafolatlar (ROLLBACK preview, snapshot
oldi) yo'qoladi va mantiqni qayta yozish (dublikat) kerak bo'lardi. RPC'lar baribir `p_actor_id` bo'yicha o'z tekshiruvini qiladi.

### Ochiq toollar (v1)
O'qish: `obyektlar, obyekt_holat, qator, qator_qidir, f2_royxat, f2, pereraschet, nakopitelniy, ostatka, fakt_jurnal, normativ_qidir,
shartnoma_moslash, yoyilma, snapshot_royxat, snapshot_farq`.
Yozish (dry_run standart): `fakt_yoz, f2_qoralama_yarat, f2_qoralama_tahrir, f2_qoralama_yangila, f2_holat, f2_yarat, zamena_qosh,
ish_ochir, akt_bekor, forma3, bajarilmadi, qoshimcha_ish, narx_tuzat, podval_tahrir, snapshot_ol, snapshot_qaytar`.
Resurs: `smeta://qoidalar` — domen qoidalari (NDS siz, ustamasiz/ustamali, asl smeta const, F2 narxi = max(smeta, xarid), dry_run/tasdiq).

**Ochilmagan:** `sql_yozish`, `rpc` (xom yozish), `sql_oqish` (xom SQL da tenant filtrini kafolatlab bo'lmaydi — v1 da admin uchun ham
yo'q; kerak bo'lsa keyin faqat superadmin + READ ONLY + qator limiti + ruxsat etilgan view'lar ro'yxati bilan), `sxema`, `aktor`/`aktor_tanla`
(aktor OAuth dan), `qator_tahrir/qator_qosh/qator_ochir` (asl smeta const — domen toollari bor), `f2_import` (lokal fayl yo'li), `fakt_qamrov`.

### Himoya
- Anonim kirish yo'q: `/mcp` tokensiz → 401 + `WWW-Authenticate: resource_metadata=…`.
- Har chaqiruvda vakolat bazadan (tokendagi rolga ishonilmaydi). Saytda parol almashtirilsa / «boshqa qurilmalardan chiqish» —
  `sessiya_bekor_dan` orqali AI ulanishlari ham to'xtaydi (≤60 s). Hisob bloklansa — darhol (keyingi kesh yangilanishida).
- Begona kompaniya yoki mavjud bo'lmagan id — bir xil javob `RUXSAT_YOQ` (mavjudlik oshkor qilinmaydi). `obyektlar` — faqat o'z kompaniyalari.
- Tezlik: foydalanuvchiga 120 MCP so'rov/daqiqa; login — IP va login bo'yicha 10/daqiqa. So'rov tanasi ≤ 1 MB, javob matni ≤ 200 000 belgi.
- Audit: bazada `t2_audit_log` (modul `mcp`, `mcp:actor:<id>`), Workers Logs da har chaqiruv (argumentlar `argYashir` dan o'tadi; parol/kalit yo'q).

## Egasi uchun: deploy (bir marta)

Talab: Cloudflare hisobi (Pages loyihasi bilan bir xil), Node 20+. Barcha buyruqlar `mcp/smeta-mcp-remote` papkasida:

```powershell
cd mcp/smeta-mcp-remote
npm ci
npx wrangler login

# 1) OAuth KV
npx wrangler kv namespace create OAUTH_KV          # chiqqan id → wrangler.toml [[kv_namespaces]] id

# 2) Hyperdrive → Supabase (to'g'ridan-to'g'ri ulanish yoki session pooler, port 5432; lokal SMETA_DB_URL bilan bir xil foydalanuvchi)
npx wrangler hyperdrive create smeta-db --connection-string="<Supabase Postgres ulanish satri>"   # id → [[hyperdrive]] id

# 3) wrangler.toml [vars] MCP_PUBLIC_URL = barqaror URL (masalan https://smeta-mcp.<subdomain>.workers.dev yoki custom domen)

# 4) Sirlar (qiymatni so'raydi; repoga/terminal tarixiga yozilmaydi)
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY               # service_role kaliti (Pages dagi SUPABASE_KEY bilan bir xil)

# 5) Tekshiruv va deploy
npm test
npm run bundle:check
npx wrangler deploy
node smoke.mjs https://<MCP_PUBLIC_URL>             # faqat o'qish: discovery + 401 tekshiruvi
```

Sirlar ro'yxati (faqat nomlar): `SUPABASE_URL`, `SUPABASE_KEY` (Worker secret); Hyperdrive ulanish satri — Hyperdrive sozlamasida;
binding'lar: `OAUTH_KV`, `HYPERDRIVE`, `MCP_RATE`, `LOGIN_RATE`; var: `MCP_PUBLIC_URL`, `SMETA_MCP_TIMEOUT_MS`.

Custom domen (ixtiyoriy): Cloudflare dashboard → Workers → smeta-mcp → Settings → Domains & Routes → `mcp.<domen>`; keyin
`MCP_PUBLIC_URL` ni shu domenga o'zgartirib qayta deploy (eski tokenlar boshqa resource uchun bo'lgani sababli qayta ulanish kerak).

## Ulanish

**claude.ai (web va mobil, Pro/Max/Team/Enterprise):** Settings → Connectors → *Add custom connector* → Name: `Smeta tizimi`,
URL: `https://<MCP_PUBLIC_URL>/mcp` → *Add* → *Connect* → ochilgan sahifada Smeta tizimi login/paroli → ruxsat. Chatda «+» → connectorni yoqing.
Team/Enterprise da avval admin Organization settings → Connectors da qo'shadi.

**ChatGPT:** Settings → Apps & Connectors → Advanced → *Developer mode* yoqing → *Create* (yoki Add connector) → MCP server URL:
`https://<MCP_PUBLIC_URL>/mcp`, Authentication: **OAuth** → login sahifasida Smeta tizimi hisobi. Developer mode yozuvchi toollarga ham ruxsat beradi;
ChatGPT har yozuvdan oldin tasdiq so'raydi, server esa baribir `tasdiq:true` siz yozmaydi.

**Boshqa MCP mijozlari (Claude Desktop, Cursor, MCP Inspector):** Streamable HTTP URL `https://<MCP_PUBLIC_URL>/mcp`, OAuth avtomatik
(dinamik ro'yxat). Tekshirish: `npx @modelcontextprotocol/inspector` → URL.

Login: faqat Supabase paroli o'rnatilgan hisoblar. Faqat Google bilan kiradigan yoki hali eski (GAS) parolda turgan hisob — avval saytga
login/parol bilan bir marta kiring yoki profilda parol o'rnating.

## Lokal sinov (prodga yozmasdan)

```powershell
cd mcp/smeta-mcp-remote
"MCP_PUBLIC_URL=http://localhost:8787" | Out-File -Encoding ascii .dev.vars   # repoga kirmaydi
npx wrangler dev                       # Hyperdrive localConnectionString — lokal Supabase (supabase start) yoki sinov baza
node smoke.mjs                         # /health, OAuth discovery, PKCE, /mcp tokensiz 401, noma'lum client 4xx
```

`smoke.mjs` hech qanday tool chaqirmaydi. To'liq oqim uchun `wrangler dev` ga sinov bazasi va `.dev.vars` da sinov `SUPABASE_URL`/`SUPABASE_KEY`
bering, MCP Inspector bilan ulanib faqat o'qish toollarini va `dry_run` (standart) yozuvlarini sinang. Prod bazaga lokal `wrangler dev` ulamang.

## Rollback

- To'xtatish (darhol): `npx wrangler delete` (yoki dashboard → Worker → Disable). Barcha AI ulanishlari ishlamay qoladi; baza o'zgarmaydi.
- Oldingi versiyaga: `npx wrangler deployments list` → `npx wrangler rollback <version-id>`.
- Barcha OAuth tokenlarini bekor qilish: KV namespace `OAUTH_KV` ni tozalash (yoki yangisini yaratib id ni almashtirish) → hamma qayta ulanadi.
- Bitta foydalanuvchi: saytda parolni almashtirish / «boshqa qurilmalardan chiqish» (sessiya_bekor_dan) yoki a'zolikni o'chirish.
- Noto'g'ri yozuv: har haqiqiy yozuvdan oldin `snapshot_ol` avtomatik — `snapshot_royxat` → `snapshot_qaytar` (yoki lokal MCP bilan).

## Ochiq risklar / keyingi qadamlar
- Worker Postgres ga RLS siz (service darajasida) ulanadi: tenant chegarasi ilova qatlamida (doira tekshiruvi + RPC p_actor_id). Kelajakda
  Hyperdrive uchun alohida cheklangan DB roli (faqat kerakli RPC/jadval) tavsiya etiladi.
- `t2_effective_authorization_v1` obyekt darajasidagi ruxsat (loyiha/obyekt grantlari) web ilovada ham majburiy emas — masofaviy server web
  bilan bir xil darajada (kompaniya a'zoligi + rol). Obyekt grantlari joriy qilinsa, `src/vakolat.ts` ga qo'shiladi.
- Sovuq (R2 dagi) snapshot bloklari bilan `snapshot_farq/qaytar` Worker'da `CLOUDFLARE_API_TOKEN` siz ishlamaydi (aniq xato) — lokal MCP dan.
- Modul o'chirilgan kompaniyalar (`modullarOffByCompany`) v1 da hisobga olinmaydi.
