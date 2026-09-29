-- T2 qo'shimcha/zamena JOYLASHUVI — egasi 2026-09-29:
--   "razdel oxirida emas. foydalanuvchi drag qilib surayotganda smeta tarafdan o'zi xohlagan
--    qatorlar orasiga qo'ya olishi kerak … zamena esa aynan o'sha zamena bo'ladigan ish
--    turidan keyin aynan tushishi kerak".
--
-- Avval: `keyin_qator_id` berilsa tartib = langar + 1 va smeta tartiblari ketma-ket bo'lgani
-- uchun doim ORDERING_GAP_REQUIRED — shuning uchun UI langarsiz yuborardi va yangi qator
-- butun smeta OXIRIGA tushardi (Karting: ПОЛЫ ИЗ БЕТОН qo'shimchalari).
--
-- Endi: boshqa qatorlarni SURMASDAN (t2_qator har o'zgarishida audit/signal triggeri bor —
-- minglab yozuv bo'lardi) yangi qatorga langar DARAXTINING oxirgi tartibi beriladi (ish
-- bo'lsa — uning oxirgi resursi). Teng tartibda o'qish `tartib, id` bo'yicha — yangi id
-- doim katta, ya'ni qator aynan langar (va uning resurslari)dan keyin, keyingi asl qatordan
-- oldin turadi. Langar = otaning o'zi → ota ostidagi birinchi o'rin.
-- `t2_ish_resurslar_bilan_yarat_v1`: resurslar ish ostida zanjir bo'lib (birinchisi — ishning
-- o'zidan keyin, keyingilari — oldingi resursdan keyin), F2 dagi tartibda.
begin;

do $mig$
declare
  d text;
  eski text := $e$ if after_id is not null then
   select tartib+1 into ordering from public.t2_qator where id=after_id and obyekt_id=o and ota_id=parent_id;
   if not found then raise exception 'ORDERING_SCOPE_INVALID'; end if;
   if exists(select 1 from public.t2_qator where obyekt_id=o and tartib=ordering) then
     raise exception 'ORDERING_GAP_REQUIRED';
   end if;
 else$e$;
  yangi text := $y$ if after_id is not null then
   -- Egasi 2026-09-29: tanlangan qatordan (va uning resurslaridan) KEYIN; boshqalar surilmaydi.
   if after_id = parent_id then
     ordering := parent.tartib;
   else
     perform 1 from public.t2_qator where id=after_id and obyekt_id=o and ota_id=parent_id;
     if not found then raise exception 'ORDERING_SCOPE_INVALID'; end if;
     with recursive t(id, tartib) as (
       select q0.id, q0.tartib from public.t2_qator q0 where q0.id=after_id
       union all
       select q1.id, q1.tartib from public.t2_qator q1 join t on q1.ota_id=t.id where q1.obyekt_id=o
     ) select max(t.tartib) into ordering from t;
   end if;
 else$y$;
begin
  select pg_get_functiondef('public.t2_addrepl_execute_v1(jsonb)'::regprocedure) into d;
  if position(eski in d) = 0 then raise exception 'ADDREPL_ORDERING_BLOCK_NOT_FOUND'; end if;
  execute replace(d, eski, yangi);
end
$mig$;

revoke all on function public.t2_addrepl_execute_v1(jsonb) from public, anon, authenticated;

create or replace function public.t2_ish_resurslar_bilan_yarat_v1(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  mode text := p_request->>'command';
  op uuid := (p_request->>'operation_id')::uuid;
  ish jsonb;
  ish_natija jsonb;
  ish_id bigint;
  oldingi_id bigint;
  r jsonb;
  i integer := 0;
  v integer;
  res_natija jsonb;
  res_idlar jsonb := '[]'::jsonb;
begin
  if mode not in ('additional', 'replacement') then raise exception 'COMMAND_INVALID'; end if;
  if op is null then raise exception 'OPERATION_AND_VERSION_REQUIRED' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_request->'resurslar', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_request->'resurslar', '[]'::jsonb)) > 500 then
    raise exception 'RESOURCES_INVALID';
  end if;

  ish := p_request - 'resurslar';
  ish_natija := public.t2_addrepl_execute_v1(ish);
  ish_id := (ish_natija->>'qator_id')::bigint;
  if ish_id is null then raise exception 'WORK_NOT_CREATED'; end if;
  oldingi_id := ish_id;

  for r in select value from jsonb_array_elements(coalesce(p_request->'resurslar', '[]'::jsonb)) loop
    i := i + 1;
    select versiya into v from public.t2_qator where id = ish_id;
    res_natija := public.t2_addrepl_execute_v1(jsonb_build_object(
      'command', 'resource',
      'kompaniya_id', p_request->'kompaniya_id',
      'actor_id', p_request->'actor_id',
      'obyekt_id', p_request->'obyekt_id',
      'ota_qator_id', ish_id,
      'tur', coalesce(nullif(r->>'tur', ''), 'rs'),
      'nom', r->>'nom',
      'birlik', r->>'birlik',
      'hajm', r->'hajm',
      'kod', r->>'kod',
      -- Resurslar F2 dagi tartibda: birinchisi ishdan keyin, keyingisi oldingisidan keyin.
      'keyin_qator_id', oldingi_id,
      'sabab', p_request->>'sabab',
      'dalil_hujjat_id', p_request->'dalil_hujjat_id',
      'operation_id', md5(op::text || ':r' || i)::uuid,
      'kutilgan_versiya', v
    ));
    oldingi_id := (res_natija->>'qator_id')::bigint;
    res_idlar := res_idlar || jsonb_build_array(oldingi_id);
  end loop;

  return jsonb_build_object('ok', true, 'qator_id', ish_id, 'resurs_qator_idlar', res_idlar,
    'takror', coalesce((ish_natija->>'takror')::boolean, false));
end $function$;

revoke all on function public.t2_ish_resurslar_bilan_yarat_v1(jsonb) from public, anon, authenticated;
grant execute on function public.t2_ish_resurslar_bilan_yarat_v1(jsonb) to service_role;

commit;
