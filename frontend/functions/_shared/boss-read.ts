// Both versions are finite read models. Enforce a transport ceiling as well.
export async function boundedText(response:Response):Promise<string> {
  if(!response.body) return '';
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>4*1024*1024){await reader.cancel();throw new Error('BOSS_RESPONSE_TOO_LARGE');}chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}
