-- 20261218000000 - SHAXSIY (kriptografik) IMZO, 1-bosqich. Hujjat: docs/architecture/ADR_SHAXSIY_IMZO.md.
-- Egasi talabi: har shaxsning soxtalashtirib bo'lmaydigan imzosi hujjatga tushsin; hujjatdagi QR orqali hujjat tekshirilsin/ochilsin.
--
-- Maxfiy kalit serverga HECH QACHON kelmaydi (brauzerda WebCrypto ECDSA P-256, extractable:false). Bazada faqat OCHIQ kalit va imzo.
-- Imzoni kriptografik tekshirish Postgres'da emas - Pages Function'da (WebCrypto verify, `functions/_shared/imzo.ts`); SQL faqat
-- saqlaydi va YAXLITLIKNI ushlaydi: append-only (UPDATE/DELETE/TRUNCATE rad), hujjat bo'yicha chiziqli zanjir (oldingi imzo xeshi),
-- server vaqt oynasi, kalit egasi/faolligi, a'zolik. Imzo xabari SQL'da qurilmaydi: tekshiruvda ustunlardan qayta quriladi.
--
-- Jadvallar: t2_imzo_kalit (qurilma ochiq kalitlari), t2_imzo (imzolar, append-only).
-- Nashr (manba QR): t2_nashr jadvali; RPC: t2_nashr_tayyor_v1, t2_nashr_nusxa_v1, t2_nashr_ochiq_v1, t2_nashr_ruxsat_v1, t2_nashr_tozala_v1.
-- RPC (faqat service_role, actor sessiyadan): t2_imzo_kalit_royxat_v1, t2_imzo_kalit_yarat_v1, t2_imzo_kalit_bekor_v1,
--   t2_imzo_manba_v1, t2_imzo_yoz_v1, t2_imzo_hujjat_royxat_v1, t2_imzo_mening_v1, t2_imzo_ochiq_v1, t2_imzo_hujjat_ruxsat_v1.
set local statement_timeout = '300s';

-- ---------------------------------------------------------------------------------------------------------------------
-- 1) Jadvallar
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.t2_imzo_kalit (
  id uuid primary key default gen_random_uuid(),
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  qurilma text not null check (length(btrim(qurilma)) between 1 and 80),
  ochiq_kalit text not null check (ochiq_kalit ~ '^[A-Za-z0-9_-]{87}$'),
  alg text not null default 'ES256' check (alg = 'ES256'),
  yaratilgan timestamptz not null default now(),
  bekor_vaqt timestamptz,
  bekor_sabab text check (bekor_sabab is null or length(btrim(bekor_sabab)) between 3 and 200),
  -- «shu vaqtdan keyingi imzolarga ishonmang» (qurilma yo'qolgan/egallangan deb egasi e'lon qilgan payt)
  shubhali_dan timestamptz,
  constraint t2_imzo_kalit_bekor_juft check ((bekor_vaqt is null) = (bekor_sabab is null)),
  constraint t2_imzo_kalit_shubhali_check check (shubhali_dan is null or bekor_vaqt is not null)
);
create unique index if not exists t2_imzo_kalit_ochiq_uq on public.t2_imzo_kalit (ochiq_kalit);
create index if not exists t2_imzo_kalit_egasi_ix on public.t2_imzo_kalit (foydalanuvchi_id, yaratilgan desc);

