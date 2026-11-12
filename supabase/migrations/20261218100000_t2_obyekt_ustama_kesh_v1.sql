-- 20261218100000 - Obyekt sahifasi (ObyektPortali) tezligi: har F2 aktining ustamali podvali TAYYOR keshdan o'qiladi.
--
-- MUAMMO: t2_zakazchik_obyektlar_v2(markup/ustama=true) har tasdiqlangan F2 akti uchun (va jami uchun) _t2_f2_ustamali ni JONLI
--   hisoblaydi. O'lchov (prod, FAQAT O'QISH, kompaniya 433): obyekt 353 (1 akt) = 0,5-6,0 s; obyekt 153 (23 akt) faqat aktlar bo'yicha
--   ustamali hisobi = 8,1 s (+ jami).
-- YECHIM (formula YANGI YOZILMAYDI — kesh faqat _t2_f2_ustamali natijasini saqlaydi; mavjud t2_obyekt_kesh mexanizmi kengaytiriladi):
--   t2_obyekt_ustama_kesh: har obyekt uchun {akt_id -> ustama} va butun obyekt jami. Kesh t2_obyekt_kesh BILAN BIR VERSIYADA yashaydi:
--     - kesh_hisoblandi = shu ustama hisoblangan paytdagi t2_obyekt_kesh.hisoblandi; asosiy kesh qayta hisoblansa (manba o'zgargan / tungi) —
--       versiya farq qiladi va ustama keshi AVTOMATIK yaroqsiz bo'ladi;
--     - obyekt «iflos» (t2_obyekt_kesh_iflos, manba jadvallar triggeri) bo'lsa — kesh O'QILMAYDI, jonli hisobga qaytiladi;
--     - hisoblash paytida manba o'zgarsa (iflos paydo bo'lsa yoki asosiy kesh yangilansa) — yozuv saqlanmaydi (poyga himoyasi).
--   Ya'ni eskirgan raqam HECH QACHON ko'rsatilmaydi; eng yomon holat — sekinroq jonli hisob (eski xulq).
--   Yangilovchi: t2_obyekt_ustama_yangila_v1 (pg_cron har daqiqa, byudjet 40 s), iflos bo'lmagan va keshi yo'q/yaroqsiz obyektlar uchun.
-- t2_zakazchik_obyektlar_v2: har akt/jami uchun coalesce(kesh, jonli) — javob shakli AYNAN bir xil.
-- DB hajmi: 12 obyekt, 49 akt x ~2 KB = ~0,1 MB.

create table if not exists public.t2_obyekt_ustama_kesh (
  obyekt_id        bigint primary key references public.t2_obyekt(id) on delete cascade,
  kompaniya_id     bigint not null,
  royxat           jsonb not null default '{}'::jsonb,   -- akt_id (matn) -> _t2_f2_ustamali natijasi
  jami             jsonb,                                 -- butun obyekt (barcha tasdiqlangan F2) uchun
  kesh_hisoblandi  timestamptz not null,                  -- t2_obyekt_kesh.hisoblandi (shu versiyaga bog'langan)
  hisoblandi       timestamptz not null default now(),
  hisob_ms         integer
);
alter table public.t2_obyekt_ustama_kesh enable row level security;
revoke all on public.t2_obyekt_ustama_kesh from public, anon, authenticated;
grant all on public.t2_obyekt_ustama_kesh to service_role;

-- Bitta obyekt uchun hisoblash. Yaroqli bo'lsa yozadi, aks holda (manba o'zgargan) hech narsa yozmaydi. true = yozildi.
create or replace function public._t2_obyekt_ustama_hisobla_v1(p_obyekt_id bigint)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_komp bigint; v_k0 timestamptz; v_t0 timestamptz := clock_timestamp(); v_map jsonb; v_ids bigint[]; v_jami jsonb; v_k1 timestamptz; v_sh bigint;
begin
  select o.kompaniya_id into v_komp from public.t2_obyekt o where o.id = p_obyekt_id;
  select k.hisoblandi into v_k0 from public.t2_obyekt_kesh k
   where k.obyekt_id = p_obyekt_id and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = p_obyekt_id);
  if v_komp is null or v_k0 is null then return false; end if;          -- obyekt yo'q / asosiy kesh yo'q yoki iflos: jonli hisob
  select array_agg(t.id order by t.id) into v_ids
    from public.t2_akt t where t.obyekt_id = p_obyekt_id and t.kompaniya_id = v_komp and t.tur = 'f2' and t.lifecycle_status = 'approved';
  if v_ids is null then delete from public.t2_obyekt_ustama_kesh where obyekt_id = p_obyekt_id; return false; end if;
  v_sh := (select b3.shartnoma_id from public.t2_shartnoma_bog b3 where b3.obyekt_id = p_obyekt_id and b3.holat = 'faol' order by b3.shartnoma_id limit 1);
  -- Har akt: v2 dagi jonli ifoda bilan AYNAN bir xil (shartnoma: aktniki, bo'lmasa obyektning birinchi faol bog'i).
  select jsonb_object_agg(t.id::text, public._t2_f2_ustamali(v_komp, coalesce(t.shartnoma_id, (select b2.shartnoma_id from public.t2_shartnoma_bog b2 where b2.obyekt_id = p_obyekt_id and b2.holat = 'faol' order by b2.shartnoma_id limit 1)), array[t.id]))
    into v_map from public.t2_akt t where t.id = any(v_ids);
  v_jami := public._t2_f2_ustamali(v_komp, v_sh, v_ids);
  -- Poyga himoyasi: hisoblash paytida manba o'zgarmaganini tekshiramiz (iflos yo'q va asosiy kesh versiyasi o'sha).
  select k.hisoblandi into v_k1 from public.t2_obyekt_kesh k
   where k.obyekt_id = p_obyekt_id and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = p_obyekt_id);
  if v_k1 is distinct from v_k0 then return false; end if;
  insert into public.t2_obyekt_ustama_kesh as u (obyekt_id, kompaniya_id, royxat, jami, kesh_hisoblandi, hisoblandi, hisob_ms)
  values (p_obyekt_id, v_komp, coalesce(v_map, '{}'::jsonb), v_jami, v_k0, now(), (extract(epoch from clock_timestamp() - v_t0) * 1000)::int)
  on conflict (obyekt_id) do update
    set kompaniya_id = excluded.kompaniya_id, royxat = excluded.royxat, jami = excluded.jami,
        kesh_hisoblandi = excluded.kesh_hisoblandi, hisoblandi = excluded.hisoblandi, hisob_ms = excluded.hisob_ms;
  return true;
