import { hisobIshlov } from './hisob-ishlov';
import type { HisobSorov, HisobJavob } from './hisob-protokol';

// DOM va WebWorker lib birgalikdagi global overloadlariga bog‘lanmaydi.
const port = globalThis as unknown as {
  onmessage: (e: MessageEvent<HisobSorov>) => void;
  postMessage: (x: HisobJavob) => void;
};
port.onmessage = (e) => port.postMessage(hisobIshlov(e.data));
