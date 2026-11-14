-- T2 USTA «Bugun» (ekotizim V3): usta/brigadir telefondan kiritgan bajarilgan hajm QORALAMA bo'lib tushadi,
-- prorab/PTO (fakt.write) tasdiqlasa mavjud fakt_yoz_v2 yo'li bilan haqiqiy faktga aylanadi.
-- Material zayavkasi — mavjud t2_erp_taminot (status 'submitted', izoh «Ustadan»). Tabel — mavjud hr_tabel_saqla_v1 (yangi jadval yo'q).
-- Hajm hajmi: bir qoralama qator ~150 bayt; kuniga ~30 qator * 20 kompaniya => ~1 MB/oy (DB byudjeti ichida).
-- Forward-only: BEGIN/COMMIT yo'q. Qo'llash — egasi ruxsatidan keyin (bu agent qo'llamaydi).

create table if not exists public.t2_usta_fakt_qoralama (
  id bigint generated always as identity primary key,
  kompaniya_id bigint not null references public.t2_kompaniya(id) on delete cascade,
  obyekt_id bigint not null references public.t2_obyekt(id) on delete cascade,
  qator_id bigint not null references public.t2_qator(id) on delete cascade,
  sana date not null,
  hajm numeric not null check (hajm <> 0),
  izoh text,
  foto_hujjat_id bigint,
  operation_id uuid not null,
  yozgan_actor_id bigint not null,
  holat text not null default 'qoralama' check (holat in ('qoralama', 'tasdiqlangan', 'rad')),
  qaror_actor_id bigint,
  qaror_vaqt timestamptz,
  qaror_izoh text,
  akt_id bigint,
  created_at timestamptz not null default now(),
  constraint t2_usta_fakt_qoralama_op_qator_uq unique (operation_id, qator_id)
);

create index if not exists t2_usta_fakt_qoralama_kutish_idx
  on public.t2_usta_fakt_qoralama (kompaniya_id, obyekt_id, created_at desc) where holat = 'qoralama';
create index if not exists t2_usta_fakt_qoralama_actor_idx
  on public.t2_usta_fakt_qoralama (kompaniya_id, yozgan_actor_id, created_at desc);

-- Faqat service_role (shlyuz) o'qiydi/yozadi; brauzer to'g'ridan-to'g'ri kira olmaydi.
alter table public.t2_usta_fakt_qoralama enable row level security;
revoke all on table public.t2_usta_fakt_qoralama from public, anon, authenticated;
grant select, insert, update on table public.t2_usta_fakt_qoralama to service_role;

-- 1) Usta/brigadir: qoralama yozish (self.work.write yoki fakt.write). Idempotent: operation_id.
create or replace function public.t2_usta_fakt_qoralama_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_sana date, p_qatorlar jsonb,
  p_izoh text, p_foto_hujjat_id bigint, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb; v_n int := 0; v_e jsonb; v_hajm numeric; v_qid bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'self.work.write')
       or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'fakt.write')) then
    raise exception 'PERMISSION_DENIED: self.work.write talab qilinadi' using errcode = '42501';
  end if;
  if p_sana is null or p_sana > (current_date + 1) or p_sana < (current_date - 31) then
    return jsonb_build_object('ok', false, 'code', 'SANA_NOTOGRI');
  end if;
  if p_qatorlar is null or jsonb_typeof(p_qatorlar) <> 'array' or jsonb_array_length(p_qatorlar) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'code', 'QATORLAR_1_200');
  end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  for v_e in select value from jsonb_array_elements(p_qatorlar) loop
    if coalesce(v_e->>'qator_id', '') !~ '^[1-9][0-9]*$' or coalesce(v_e->>'hajm', '') !~ '^-?[0-9]+(\.[0-9]+)?$' or (v_e->>'hajm')::numeric = 0 then
      return jsonb_build_object('ok', false, 'code', 'FAKT_LINE_INVALID');
    end if;
    v_qid := (v_e->>'qator_id')::bigint; v_hajm := (v_e->>'hajm')::numeric;
    if not exists (select 1 from public.t2_qator q where q.id = v_qid and q.obyekt_id = p_obyekt_id) then
      return jsonb_build_object('ok', false, 'code', 'FAKT_LINE_OUTSIDE_OBJECT');
    end if;
    insert into public.t2_usta_fakt_qoralama (kompaniya_id, obyekt_id, qator_id, sana, hajm, izoh, foto_hujjat_id, operation_id, yozgan_actor_id)
    values (p_kompaniya_id, p_obyekt_id, v_qid, p_sana, v_hajm, nullif(left(p_izoh, 500), ''), p_foto_hujjat_id, p_operation_id, p_actor_id)
    on conflict (operation_id, qator_id) do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.t2_audit_yoz(p_kompaniya_id, 'usta_fakt_qoralama', 'fakt', null, format('obyekt=%s qator=%s', p_obyekt_id, v_n), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 'usta_fakt_qoralama_v1', jsonb_build_object('ok', true, 'qator_soni', v_n, 'holat', 'qoralama'));
  return jsonb_build_object('ok', true, 'qator_soni', v_n, 'holat', 'qoralama');
