-- T2-NARX-KATALOG-R2-001 — platforma narx katalogi Supabase dan chiqariladi (egasi qoidasi 2026-10-05:
-- o'zgarmas ma'lumotnoma R2 da, o'zgaruvchan biznes ma'lumoti Supabase da).
--
-- R2: narx-katalog/677dbac888ba440f (213 691 qator, asl ID'lar). Eksport bazadagi md5 bilan aynan
-- (12adeab895f84bd844fde0a25c72841c) — quyidagi himoya shu md5 ni QAYTA tekshiradi: katalog eksportdan
-- keyin o'zgargan bo'lsa migratsiya to'xtaydi, hech narsa o'chirilmaydi.
--
-- Biznes yozuvlari (narx dalili, narx protokoli) katalog qatoriga endi FK emas, SNAPSHOT bilan ishora qiladi:
--   katalog_qator jsonb = {revision, id, nom, kod, birlik, narx, hudud, zavod, nds, davr, manba...}.
--   Platforma qatorini Cloudflare Function R2 dan tekshirib snapshot beradi (functions/_shared/narx-katalog-snapshot.ts).
-- Kompaniyaning o'z narx manbalari (faktura, КП) t2_narx_manba_qator da qoladi va avvalgidek tekshiriladi.
-- MUHIM: t2_narx_dalil.manba_qator_id FK ON DELETE CASCADE edi — oddiy o'chirish dalillarni ham o'chirardi.
begin;

-- 0) Himoya: R2 nusxasi bilan aynanlik.
do $$
declare v_md5 text; v_n bigint;
begin
  select md5(string_agg(q.id::text||'|'||coalesce(q.narx::text,'~')||'|'||coalesce(q.nom,'~')||'|'||coalesce(q.birlik,'~')||'|'||coalesce(q.kod_key,'~')||'|'||coalesce(q.nom_key,'~')||'|'||coalesce(q.hudud,'~'), E'\n' order by q.id)), count(*)
    into v_md5, v_n
    from public.t2_narx_manba_qator q join public.t2_narx_manba m on m.id = q.manba_id and m.kompaniya_id is null;
  if v_n > 0 and (v_md5 <> '12adeab895f84bd844fde0a25c72841c' or v_n <> 213691) then
    raise exception 'TO''XTADI: platforma katalogi R2 eksportidan farq qiladi (n=%, md5=%) — qayta eksport kerak', v_n, v_md5;
  end if;
end $$;

-- 1) Snapshot ustunlari.
alter table public.t2_narx_dalil add column if not exists katalog_qator jsonb;
alter table public.t2_price_basis_line add column if not exists katalog_qator jsonb;
comment on column public.t2_narx_dalil.katalog_qator is 'Platforma narx katalogi (R2) qatorining snapshot''i: manba_qator_id = R2 qator ID. Kompaniya manbasi uchun NULL.';
comment on column public.t2_price_basis_line.katalog_qator is 'Platforma narx katalogi (R2) qatorining snapshot''i (protokol asosi).';

-- 2) Mavjud havolalarni snapshot bilan to'ldirish (o'chirishdan OLDIN).
create or replace function pg_temp._katalog_snap(p_id bigint) returns jsonb language sql stable as $$
  select jsonb_build_object('revision', '677dbac888ba440f', 'id', q.id, 'manba_id', m.id, 'manba_nom', m.nom, 'manba_tur', m.tur, 'manba_sana', m.sana,
    'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik, 'narx', q.narx::text, 'hudud', coalesce(q.hudud, m.region), 'ishlab_chiqaruvchi', q.ishlab_chiqaruvchi,
    'nds_holati', coalesce(q.nds_holati, m.nds_holati), 'nds_izoh', q.nds_izoh, 'yil', coalesce(q.yil, m.yil), 'kvartal', coalesce(q.kvartal, m.kvartal),
    'narx_varianti', q.narx_varianti, 'guruh', q.guruh)
  from public.t2_narx_manba_qator q join public.t2_narx_manba m on m.id = q.manba_id and m.kompaniya_id is null where q.id = p_id
