-- 20261214000000 - BUYURTMACHI tomoni: kunlik sikl («Bugun» portfeli) + F3 bo'yicha to'lov xabari.
-- Yangi hujjat/inbox jadvali YO'Q: qaror kutayotgan hujjatlar = t2_tomon_taqdim, remark/predpisaniya = t2_tomon_murojaat (mavjud).
-- Yangi faqat:
--   1. t2_tomon_resurs: 'fakt' va 'tolov_holati' faol (pudratchi buyurtmachiga alohida GRANT beradi; default-deny saqlanadi).
--   2. t2_tomon_tolov: buyurtmachi pudratchining Forma-3 (qarz) bo'yicha to'lagan summasini XABAR qiladi. Pudratchi tasdiqlasa
--      t2_tolov (manba='zakazchik_xabar') ga yoziladi - qarz hisobi (t2_qarz_svod_v1) bitta manbadan, ikki marta sanalmaydi.
--      Buyurtmachi pudratchining t2_tolov jadvaliga to'g'ridan yoza olmaydi (tenant izolyatsiyasi).
--   3. t2_zakazchik_bugun_v1: portfel (obyekt kesimida: shartnoma, smeta, fakt, F2, F3, to'langan, qarz) + kutayotgan sonlar. O'QISH.
--   4. t2_zakazchik_tolov_yoz_v1 / t2_tomon_tolov_royxat_v1 / t2_tomon_tolov_qaror_v1.
-- Pul qoidasi: NULL = noma'lum (0 emas); summalar QQS siz (smeta/fakt/F2 ustamasiz + ustamali) va QQS bilan (shartnoma, F3, to'lov).
-- DB hajmi: t2_tomon_tolov ~0.3 KB/qator, oyiga ~10-50 qator -> <0.02 MB/oy.
-- Rol huquqi mavjud 'qaror' (buyurtmachi/rahbar) va 'boshqarish' (pudratchi rahbari) amallari bilan; _t2_tomon_rol_ok o'zgarmaydi.

-- 1. Resurslar
update public.t2_tomon_resurs
   set faol = true, izoh = 'Bajarilgan ish (fakt) summasi: pudratchi hisoboti bo''yicha, obyekt kesimida (faqat summa)'
 where kalit = 'fakt';
update public.t2_tomon_resurs
   set faol = true, izoh = 'Forma-3 (QQS bilan), to''langan va qarz: obyekt kesimida'
 where kalit = 'tolov_holati';

-- 2. t2_tolov.manba ga 'zakazchik_xabar'
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.t2_tolov'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%manba%' loop
    execute format('alter table public.t2_tolov drop constraint %I', c.conname);
  end loop;
  alter table public.t2_tolov add constraint t2_tolov_manba_check
    check (manba is null or manba in ('qolda', 'sverka_1c', 'bank_import', 'zakazchik_xabar'));
end $$;

