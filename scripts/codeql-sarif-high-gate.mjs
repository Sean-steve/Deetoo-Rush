// CI security gate: fail on high/critical CodeQL SARIF findings, with a precise location.
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const paths=[
  resolve(process.cwd(),'../results/javascript.sarif'),
  resolve(process.cwd(),'results/javascript.sarif'),
  ...(process.env.CODEQL_SARIF_PATH?[process.env.CODEQL_SARIF_PATH]:[])
];
const file=paths.find(existsSync);
if(!file){
 console.error('CodeQL SARIF not available; cannot prove the security gate. Looked in: '+paths.join(', '));
 process.exit(2);
}
const sarif=JSON.parse(readFileSync(file,'utf8'));
let high=0, all=0;
for(const run of sarif.runs||[]){
 const rules=new Map((run.tool?.driver?.rules||[]).map(rule=>[rule.id,rule]));
 for(const rule of run.tool?.extensions||[]){
   for(const entry of rule.rules||[])rules.set(entry.id,entry);
 }
 for(const result of run.results||[]){
  all++;
  const rule=rules.get(result.ruleId);
  const severity=Number(rule?.properties?.['security-severity']??result.properties?.['security-severity']??0);
  if(!(severity>=7))continue;
  high++;
  const loc=result.locations?.[0]?.physicalLocation||{};
  const at=(loc.artifactLocation?.uri||'(unknown file)')+':'+(loc.region?.startLine||'?');
  console.error('CodeQL HIGH '+severity.toFixed(1)+' '+result.ruleId+' '+at+' — '+(result.message?.text||result.message?.markdown||''));
 }
}
console.log('CodeQL SARIF: '+all+' findings, '+high+' high/critical (severity >= 7).');
if(high)process.exitCode=1;
