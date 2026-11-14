-- T2-BUXGALTERIYA-004 - Buxgalteriya 3-bosqich (ADR docs/architecture/BUXGALTERIYA_1C_ORNIGA.md §10). 20261216200000/210000 ustiga.
--   1) t2_bux_sverka_v1 / t2_bux_sverka_tomonlar_v1 - IKKI KOMPANIYA o'rtasida akt-sverka: ikkala daftardan, qator-ma'qator farq (faqat_men / faqat_ular / summa_farq / sana_farq).
--      Har tomon faqat O'Z daftarini ko'radi; ikkinchi tomon uchun faqat solishtirish natijasi (sana + summa) qaytadi, hisob/analitika/hujjat nomi YO'Q.
--      Imzolash: akt Excel (hujjat-dvigatel) arxivga saqlanadi va MAVJUD taqdim -> qaror zanjiri orqali (resurs 'hujjat') ikkinchi tomonga yuboriladi.
--   2) MEHNAT: BIR FAKT - BIR MANBA. Ish haqi (t2_hr_oylik, tasdiqlangan) provodka beradi: hisoblash + ushlanmalar (stavkalar t2_hr_sozlama da, T).
--      Shtatdagi usta naryadi (t2_naryad -> t2_xarajat ЧЕЛ) ish haqining «donabay» qismi: tasdiqlangan oylik bor bo'lsa FAQAT oylik orqali yoziladi;
--      shtatda bo'lmagan usta naryadi - pudrat xarajati (Dt 2010 / Kt 6010, kontragent = usta). Subpudrat akti xarid.ish orqali (xarajat.sub o'chirilgan).
-- Hammasi security definer, a'zolik + accounting.* tekshiruvi, faqat service_role. T - tekshirilsin (buxgalter).

-- Qoida shablonlari (pudratchi): ushlanmalar va naryad-pudrat. Mavjud kompaniyalarga avto-provodka paytida ko'chiriladi (_t2_bux_qoida_kafolat).
insert into public.t2_bux_shablon(shablon, kalit, dt_kod, kt_kod, qiymat, izoh)
values ('pudratchi', 'ish_haqi.ndfl', '6710', '6410', null, 'Ish haqidan ushlangan daromad solig''i (NDFL). Hisob T - tekshirilsin'),
       ('pudratchi', 'ish_haqi.inps', '6710', '6410', null, 'Ish haqidan ushlangan INPS (xodim ulushi). Hisob T - tekshirilsin; ish beruvchi ulushi hozir yo''q'),
       ('pudratchi', 'xarajat.naryad_pudrat', '2010', '6010', null, 'Shtatda bo''lmagan usta naryadi - pudrat xarajati (kontragent = usta). T')
on conflict (shablon, kalit) do nothing;

-- Provodka manba turlari (sinxron shu ro'yxat bo'yicha deltani hisoblaydi) - bitta joyda
create or replace function public._t2_bux_turlar() returns text[]
language sql immutable as $$ select array['forma3', 'tolov', 'ombor_kirim', 'qarz_yetkazish', 'qarz_ish', 'qarz_tolov', 'qarz_boshlangich', 'xarajat', 'taqdim', 'ish_haqi']::text[] $$;

