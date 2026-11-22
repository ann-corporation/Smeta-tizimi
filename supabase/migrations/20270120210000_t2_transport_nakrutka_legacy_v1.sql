-- T2_TRANSPORT_NAKRUTKA_LEGACY_V1 (20270120200000 davomi): eski obyekt-darajadagi ustama yo'li (t2_obyekt_nakrutka_v1 va
-- t2_obyekt_nakrutka view) ham tkm / narx_ichida materiallarni transport-% bazasidan chiqaradi - `_t2_summa_paket_v1`
-- (paket/F2) bilan bir xil natija. Kaskad funksiyasi (`_t2_nakrutka_kaskad_v1`) tr_ex_* kalitlarini allaqachon biladi;
-- bu yerda faqat ularning manbai: `_t2_transport_chiqar_v1(obyekt)`.
-- Eski funksiya/view tanasi qayta yozilmaydi: aniq langar (cats argumenti) bo'yicha DINAMIK almashtiriladi; langar topilmasa
-- migratsiya TO'XTAYDI (jim o'zgarmaydi) - rebase kerak. Idempotent: ikkinchi marta - o'zgarishsiz.

create or replace function public._t2_transport_chiqar_v1(p_obyekt_id bigint)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $fn$
  with recursive yr as (
    select y.qator_id as id from public.t2_svod_yaxlit y where y.obyekt_id = p_obyekt_id and y.faol
    union
    select q.id from public.t2_qator q join yr on q.ota_id = yr.id
  )
  select jsonb_build_object(
    'tr_ex_mat', coalesce(sum(q.summa) filter (where q.kat in ('МАТ', 'М/К', 'БЕЗСКЛАД')), 0),
    'tr_ex_kab', coalesce(sum(q.summa) filter (where q.kat = 'КАБ'), 0),
    'tr_ex_ob',  coalesce(sum(q.summa) filter (where q.kat = 'ОБ'), 0))
    from public.t2_qator q
   where q.obyekt_id = p_obyekt_id and q.versiya_holat = 'faol'
     and q.transport_usul in ('tkm', 'narx_ichida') and q.tur in ('rs', 'mat', 'ob')
     and public.t2_qator_asl_v1(q.change_type, q.qoshimcha, q.zamena)
     and not exists (select 1 from public.t2_qator c where c.ota_id = q.id)
     and not exists (select 1 from yr where yr.id = q.id);
$fn$;
revoke all on function public._t2_transport_chiqar_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_transport_chiqar_v1(bigint) to service_role;

do $do$
declare d text; d2 text;
begin
  -- 1) t2_obyekt_nakrutka_v1: ikkala hisobla chaqiruvi (cats / cats_kaskad) ga transport chiqarish qo'shiladi.
  d := pg_get_functiondef('public.t2_obyekt_nakrutka_v1(bigint,bigint,bigint)'::regprocedure);
  if position('_t2_transport_chiqar_v1' in d) = 0 then
    d2 := regexp_replace(d, 't2_nakrutka_hisobla_v1\((v_cats_kaskad|v_cats), v_nk\)', 't2_nakrutka_hisobla_v1(\1 || public._t2_transport_chiqar_v1(p_obyekt_id), v_nk)', 'g');
    if d2 = d then raise exception 'TRANSPORT_LEGACY: t2_obyekt_nakrutka_v1 langari (t2_nakrutka_hisobla_v1(v_cats, v_nk)) topilmadi - tana o''zgargan, rebase kerak'; end if;
    execute d2;
  end if;
  -- 2) view: jsonb_build_object('chel', e.chel, ..., 'bez', e.bez) argumentiga || transport.
  d := pg_get_viewdef('public.t2_obyekt_nakrutka'::regclass, true);
  if position('_t2_transport_chiqar_v1' in d) = 0 then
    d2 := regexp_replace(d, '(jsonb_build_object\(''chel''(?:::text)?, e\.chel[^)]*?''bez''(?:::text)?, e\.bez)\)', '\1) || public._t2_transport_chiqar_v1(e.obyekt_id)');
    if d2 = d then raise exception 'TRANSPORT_LEGACY: t2_obyekt_nakrutka view langari (jsonb_build_object(chel..bez)) topilmadi - ta''rif o''zgargan, rebase kerak'; end if;
    execute 'create or replace view public.t2_obyekt_nakrutka as ' || rtrim(d2, E'; \n');
  end if;
end $do$;