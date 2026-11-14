import { readFile } from 'node:fs/promises';
import { EvolutionQueue } from './runtime.mjs';
import { createAdapters } from './github-pages-adapters.mjs';
const [configFile,id]=process.argv.slice(2);
try {
 if(!configFile||!id)throw Error('Usage: node live.mjs PRIVATE_CONFIG_JSON JOB_ID');
 const config=JSON.parse(await readFile(configFile,'utf8'));
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
 const queue=new EvolutionQueue(config.queueDirectory);
 const result=await queue.run(id,createAdapters(config),{signal:controller.signal,timeoutMs:1800000});
 console.log(JSON.stringify({id,state:result.state,sha:result.results.engineer?.headSha,preview:result.results.preview?.url,error:result.error}));
 if(result.state!=='completed')process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1;}