-- Bo'lishi kerak to'plami (v3) = v2 + MEHNAT qoidalari + ish haqi
create or replace function public._t2_bux_kerak_v3(p_kompaniya_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_base jsonb; v_pud jsonb := '[]'::jsonb; v_ish jsonb := '[]'::jsonb; v_oylik_ids bigint[] := array[]::bigint[]; v_pud_ids bigint[] := array[]::bigint[];
  v_h_dt text; v_h_kt text; v_n_dt text; v_n_kt text; v_i_dt text; v_i_kt text; v_p_dt text; v_p_kt text;
begin
  v_base := public._t2_bux_kerak_v2(p_kompaniya_id);
  select m.dt_kod, m.kt_kod into v_h_dt, v_h_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.hisoblash' and m.dt_kod is not null and m.kt_kod is not null;
  select m.dt_kod, m.kt_kod into v_n_dt, v_n_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.ndfl' and m.dt_kod is not null and m.kt_kod is not null;
  select m.dt_kod, m.kt_kod into v_i_dt, v_i_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.inps' and m.dt_kod is not null and m.kt_kod is not null;
  select m.dt_kod, m.kt_kod into v_p_dt, v_p_kt from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'xarajat.naryad_pudrat' and m.dt_kod is not null and m.kt_kod is not null;
  -- ISH HAQI: tasdiqlangan oylik (HR kanoni t2_hr_oylik_buxgalteriya_v1 bilan bir xil to'plam), oy oxiri sanasi, obyektsiz (T: obyektga taqsimlash keyin)
  if v_h_dt is not null then
    select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_ish from (
      select 'ish_haqi'::text as manba_tur, y.id as manba_id, 'asosiy'::text as qism, (y.oy + interval '1 month' - interval '1 day')::date as sana, v_h_dt as dt_kod, v_h_kt as kt_kod,
             y.hisoblangan as summa, null::bigint as kontragent_id, null::bigint as shartnoma_id, null::bigint as obyekt_id
        from public.t2_hr_oylik y where y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.hisoblangan is not null and y.hisoblangan <> 0
      union all
      select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_n_dt, v_n_kt, y.ndfl, null, null, null
        from public.t2_hr_oylik y where v_n_dt is not null and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.ndfl is not null and y.ndfl <> 0
      union all
      select 'ish_haqi', y.id, 'asosiy', (y.oy + interval '1 month' - interval '1 day')::date, v_i_dt, v_i_kt, y.inps, null, null, null
        from public.t2_hr_oylik y where v_i_dt is not null and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.inps is not null and y.inps <> 0
    ) q;
  end if;
  -- NARYAD: bir xarajat qatori bitta joyda. Shtatdagi usta + shu oyga tasdiqlangan oylik + ish haqi qoidasi yoqilgan -> FAQAT oylik orqali (xarajat manbasidan chiqariladi).
  -- Shtatda bo'lmagan usta + naryad-pudrat qoidasi yoqilgan -> pudrat xarajati (Kt 6010, kontragent = usta). Boshqa hollarda xarajat.chel ishlayveradi: xarajat hech qachon yo'qolmaydi.
  if public._t2_hr_naryad_bor_v1() then
    if v_h_dt is not null then
      select coalesce(array_agg(x.id), array[]::bigint[]) into v_oylik_ids
        from public.t2_xarajat x
        join public.t2_naryad n on n.kompaniya_id = x.kompaniya_id and x.hujjat_ref = 'naryad ' || chr(8470) || n.raqam
       where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.kat = U&'\0427\0415\041B' and n.holat <> 'bekor' and n.usta_foydalanuvchi_id is not null
         and exists (select 1 from public.t2_kadr_mustaqil km
                       join public.t2_hr_xodim hx on hx.kadr_id = km.id
                       join public.t2_hr_oylik y on y.kadr_id = km.id and y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.oy = date_trunc('month', x.sana)::date
                      where km.kompaniya_id = p_kompaniya_id and km.foydalanuvchi_id = n.usta_foydalanuvchi_id and coalesce(km.holat, 'faol') <> 'bekor');
    end if;
    if v_p_dt is not null then
      select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_pud from (
        select 'xarajat'::text as manba_tur, x.id as manba_id, 'asosiy'::text as qism, x.sana, v_p_dt as dt_kod, v_p_kt as kt_kod, x.summa,
               n.usta_kontragent_id as kontragent_id, x.shartnoma_id, x.obyekt_id
          from public.t2_xarajat x
          join public.t2_naryad n on n.kompaniya_id = x.kompaniya_id and x.hujjat_ref = 'naryad ' || chr(8470) || n.raqam
         where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.kat = U&'\0427\0415\041B' and n.holat <> 'bekor' and n.usta_foydalanuvchi_id is not null
           and x.summa is not null and x.summa <> 0
           and not exists (select 1 from public.t2_kadr_mustaqil km join public.t2_hr_xodim hx on hx.kadr_id = km.id
                            where km.kompaniya_id = p_kompaniya_id and km.foydalanuvchi_id = n.usta_foydalanuvchi_id and coalesce(km.holat, 'faol') <> 'bekor')
      ) q;
      select coalesce(array_agg((e ->> 'manba_id')::bigint), array[]::bigint[]) into v_pud_ids from jsonb_array_elements(v_pud) e;
    end if;
  end if;
  return (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v_base) e
           where not (e ->> 'manba_tur' = 'xarajat' and (e ->> 'manba_id')::bigint = any (v_oylik_ids || v_pud_ids)))
         || v_pud || v_ish;
end $$;

-- ===== 1. AKT SVERKI (ikki kompaniya) =====
-- ICHKI: bitta kompaniya daftarida kontragent bo'yicha HUJJAT kesimida (Dt - Kt) hisob-kitob hisoblari (4010/4310/6010/6310; T) harakati
create or replace function public._t2_bux_sverka_hujjatlar(p_kompaniya_id bigint, p_kontragent_id bigint, p_dan date, p_gacha date)
returns table(manba_tur text, manba_id bigint, sana date, v numeric, hujjat text)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.manba_tur, g.manba_id, g.sana, g.v, public._t2_bux_hujjat_nomi(p_kompaniya_id, g.manba_tur, g.manba_id)
    from (
      select p.manba_tur, p.manba_id, min(p.sana) as sana,
             sum((case when p.dt_kod in ('4010', '4310', '6010', '6310') then p.summa else 0 end) - (case when p.kt_kod in ('4010', '4310', '6010', '6310') then p.summa else 0 end)) as v
        from public.t2_bux_provodka p
       where p.kompaniya_id = p_kompaniya_id and p.kontragent_id = p_kontragent_id and p.sana >= p_dan and p.sana <= p_gacha
         and (p.dt_kod in ('4010', '4310', '6010', '6310') or p.kt_kod in ('4010', '4310', '6010', '6310'))
       group by p.manba_tur, p.manba_id, case when p.manba_id is null then p.id end) g
   where g.v <> 0
$$;

create or replace function public._t2_bux_sverka_ochilish(p_kompaniya_id bigint, p_kontragent_id bigint, p_dan date) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum((case when p.dt_kod in ('4010', '4310', '6010', '6310') then p.summa else 0 end) - (case when p.kt_kod in ('4010', '4310', '6010', '6310') then p.summa else 0 end)), 0)
    from public.t2_bux_provodka p
   where p.kompaniya_id = p_kompaniya_id and p.kontragent_id = p_kontragent_id and p.sana < p_dan
