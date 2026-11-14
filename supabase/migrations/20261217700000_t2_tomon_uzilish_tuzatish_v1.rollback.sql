-- Rollback: 20261217700000_t2_tomon_uzilish_tuzatish_v1.
-- B: tender_elon va C: hujjat_ol patchlari qaytariladi (qo'shilgan bloklar matn bo'yicha olinadi); belgilangan protsess_v2 qaytarilmaydi (ma'lumot yo'q edi: prodda 0).
do $b$
declare d text; n text; v_sig regprocedure := 'public.t2_tender_elon_v1(bigint,bigint,uuid,text,text,bigint[],bigint,timestamp with time zone,jsonb,jsonb)'::regprocedure; i int; j int;
begin
  d := pg_get_functiondef(v_sig);
  i := position('if p_doira = ''ochiq'' then return jsonb_build_object(''ok'', false, ''code'', ''OCHIQ_V2_KERAK''' in d);
  if i > 0 then
    j := position('if p_doira = ''taklif'' then' in substr(d, i));
    n := substr(d, 1, i - 1) || substr(d, i + j - 1);
    execute n;
  end if;
end $b$;
do $c$
declare d text; n text; v_sig regprocedure := 'public.t2_tomon_hujjat_ol_v1(bigint,bigint)'::regprocedure; i int; j int;
begin
  d := pg_get_functiondef(v_sig);
  i := position('if v_egasi is null then' || E'\n' || '    -- lab protokol fayli' in d);
  if i > 0 then
    j := position('  end if;' || E'\n' || '  if v_egasi is null then return jsonb_build_object(''ok'', false' in substr(d, i));
    n := substr(d, 1, i - 1) || substr(d, i + j + length('  end if;' || E'\n') - 1);
    execute n;
  end if;
end $c$;
-- A: eski dispetcher (qattiq rol ro'yxati)
create or replace function public.t2_outbox_ishlov_v1(p_iste_molchi text default 'bildirishnoma', p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_oxirgi bigint; v_chegara bigint; v_max bigint; v_soni integer := 0; v_bild integer := 0;
begin
  if p_iste_molchi is distinct from 'bildirishnoma' then return jsonb_build_object('ok', false, 'code', 'ISTE_MOLCHI_NOMALUM'); end if;
  insert into public.t2_outbox_kursor (iste_molchi) values (p_iste_molchi) on conflict do nothing;
  select oxirgi_id into v_oxirgi from public.t2_outbox_kursor where iste_molchi = p_iste_molchi for update;
  select min(o.id) into v_chegara from public.t2_outbox o where o.id > v_oxirgi and o.yaratildi >= now() - interval '60 seconds';
  with partiya as (
    select o.* from public.t2_outbox o where o.id > v_oxirgi and (v_chegara is null or o.id < v_chegara) order by o.id limit least(greatest(coalesce(p_limit, 500), 1), 2000)
  ), qabul as (
    select p.id outbox_id, p.mavzu, p.payload, a.foydalanuvchi_id, a.kompaniya_id
      from partiya p join public.t2_azolik a on a.kompaniya_id = any (p.qabul_kompaniya_idlar) and a.holat = 'faol' and a.rol in ('boss', 'admin', 'rahbar', 'director', 'pto')
     where a.foydalanuvchi_id is distinct from p.actor_id
    union
    select p.id, p.mavzu, p.payload, u.uid, null::bigint from partiya p cross join lateral unnest(p.foydalanuvchi_idlar) as u(uid) where u.uid is distinct from p.actor_id
  ), ins as (
    insert into public.t2_bildirishnoma (foydalanuvchi_id, kompaniya_id, outbox_id, mavzu, sarlavha_kalit, parametrlar)
    select q.foydalanuvchi_id, q.kompaniya_id, q.outbox_id, q.mavzu, 'bildirishnoma.' || q.mavzu, q.payload from qabul q
      join public.t2_foydalanuvchi f on f.id = q.foydalanuvchi_id and f.holat = 'faol'
    on conflict (foydalanuvchi_id, outbox_id) do nothing returning 1
  )
  select (select count(*) from partiya), (select max(id) from partiya), (select count(*) from ins) into v_soni, v_max, v_bild;
  if v_max is not null then update public.t2_outbox_kursor set oxirgi_id = v_max, yangilandi = now() where iste_molchi = p_iste_molchi; end if;
  return jsonb_build_object('ok', true, 'hodisa', v_soni, 'bildirishnoma', v_bild, 'kursor', coalesce(v_max, v_oxirgi));
end $fn$;
drop table if exists public.t2_outbox_mavzu_ruxsat;
