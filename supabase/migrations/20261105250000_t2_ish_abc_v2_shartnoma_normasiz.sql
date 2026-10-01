-- T2-ISH-ABC-002 (egasi, 2026-10-01):
--  1) Narx ustuvorligi: shu smeta (RES) → SHU SHARTNOMA ichidagi boshqa obyektlar smetalari → boshqa
--     shartnomalar (kompaniya) smetalari; katalog — ALOHIDA taklif (avtomatik qo'yilmaydi).
--     Shartnoma doirasi: t2_shartnoma_bog (holat='faol') orqali shu obyekt bilan umumiy shartnomadagi obyektlar.
--  2) Normasiz resurs: norma bo'lmasa — aniq sarflangan miqdor (hajm) kiritiladi; resurs mustaqil
--     mat/ob qatori bo'ladi, ish fakti yozilganda uning fakti — shu miqdor (norma orqali emas).

begin;

create or replace function public.t2_obyekt_shartnoma_obyektlari(p_obyekt_id bigint)
returns bigint[] language sql stable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct b2.obyekt_id), '{}')
    from public.t2_shartnoma_bog b1
    join public.t2_shartnoma_bog b2 on b2.shartnoma_id = b1.shartnoma_id and b2.holat = 'faol'
   where b1.obyekt_id = p_obyekt_id and b1.holat = 'faol' and b2.obyekt_id <> p_obyekt_id
$$;

create or replace function public.t2_resurs_narx_taklif_v1(p_obyekt_id bigint, p_actor_id bigint, p_items text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_items jsonb; v_res jsonb := '[]'::jsonb; v_i jsonb; v_nk text; v_bk text; v_var jsonb; v_sh bigint[];
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_sh := public.t2_obyekt_shartnoma_obyektlari(p_obyekt_id);
  v_items := coalesce(p_items, '[]')::jsonb;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 80 then raise exception 'ITEMS_0_80'; end if;
  for v_i in select value from jsonb_array_elements(v_items) loop
    v_nk := public.t2_resurs_nom_kalit(v_i->>'nom'); v_bk := public.t2_resurs_birlik_kalit(v_i->>'birlik');
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_var from (
      (select jsonb_build_object('manba', 'smeta_obyekt', 'narx', q.narx, 'izoh', 'shu obyekt smetasi (RES)') x
         from public.t2_qator q
        where q.kompaniya_id = v_k and q.obyekt_id = p_obyekt_id and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'smeta_shartnoma', 'narx', q.narx, 'izoh', 'shu shartnoma: ' || o.nom) x
         from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
        where q.kompaniya_id = v_k and q.obyekt_id = any(v_sh) and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'smeta', 'narx', q.narx, 'izoh', 'boshqa shartnoma: ' || o.nom) x
         from public.t2_qator q join public.t2_obyekt o on o.id = q.obyekt_id
        where q.kompaniya_id = v_k and q.obyekt_id <> p_obyekt_id and not (q.obyekt_id = any(v_sh))
          and q.tur in ('rs', 'mat', 'ob') and q.narx > 0
          and public.t2_resurs_nom_kalit(q.nom) = v_nk and public.t2_resurs_birlik_kalit(q.birlik) = v_bk
        order by q.id desc limit 1)
      union all
      (select jsonb_build_object('manba', 'katalog', 'narx', k.narx, 'izoh', 'katalog: ' || m.nom) x
         from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
        where k.kompaniya_id = v_k and k.narx > 0
          and public.t2_resurs_nom_kalit(k.nom) = v_nk and public.t2_resurs_birlik_kalit(k.birlik) = v_bk
        order by m.yaratildi desc, k.id desc limit 1)
    ) s;
    v_res := v_res || jsonb_build_array(jsonb_build_object('i', v_i->'i', 'variantlar', v_var));
  end loop;
  return v_res;
end $$;

