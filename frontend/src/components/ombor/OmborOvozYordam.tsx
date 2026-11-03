import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/til';
import type { PrixodMaydonlar } from '../../lib/ombor-prixod/qoralama';
import type { MaterialTaklif } from '../../lib/ombor-prixod/taklif';
import { ovozdanKirimTaklif } from '../../lib/ombor-prixod/ovoz-taklif';

const MAX_AUDIO=7*1024*1024;
const ERROR_TEXT:Record<string,string>={
  VOICE_NOT_CONFIGURED:'Ovoz xizmati hali ulanmagan.', VOICE_NO_SPEECH:'Yozuvda nutq topilmadi.',
  VOICE_BUSY:'Ovoz xizmati band. Keyinroq qayta urinib ko‘ring.', PERMISSION_DENIED:'Bu kompaniyada ovoz xizmatidan foydalanish huquqi yo‘q.',
  AUDIO_TOO_LARGE:'Ovoz fayli juda katta. Qisqaroq yozuvni tanlang.',
};

/** User-triggered capture/transcription only. No stock or financial write capability. */
export function OmborOvozYordam({kompaniyaId,takliflar,onTaklif}:{
  kompaniyaId:number;takliflar:MaterialTaklif[];onTaklif:(fields:Partial<PrixodMaydonlar>)=>void;
}){
  const [matn,setMatn]=useState('');const [audio,setAudio]=useState<Blob|null>(null);
  const [yozmoqda,setYozmoqda]=useState(false);const [band,setBand]=useState(false);const [xato,setXato]=useState('');
  const recorder=useRef<MediaRecorder|null>(null);const stream=useRef<MediaStream|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);const request=useRef<AbortController|null>(null);
  const generation=useRef(0);const starting=useRef(false);const [boshlanmoqda,setBoshlanmoqda]=useState(false);
  const stopTracks=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>{
    const activeGeneration=generation;
    generation.current++;setMatn('');setAudio(null);setXato('');setBand(false);setYozmoqda(false);setBoshlanmoqda(false);starting.current=false;
    return()=>{activeGeneration.current++;request.current?.abort();request.current=null;
      if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;if(recorder.current.state!=='inactive')recorder.current.stop();}
      recorder.current=null;stopTracks();};
  },[kompaniyaId]);
  const taklif=useMemo(()=>ovozdanKirimTaklif(matn,takliflar),[matn,takliflar]);
  const yozishniBoshla=async()=>{
    if(starting.current||yozmoqda||band)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setXato(t('Bu brauzerda ovoz yozish mavjud emas. Ovoz faylini tanlang.'));return;}
    const gen=generation.current;starting.current=true;setBoshlanmoqda(true);setXato('');
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      if(gen!==generation.current){s.getTracks().forEach(track=>track.stop());return;}
      stream.current=s;const mime=['audio/webm','audio/mp4','audio/ogg'].find(v=>MediaRecorder.isTypeSupported(v));
      const r=new MediaRecorder(s,mime?{mimeType:mime}:undefined);recorder.current=r;
      const chunks:Blob[]=[];let size=0;let tooLarge=false;
      r.ondataavailable=event=>{if(event.data.size){size+=event.data.size;if(size>MAX_AUDIO){tooLarge=true;if(r.state!=='inactive')r.stop();}else chunks.push(event.data);}};
      r.onstop=()=>{stopTracks();if(gen!==generation.current)return;setYozmoqda(false);recorder.current=null;
        if(tooLarge){setAudio(null);setXato(t('Ovoz fayli juda katta. Qisqaroq yozuvni tanlang.'));return;}
        const blob=new Blob(chunks,{type:r.mimeType||mime||'audio/webm'});setAudio(blob.size?blob:null);};
      setAudio(null);r.start(1000);setYozmoqda(true);timer.current=setTimeout(()=>{if(r.state!=='inactive')r.stop();},60_000);
    }catch{if(gen===generation.current){stopTracks();setXato(t('Mikrofon ochilmadi. Ruxsatni tekshiring yoki ovoz faylini tanlang.'));}}
    finally{if(gen===generation.current){starting.current=false;setBoshlanmoqda(false);}}
  };
  const matngaOgir=async()=>{
    if(!audio||band||yozmoqda)return;
    const gen=generation.current;const controller=new AbortController();request.current=controller;setBand(true);setXato('');
    try{
      const form=new FormData();form.set('audio',audio,'ombor-audio');form.set('kompaniya_id',String(kompaniyaId));form.set('language','auto');
      const r=await fetch('/api/ombor-ovoz',{method:'POST',body:form,signal:controller.signal,credentials:'same-origin'});
      const data:unknown=await r.json();
      if(gen!==generation.current||controller.signal.aborted)return;
      if(!data||typeof data!=='object')throw new Error('VOICE_ERROR');
      if(!r.ok||!('text'in data)||typeof data.text!=='string'){
        const code='code'in data&&typeof data.code==='string'?data.code:'';
        setXato(t(ERROR_TEXT[code]??'Ovozni o‘qib bo‘lmadi. Matnni qo‘lda kiriting.'));return;
      }
      setMatn(data.text);setAudio(null);
    }catch{if(gen===generation.current&&!controller.signal.aborted)setXato(t('Ovozni o‘qib bo‘lmadi. Matnni qo‘lda kiriting.'));}
    finally{if(gen===generation.current){setBand(false);request.current=null;}}
  };
  const taklifMumkin=Object.keys(taklif.maydonlar).length>0&&taklif.operatsiya==='prixod';
  return <details className="rounded-md border border-border p-3">
    <summary className="min-h-[48px] cursor-pointer py-3 text-[13px] font-medium">{t('Ovoz yoki matndan kirim taklifi')}</summary>
    <div className="space-y-3">
      <p className="text-[12px] text-text-dim">{t('Yozuv «Matnga o‘girish» bosilganda ElevenLabs xizmatiga yuboriladi. Natija qoralama, avtomatik yozilmaydi.')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="fz-btn min-h-[48px]" disabled={band||boshlanmoqda||kompaniyaId<=0}
          onClick={()=>{if(yozmoqda){if(recorder.current?.state!=='inactive')recorder.current?.stop();}else void yozishniBoshla();}}>
          {yozmoqda?t('Yozishni to‘xtatish'):boshlanmoqda?t('Mikrofon ochilmoqda…'):t('Ovoz yozish')}</button>
        <label className="flex min-h-[48px] cursor-pointer items-center rounded-md border border-border px-3 text-[12px]">{t('Ovoz fayli')}
          <input type="file" accept="audio/*" className="sr-only" aria-label={t('Ovoz fayli')} disabled={band||yozmoqda||boshlanmoqda}
            onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(!f)return;setXato('');
              if(f.size>MAX_AUDIO){setAudio(null);setXato(t('Ovoz fayli juda katta. Qisqaroq yozuvni tanlang.'));}else setAudio(f);}} />
        </label>
        <button type="button" className="fz-btn min-h-[48px]" disabled={!audio||band||yozmoqda||boshlanmoqda||kompaniyaId<=0} onClick={()=>void matngaOgir()}>{band?t('Ovoz o‘qilmoqda…'):t('Matnga o‘girish')}</button>
        {band&&<button type="button" className="fz-btn min-h-[48px]" onClick={()=>request.current?.abort()}>{t('Bekor qilish')}</button>}
      </div>
      {audio&&<p className="text-[12px]" role="status">{t('Ovoz yozuvi tayyor. Matnga o‘girish uchun tasdiqlang.')}</p>}
      {yozmoqda&&<p role="status">{t('Yozilmoqda… Eng ko‘pi 60 soniya.')}</p>}
      <label className="block text-[12px]">{t('O‘qilgan matn — tahrirlash mumkin')}
        <textarea className="mt-1 min-h-24 w-full rounded-md border border-border bg-bg p-3 text-text" value={matn} onChange={e=>setMatn(e.target.value)} maxLength={60000} /></label>
      {matn&&<p className="text-[12px] text-text-dim">{t('Faqat katalogda topilgan nom, birlik va aniq miqdor taklif qilinadi. Yetishmagan qiymatlarni tekshiring.')}</p>}
      {matn&&taklif.operatsiya!=='prixod'&&<p className="text-[12px] text-warning" role="status">{t('Bu oyna kirim uchun. Matnda «keldi» yoki «kirim» aniq bo‘lishi kerak; chiqim bu yerda yozilmaydi.')}</p>}
      {matn&&taklif.noaniq&&<p className="text-[12px] text-warning">{t('Matnda noaniqlik bor. Har bir qiymatni alohida tekshiring.')}</p>}
      {taklifMumkin&&<div className="rounded border border-border p-2 text-[12px]">{Object.values(taklif.maydonlar).join(' · ')}</div>}
      <button type="button" className="fz-btn min-h-[48px]" disabled={!taklifMumkin||band||yozmoqda}
        onClick={()=>onTaklif(taklif.maydonlar)}>{t('Topilgan takliflarni qatorga olish')}</button>
      {xato&&<p role="alert" className="text-[12px] text-danger">{xato}</p>}
    </div>
  </details>;
}