create table if not exists public.t2_imzo (
  id bigint generated always as identity primary key,
  token text not null check (token ~ '^[A-Za-z0-9_-]{22}$'),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  hujjat_id bigint not null references public.t2_document_registry(id),
  hujjat_sha256 text not null check (hujjat_sha256 ~ '^[0-9a-f]{64}$'),
  mazmun_xesh text not null check (mazmun_xesh ~ '^[0-9a-f]{64}$'),
  kalit_id uuid not null references public.t2_imzo_kalit(id),
  foydalanuvchi_id bigint not null references public.t2_foydalanuvchi(id),
  imzolovchi text not null check (length(imzolovchi) between 1 and 200),
  rol text not null check (length(rol) between 1 and 60),
  -- imzo usuli: hozir faqat tizim imzosi; keyin 'eri' (E-IMZO) qo'shilishi uchun ustun tayyor (imzolanadigan xabarga kiradi)
  usul text not null default 'tizim' check (usul in ('tizim', 'eri')),
  -- «kim sifatida»: imzolovchi tomoni, uning kompaniyasi va (bo'lsa) vakolat bergan kompaniya («Buyurtmachi nomidan»)
  tomon text not null check (tomon in ('pudratchi', 'subpudratchi', 'buyurtmachi', 'texnadzor', 'loyihachi', 'laboratoriya', 'yetkazuvchi', 'boshqa')),
  imzolovchi_kompaniya_id bigint not null references public.t2_kompaniya(id),
  imzolovchi_kompaniya text not null check (length(imzolovchi_kompaniya) between 1 and 200),
  nomidan_kompaniya_id bigint references public.t2_kompaniya(id),
  nomidan_kompaniya text check (nomidan_kompaniya is null or length(nomidan_kompaniya) between 1 and 200),
  constraint t2_imzo_nomidan_juft check ((nomidan_kompaniya_id is null) = (nomidan_kompaniya is null)),
  vaqt timestamptz not null,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{22}$'),
  oldingi_xesh text not null check (oldingi_xesh ~ '^[0-9a-f]{64}$'),
  xesh text not null check (xesh ~ '^[0-9a-f]{64}$'),
  imzo text not null check (imzo ~ '^[A-Za-z0-9_-]{86}$'),
  yozilgan timestamptz not null default now()
);
create unique index if not exists t2_imzo_token_uq on public.t2_imzo (token);
create unique index if not exists t2_imzo_xesh_uq on public.t2_imzo (xesh);
-- Chiziqli zanjir: bir hujjatda bitta oldingi imzodan ikkita davom bo'lmaydi (fork yo'q).
create unique index if not exists t2_imzo_zanjir_uq on public.t2_imzo (hujjat_id, oldingi_xesh);
create unique index if not exists t2_imzo_kalit_nonce_uq on public.t2_imzo (kalit_id, nonce);
create index if not exists t2_imzo_foydalanuvchi_ix on public.t2_imzo (foydalanuvchi_id, id desc);

alter table public.t2_imzo_kalit enable row level security;
alter table public.t2_imzo enable row level security;
revoke all on table public.t2_imzo_kalit from public, anon, authenticated;
revoke all on table public.t2_imzo from public, anon, authenticated;

comment on table public.t2_imzo_kalit is 'Foydalanuvchi qurilmalarining OCHIQ kalitlari (ECDSA P-256, raw 65 bayt base64url). Maxfiy kalit bu yerda YO''Q. Faqat bekor qilish mumkin.';
comment on table public.t2_imzo is 'Shaxsiy imzolar. APPEND-ONLY (trigger). Imzo xabari ustunlardan qayta quriladi (lib/imzo/yadro.ts imzoXabar); kriptografik tekshiruv Pages Function''da.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 2) Append-only himoya
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._t2_imzo_himoya_trg() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'IMZO_YOZUV_OZGARMAYDI: % % taqiqlangan (append-only)', tg_table_name, tg_op using errcode = '42501';
end $$;

create or replace function public._t2_imzo_kalit_himoya_trg() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMZO_KALIT_OCHIRILMAYDI: kalit faqat bekor qilinadi' using errcode = '42501';
  end if;
  -- faqat bekor qilish: bir marta, bekor_vaqt/bekor_sabab/shubhali_dan to'ldiriladi; qolgan ustunlar o'zgarmaydi
  if old.bekor_vaqt is not null
     or new.id is distinct from old.id or new.foydalanuvchi_id is distinct from old.foydalanuvchi_id
     or new.qurilma is distinct from old.qurilma or new.ochiq_kalit is distinct from old.ochiq_kalit
     or new.alg is distinct from old.alg or new.yaratilgan is distinct from old.yaratilgan then
    raise exception 'IMZO_KALIT_OZGARMAYDI: faqat faol kalitni bir marta bekor qilish mumkin' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists t2_imzo_himoya on public.t2_imzo;
create trigger t2_imzo_himoya before update or delete on public.t2_imzo for each row execute function public._t2_imzo_himoya_trg();
drop trigger if exists t2_imzo_himoya_truncate on public.t2_imzo;
create trigger t2_imzo_himoya_truncate before truncate on public.t2_imzo for each statement execute function public._t2_imzo_himoya_trg();
drop trigger if exists t2_imzo_kalit_himoya on public.t2_imzo_kalit;
create trigger t2_imzo_kalit_himoya before update or delete on public.t2_imzo_kalit for each row execute function public._t2_imzo_kalit_himoya_trg();
drop trigger if exists t2_imzo_kalit_himoya_truncate on public.t2_imzo_kalit;
create trigger t2_imzo_kalit_himoya_truncate before truncate on public.t2_imzo_kalit for each statement execute function public._t2_imzo_himoya_trg();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3) Kalitlar
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.t2_imzo_kalit_royxat_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'kalitlar', coalesce((
    select jsonb_agg(jsonb_build_object('id', k.id, 'qurilma', k.qurilma, 'ochiq_kalit', k.ochiq_kalit, 'yaratilgan', k.yaratilgan,
      'bekor_vaqt', k.bekor_vaqt, 'bekor_sabab', k.bekor_sabab, 'shubhali_dan', k.shubhali_dan) order by k.yaratilgan desc)
    from public.t2_imzo_kalit k where k.foydalanuvchi_id = p_actor_id), '[]'::jsonb));
