-- T2-PROFIL-XAVFSIZLIK-001 — Profil, parol, sessiyalarni bekor qilish, Google ulash/uzish va HISOBLARNI BIRLASHTIRISH.
-- HOLAT: faqat fayl; hech qaysi bazaga qo'llanmagan (koordinator BEGIN..ROLLBACK acceptance dan keyin qo'llaydi).
-- Egasi og'rig'i: «Gmail va kompaniya login/paroli — ikki alohida hisob, absurd». Bitta odam bitta hisob bo'lishi kerak.
--
-- 1) t2_foydalanuvchi: til, avatar_rang, sessiya_bekor_dan (parol almashtirilganda/«boshqa qurilmalardan chiqish»da
--    server shu vaqtdan OLDIN chiqarilgan cookie larni rad etadi), birlashgan_id (birlashtirilgan hisob → omon qolgan).
--    holat check ga 'birlashtirildi' qo'shiladi.
-- 2) RPC lar (faqat service_role; actor — sessiyadagi foydalanuvchi, hech qachon so'rov tanasidan emas):
--    t2_profil_ol_v1, t2_profil_yangila_v1, t2_parol_ozgartir_v1, t2_sessiya_bekor_v1, t2_google_uzish_v1,
--    t2_google_ulash_v1, t2_hisob_birlashtir_v1.
-- 3) t2_men_v1 — `foydalanuvchi.sessiya_bekor_dan` qo'shildi (role-authority.ts cookie iat ni shu bilan solishtiradi).
-- 4) t2_parol_tekshir_v1 va t2_google_kirish_v1 — birlashtirilgan hisob bilan kirilsa OMON QOLGAN hisob qaytariladi.
-- Parol hech qachon audit/javobga yozilmaydi. parol_hash va google_sub hech qachon profil javobida qaytmaydi.

begin;

alter table public.t2_foydalanuvchi
  add column if not exists telefon text,
  add column if not exists telefon_tasdiqlangan boolean not null default false,
  add column if not exists til text,
  add column if not exists avatar_rang text,
  add column if not exists sessiya_bekor_dan timestamptz,
  add column if not exists birlashgan_id bigint references public.t2_foydalanuvchi(id);

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_til_check') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_til_check check (til is null or til in ('uz','ru','en'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_avatar_rang_check') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_avatar_rang_check check (avatar_rang is null or avatar_rang ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 't2_foydalanuvchi_birlashgan_check') then
    alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_birlashgan_check check (birlashgan_id is null or birlashgan_id <> id);
  end if;
end $c$;

-- holat: ('faol','bekor') → ('faol','bekor','birlashtirildi')
alter table public.t2_foydalanuvchi drop constraint if exists t2_foydalanuvchi_holat_check;
alter table public.t2_foydalanuvchi add constraint t2_foydalanuvchi_holat_check check (holat = any (array['faol','bekor','birlashtirildi']));

create index if not exists t2_foydalanuvchi_birlashgan_idx on public.t2_foydalanuvchi (birlashgan_id) where birlashgan_id is not null;

comment on column public.t2_foydalanuvchi.sessiya_bekor_dan is
  'Shu vaqtdan OLDIN chiqarilgan sessiya cookie lari yaroqsiz (parol almashtirish / boshqa qurilmalardan chiqish). NULL — bekor qilinmagan.';
comment on column public.t2_foydalanuvchi.birlashgan_id is
  'holat=birlashtirildi bo''lsa — a''zoliklari ko''chirilgan OMON QOLGAN hisob. Kirish shu hisobga yo''naltiriladi.';

-- ─────────────────────────────────────────────────────────────────────────
-- Yordamchilar (ichki; service_role ham to'g'ridan chaqirmaydi)
-- ─────────────────────────────────────────────────────────────────────────

-- Birlashtirish zanjirining oxiri (omon qolgan FAOL hisob); zanjir 5 qadamdan uzun/siklik/faol emas bo'lsa NULL.
create or replace function public._t2_hisob_oxirgi(p_id bigint) returns bigint
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_id bigint := p_id; v_holat text; v_next bigint; i int;
begin
  for i in 0..5 loop
    select holat, birlashgan_id into v_holat, v_next from public.t2_foydalanuvchi where id = v_id;
    if not found then return null; end if;
    if v_holat = 'faol' then return v_id; end if;
    if v_holat is distinct from 'birlashtirildi' or v_next is null then return null; end if;
    v_id := v_next;
  end loop;
  return null;
