-- Только обёртка existing counters -> existing human-review proposals. Новых таблиц нет.
-- Полная закрытая календарная неделя БД, opt-in, k>=5 разных компаний НА КЛЮЧ.
-- Existing proposal table: metadata-only check 2026-11-21 = 8 KiB. Additive tiny partial index.
create unique index if not exists t2_agent_jarvis_week_uq on public.t2_agent_taklif ((mazmun->>'jarvis_hafta'))
where tur = 'rivojlanish' and doira = 'global' and mazmun->>'manba' = 'jarvis_compact_v1';
create or replace function public.t2_jarvis_haftalik_taklif_v1(p_actor_id bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp set timezone = 'UTC' as $$
declare
  g jsonb; v_id bigint; v_result jsonb; v_rows jsonb; v_constraint text;
  v_to date := date_trunc('week', current_date)::date;
  v_from date := date_trunc('week', current_date)::date - 7;
begin
  g := public.t2_agent_scope_guard_v1(p_actor_id, null);
  if g->>'ok' is distinct from 'true' then return coalesce(g, '{"ok":false,"code":"AUTH_REQUIRED"}'::jsonb); end if;
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_REQUIRED'); end if;
  if not pg_try_advisory_xact_lock(hashtext('t2_jarvis_weekly_operation'), hashtext(p_operation_id::text)) then
    return jsonb_build_object('ok', false, 'code', 'WEEKLY_BUSY');
  end if;
  if exists (select 1 from public.t2_agent_taklif t where t.mazmun->>'manba' = 'jarvis_compact_v1'
      and t.mazmun->>'operation_id' = p_operation_id::text and t.mazmun->>'jarvis_hafta' <> v_from::text) then
    return jsonb_build_object('ok', false, 'code', 'OPERATION_REUSE');
  end if;
  if not pg_try_advisory_xact_lock(hashtext('t2_jarvis_haftalik_v1'), hashtext(v_from::text)) then
    return jsonb_build_object('ok', false, 'code', 'WEEKLY_BUSY');
  end if;
  select t.id into v_id from public.t2_agent_taklif t
   where t.tur = 'rivojlanish' and t.doira = 'global'
     and t.mazmun->>'manba' = 'jarvis_compact_v1' and t.mazmun->>'jarvis_hafta' = v_from::text
   order by t.id limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'taklif_id', v_id::text, 'yaratildi', false, 'hafta', v_from, 'gacha', v_to);
  end if;
  with counters as (
    select f.kompaniya_id, f.amal, f.hodisa, f.kod, f.soni from public.t2_friksiya f
     where f.kun >= v_from and f.kun < v_to and f.sahifa = 'jarvis'
    union all
    select h.kompaniya_id, h.amal, h.hodisa, h.kod, h.soni from public.t2_friksiya_hafta h
     where h.hafta = v_from and h.sahifa = 'jarvis'
  ), eligible as (
    select c.amal, c.hodisa, c.kod, sum(c.soni) as soni, count(distinct c.kompaniya_id) as kompaniya_soni
      from counters c join public.t2_tajriba_sozlama s on s.kompaniya_id = c.kompaniya_id and s.oqish and s.hissa
     where c.soni > 0 and (
       (c.amal in ('feedback_bad','feedback_unclear') and c.hodisa = 'tashlandi' and c.kod = '') or
       (c.amal in ('read.object_search','read.estimate_row','read.estimate_price','read.norm_reference',
         'read.catalog_price','read.f2_register','read.cumulative','read.discrepancy','read.warehouse_balance',
         'read.document_search','read.material_prices','read.estimate_total','read.task_list','read.approval_queue','read.transport_tekshir')
        and c.hodisa = 'xato' and c.kod in ('SOURCE_UNAVAILABLE','NO_ANSWER')))
     group by c.amal, c.hodisa, c.kod having count(distinct c.kompaniya_id) >= 5
  ) select jsonb_agg(jsonb_build_object('amal', e.amal, 'hodisa', e.hodisa, 'kod', e.kod,
      'urinishlar', e.soni::text, 'kompaniya_soni', e.kompaniya_soni::text) order by e.amal, e.hodisa, e.kod) into v_rows from eligible e;
  if v_rows is null then
    return jsonb_build_object('ok', true, 'yaratildi', false, 'sabab', 'NO_ELIGIBLE_FAILURES', 'hafta', v_from, 'gacha', v_to);
  end if;
  -- Одно immutable snapshot/week. Люди неизвестны: o=0 не превращается в число пользователей.
  begin
    v_result := public.t2_agent_taklif_yarat_v1(p_actor_id, null, 'rivojlanish', 'global', 'platform_orchestrator',
    'Jarvis: недельный отчёт ' || v_from::text,
    jsonb_build_object('manba', 'jarvis_compact_v1', 'operation_id', p_operation_id, 'jarvis_hafta', v_from, 'gacha', v_to,
      'vaqt_mintaqa', current_setting('TimeZone'), 'k_min', 5, 'odam_soni', null, 'signallar', v_rows,
      'maqsad', 'Проверить повторяющиеся отказы и случаи отсутствия ответа Jarvis.',
      'tavsif', 'Только счётчики попыток. Не утверждает число людей или правильность ответов. Изменения требуют отдельного рассмотрения.',
      'xavf', 'orta', 'qabul_mezonlari', jsonb_build_array('Сохранить tenant/permission и NULL != 0.',
        'До изменения поведения проверить источник и eval.', 'Никаких автоматических записей, merge или deploy.')),
      v_rows, null);
  exception when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint <> 't2_agent_jarvis_week_uq' then raise; end if;
    select t.id into v_id from public.t2_agent_taklif t where t.tur = 'rivojlanish' and t.doira = 'global'
      and t.mazmun->>'manba' = 'jarvis_compact_v1' and t.mazmun->>'jarvis_hafta' = v_from::text;
    if v_id is null then raise; end if;
    return jsonb_build_object('ok', true, 'taklif_id', v_id::text, 'yaratildi', false, 'hafta', v_from, 'gacha', v_to);
  end;
  if v_result->>'ok' is distinct from 'true' then return v_result; end if;
  return jsonb_build_object('ok', true, 'taklif_id', v_result->>'id', 'yaratildi', true, 'hafta', v_from, 'gacha', v_to);
end $$;
revoke all on function public.t2_jarvis_haftalik_taklif_v1(bigint, uuid) from public, anon, authenticated;
grant execute on function public.t2_jarvis_haftalik_taklif_v1(bigint, uuid) to service_role;
