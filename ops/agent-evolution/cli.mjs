import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EvolutionQueue } from './runtime.mjs';
const [command, directory, input, adapterFile] = process.argv.slice(2);
try {
 if(!directory || !input || !['create','status','cancel','run'].includes(command)) throw Error('Usage: cli.mjs create|status|cancel|run PRIVATE_DIRECTORY JOB_JSON_OR_ID [TRUSTED_ADAPTER_MODULE]');
 const queue=new EvolutionQueue(directory);let result;
 if(command==='create')result=await queue.create(JSON.parse(await readFile(input,'utf8')));
 if(command==='status')result=await queue.read(input);
 if(command==='cancel')result=await queue.cancel(input);
 if(command==='run'){
  if(!adapterFile)throw Error('TRUSTED_ADAPTER_MODULE_REQUIRED');
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
  const {adapters}=await import(pathToFileURL(resolve(adapterFile)).href);
  result=await queue.run(input,adapters,{signal:controller.signal});
 }
 console.log(JSON.stringify({id:result.id,state:result.state,attempts:result.attempts,calls:result.calls}));
 if(['failed','rollback_failed','needs_reconciliation'].includes(result.state))process.exitCode=1;
} catch(error){console.error(error.message);process.exitCode=1;}