create or replace function public.t2_resurs_qidir_v1(p_obyekt_id bigint, p_actor_id bigint, p_q text, p_kat text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_k bigint; v_t text[]; v_sm jsonb; v_kt jsonb; v_sh bigint[];
begin
  v_k := public.t2_obyekt_kompaniya_azo(p_obyekt_id, p_actor_id);
  v_sh := public.t2_obyekt_shartnoma_obyektlari(p_obyekt_id);
  v_t := public.t2_qidiruv_sozlar(p_q);
  if cardinality(v_t) = 0 then return '[]'::jsonb; end if;
  with r as (
    select q.id, q.obyekt_id, q.kat, q.kod, q.nom, q.birlik, q.narx,
           public.t2_resurs_nom_kalit(q.nom) nk, public.t2_resurs_birlik_kalit(q.birlik) bk,
           case when q.obyekt_id = p_obyekt_id then 0 when q.obyekt_id = any(v_sh) then 1 else 2 end daraja
      from public.t2_qator q
     where q.kompaniya_id = v_k and q.tur in ('rs', 'mat', 'ob') and q.nom is not null
       and (nullif(p_kat, '') is null or q.kat = p_kat)
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(q.kod, '') || ' ' || q.nom, 'Ё', 'Е'))) = 0)
     limit 4000
  ), g as (
    select kat, nk, bk, count(*) n, min(daraja) daraja,
           (array_agg(id order by daraja, (narx > 0) desc, id desc))[1] rep
      from r group by kat, nk, bk
  )
  select coalesce(jsonb_agg(x order by (x->>'daraja')::int, (x->>'soni')::int desc), '[]'::jsonb) into v_sm from (
    select jsonb_build_object('manba', 'smeta', 'kat', q.kat, 'kod', q.kod, 'nom', q.nom, 'birlik', q.birlik,
             'narx', nullif(q.narx, 0), 'soni', g.n, 'daraja', g.daraja, 'shu_obyekt', g.daraja = 0,
             'narx_manba', case g.daraja when 0 then 'smeta_obyekt' when 1 then 'smeta_shartnoma' else 'smeta' end) x
      from (select * from g order by daraja, n desc limit 20) g join public.t2_qator q on q.id = g.rep) s;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_kt from (
    select jsonb_build_object('manba', 'katalog', 'kat', null, 'kod', k.kod, 'nom', k.nom, 'birlik', k.birlik, 'narx', k.narx,
             'narx_manba', 'katalog', 'manba_nom', m.nom) x
      from public.t2_narx_manba_qator k join public.t2_narx_manba m on m.id = k.manba_id and m.holat = 'faol'
     where k.kompaniya_id = v_k and k.narx > 0
       and not exists (select 1 from unnest(v_t) s where position(s in upper(replace(coalesce(k.kod, '') || ' ' || k.nom, 'Ё', 'Е'))) = 0)
     order by m.yaratildi desc, k.id limit 10) s;
  return v_sm || v_kt;
end $$;

create or replace function public.t2_ish_abc_saqla_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_command text,
  p_ota_qator_id bigint, p_almashtirilayotgan_qator_id bigint,
  p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text,
  p_operation_id uuid, p_kutilgan_versiya integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rol text; v_prev jsonb; v_ota bigint := p_ota_qator_id; v_versiya integer := p_kutilgan_versiya;
  v_add jsonb; v_id bigint; v_kind text; v_res jsonb; v_r jsonb; v_rid bigint; v_i integer := 0;
  v_ish_hajm numeric; v_hajm numeric; v_narx numeric; v_kat text; v_ids bigint[] := '{}'; v_eski public.t2_qator%rowtype;
  v_fakt jsonb; v_manba text; v_norma numeric; v_rtur text; v_fakt_q jsonb := '[]'::jsonb;
