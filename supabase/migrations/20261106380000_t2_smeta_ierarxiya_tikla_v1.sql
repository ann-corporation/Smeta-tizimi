-- T2-DIREKTIVA-PTO-PRO-V1 §7a · Bo'lim ierarxiyasini asl fayldan tiklash (egasi talabi 2026-10-08).
-- 2026-09-23 gacha eski tekis o'quvchi bilan yuklangan smetalarda ota bo'limlar yo'qolgan ("КЖ › Земляные работы" o'rniga
-- faqat "Земляные работы"). Reja klientda asl fayldan (anatomiya) quriladi — `frontend/src/lib/smeta-ierarxiya-tiklash.ts`.
-- Server rejaga ishonmaydi: rz soni, har birining nomi va bevosita ish soni bazadagi bilan aynan mos bo'lmasa RAD ETADI.
-- Faqat struktura o'zgaradi (yangi ota rz qatorlari, rz.ota_id, daraja, tartib). Mavjud qatorlarning id/nom/hajm/narx/summa
-- va F2 akt bog'lanishlari (t2_akt_qator.qator_id) O'ZGARMAYDI. Har qo'llash zaxira bilan; t2_smeta_ierarxiya_qaytar_v1 qaytaradi.

create table if not exists public.t2_smeta_ierarxiya_zaxira (
  id bigserial primary key,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  kompaniya_id bigint not null,
  operation_id uuid not null unique,
  actor_id bigint,
  source_document_id bigint references public.t2_document_registry(id),
  holat text not null default 'qollandi' check (holat in ('qollandi', 'qaytarildi')),
  oldingi jsonb not null,
  yangi_qatorlar bigint[] not null default '{}',
  yaratildi timestamptz not null default now(),
  qaytarildi timestamptz
);
alter table public.t2_smeta_ierarxiya_zaxira enable row level security;
revoke all on public.t2_smeta_ierarxiya_zaxira from anon, authenticated;

