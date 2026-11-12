-- HOTFIX: 20261212500000 `_t2_tomon_rol_ok` ni qayta yozganda 'murojaat' amali tushib qolgan —
-- natijada t2_tomon_murojaat_*_v1 RPC'lari hech bir rol uchun ishlamay qolgan. Tiklanadi (+ inspektor, loyihachi).
create or replace function public._t2_tomon_rol_ok(p_rol text, p_amal text) returns boolean
language sql immutable as $function$
  select case p_amal
    when 'boshqarish' then p_rol in ('superadmin','admin','boss','rahbar','director')
    when 'taqdim'     then p_rol in ('superadmin','admin','boss','rahbar','director','pto')
    when 'qaror'      then p_rol in ('superadmin','admin','boss','rahbar','director','buyurtmachi','inspektor')
    when 'murojaat'   then p_rol in ('superadmin','admin','boss','rahbar','director','pto','prorab','buyurtmachi','inspektor','loyihachi')
    when 'izoh'       then p_rol not in ('kuzatuvchi')
    when 'korish'     then true
    else false end
$function$;
comment on function public._t2_tomon_rol_ok(text, text) is 'versiya: murojaat_tiklash_v1';