begin
  if p_command not in ('additional', 'replacement', 'resurs_zamena') then return jsonb_build_object('ok', false, 'code', 'COMMAND_INVALID'); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if nullif(btrim(coalesce(p_sabab, '')), '') is null then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  if p_resurslar is not null and (jsonb_typeof(p_resurslar) <> 'array' or jsonb_array_length(p_resurslar) > 60) then
    return jsonb_build_object('ok', false, 'code', 'RESURSLAR_0_60');
  end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  select response into v_prev from public.t2_addrepl_command where operation_id = p_operation_id;
  if found then return jsonb_build_object('ok', true, 'takror', true, 'qator_id', v_prev->'qator_id'); end if;

  if p_command = 'resurs_zamena' then
    select * into v_eski from public.t2_qator where id = p_almashtirilayotgan_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id;
    if not found or v_eski.tur not in ('rs', 'mat', 'ob') or v_eski.ota_id is null then return jsonb_build_object('ok', false, 'code', 'RESURS_NOT_FOUND'); end if;
    v_r := p_resurslar->0;
    if v_r is null then return jsonb_build_object('ok', false, 'code', 'RESURS_REQUIRED'); end if;
    select hajm, versiya into v_ish_hajm, v_versiya from public.t2_qator where id = v_eski.ota_id;
    v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
    v_hajm := case when v_norma is not null and v_ish_hajm is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
    v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
      'command', 'replacement', 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
      'ota_qator_id', v_eski.ota_id, 'almashtirilayotgan_qator_id', v_eski.id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'),
      'hajm', v_hajm, 'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
    v_id := (v_add->>'qator_id')::bigint;
    v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
    v_kat := coalesce(nullif(v_r->>'kat', ''), v_eski.kat);
    update public.t2_qator set norma = v_norma, kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
           narx = v_narx, summa = case when v_narx is null or v_hajm is null then null else round(v_hajm * v_narx, 2) end,
           narx_usul = upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'))
     where id = v_id;
    perform public.t2_audit_yoz(p_kompaniya_id, 'resurs_zamena', 'smeta', p_obyekt_id, format('yangi=%s eski=%s', v_id, v_eski.id), 'actor:' || p_actor_id, null);
    return jsonb_build_object('ok', true, 'qator_id', v_id, 'change_id', v_add->'change_id');
  end if;

  if p_ish is null or nullif(btrim(coalesce(p_ish->>'nom', '')), '') is null or nullif(btrim(coalesce(p_ish->>'birlik', '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'ISH_NOM_BIRLIK_REQUIRED');
  end if;
  v_ish_hajm := nullif(p_ish->>'hajm', '')::numeric;
  if v_ish_hajm is null or v_ish_hajm <= 0 then return jsonb_build_object('ok', false, 'code', 'ISH_HAJM_REQUIRED'); end if;
  if p_command = 'additional' and v_ota is null then
    perform 1 from public.t2_obyekt where id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'OBJECT_ACCESS_DENIED'); end if;
    select id, versiya into v_ota, v_versiya from public.t2_qator
     where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is null and nom = 'СМЕТАДАН ТАШҚАРИ ИШЛАР' order by id limit 1;
    if v_ota is null then
      insert into public.t2_qator(obyekt_id, kompaniya_id, ota_id, daraja, tartib, tur, nom, qoshimcha, change_type)
        values (p_obyekt_id, p_kompaniya_id, null, 0, (select coalesce(max(tartib), 0) + 1 from public.t2_qator where obyekt_id = p_obyekt_id),
                'rz', 'СМЕТАДАН ТАШҚАРИ ИШЛАР', true, 'ADDITIONAL')
        returning id, versiya into v_ota, v_versiya;
    end if;
  end if;
  if v_ota is null then return jsonb_build_object('ok', false, 'code', 'PARENT_REQUIRED'); end if;

  v_add := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
    'command', p_command, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
    'ota_qator_id', v_ota, 'almashtirilayotgan_qator_id', p_almashtirilayotgan_qator_id,
    'nom', btrim(p_ish->>'nom'), 'birlik', btrim(p_ish->>'birlik'), 'hajm', v_ish_hajm,
    'kod', nullif(btrim(coalesce(p_ish->>'kod', '')), ''), 'sabab', p_sabab, 'operation_id', p_operation_id, 'kutilgan_versiya', v_versiya)));
  v_id := (v_add->>'qator_id')::bigint;
  select tur into v_kind from public.t2_qator where id = v_id;

  if p_resurslar is not null and jsonb_array_length(p_resurslar) > 0 then
    if v_kind <> 'bl' then raise exception 'RESURS_FAQAT_ISH_OSTIGA'; end if;
    for v_r in select value from jsonb_array_elements(p_resurslar) loop
      v_i := v_i + 1;
      v_norma := nullif(v_r->>'norma', '')::numeric; if v_norma <= 0 then v_norma := null; end if;
      v_hajm := case when v_norma is not null then round(v_norma * v_ish_hajm, 6) else nullif(v_r->>'hajm', '')::numeric end;
      if nullif(btrim(coalesce(v_r->>'nom', '')), '') is null or nullif(btrim(coalesce(v_r->>'birlik', '')), '') is null
         or coalesce(v_hajm, 0) <= 0 then
        raise exception 'RESURS_INVALID: % (nom, birlik va norma yoki aniq hajm > 0)', v_i;
      end if;
      v_kat := nullif(v_r->>'kat', '');
      -- Normali — rs (fakti ish × norma, avtomatik); normasiz — mustaqil mat/ob (fakti aniq miqdor).
      v_rtur := case when v_norma is not null then 'rs' when v_kat = 'ОБ' then 'ob' else 'mat' end;
      v_res := public.t2_addrepl_execute_v1(jsonb_strip_nulls(jsonb_build_object(
        'command', 'resource', 'tur', v_rtur, 'kompaniya_id', p_kompaniya_id, 'actor_id', p_actor_id, 'obyekt_id', p_obyekt_id,
        'ota_qator_id', v_id, 'nom', btrim(v_r->>'nom'), 'birlik', btrim(v_r->>'birlik'), 'hajm', v_hajm,
        'kod', nullif(btrim(coalesce(v_r->>'kod', '')), ''), 'sabab', p_sabab,
        'operation_id', md5(p_operation_id::text || ':abc:' || v_i)::uuid,
        'kutilgan_versiya', (select versiya from public.t2_qator where id = v_id))));
      v_rid := (v_res->>'qator_id')::bigint;
      v_narx := nullif(v_r->>'narx', '')::numeric; if v_narx <= 0 then v_narx := null; end if;
      v_manba := upper(coalesce(nullif(v_r->>'narx_manba', ''), 'qolda'));
      update public.t2_qator set norma = v_norma,
             kat = case when v_kat in ('ЧЕЛ','МАШ','МАТ','ОБ','М/К','КАБ','БЕЗСКЛАД') then v_kat else kat end,
             narx = v_narx, summa = case when v_narx is null then null else round(v_hajm * v_narx, 2) end,
             narx_usul = case when v_narx is null then null else v_manba end
       where id = v_rid;
      v_ids := v_ids || v_rid;
      if v_rtur <> 'rs' then v_fakt_q := v_fakt_q || jsonb_build_array(jsonb_build_object('qator_id', v_rid, 'hajm', v_hajm)); end if;
    end loop;
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_id and tur in ('rs', 'mat', 'ob'))
     where id = v_id;
  end if;

  if coalesce(p_fakt_hajm, 0) > 0 then
    if v_kind not in ('bl', 'mat', 'ob') then raise exception 'FAKT_FAQAT_ISH_YOKI_MATERIAL'; end if;
    v_fakt := public.t2_fakt_yoz_v2(p_obyekt_id, coalesce(p_sana, current_date),
      jsonb_build_array(jsonb_build_object('qator_id', v_id, 'hajm', p_fakt_hajm)) || v_fakt_q, p_actor_id,
      md5(p_operation_id::text || ':abc:fakt')::uuid, left('ABC: ' || p_sabab, 500), null, 'actor:' || p_actor_id);
    if coalesce((v_fakt->>'ok')::boolean, false) is not true then
      raise exception 'FAKT_NOT_WRITTEN: %', coalesce(v_fakt->>'code', v_fakt->>'error', v_fakt::text);
    end if;
  end if;

  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_' || p_command, 'smeta', p_obyekt_id,
    format('qator=%s resurs=%s fakt=%s', v_id, cardinality(v_ids), coalesce(p_fakt_hajm, 0)), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qator_id', v_id, 'resurs_ids', to_jsonb(v_ids), 'bolim_id', v_ota, 'change_id', v_add->'change_id');
