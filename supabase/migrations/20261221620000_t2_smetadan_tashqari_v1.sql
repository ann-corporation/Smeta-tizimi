-- 20261221620000 — SMETADAN TASHQARI QATORLAR (egasi 2026-11-14: «smeta qiymati 58 mlrd chiqishi kerak, hozir 59 mlrd»).
--
-- Muammo: obyekt qiymati = «smeta + o'zgarishlar» (o'lchov 'smeta_joriy'). Smetadan tashqari, lekin fakt/F-2 da hisoblanadigan
-- bo'lim (masalan ekspert xizmati: imzolangan F-2 da bor — to'g'ri) qo'shimcha ish sifatida o'zgarishlarga tushib, obyekt qiymatini
-- oshirib yuborardi.
--
-- Yechim (mavjud mexanizmni kengaytirish, parallel jadval YO'Q): t2_svod_yaxlit bo'lim belgisiga ortogonal belgi
-- `smetadan_tashqari` (turi — svod / subpudrat / ustamasiz — o'zgarmaydi). Belgili bo'lim va uning butun tarkibi:
--   * 'smeta' / 'smeta_joriy' o'lchovlaridan CHIQADI (obyekt qiymati, o'zgarishlar, bajarilish maxraji) va alohida
--     «smetadan tashqari» (ustamasiz + QQS bilan) sifatida paket / t2_smeta_ozgarish_qatlam_v1 da ko'rsatiladi;
--   * 'fakt', 'f2', 'f2_qoralama', 'aktlar', slichitelniy, nakopitelniy O'ZGARMAYDI (ular avvalgidek oladi; imzolangan F-2 paketi bir xil).
--
-- O'zgaradi: 1) ustun; 2) belgilash RPC (CAS, narx.write); 3) _t2_summa_paket_tashqari_v1 (QQS bilan hisob — hisob yadrosida);
--   4) _t2_summa_agg_v1 (7 arg), 5) _t2_summa_paket_v1, 6) t2_smeta_ozgarish_qatlam_v1 — pg_get_functiondef + replace
--   (langar aynan 1 marta, aks holda XATO — drift himoyasi); asl matn _t2_fn_zaxira da, rollback shundan tiklaydi.
-- Stella uchun belgi qo'yish — ALOHIDA data skripti (bu migratsiyada real ma'lumot yo'q). Migratsiyani EGASI qo'llaydi.

create table if not exists public._t2_fn_zaxira (
  nom text primary key,
  tarif text not null,
  yozildi timestamptz not null default now()
);
alter table public._t2_fn_zaxira enable row level security;
revoke all on public._t2_fn_zaxira from public, anon, authenticated;

-- 1) Belgi.
alter table public.t2_svod_yaxlit add column if not exists smetadan_tashqari boolean not null default false;
comment on column public.t2_svod_yaxlit.smetadan_tashqari is
  'Smetadan tashqari bo''lim (egasi 2026-11-14): obyekt qiymatiga (smeta / smeta + o''zgarishlar) KIRMAYDI, lekin fakt / F-2 / slichitelniy da hisoblanadi. turi (svod/subpudrat/ustamasiz) ga bog''liq emas.';