-- 3. To'lov xabari
create table if not exists public.t2_tomon_tolov (
  id bigint generated always as identity primary key,
  aloqa_id bigint not null references public.t2_tomon_aloqa(id),
  tolovchi_kompaniya_id bigint not null references public.t2_kompaniya(id),   -- buyurtmachi
  oluvchi_kompaniya_id bigint not null references public.t2_kompaniya(id),    -- pudratchi
  obyekt_id bigint not null references public.t2_obyekt(id),
  shartnoma_id bigint,
  forma3_id bigint references public.t2_forma3(id),
  summa numeric(20,2) not null check (summa > 0),                             -- QQS bilan
  sana date not null,
  hujjat_raqam text check (hujjat_raqam is null or length(hujjat_raqam) <= 60),
  izoh text check (izoh is null or length(izoh) <= 1000),
  holat text not null default 'xabar' check (holat in ('xabar', 'tasdiqlangan', 'rad', 'bekor')),
  tolov_id bigint references public.t2_tolov(id),
  actor_id bigint not null,
  qaror_actor_id bigint,
  qaror_vaqti timestamptz,
  qaror_izoh text check (qaror_izoh is null or length(qaror_izoh) <= 1000),
  operation_id uuid,
  yaratildi timestamptz not null default now(),
  check (tolovchi_kompaniya_id <> oluvchi_kompaniya_id)
);
create unique index if not exists t2_tomon_tolov_operation_uq on public.t2_tomon_tolov (tolovchi_kompaniya_id, operation_id) where operation_id is not null;
create index if not exists t2_tomon_tolov_oluvchi_idx on public.t2_tomon_tolov (oluvchi_kompaniya_id, holat, id desc);
create index if not exists t2_tomon_tolov_tolovchi_idx on public.t2_tomon_tolov (tolovchi_kompaniya_id, holat, id desc);
create index if not exists t2_tomon_tolov_obyekt_idx on public.t2_tomon_tolov (obyekt_id) where holat = 'xabar';
alter table public.t2_tomon_tolov enable row level security;
revoke all on table public.t2_tomon_tolov from anon, authenticated;
comment on table public.t2_tomon_tolov is 'Buyurtmachi to''lov xabari (Forma-3 bo''yicha). Tasdiq -> t2_tolov (manba zakazchik_xabar). Summa QQS bilan.';

