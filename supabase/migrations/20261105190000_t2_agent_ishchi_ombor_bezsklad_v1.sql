-- T2-AGENT-ISHCHI-OMBOR-001 — uchinchi ishchi agent: Ombor (warehouse) — БЕЗСКЛАД nomzodlari.
-- Egasi Q1: БЕЗСКЛАД — omborga kirmaydigan beton turidagi materiallar. Tasnif kodi
-- (frontend/src/lib/resurs-kategoriyasi/bez-sklad.ts) faqat YANGI importlarda ishlaydi; eski
-- smetalardagi qatorlar hammasi МАТ bo'lib qolgan. Agent faqat O'QIYDI: obyekt materiallarini
-- o'sha deterministik qoida bo'yicha tekshiradi, nomzodlarni (nom+birlik guruhlari, summa bilan)
-- run.result ga yozadi va run 'waiting_review' ga o'tadi. Kategoriyani qo'llash — operator
-- (resurs_kategoriya_belgila). Buyruq 'warehouse.bezsklad.audit' warehouse profiliga qo'shiladi.
-- Faqat ADDITIV.

begin;

update public.t2_agent_profile
   set allowed_commands = allowed_commands || '["warehouse.bezsklad.audit"]'::jsonb,
       versiya = versiya + 1, updated_at = now()
 where kod = 'warehouse' and not (allowed_commands ? 'warehouse.bezsklad.audit');

/* bez-sklad.ts dagi bezSkladKategoriyaAniqla() ning SQL egizagi (operator tanlovisiz qismi).
   Paritet testi: frontend/src/lib/resurs-kategoriyasi/bez-sklad.sql-egizak.test.ts. */