end $$;

revoke all on function public.t2_obyekt_shartnoma_obyektlari(bigint) from public, anon, authenticated;
grant execute on function public.t2_obyekt_shartnoma_obyektlari(bigint) to service_role;


-- ═════ 3) Qatorning F2 aktida borligi (fakt hujjati emas — fakt ham t2_akt da, tur='fakt') ═════
create or replace function public.t2_qator_f2da(p_qator_id bigint)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id
                  where aq.qator_id = p_qator_id and a.tur = 'f2')
$$;

-- БЕЗСКЛАД trigger: himoya faqat F2 ga kirgan qatorlar uchun (avval fakt hujjatidagilar ham chetlanardi).
create or replace function public.t2_qator_bez_sklad_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.tur in ('rs', 'mat') and new.kat = 'МАТ'
     and public.t2_bez_sklad_qoida(new.nom, new.birlik)
     and not public.t2_bez_sklad_operator_rad(new.kompaniya_id, new.nom, new.birlik)
     and (tg_op = 'INSERT' or not public.t2_qator_f2da(new.id)) then
    new.kat := 'БЕЗСКЛАД';
  end if;
  return new;
end $$;

do $$
declare rec record;
begin
  for rec in
    with o as (
      update public.t2_qator q set kat = 'БЕЗСКЛАД'
       where q.kat = 'МАТ' and q.tur in ('rs', 'mat') and public.t2_bez_sklad_qoida(q.nom, q.birlik)
         and not public.t2_bez_sklad_operator_rad(q.kompaniya_id, q.nom, q.birlik)
         and not public.t2_qator_f2da(q.id)
      returning q.kompaniya_id, q.obyekt_id)
    select kompaniya_id, count(*) n from o group by kompaniya_id
  loop
    perform public.t2_audit_yoz(rec.kompaniya_id, 'bez_sklad_f2_aniqlash', 'resurs_kategoriya', null,
      format('qator=%s (faqat fakti bor, F2 da yo''q)', rec.n), 'system:migration', null);
  end loop;