-- 2) Belgilash / olib tashlash (CAS; tarix dalilda).
create or replace function public.t2_svod_yaxlit_tashqari_v1(
  p_kompaniya_id bigint, p_actor_id bigint, p_id bigint, p_belgi boolean, p_kutilgan_versiya integer, p_sabab text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_eski record;
begin
  perform public.t2_actor_kompaniya_azo_tekshir(p_kompaniya_id, p_actor_id);
  perform public.t2_require_permission_v2(p_kompaniya_id, p_actor_id, 'narx.write');
  if p_belgi is null then return jsonb_build_object('ok', false, 'code', 'BELGI_REQUIRED'); end if;
  if p_sabab is null or length(btrim(p_sabab)) = 0 then return jsonb_build_object('ok', false, 'code', 'SABAB_REQUIRED'); end if;
  select * into v_eski from public.t2_svod_yaxlit where id = p_id and kompaniya_id = p_kompaniya_id and faol for update;
  if v_eski.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_kutilgan_versiya is null or p_kutilgan_versiya <> v_eski.versiya then
    return jsonb_build_object('ok', false, 'code', 'VERSIYA', 'bordagi_versiya', v_eski.versiya);
  end if;
  if v_eski.smetadan_tashqari = p_belgi then return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_eski.versiya, 'takror', true); end if;
  update public.t2_svod_yaxlit
     set smetadan_tashqari = p_belgi, versiya = versiya + 1, yangilandi = now(),
         dalil = dalil || jsonb_build_object('tashqari_sabab', btrim(p_sabab), 'tashqari_actor_id', p_actor_id, 'tashqari_belgi', p_belgi)
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'versiya', v_eski.versiya + 1, 'smetadan_tashqari', p_belgi);
end $$;
revoke all on function public.t2_svod_yaxlit_tashqari_v1(bigint, bigint, bigint, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.t2_svod_yaxlit_tashqari_v1(bigint, bigint, bigint, boolean, integer, text) to service_role;

-- 3) Paket qismi: «smetadan tashqari» — ustamasiz va QQS bilan (QQS obyekt koeffitsientidan; ustama yo'q — bo'lim ustamasiz).
create or replace function public._t2_summa_paket_tashqari_v1(p_agg jsonb, p_nk jsonb)
returns jsonb language sql stable set search_path = public, pg_temp as $fn$
  select case when coalesce((p_agg->>'smetadan_tashqari_soni')::int, 0) = 0 then '{}'::jsonb
    else jsonb_build_object('smetadan_tashqari', jsonb_build_object(
      'ustamasiz', round((p_agg->>'smetadan_tashqari')::numeric, 2),
      'qqs_foiz', coalesce((p_nk->>U&'\041D\0414\0421')::numeric, 0),
      'qqs_bilan', round((p_agg->>'smetadan_tashqari')::numeric * (1 + coalesce((p_nk->>U&'\041D\0414\0421')::numeric, 0) / 100), 2),
      'soni', (p_agg->>'smetadan_tashqari_soni')::int)) end
