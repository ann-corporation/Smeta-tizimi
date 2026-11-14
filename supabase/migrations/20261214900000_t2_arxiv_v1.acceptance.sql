-- Acceptance: 20261214900000 t2_arxiv_v1 (BEGIN..ROLLBACK; forward migratsiya qo'llangan bazada).
begin;
set local statement_timeout = '300s';

do $$
declare
  v_actor bigint; v_komp bigint; v_loyiha bigint; v_sh bigint; v_kon bigint; v_r jsonb; v_n int;
begin
  -- Admin/superadmin a'zosi bo'lgan faol kompaniya va foydalanuvchi.
  select a.foydalanuvchi_id, a.kompaniya_id into v_actor, v_komp
    from t2_azolik a join t2_foydalanuvchi f on f.id = a.foydalanuvchi_id and f.holat = 'faol'
    join t2_kompaniya k on k.id = a.kompaniya_id and k.faol = true
   where a.holat = 'faol' and a.rol in ('admin','superadmin') limit 1;
  if v_actor is null then raise notice 'SKIP: mos admin topilmadi'; return; end if;

  insert into t2_loyiha (kompaniya_id, nom) values (v_komp, 'ARXIV-SINOV-LOYIHA') returning id into v_loyiha;
  insert into t2_kontragent (kompaniya_id, nom) values (v_komp, 'ARXIV-SINOV-KONTRAGENT') returning id into v_kon;

  -- 1) arxivlash -> korzinka ko'rinishida chiqadi
  v_r := t2_arxivla_v1(v_actor, 'loyiha', v_loyiha);
  if not (v_r->>'ok')::boolean then raise exception 'loyiha arxivlanmadi: %', v_r; end if;
  select count(*) into v_n from t2_korzinka where jadval = 't2_loyiha' and id = v_loyiha;
  if v_n <> 1 then raise exception 'korzinkada ko''rinmadi'; end if;

  -- 2) ikkinchi marta arxivlash rad etiladi
  v_r := t2_arxivla_v1(v_actor, 'loyiha', v_loyiha);
  if (v_r->>'ok')::boolean then raise exception 'ikkinchi arxivlash o''tib ketdi'; end if;

  -- 3) tiklash oldingi holatga
  v_r := t2_arxivdan_tiklash_v1(v_actor, 'loyiha', v_loyiha);
  if not (v_r->>'ok')::boolean then raise exception 'tiklanmadi: %', v_r; end if;
  if (select holat from t2_loyiha where id = v_loyiha) <> 'faol' then raise exception 'holat qaytmadi'; end if;

  -- 4) butunlay o'chirish faqat arxivdagiga
  v_r := t2_arxiv_butunlay_v1(v_actor, 'kontragent', v_kon);
  if (v_r->>'ok')::boolean then raise exception 'arxivda bo''lmagan o''chirildi'; end if;
  perform t2_arxivla_v1(v_actor, 'kontragent', v_kon);
  v_r := t2_arxiv_butunlay_v1(v_actor, 'kontragent', v_kon);
  if not (v_r->>'ok')::boolean then raise exception 'butunlay o''chirilmadi: %', v_r; end if;

  -- 5) noma'lum tur
  v_r := t2_arxivla_v1(v_actor, 'xyz', 1);
  if (v_r->>'ok')::boolean then raise exception 'noma''lum tur o''tdi'; end if;
end $$;

rollback;