$$;

-- O'QISH: aloqa o'rnatilgan (faol) tomonlar ro'yxati (akt-sverka juftini tanlash uchun)
create or replace function public.t2_bux_sverka_tomonlar_v1(p_kompaniya_id bigint, p_actor_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  return jsonb_build_object('ok', true, 'tomonlar', (
    select coalesce(jsonb_agg(jsonb_build_object('kompaniya_id', z.kid, 'nom', z.nom) order by z.nom), '[]'::jsonb)
      from (select distinct c.id as kid, coalesce(nullif(c.toliq_nom, ''), c.nom) as nom
              from public.t2_tomon_aloqa a
              join public.t2_kompaniya c on c.id = case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_kompaniya_id else a.taklif_kompaniya_id end
             where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id) and c.id <> p_kompaniya_id) z));
end $$;

-- O'QISH: IKKI DAFTARDAN akt-sverka. Chaqiruvchi faqat o'z daftarini ko'radi; ikkinchi tomon qatorlari faqat sana + summa (hisob, analitika, hujjat nomi yo'q).
-- Juftlash (T): 1) bir xil summa (sana farqi 'sana_farq'); 2) qolganlari bir oy ichida, bir ishorada tartib bo'yicha ('summa_farq', taxminiy); 3) qolgani faqat bir tomonda.
create or replace function public.t2_bux_sverka_v1(p_kompaniya_id bigint, p_actor_id bigint, p_qarshi_kompaniya_id bigint, p_dan date default null, p_gacha date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_dan date := coalesce(p_dan, date_trunc('year', current_date)::date); v_gacha date := coalesce(p_gacha, current_date);
  v_inn_a text; v_inn_b text; k_a bigint; k_b bigint; v_q jsonb; v_oa numeric; v_ob numeric; v_ya numeric; v_yb numeric; v_ogoh text[] := array[]::text[];
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  if p_qarshi_kompaniya_id is null or p_qarshi_kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'QARSHI_TOMON_KERAK'); end if;
  if not exists (select 1 from public.t2_tomon_aloqa a where a.holat = 'faol'
                   and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = p_qarshi_kompaniya_id) or (a.taklif_kompaniya_id = p_qarshi_kompaniya_id and a.qabul_kompaniya_id = p_kompaniya_id))) then
    return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'xabar', 'Bu kompaniya bilan faol aloqa yo''q.');
  end if;
  select nullif(btrim(c.inn), '') into v_inn_a from public.t2_kompaniya c where c.id = p_kompaniya_id;
  select nullif(btrim(c.inn), '') into v_inn_b from public.t2_kompaniya c where c.id = p_qarshi_kompaniya_id;
  select k.id into k_a from public.t2_kontragent k where k.kompaniya_id = p_kompaniya_id and v_inn_b is not null and k.inn = v_inn_b order by k.id limit 1;
  select k.id into k_b from public.t2_kontragent k where k.kompaniya_id = p_qarshi_kompaniya_id and v_inn_a is not null and k.inn = v_inn_a order by k.id limit 1;
  if k_a is null then v_ogoh := v_ogoh || 'MENING_KONTRAGENTIM_YOQ'::text; end if;
  if k_b is null then v_ogoh := v_ogoh || 'QARSHI_TOMONDA_KONTRAGENT_YOQ'::text; end if;
  with a0 as (select row_number() over (order by sana, manba_tur, manba_id nulls last) as ai, * from public._t2_bux_sverka_hujjatlar(p_kompaniya_id, k_a, v_dan, v_gacha)),
       b0 as (select row_number() over (order by sana, manba_tur, manba_id nulls last) as bi, manba_tur, manba_id, sana, -v as v from public._t2_bux_sverka_hujjatlar(p_qarshi_kompaniya_id, k_b, v_dan, v_gacha)),
       a1 as (select a0.*, row_number() over (partition by v order by ai) as rn from a0),
       b1 as (select b0.*, row_number() over (partition by v order by bi) as rn from b0),
       m1 as (select a1.ai, b1.bi from a1 join b1 on a1.v = b1.v and a1.rn = b1.rn),
       a2 as (select a0.*, row_number() over (partition by sign(a0.v), date_trunc('month', a0.sana) order by a0.ai) as r from a0 where a0.ai not in (select ai from m1)),
       b2 as (select b0.*, row_number() over (partition by sign(b0.v), date_trunc('month', b0.sana) order by b0.bi) as r from b0 where b0.bi not in (select bi from m1)),
       m2 as (select a2.ai, b2.bi from a2 join b2 on sign(a2.v) = sign(b2.v) and date_trunc('month', a2.sana) = date_trunc('month', b2.sana) and a2.r = b2.r),
       l as (
         select case when a0.sana = b0.sana then 'mos' else 'sana_farq' end as holat, a0.hujjat as a_hujjat, a0.manba_tur as a_manba_tur, a0.manba_id as a_manba_id, a0.sana as a_sana, a0.v as a_summa,
                b0.sana as b_sana, b0.v as b_summa
           from m1 join a0 on a0.ai = m1.ai join b0 on b0.bi = m1.bi
         union all
         select 'summa_farq', a0.hujjat, a0.manba_tur, a0.manba_id, a0.sana, a0.v, b0.sana, b0.v from m2 join a0 on a0.ai = m2.ai join b0 on b0.bi = m2.bi
         union all
         select 'faqat_men', a0.hujjat, a0.manba_tur, a0.manba_id, a0.sana, a0.v, null, null from a0 where a0.ai not in (select ai from m1 union select ai from m2)
         union all
         select 'faqat_ular', null, null, null, null, null, b0.sana, b0.v from b0 where b0.bi not in (select bi from m1 union select bi from m2)
       )
  select coalesce(jsonb_agg(jsonb_build_object('holat', l.holat, 'hujjat', l.a_hujjat, 'manba_tur', l.a_manba_tur, 'manba_id', l.a_manba_id, 'a_sana', l.a_sana, 'a_summa', l.a_summa,
                                               'b_sana', l.b_sana, 'b_summa', l.b_summa, 'farq', coalesce(l.a_summa, 0) - coalesce(l.b_summa, 0))
                           order by coalesce(l.a_sana, l.b_sana), l.holat), '[]'::jsonb)
    into v_q from l;
  v_oa := case when k_a is null then 0 else public._t2_bux_sverka_ochilish(p_kompaniya_id, k_a, v_dan) end;
  v_ob := case when k_b is null then 0 else -public._t2_bux_sverka_ochilish(p_qarshi_kompaniya_id, k_b, v_dan) end;
  v_ya := v_oa + coalesce((select sum(v) from public._t2_bux_sverka_hujjatlar(p_kompaniya_id, k_a, v_dan, v_gacha)), 0);
  v_yb := v_ob + coalesce((select sum(-v) from public._t2_bux_sverka_hujjatlar(p_qarshi_kompaniya_id, k_b, v_dan, v_gacha)), 0);
  return jsonb_build_object('ok', true, 'dan', v_dan, 'gacha', v_gacha, 'qarshi_kompaniya_id', p_qarshi_kompaniya_id,
    'qarshi_nom', (select coalesce(nullif(c.toliq_nom, ''), c.nom) from public.t2_kompaniya c where c.id = p_qarshi_kompaniya_id),
    'ogohlantirish', to_jsonb(v_ogoh), 'ochilish_men', v_oa, 'ochilish_ular', v_ob, 'yopilish_men', v_ya, 'yopilish_ular', v_yb, 'farq', v_ya - v_yb,
    'farqli_soni', (select count(*) from jsonb_array_elements(v_q) e where e ->> 'holat' <> 'mos'), 'qatorlar', v_q);
