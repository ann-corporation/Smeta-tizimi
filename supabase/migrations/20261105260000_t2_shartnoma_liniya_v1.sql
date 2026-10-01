-- T2-SHARTNOMA-LINIYA-001 — Kompaniya → Loyiha → Shartnoma (tomonlar) → Obyektlar (egasi, 2026-10-01).
-- Egasi qarorlari:
--   * buyurtmachi ↔ pudratchi (ASOSIY shartnoma): obyekt faqat BITTA asosiy shartnomada;
--   * subpudrat, laboratoriya, loyihachi, yetkazib beruvchi va boshqa shartnomalar: cheklanmagan;
--   * tomon rollari va shartnoma turlari ERKIN matn (qattiq ro'yxat yo'q);
--   * shartnomasiz obyektlarni egasi o'zi biriktiradi — liniya to'g'ri ishlasa bas.
-- Moslik: mavjud t2_shartnoma_bog (UNIQUE obyekt_id) = ASOSIY bog'lanish bo'lib qoladi — nakrutka,
-- mindmap, F2/F3 zanjiri o'zgarishsiz ishlaydi. Qo'shimcha shartnomalar — yangi t2_shartnoma_qoshimcha_bog.
-- Hech bir smeta/akt/fakt/to'lov ma'lumoti o'zgarmaydi.

begin;

alter table public.t2_shartnoma add column if not exists asosiy boolean not null default true;
alter table public.t2_shartnoma add column if not exists turi text;
comment on column public.t2_shartnoma.asosiy is 'true — buyurtmachi↔pudratchi asosiy shartnoma (obyektda bitta, t2_shartnoma_bog); false — subpudrat/lab/loyiha/yetkazib berish va h.k. (t2_shartnoma_qoshimcha_bog)';
comment on column public.t2_shartnoma.turi is 'Erkin matn: masalan Bosh shartnoma, Subpudrat, Laboratoriya, Loyiha, Yetkazib berish';

create table if not exists public.t2_shartnoma_tomon (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  rol text not null,                       -- erkin: Buyurtmachi, Bosh pudratchi, Subpudratchi, Laboratoriya …
  kontragent_id bigint references public.t2_kontragent(id) on delete set null,
  tomon_kompaniya_id bigint references public.t2_kompaniya(id) on delete set null,
  nom text not null, inn text, rekvizit jsonb not null default '{}'::jsonb,
  tartib int not null default 0, yaratildi timestamptz not null default now());
create index if not exists t2_shartnoma_tomon_sh_idx on public.t2_shartnoma_tomon(shartnoma_id);
alter table public.t2_shartnoma_tomon enable row level security;
revoke all on public.t2_shartnoma_tomon from anon, authenticated;