create or replace function public.t2_smeta_ierarxiya_tikla_v1(
  p_obyekt_id bigint, p_actor_id bigint, p_reja jsonb, p_source_document_id bigint, p_operation_id uuid, p_sinov boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_komp bigint; v_rol text; v_rz bigint[]; v_n integer;
  v_ishli jsonb := coalesce(p_reja->'ishli', '[]'::jsonb);
  v_yangi jsonb := coalesce(p_reja->'yangi', '[]'::jsonb);
  v_map jsonb := '{}'::jsonb; v_keys text[] := '{}';
  v_bad text; v_e jsonb; v_ref jsonb; v_ota bigint; v_id bigint; v_yangi_ids bigint[] := '{}';
  v_i integer; v_ozgardi integer := 0; v_max integer;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if exists (select 1 from public.t2_smeta_ierarxiya_zaxira z where z.operation_id = p_operation_id) then
    return jsonb_build_object('ok', true, 'takror', true);
  end if;
  select kompaniya_id into v_komp from public.t2_obyekt where id = p_obyekt_id;
  if v_komp is null then return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND'); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_komp, p_actor_id);
  if v_rol not in ('boss', 'superadmin', 'rahbar') then return jsonb_build_object('ok', false, 'code', 'IERARXIYA_DENIED'); end if;
  if exists (select 1 from public.t2_qator where obyekt_id = p_obyekt_id and tur = 'rz' and ota_id is not null) then
    return jsonb_build_object('ok', false, 'code', 'IERARXIYA_ALLAQACHON_BOR', 'xato', 'Obyektda bo''limlar allaqachon ichma-ich');
  end if;
  if p_source_document_id is not null and not exists (
    select 1 from public.t2_document_registry d where d.id = p_source_document_id and d.obyekt_id = p_obyekt_id) then
    return jsonb_build_object('ok', false, 'code', 'MANBA_DOIRADAN_TASHQARI');
  end if;
  if jsonb_typeof(v_ishli) <> 'array' or jsonb_typeof(v_yangi) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'REJA_SHAKLI');
  end if;

  select array_agg(id order by tartib, id) into v_rz from public.t2_qator where obyekt_id = p_obyekt_id and tur = 'rz';
  v_n := coalesce(array_length(v_rz, 1), 0);
  if jsonb_array_length(v_ishli) <> v_n then
    return jsonb_build_object('ok', false, 'code', 'IERARXIYA_MOS_EMAS',
      'xato', format('ishli bo''limlar soni: faylda %s, bazada %s', jsonb_array_length(v_ishli), v_n));
  end if;

  -- Har ishli bo'lim: nom (bo'shliqlar yig'ilgan) va bevosita ish soni bazadagi i-chi rz bilan aynan mos. Keyin tizimda
  -- qo'shilgan ishlar (qoshimcha / change_type ADDITIONAL|REPLACEMENT) asl faylda yo'q — sanalmaydi, o'z bo'limida qoladi.
  select format('%s-bo''lim: bazada «%s» (%s ish), faylda «%s» (%s ish)', x.ord, x.nom, x.bis, x.fnom, x.fis) into v_bad
  from (
    select i.ord, q.nom, i.e->>2 as fnom, (i.e->>1)::integer as fis,
           (select count(*) from public.t2_qator c where c.ota_id = q.id and c.tur <> 'rz'
              and not coalesce(c.qoshimcha, false) and c.change_type is null) as bis
    from jsonb_array_elements(v_ishli) with ordinality as i(e, ord)
    join public.t2_qator q on q.id = v_rz[i.ord]
  ) x
  where btrim(regexp_replace(coalesce(x.nom, ''), '\s+', ' ', 'g')) <> x.fnom or x.bis <> x.fis
  order by x.ord limit 1;
  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'IERARXIYA_MOS_EMAS', 'xato', v_bad);
  end if;

  -- Havolalar: yangi → oldingi yangi kaliti yoki ishli indeks; ishli i → i dan kichik indeks yoki yangi kaliti (sikl yo'q).
  v_i := 0;
  for v_e in select value from jsonb_array_elements(v_yangi) loop
    v_ref := v_e->1;
    if not (jsonb_typeof(v_ref) = 'null'
            or (jsonb_typeof(v_ref) = 'string' and (v_ref #>> '{}') = any(v_keys))
            or (jsonb_typeof(v_ref) = 'number' and (v_ref)::integer between 0 and v_n - 1)) then
      return jsonb_build_object('ok', false, 'code', 'REJA_HAVOLA', 'xato', format('yangi %s: ota havolasi noto''g''ri', v_e->>0));
    end if;
    if coalesce(btrim(v_e->>2), '') = '' then return jsonb_build_object('ok', false, 'code', 'REJA_NOM'); end if;
    v_keys := v_keys || (v_e->>0);
  end loop;
  v_i := 0;
  for v_e in select value from jsonb_array_elements(v_ishli) loop
    v_ref := v_e->0;
    if not (jsonb_typeof(v_ref) = 'null'
            or (jsonb_typeof(v_ref) = 'string' and (v_ref #>> '{}') = any(v_keys))
            or (jsonb_typeof(v_ref) = 'number' and (v_ref)::integer between 0 and v_i - 1)) then
      return jsonb_build_object('ok', false, 'code', 'REJA_HAVOLA', 'xato', format('ishli %s: ota havolasi noto''g''ri', v_i));
    end if;
    v_i := v_i + 1;
  end loop;

  if p_sinov then
    return jsonb_build_object('ok', true, 'sinov', true, 'ishli', v_n, 'yangi', jsonb_array_length(v_yangi),
      'qatorlar', (select count(*) from public.t2_qator where obyekt_id = p_obyekt_id));
  end if;

  -- Strukturaviy qayta tartiblash — inson tahriri emas: o'zgarish jurnali/signal yozilmaydi.
  perform set_config('t2.manba', 'import', true);

  insert into public.t2_smeta_ierarxiya_zaxira (obyekt_id, kompaniya_id, operation_id, actor_id, source_document_id, oldingi)
  select p_obyekt_id, v_komp, p_operation_id, p_actor_id, p_source_document_id,
         jsonb_agg(jsonb_build_array(q.id, q.ota_id, q.daraja, q.tartib) order by q.id)
  from public.t2_qator q where q.obyekt_id = p_obyekt_id;

  for v_e in select value from jsonb_array_elements(v_yangi) loop
    v_ref := v_e->1;
    v_ota := case jsonb_typeof(v_ref) when 'null' then null when 'number' then v_rz[(v_ref)::integer + 1]
                  else (v_map->>(v_ref #>> '{}'))::bigint end;
    insert into public.t2_qator (obyekt_id, kompaniya_id, tur, nom, ota_id, daraja, tartib, source_document_id)
    values (p_obyekt_id, v_komp, 'rz', btrim(v_e->>2), v_ota, 0, 0, p_source_document_id)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(v_e->>0, v_id);
    v_yangi_ids := v_yangi_ids || v_id;
  end loop;

  v_i := 0;
  for v_e in select value from jsonb_array_elements(v_ishli) loop
    v_ref := v_e->0;
    v_ota := case jsonb_typeof(v_ref) when 'null' then null when 'number' then v_rz[(v_ref)::integer + 1]
                  else (v_map->>(v_ref #>> '{}'))::bigint end;
    update public.t2_qator set ota_id = v_ota where id = v_rz[v_i + 1] and ota_id is distinct from v_ota;
    v_i := v_i + 1;
  end loop;

  -- Tartib kaliti: mavjud qator — eski tartib; yangi ota bo'lim — birinchi avlodidan biroz oldin (pastdan yuqoriga).
  drop table if exists _ier_k; drop table if exists _ier_t;
  create temp table _ier_k (id bigint primary key, ota bigint, kalit numeric) on commit drop;
  insert into _ier_k select q.id, q.ota_id, coalesce(q.tartib, 0)::numeric from public.t2_qator q where q.obyekt_id = p_obyekt_id;
  for v_i in reverse coalesce(array_length(v_yangi_ids, 1), 0) .. 1 loop
    update _ier_k k set kalit = (select min(c.kalit) from _ier_k c where c.ota = k.id) - 0.5 where k.id = v_yangi_ids[v_i];
  end loop;

  create temp table _ier_t on commit drop as
  with recursive d as (
    select k.id, array[k.kalit, k.id::numeric] as yol, 0 as chuqurlik from _ier_k k where k.ota is null
    union all
    select c.id, d.yol || array[c.kalit, c.id::numeric], d.chuqurlik + 1 from _ier_k c join d on c.ota = d.id
  )
  select id, chuqurlik, row_number() over (order by yol) as yangi_tartib from d;
  -- Har qator ildizdan yetib boriladi (yetim/sikl yo'q) — aks holda butun tranzaksiya bekor.
  if (select count(*) from _ier_t) <> (select count(*) from _ier_k) then
    raise exception 'IERARXIYA_ICHKI: daraxtdan tashqarida qolgan qatorlar bor';
  end if;
  update public.t2_qator q set daraja = t.chuqurlik, tartib = t.yangi_tartib
  from _ier_t t where q.id = t.id and (q.daraja is distinct from t.chuqurlik or q.tartib is distinct from t.yangi_tartib);
  get diagnostics v_ozgardi = row_count;
  select max(daraja) into v_max from public.t2_qator where obyekt_id = p_obyekt_id and tur = 'rz';

  update public.t2_smeta_ierarxiya_zaxira set yangi_qatorlar = v_yangi_ids where operation_id = p_operation_id;
  perform public.t2_audit_yoz(v_komp, 'smeta_ierarxiya_tikla', 'smeta', p_obyekt_id,
    format('asl fayldan bo''lim ierarxiyasi tiklandi: ishli=%s yangi_ota=%s qayta_tartiblandi=%s max_rz_daraja=%s manba_hujjat=%s operation=%s',
           v_n, coalesce(array_length(v_yangi_ids, 1), 0), v_ozgardi, v_max, p_source_document_id, p_operation_id),
    'actor:' || p_actor_id, null);

  return jsonb_build_object('ok', true, 'sinov', false, 'ishli', v_n, 'yangi', coalesce(array_length(v_yangi_ids, 1), 0),
    'qayta_tartiblandi', v_ozgardi, 'max_rz_daraja', v_max, 'operation_id', p_operation_id);
end $function$;

create or replace function public.t2_smeta_ierarxiya_qaytar_v1(p_obyekt_id bigint, p_actor_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_z public.t2_smeta_ierarxiya_zaxira; v_rol text; v_n integer;
begin
  select * into v_z from public.t2_smeta_ierarxiya_zaxira where operation_id = p_operation_id and obyekt_id = p_obyekt_id;
  if v_z.id is null then return jsonb_build_object('ok', false, 'code', 'ZAXIRA_YOQ'); end if;
  if v_z.holat = 'qaytarildi' then return jsonb_build_object('ok', true, 'takror', true); end if;
  v_rol := public.t2_actor_kompaniya_azo_tekshir(v_z.kompaniya_id, p_actor_id);
  if v_rol not in ('boss', 'superadmin', 'rahbar') then return jsonb_build_object('ok', false, 'code', 'IERARXIYA_DENIED'); end if;
  perform set_config('t2.manba', 'import', true);
  update public.t2_qator q set ota_id = (o.e->>1)::bigint, daraja = (o.e->>2)::integer, tartib = (o.e->>3)::integer
  from jsonb_array_elements(v_z.oldingi) as o(e)
  where q.id = (o.e->>0)::bigint and q.obyekt_id = p_obyekt_id;
  get diagnostics v_n = row_count;
  if exists (select 1 from public.t2_qator c where c.ota_id = any(v_z.yangi_qatorlar) and c.id <> all(v_z.yangi_qatorlar)) then
    raise exception 'QAYTARISH: yangi bo''limlar ostida boshqa qatorlar qoldi — qo''lda tekshiring';
  end if;
  delete from public.t2_qator where id = any(v_z.yangi_qatorlar) and obyekt_id = p_obyekt_id;
  update public.t2_smeta_ierarxiya_zaxira set holat = 'qaytarildi', qaytarildi = now() where id = v_z.id;
  perform public.t2_audit_yoz(v_z.kompaniya_id, 'smeta_ierarxiya_qaytar', 'smeta', p_obyekt_id,
    format('bo''lim ierarxiyasi tiklash bekor qilindi: operation=%s qatorlar=%s', p_operation_id, v_n), 'actor:' || p_actor_id, null);
  return jsonb_build_object('ok', true, 'qaytarildi', v_n);
end $function$;

revoke all on function public.t2_smeta_ierarxiya_tikla_v1(bigint, bigint, jsonb, bigint, uuid, boolean) from public, anon, authenticated;
revoke all on function public.t2_smeta_ierarxiya_qaytar_v1(bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_smeta_ierarxiya_tikla_v1(bigint, bigint, jsonb, bigint, uuid, boolean) to service_role;
grant execute on function public.t2_smeta_ierarxiya_qaytar_v1(bigint, bigint, uuid) to service_role;