$$;
update public.t2_price_basis_line l set katalog_qator = pg_temp._katalog_snap(l.manba_qator_id)
 where l.manba_qator_id is not null and l.katalog_qator is null and pg_temp._katalog_snap(l.manba_qator_id) is not null;
update public.t2_narx_dalil d set katalog_qator = pg_temp._katalog_snap(d.manba_qator_id)
 where d.manba_qator_id is not null and d.katalog_qator is null and pg_temp._katalog_snap(d.manba_qator_id) is not null;

-- 3) FK'lar olib tashlanadi (manba_qator_id = R2 yoki kompaniya qatori ID; tekshiruv RPC/Function da).
alter table public.t2_narx_dalil drop constraint if exists t2_narx_dalil_manba_qator_id_fkey;
alter table public.t2_price_basis_line drop constraint if exists t2_price_basis_line_manba_qator_id_fkey;

-- 4) Dalil ko'rinishi: kompaniya qatori (jadval) yoki platforma snapshot'i.
create or replace view public.t2_narx_dalil_holat as
 select d.id, d.kompaniya_id, d.obyekt_id, d.qator_id, q.tur, q.kat, q.kod, q.nom, q.birlik, q.hajm, q.narx as hozirgi_narx,
    d.smeta_narx, d.manba_narx, d.izoh, d.kim, d.vaqt,
    m.id as manba_id, m.tur as manba_tur, m.nom as manba_nom, m.raqam as manba_raqam, m.sana as manba_sana,
    coalesce(mq.yil, (d.katalog_qator->>'yil')::smallint, m.yil) as yil,
    coalesce(mq.kvartal, (d.katalog_qator->>'kvartal')::smallint, m.kvartal) as kvartal,
    coalesce(mq.hudud, d.katalog_qator->>'hudud', m.region) as region,
    m.yetkazuvchi, m.yetkazuvchi_inn,
    coalesce(mq.nds_holati, d.katalog_qator->>'nds_holati', m.nds_holati) as nds_holati,
    m.fayl_document_id,
    coalesce(mq.kod, d.katalog_qator->>'kod') as manba_kod,
    coalesce(mq.nom, d.katalog_qator->>'nom') as manba_nom_qator,
    coalesce(mq.birlik, d.katalog_qator->>'birlik') as manba_birlik,
    coalesce(mq.ishlab_chiqaruvchi, d.katalog_qator->>'ishlab_chiqaruvchi') as ishlab_chiqaruvchi,
    coalesce(mq.nds_izoh, d.katalog_qator->>'nds_izoh') as nds_izoh,
    coalesce(mq.narx_varianti, d.katalog_qator->>'narx_varianti') as narx_varianti,
    coalesce(mq.guruh, d.katalog_qator->>'guruh') as manba_guruh,
    (m.kompaniya_id is null) as platforma
   from public.t2_narx_dalil d
     join public.t2_qator q on q.id = d.qator_id
     join public.t2_narx_manba m on m.id = d.manba_id
     left join public.t2_narx_manba_qator mq on mq.id = d.manba_qator_id
  where d.holat = 'faol' and (mq.id is not null or d.katalog_qator is not null);