create table if not exists public.t2_shartnoma_qoshimcha_bog (
  id bigserial primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  shartnoma_id bigint not null references public.t2_shartnoma(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  holat text not null default 'faol' check (holat in ('faol', 'bekor')),
  yaratildi timestamptz not null default now(),
  unique (shartnoma_id, obyekt_id));
create index if not exists t2_shartnoma_qbog_obyekt_idx on public.t2_shartnoma_qoshimcha_bog(obyekt_id);
alter table public.t2_shartnoma_qoshimcha_bog enable row level security;
revoke all on public.t2_shartnoma_qoshimcha_bog from anon, authenticated;

-- Mavjud shartnomalar: asosiy (default true). Tomon: taraf / zakazchik_* → "Buyurtmachi".
insert into public.t2_shartnoma_tomon(kompaniya_id, shartnoma_id, rol, tomon_kompaniya_id, nom, inn, rekvizit, tartib)
select s.kompaniya_id, s.id, 'Buyurtmachi', s.zakazchik_kompaniya_id,
       coalesce(nullif(btrim(s.zakazchik_toliq_nom), ''), nullif(btrim(s.taraf), ''), 'Buyurtmachi'), s.zakazchik_inn,
       jsonb_strip_nulls(jsonb_build_object('manzil', s.zakazchik_manzil, 'telefon', s.zakazchik_telefon, 'hisob_raqam', s.zakazchik_hisob_raqam,
         'bank', s.zakazchik_bank, 'mfo', s.zakazchik_mfo, 'oked', s.zakazchik_oked)), 0
  from public.t2_shartnoma s
 where not exists (select 1 from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id)
   and coalesce(nullif(btrim(s.zakazchik_toliq_nom), ''), nullif(btrim(s.taraf), '')) is not null;

/* Izchillik: asosiy bog' faqat asosiy shartnomaga, qo'shimcha bog' faqat qo'shimchaga;
   obyekt loyihasi = shartnoma loyihasi (obyektda loyiha bo'lmasa — beriladi, boshqa bo'lsa — rad). */
create or replace function public.t2_shartnoma_bog_izchil_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_sh public.t2_shartnoma%rowtype; v_ob public.t2_obyekt%rowtype;
begin
  if new.holat <> 'faol' then return new; end if;
  select * into v_sh from public.t2_shartnoma where id = new.shartnoma_id;
  select * into v_ob from public.t2_obyekt where id = new.obyekt_id;
  if v_sh.kompaniya_id is distinct from v_ob.kompaniya_id then raise exception 'SHARTNOMA_OBYEKT_TENANT' using errcode = '42501'; end if;
  if tg_table_name = 't2_shartnoma_bog' and not v_sh.asosiy then
    raise exception 'ASOSIY_EMAS: % qo''shimcha shartnoma — asosiy bog''lanishga qo''yilmaydi', v_sh.raqam;
  end if;
  if tg_table_name = 't2_shartnoma_qoshimcha_bog' and v_sh.asosiy then
    raise exception 'ASOSIY_SHARTNOMA: % asosiy shartnoma — qo''shimcha bog''lanishga qo''yilmaydi', v_sh.raqam;
  end if;
  if v_sh.loyiha_id is not null then
    if v_ob.loyiha_id is null then
      update public.t2_obyekt set loyiha_id = v_sh.loyiha_id where id = v_ob.id;
    elsif v_ob.loyiha_id <> v_sh.loyiha_id then
      raise exception 'OBYEKT_BOSHQA_LOYIHA: «%» boshqa loyihada', v_ob.nom;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t2_shartnoma_bog_izchil on public.t2_shartnoma_bog;
create trigger t2_shartnoma_bog_izchil before insert or update of holat, shartnoma_id, obyekt_id on public.t2_shartnoma_bog
  for each row execute function public.t2_shartnoma_bog_izchil_trg();
drop trigger if exists t2_shartnoma_qbog_izchil on public.t2_shartnoma_qoshimcha_bog;
create trigger t2_shartnoma_qbog_izchil before insert or update of holat, shartnoma_id, obyekt_id on public.t2_shartnoma_qoshimcha_bog
  for each row execute function public.t2_shartnoma_bog_izchil_trg();

/* O'QISH: butun liniya bitta chaqiruvda (a'zolik ichida). */
create or replace function public.t2_shartnoma_liniya_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  with sh as (
    select s.*, (
        select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'rol', t.rol, 'nom', t.nom, 'inn', t.inn, 'kontragent_id', t.kontragent_id,
                 'tomon_kompaniya_id', t.tomon_kompaniya_id, 'rekvizit', t.rekvizit) order by t.tartib, t.id), '[]'::jsonb)
          from public.t2_shartnoma_tomon t where t.shartnoma_id = s.id) tomonlar,
      case when s.asosiy then (select coalesce(jsonb_agg(b.obyekt_id order by b.obyekt_id), '[]'::jsonb) from public.t2_shartnoma_bog b where b.shartnoma_id = s.id and b.holat = 'faol')
           else (select coalesce(jsonb_agg(b.obyekt_id order by b.obyekt_id), '[]'::jsonb) from public.t2_shartnoma_qoshimcha_bog b where b.shartnoma_id = s.id and b.holat = 'faol') end obyektlar
      from public.t2_shartnoma s where s.kompaniya_id = p_kompaniya_id and s.holat <> 'bekor'
  )
  select jsonb_build_object(
    'loyihalar', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'nom', l.nom, 'holat', l.holat) order by l.id), '[]'::jsonb) from public.t2_loyiha l where l.kompaniya_id = p_kompaniya_id),
    'shartnomalar', (select coalesce(jsonb_agg(jsonb_build_object('id', sh.id, 'loyiha_id', sh.loyiha_id, 'raqam', sh.raqam, 'nom', sh.nom, 'turi', sh.turi,
        'asosiy', sh.asosiy, 'holat', sh.holat, 'summa_bez_nds', sh.summa_bez_nds, 'nds', sh.nds, 'jami_nds_bilan', sh.jami_nds_bilan,
        'izoh', sh.izoh, 'versiya', sh.versiya, 'tomonlar', sh.tomonlar, 'obyektlar', sh.obyektlar) order by sh.loyiha_id nulls last, sh.asosiy desc, sh.id), '[]'::jsonb) from sh),
    'obyektlar', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nom', o.nom, 'loyiha_id', o.loyiha_id,
        'asosiy_shartnoma_id', (select b.shartnoma_id from public.t2_shartnoma_bog b where b.obyekt_id = o.id and b.holat = 'faol' limit 1)) order by o.nom), '[]'::jsonb)
        from public.t2_obyekt o where o.kompaniya_id = p_kompaniya_id and o.holat <> 'bekor'),
    'rollar', (select coalesce(jsonb_agg(distinct t.rol), '[]'::jsonb) from public.t2_shartnoma_tomon t where t.kompaniya_id = p_kompaniya_id),
    'turlar', (select coalesce(jsonb_agg(distinct s.turi), '[]'::jsonb) from public.t2_shartnoma s where s.kompaniya_id = p_kompaniya_id and s.turi is not null))
    into v_res;
  return v_res;
