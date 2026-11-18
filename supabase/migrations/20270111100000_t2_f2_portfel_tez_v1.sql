-- T2-F2-PORTFEL-TEZ-001 - F2 reestri / В«Shartnoma bo'yicha portfelВ»: BITTA tez so'rov (shartnoma -> obyektlar -> aktlar -> summalar).
-- Muammo (egasi, 5-marta): portfel ochilganda brauzer HAR obyektning to'liq smetasini + barcha F2 tafsilotini o'qib, summani o'zi qayta hisoblardi
-- (~5 daqiqa) va natija serverdagi yagona yadrodan farq qilardi (hujjat_jami zaxirasi, qator topilmasa В«noma'lumВ», alohida kod yo'li).
-- Endi: summa FAQAT yadrodan (`_t2_summa_paket_v1`), brauzerda hisob YO'Q.
--   * t2_f2_portfel_v1       - ro'yxat + obyekt/shartnoma jamilari (tayyor hisob `_t2_summa_paket_kesh_v1`, indeksli), sahifalangan, ~ms.
--   * t2_f2_portfel_summa_v1 - bir necha aktning o'z summa paketi (yadro, 'aktlar' o'lchovi); mijoz 3-5 aktdan bo'lib parallel so'raydi.
-- Ikkalasi STABLE (GET /api/sb orqali), a'zolik + f2.read. Yangi jadval yo'q, yozuv yo'q. Bekor qilingan akt hech bir jamiga kirmaydi.
-- Jami = obyekt paketlari yig'indisi (`_t2_summa_paket_jam_v1`); har akt paketlari yig'indisi obyekt paketiga AYNAN teng
-- (supabase/tests/f2_portfel_tez_contract.sql shuni tekshiradi).
create or replace function public.t2_f2_portfel_v1(
  p_kompaniya_id bigint, p_actor_id bigint,
  p_shartnoma_id bigint default null, p_obyekt_id bigint default null,
  p_oy_dan date default null, p_oy_gacha date default null,
  p_holat text default null, p_limit integer default 200, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare
  v_ob bigint[]; v_sh jsonb; v_lim int; v_off int;
  v_f2 jsonb; v_f2q jsonb; j_f2 jsonb; j_f2q jsonb; j_h jsonb;
  v_obyektlar jsonb; v_aktlar jsonb; v_soni jsonb; v_jami int;
  v_dan date; v_gacha date;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if p_shartnoma_id is null and p_obyekt_id is null then return jsonb_build_object('ok', false, 'code', 'KESIM_KERAK'); end if;
  if p_holat is not null and p_holat not in ('tasdiqlangan', 'qoralama', 'bekor') then return jsonb_build_object('ok', false, 'code', 'HOLAT_NOTOGRI'); end if;
  v_lim := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_off := greatest(coalesce(p_offset, 0), 0);
  v_dan := case when p_oy_dan is null then null else date_trunc('month', p_oy_dan)::date end;
  v_gacha := case when p_oy_gacha is null then null else (date_trunc('month', p_oy_gacha) + interval '1 month')::date - 1 end;

  if p_shartnoma_id is not null then
    select jsonb_build_object('id', s.id, 'raqam', s.raqam, 'nom', s.nom, 'jami_nds_bilan', s.jami_nds_bilan) into v_sh
      from public.t2_shartnoma s where s.id = p_shartnoma_id and s.kompaniya_id = p_kompaniya_id;
    if v_sh is null then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_NOT_FOUND'); end if;
    select coalesce(array_agg(o.obyekt_id order by o.obyekt_id), '{}') into v_ob
      from public._t2_shartnoma_obyektlari_v1(p_shartnoma_id) o
      join public.t2_obyekt ob on ob.id = o.obyekt_id and ob.kompaniya_id = p_kompaniya_id
     where p_obyekt_id is null or o.obyekt_id = p_obyekt_id;
  else
    select coalesce(array_agg(ob.id), '{}') into v_ob from public.t2_obyekt ob where ob.id = p_obyekt_id and ob.kompaniya_id = p_kompaniya_id;
    if cardinality(v_ob) = 0 then return jsonb_build_object('ok', false, 'code', 'OBYEKT_SCOPE_MISMATCH'); end if;
  end if;

  -- Obyekt paketlari: tayyor hisob (kesh) yoki jonli yadro - bitta yo'l (rahbar paneli bilan bir xil).
  select coalesce(jsonb_object_agg(p.obyekt_id::text, p.paket), '{}'::jsonb) into v_f2  from public._t2_summa_paket_kesh_v1(v_ob, 'f2') p;
  select coalesce(jsonb_object_agg(p.obyekt_id::text, p.paket), '{}'::jsonb) into v_f2q from public._t2_summa_paket_kesh_v1(v_ob, 'f2_qoralama') p;
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2  from jsonb_each(v_f2);
  select public._t2_summa_paket_jam_v1(coalesce(jsonb_agg(value), '[]'::jsonb)) into j_f2q from jsonb_each(v_f2q);
  select public._t2_summa_paket_jam_v1(coalesce((select jsonb_agg(z.p) from (select j_f2 as p union all select j_f2q) z where jsonb_typeof(z.p) = 'object'), '[]'::jsonb)) into j_h;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ob.id, 'nom', ob.nom,
           'tasdiqlangan_soni', coalesce(c.t, 0), 'qoralama_soni', coalesce(c.q, 0), 'bekor_soni', coalesce(c.b, 0),
           'f2', v_f2 -> (ob.id::text), 'f2_qoralama', v_f2q -> (ob.id::text)) order by ob.nom, ob.id), '[]'::jsonb)
    into v_obyektlar
    from public.t2_obyekt ob
    left join (select a.obyekt_id,
                      count(*) filter (where a.holat = 'tasdiqlangan') t, count(*) filter (where a.holat = 'qoralama') q, count(*) filter (where a.holat = 'bekor') b
                 from public.t2_akt a where a.tur = 'f2' and a.obyekt_id = any(v_ob) group by a.obyekt_id) c on c.obyekt_id = ob.id
   where ob.id = any(v_ob);

  select jsonb_build_object('tasdiqlangan', count(*) filter (where a.holat = 'tasdiqlangan'), 'qoralama', count(*) filter (where a.holat = 'qoralama'),
                            'bekor', count(*) filter (where a.holat = 'bekor'), 'jami', count(*))
    into v_soni from public.t2_akt a where a.tur = 'f2' and a.obyekt_id = any(v_ob);

  select count(*) into v_jami from public.t2_akt a
   where a.tur = 'f2' and a.obyekt_id = any(v_ob) and (p_holat is null or a.holat = p_holat)
     and (v_dan is null or a.oy >= v_dan) and (v_gacha is null or a.oy <= v_gacha);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'obyekt_id', x.obyekt_id, 'obyekt_nom', x.obyekt_nom, 'raqam', x.raqam, 'oy', x.oy, 'sana', x.sana,
           'holat', x.holat, 'versiya', x.versiya, 'lifecycle_status', x.lifecycle_status, 'hujjat_jami', x.hujjat_jami, 'forma3_id', x.forma3_id, 'manba', x.manba)
         order by x.obyekt_nom, x.obyekt_id, x.oy, x.raqam_tartib, x.id), '[]'::jsonb)
    into v_aktlar
    from (select a.id, a.obyekt_id, ob.nom as obyekt_nom, a.raqam, a.oy, a.sana, a.holat, a.versiya, a.lifecycle_status, a.hujjat_jami, a.forma3_id, a.manba,
                 coalesce(nullif(regexp_replace(coalesce(a.raqam, ''), '\D', '', 'g'), '')::numeric, 0) as raqam_tartib
            from public.t2_akt a join public.t2_obyekt ob on ob.id = a.obyekt_id
           where a.tur = 'f2' and a.obyekt_id = any(v_ob) and (p_holat is null or a.holat = p_holat)
             and (v_dan is null or a.oy >= v_dan) and (v_gacha is null or a.oy <= v_gacha)
           order by ob.nom, a.obyekt_id, a.oy, raqam_tartib, a.id
           limit v_lim offset v_off) x;

  return jsonb_build_object('ok', true, 'generated_at', now(), 'shartnoma', v_sh,
    'jami', jsonb_build_object('tasdiqlangan', j_f2, 'qoralama', j_f2q, 'hammasi', j_h),
    'soni', v_soni, 'obyektlar', v_obyektlar, 'aktlar', v_aktlar,
    'sahifa', jsonb_build_object('limit', v_lim, 'offset', v_off, 'jami', v_jami, 'yana_bor', v_off + v_lim < v_jami));