end $$;

-- Kalit ro'yxatdan o'tkazish: faqat sessiya egasi, QAYTA AUTENTIFIKATSIYA bilan.
--   parolli hisob: joriy parol shart; parolsiz hisob (Google/email kod/Telegram): sessiya yangi bo'lishi shart (p_yangi_kirish - shlyuz cookie yoshidan hisoblaydi).
create or replace function public.t2_imzo_kalit_yarat_v1(p_actor_id bigint, p_qurilma text, p_ochiq_kalit text, p_parol text, p_yangi_kirish boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_id uuid; v_n int;
begin
  if p_actor_id is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if v_u.parol_hash is not null then
    if coalesce(p_parol, '') = '' or v_u.parol_hash <> extensions.crypt(p_parol, v_u.parol_hash) then
      return jsonb_build_object('ok', false, 'code', 'PAROL_XATO');
    end if;
  elsif p_yangi_kirish is not true then
    return jsonb_build_object('ok', false, 'code', 'QAYTA_KIRISH_KERAK');
  end if;
  if length(btrim(coalesce(p_qurilma, ''))) not between 1 and 80 then return jsonb_build_object('ok', false, 'code', 'QURILMA_NOTOGRI'); end if;
  if p_ochiq_kalit is null or p_ochiq_kalit !~ '^[A-Za-z0-9_-]{87}$' then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  select count(*) into v_n from public.t2_imzo_kalit where foydalanuvchi_id = p_actor_id and bekor_vaqt is null;
  if v_n >= 5 then return jsonb_build_object('ok', false, 'code', 'KALIT_LIMIT'); end if;
  begin
    insert into public.t2_imzo_kalit (foydalanuvchi_id, qurilma, ochiq_kalit) values (p_actor_id, btrim(p_qurilma), p_ochiq_kalit) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'KALIT_BAND');
  end;
  perform public._t2_profil_audit(p_actor_id, 'imzo_kalit_yaratildi', 'kalit=' || v_id::text || '; qurilma=' || btrim(p_qurilma));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.t2_imzo_kalit_bekor_v1(p_actor_id bigint, p_kalit_id uuid, p_sabab text, p_shubhali_dan timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare k public.t2_imzo_kalit%rowtype;
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  select * into k from public.t2_imzo_kalit where id = p_kalit_id and foydalanuvchi_id = p_actor_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'KALIT_YOQ'); end if;
  if k.bekor_vaqt is not null then return jsonb_build_object('ok', false, 'code', 'KALIT_BEKOR'); end if;
  if length(btrim(coalesce(p_sabab, ''))) not between 3 and 200 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK'); end if;
  if p_shubhali_dan is not null and (p_shubhali_dan > now() or p_shubhali_dan < k.yaratilgan) then
    return jsonb_build_object('ok', false, 'code', 'VAQT_NOTOGRI');
  end if;
  update public.t2_imzo_kalit set bekor_vaqt = now(), bekor_sabab = btrim(p_sabab), shubhali_dan = p_shubhali_dan where id = k.id;
  perform public._t2_profil_audit(p_actor_id, 'imzo_kalit_bekor', 'kalit=' || k.id::text || case when p_shubhali_dan is not null then '; shubhali' else '' end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4) Imzo qo'yish