-- 5) Dalil bog'lash: platforma qatori — Function tekshirgan snapshot bilan; kompaniya qatori — jadvaldan.
create or replace function public.t2_narx_dalil_bogla_v1(p_kompaniya_id bigint, p_obyekt_id bigint, p_boglar jsonb, p_kim text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_soni int := 0; v_yomon int;
begin
  if not exists (select 1 from t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'error', 'Obyekt bu kompaniyaga tegishli emas');
  end if;
  if p_boglar is null or jsonb_typeof(p_boglar) <> 'array' or jsonb_array_length(p_boglar) = 0 or jsonb_array_length(p_boglar) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'Bog''lanishlar 1..5000 bo''lishi shart');
  end if;
  select count(*) into v_yomon
  from jsonb_array_elements(p_boglar) e
  left join t2_qator q on q.id = (e->>'qator_id')::bigint and q.obyekt_id = p_obyekt_id
  left join t2_narx_manba_qator mq on e->'katalog' is null and mq.id = (e->>'manba_qator_id')::bigint and mq.kompaniya_id = p_kompaniya_id and not mq.sarlavha
  left join t2_narx_manba m on m.holat = 'faol' and m.id = case when e->'katalog' is null then mq.manba_id else (e->'katalog'->>'manba_id')::bigint end
  where q.id is null or m.id is null
     or (e->'katalog' is null and mq.id is null)
     or (e->'katalog' is not null and (m.kompaniya_id is not null or (e->'katalog'->>'id')::bigint is distinct from (e->>'manba_qator_id')::bigint
         or coalesce(e->'katalog'->>'narx', '') !~ '^\d+(\.\d+)?$' or (e->'katalog'->>'narx')::numeric <= 0));
  if v_yomon > 0 then
    return jsonb_build_object('ok', false, 'error', v_yomon || ' ta bog''lanish noto''g''ri (qator obyektda yoki manba pozitsiyasi topilmadi)');
  end if;
  update t2_narx_dalil d set holat = 'bekor'
   where d.holat = 'faol' and d.qator_id in (select (e->>'qator_id')::bigint from jsonb_array_elements(p_boglar) e);
  insert into t2_narx_dalil (kompaniya_id, obyekt_id, qator_id, manba_qator_id, manba_id, smeta_narx, manba_narx, izoh, kim, katalog_qator)
  select p_kompaniya_id, p_obyekt_id, q.id, (s.e->>'manba_qator_id')::bigint,
         coalesce(mq.manba_id, (s.e->'katalog'->>'manba_id')::bigint), q.narx,
         coalesce(mq.narx, (s.e->'katalog'->>'narx')::numeric), s.e->>'izoh', p_kim, s.e->'katalog'
  from (select distinct on ((x->>'qator_id')::bigint) x as e from jsonb_array_elements(p_boglar) x order by (x->>'qator_id')::bigint) s
  join t2_qator q on q.id = (s.e->>'qator_id')::bigint
  left join t2_narx_manba_qator mq on s.e->'katalog' is null and mq.id = (s.e->>'manba_qator_id')::bigint;
  get diagnostics v_soni = row_count;
  return jsonb_build_object('ok', true, 'boglandi', v_soni);
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'error', 'qator_id / manba_qator_id son bo''lishi shart');
end $$;

-- 6) Protokol: manba_qator_id berilsa — kompaniya qatori yoki Function snapshot'i bo'lishi SHART (fail-closed).
create or replace function public.t2_narx_protokol_yarat_v1(p_actor_id bigint, p_obyekt_id bigint, p_lines jsonb, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_komp bigint; v_rol text; v_id bigint; v_prev jsonb; v_raqam text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_kompaniya_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'error', 'Obyekt topilmadi'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol = 'rahbar' then return jsonb_build_object('ok', false, 'error', 'Ruxsat yo''q'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'Qatorlar 1..5000 bo''lishi shart');
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x left join public.t2_qator q on q.id = (x->>'qator_id')::bigint and q.obyekt_id = p_obyekt_id
             where q.id is null or nullif(x->>'yangi_narx', '') is null or (x->>'yangi_narx')::numeric <= 0) then
    return jsonb_build_object('ok', false, 'error', 'Qator obyektga tegishli emas yoki yangi narx noto''g''ri');
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) x
             where nullif(x->>'manba_qator_id', '') is not null
               and not exists (select 1 from public.t2_narx_manba_qator mq where mq.id = (x->>'manba_qator_id')::bigint and mq.kompaniya_id = v_komp)
               and (x->'katalog' is null or (x->'katalog'->>'id')::bigint is distinct from (x->>'manba_qator_id')::bigint)) then
    return jsonb_build_object('ok', false, 'error', 'Narx manbasi pozitsiyasi tasdiqlanmadi (katalog qatori topilmadi)');
  end if;
  select 'ПС-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 2, '0') into v_raqam
    from public.t2_price_basis where obyekt_id = p_obyekt_id and basis_type = 'PRICE_AGREEMENT_PROTOCOL' and yaratildi::date = current_date;
  insert into public.t2_price_basis (kompaniya_id, obyekt_id, basis_type, holat, actor_id, operation_id, raqam, sana, izoh)
  values (v_komp, p_obyekt_id, 'PRICE_AGREEMENT_PROTOCOL', 'qoralama', p_actor_id, p_operation_id, v_raqam, current_date, left(p_izoh, 1000))
  returning id into v_id;
  insert into public.t2_price_basis_line (basis_id, qator_id, approved_price, eski_narx, manba_qator_id, izoh, katalog_qator)
  select v_id, (x->>'qator_id')::bigint, (x->>'yangi_narx')::numeric, q.narx,
         nullif(x->>'manba_qator_id', '')::bigint, left(x->>'izoh', 500), x->'katalog'
  from jsonb_array_elements(p_lines) x join public.t2_qator q on q.id = (x->>'qator_id')::bigint;
  perform public.t2_audit_yoz(v_komp, 'narx_protokol_yarat', 'narx', p_obyekt_id, v_raqam || ' (' || jsonb_array_length(p_lines) || ' qator)', 'actor:' || p_actor_id, null);
  v_prev := jsonb_build_object('ok', true, 'id', v_id, 'raqam', v_raqam);
  insert into public.t2_kompaniya_command_log (operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'narx_protokol_yarat_v1', v_prev);
  return v_prev;
