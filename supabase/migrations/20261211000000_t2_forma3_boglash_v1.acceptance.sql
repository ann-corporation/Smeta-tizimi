-- acceptance 20261211000000_t2_forma3_boglash_v1 — BEGIN..ROLLBACK ichida migratsiyadan keyin ishga tushiriladi.
-- versiya: texnik
do $$
declare v_akt bigint; v_obj bigint; v_oy date; v_act bigint; r jsonb; r2 jsonb; v_f3 bigint;
begin
  select a.id, a.obyekt_id, a.oy into v_akt, v_obj, v_oy
    from public.t2_akt a where a.tur='f2' and a.holat='tasdiqlangan' and a.forma3_id is null
   order by a.id limit 1;
  if v_akt is null then raise notice 'SKIP: tasdiqlangan F2 yo''q'; return; end if;
  select z.foydalanuvchi_id into v_act from public.t2_azolik z join public.t2_akt a on a.kompaniya_id = z.kompaniya_id
   where a.id = v_akt and z.holat='faol' and z.rol in ('boss','superadmin','rahbar','bugalter') limit 1;
  if v_act is null then raise notice 'SKIP: ruxsatli aktor yo''q'; return; end if;

  r := public.t2_forma3_yarat_v1(v_act, null, v_obj, null, v_oy, v_oy, array[v_akt], 'ACC-1', gen_random_uuid());
  if not coalesce((r->>'ok')::boolean,false) then raise exception 'FAIL yarat: %', r; end if;
  v_f3 := (r->>'forma3_id')::bigint;
  if (select forma3_id from public.t2_akt where id = v_akt) is distinct from v_f3 then raise exception 'FAIL akt.forma3_id'; end if;
  if (select count(*) from public.t2_forma3_akt where forma3_id = v_f3) <> 1 then raise exception 'FAIL link'; end if;

  r2 := public.t2_forma3_yarat_v1(v_act, null, v_obj, null, v_oy, v_oy, array[v_akt], 'ACC-2', gen_random_uuid());
  if (r2->>'code') is distinct from 'FORMA3_AKT_BAND' then raise exception 'FAIL ikki marta: %', r2; end if;

  begin
    update public.t2_akt set izoh = coalesce(izoh,'') || 'x' where id = v_akt;
    raise exception 'FAIL guard: tasdiqlangan akt o''zgardi';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform set_config('t2.forma3.boglash','1',true);
    update public.t2_akt set forma3_id = null where id = v_akt;
    raise exception 'FAIL guard: forma3_id qayta o''zgardi';
  exception when sqlstate '55000' then perform set_config('t2.forma3.boglash','',true);
  end;
  raise notice 'PASS forma3 boglash: akt % → F3 % (%)', v_akt, v_f3, r->>'bajarilgan_f2_summa';
end $$;