-- ---------------------------------------------------------------------------------------------------------------------
-- Imzo xabarining SERVER manbalari: kim (ism/rol/kompaniya/tomon/vakolat), nimani (reestr xeshi), zanjirda nima oldin.
-- Imzolovchi kompaniyasi (p_imzo_kompaniya_id; null = hujjat kompaniyasi): faol a'zolik SHART. Hujjat egasi bo'lmagan kompaniya
-- (buyurtmachi, alohida texnadzor kompaniyasi) faqat mavjud TOMON yo'li orqali: hujjat unga taqdim qilingan (t2_tomon_hujjat_ol_v1)
-- va hujjat egasi bilan faol aloqa (t2_tomon_aloqa) bor. «Nomidan» (p_nomidan_id): imzolovchi kompaniyasi bilan shu kompaniya orasida
-- faol aloqa bo'lishi shart; delegatsiya/vakolat modelining o'zi boshqa lane (shu yerda faqat aloqa tekshiriladi va maydon saqlanadi).
create or replace function public.t2_imzo_manba_v1(p_actor_id bigint, p_hujjat_id bigint, p_kalit_id uuid, p_imzo_kompaniya_id bigint, p_tomon text, p_nomidan_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; k public.t2_imzo_kalit%rowtype; d public.t2_document_registry%rowtype;
  v_s bigint; v_rol text; v_prev text; v_ruxsat boolean := false; v_snom text; v_nnom text;
begin
  if p_actor_id is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into k from public.t2_imzo_kalit where id = p_kalit_id and foydalanuvchi_id = p_actor_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'KALIT_YOQ'); end if;
  if k.bekor_vaqt is not null then return jsonb_build_object('ok', false, 'code', 'KALIT_BEKOR'); end if;
  if p_tomon is null or p_tomon not in ('pudratchi', 'subpudratchi', 'buyurtmachi', 'texnadzor', 'loyihachi', 'laboratoriya', 'yetkazuvchi', 'boshqa') then
    return jsonb_build_object('ok', false, 'code', 'TOMON_NOTOGRI');
  end if;
  select * into d from public.t2_document_registry where id = p_hujjat_id;
  if found then
    v_s := coalesce(p_imzo_kompaniya_id, d.kompaniya_id);
    select a.rol into v_rol from public.t2_azolik a where a.kompaniya_id = v_s and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol' order by a.id limit 1;
    if v_rol is not null then
      if v_s = d.kompaniya_id then v_ruxsat := true;
      else
        v_ruxsat := coalesce((public.t2_tomon_hujjat_ol_v1(p_actor_id, d.id)->>'ok')::boolean, false)
          and exists (select 1 from public.t2_tomon_aloqa a where a.holat = 'faol'
            and ((a.taklif_kompaniya_id = v_s and a.qabul_kompaniya_id = d.kompaniya_id) or (a.qabul_kompaniya_id = v_s and a.taklif_kompaniya_id = d.kompaniya_id)));
      end if;
    end if;
  end if;
  -- hujjat yo'q yoki ruxsat yo'q: bir xil javob (mavjudligi sezdirilmaydi)
  if d.id is null or not v_ruxsat then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  if p_nomidan_id is not null then
    if p_nomidan_id = v_s or not exists (select 1 from public.t2_tomon_aloqa a where a.holat = 'faol'
        and ((a.taklif_kompaniya_id = v_s and a.qabul_kompaniya_id = p_nomidan_id) or (a.qabul_kompaniya_id = v_s and a.taklif_kompaniya_id = p_nomidan_id))) then
      return jsonb_build_object('ok', false, 'code', 'VAKOLAT_YOQ');
    end if;
    select left(nom, 200) into v_nnom from public.t2_kompaniya where id = p_nomidan_id;
  end if;
  if d.canonical_storage_status <> 'stored' or d.status <> 'active' or d.sha256 is null or d.sha256 !~ '^[0-9a-f]{64}$' or d.r2_key is null then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_TAYYOR_EMAS');
  end if;
  select left(nom, 200) into v_snom from public.t2_kompaniya where id = v_s;
  select i.xesh into v_prev from public.t2_imzo i where i.hujjat_id = d.id order by i.id desc limit 1;
  return jsonb_build_object('ok', true, 'kompaniya_id', d.kompaniya_id, 'obyekt_id', d.obyekt_id, 'hujjat_id', d.id,
    'hujjat_sha256', d.sha256, 'foydalanuvchi_id', v_u.id, 'imzolovchi', left(coalesce(nullif(btrim(v_u.ism), ''), v_u.login), 200),
    'rol', left(v_rol, 60), 'usul', 'tizim', 'tomon', p_tomon, 'imzolovchi_kompaniya_id', v_s, 'imzolovchi_kompaniya', v_snom,
    'nomidan_kompaniya_id', p_nomidan_id, 'nomidan_kompaniya', v_nnom,
    'oldingi_xesh', coalesce(v_prev, repeat('0', 64)), 'ochiq_kalit', k.ochiq_kalit,
    'r2_obyekt', coalesce(d.blob_key, d.r2_key), 'mime_type', d.mime_type, 'fayl_nomi', d.original_filename, 'hajm', d.size_bytes);
end $$;