end $$;

create or replace function public._t2_profil_json(p_id bigint) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',u.id,'login',u.login,'email',u.email,'ism',u.ism,'telefon',u.telefon,
    'telefon_tasdiqlangan',coalesce(u.telefon_tasdiqlangan,false),'til',u.til,'avatar_rang',u.avatar_rang,
    'google_ulangan',u.google_sub is not null,'parol_bor',u.parol_hash is not null,
    'parol_yangilandi',u.parol_yangilandi,'yaratildi',u.yaratildi)
  from public.t2_foydalanuvchi u where u.id = p_id $$;

-- Audit: t2_audit_log.kompaniya_id NOT NULL, profil amali esa kompaniyaga bog'liq emas → foydalanuvchining birinchi faol kompaniyasi.
-- Kompaniyasi yo'q bo'lsa audit yozilmaydi (profil amali baribir bajariladi). Tafsilotda parol YO'Q.
create or replace function public._t2_profil_audit(p_actor bigint, p_amal text, p_tafsilot text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_k bigint;
begin
  select a.kompaniya_id into v_k from public.t2_azolik a where a.foydalanuvchi_id = p_actor and a.holat = 'faol' order by a.id limit 1;
  if v_k is not null then
    perform public.t2_audit_yoz(v_k, p_amal, 'profil', null, left(coalesce(p_tafsilot,''), 500), 'actor:'||p_actor, null);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_profil_ol_v1
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_profil_ol_v1(p_actor_id bigint) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_actor_id is null or not exists (select 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol') then
    return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND');
  end if;
  return jsonb_build_object('ok',true,'profil',public._t2_profil_json(p_actor_id));
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_profil_yangila_v1 — null parametr = o'zgarmaydi
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_profil_yangila_v1(p_actor_id bigint, p_ism text, p_telefon text, p_til text, p_avatar_rang text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_ism text; v_tel text; v_tel_bor boolean := p_telefon is not null; v_ozgardi text[] := array[]::text[];
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;

  if p_ism is not null then
    v_ism := btrim(p_ism);
    if char_length(v_ism) < 2 or char_length(v_ism) > 80 then return jsonb_build_object('ok',false,'code','ISM_NOTOGRI'); end if;
  end if;
  if v_tel_bor then
    v_tel := regexp_replace(btrim(p_telefon), '[\s\-\(\)\.]', '', 'g');
    if v_tel = '' then v_tel := null;
    elsif v_tel !~ '^\+?[0-9]{7,15}$' then return jsonb_build_object('ok',false,'code','TELEFON_NOTOGRI'); end if;
  end if;
  if p_til is not null and p_til not in ('uz','ru','en') then return jsonb_build_object('ok',false,'code','TIL_NOTOGRI'); end if;
  if p_avatar_rang is not null and p_avatar_rang !~ '^#[0-9a-fA-F]{6}$' then return jsonb_build_object('ok',false,'code','RANG_NOTOGRI'); end if;

  if v_ism is not null and v_ism is distinct from v_u.ism then v_ozgardi := array_append(v_ozgardi, 'ism'); end if;
  if v_tel_bor and v_tel is distinct from v_u.telefon then v_ozgardi := array_append(v_ozgardi, 'telefon'); end if;
  if p_til is not null and p_til is distinct from v_u.til then v_ozgardi := array_append(v_ozgardi, 'til'); end if;
  if p_avatar_rang is not null and p_avatar_rang is distinct from v_u.avatar_rang then v_ozgardi := array_append(v_ozgardi, 'avatar_rang'); end if;

  update public.t2_foydalanuvchi set
    ism = coalesce(v_ism, ism),
    telefon = case when v_tel_bor then v_tel else telefon end,
    telefon_tasdiqlangan = case when v_tel_bor and v_tel is distinct from telefon then false else telefon_tasdiqlangan end,
    til = coalesce(p_til, til),
    avatar_rang = coalesce(p_avatar_rang, avatar_rang)
  where id = p_actor_id;

  if cardinality(v_ozgardi) > 0 then
    perform public._t2_profil_audit(p_actor_id, 'profil_yangila', 'maydonlar=' || array_to_string(v_ozgardi, ','));
  end if;
  return jsonb_build_object('ok',true,'profil',public._t2_profil_json(p_actor_id));
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_parol_ozgartir_v1 — hash bor bo'lsa eski parol SHART; Google-only (hash yo'q) uchun shart emas.
-- Muvaffaqiyatda barcha mavjud sessiyalar bekor (sessiya_bekor_dan=now()).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_parol_ozgartir_v1(p_actor_id bigint, p_eski text, p_yangi text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_bekor timestamptz;
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;

  if length(coalesce(p_yangi,'')) < 8 then return jsonb_build_object('ok',false,'code','PAROL_QISQA'); end if;
  if length(p_yangi) > 128 then return jsonb_build_object('ok',false,'code','PAROL_UZUN'); end if;

  if v_u.parol_hash is not null then
    if coalesce(p_eski,'') = '' or v_u.parol_hash <> extensions.crypt(p_eski, v_u.parol_hash) then
      return jsonb_build_object('ok',false,'code','ESKI_PAROL_XATO');
    end if;
    if p_yangi = p_eski then return jsonb_build_object('ok',false,'code','PAROL_BIR_XIL'); end if;
  end if;

  v_bekor := now();
  update public.t2_foydalanuvchi
    set parol_hash = extensions.crypt(p_yangi, extensions.gen_salt('bf')),
        parol_yangilandi = v_bekor, sessiya_bekor_dan = v_bekor
    where id = p_actor_id;
  perform public._t2_profil_audit(p_actor_id, 'parol_ozgartir', case when v_u.parol_hash is null then 'birinchi parol (Google hisob)' else 'parol almashtirildi' end);
  return jsonb_build_object('ok',true,'sessiya_bekor_dan',v_bekor);
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_sessiya_bekor_v1 — barcha (shu jumladan joriy) cookie lar bekor; API joriy qurilmaga yangisini beradi.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_sessiya_bekor_v1(p_actor_id bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_bekor timestamptz := now();
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  update public.t2_foydalanuvchi set sessiya_bekor_dan = v_bekor where id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  perform public._t2_profil_audit(p_actor_id, 'sessiya_bekor', 'boshqa qurilmalardan chiqarildi');
  return jsonb_build_object('ok',true,'sessiya_bekor_dan',v_bekor);
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_google_uzish_v1 — parolsiz hisobda mumkin emas (o'zini qulflab qo'ymasin).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_google_uzish_v1(p_actor_id bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype;
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  if v_u.parol_hash is null then return jsonb_build_object('ok',false,'code','GOOGLE_PAROLSIZ'); end if;
  update public.t2_foydalanuvchi set google_sub = null where id = p_actor_id;
  perform public._t2_profil_audit(p_actor_id, 'google_uzish', 'Google ulanishi uzildi');
  return jsonb_build_object('ok',true,'profil',public._t2_profil_json(p_actor_id));
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_google_ulash_v1 — p_sub/p_email SERVER Google ID tokenini tekshirgandan KEYIN beradi.
-- Boshqa faol hisobda shu google_sub yoki email bo'lsa → GOOGLE_BOSHQA_HISOB + boshqa_login (UI birlashtirishni taklif qiladi).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_google_ulash_v1(p_actor_id bigint, p_sub text, p_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_email text := lower(btrim(coalesce(p_email,''))); v_b public.t2_foydalanuvchi%rowtype; v_h public.t2_foydalanuvchi%rowtype; v_f bigint;
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  if coalesce(btrim(p_sub),'') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok',false,'code','GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  if v_u.google_sub is not null then
    if v_u.google_sub = p_sub then return jsonb_build_object('ok',true,'profil',public._t2_profil_json(p_actor_id)); end if;
    return jsonb_build_object('ok',false,'code','GOOGLE_ALLAQACHON_ULANGAN');
  end if;

  -- Shu google_sub egasi (har qanday holatda; unique indeks) — birlashtirilgan bo'lsa omon qolgan hisobga qaraymiz.
  select * into v_h from public.t2_foydalanuvchi where google_sub = p_sub and id <> p_actor_id;
  if found then
    v_f := public._t2_hisob_oxirgi(v_h.id);
    if v_f is distinct from p_actor_id then
      select * into v_b from public.t2_foydalanuvchi where id = coalesce(v_f, v_h.id);
      return jsonb_build_object('ok',false,'code','GOOGLE_BOSHQA_HISOB','boshqa_login',v_b.login);
    end if;
    update public.t2_foydalanuvchi set google_sub = null where id = v_h.id;  -- actor ga birlashtirilgan eski hisob
  end if;
  -- Shu email/login egasi (faol, boshqa hisob).
  select * into v_b from public.t2_foydalanuvchi
   where id <> p_actor_id and holat = 'faol' and (lower(email) = v_email or lower(login) = v_email) order by id limit 1;
  if found then return jsonb_build_object('ok',false,'code','GOOGLE_BOSHQA_HISOB','boshqa_login',v_b.login); end if;

  begin
    update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(nullif(btrim(email),''), v_email) where id = p_actor_id;
  exception when unique_violation then
    return jsonb_build_object('ok',false,'code','GOOGLE_BOSHQA_HISOB');
  end;
  perform public._t2_profil_audit(p_actor_id, 'google_ulash', 'Google ulandi');
  return jsonb_build_object('ok',true,'profil',public._t2_profil_json(p_actor_id));
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_hisob_birlashtir_v1 — BOSHQA faol hisobni (login + parol bilan egalik isbotlangan) actor ga birlashtiradi.
-- BIR TRANZAKSIYADA: a'zoliklar va jonli ruxsat qatorlari actor ga ko'chadi; tarixiy/audit qatorlariga tegilmaydi.
-- Kodlar: LOGIN_PAROL_XATO, OZI, PAROLSIZ_HISOB, ACTOR_NOT_FOUND.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_hisob_birlashtir_v1(p_actor_id bigint, p_login text, p_parol text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_a public.t2_foydalanuvchi%rowtype; v_o public.t2_foydalanuvchi%rowtype; v_oid bigint;
  v_r public.t2_azolik%rowtype; v_ex public.t2_azolik%rowtype;
  v_koch jsonb := '[]'::jsonb; v_qolgan jsonb := '[]'::jsonb; v_boshqa jsonb := '{}'::jsonb;
  v_spec text; v_t text; v_c text; v_k text; v_q text; v_n bigint; v_ok bigint; v_sub text;
begin
  if p_actor_id is null then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  if coalesce(btrim(p_login),'') = '' or coalesce(p_parol,'') = '' then return jsonb_build_object('ok',false,'code','LOGIN_PAROL_XATO'); end if;

  select id into v_oid from public.t2_foydalanuvchi where lower(login) = lower(btrim(p_login)) and holat = 'faol';
  if v_oid is null then
    perform 1 from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol';
    if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
    return jsonb_build_object('ok',false,'code','LOGIN_PAROL_XATO');
  end if;
  if v_oid = p_actor_id then return jsonb_build_object('ok',false,'code','OZI'); end if;

  -- Ikkala qatorni id tartibida qulflash (deadlock yo'q).
  perform 1 from public.t2_foydalanuvchi where id in (p_actor_id, v_oid) order by id for update;
  select * into v_a from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  select * into v_o from public.t2_foydalanuvchi where id = v_oid and holat = 'faol';
  if not found then return jsonb_build_object('ok',false,'code','LOGIN_PAROL_XATO'); end if;
  if v_o.parol_hash is null then return jsonb_build_object('ok',false,'code','PAROLSIZ_HISOB'); end if;
  if v_o.parol_hash <> extensions.crypt(p_parol, v_o.parol_hash) then return jsonb_build_object('ok',false,'code','LOGIN_PAROL_XATO'); end if;

  -- Audit (ko'chirishdan OLDIN): boshqa hisobning birinchi kompaniyasi.
  perform public._t2_profil_audit(v_oid, 'hisob_birlashtir', format('hisob %s hisob %s ga birlashtirilmoqda', v_oid, p_actor_id));

  -- 1) A'zoliklar (t2_azolik; qo'shimcha ruxsatlar azolik_id orqali birga ko'chadi).
  for v_r in select * from public.t2_azolik where foydalanuvchi_id = v_oid and holat = 'faol' order by id loop
    select * into v_ex from public.t2_azolik where foydalanuvchi_id = p_actor_id and kompaniya_id = v_r.kompaniya_id;
    if not found then
      update public.t2_azolik set foydalanuvchi_id = p_actor_id where id = v_r.id;
      v_koch := v_koch || jsonb_build_object('kompaniya_id',v_r.kompaniya_id,'rol',v_r.rol);
    elsif v_ex.holat = 'faol' then
      -- Actor ning o'z a'zoligi qoladi; boshqasining roli natijada yoziladi, uning qatori yopiladi.
      v_qolgan := v_qolgan || jsonb_build_object('kompaniya_id',v_r.kompaniya_id,'rol',v_r.rol,'actor_rol',v_ex.rol);
      update public.t2_azolik set holat = 'bekor' where id = v_r.id;
    else
      -- Actor da yopilgan (bekor) qator bor — unique cheklov tufayli o'sha qatorni boshqasining roli bilan qayta ochamiz.
      update public.t2_azolik set holat = 'faol', rol = v_r.rol where id = v_ex.id;
      update public.t2_azolik set holat = 'bekor' where id = v_r.id;
      v_koch := v_koch || jsonb_build_object('kompaniya_id',v_r.kompaniya_id,'rol',v_r.rol);
    end if;
  end loop;

  -- 2) Boshqa JONLI ruxsat/profil jadvallari (mavjud bo'lsa). Format: jadval|ustun|nomzod-kalit
  --    kalit '' = unique yo'q; '*' = actor da umuman qator bo'lmasa; aks holda (ustun, kalit) juftligi to'qnashsa o'tkazib yuboriladi.
  foreach v_spec in array array[
    't2_loyiha_foydalanuvchi_ruxsat|foydalanuvchi_id|loyiha_id',
    't2_obyekt_foydalanuvchi_ruxsat|foydalanuvchi_id|obyekt_id',
    't2_shaxs_yonalish|foydalanuvchi_id|yonalish',
    't2_mutaxassis_profil|foydalanuvchi_id|*',
    't2_bildirishnoma|foydalanuvchi_id|outbox_id',
    't2_kadr_mustaqil|foydalanuvchi_id|',
    't2_topshiriq|ijrochi_foydalanuvchi_id|'
  ] loop
    v_t := split_part(v_spec,'|',1); v_c := split_part(v_spec,'|',2); v_k := split_part(v_spec,'|',3);
    if to_regclass('public.' || v_t) is null then continue; end if;
    if v_k = '' then
      v_q := format('update public.%I set %I = $1 where %I = $2', v_t, v_c, v_c);
    elsif v_k = '*' then
      v_q := format('update public.%I set %I = $1 where %I = $2 and not exists (select 1 from public.%I y where y.%I = $1)', v_t, v_c, v_c, v_t, v_c);
    else
      v_q := format('update public.%I x set %I = $1 where x.%I = $2 and not exists (select 1 from public.%I y where y.%I = $1 and y.%I is not distinct from x.%I)', v_t, v_c, v_c, v_t, v_c, v_k, v_k);
    end if;
    execute v_q using p_actor_id, v_oid;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_boshqa := v_boshqa || jsonb_build_object(v_t, v_n); end if;
  end loop;

  -- 3) Email / Google: actor da yo'q bo'lsa ko'chiriladi (google_sub unique → avval boshqasidan olinadi).
  if v_a.email is null and v_o.email is not null then
    update public.t2_foydalanuvchi set email = v_o.email where id = p_actor_id;
  end if;
  if v_a.google_sub is null and v_o.google_sub is not null then
    v_sub := v_o.google_sub;
    update public.t2_foydalanuvchi set google_sub = null where id = v_oid;
    update public.t2_foydalanuvchi set google_sub = v_sub where id = p_actor_id;
  end if;

  -- 4) Boshqa hisob yopiladi: kirish endi actor ga yo'naltiriladi; eski sessiyalar bekor.
  update public.t2_foydalanuvchi set holat = 'birlashtirildi', birlashgan_id = p_actor_id, sessiya_bekor_dan = now() where id = v_oid;

  perform public._t2_profil_audit(p_actor_id, 'hisob_birlashtir',
    format('hisob %s birlashtirildi; kochirilgan=%s; qolgan=%s', v_oid, jsonb_array_length(v_koch), jsonb_array_length(v_qolgan)));

  return jsonb_build_object('ok',true,'birlashtirilgan_id',v_oid,'kochirilgan_kompaniyalar',v_koch,'qolgan_rollar',v_qolgan,'boshqa_jadvallar',v_boshqa);
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- t2_parol_tekshir_v1 — 20261105300000 dagi tana + BIRLASHTIRILGAN hisob: parol tekshiriladi (hash hali o'sha hisobda),
-- so'ng omon qolgan hisob qaytariladi (foydalanuvchi_id, rol, login = omon qolganniki).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.t2_parol_tekshir_v1(p_login text, p_parol text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_hash text; v_holat text; v_final bigint; v_flogin text;
begin
  if coalesce(btrim(p_login),'') = '' or coalesce(p_parol,'') = '' then return jsonb_build_object('ok',false,'code','LOGIN_PAROL_MAJBURIY'); end if;
  select id, parol_hash, holat into v_id, v_hash, v_holat from public.t2_foydalanuvchi where lower(login) = lower(btrim(p_login));
  if v_id is null or v_hash is null then return jsonb_build_object('ok',false,'code','NO_PASSWORD_SET'); end if;
  if v_holat = 'birlashtirildi' then
    if v_hash <> extensions.crypt(p_parol, v_hash) then return jsonb_build_object('ok',false,'code','PAROL_NOTOGRI'); end if;
    v_final := public._t2_hisob_oxirgi(v_id);
    if v_final is null then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
    select login into v_flogin from public.t2_foydalanuvchi where id = v_final;
    return jsonb_build_object('ok',true,'foydalanuvchi_id',v_final,'login',v_flogin,'rol',coalesce(public._t2_asosiy_rol(v_final),'kuzatuvchi'));
  end if;
  if v_holat is distinct from 'faol' then return jsonb_build_object('ok',false,'code','FOYDALANUVCHI_FAOL_EMAS'); end if;
  if v_hash <> extensions.crypt(p_parol, v_hash) then return jsonb_build_object('ok',false,'code','PAROL_NOTOGRI'); end if;
  return jsonb_build_object('ok',true,'foydalanuvchi_id',v_id,'rol',coalesce(public._t2_asosiy_rol(v_id),'kuzatuvchi'));
end $$;

-- ─── t2_men_v1: 20261106780000 dagi tana + foydalanuvchi.sessiya_bekor_dan ───
create or replace function public.t2_men_v1(p_actor_id bigint)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_u public.t2_foydalanuvchi%rowtype; v_az jsonb; v_context jsonb; v_super boolean;
begin
  if p_actor_id is null or p_actor_id<=0 then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  select * into v_u from public.t2_foydalanuvchi where id=p_actor_id and holat='faol';
  if not found then return jsonb_build_object('ok',false,'code','ACTOR_NOT_FOUND'); end if;
  v_super:=public.t2_platforma_superadmin(p_actor_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'azolik_id',a.id,'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'turi',k.turi,
    'rol',a.rol,'is_director',a.rol in ('boss','admin','superadmin'),
    'holat',a.holat,'faol',k.faol) order by k.nom),'[]'::jsonb) into v_az
    from public.t2_azolik a join public.t2_kompaniya k on k.id=a.kompaniya_id
    where a.foydalanuvchi_id=p_actor_id and a.holat='faol';
  -- Context access is NOT membership. Never create synthetic memberships.
  select coalesce(jsonb_agg(jsonb_build_object(
    'kompaniya_id',k.id,'nom',k.nom,'kod',k.kod,'faol',k.faol,'turi',k.turi,
    'membership_role',a.rol,'effective_role',case when v_super then 'superadmin' else a.rol end,
    'permissions',case when v_super then public.t2_permission_catalog_v2() else public.t2_azolik_permissions_v2(a.id) end,
    'explicit_denials',case when v_super or a.rol in ('boss','admin','superadmin') then '[]'::jsonb else coalesce((select jsonb_agg(q.ruxsat) from public.t2_azolik_ruxsat_qoshimcha q where q.azolik_id=a.id and not q.berilgan),'[]'::jsonb) end,
    'modullar_off',case when v_super then '[]'::jsonb else coalesce((
        select jsonb_agg(c.kod order by c.kod) from public.t2_capability c
         cross join lateral public.t2_capability_effective_v1(c.kod, k.id, null) e
         where c.turi = 'module' and e->>'holat' = 'off'), '[]'::jsonb) end,
    'is_director',v_super or a.rol in ('boss','admin','superadmin')) order by k.nom),'[]'::jsonb) into v_context
    from public.t2_kompaniya k left join public.t2_azolik a
      on a.kompaniya_id=k.id and a.foydalanuvchi_id=p_actor_id and a.holat='faol'
    where k.faol=true and (v_super or a.id is not null);
  return jsonb_build_object('ok',true,
    'foydalanuvchi',jsonb_build_object('id',v_u.id,'login',v_u.login,'ism',v_u.ism,'email',v_u.email,'holat',v_u.holat,'sessiya_bekor_dan',v_u.sessiya_bekor_dan),
    'platform_role',case when v_super then 'superadmin' else 'none' end,
    'context_kompaniyalar',v_context,'azoliklar',v_az,'jami',jsonb_array_length(v_az),
    'onboarding_kerak',not v_super and jsonb_array_length(v_context)=0);
end $function$;

-- ─── t2_google_kirish_v1: 20261105310000 dagi tana + birlashtirilgan hisob → omon qolgan ───
create or replace function public.t2_google_kirish_v1(p_email text, p_ism text, p_sub text, p_ip_belgi text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_u public.t2_foydalanuvchi%rowtype; v_rol text;
  v_k jsonb; v_final bigint; v_kid bigint; v_demo bigint; v_manba bigint; v_ism text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if coalesce(btrim(p_sub), '') = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then return jsonb_build_object('ok', false, 'code', 'GOOGLE_MALUMOT_NOTOGRI'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_google_kirish:' || p_sub, 0));

  select * into v_u from public.t2_foydalanuvchi where google_sub = p_sub;
  if not found then
    select * into v_u from public.t2_foydalanuvchi where lower(email) = v_email or lower(login) = v_email order by id limit 1;
    if found then
      -- Birlashtirilgan hisob → omon qolgan hisob (zanjir, ko'pi bilan 5 qadam).
      if v_u.holat = 'birlashtirildi' then
        v_final := public._t2_hisob_oxirgi(v_u.id);
        if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
        select * into v_u from public.t2_foydalanuvchi where id = v_final;
      end if;
      if v_u.google_sub is not null and v_u.google_sub <> p_sub then return jsonb_build_object('ok', false, 'code', 'GOOGLE_BOSHQA_HISOB'); end if;
      -- O'zi ro'yxatdan (parol bilan) o'tgan hisobning emaili TASDIQLANMAGAN: begona odam birovning emailini login qilib
      -- oldindan band qilgan bo'lishi mumkin — avtomatik ulamaymiz (egasi qo'shgan a'zolar emaili — ishonchli).
      if exists (select 1 from public.t2_ozi_royxat_log where foydalanuvchi_id = v_u.id) then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_PAROL_BILAN', 'xabar', 'Bu email parol bilan ro''yxatdan o''tgan. Login va parol bilan kiring.');
      end if;
      update public.t2_foydalanuvchi set google_sub = p_sub, email = coalesce(email, v_email) where id = v_u.id;
    end if;
  end if;

  if v_u.id is not null then
    -- google_sub orqali topilgan hisob birlashtirilgan bo'lsa ham omon qolganga yo'naltiriladi.
    if v_u.holat = 'birlashtirildi' then
      v_final := public._t2_hisob_oxirgi(v_u.id);
      if v_final is null then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
      select * into v_u from public.t2_foydalanuvchi where id = v_final;
    end if;
    if v_u.holat is distinct from 'faol' then return jsonb_build_object('ok', false, 'code', 'FOYDALANUVCHI_FAOL_EMAS'); end if;
    v_rol := public._t2_asosiy_rol(v_u.id);
    return jsonb_build_object('ok', true, 'yangi', false, 'login', v_u.login, 'foydalanuvchi_id', v_u.id, 'rol', coalesce(v_rol, 'kuzatuvchi'));
  end if;

  -- Yangi hisob: o'zi ro'yxat qoidalari (qurilma limiti, bepul tarif, demo).
  perform pg_advisory_xact_lock(hashtextextended('t2_ozi_royxat', 0));
  if (select count(*) from public.t2_ozi_royxat_log where ip_belgi = p_ip_belgi and yaratildi > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'LIMIT', 'xabar', 'Bu qurilmadan bugun ro''yxatdan o''tish limiti tugadi. Ertaga urinib ko''ring.');
  end if;
  v_ism := coalesce(nullif(btrim(left(coalesce(p_ism, ''), 200)), ''), split_part(v_email, '@', 1));
  insert into public.t2_foydalanuvchi(login, email, ism, holat, google_sub)
  values (v_email, v_email, v_ism, 'faol', p_sub) returning * into v_u;
  v_k := public._t2_kompaniya_yarat_asosiy(v_u.id, v_ism || ' — PTO', null, null);
  if coalesce((v_k->>'ok')::boolean, false) is not true then raise exception 'KOMPANIYA_YARATILMADI: %', v_k; end if;
  v_kid := (v_k->>'kompaniya_id')::bigint;
  insert into public.t2_obuna(kompaniya_id, tarif_kod, boshlandi, tugaydi, kim) values (v_kid, 'free', current_date, (current_date + interval '1 month')::date, 'google');
  perform public._t2_sinov_bonus(v_kid, v_u.id);
  select obyekt_id into v_manba from public.t2_demo_manba where id = 1;
  if v_manba is not null then v_demo := public._t2_demo_nusxa(v_kid, v_manba); end if;
  insert into public.t2_ozi_royxat_log(ip_belgi, foydalanuvchi_id, kompaniya_id, operation_id) values (p_ip_belgi, v_u.id, v_kid, p_operation_id);
  perform public.t2_audit_yoz(v_kid, 'ozi_royxat', 'kompaniya', v_demo, format('google login=%s', v_email), 'google', p_ip_belgi);
  return jsonb_build_object('ok', true, 'yangi', true, 'login', v_email, 'foydalanuvchi_id', v_u.id, 'rol', 'boss', 'demo_obyekt_id', v_demo);
end $$;

-- Faqat service_role (Pages Functions); actor HECH QACHON so'rov tanasidan emas — sessiyadan olinadi.
revoke all on function public._t2_hisob_oxirgi(bigint) from public, anon, authenticated;
revoke all on function public._t2_profil_json(bigint) from public, anon, authenticated;
revoke all on function public._t2_profil_audit(bigint,text,text) from public, anon, authenticated;
revoke all on function public.t2_profil_ol_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_profil_yangila_v1(bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.t2_parol_ozgartir_v1(bigint,text,text) from public, anon, authenticated;
revoke all on function public.t2_sessiya_bekor_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_google_uzish_v1(bigint) from public, anon, authenticated;
revoke all on function public.t2_google_ulash_v1(bigint,text,text) from public, anon, authenticated;
revoke all on function public.t2_hisob_birlashtir_v1(bigint,text,text) from public, anon, authenticated;
grant execute on function public._t2_hisob_oxirgi(bigint) to service_role;
grant execute on function public._t2_profil_json(bigint) to service_role;
grant execute on function public._t2_profil_audit(bigint,text,text) to service_role;
grant execute on function public.t2_profil_ol_v1(bigint) to service_role;
grant execute on function public.t2_profil_yangila_v1(bigint,text,text,text,text) to service_role;
grant execute on function public.t2_parol_ozgartir_v1(bigint,text,text) to service_role;
grant execute on function public.t2_sessiya_bekor_v1(bigint) to service_role;
grant execute on function public.t2_google_uzish_v1(bigint) to service_role;
grant execute on function public.t2_google_ulash_v1(bigint,text,text) to service_role;
grant execute on function public.t2_hisob_birlashtir_v1(bigint,text,text) to service_role;
revoke all on function public.t2_parol_tekshir_v1(text,text) from public, anon, authenticated;
grant execute on function public.t2_parol_tekshir_v1(text,text) to service_role;
revoke all on function public.t2_google_kirish_v1(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_google_kirish_v1(text, text, text, text, uuid) to service_role;

commit;
