-- Rollback 20270116000001: langarlarni olib tashlaydi, paket RPC ni 20270111200000 tanasiga qaytaradi, yangi funksiyalarni o'chiradi.
do $y$
declare d text; s int; e int; f text;
begin
  foreach f in array array['public.t2_f2_qoralama_yangila_v1(bigint,bigint,bigint,integer,jsonb,uuid,text)', 'public.t2_akt_yarat_v2(bigint,date,jsonb,bigint,text,uuid,text)',
                           'public.t2_forma3_yarat_v1(bigint,bigint,bigint,bigint,date,date,bigint[],text,uuid)'] loop
    d := replace(pg_get_functiondef(f::regprocedure), E'\r\n', E'\n');
    loop
      s := position('  -- bitta_f2_qoidasi_20270116' in d);
      exit when s = 0;
      e := position(E'  end if;\n' in substr(d, s));
      d := substr(d, 1, s - 1) || substr(d, s + e + length(E'  end if;\n') - 1);
    end loop;
    execute d;
  end loop;
end $y$;

create or replace function public.t2_f2_oylik_paket_v1(p_kompaniya_id bigint, p_actor_id bigint, p_shartnoma_id bigint, p_oy date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_oy date; v_oy_oxiri date; v_ob bigint[]; v_res jsonb; v_sh jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if p_shartnoma_id is null or p_oy is null then return jsonb_build_object('ok', false, 'code', 'KESIM_KERAK'); end if;
  v_oy := date_trunc('month', p_oy)::date;
  v_oy_oxiri := (v_oy + interval '1 month')::date - 1;
  select jsonb_build_object('id', s.id, 'raqam', s.raqam, 'nom', s.nom) into v_sh
    from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id;
  if v_sh is null then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
  select coalesce(array_agg(o.obyekt_id order by o.obyekt_id), '{}') into v_ob
    from public._t2_shartnoma_obyektlari_v1(p_shartnoma_id) o
    join public.t2_obyekt ob on ob.id = o.obyekt_id and ob.kompaniya_id = p_kompaniya_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ob.id, 'nom', ob.nom,
           'fakt_soni', (select count(*) from public.t2_akt f
                          where f.obyekt_id = ob.id and f.tur = 'fakt' and f.holat <> 'bekor'
                            and coalesce(f.oy, f.sana) >= v_oy and coalesce(f.oy, f.sana) <= v_oy_oxiri),
           'm29', case when exists (select 1 from public.t2_m29_hujjat m where m.obyekt_id = ob.id and m.davr = v_oy and m.holat = 'bajarildi') then 'bajarildi' else 'yoq' end,
           'aktlar', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'raqam', a.raqam, 'holat', a.holat, 'hujjat_jami', a.hujjat_jami) order by a.id)
                                 from public.t2_akt a where a.obyekt_id = ob.id and a.tur = 'f2' and a.oy >= v_oy and a.oy <= v_oy_oxiri), '[]'::jsonb)
         ) order by ob.nom, ob.id), '[]'::jsonb)
    into v_res from public.t2_obyekt ob where ob.id = any(v_ob);
  return jsonb_build_object('ok', true, 'oy', to_char(v_oy, 'YYYY-MM'), 'shartnoma', v_sh, 'obyektlar', v_res);
end $fn$;

drop function if exists public.t2_f2_oy_takror_v1(bigint, bigint, bigint[], date);
drop function if exists public._t2_f2_qator_kesish_v1(bigint, date, jsonb, bigint);
drop function if exists public._t2_f2_oy_takror_v1(bigint[], date, bigint[]);
drop function if exists public._t2_f2_taxminiy_v1(text, text);