-- Saqlash. Imzoning kriptografik to'g'riligini Pages Function ALLAQACHON tekshirgan (ochiq kalit bilan); bu yerda - yaxlitlik.
create or replace function public.t2_imzo_yoz_v1(
  p_actor_id bigint, p_token text, p_hujjat_id bigint, p_kalit_id uuid, p_imzo_kompaniya_id bigint, p_tomon text, p_nomidan_id bigint,
  p_vaqt text, p_nonce text, p_mazmun_xesh text, p_oldingi_xesh text, p_hujjat_sha256 text, p_imzolovchi text, p_rol text,
  p_imzolovchi_kompaniya text, p_nomidan_kompaniya text, p_xesh text, p_imzo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare m jsonb; v_vaqt timestamptz; v_id bigint; v_kompaniya bigint;
begin
  if p_hujjat_id is null then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('imzo:' || p_hujjat_id::text, 0));
  m := public.t2_imzo_manba_v1(p_actor_id, p_hujjat_id, p_kalit_id, p_imzo_kompaniya_id, p_tomon, p_nomidan_id);
  if (m->>'ok')::boolean is not true then return m; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' or p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{22}$'
     or p_mazmun_xesh is null or p_mazmun_xesh !~ '^[0-9a-f]{64}$' or p_xesh is null or p_xesh !~ '^[0-9a-f]{64}$'
     or p_imzo is null or p_imzo !~ '^[A-Za-z0-9_-]{86}$' or p_vaqt is null or p_vaqt !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI');
  end if;
  -- Shlyuz xabarni DB manbalari bilan qurgan bo'lishi shart: ism/rol/kompaniya/xesh/zanjir eskirgan bo'lsa - qayta urinish
  if m->>'hujjat_sha256' is distinct from p_hujjat_sha256 or m->>'imzolovchi' is distinct from p_imzolovchi or m->>'rol' is distinct from p_rol
     or m->>'imzolovchi_kompaniya' is distinct from p_imzolovchi_kompaniya or m->>'nomidan_kompaniya' is distinct from p_nomidan_kompaniya then
    return jsonb_build_object('ok', false, 'code', 'MALUMOT_ESKIRGAN');
  end if;
  if m->>'oldingi_xesh' is distinct from p_oldingi_xesh then return jsonb_build_object('ok', false, 'code', 'ZANJIR_YANGILANDI'); end if;
  v_vaqt := p_vaqt::timestamptz;
  if abs(extract(epoch from (now() - v_vaqt))) > 180 then return jsonb_build_object('ok', false, 'code', 'VAQT_OYNASI'); end if;
  v_kompaniya := (m->>'kompaniya_id')::bigint;
  begin
    insert into public.t2_imzo (token, kompaniya_id, hujjat_id, hujjat_sha256, mazmun_xesh, kalit_id, foydalanuvchi_id, imzolovchi, rol, usul, tomon,
      imzolovchi_kompaniya_id, imzolovchi_kompaniya, nomidan_kompaniya_id, nomidan_kompaniya, vaqt, nonce, oldingi_xesh, xesh, imzo)
    values (p_token, v_kompaniya, p_hujjat_id, p_hujjat_sha256, p_mazmun_xesh, p_kalit_id, p_actor_id, p_imzolovchi, p_rol, 'tizim', p_tomon,
      (m->>'imzolovchi_kompaniya_id')::bigint, p_imzolovchi_kompaniya, p_nomidan_id, p_nomidan_kompaniya, v_vaqt, p_nonce, p_oldingi_xesh, p_xesh, p_imzo)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'IMZO_TAKROR');
  end;
  perform public.t2_audit_yoz(v_kompaniya, 'imzo_qoyildi', 'imzo', (m->>'obyekt_id')::bigint,
    format('imzo_id=%s; hujjat_id=%s; kalit=%s; tomon=%s', v_id, p_hujjat_id, p_kalit_id, p_tomon), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'id', v_id, 'token', p_token);
end $$;
-- ---------------------------------------------------------------------------------------------------------------------
-- 5) O'qish (shlyuz xom maydonlarni oladi, kriptografik tekshiradi, ortiqchasini kesib beradi)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public._t2_imzo_qator_v1(i public.t2_imzo, k public.t2_imzo_kalit, d public.t2_document_registry) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', i.id, 'token', i.token, 'kompaniya_id', i.kompaniya_id, 'hujjat_id', i.hujjat_id,
    'hujjat_sha256', i.hujjat_sha256, 'mazmun_xesh', i.mazmun_xesh, 'kalit_id', i.kalit_id, 'foydalanuvchi_id', i.foydalanuvchi_id,
    'imzolovchi', i.imzolovchi, 'rol', i.rol, 'usul', i.usul, 'tomon', i.tomon, 'imzolovchi_kompaniya_id', i.imzolovchi_kompaniya_id,
    'imzolovchi_kompaniya', i.imzolovchi_kompaniya, 'nomidan_kompaniya_id', i.nomidan_kompaniya_id, 'nomidan_kompaniya', i.nomidan_kompaniya, 'vaqt', to_char(i.vaqt at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'nonce', i.nonce, 'oldingi_xesh', i.oldingi_xesh, 'xesh', i.xesh, 'imzo', i.imzo, 'ochiq_kalit', k.ochiq_kalit,
    'kalit_bekor_vaqt', k.bekor_vaqt, 'shubhali_dan', k.shubhali_dan,
    'hujjat_holat', case when d.status = 'deleted' then 'ochirilgan' when d.sha256 is distinct from i.hujjat_sha256 then 'ozgargan'
                         when d.status = 'superseded' then 'almashtirilgan' else 'ozgarmagan' end)