end $$;

-- ===== 2. Sinxron: manba turlari va v3 to'plam (avto-provodka va davr yopish shu orqali) =====
create or replace function public.t2_bux_avto_provodka_v1(p_actor_id bigint, p_kompaniya_id bigint, p_dry boolean, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_sync jsonb; v_res jsonb; v_f3 bigint; v_asos bigint; v_kat bigint; v_chel bigint;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  if not coalesce(p_dry, false) then
    select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
    if found then return v_prev; end if;
  end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, case when coalesce(p_dry, false) then 'accounting.read' else 'accounting.write' end);
  if not exists (select 1 from public.t2_bux_hisob where kompaniya_id = p_kompaniya_id) then
    return jsonb_build_object('ok', false, 'code', 'BOSHLANMAGAN', 'xabar', 'Avval hisoblar rejasini yarating (Boshlash).');
  end if;
  if not coalesce(p_dry, false) then
    perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'ish_haqi.hisoblash');
    perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'ish_haqi.ndfl');
    perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'ish_haqi.inps');
    perform public._t2_bux_qoida_kafolat(p_kompaniya_id, 'xarajat.naryad_pudrat');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('t2_bux_sync:' || p_kompaniya_id, 0));
  v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id,
    public._t2_bux_turlar(), public._t2_bux_kerak_v3(p_kompaniya_id), coalesce(p_dry, false));
  select count(*) into v_f3 from public.t2_forma3 f where f.kompaniya_id = p_kompaniya_id and f.holat in ('tayyor', 'imzolangan') and f.sotuv_summa is null;
  select count(*) into v_asos from public.t2_qarz_asos a where a.kompaniya_id = p_kompaniya_id and a.holat = 'faol' and a.summa is null and not (a.tur = 'tolov' and a.tolov_id is not null);
  select count(*) into v_kat from public.t2_xarajat x where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.summa is not null and x.kat is null;
  select count(*) into v_chel from public.t2_xarajat x where x.kompaniya_id = p_kompaniya_id and x.holat = 'faol' and x.kat = U&'\0427\0415\041B' and x.summa is not null
    and exists (select 1 from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'xarajat.chel' and m.dt_kod is not null)
    and exists (select 1 from public.t2_bux_moslik m where m.kompaniya_id = p_kompaniya_id and m.kalit = 'ish_haqi.hisoblash' and m.dt_kod is not null)
    and exists (select 1 from public.t2_hr_oylik y where y.kompaniya_id = p_kompaniya_id and y.holat = 'tasdiqlangan' and y.oy = date_trunc('month', x.sana)::date)
    and coalesce(x.hujjat_ref, '') not like 'naryad %';
  v_res := jsonb_build_object('ok', true, 'dry', coalesce(p_dry, false)) || v_sync
           || jsonb_build_object('f3_summasiz', v_f3, 'asos_summasiz', v_asos, 'xarajat_kategoriyasiz', v_kat, 'chel_ikki_manba_ogohlantirish', v_chel);
  if not coalesce(p_dry, false) then
    perform public.t2_audit_yoz(p_kompaniya_id, 'bux_avto_provodka', 'buxgalteriya', null,
      format('yangi=%s storno=%s yopiq=%s otkazildi=%s', v_sync->>'yangi', v_sync->>'storno', v_sync->>'yopiq_davr_ogohlantirish', v_sync->>'yopiq_davr_otkazildi'), 'actor:' || p_actor_id, null);
    insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_avto_provodka_v1', v_res);
  end if;
  return v_res;
