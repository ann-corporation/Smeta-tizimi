-- Acceptance: tizim xaritasi tugunlari orasida NULL yo'q; har tugunda id va tur bor. BEGIN … ROLLBACK (faqat o'qiydi).
begin;
do $acc$
declare v_su bigint; g jsonb; v_null int; v_modul int;
begin
  select a.foydalanuvchi_id into v_su from public.t2_azolik a where a.rol = 'superadmin' and a.holat = 'faol' limit 1;
  if v_su is null then raise notice 'superadmin yo''q — o''tkazib yuborildi'; return; end if;
  g := public.t2_tizim_xaritasi_v1(v_su, null);
  if (g->>'ok')::boolean is not true then raise exception 'xarita ok emas: %', g; end if;
  select count(*) into v_null from jsonb_array_elements(g->'tugunlar') e
   where jsonb_typeof(e) <> 'object' or e->>'id' is null or e->>'tur' is null;
  if v_null > 0 then raise exception 'NULL/bo''sh tugunlar: %', v_null; end if;
  -- har kompaniyada 7 modul (smeta, fakt, f2, nakopitelniy, sverka, ombor, agentlar)
  select count(*) into v_modul from jsonb_array_elements(g->'tugunlar') e where e->>'tur' = 'modul';
  if v_modul <> 7 * (g #>> '{korinish,kompaniya_soni}')::int then raise exception 'modul soni % (kutilgan 7×kompaniya)', v_modul; end if;
  -- kim bo'sh bo'lgan oxirgi amal: kim_nom JSON null, tugun saqlanadi
  if public._t2_tizim_kim_nom(null) is not null then raise exception 'kim_nom(null) null emas'; end if;
  raise notice 'tizim xaritasi null-tugun tuzatish: OK';
end
$acc$;
rollback;