-- 4. Portfel + kutayotganlar
create or replace function public.t2_zakazchik_bugun_v1(p_actor_id bigint, p_kompaniya_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ob jsonb; v_kut jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  -- qarz = F3 (QQS bilan) - to'langan; F3 yoki to'lov ruxsati/ma'lumoti yo'q bo'lsa NULL (0 emas)
  select coalesce(jsonb_agg(x2 order by x2->>'qarshi_nom', x2->>'obyekt_nom'), '[]'::jsonb) into v_ob from (
   select x || jsonb_build_object('qarz', case when jsonb_typeof(x->'f3') = 'object' and jsonb_typeof(x->'tolangan') = 'object' and (x->'f3'->>'summa') is not null
                                              then (x->'f3'->>'summa')::numeric - (x->'tolangan'->>'summa')::numeric end) x2 from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma_id', sh.id, 'shartnoma_raqam', sh.raqam,
      'shartnoma_summa', case when sh.id is not null and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id)
        then coalesce((select d.jami_nds_bilan from public.t2_shartnoma_ds d where d.shartnoma_id = sh.id and d.holat = 'faol' order by d.sana desc, d.id desc limit 1), sh.jami_nds_bilan) end,
      'smeta', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('summa', sum(q.hajm * q.narx), 'narxsiz_qator', count(*) filter (where q.narx is null and coalesce(q.hajm, 0) <> 0))
            from public.t2_qator q where q.obyekt_id = o.id and q.tur = 'bl' and coalesce(q.versiya_holat, '') <> 'almashtirilgan') end,
      'fakt', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'fakt', 'korish', o.id) then (
          select jsonb_build_object('summa', sum(aq.summa), 'narxsiz_qator', count(*) filter (where aq.summa is null and coalesce(aq.hajm, 0) <> 0), 'oxirgi_sana', max(a2.sana))
            from public.t2_akt a2 join public.t2_akt_qator aq on aq.akt_id = a2.id join public.t2_qator q2 on q2.id = aq.qator_id and q2.tur = 'bl'
           where a2.obyekt_id = o.id and a2.kompaniya_id = c.id and a2.tur = 'fakt' and a2.holat <> 'bekor') end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'ustama_jami', case when count(*) > 0 then public._t2_f2_ustamali(c.id, sh.id, array_agg(t.id)) end)
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'f3', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'tolov_holati', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'summa', sum(f.sotuv_summa), 'oxirgi_sana', max(f.sotuv_sana))
            from public.t2_forma3 f where f.kompaniya_id = c.id and f.manba = 'sotuv' and f.holat <> 'bekor'
             and (f.obyekt_id = o.id or (sh.id is not null and f.shartnoma_id = sh.id))) end,
      'tolangan', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'tolov_holati', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'summa', coalesce(sum(case when t3.tur = 'qaytarim' then -t3.summa else t3.summa end), 0), 'oxirgi_sana', max(t3.sana))
            from public.t2_tolov t3 where t3.kompaniya_id = c.id and t3.holat <> 'bekor'
             and (t3.obyekt_id = o.id or (sh.id is not null and t3.shartnoma_id = sh.id))) end,
      'xabar_kutilmoqda', (select coalesce(sum(x2.summa), 0) from public.t2_tomon_tolov x2 where x2.tolovchi_kompaniya_id = p_kompaniya_id and x2.obyekt_id = o.id and x2.holat = 'xabar'),
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q3 where q3.obyekt_id = o.id and q3.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q3.holat in ('yuborilgan','ko_rilmoqda')),
      'ochiq_murojaat', (select count(*) from public.t2_tomon_murojaat m where m.obyekt_id = o.id and m.beruvchi_kompaniya_id = p_kompaniya_id and m.holat in ('ochiq','bajarildi'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol'
      left join lateral (select s.id, s.raqam, s.jami_nds_bilan from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
                          where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) sh on true
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
   ) s0
  ) s;

  select jsonb_build_object(
    'taqdim', coalesce((select jsonb_object_agg(r, n) from (select q.resurs r, count(*) n from public.t2_tomon_taqdim q
                         where q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda') group by q.resurs) z), '{}'::jsonb),
    'murojaat_menga_ochiq', (select count(*) from public.t2_tomon_murojaat m where m.ijrochi_kompaniya_id = p_kompaniya_id and m.holat = 'ochiq'),
    'murojaat_tekshiruv', (select count(*) from public.t2_tomon_murojaat m where m.beruvchi_kompaniya_id = p_kompaniya_id and m.holat = 'bajarildi'),
    'murojaat_kechikkan', (select count(*) from public.t2_tomon_murojaat m where m.beruvchi_kompaniya_id = p_kompaniya_id and m.holat = 'ochiq' and m.muddat < current_date),
    'tolov_xabar_kutilmoqda', (select count(*) from public.t2_tomon_tolov x where x.tolovchi_kompaniya_id = p_kompaniya_id and x.holat = 'xabar')
  ) into v_kut;
  return jsonb_build_object('ok', true, 'obyektlar', v_ob, 'kutayotgan', v_kut, 'sana', current_date);
end $$;
revoke all on function public.t2_zakazchik_bugun_v1(bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_bugun_v1(bigint, bigint) to service_role;

-- 5. To'lov xabarini yozish (buyurtmachi)
create or replace function public.t2_zakazchik_tolov_yoz_v1(
  p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint, p_forma3_id bigint, p_summa numeric, p_sana date,
  p_hujjat_raqam text, p_izoh text, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.t2_obyekt; v_a public.t2_tomon_aloqa; v_old public.t2_tomon_tolov; v_sh bigint; v_f3sh bigint; f public.t2_forma3; v_id bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  if p_operation_id is not null then
    select * into v_old from public.t2_tomon_tolov where tolovchi_kompaniya_id = p_kompaniya_id and operation_id = p_operation_id;
    if found then return jsonb_build_object('ok', true, 'id', v_old.id, 'holat', v_old.holat, 'qayta', true); end if;
  end if;
  if p_summa is null or p_summa <= 0 then return jsonb_build_object('ok', false, 'code', 'SUMMA', 'error', 'Summa noldan katta bo‘lishi kerak'); end if;
  if p_sana is null or p_sana > current_date + 1 then return jsonb_build_object('ok', false, 'code', 'SANA', 'error', 'To‘lov sanasi noto‘g‘ri'); end if;
  select * into o from public.t2_obyekt where id = p_obyekt_id and holat = 'faol';
  if not found or o.kompaniya_id = p_kompaniya_id then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Obyekt topilmadi'); end if;
  select * into v_a from public.t2_tomon_aloqa a
   where a.holat = 'faol' and ((a.taklif_kompaniya_id = p_kompaniya_id and a.qabul_kompaniya_id = o.kompaniya_id) or (a.qabul_kompaniya_id = p_kompaniya_id and a.taklif_kompaniya_id = o.kompaniya_id))
   order by a.id limit 1;
  if not found then return jsonb_build_object('ok', false, 'code', 'ALOQA_YOQ', 'error', 'Pudratchi bilan faol aloqa yo‘q'); end if;
  if not public.t2_tomon_ruxsat_bor(p_kompaniya_id, o.kompaniya_id, 'tolov_holati', 'korish', o.id) then
    return jsonb_build_object('ok', false, 'code', 'OBYEKT_YOPIQ', 'error', 'Pudratchi bu obyekt uchun to‘lov holatini sizga ochmagan');
  end if;
  if p_forma3_id is not null then
    select * into f from public.t2_forma3 where id = p_forma3_id and kompaniya_id = o.kompaniya_id and holat <> 'bekor' and (obyekt_id = o.id or obyekt_id is null);
    if not found then return jsonb_build_object('ok', false, 'code', 'F3_YOQ', 'error', 'Forma-3 topilmadi'); end if;
    v_f3sh := f.shartnoma_id;
  end if;
  select b.shartnoma_id into v_sh from public.t2_shartnoma_bog b join public.t2_shartnoma s on s.id = b.shartnoma_id and s.holat = 'faol'
   where b.obyekt_id = o.id and b.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1;
  insert into public.t2_tomon_tolov (aloqa_id, tolovchi_kompaniya_id, oluvchi_kompaniya_id, obyekt_id, shartnoma_id, forma3_id, summa, sana, hujjat_raqam, izoh, actor_id, operation_id)
  values (v_a.id, p_kompaniya_id, o.kompaniya_id, o.id, coalesce(v_sh, v_f3sh), p_forma3_id, round(p_summa, 2), p_sana,
          nullif(btrim(coalesce(p_hujjat_raqam, '')), ''), nullif(btrim(coalesce(p_izoh, '')), ''), p_actor_id, p_operation_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'holat', 'xabar');
end $$;
revoke all on function public.t2_zakazchik_tolov_yoz_v1(bigint, bigint, bigint, bigint, numeric, date, text, text, uuid) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_tolov_yoz_v1(bigint, bigint, bigint, bigint, numeric, date, text, text, uuid) to service_role;

-- 6. Ro'yxat (ikki tomon): 'mendan' = men yozganlarim (buyurtmachi), 'menga' = menga kelgan (pudratchi)
create or replace function public.t2_tomon_tolov_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_yonalish text, p_holat text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_lim integer := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) into v from (
    select jsonb_build_object('id', t.id, 'aloqa_id', t.aloqa_id, 'obyekt_id', t.obyekt_id,
        'obyekt_nom', (select o.nom from public.t2_obyekt o where o.id = t.obyekt_id),
        'qarshi_nom', (select k.nom from public.t2_kompaniya k where k.id = case when t.oluvchi_kompaniya_id = p_kompaniya_id then t.tolovchi_kompaniya_id else t.oluvchi_kompaniya_id end),
        'summa', t.summa, 'sana', t.sana, 'hujjat_raqam', t.hujjat_raqam, 'izoh', t.izoh, 'holat', t.holat, 'forma3_id', t.forma3_id,
        'forma3_raqam', (select f.raqam from public.t2_forma3 f where f.id = t.forma3_id),
        'kelgan', t.oluvchi_kompaniya_id = p_kompaniya_id, 'qaror_izoh', t.qaror_izoh, 'qaror_vaqti', t.qaror_vaqti, 'yaratildi', t.yaratildi) x
      from public.t2_tomon_tolov t
     where ((p_yonalish = 'menga' and t.oluvchi_kompaniya_id = p_kompaniya_id)
         or (p_yonalish = 'mendan' and t.tolovchi_kompaniya_id = p_kompaniya_id)
         or (coalesce(p_yonalish, '') not in ('menga', 'mendan') and p_kompaniya_id in (t.oluvchi_kompaniya_id, t.tolovchi_kompaniya_id)))
       and (p_holat is null or p_holat = '' or t.holat = p_holat)
     order by t.id desc limit v_lim
  ) s;
  return v;
end $$;
revoke all on function public.t2_tomon_tolov_royxat_v1(bigint, bigint, text, text, integer) from public, anon, authenticated;
grant execute on function public.t2_tomon_tolov_royxat_v1(bigint, bigint, text, text, integer) to service_role;

-- 7. Pudratchi qarori: tasdiq -> t2_tolov (bitta qarz manbasi); rad -> sabab bilan
create or replace function public.t2_tomon_tolov_qaror_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint, p_qaror text, p_izoh text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.t2_tomon_tolov; v_tid bigint;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'boshqarish');
  if p_qaror not in ('tasdiq', 'rad') then return jsonb_build_object('ok', false, 'code', 'QAROR', 'error', 'Qaror: tasdiq yoki rad'); end if;
  select * into t from public.t2_tomon_tolov where id = p_id and oluvchi_kompaniya_id = p_kompaniya_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'To‘lov xabari topilmadi'); end if;
  if t.holat <> 'xabar' then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Bu xabar bo‘yicha qaror allaqachon chiqarilgan'); end if;
  if p_qaror = 'rad' and length(btrim(coalesce(p_izoh, ''))) < 3 then return jsonb_build_object('ok', false, 'code', 'SABAB_KERAK', 'error', 'Rad etish sababini yozing'); end if;
  if p_qaror = 'tasdiq' then
    if t.shartnoma_id is null then return jsonb_build_object('ok', false, 'code', 'SHARTNOMA_YOQ', 'error', 'Obyektga asosiy shartnoma bog‘lanmagan - to‘lovni qarzga yozib bo‘lmaydi'); end if;
    insert into public.t2_tolov (kompaniya_id, shartnoma_id, obyekt_id, sana, summa, tur, izoh, holat, hujjat_raqam, manba, kim)
    values (t.oluvchi_kompaniya_id, t.shartnoma_id, t.obyekt_id, t.sana, t.summa, 'tolov', coalesce(t.izoh, 'Buyurtmachi xabari bo‘yicha'), 'faol', t.hujjat_raqam, 'zakazchik_xabar', 'tomon_tolov:' || t.id)
    returning id into v_tid;
  end if;
  update public.t2_tomon_tolov set holat = case when p_qaror = 'tasdiq' then 'tasdiqlangan' else 'rad' end, tolov_id = v_tid,
         qaror_actor_id = p_actor_id, qaror_vaqti = now(), qaror_izoh = nullif(btrim(coalesce(p_izoh, '')), '') where id = t.id;
  return jsonb_build_object('ok', true, 'id', t.id, 'holat', case when p_qaror = 'tasdiq' then 'tasdiqlangan' else 'rad' end, 'tolov_id', v_tid);
end $$;
revoke all on function public.t2_tomon_tolov_qaror_v1(bigint, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.t2_tomon_tolov_qaror_v1(bigint, bigint, bigint, text, text) to service_role;

-- 8. Buyurtmachi o'z xabarini bekor qiladi (qaror chiqmaguncha)
create or replace function public.t2_zakazchik_tolov_bekor_v1(p_actor_id bigint, p_kompaniya_id bigint, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'qaror');
  update public.t2_tomon_tolov set holat = 'bekor' where id = p_id and tolovchi_kompaniya_id = p_kompaniya_id and holat = 'xabar';
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'code', 'HOLAT', 'error', 'Xabar topilmadi yoki qaror chiqarilgan'); end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'holat', 'bekor');
end $$;
revoke all on function public.t2_zakazchik_tolov_bekor_v1(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_tolov_bekor_v1(bigint, bigint, bigint) to service_role;
