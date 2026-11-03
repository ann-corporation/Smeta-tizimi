import { afterEach,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { OmborOvozYordam } from './OmborOvozYordam';
const takliflar=[{nom:'Sement',birliklar:['qop'],yetkazuvchilar:['Zavod'],manbaQatorlar:[1]}];
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('manual transcript offers grounded draft fields only after explicit selection; issue cannot enter receipt',()=>{
  const onTaklif=vi.fn();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  render(<OmborOvozYordam kompaniyaId={2} takliflar={takliflar} onTaklif={onTaklif}/>);
  fireEvent.click(screen.getByText('Ovoz yoki matndan kirim taklifi'));
  fireEvent.change(screen.getByLabelText('O‘qilgan matn — tahrirlash mumkin'),{target:{value:'Sement 50 qop keldi Zavod'}});
  expect(onTaklif).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Topilgan takliflarni qatorga olish'}));
  expect(onTaklif).toHaveBeenCalledWith({nom:'Sement',miqdor:'50',birlik:'qop',yetkazuvchi:'Zavod'});
  fireEvent.change(screen.getByLabelText('O‘qilgan matn — tahrirlash mumkin'),{target:{value:'Sement 10 qop berdim'}});
  expect((screen.getByRole('button',{name:'Topilgan takliflarni qatorga olish'}) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it('file selection does not transmit; explicit transcription creates editable text and scope change cancels late response',async()=>{
  let resolve!:(r:Response)=>void;const fetcher=vi.fn((_url:RequestInfo|URL,_init?:RequestInit)=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
  const onTaklif=vi.fn();const view=render(<OmborOvozYordam kompaniyaId={2} takliflar={takliflar} onTaklif={onTaklif}/>);
  fireEvent.click(screen.getByText('Ovoz yoki matndan kirim taklifi'));
  fireEvent.change(screen.getByLabelText('Ovoz fayli'),{target:{files:[new File(['audio'],'speech.webm',{type:'audio/webm'})]}});
  expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Matnga o‘girish'}));
  const init=fetcher.mock.calls[0][1] as RequestInit;expect((init.body as FormData).get('kompaniya_id')).toBe('2');
  view.rerender(<OmborOvozYordam kompaniyaId={3} takliflar={takliflar} onTaklif={onTaklif}/>);
  expect(init.signal?.aborted).toBe(true);
  await act(async()=>{resolve(Response.json({ok:true,text:'Sement 50 qop keldi'}));});
  expect((screen.getByLabelText('O‘qilgan matn — tahrirlash mumkin') as HTMLTextAreaElement).value).toBe('');expect(onTaklif).not.toHaveBeenCalled();
});
it('provider text stays editable and never directly applies or posts fields',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true,text:'Sement 2 qop keldi'}));vi.stubGlobal('fetch',fetcher);
  const onTaklif=vi.fn();render(<OmborOvozYordam kompaniyaId={2} takliflar={takliflar} onTaklif={onTaklif}/>);
  fireEvent.click(screen.getByText('Ovoz yoki matndan kirim taklifi'));
  fireEvent.change(screen.getByLabelText('Ovoz fayli'),{target:{files:[new File(['audio'],'speech.webm',{type:'audio/webm'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Matnga o‘girish'}));
  await waitFor(()=>expect((screen.getByLabelText('O‘qilgan matn — tahrirlash mumkin') as HTMLTextAreaElement).value).toBe('Sement 2 qop keldi'));
  expect(onTaklif).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('stops microphone tracks if permission resolves after unmount',async()=>{
  let resolve!:(s:MediaStream)=>void;const stop=vi.fn();const stream={getTracks:()=>[{stop}]} as unknown as MediaStream;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise<MediaStream>(r=>{resolve=r;})}});
  vi.stubGlobal('MediaRecorder',class{});
  const view=render(<OmborOvozYordam kompaniyaId={2} takliflar={takliflar} onTaklif={()=>undefined}/>);
  fireEvent.click(screen.getByText('Ovoz yoki matndan kirim taklifi'));fireEvent.click(screen.getByRole('button',{name:'Ovoz yozish'}));
  view.unmount();await act(async()=>resolve(stream));expect(stop).toHaveBeenCalledTimes(1);
  Reflect.deleteProperty(navigator,'mediaDevices');
});
