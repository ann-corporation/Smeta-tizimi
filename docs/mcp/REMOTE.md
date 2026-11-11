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
ChatGPT uchun qo'shimcha (faqat o'qish): `search`, `fetch` (obyektlar bo'yicha; pastdagi «ChatGPT moslik»).
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

Sirlar ro'yxati (faqat nomlar): `SUPABASE_URL`, `SUPABASE_KEY` (Worker secret); ixtiyoriy «Google bilan kirish» uchun `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; Hyperdrive ulanish satri — Hyperdrive sozlamasida;
binding'lar: `OAUTH_KV`, `HYPERDRIVE`, `MCP_RATE`, `LOGIN_RATE`, `SNAPSHOT_R2` (R2 bucket `smeta-tizimi-canonical`); var: `MCP_PUBLIC_URL`, `SMETA_MCP_TIMEOUT_MS`, `SNAPSHOT_SOVUT_KUN`, `SNAPSHOT_SOVUT_LIMIT`.

Custom domen (ixtiyoriy): Cloudflare dashboard → Workers → smeta-mcp → Settings → Domains & Routes → `mcp.<domen>`; keyin
`MCP_PUBLIC_URL` ni shu domenga o'zgartirib qayta deploy (eski tokenlar boshqa resource uchun bo'lgani sababli qayta ulanish kerak).

## Kunlik snapshot sovutish (baza 500 MB dan oshmasligi uchun)