create or replace function public.t2_bez_sklad_nomzodmi(p_nom text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  with s as (
    select btrim(regexp_replace(regexp_replace(translate(upper(coalesce(p_nom, '')), 'Ё–—−', 'Е---'),
      '[^0-9A-ZА-ЯЎҚҒҲЁ\s-]', ' ', 'g'), '\s+', ' ', 'g')) n
  )
  select n <> ''
     and n !~ '(^|[^0-9A-ZА-ЯЎҚҒҲЁ])(БЛОК(И|ОВ)?|ЖБИ|ЖЕЛЕЗОБЕТОН(НЫЙ|НЫЕ)?|КОНСТРУКЦ(ИЯ|ИИ|ИЙ)|ПЛИТ(А|Ы)?|КОЛЬЦ(О|А)?|БОРДЮР(Ы)?|ЛОТК(И)?|ТРУБ(А|Ы)?|ПЕРЕМЫЧК(А|И)|СТОЙК(А|КИ)|ЦЕМЕНТ|ПЕСОК|ДЮБЕЛ[А-Я]*|ИЗДЕЛИ[А-Я]*|СРЕДСТВ[А-Я]*|АЦЕТИЛЕН|КЛЕЕВОЙ|СУХОЙ|СУХАЯ|СУХИЕ|СУХИХ)([^0-9A-ZА-ЯЎҚҒҲЁ]|$)'
     and (
       n ~ '(ТОВАРНЫЙ БЕТОН|БЕТОННАЯ СМЕСЬ|БЕТОННЫЕ СМЕСИ|АСФАЛЬТОБЕТОН|АСФАЛЬТО-БЕТОН|TOVAR BETON|BETON QORISHMA|ASFALTOBETON)'
       or n ~ '(^|[^0-9A-ZА-ЯЎҚҒҲЁ])(РАСТВОР(Ы)?|БЕТОН)([^0-9A-ZА-ЯЎҚҒҲЁ]|$)'
     )
  from s
$$;

create or replace function public.t2_agent_ishchi_ombor_v1(
  p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_run public.t2_agent_run%rowtype; v_guard jsonb; v_natija jsonb; v_res jsonb;
  v_mat int; v_bez int; v_nomzod_qator int; v_nomzod_summa numeric; v_guruhlar jsonb; v_registr int; v_xulosa text;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_agent_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  select * into v_run from public.t2_agent_run where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_FOUND'); end if;
  if v_run.agent_kod <> 'warehouse' or v_run.command_kod <> 'warehouse.bezsklad.audit' then
    return jsonb_build_object('ok', false, 'code', 'WORKER_MISMATCH');
  end if;
  if v_run.obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'OBJECT_SCOPE_REQUIRED'); end if;
  v_guard := public.t2_agent_scope_guard_v1(p_actor_id, v_run.kompaniya_id, v_run.loyiha_id, v_run.obyekt_id);
  if coalesce((v_guard->>'ok')::boolean, false) is not true then return v_guard; end if;
  if p_expected_version is null or p_expected_version <> v_run.versiya then
    return jsonb_build_object('ok', false, 'code', 'STALE_VERSION', 'versiya', v_run.versiya);
  end if;
  if v_run.holat <> 'queued' then return jsonb_build_object('ok', false, 'code', 'RUN_NOT_QUEUED', 'holat', v_run.holat); end if;

  select count(*) filter (where q.kat = 'МАТ'), count(*) filter (where q.kat = 'БЕЗСКЛАД'),
         count(*) filter (where q.kat = 'МАТ' and public.t2_bez_sklad_nomzodmi(q.nom)),
         coalesce(sum(q.summa) filter (where q.kat = 'МАТ' and public.t2_bez_sklad_nomzodmi(q.nom)), 0)
    into v_mat, v_bez, v_nomzod_qator, v_nomzod_summa
  from public.t2_qator q
  where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat');

  select coalesce(jsonb_agg(x order by (x->>'summa')::numeric desc nulls last), '[]'::jsonb) into v_guruhlar from (
    select jsonb_build_object('nom', min(q.nom), 'birlik', q.birlik, 'qatorlar', count(*),
             'hajm', sum(q.hajm), 'summa', sum(q.summa), 'qator_ids', (array_agg(q.id order by q.id))[1:50]) x
    from public.t2_qator q
    where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat') and q.kat = 'МАТ' and public.t2_bez_sklad_nomzodmi(q.nom)
    group by upper(btrim(q.nom)), q.birlik
    order by sum(q.summa) desc nulls last limit 200) s;

  select count(*) into v_registr from public.t2_resurs_kategoriya
   where kompaniya_id = v_run.kompaniya_id and kategoriya = 'БЕЗСКЛАД';

  v_xulosa := format('%s ta material qatoridan %s tasi БЕЗСКЛАД nomzodi (%s xil nom, jami %s so''m) — hozir МАТ sifatida ombor ustamasi bilan hisoblanmoqda. Obyektda allaqachon БЕЗСКЛАД: %s qator; kompaniya registrida БЕЗСКЛАД nomlari: %s. Tasdiqlash — operator (Resurs kategoriyasi).',
    v_mat, v_nomzod_qator, jsonb_array_length(v_guruhlar), to_char(round(v_nomzod_summa), 'FM999G999G999G999G990'), v_bez, v_registr);
  v_natija := jsonb_build_object('agent', 'warehouse', 'turi', 'bez_sklad_nomzodlari', 'vaqt', now(),
    'material_qatorlar', v_mat, 'bez_sklad_qatorlar', v_bez, 'nomzod_qatorlar', v_nomzod_qator,
    'nomzod_summa', round(v_nomzod_summa, 2), 'registr_bez_sklad', v_registr, 'nomzodlar', v_guruhlar, 'xulosa', v_xulosa);

  update public.t2_agent_run set holat = 'waiting_review', result = v_natija, versiya = versiya + 1,
    started_at = coalesce(started_at, now()), updated_at = now() where id = p_run_id;
  perform public.t2_audit_yoz(v_run.kompaniya_id, 'agent_worker_run', 'agent_control', v_run.obyekt_id,
    format('run=%s worker=ombor_bezsklad mat=%s nomzod=%s', p_run_id, v_mat, v_nomzod_qator), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'run_id', p_run_id, 'holat', 'waiting_review', 'versiya', v_run.versiya + 1, 'result', v_natija);
  insert into public.t2_agent_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'agent_worker_ombor', v_res);
  return v_res;
end $$;

revoke all on function public.t2_agent_ishchi_ombor_v1(bigint, bigint, integer, uuid) from public, anon, authenticated;
grant execute on function public.t2_agent_ishchi_ombor_v1(bigint, bigint, integer, uuid) to service_role;
revoke all on function public.t2_bez_sklad_nomzodmi(text) from public, anon, authenticated;
grant execute on function public.t2_bez_sklad_nomzodmi(text) to service_role;

commit;