end $$;

create or replace function public.t2_bux_davr_v1(p_actor_id bigint, p_kompaniya_id bigint, p_oy date, p_amal text, p_tasdiq boolean, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prev jsonb; v_oy date; v_og jsonb := '[]'::jsonb; v_sync jsonb; v_res jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok', false, 'code', 'OPERATION_ID_REQUIRED'); end if;
  select natija into v_prev from public.t2_onboarding_command_log where operation_id = p_operation_id;
  if found then return v_prev; end if;
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.approve');
  if p_oy is null or p_amal is null or p_amal not in ('yop', 'och') then return jsonb_build_object('ok', false, 'code', 'DAVR_AMAL'); end if;
  v_oy := date_trunc('month', p_oy)::date;
  if p_amal = 'yop' then
    v_sync := public._t2_bux_sync(p_kompaniya_id, p_actor_id, public._t2_bux_turlar(),
                                  public._t2_bux_kerak_v3(p_kompaniya_id), true);
    if to_char(v_oy, 'YYYY-MM') in (select jsonb_array_elements_text(v_sync->'oylar')) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'PROVODKASIZ_HUJJAT', 'xabar', 'Bu oyda hali provodkaga aylanmagan hujjatlar bor (Hujjatlardan yangilash).'));
    end if;
    if exists (select 1 from public.t2_bux_provodka p where p.kompaniya_id = p_kompaniya_id and p.sana < v_oy
                 and not exists (select 1 from public.t2_bux_davr z where z.kompaniya_id = p_kompaniya_id and z.holat = 'yopiq' and z.oy = date_trunc('month', p.sana)::date)) then
      v_og := v_og || jsonb_build_array(jsonb_build_object('kod', 'OLDINGI_OY_OCHIQ', 'xabar', 'Oldingi oylardan yopilmagani bor.'));
    end if;
    if jsonb_array_length(v_og) > 0 and not coalesce(p_tasdiq, false) then
      return jsonb_build_object('ok', false, 'code', 'OGOHLANTIRISH', 'ogohlantirishlar', v_og);
    end if;
  end if;
  insert into public.t2_bux_davr(kompaniya_id, oy, holat, aktor_id, izoh) values (p_kompaniya_id, v_oy, case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, p_actor_id, nullif(left(btrim(coalesce(p_izoh, '')), 300), ''))
  on conflict (kompaniya_id, oy) do update set holat = excluded.holat, aktor_id = excluded.aktor_id, izoh = excluded.izoh, yangilandi = now();
  perform public.t2_audit_yoz(p_kompaniya_id, 'bux_davr', 'buxgalteriya', null, format('oy=%s amal=%s ogohlantirish=%s', v_oy, p_amal, jsonb_array_length(v_og)), 'actor:' || p_actor_id, null);
  v_res := jsonb_build_object('ok', true, 'oy', v_oy, 'holat', case when p_amal = 'yop' then 'yopiq' else 'ochiq' end, 'ogohlantirishlar', v_og);
  insert into public.t2_onboarding_command_log(operation_id, actor_id, command, natija) values (p_operation_id, p_actor_id, 'bux_davr_v1', v_res);
  return v_res;
