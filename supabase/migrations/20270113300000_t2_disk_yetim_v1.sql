-- Disk A2: qayta urinish navbati. Navbat = HOLATDAN hosil bo'ladi: saqlangan (stored) hujjat t2_hm_versiya ga bog'lanmagan bo'lsa (yozuv xatosi/uzilish),
-- shu funksiya uni A1 ning yagona yozuvchisi (_t2_disk_tizim_yoz_ich_v1) orqali Diskka ulaydi. Idempotent: ulangan hujjatga tegmaydi.
-- Faqat service_role (kunlik cron: /api/hujjat-maydoni-tozala). Xato bergan hujjat navbatda qoladi (keyingi ishga tushishda qayta uriladi), jim yutilmaydi:
-- natijada 'xato' soni va birinchi xato kodlari qaytadi (cron javobi va jurnalga chiqadi).
create or replace function public.t2_disk_yetim_ishla_v1(p_limit integer default 50, p_kutish_daqiqa integer default 2)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; x jsonb; v_kor integer := 0; v_yoz integer := 0; v_xato integer := 0; v_kod jsonb := '[]'::jsonb;
begin
  for r in select d.id, d.kompaniya_id from public.t2_document_registry d
            where d.canonical_storage_status = 'stored'
              and coalesce(d.finalized_at, d.created_at, now()) < now() - make_interval(mins => greatest(coalesce(p_kutish_daqiqa, 2), 0))
              and not exists (select 1 from public.t2_hm_versiya v where v.registry_id = d.id)
              and not exists (select 1 from public.t2_hm_versiya v where v.sha256 = d.sha256 and v.tashqi_kalit and d.sha256 ~ '^[0-9a-f]{64}$')
            order by d.id limit least(greatest(coalesce(p_limit, 50), 1), 500) loop
    v_kor := v_kor + 1;
    begin
      x := public._t2_disk_tizim_yoz_ich_v1(0, r.kompaniya_id, r.id, null, null, null, null, null);
      if coalesce(x->>'ok', 'false') = 'true' then v_yoz := v_yoz + 1;
      else v_xato := v_xato + 1; if jsonb_array_length(v_kod) < 5 then v_kod := v_kod || jsonb_build_array(jsonb_build_object('id', r.id, 'kod', x->>'code')); end if; end if;
    exception when others then
      v_xato := v_xato + 1; if jsonb_array_length(v_kod) < 5 then v_kod := v_kod || jsonb_build_array(jsonb_build_object('id', r.id, 'kod', sqlstate)); end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'korildi', v_kor, 'yozildi', v_yoz, 'xato', v_xato, 'xatolar', v_kod);
end $$;
revoke all on function public.t2_disk_yetim_ishla_v1(integer, integer) from public, anon, authenticated;
grant execute on function public.t2_disk_yetim_ishla_v1(integer, integer) to service_role;