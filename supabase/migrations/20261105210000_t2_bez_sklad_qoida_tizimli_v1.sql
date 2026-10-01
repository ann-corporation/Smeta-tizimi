-- T2-BEZ-SKLAD-QOIDA-001 — БЕЗСКЛАД tizimli qoida (egasi, 2026-10-01):
--   "tarkibida beton yoki rastvor bo'lib birligi m3 bo'lsa" → БЕЗСКЛАД. Asfaltobeton — т yoki м³.
-- Bazadagi trigger HAR QANDAY import/yozish yo'lida qatorni avtomatik БЕЗСКЛАД qiladi; eski
-- ma'lumot bir marta shu qoida bilan to'g'rilanadi (egasi ruxsati: 2026-10-01 ertalab).
--   * TS egizagi: frontend/src/lib/resurs-kategoriyasi/bez-sklad.ts (paritet testi bor);
--   * faqat material qatori (tur rs/mat, kat='МАТ') — ОБ/М/К/КАБ ga tegmaydi;
--   * operator registrda boshqa kategoriya qo'ygan nom+birlik — tegilmaydi;
--   * F2 aktiga kirgan qator (t2_akt_qator) — tegilmaydi (topshirilgan summalar o'zgarmasin);
--   * trigger faqat INSERT va nom/birlik o'zgarganda — operator kat ni qo'lda o'zgartirsa, saqlanadi.
-- 20261105200000_t2_bez_sklad_qolla_v1 (qo'lda qo'llash RPC, hech qachon qo'llanmagan) shu bilan
-- almashtirildi.

begin;

create or replace function public.t2_bez_sklad_qoida(p_nom text, p_birlik text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  with s as (
    select btrim(regexp_replace(regexp_replace(translate(upper(coalesce(p_nom, '')), 'Ё–—−', 'Е---'),
             '[^0-9A-ZА-ЯЎҚҒҲЁ\s-]', ' ', 'g'), '\s+', ' ', 'g')) n,
           regexp_replace(translate(upper(coalesce(p_birlik, '')), '³MT', '3МТ'), '[\s.]', '', 'g') b
  )
  select n <> ''
     and n !~ '(^|[^0-9A-ZА-ЯЎҚҒҲЁ])(БЛОК[А-Я]*|ГАЗОБЕТОН[А-Я]*|ПЕНОБЕТОН[А-Я]*|ЖЕЛЕЗОБЕТОН[А-Я]*|КОНСТРУКЦ[А-Я]*|ПЕСОК|СУХ[А-Я]*|ИЗДЕЛИ[А-Я]*|КИРПИЧ[А-Я]*)([^0-9A-ZА-ЯЎҚҒҲЁ]|$)'
     and (
       (n ~ 'АСФАЛЬТО-?БЕТОН' and (b ~ '^[0-9]*(М3|КУБМ|МКУБ)$' or b ~ '^[0-9]*(Т|ТН|ТОННА|ТОНН)$'))
       or ((n ~ 'БЕТОН' or n ~ '(^|[^0-9A-ZА-ЯЎҚҒҲЁ])РАСТВОР(Ы)?([^0-9A-ZА-ЯЎҚҒҲЁ]|$)') and b ~ '^[0-9]*(М3|КУБМ|МКУБ)$')
     )
  from s
$$;

/* Operator registrda shu nom+birlik uchun boshqa kategoriya tanlaganmi. */
create or replace function public.t2_bez_sklad_operator_rad(p_kompaniya_id bigint, p_nom text, p_birlik text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_kompaniya_id is not null and exists (
    select 1 from public.t2_resurs_kategoriya r
     where r.kompaniya_id = p_kompaniya_id
       and r.nom_key = public.t2_resurs_nom_kalit(p_nom)
       and r.birlik_key = public.t2_resurs_birlik_kalit(p_birlik)
       and r.kategoriya <> 'БЕЗСКЛАД')
$$;

create or replace function public.t2_qator_bez_sklad_trg()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.tur in ('rs', 'mat') and new.kat = 'МАТ'
     and public.t2_bez_sklad_qoida(new.nom, new.birlik)
     and not public.t2_bez_sklad_operator_rad(new.kompaniya_id, new.nom, new.birlik)
     and (tg_op = 'INSERT' or not exists (select 1 from public.t2_akt_qator a where a.qator_id = new.id)) then
    new.kat := 'БЕЗСКЛАД';
  end if;
  return new;
end $$;

-- Nom "zz": t2_qator_komp_meros (kompaniya_id ni to'ldiradi) dan KEYIN ishlasin.
drop trigger if exists t2_qator_zz_bez_sklad on public.t2_qator;
create trigger t2_qator_zz_bez_sklad
  before insert or update of nom, birlik on public.t2_qator
  for each row execute function public.t2_qator_bez_sklad_trg();

-- Eski ma'lumotni bir marta to'g'rilash (kompaniya bo'yicha audit bilan).
do $$
declare r record;
begin
  for r in
    with o as (
      update public.t2_qator q set kat = 'БЕЗСКЛАД'
       where q.kat = 'МАТ' and q.tur in ('rs', 'mat')
         and public.t2_bez_sklad_qoida(q.nom, q.birlik)
         and not public.t2_bez_sklad_operator_rad(q.kompaniya_id, q.nom, q.birlik)
         and not exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id)
      returning q.kompaniya_id, q.obyekt_id
    )
    select kompaniya_id, count(*) n, count(distinct obyekt_id) ob from o group by kompaniya_id
  loop
    perform public.t2_audit_yoz(r.kompaniya_id, 'bez_sklad_qoida_backfill', 'resurs_kategoriya', null,
      format('qator=%s obyekt=%s qoida=beton/rastvor+m3, asfaltobeton t/m3', r.n, r.ob), 'system:migration', null);
  end loop;
end $$;

/* Ombor agenti endi nomzod qidirmaydi (trigger o'zi qo'llaydi) — ISTISNOLARNI nazorat qiladi. */
create or replace function public.t2_agent_ishchi_ombor_v1(
  p_actor_id bigint, p_run_id bigint, p_expected_version integer, p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prev jsonb; v_run public.t2_agent_run%rowtype; v_guard jsonb; v_natija jsonb; v_res jsonb;
  v_bez int; v_bez_summa numeric; v_aktda jsonb; v_shubhali jsonb; v_xulosa text;
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

  select count(*), coalesce(sum(summa), 0) into v_bez, v_bez_summa
    from public.t2_qator where obyekt_id = v_run.obyekt_id and tur in ('rs', 'mat') and kat = 'БЕЗСКЛАД';

  select coalesce(jsonb_agg(jsonb_build_object('qator_id', q.id, 'nom', q.nom, 'birlik', q.birlik, 'summa', q.summa) order by q.summa desc nulls last), '[]'::jsonb)
    into v_aktda
  from public.t2_qator q
  where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat') and q.kat = 'МАТ'
    and public.t2_bez_sklad_qoida(q.nom, q.birlik)
    and exists (select 1 from public.t2_akt_qator a where a.qator_id = q.id);

  select coalesce(jsonb_agg(x order by (x->>'summa')::numeric desc nulls last), '[]'::jsonb) into v_shubhali from (
    select jsonb_build_object('nom', min(q.nom), 'birlik', q.birlik, 'qatorlar', count(*), 'summa', sum(q.summa)) x
    from public.t2_qator q
    where q.obyekt_id = v_run.obyekt_id and q.tur in ('rs', 'mat') and q.kat = 'МАТ'
      and upper(q.nom) ~ '(БЕТОН|РАСТВОР)' and not public.t2_bez_sklad_qoida(q.nom, q.birlik)
    group by upper(btrim(q.nom)), q.birlik
    order by sum(q.summa) desc nulls last limit 100) s;

  v_xulosa := format('Qoida (beton/rastvor + м³, asfaltobeton т/м³) bo''yicha avtomatik БЕЗСКЛАД: %s qator, %s so''m. F2 aktida bo''lgani uchun МАТ qolgan: %s qator. Nomida beton/rastvor bor, lekin qoidaga tushmagan: %s xil — ko''zdan kechiring.',
    v_bez, to_char(round(v_bez_summa), 'FM999G999G999G999G990'), jsonb_array_length(v_aktda), jsonb_array_length(v_shubhali));
  v_natija := jsonb_build_object('agent', 'warehouse', 'turi', 'bez_sklad_nazorat', 'vaqt', now(),
    'bez_sklad_qatorlar', v_bez, 'bez_sklad_summa', round(v_bez_summa, 2),
    'aktda_qolgan', v_aktda, 'shubhali', v_shubhali, 'xulosa', v_xulosa);

  update public.t2_agent_run set holat = 'waiting_review', result = v_natija, versiya = versiya + 1,
    started_at = coalesce(started_at, now()), updated_at = now() where id = p_run_id;
  perform public.t2_audit_yoz(v_run.kompaniya_id, 'agent_worker_run', 'agent_control', v_run.obyekt_id,
    format('run=%s worker=ombor_bezsklad bez=%s aktda=%s shubhali=%s', p_run_id, v_bez, jsonb_array_length(v_aktda), jsonb_array_length(v_shubhali)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'run_id', p_run_id, 'holat', 'waiting_review', 'versiya', v_run.versiya + 1, 'result', v_natija);
  insert into public.t2_agent_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'agent_worker_ombor', v_res);
  return v_res;
end $$;

drop function if exists public.t2_bez_sklad_nomzodmi(text);

revoke all on function public.t2_bez_sklad_qoida(text, text) from public, anon, authenticated;
grant execute on function public.t2_bez_sklad_qoida(text, text) to service_role;
revoke all on function public.t2_bez_sklad_operator_rad(bigint, text, text) from public, anon, authenticated;
grant execute on function public.t2_bez_sklad_operator_rad(bigint, text, text) to service_role;
revoke all on function public.t2_agent_ishchi_ombor_v1(bigint, bigint, integer, uuid) from public, anon, authenticated;
grant execute on function public.t2_agent_ishchi_ombor_v1(bigint, bigint, integer, uuid) to service_role;

commit;