end $$;

/* YOZISH: shartnoma kartasi — maydonlar, tomonlar, obyektlar bitta tranzaksiyada. */
create or replace function public.t2_shartnoma_saqla_v2(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_kutilgan_versiya integer,
  p_malumot jsonb, p_tomonlar jsonb, p_obyektlar jsonb, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_prev jsonb; v_id bigint := p_id; v_sh public.t2_shartnoma%rowtype; v_asosiy boolean; v_loyiha bigint;
  v_obs bigint[]; v_o bigint; v_band record; v_t jsonb; v_i int := 0; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto', 'bugalter') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_malumot->>'raqam', '')), '') is null then return jsonb_build_object('ok', false, 'code', 'RAQAM_REQUIRED'); end if;
  v_loyiha := nullif(p_malumot->>'loyiha_id', '')::bigint;
  if v_loyiha is null then return jsonb_build_object('ok', false, 'code', 'LOYIHA_REQUIRED'); end if;
  if not exists (select 1 from public.t2_loyiha where id = v_loyiha and kompaniya_id = p_kompaniya_id) then return jsonb_build_object('ok', false, 'code', 'LOYIHA_NOT_FOUND'); end if;
  v_asosiy := coalesce((p_malumot->>'asosiy')::boolean, true);
  perform pg_advisory_xact_lock(hashtextextended('t2_shartnoma_liniya:' || p_kompaniya_id, 0));
  if exists (select 1 from public.t2_shartnoma where kompaniya_id = p_kompaniya_id and raqam = btrim(p_malumot->>'raqam') and id is distinct from v_id) then
    return jsonb_build_object('ok', false, 'code', 'RAQAM_BAND', 'xabar', 'Bu raqamli shartnoma allaqachon bor.');
  end if;

  if v_id is null then
    insert into public.t2_shartnoma(kompaniya_id, loyiha_id, raqam, nom, turi, asosiy, taraf, summa_bez_nds, nds, jami_nds_bilan, izoh, kim, holat)
    values (p_kompaniya_id, v_loyiha, btrim(p_malumot->>'raqam'), nullif(btrim(coalesce(p_malumot->>'nom', '')), ''), nullif(btrim(coalesce(p_malumot->>'turi', '')), ''), v_asosiy,
            nullif(btrim(coalesce(p_malumot->>'taraf', '')), ''), nullif(p_malumot->>'summa_bez_nds', '')::numeric, nullif(p_malumot->>'nds', '')::numeric,
            nullif(p_malumot->>'jami_nds_bilan', '')::numeric, nullif(p_malumot->>'izoh', ''), 'actor:' || p_actor_id, coalesce(nullif(p_malumot->>'holat', ''), 'faol'))
    returning * into v_sh;
    v_id := v_sh.id;
  else
    select * into v_sh from public.t2_shartnoma where id = v_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
    if p_kutilgan_versiya is null or v_sh.versiya <> p_kutilgan_versiya then return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_sh.versiya); end if;
    if v_sh.asosiy <> v_asosiy and (exists (select 1 from public.t2_shartnoma_bog where shartnoma_id = v_id and holat = 'faol')
                                    or exists (select 1 from public.t2_shartnoma_qoshimcha_bog where shartnoma_id = v_id and holat = 'faol')) then
      return jsonb_build_object('ok', false, 'code', 'ASOSIY_OZGARMAYDI', 'xabar', 'Obyektlari bor shartnomaning asosiy/qo''shimcha turi o''zgarmaydi — avval obyektlarni ajrating.');
    end if;
    if v_sh.loyiha_id is distinct from v_loyiha and exists (
         select 1 from public.t2_obyekt o where o.loyiha_id is not null and o.loyiha_id <> v_loyiha
            and (o.id in (select obyekt_id from public.t2_shartnoma_bog where shartnoma_id = v_id and holat = 'faol')
              or o.id in (select obyekt_id from public.t2_shartnoma_qoshimcha_bog where shartnoma_id = v_id and holat = 'faol'))) then
      return jsonb_build_object('ok', false, 'code', 'LOYIHA_OZGARMAYDI', 'xabar', 'Shartnoma obyektlari boshqa loyihada — loyihani o''zgartirib bo''lmaydi.');
    end if;
    update public.t2_shartnoma set loyiha_id = v_loyiha, raqam = btrim(p_malumot->>'raqam'), nom = nullif(btrim(coalesce(p_malumot->>'nom', '')), ''),
           turi = nullif(btrim(coalesce(p_malumot->>'turi', '')), ''), asosiy = v_asosiy, taraf = nullif(btrim(coalesce(p_malumot->>'taraf', '')), ''),
           summa_bez_nds = nullif(p_malumot->>'summa_bez_nds', '')::numeric, nds = nullif(p_malumot->>'nds', '')::numeric,
           jami_nds_bilan = nullif(p_malumot->>'jami_nds_bilan', '')::numeric, izoh = nullif(p_malumot->>'izoh', ''),
           holat = coalesce(nullif(p_malumot->>'holat', ''), holat), versiya = versiya + 1, yangilandi = now()
     where id = v_id returning * into v_sh;
  end if;

  -- Tomonlar (erkin rol) — to'liq almashtiriladi.
  if p_tomonlar is not null then
    if jsonb_typeof(p_tomonlar) <> 'array' or jsonb_array_length(p_tomonlar) > 30 then raise exception 'TOMONLAR_0_30'; end if;
    delete from public.t2_shartnoma_tomon where shartnoma_id = v_id;
    for v_t in select value from jsonb_array_elements(p_tomonlar) loop
      v_i := v_i + 1;
      if nullif(btrim(coalesce(v_t->>'rol', '')), '') is null or nullif(btrim(coalesce(v_t->>'nom', '')), '') is null then
        raise exception 'TOMON_INVALID: % (rol va nom majburiy)', v_i;
      end if;
      insert into public.t2_shartnoma_tomon(kompaniya_id, shartnoma_id, rol, kontragent_id, tomon_kompaniya_id, nom, inn, rekvizit, tartib)
      values (p_kompaniya_id, v_id, btrim(v_t->>'rol'),
              (select id from public.t2_kontragent where id = nullif(v_t->>'kontragent_id', '')::bigint and kompaniya_id = p_kompaniya_id),
              nullif(v_t->>'tomon_kompaniya_id', '')::bigint, btrim(v_t->>'nom'), nullif(btrim(coalesce(v_t->>'inn', '')), ''),
              coalesce(v_t->'rekvizit', '{}'::jsonb), v_i);
    end loop;
  end if;

  -- Obyektlar (to'plam): asosiy — t2_shartnoma_bog (obyektda bitta); qo'shimcha — t2_shartnoma_qoshimcha_bog.
  if p_obyektlar is not null then
    select coalesce(array_agg(distinct (x)::bigint), '{}') into v_obs from jsonb_array_elements_text(p_obyektlar) x;
    if exists (select 1 from unnest(v_obs) o where not exists (select 1 from public.t2_obyekt where id = o and kompaniya_id = p_kompaniya_id)) then
      return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
    end if;
    if v_asosiy then
      select o.nom, s.raqam into v_band from public.t2_shartnoma_bog b join public.t2_obyekt o on o.id = b.obyekt_id join public.t2_shartnoma s on s.id = b.shartnoma_id
       where b.obyekt_id = any(v_obs) and b.holat = 'faol' and b.shartnoma_id <> v_id limit 1;
      if found then raise exception 'OBYEKT_BOSHQA_ASOSIY: «%» allaqachon № % asosiy shartnomada', v_band.nom, v_band.raqam; end if;
      update public.t2_shartnoma_bog set holat = 'bekor' where shartnoma_id = v_id and holat = 'faol' and not (obyekt_id = any(v_obs));
      foreach v_o in array v_obs loop
        if exists (select 1 from public.t2_shartnoma_bog where obyekt_id = v_o) then
          update public.t2_shartnoma_bog set shartnoma_id = v_id, holat = 'faol' where obyekt_id = v_o;
        else
          insert into public.t2_shartnoma_bog(obyekt_id, shartnoma_id, holat) values (v_o, v_id, 'faol');
        end if;
      end loop;
    else
      update public.t2_shartnoma_qoshimcha_bog set holat = 'bekor' where shartnoma_id = v_id and holat = 'faol' and not (obyekt_id = any(v_obs));
      insert into public.t2_shartnoma_qoshimcha_bog(kompaniya_id, shartnoma_id, obyekt_id, holat)
        select p_kompaniya_id, v_id, o, 'faol' from unnest(v_obs) o
        on conflict (shartnoma_id, obyekt_id) do update set holat = 'faol';
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, case when p_id is null then 'shartnoma_yarat_v2' else 'shartnoma_tahrir_v2' end, 'shartnoma', null,
    format('shartnoma=%s raqam=%s asosiy=%s obyektlar=%s', v_id, v_sh.raqam, v_asosiy, coalesce(cardinality(v_obs), -1)), 'actor:' || p_actor_id, null);
  select versiya into v_sh.versiya from public.t2_shartnoma where id = v_id;
  v_res := jsonb_build_object('ok', true, 'id', v_id, 'versiya', v_sh.versiya);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'shartnoma_saqla_v2', v_res);
  return v_res;
end $$;

revoke all on function public.t2_shartnoma_liniya_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_shartnoma_saqla_v2(bigint, bigint, bigint, integer, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.t2_shartnoma_liniya_v1(bigint, bigint) to service_role;
grant execute on function public.t2_shartnoma_saqla_v2(bigint, bigint, bigint, integer, jsonb, jsonb, jsonb, uuid) to service_role;

commit;