$$;

create or replace function public.t2_imzo_hujjat_royxat_v1(p_actor_id bigint, p_hujjat_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d public.t2_document_registry%rowtype;
begin
  select * into d from public.t2_document_registry where id = p_hujjat_id;
  if d.id is null or p_actor_id is null or not exists (select 1 from public.t2_azolik a where a.kompaniya_id = d.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'HUJJAT_TOPILMADI');
  end if;
  return jsonb_build_object('ok', true, 'imzolar', coalesce((
    select jsonb_agg(public._t2_imzo_qator_v1(i, k, d) order by i.id)
    from (select * from public.t2_imzo where hujjat_id = d.id order by id desc limit 50) i join public.t2_imzo_kalit k on k.id = i.kalit_id), '[]'::jsonb));
end $$;

create or replace function public.t2_imzo_mening_v1(p_actor_id bigint, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'imzolar', coalesce((
    select jsonb_agg(public._t2_imzo_qator_v1(i, k, d) || jsonb_build_object('hujjat_turi', d.document_type, 'fayl_nomi', d.original_filename) order by i.id desc)
    from (select * from public.t2_imzo where foydalanuvchi_id = p_actor_id order by id desc limit greatest(1, least(coalesce(p_limit, 50), 200))) i
    join public.t2_imzo_kalit k on k.id = i.kalit_id join public.t2_document_registry d on d.id = i.hujjat_id), '[]'::jsonb));
end $$;

-- OCHIQ tekshiruv (KIRMASDAN): token -> imzo + shu hujjatning butun zanjiri. SUMMA/fayl nomi/maxfiy mazmun QAYTMAYDI:
-- faqat hujjat turi, tahrir raqami, sanasi, kompaniya nomi, imzolovchilar va holat. Topilmasa - har doim bir xil javob.
create or replace function public.t2_imzo_ochiq_v1(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare i public.t2_imzo%rowtype; d public.t2_document_registry%rowtype; v_nom text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into i from public.t2_imzo where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into d from public.t2_document_registry where id = i.hujjat_id;
  select nom into v_nom from public.t2_kompaniya where id = i.kompaniya_id;
  return jsonb_build_object('ok', true, 'token', i.token,
    'hujjat', jsonb_build_object('turi', d.document_type, 'tahrir', coalesce(d.revision, d.revision_seq::text), 'sana', d.created_at, 'kompaniya', v_nom),
    'imzolar', coalesce((
      select jsonb_agg(public._t2_imzo_qator_v1(x, k, d) order by x.id)
      from (select * from public.t2_imzo where hujjat_id = i.hujjat_id order by id desc limit 50) x join public.t2_imzo_kalit k on k.id = x.kalit_id), '[]'::jsonb));
end $$;

-- Kirgan odam: token -> hujjatni tizimda ochish/yuklab olish (faqat hujjat kompaniyasining faol a'zosi; yuklab olish - mavjud /api/hujjat-ol).
create or replace function public.t2_imzo_hujjat_ruxsat_v1(p_actor_id bigint, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare i public.t2_imzo%rowtype; d public.t2_document_registry%rowtype;
begin
  if p_actor_id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select * into i from public.t2_imzo where token = p_token;
  if found then select * into d from public.t2_document_registry where id = i.hujjat_id; end if;
  if d.id is null or not exists (select 1 from public.t2_azolik a where a.kompaniya_id = d.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  return jsonb_build_object('ok', true, 'hujjat_id', d.id, 'fayl_nomi', d.original_filename);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5b) NASHR: tizim chiqargan HAR eksport = ixcham yozuv + QR (manba QR). Hujjat dvigateli markaziy nuqtasi (downloadBlob) chaqiradi.
--     Aynan shu mazmun (kompaniya + tur + mazmun xeshi) qayta eksport qilinsa yangi nashr OCHILMAYDI - mavjud token qayta ishlatiladi.
--     Fayl nusxasi R2 da (t2_document_registry, hujjat_id), bu yerda faqat ~250 bayt. Hajm: 10 000 nashr ~ 4 MB (indekslar bilan).
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.t2_nashr (
  id bigint generated always as identity primary key,
  token text not null check (token ~ '^[A-Za-z0-9_-]{22}$'),
  kompaniya_id bigint not null references public.t2_kompaniya(id),
  obyekt_id bigint references public.t2_obyekt(id),
  turi text not null check (length(btrim(turi)) between 1 and 60),
  atama text check (atama is null or length(atama) <= 160),
  mazmun_xesh text not null check (mazmun_xesh ~ '^[0-9a-f]{64}$'),
  chiqargan_id bigint not null references public.t2_foydalanuvchi(id),
  vaqt timestamptz not null default now(),
  hujjat_id bigint references public.t2_document_registry(id)
);
create unique index if not exists t2_nashr_token_uq on public.t2_nashr (token);
create unique index if not exists t2_nashr_mazmun_uq on public.t2_nashr (kompaniya_id, turi, mazmun_xesh);
create index if not exists t2_nashr_atama_ix on public.t2_nashr (kompaniya_id, turi, atama, id desc);
alter table public.t2_nashr enable row level security;
revoke all on table public.t2_nashr from public, anon, authenticated;
comment on table public.t2_nashr is 'Har eksport nashri (QR manbasi). Token ochiq; mazmun/summa YO''Q. Faqat hujjat_id (nusxa biriktirish) va tozalashda atama/obyekt_id NULL ga o''zgaradi.';

create or replace function public._t2_nashr_himoya_trg() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then raise exception 'NASHR_OCHIRILMAYDI' using errcode = '42501'; end if;
  if new.id is distinct from old.id or new.token is distinct from old.token or new.kompaniya_id is distinct from old.kompaniya_id
     or new.turi is distinct from old.turi or new.mazmun_xesh is distinct from old.mazmun_xesh or new.chiqargan_id is distinct from old.chiqargan_id
     or new.vaqt is distinct from old.vaqt or (old.hujjat_id is not null and new.hujjat_id is distinct from old.hujjat_id)
     or (old.atama is null and new.atama is not null) or (old.obyekt_id is null and new.obyekt_id is not null) then
    raise exception 'NASHR_OZGARMAYDI' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t2_nashr_himoya on public.t2_nashr;
create trigger t2_nashr_himoya before update or delete on public.t2_nashr for each row execute function public._t2_nashr_himoya_trg();
drop trigger if exists t2_nashr_himoya_truncate on public.t2_nashr;
create trigger t2_nashr_himoya_truncate before truncate on public.t2_nashr for each statement execute function public._t2_nashr_himoya_trg();

-- Nashrni ochish yoki mavjudini qaytarish (kompaniya a'zosi). yangi=true bo'lsa mijoz QR li nusxani yuklab, t2_nashr_nusxa_v1 bilan biriktiradi.
create or replace function public.t2_nashr_tayyor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_turi text, p_atama text, p_xesh text, p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.t2_nashr%rowtype;
begin
  if p_actor_id is null or p_kompaniya_id is null or not exists (select 1 from public.t2_azolik a where a.kompaniya_id = p_kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  if length(btrim(coalesce(p_turi, ''))) not between 1 and 60 or p_xesh is null or p_xesh !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$'
     or length(coalesce(p_atama, '')) > 160 then
    return jsonb_build_object('ok', false, 'code', 'TALAB_NOTOGRI');
  end if;
  if p_obyekt_id is not null and not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  insert into public.t2_nashr (token, kompaniya_id, obyekt_id, turi, atama, mazmun_xesh, chiqargan_id)
  values (p_token, p_kompaniya_id, p_obyekt_id, btrim(p_turi), nullif(btrim(coalesce(p_atama, '')), ''), p_xesh, p_actor_id)
  on conflict (kompaniya_id, turi, mazmun_xesh) do nothing returning * into n;
  if found then return jsonb_build_object('ok', true, 'token', n.token, 'yangi', true, 'hujjat_id', null); end if;
  select * into n from public.t2_nashr where kompaniya_id = p_kompaniya_id and turi = btrim(p_turi) and mazmun_xesh = p_xesh;
  return jsonb_build_object('ok', true, 'token', n.token, 'yangi', false, 'hujjat_id', n.hujjat_id);
end $$;

-- Saqlangan nusxa (QR li xlsx, reestrdagi hujjat) ni nashrga biriktirish: bir marta.
create or replace function public.t2_nashr_nusxa_v1(p_actor_id bigint, p_token text, p_hujjat_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n public.t2_nashr%rowtype; d public.t2_document_registry%rowtype;
begin
  select * into n from public.t2_nashr where token = p_token for update;
  if not found or p_actor_id is null or not exists (select 1 from public.t2_azolik a where a.kompaniya_id = n.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol') then
    return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ');
  end if;
  select * into d from public.t2_document_registry where id = p_hujjat_id and kompaniya_id = n.kompaniya_id;
  if not found or d.canonical_storage_status <> 'stored' then return jsonb_build_object('ok', false, 'code', 'HUJJAT_TAYYOR_EMAS'); end if;
  if n.hujjat_id is not null then return jsonb_build_object('ok', true, 'hujjat_id', n.hujjat_id, 'yangi', false); end if;
  update public.t2_nashr set hujjat_id = d.id where id = n.id;
  return jsonb_build_object('ok', true, 'hujjat_id', d.id, 'yangi', true);
end $$;

create or replace function public._t2_nashr_joriy_v1(n public.t2_nashr) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('joriy', false, 'joriy_token', x.token) from public.t2_nashr x
    where x.kompaniya_id = n.kompaniya_id and x.turi = n.turi and x.atama is not distinct from n.atama and x.obyekt_id is not distinct from n.obyekt_id
      and n.atama is not null and x.id > n.id order by x.id desc limit 1), jsonb_build_object('joriy', true, 'joriy_token', null))
$$;

-- OCHIQ (KIRMASDAN): tur, sana, kompaniya, joriy/eskirgan belgisi + (nusxa imzolangan bo'lsa) imzolar. Mazmun/summa/fayl nomi/atama YO'Q.
create or replace function public.t2_nashr_ochiq_v1(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n public.t2_nashr%rowtype; d public.t2_document_registry%rowtype; v_nom text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select * into n from public.t2_nashr where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI'); end if;
  select nom into v_nom from public.t2_kompaniya where id = n.kompaniya_id;
  if n.hujjat_id is not null then select * into d from public.t2_document_registry where id = n.hujjat_id; end if;
  return jsonb_build_object('ok', true, 'token', n.token,
    'nashr', jsonb_build_object('turi', n.turi, 'sana', n.vaqt, 'kompaniya', v_nom, 'mazmun_xesh', n.mazmun_xesh) || public._t2_nashr_joriy_v1(n),
    'imzolar', case when d.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(public._t2_imzo_qator_v1(x, k, d) order by x.id)
      from (select * from public.t2_imzo where hujjat_id = d.id order by id desc limit 50) x join public.t2_imzo_kalit k on k.id = x.kalit_id), '[]'::jsonb) end);
end $$;

-- Kirgan odam: nashr nusxasini ochish/yuklab olish ruxsati (kompaniya a'zosi yoki hujjat unga taqdim qilingan tomon).
create or replace function public.t2_nashr_ruxsat_v1(p_actor_id bigint, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n public.t2_nashr%rowtype; v_ok boolean := false;
begin
  if p_actor_id is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  select * into n from public.t2_nashr where token = p_token;
  if found then
    v_ok := exists (select 1 from public.t2_azolik a where a.kompaniya_id = n.kompaniya_id and a.foydalanuvchi_id = p_actor_id and a.holat = 'faol');
    if not v_ok and n.hujjat_id is not null then v_ok := coalesce((public.t2_tomon_hujjat_ol_v1(p_actor_id, n.hujjat_id)->>'ok')::boolean, false); end if;
  end if;
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'RUXSAT_YOQ'); end if;
  return jsonb_build_object('ok', true, 'hujjat_id', n.hujjat_id, 'turi', n.turi, 'atama', n.atama, 'obyekt_id', n.obyekt_id) || public._t2_nashr_joriy_v1(n);
end $$;

-- Tozalash siyosati: IMZOSIZ nashrlarda p_oy oydan keyin atama/obyekt_id olib tashlanadi - token + xesh qoladi (QR ishlayveradi).
create or replace function public.t2_nashr_tozala_v1(p_oy integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if p_oy is null or p_oy < 1 then raise exception 'p_oy >= 1 bo''lishi kerak'; end if;
  update public.t2_nashr n set atama = null, obyekt_id = null
   where n.vaqt < now() - make_interval(months => p_oy) and (n.atama is not null or n.obyekt_id is not null)
     and not exists (select 1 from public.t2_imzo i where i.hujjat_id = n.hujjat_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
-- ---------------------------------------------------------------------------------------------------------------------
-- 6) Huquqlar: faqat service_role
-- ---------------------------------------------------------------------------------------------------------------------
do $g$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 't2\_imzo\_%' or p.proname like '\_t2\_imzo\_%' or p.proname like 't2\_nashr\_%' or p.proname like '\_t2\_nashr\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $g$;
