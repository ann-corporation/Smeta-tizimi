do $$
declare r jsonb; v_id bigint;
begin
  if not exists (select 1 from public.t2_arxiv_siyosat where jadval = 't2_ai_telemetriya' and rejim = 'qator-arxiv' and saqlash_kun = 30) then raise exception 'ACC1: arxiv siyosati yo''q'; end if;
  r := public.t2_ai_telemetriya_yoz_v1(1, null, 'jarvis', 'x/model', 1200, false, 'AI_XATO', 'savol', array['qidir', 'holat'], 1, 10, 5, 'model');
  if (r->>'ok')::boolean is not true then raise exception 'ACC2: telemetriya yozilmadi'; end if;
  r := public.t2_ai_telemetriya_yoz_v1(1, null, 'YOMON NOM!', null, -5, null, 'bad code!', 'bad niyat!', array['ok_tool', 'bad tool!'], -1, -1, -1, 'zzz');
  if (r->>'ok')::boolean is not true then raise exception 'ACC3: tozalash xatosi'; end if;
  if not exists (select 1 from public.t2_ai_telemetriya where yuza = 'boshqa' and actor_id = 1 and vaqt >= now() - interval '1 minute' and xato_kod is null and niyat is null and cardinality(vositalar) = 1 and vositalar[1] = 'ok_tool' and kechikish_ms = 0 and kirish_token = 0 and chiqish_token = 0 and vosita_xato = 0 and javob_manba is null) then raise exception 'ACC4: noto''g''ri qiymatlar tozalanmadi'; end if;
  if (public.t2_ai_baho_yoz_v1(1, null, 1, 'jarvis', null)->>'code') <> 'KOMPANIYA_KERAK' then raise exception 'ACC5: kompaniyasiz baho'; end if;
  if (public.t2_ai_baho_yoz_v1(1, 1, 5, 'jarvis', null)->>'ok')::boolean is true then raise exception 'ACC6: baho tekshiruvi'; end if;
  if (public.t2_ai_salomatlik_v1(-1)->>'ok')::boolean is not false then raise exception 'ACC7: superadmin bo''lmagan o''qiy olmasligi kerak'; end if;
  if (public.t2_ai_ishchi_holat_v1()->>'ok')::boolean is not true then raise exception 'ACC8: ishchi holati'; end if;
end $$;