Yozuvchi toollar har yozuvdan oldin snapshot oladi, shu sabab `snapshot.bolak_mazmun` har kuni o'sadi. Worker'dagi kunlik cron
(`17 3 * * *`, `src/sovutish.ts`) 2 kundan eski bloklarni R2 ga ko'chiradi — noutbuksiz. Mantiq `frontend/src/lib/snapshot-r2/sovuq.ts`
dan import qilinadi (qo'lda skript `ops/scripts/snapshot-r2-sovut.mjs` bilan bir xil kod, fork emas).

- Nomzodlar `snapshot.sovuq_nomzod(2, 200, false)`: har obyektning ENG SO'NGGI snapshoti bloklari issiq qoladi; 2 kundan yangilari ham.
- Xavfsizlik tartibi (har blok): R2 ga yoz → R2 dan QAYTA o'qi → gunzip → sha256 solishtir → `sovuq_yoz` → `sovuq_tasdiq` → `sovuq_sovut`
  (DB o'zi sha256 ni yana tekshirib, faqat shundan keyin mazmunni NULL qiladi). Nomuvofiqlikda blok bazada tegilmagan qoladi.
- Partiya ≤ `SNAPSHOT_SOVUT_LIMIT` (200) blok, ≈20 s devor-soat byudjeti, 5 ta xatodan keyin to'xtaydi. Idempotent: sovutilgan blok qayta nomzod bo'lmaydi.
- Natija Worker logida (`wrangler tail` / dashboard Logs): `{"amal":"snapshot_sovutish","db_mb_oldin":..,"sovutildi":..,"xato":..}`.
- `SNAPSHOT_R2` binding yo'q bo'lsa sovutish jimgina o'tkazib yuboriladi (OAuth tozalash davom etadi).
- Hajm qo'riqchisi: `pg_database_size` > 450 MB bo'lsa cron logiga `DB_HAJM_OGOHLANTIRISH` yoziladi; `/health` JSON da `db_mb` (MB, 5 daqiqa keshlanadi, xatoda `null`).
- Bo'shagan joy: NULL qilingan TOAST sahifalari autovacuum orqali jadvalning o'zida QAYTA ISHLATILADI (fayl hajmi kichraymasa ham yangi
  snapshotlar shu joyga yoziladi). `VACUUM FULL snapshot.bolak_mazmun` Worker'da ishlamaydi; ixtiyoriy, qo'lda (jadval qisqa muddat qulflanadi)
  va faqat diskni darhol kichraytirish kerak bo'lganda.
- Qo'lda ishga tushirish (sinov): `npx wrangler dev --test-scheduled` → `curl "http://localhost:8787/__scheduled?cron=17+3+*+*+*"` (prod bazaga ulanmang).
## Ulanish

**claude.ai (web va mobil, Pro/Max/Team/Enterprise):** Settings → Connectors → *Add custom connector* → Name: `Smeta tizimi`,
URL: `https://<MCP_PUBLIC_URL>/mcp` → *Add* → *Connect* → ochilgan sahifada Smeta tizimi login/paroli → ruxsat. Chatda «+» → connectorni yoqing.
Team/Enterprise da avval admin Organization settings → Connectors da qo'shadi.

**ChatGPT:** batafsil — pastdagi «Egasi uchun: ChatGPT va Claude ga ulash». Qisqacha: Settings → Apps → Advanced → *Developer mode* → *Create* → URL
`https://<MCP_PUBLIC_URL>/mcp`, Authentication: **OAuth**. Developer mode yozuvchi toollarga ham ruxsat beradi; ChatGPT har yozuvdan oldin tasdiq so'raydi,
server esa baribir `tasdiq:true` siz yozmaydi.

**Boshqa MCP mijozlari (Claude Desktop, Cursor, MCP Inspector):** Streamable HTTP URL `https://<MCP_PUBLIC_URL>/mcp`, OAuth avtomatik
(dinamik ro'yxat). Tekshirish: `npx @modelcontextprotocol/inspector` → URL.

Login: login/parol (Supabase paroli o'rnatilgan hisoblar) yoki — yoqilgan bo'lsa — «Google bilan kirish» (pastda). Hali eski (GAS) parolda turgan hisob —
avval saytga login/parol bilan bir marta kiring yoki profilda parol o'rnating.

## ChatGPT moslik (texnik)

OpenAI talablari (https://developers.openai.com/apps-sdk/build/auth va /api/docs/mcp, 2026-11) va bizdagi holat:

| Talab | Holat |
|---|---|
| Remote MCP, HTTPS, Streamable HTTP | bor (`/mcp`, stateless JSON) |
| OAuth 2.1 + PKCE `S256`, `/.well-known/oauth-protected-resource` va `oauth-authorization-server` | bor (workers-oauth-provider) |
| Klient ro'yxati: **CIMD** (`https://chatgpt.com/oauth/client.json`, `none`/`private_key_jwt`) yoki **DCR** | ikkalasi: `clientIdMetadataDocumentEnabled: true` (`src/worker.ts`) + `/register`; `global_fetch_strictly_public` bayrog'i wrangler.toml da |
| RFC 9207 `iss` (`authorization_response_iss_parameter_supported`) | provider yoqadi va redirectga `iss` qo'shadi |
| `resource` parametri token auditoriyasiga | provider `resourceMetadata.resource` bilan |
| Redirect URI `https://chatgpt.com/connector_platform_oauth_redirect` (yoki `/connector/oauth/<id>`) | allowlist kerak emas (DCR/CIMD redirectni mijoz hujjatidan oladi); login sahifasi CSP `form-action` ga redirect origin'i (`https://chatgpt.com`) qo'shiladi — testlangan |
| Tool metadata `securitySchemes` (`oauth2`, scope `smeta`) | har toolda `_meta.securitySchemes` |
| Deep research / company knowledge uchun `search` + `fetch` (faqat o'qish, `structuredContent` + JSON matn, `url` bo'sh emas) | bor (`src/chatgpt.ts`): `search` — foydalanuvchi obyektlari, `fetch` — `obyekt:<id>` bo'yicha `obyekt_holat`. Tenant doirasi mavjud toollar orqali (`masofaviyChaqir`) — yangi SQL yo'q |
| Developer mode: to'liq tool to'plami, yozuvlarda tasdiq | bor; yozuvchilar `destructiveHint:true`, server `tasdiq:true` talab qiladi |

Eslatma: `search`/`fetch` natijasidagi `url` — `SAYT_URL` (ixtiyoriy var, standart `https://smeta-tizimi.pages.dev`) + `/?obyekt=<id>`; bu faqat iqtibos havolasi.

## Google bilan kirish (texnik)

`GOOGLE_CLIENT_ID` va `GOOGLE_CLIENT_SECRET` (Worker sirlari) ikkalasi o'rnatilmaguncha tugma ko'rinmaydi va yo'llar 404 qaytaradi.
Oqim: login sahifasidagi havola `/authorize/google?holat=<id>` → Google (`code` + PKCE S256 + `state` + `nonce`) → `/authorize/google/callback` →
`code` Google token endpointida almashtiriladi → `id_token` imzosi Google JWKS bilan, `aud`, `iss`, `exp`, `email_verified` (web ilova bilan bir xil
`frontend/functions/_shared/google-id.ts`) va `nonce` tekshiriladi → RPC `t2_google_mcp_kirish_v1(email, sub)`.

Qonunlar (testlangan):
- **Hech qachon hisob yaratilmaydi.** RPC faqat qidiradi (mavjud `t2_google_kirish_v1` dan farqli — u yangi hisob ochadi, MCP uchun ISHLATILMAYDI).
- Google muvaffaqiyati ruxsat bermaydi: topilgan foydalanuvchi uchun parol bilan kirishdagi kabi jonli vakolat (`t2_men_v1`: hisob faol, kamida bitta kompaniya a'zoligi) tekshiriladi.
- Moslik: avval `google_sub`; bo'lmasa `t2_foydalanuvchi.email` bo'yicha ANIQ BITTA faol foydalanuvchi (admin kiritgan email), shunda `google_sub` ulanadi (keyin email o'zgarsa ham shu Google hisob).
  Bir nechta mos kelsa — rad. Email tasdiqlanmagan o'zi ro'yxatdan o'tgan hisob avtomatik ulanmaydi (birovning emailini oldindan band qilishdan himoya).
- `state` bir martalik (KV, 10 daqiqa), login sessiyasi cookie'ga bog'langan; `nonce` id_tokenda tekshiriladi; tezlik chegarasi login bilan bir xil.
- **Migratsiya:** `supabase/migrations/20261212200000_t2_google_mcp_kirish_v1.sql` (+ `.rollback.sql`, `.acceptance.sql`). Qo'llanmagan — faqat egasi tasdig'i bilan,
  Worker deploydan OLDIN. Migratsiyasiz tugma bosilsa «Google bilan kirib bo'lmadi» xabari chiqadi (parol bilan kirish ta'sirlanmaydi).

## Egasi uchun: ChatGPT va Claude ga ulash (oddiy yo'l-yo'riq)

Ulanadigan manzil (hamma joyda bir xil): `https://smeta-mcp.anvar-ahatqulov.workers.dev/mcp`
Ekrandagi yozuvlar ChatGPT/Claude yangilanishiga qarab biroz farq qilishi mumkin — ma'nosi bir xil.

**Claude (claude.ai):**
1. claude.ai ga kiring → pastki chapda ismingiz → **Settings** → **Connectors**.
2. **Add custom connector** tugmasini bosing.
3. Name: `Smeta tizimi`. URL: yuqoridagi manzil. **Add**.
4. **Connect** ni bosing → ochilgan sahifada Smeta tizimidagi login va parolingizni kiriting (yoki «Google bilan kirish») → **Kirish va ruxsat berish**.
5. Yangi suhbatda «+» tugmasi → `Smeta tizimi` ni yoqing. Tayyor.
(Team/Enterprise rejasida avval tashkilot admini Organization settings → Connectors da qo'shadi.)

**ChatGPT (chatgpt.com):**
1. chatgpt.com ga kiring → ismingiz → **Settings** → **Apps** (ba'zan «Connectors») → **Advanced settings** → **Developer mode** ni yoqing.
   (Business/Enterprise rejasida buni ish maydoni admini yoqib beradi.)
2. **Create app** (yoki **Create**) ni bosing.
3. Name: `Smeta tizimi`. **MCP server URL**: yuqoridagi manzil. **Authentication**: **OAuth**. Qolgan maydonlarga tegmang (avtomatik). Xavfsizlik katagini belgilab **Create**.
4. **Connect** ni bosing → Smeta tizimi sahifasida login/parol (yoki «Google bilan kirish») → **Kirish va ruxsat berish**.
5. Yangi suhbatda «+» → **More** (yoki Developer mode) → `Smeta tizimi` ni tanlang. ChatGPT har yozish oldidan sizdan tasdiq so'raydi — o'qing va faqat to'g'ri bo'lsa tasdiqlang.

**«Google bilan kirish» ni yoqish (bir marta, Google Cloud Console da):**
1. https://console.cloud.google.com ga o'zingizning Google hisobingiz bilan kiring. Yuqoridagi loyiha tanlagichdan mavjud loyihani (Smeta tizimi saytida Google kirishi uchun ishlatilgan) tanlang.
2. Chapdagi menyu → **APIs & Services** → **OAuth consent screen** (yangi ko'rinishda **Google Auth platform**). Agar hali to'ldirilmagan bo'lsa: App name `Smeta tizimi`, User support email — o'zingizniki; Audience — **External**; **Publish app** (holat «In production» bo'lsin, aks holda faqat «test users» kira oladi).
3. **Credentials** (yangi ko'rinishda **Clients**) → **Create credentials / Create client** → **OAuth client ID**.
4. Application type: **Web application**. Name: `Smeta MCP`.
5. **Authorized redirect URIs** → **Add URI** va aynan shuni kiriting (bir harf ham o'zgarmasin):
   `https://smeta-mcp.anvar-ahatqulov.workers.dev/authorize/google/callback`
   («Authorized JavaScript origins» ga hech narsa yozish shart emas.) **Create**.
6. Chiqqan oynadan **Client ID** va **Client secret** ni nusxalang (secret — parol kabi, hech kimga yubormang, chatga yozmang).
7. Terminalda `mcp/smeta-mcp-remote` papkasida ikki buyruq (qiymatni so'raydi, o'zingiz kiritasiz):
   `npx wrangler secret put GOOGLE_CLIENT_ID` va `npx wrangler secret put GOOGLE_CLIENT_SECRET`. Keyin Worker qayta deploy qilinadi (buni Claude Code bajaradi — sizning tasdig'ingiz bilan).
8. Ishlatuvchilar uchun: har bir odamning **emaili Smeta tizimidagi hisobiga yozilgan** bo'lishi kerak (admin tomonidan). Email yozilmagan odam Google bilan kira olmaydi — u login/parol bilan kiradi. Google orqali yangi hisob HECH QACHON ochilmaydi.
9. Tekshirish: `https://smeta-mcp.anvar-ahatqulov.workers.dev/health` javobida `"google": true` bo'lsa, tugma yoqilgan.

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