end $$;

-- ═════ 4) Qo'shilgan qatorlarni O'CHIRISH / ASLIGA QAYTARISH (smeta qatorlari — o'zgarmas) ═════
create table if not exists public.t2_qator_ochirilgan (
  id bigserial primary key, kompaniya_id bigint not null, obyekt_id bigint not null,
  ildiz_qator_id bigint not null, qatorlar jsonb not null, fakt_qatorlari jsonb not null,
  sabab text, kim text, operation_id uuid, vaqt timestamptz not null default now());
revoke all on public.t2_qator_ochirilgan from anon, authenticated;

/* Ichki: tekshiradi, arxivlaydi, o'chiradi. Tranzaksiya chaqiruvchida. */
create or replace function public.t2_ish_abc_ochir_ichki(p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint,
  p_actor_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.t2_qator%rowtype; v_ids bigint[]; v_n int; v_smeta int; v_f2 int; v_bog int; v_ota bigint; v_qj jsonb; v_fj jsonb;
begin
  select * into v_r from public.t2_qator where id = p_qator_id and obyekt_id = p_obyekt_id and kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'QATOR_NOT_FOUND'); end if;
  if not coalesce(v_r.qoshimcha, false) then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', 'Smetaning asl qatori o''chirilmaydi va o''zgartirilmaydi.');
  end if;
  with recursive t(id) as (select p_qator_id union all select q.id from public.t2_qator q join t on q.ota_id = t.id)
  select array_agg(id) into v_ids from t;
  v_n := cardinality(v_ids);
  select count(*) into v_smeta from public.t2_qator where id = any(v_ids) and not coalesce(qoshimcha, false);
  if v_smeta > 0 then
    return jsonb_build_object('ok', false, 'code', 'SMETA_QATORI_OZGARMAS', 'xabar', format('Ichida %s ta asl smeta qatori bor — o''chirilmaydi.', v_smeta));
  end if;
  select count(*) into v_f2 from unnest(v_ids) x where public.t2_qator_f2da(x);
  if v_f2 > 0 then
    return jsonb_build_object('ok', false, 'code', 'F2_DA', 'xabar', format('%s ta qator F2 aktida — avval F2 ni bekor qiling.', v_f2));
  end if;
  select (select count(*) from public.t2_aosr_bog where qator_id = any(v_ids)) + (select count(*) from public.t2_lab_protokol_bog where qator_id = any(v_ids))
       + (select count(*) from public.t2_narx_dalil where qator_id = any(v_ids)) + (select count(*) from public.t2_price_basis_line where qator_id = any(v_ids))
    into v_bog;
  if v_bog > 0 then
    return jsonb_build_object('ok', false, 'code', 'BOGLANGAN', 'xabar', format('%s ta bog''lanish (АОСР / laboratoriya / narx dalili) — avval ularni yeching.', v_bog));
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.daraja, q.id), '[]'::jsonb) into v_qj from public.t2_qator q where q.id = any(v_ids);
  select coalesce(jsonb_agg(to_jsonb(aq)), '[]'::jsonb) into v_fj
    from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id where aq.qator_id = any(v_ids) and a.tur = 'fakt';
  insert into public.t2_qator_ochirilgan(kompaniya_id, obyekt_id, ildiz_qator_id, qatorlar, fakt_qatorlari, sabab, kim, operation_id)
    values (p_kompaniya_id, p_obyekt_id, p_qator_id, v_qj, v_fj, p_sabab, 'actor:' || p_actor_id, p_operation_id);

  delete from public.t2_akt_qator aq using public.t2_akt a where a.id = aq.akt_id and a.tur = 'fakt' and aq.qator_id = any(v_ids);
  update public.t2_smeta_ozgarish z set holat = 'bekor'
   where z.id in (select change_id from public.t2_qator where id = any(v_ids) and change_id is not null)
     and not exists (select 1 from public.t2_qator q where q.change_id = z.id and not (q.id = any(v_ids)));
  v_ota := v_r.ota_id;
  delete from public.t2_qator where id = p_qator_id;            -- ota_id ON DELETE CASCADE — bolalar ham
  -- Ota ish (bl) bo'lsa — uning summasi resurslardan qayta hisoblanadi.
  if v_ota is not null and exists (select 1 from public.t2_qator where id = v_ota and tur = 'bl') then
    update public.t2_qator set summa = (select sum(summa) from public.t2_qator where ota_id = v_ota and tur in ('rs', 'mat', 'ob'))
     where id = v_ota and coalesce(qoshimcha, false);
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'ish_abc_ochir', 'smeta', p_obyekt_id,
    format('ildiz=%s qatorlar=%s fakt=%s sabab=%s', p_qator_id, v_n, jsonb_array_length(v_fj), coalesce(p_sabab, '-')), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'ochirildi', v_n, 'fakt_ochirildi', jsonb_array_length(v_fj), 'ota_id', v_ota,
    'tur', v_r.tur, 'zamena', coalesce(v_r.zamena, false), 'replaces_line_id', v_r.replaces_line_id);
