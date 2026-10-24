-- Rollback: faqat ishlatilmagan turlar o'chadi (murojaatda ishlatilgan bo'lsa FK sababli to'xtaydi - u holda faol=false qiling).
delete from public.t2_tomon_murojaat_turi where kalit in ('ozgartirish_sorovi', 'hujjat_sorovi');