end $$;
revoke all on function public._t2_obyekt_ustama_hisobla_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_obyekt_ustama_hisobla_v1(bigint) to service_role;

-- Yangilovchi: iflos bo'lmagan, asosiy keshi bor, ustama keshi yo'q yoki eskirgan (kesh_hisoblandi farq) obyektlar. Faqat tasdiqlangan F2 li obyektlar.
create or replace function public.t2_obyekt_ustama_yangila_v1(p_byudjet_s integer default 40)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record; v_t0 timestamptz := clock_timestamp(); v_soni int := 0; v_qoldi int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('t2_obyekt_ustama_yangila_v1')) then
    return jsonb_build_object('ok', true, 'o_tkazildi', 'band');
  end if;
  for r in
    select o.id as obyekt_id
      from public.t2_obyekt o
      join public.t2_obyekt_kesh k on k.obyekt_id = o.id
      left join public.t2_obyekt_ustama_kesh u on u.obyekt_id = o.id
     where not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = o.id)
       and exists (select 1 from public.t2_akt t where t.obyekt_id = o.id and t.tur = 'f2' and t.lifecycle_status = 'approved')
       and (u.obyekt_id is null or u.kesh_hisoblandi is distinct from k.hisoblandi)
     order by o.id
  loop
    if extract(epoch from clock_timestamp() - v_t0) >= p_byudjet_s then v_qoldi := v_qoldi + 1; continue; end if;
    if public._t2_obyekt_ustama_hisobla_v1(r.obyekt_id) then v_soni := v_soni + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'hisoblandi', v_soni, 'qoldi', v_qoldi);
end $$;
revoke all on function public.t2_obyekt_ustama_yangila_v1(integer) from public, anon, authenticated;
grant execute on function public.t2_obyekt_ustama_yangila_v1(integer) to service_role;