end $fn$;

-- Aktlarning O'Z summa paketi (yadro, 'aktlar' o'lchovi): akt o'z podvali bilan, bekor qilingan akt hisoblanmaydi.
-- Bir so'rovga <= 12 akt; mijoz 3-5 aktdan parallel so'raydi (yadro chaqiruvi akt boshiga ~0,2-0,4 s).
create or replace function public.t2_f2_portfel_summa_v1(p_kompaniya_id bigint, p_actor_id bigint, p_akt_ids bigint[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $fn$
declare v_res jsonb;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'f2.read');
  if p_akt_ids is null or cardinality(p_akt_ids) = 0 then return jsonb_build_object('ok', true, 'aktlar', '[]'::jsonb); end if;
  if cardinality(p_akt_ids) > 12 then return jsonb_build_object('ok', false, 'code', 'AKT_KOP'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'obyekt_id', a.obyekt_id, 'holat', a.holat, 'paket', p.paket) order by a.id), '[]'::jsonb)
    into v_res
    from public.t2_akt a
    cross join lateral (select s.paket from public._t2_summa_paket_v1(array[a.obyekt_id], 'aktlar', array[a.id]) s limit 1) p
   where a.id = any(p_akt_ids) and a.kompaniya_id = p_kompaniya_id and a.tur = 'f2' and a.holat <> 'bekor';
  return jsonb_build_object('ok', true, 'aktlar', v_res);
end $fn$;

revoke all on function public.t2_f2_portfel_v1(bigint, bigint, bigint, bigint, date, date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.t2_f2_portfel_v1(bigint, bigint, bigint, bigint, date, date, text, integer, integer) to service_role;
revoke all on function public.t2_f2_portfel_summa_v1(bigint, bigint, bigint[]) from public, anon, authenticated;
grant execute on function public.t2_f2_portfel_summa_v1(bigint, bigint, bigint[]) to service_role;