end $function$;

-- 2) Prorab/PTO: qaror (fakt.write). tasdiq => mavjud t2_fakt_yoz_v2 (obyekt+sana bo'yicha bitta hujjat); rad => holat.
create or replace function public.t2_usta_fakt_qaror_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_qoralama_ids bigint[], p_qaror text, p_izoh text, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb; v_g record; v_lines jsonb; v_r jsonb; v_aktlar jsonb := '[]'::jsonb; v_n int := 0; v_op uuid;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'fakt.write') then
    raise exception 'PERMISSION_DENIED: fakt.write talab qilinadi' using errcode = '42501';
  end if;
  if p_qaror not in ('tasdiqlangan', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR_NOTOGRI'); end if;
  if p_qoralama_ids is null or coalesce(array_length(p_qoralama_ids, 1), 0) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'code', 'IDLAR_1_500');
  end if;
  -- Faqat shu kompaniyaning hali qaror qilinmagan qatorlari (boshqa kompaniya id si e'tiborsiz).
  perform 1 from public.t2_usta_fakt_qoralama
   where id = any(p_qoralama_ids) and kompaniya_id = p_kompaniya_id and holat = 'qoralama' for update;
  if p_qaror = 'rad' then
    update public.t2_usta_fakt_qoralama set holat = 'rad', qaror_actor_id = p_actor_id, qaror_vaqt = now(), qaror_izoh = nullif(left(p_izoh, 500), '')
     where id = any(p_qoralama_ids) and kompaniya_id = p_kompaniya_id and holat = 'qoralama';
    get diagnostics v_n = row_count;
  else
    for v_g in
      select q.obyekt_id, q.sana, array_agg(q.id) as idlar
        from public.t2_usta_fakt_qoralama q
       where q.id = any(p_qoralama_ids) and q.kompaniya_id = p_kompaniya_id and q.holat = 'qoralama'
       group by q.obyekt_id, q.sana
    loop
      -- Bir xil qator bir necha marta yozilgan bo'lsa jamlanadi; yig'indisi 0 bo'lgan qator hujjatga kirmaydi.
      select jsonb_agg(jsonb_build_object('qator_id', z.qator_id, 'hajm', z.h)) into v_lines
        from (select x.qator_id, sum(x.hajm) as h from public.t2_usta_fakt_qoralama x
               where x.id = any(v_g.idlar) group by x.qator_id having sum(x.hajm) <> 0) z;
      if v_lines is null then
        update public.t2_usta_fakt_qoralama set holat = 'tasdiqlangan', qaror_actor_id = p_actor_id, qaror_vaqt = now()
         where id = any(v_g.idlar);
        v_n := v_n + coalesce(array_length(v_g.idlar, 1), 0);
        continue;
      end if;
      v_op := md5(p_operation_id::text || ':' || v_g.obyekt_id || ':' || v_g.sana)::uuid;
      v_r := public.t2_fakt_yoz_v2(v_g.obyekt_id, v_g.sana, v_lines, p_actor_id, v_op,
               'Usta qoralamasi tasdiqlandi' || coalesce(' — ' || nullif(left(p_izoh, 300), ''), ''), null, 'actor:' || p_actor_id);
      if coalesce((v_r->>'ok')::boolean, false) is not true then
        raise exception 'FAKT_YOZ_RAD: %', coalesce(v_r->>'code', v_r->>'error', 'noma''lum');
      end if;
      update public.t2_usta_fakt_qoralama set holat = 'tasdiqlangan', qaror_actor_id = p_actor_id, qaror_vaqt = now(),
             qaror_izoh = nullif(left(p_izoh, 500), ''), akt_id = nullif(v_r->>'akt_id', '')::bigint
       where id = any(v_g.idlar) and kompaniya_id = p_kompaniya_id and holat = 'qoralama';
      v_n := v_n + coalesce(array_length(v_g.idlar, 1), 0);
      v_aktlar := v_aktlar || jsonb_build_array(jsonb_build_object('obyekt_id', v_g.obyekt_id, 'sana', v_g.sana, 'akt_id', v_r->'akt_id'));
    end loop;
  end if;
  perform public.t2_audit_yoz(p_kompaniya_id, 'usta_fakt_qaror', 'fakt', null, format('qaror=%s qator=%s', p_qaror, v_n), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 'usta_fakt_qaror_v1', jsonb_build_object('ok', true, 'qaror', p_qaror, 'qator_soni', v_n, 'aktlar', v_aktlar));
  return jsonb_build_object('ok', true, 'qaror', p_qaror, 'qator_soni', v_n, 'aktlar', v_aktlar);
end $function$;

-- 3) Usta/brigadir: material zayavkasi (t2_erp_taminot, status 'submitted', izoh «Ustadan…» — ta'minot darhol ko'radi; qaror egasi: lead 2026-11-12).
create or replace function public.t2_usta_zayavka_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_item_text text, p_requested_qty numeric,
  p_unit text, p_required_date date, p_note text, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prev jsonb; v_id bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev || jsonb_build_object('takror', true); end if;
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  if not (public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'self.work.write')
       or public.t2_permission_allowed_v2(p_kompaniya_id, p_actor_id, 'procurement.write')) then
    raise exception 'PERMISSION_DENIED: self.work.write talab qilinadi' using errcode = '42501';
  end if;
  if nullif(btrim(p_item_text), '') is null or p_requested_qty is null or p_requested_qty <= 0 then
    return jsonb_build_object('ok', false, 'code', 'ZAYAVKA_NOTOGRI');
  end if;
  if not exists (select 1 from public.t2_obyekt o where o.id = p_obyekt_id and o.kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_NOT_FOUND');
  end if;
  insert into public.t2_erp_taminot (kompaniya_id, obyekt_id, item_text, requested_qty, unit, required_date, note, status, requested_by, operation_id)
  values (p_kompaniya_id, p_obyekt_id, left(btrim(p_item_text), 300), p_requested_qty, nullif(left(p_unit, 30), ''), p_required_date,
          left('Ustadan' || coalesce(': ' || nullif(btrim(p_note), ''), ''), 500), 'submitted', 'actor:' || p_actor_id, p_operation_id)
  returning id into v_id;
  perform public.t2_audit_yoz(p_kompaniya_id, 'usta_zayavka', 'taminot', null, format('zayavka=%s', v_id), 'actor:' || p_actor_id, null);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija)
  values (p_operation_id, p_actor_id, 'usta_zayavka_v1', jsonb_build_object('ok', true, 'id', v_id, 'holat', 'submitted'));
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'submitted');
end $function$;