-- O'qish: yaroqli kesh bo'lsa (asosiy kesh versiyasi bir xil, iflos yo'q, 3 kundan eski emas) — qator; aks holda bo'sh (jonli hisob).
create or replace function public._t2_obyekt_ustama_oqi_v1(p_obyekt_id bigint)
returns table(royxat jsonb, jami jsonb) language sql stable security definer set search_path = public, pg_temp as $$
  select u.royxat, u.jami
    from public.t2_obyekt_ustama_kesh u
    join public.t2_obyekt_kesh k on k.obyekt_id = u.obyekt_id
   where u.obyekt_id = p_obyekt_id
     and u.kesh_hisoblandi = k.hisoblandi
     and k.hisoblandi > now() - interval '3 days'
     and not exists (select 1 from public.t2_obyekt_kesh_iflos i where i.obyekt_id = u.obyekt_id)
$$;
revoke all on function public._t2_obyekt_ustama_oqi_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_obyekt_ustama_oqi_v1(bigint) to service_role;

-- t2_zakazchik_obyektlar_v2: ustama=true da har akt/jami — keshdan (yaroqli bo'lsa), aks holda jonli (avvalgi xulq).
create or replace function public.t2_zakazchik_obyektlar_v2(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint default null, p_ustama boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(x order by x->>'qarshi_nom', x->>'obyekt_nom'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'aloqa_id', a.id, 'qarshi_kompaniya_id', c.id, 'qarshi_nom', c.nom, 'qarshi_rol', case when a.taklif_kompaniya_id = p_kompaniya_id then a.qabul_rol else a.taklif_rol end,
      'obyekt_id', o.id, 'obyekt_nom', o.nom,
      'shartnoma', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'shartnoma_xulosa', 'korish', o.id) then (
          select jsonb_build_object('raqam', s.raqam, 'nom', s.nom, 'summa_bez_nds', s.summa_bez_nds, 'jami_nds_bilan', s.jami_nds_bilan)
            from public.t2_shartnoma s join public.t2_shartnoma_bog b on b.shartnoma_id = s.id and b.holat = 'faol'
           where b.obyekt_id = o.id and s.holat = 'faol' order by s.asosiy desc nulls last, s.id limit 1) end,
      'f2', case when public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'f2', 'korish', o.id) then (
          select jsonb_build_object('soni', count(*), 'jami', coalesce(sum(t.hujjat_jami), 0), 'oxirgi_oy', max(t.oy),
                 'royxat', coalesce(jsonb_agg(jsonb_build_object('akt_id', t.id, 'raqam', t.raqam, 'oy', t.oy, 'jami', t.hujjat_jami)
                              || case when p_ustama then jsonb_build_object('ustama', coalesce(uk.royxat->(t.id::text), public._t2_f2_ustamali(c.id, coalesce(t.shartnoma_id, (select b2.shartnoma_id from public.t2_shartnoma_bog b2 where b2.obyekt_id = o.id and b2.holat = 'faol' order by b2.shartnoma_id limit 1)), array[t.id]))) else '{}'::jsonb end
                              order by t.oy desc nulls last, t.id desc), '[]'::jsonb))
                 || case when p_ustama and count(*) > 0 then jsonb_build_object('ustama_jami', coalesce(uk.jami, public._t2_f2_ustamali(c.id, (select b3.shartnoma_id from public.t2_shartnoma_bog b3 where b3.obyekt_id = o.id and b3.holat = 'faol' order by b3.shartnoma_id limit 1), array_agg(t.id)))) else '{}'::jsonb end
            from public.t2_akt t where t.obyekt_id = o.id and t.kompaniya_id = c.id and t.tur = 'f2' and t.lifecycle_status = 'approved') end,
      'kutayotgan_taqdim', (select count(*) from public.t2_tomon_taqdim q where q.obyekt_id = o.id and q.qabul_qiluvchi_kompaniya_id = p_kompaniya_id and q.holat in ('yuborilgan','ko_rilmoqda'))
    ) x
      from public.t2_tomon_aloqa a
      join public.t2_kompaniya c on c.id = public._t2_tomon_qarshi(a, p_kompaniya_id)
      join public.t2_obyekt o on o.kompaniya_id = c.id and o.holat = 'faol' and (p_obyekt_id is null or o.id = p_obyekt_id)
      left join lateral (select ux.royxat, ux.jami from public._t2_obyekt_ustama_oqi_v1(o.id) ux where p_ustama) uk on true
     where a.holat = 'faol' and (a.taklif_kompaniya_id = p_kompaniya_id or a.qabul_kompaniya_id = p_kompaniya_id)
       and public.t2_tomon_ruxsat_bor(p_kompaniya_id, c.id, 'obyekt_holat', 'korish', o.id)
  ) s;
  return v;
end $$;
revoke all on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.t2_zakazchik_obyektlar_v2(bigint, bigint, bigint, boolean) to service_role;

-- Cron: har daqiqa; birinchi to'ldirish — asosiy kesh yangilangach o'zi (kesh versiyasi farq qiladi / ustama keshi yo'q).
do $cron$
begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      if exists (select 1 from cron.job where jobname = 't2_obyekt_ustama_yangila') then perform cron.unschedule('t2_obyekt_ustama_yangila'); end if;
      perform cron.schedule('t2_obyekt_ustama_yangila', '* * * * *', 'set statement_timeout = ''150s''; select public.t2_obyekt_ustama_yangila_v1(40)');
    else
      raise warning 'pg_cron yo''q — t2_obyekt_ustama_yangila_v1 ni qo''lda/boshqa rejalashtiruvchi bilan chaqiring';
    end if;
  end if;
end $cron$;