end $$;

-- 7) Platforma katalogini bazaga yuklash yopiladi: katalog R2 orqali yangilanadi (scripts/narx-katalog).
create or replace function public.t2_platforma_narx_manba_yoz_v1(p_actor_id bigint, p_malumot jsonb, p_qatorlar jsonb default null, p_rejim text default 'almashtir',
  p_id bigint default null, p_kutilgan_versiya integer default null, p_operation_id uuid default null)
returns jsonb language sql security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object('ok', false, 'sabab', 'r2',
    'error', 'Platforma narx katalogi endi R2 da (o''zgarmas ma''lumotnoma). Yangi katalog R2 nashri orqali yuklanadi — bazaga yozilmaydi.')
$$;
revoke all on function public.t2_platforma_narx_manba_yoz_v1(bigint, jsonb, jsonb, text, bigint, integer, uuid) from public, anon, authenticated;

-- 8) Manba sarlavhasi qoladi (dalil/protokol manba_id ga ishora qiladi), R2 revisiyasi yoziladi.
alter table public.t2_narx_manba add column if not exists r2_revision text;
update public.t2_narx_manba set r2_revision = '677dbac888ba440f' where kompaniya_id is null and tur = 'katalog' and id = 5;

-- 9) Platforma katalogi qatorlari bazadan chiqariladi (R2 da to'liq va tekshirilgan).
delete from public.t2_narx_manba_qator q using public.t2_narx_manba m where m.id = q.manba_id and m.kompaniya_id is null;

-- 10) Yakuniy tekshiruv: snapshot'siz qolgan biznes havolasi yo'q.
do $$
declare v int;
begin
  select count(*) into v from public.t2_price_basis_line l
   where l.manba_qator_id is not null and l.katalog_qator is null
     and not exists (select 1 from public.t2_narx_manba_qator mq where mq.id = l.manba_qator_id);
  if v > 0 then raise exception 'TO''XTADI: % ta protokol qatori snapshot''siz qoldi', v; end if;
  select count(*) into v from public.t2_narx_dalil d
   where d.manba_qator_id is not null and d.katalog_qator is null
     and not exists (select 1 from public.t2_narx_manba_qator mq where mq.id = d.manba_qator_id);
  if v > 0 then raise exception 'TO''XTADI: % ta narx dalili snapshot''siz qoldi', v; end if;
end $$;

commit;
-- Keyin (tranzaksiyadan tashqarida): vacuum (full, analyze) public.t2_narx_manba_qator;