end $$;

create or replace function public.t2_ish_abc_ochir_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint,
  p_qator_id bigint, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_prev jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  v_res := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_qator_id, p_actor_id, p_sabab, p_operation_id);
  if coalesce((v_res->>'ok')::boolean, false) then
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_ochir', v_res);
  end if;
  return v_res;
end $$;

/* TAHRIRLASH = shu joyda almashtirish: eski (qo'shilgan) qism o'chiriladi va yangisi bitta tranzaksiyada yoziladi.
   Qo'shimcha ish → qo'shimcha ish (o'sha bo'lim); ish zamenasi → o'sha asl qatorning zamenasi;
   resurs zamenasi → o'sha asl resursning zamenasi. Yiqilsa — hech narsa o'zgarmaydi. */
create or replace function public.t2_ish_abc_tahrir_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_qator_id bigint,
  p_ish jsonb, p_resurslar jsonb, p_fakt_hajm numeric, p_sana date, p_sabab text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rol text; v_prev jsonb; v_o jsonb; v_cmd text; v_ota bigint; v_old bigint; v_ver integer; v_new jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if v_rol not in ('admin', 'superadmin', 'boss', 'director', 'pto') then return jsonb_build_object('ok', false, 'code', 'WRITE_ROLE_REQUIRED'); end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_ish_abc:' || p_obyekt_id, 0));
  v_o := public.t2_ish_abc_ochir_ichki(p_kompaniya_id, p_obyekt_id, p_qator_id, p_actor_id, 'tahrir: ' || coalesce(p_sabab, ''), p_operation_id);
  if not coalesce((v_o->>'ok')::boolean, false) then return v_o; end if;
  v_ota := (v_o->>'ota_id')::bigint; v_old := nullif(v_o->>'replaces_line_id', '')::bigint;
  v_cmd := case when (v_o->>'tur') in ('rs', 'mat', 'ob') and v_old is not null then 'resurs_zamena'
                when coalesce((v_o->>'zamena')::boolean, false) and v_old is not null then 'replacement'
                when (v_o->>'tur') = 'bl' then 'additional' else null end;
  if v_cmd is null then raise exception 'TAHRIR_ISH_ORQALI: resursni o''z ishi orqali tahrirlang'; end if;
  select versiya into v_ver from public.t2_qator where id = v_ota;
  v_new := public.t2_ish_abc_saqla_v1(p_actor_id, p_kompaniya_id, p_obyekt_id, v_cmd,
    case when v_cmd = 'resurs_zamena' then null else v_ota end, v_old, p_ish, p_resurslar, p_fakt_hajm, p_sana, p_sabab,
    md5(p_operation_id::text || ':tahrir:yangi')::uuid, v_ver);
  if not coalesce((v_new->>'ok')::boolean, false) then raise exception 'TAHRIR_YIQILDI: %', coalesce(v_new->>'code', v_new::text); end if;
  v_new := v_new || jsonb_build_object('eski_ochirildi', v_o->'ochirildi');
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'ish_abc_tahrir', v_new);
  return v_new;
end $$;

revoke all on function public.t2_qator_f2da(bigint) from public, anon, authenticated;
revoke all on function public.t2_ish_abc_ochir_ichki(bigint, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_ish_abc_ochir_v1(bigint, bigint, bigint, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.t2_ish_abc_tahrir_v1(bigint, bigint, bigint, bigint, jsonb, jsonb, numeric, date, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_qator_f2da(bigint) to service_role;
grant execute on function public.t2_ish_abc_ochir_v1(bigint, bigint, bigint, bigint, text, uuid) to service_role;
grant execute on function public.t2_ish_abc_tahrir_v1(bigint, bigint, bigint, bigint, jsonb, jsonb, numeric, date, text, uuid) to service_role;

commit;
