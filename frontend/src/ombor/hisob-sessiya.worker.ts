import { HisobSessiya, type SessiyaSorov, type SessiyaJavob } from './hisob-sessiya';
const sessiya=new HisobSessiya();
const port=globalThis as unknown as {onmessage:(e:MessageEvent<SessiyaSorov>)=>void;postMessage:(x:SessiyaJavob)=>void};
port.onmessage=e=>port.postMessage(sessiya.ishlov(e.data));