revoke all on function public.t2_usta_fakt_qoralama_v1(bigint,bigint,bigint,date,jsonb,text,bigint,uuid) from public, anon, authenticated;
revoke all on function public.t2_usta_fakt_qaror_v1(bigint,bigint,bigint[],text,text,uuid) from public, anon, authenticated;
revoke all on function public.t2_usta_zayavka_v1(bigint,bigint,bigint,text,numeric,text,date,text,uuid) from public, anon, authenticated;
grant execute on function public.t2_usta_fakt_qoralama_v1(bigint,bigint,bigint,date,jsonb,text,bigint,uuid) to service_role;
grant execute on function public.t2_usta_fakt_qaror_v1(bigint,bigint,bigint[],text,text,uuid) to service_role;
grant execute on function public.t2_usta_zayavka_v1(bigint,bigint,bigint,text,numeric,text,date,text,uuid) to service_role;

comment on function public.t2_usta_fakt_qoralama_v1(bigint,bigint,bigint,date,jsonb,text,bigint,uuid) is
  'versiya: texnik — qatorning obyektga tegishliligini tekshiradi (exists), smeta versiyasiga bog''liq emas. Usta qoralama fakti (self.work.write).';
comment on function public.t2_usta_fakt_qaror_v1(bigint,bigint,bigint[],text,text,uuid) is
  'versiya: texnik — faqat qoralama qatorlar va mavjud t2_fakt_yoz_v2 orqali yozadi. Prorab/PTO qarori (fakt.write).';
comment on function public.t2_usta_zayavka_v1(bigint,bigint,bigint,text,numeric,text,date,text,uuid) is
  'versiya: texnik — smeta qatoriga tegmaydi. Usta material zayavkasi (t2_erp_taminot, submitted, «Ustadan»).';