$fn$;
revoke all on function public._t2_summa_paket_tashqari_v1(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._t2_summa_paket_tashqari_v1(jsonb, jsonb) to service_role;
comment on function public._t2_summa_paket_tashqari_v1(jsonb, jsonb) is
  'Smetadan tashqari bo''lim summasi (paket qismi). versiya: texnik — o''zi t2_qator o''qimaydi; yamalgan funksiyalardagi tq daraxti faqat _t2_smeta_qatlam_qator_v1 (faol versiya) natijasini filtrlaydi.';

-- 4) _t2_summa_agg_v1 (7 arg), 5) _t2_summa_paket_v1, 6) t2_smeta_ozgarish_qatlam_v1 — yamoq.
do $mig$
declare
  v_oid oid; v_eski text; v_yangi text; n int; i int; r record;
  -- (nom, langar, almashtirish) uchliklari bitta massivda; har langar aynan 1 marta topilishi shart.
  v_agg text[] := array[
    $s$select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka$s$,
    $s$select y.id, y.obyekt_id, y.qator_id, y.turi, y.kontragent_nom, y.svod_summa, y.qqs_stavka, (y.smetadan_tashqari and p_olchov in ('smeta', 'smeta_joriy')) as tsh$s$,
    $s$case when u.ustama_bor then null else b.kontragent_nom end as kontragent_nom$s$,
    $s$case when u.ustama_bor then null else b.kontragent_nom end as kontragent_nom, coalesce(b.tsh, false) as tsh$s$,
    $s$from r where r.turi = 'subpudrat' group by 1, 2$s$,
    $s$from r where r.turi = 'subpudrat' and not r.tsh group by 1, 2$s$,
    $s$from bolim0 b left join bs on bs.bolim_id = b.id$s$,
    $s$from (select * from bolim0 where not tsh) b left join bs on bs.bolim_id = b.id$s$,
    $s$from r group by r.obyekt_id$s$,
    $s$from r where not r.tsh group by r.obyekt_id$s$,
    $s$sub as ($s$,
    $s$tq as (
    select b.obyekt_id,
           sum(case when b.svod_summa is not null then round(b.svod_summa / (1 + b.qqs_stavka / 100), 2) else coalesce(bs.s, 0) end) as qqssiz,
           count(*) as soni
      from bolim0 b left join bs on bs.bolim_id = b.id
     where b.tsh
     group by b.obyekt_id
  ),
  sub as ($s$,
    $s$'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb))$s$,
    $s$'subpudratchilar', coalesce(sub.royxat, '[]'::jsonb),
      'smetadan_tashqari', coalesce(tq.qqssiz, 0), 'smetadan_tashqari_soni', coalesce(tq.soni, 0))$s$,
    $s$left join sub on sub.obyekt_id = o.id$s$,
    $s$left join sub on sub.obyekt_id = o.id left join tq on tq.obyekt_id = o.id$s$
  ];
  v_paket text[] := array[
    $s$n.x->'podval_id', 'olchov', p_olchov) as paket$s$,
    $s$n.x->'podval_id', 'olchov', p_olchov) || public._t2_summa_paket_tashqari_v1(a.agg, n.x->'nk') as paket$s$
  ];
  v_rpc text[] := array[
    $s$with recursive l as materialized (select * from public._t2_smeta_qatlam_qator_v1(array[p_obyekt_id])),$s$,
    $s$with recursive tq(root_id, id) as (
    select y.qator_id, y.qator_id from public.t2_svod_yaxlit y where y.faol and y.smetadan_tashqari and y.obyekt_id = p_obyekt_id
    union all
    select tq.root_id, c.id from public.t2_qator c join tq on c.ota_id = tq.id where c.obyekt_id = p_obyekt_id
  ),
  l0 as materialized (select * from public._t2_smeta_qatlam_qator_v1(array[p_obyekt_id])),
  l as materialized (select x.* from l0 x where not exists (select 1 from tq where tq.id = x.qator_id)),$s$,
    $s$'ok', true, 'obyekt_id', p_obyekt_id,$s$,
    $s$'ok', true, 'obyekt_id', p_obyekt_id,
    'smetadan_tashqari', coalesce(v_joriy->'smetadan_tashqari', '{}'::jsonb) || jsonb_build_object('qatorlar', coalesce((
      select jsonb_agg(jsonb_build_object('qator_id', z.root_id, 'nom', zq.nom, 'summa', z.s) order by z.s desc nulls last, z.root_id)
        from (select tq.root_id, sum(x.summa) as s from tq join l0 x on x.qator_id = tq.id group by tq.root_id) z
        join public.t2_qator zq on zq.id = z.root_id), '[]'::jsonb)),$s$
  ];
  v_nomlar text[] := array['_t2_summa_agg_v1', '_t2_summa_paket_v1', 't2_smeta_ozgarish_qatlam_v1'];
  v_juftlar text[];
begin
  for i in 1 .. 3 loop
    v_juftlar := case i when 1 then v_agg when 2 then v_paket else v_rpc end;
    select p.oid into v_oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_nomlar[i]
       and (i <> 1 or p.pronargs = 7) and (i <> 2 or p.pronargs = 5) and (i <> 3 or p.pronargs = 2);
    if v_oid is null then raise exception 'SMETADAN_TASHQARI: % topilmadi', v_nomlar[i]; end if;
    v_eski := pg_get_functiondef(v_oid);
    if position('smetadan_tashqari' in v_eski) > 0 then
      raise notice 'SMETADAN_TASHQARI: % allaqachon yamalgan - o''tkazildi', v_nomlar[i];
      continue;
    end if;
    v_yangi := v_eski;
    for j in 1 .. cardinality(v_juftlar) / 2 loop
      n := (length(v_yangi) - length(replace(v_yangi, v_juftlar[2 * j - 1], ''))) / length(v_juftlar[2 * j - 1]);
      if n <> 1 then raise exception 'SMETADAN_TASHQARI: % langari (#%) %-marta topildi (kutilgan 1) - ta''rif o''zgargan', v_nomlar[i], j, n; end if;
      v_yangi := replace(v_yangi, v_juftlar[2 * j - 1], v_juftlar[2 * j]);
    end loop;
    insert into public._t2_fn_zaxira (nom, tarif) values (v_nomlar[i] || ':20261221620000', v_eski) on conflict (nom) do nothing;
    execute v_yangi;
  end loop;
end
$mig$;