end $$;

-- Pul ko'rinishi: ish haqi provodkalari ЧЕЛ toifasida ko'rinadi
create or replace function public.t2_bux_pul_korinish_v1(p_kompaniya_id bigint, p_actor_id bigint, p_dan date default null, p_gacha date default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dan date := coalesce(p_dan, date '1900-01-01'); v_gacha date := coalesce(p_gacha, date '9999-12-31'); v_bor boolean; v_q jsonb; v_j jsonb;
begin
  perform public._t2_bux_ruxsat(p_kompaniya_id, p_actor_id, 'accounting.read');
  v_bor := exists (select 1 from public.t2_bux_provodka where kompaniya_id = p_kompaniya_id);
  with p as (
    select pr.obyekt_id, pr.shartnoma_id, pr.sana, pr.dt_kod, pr.kt_kod, pr.summa, pr.qism, pr.manba_tur,
           case when pr.dt_kod = '2010' then pr.summa when pr.kt_kod = '2010' and pr.manba_tur <> 'tannarx' then -pr.summa else 0::numeric end as xar,
           case when pr.manba_tur = 'xarajat' then x.kat when pr.manba_tur = 'qarz_ish' then 'SUB' when pr.manba_tur = 'ish_haqi' then U&'\0427\0415\041B' end as kat
      from public.t2_bux_provodka pr
      left join public.t2_xarajat x on pr.manba_tur = 'xarajat' and x.id = pr.manba_id and x.kompaniya_id = p_kompaniya_id
     where pr.kompaniya_id = p_kompaniya_id and pr.sana <= v_gacha
  ), g as (
    select p.obyekt_id, p.shartnoma_id,
      coalesce(sum(case when p.kt_kod = '9010' then p.summa when p.dt_kod = '9010' then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as daromad,
      coalesce(sum(case when p.kt_kod = '6410' and p.qism = 'nds_sotuv' then p.summa else 0 end) filter (where p.sana >= v_dan), 0) as daromad_qqs,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan), 0) as xarajat,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'ЧЕЛ'), 0) as xarajat_chel,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'МАТ'), 0) as xarajat_mat,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'МАШ'), 0) as xarajat_mash,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'ОБ'), 0) as xarajat_ob,
      coalesce(sum(p.xar) filter (where p.sana >= v_dan and p.kat = 'SUB'), 0) as xarajat_sub,
      coalesce(sum(case when p.dt_kod = '9110' then p.summa when p.kt_kod = '9110' then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as tannarx,
      coalesce(sum(case when p.dt_kod in ('9410', '9420') then p.summa when p.kt_kod in ('9410', '9420') then -p.summa else 0 end) filter (where p.sana >= v_dan), 0) as davr_xarajat,
      coalesce(sum(p.summa) filter (where p.sana >= v_dan and p.kt_kod = '4010' and p.manba_tur = 'tolov'), 0) as tushgan,
      coalesce(sum(case when p.dt_kod = '4010' then p.summa when p.kt_kod = '4010' then -p.summa else 0 end), 0) as qarz,
      coalesce(sum(case when p.kt_kod = '6010' then p.summa when p.dt_kod = '6010' then -p.summa else 0 end), 0) as kreditor,
      coalesce(sum(case when p.dt_kod in ('5010', '5110') then p.summa when p.kt_kod in ('5010', '5110') then -p.summa else 0 end), 0) as pul
      from p group by p.obyekt_id, p.shartnoma_id
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.obyekt_id nulls last, g.shartnoma_id nulls last), '[]'::jsonb),
         jsonb_build_object('daromad', coalesce(sum(g.daromad), 0), 'xarajat', coalesce(sum(g.xarajat), 0), 'tannarx', coalesce(sum(g.tannarx), 0),
           'davr_xarajat', coalesce(sum(g.davr_xarajat), 0), 'tushgan', coalesce(sum(g.tushgan), 0), 'qarz', coalesce(sum(g.qarz), 0),
           'kreditor', coalesce(sum(g.kreditor), 0), 'pul', coalesce(sum(g.pul), 0))
    into v_q, v_j from g;
  return jsonb_build_object('ok', true, 'manba', 'jurnal', 'bor', v_bor, 'dan', p_dan, 'gacha', p_gacha, 'qatorlar', v_q, 'jami', v_j);
end $$;

-- Grantlar (faqat service_role)
revoke all on function public._t2_bux_turlar() from public, anon, authenticated;
revoke all on function public._t2_bux_kerak_v3(bigint) from public, anon, authenticated;
revoke all on function public._t2_bux_sverka_hujjatlar(bigint, bigint, date, date) from public, anon, authenticated;
revoke all on function public._t2_bux_sverka_ochilish(bigint, bigint, date) from public, anon, authenticated;
revoke all on function public.t2_bux_sverka_tomonlar_v1(bigint, bigint) from public, anon, authenticated;
revoke all on function public.t2_bux_sverka_v1(bigint, bigint, bigint, date, date) from public, anon, authenticated;
grant execute on function public.t2_bux_sverka_tomonlar_v1(bigint, bigint) to service_role;
grant execute on function public.t2_bux_sverka_v1(bigint, bigint, bigint, date, date) to service_role;