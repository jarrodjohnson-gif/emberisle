import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeClaims, buildQueue, cell, dependencies, renderQueue, updateQueue } from './next-up.mjs';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/next-up/queue.json', import.meta.url)));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`ok ${name}`); }
const queue = buildQueue(fixture.issues, fixture.prs, fixture.comments, fixture.dependencyStates);
check('priority, milestone and issue-number order', () => assert.deepEqual(queue.ready.map(i => i.number), [6,5,17,18,11,16,2,7,8]));
check('priority precedes milestone even when P0 has no milestone', () => {
 const order=queue.ready.map(issue=>issue.number);assert(order.indexOf(11)<order.indexOf(16));
});
check('equal priority and milestone use issue number, not API input order', () => {
 const order=queue.ready.map(issue=>issue.number);assert(order.indexOf(17)<order.indexOf(18));
 assert(fixture.issues.findIndex(issue=>issue.number===18)<fixture.issues.findIndex(issue=>issue.number===17));
});
check('claims, same-agent pauses, draft PRs and different-agent pauses', () => assert.deepEqual(queue.taken.map(r => [r.issue.number,r.claims,r.prs.map(p=>p.number)]), [[1,['Alpha'],[]],[3,[],[30]],[12,['Alpha'],[]]]));
check('open and unknown dependencies block; closed dependency is eligible', () => assert.deepEqual(queue.blocked.map(r=>r.issue.number), [4,13]));
check('dependencies do not include source references', () => assert.deepEqual(dependencies(fixture.issues[3].body), [99]));
check('claim can be renewed after release; quoted claims do not claim', () => assert.deepEqual(activeClaims([{body:'claimed: Alpha, 2026-10-18\npaused: Alpha, 2026-10-18\nclaimed: Alpha, 2026-10-18\n> claimed: Beta, 2026-10-18'}]), ['Alpha']));
check('body, exact issue boundary and closed PR handling', () => {
 const q=buildQueue(fixture.issues,[{number:33,state:'open',title:'Feature',body:'Closes #11.'}],fixture.comments,fixture.dependencyStates);
 assert(q.taken.some(r=>r.issue.number===11));assert(q.ready.some(i=>i.number===2));
});
check('table text escapes pipes, newlines, Markdown and HTML', () => {
 const body=renderQueue(queue,'2026-10-19T00:00:00Z');
 assert(body.startsWith('Updated 2026-10-19T00:00:00Z'));
 assert(body.includes('Released \\| safe'));assert(body.includes('src/example.ts'));
 assert(!cell('<img>\n[x]|').includes('<img>'));assert(!cell('a\nb').includes('\n'));
});

// Real orchestration against a fake transport: exercise pagination, dependency fetching and the sole permitted mutation.
const target = {number:200,title:'Next up (auto)',state:'open',labels:['next-up']};
async function simulate({targets=[target],badRead=false,fullIssues=false}={}) {
 const calls=[];
 const fetchImpl=async (url,options)=>{
  const path=url.replace('https://api.github.com/repos/owner/repo','');calls.push({path,...options});
  let data;
  if(options.method==='PATCH')data={number:200};
  else if(path.startsWith('/issues?state=open&labels=next-up'))data=targets;
  else if(path.startsWith('/labels?'))data=[{name:'lane:net'},{name:'lane:hud'},{name:'lane:docs'}];
  else if(path.startsWith('/issues?state=open&labels=lane%3A'))data=fullIssues ? Array.from({length:100},(_,i)=>({...fixture.issues[0],number:i+1})) : fixture.issues.map(i=>({...i,comments:(fixture.comments[i.number]??[]).length}));
  else if(path.startsWith('/pulls?'))data=fixture.prs;
  else if(/^\/issues\/\d+\/comments/.test(path))data=fixture.comments[Number(path.split('/')[2])]??[];
  else if(/^\/issues\/\d+$/.test(path))data={state:fixture.dependencyStates[Number(path.split('/')[2])]??'open'};
  else throw Error(`Unexpected path ${path}`);
  return {ok:!badRead,status:badRead?503:200,json:async()=>data};
 };
 let result,error;
 try {result=await updateQueue({repo:'owner/repo',token:'fixture-token',fetchImpl,now:'fixture-time'});}catch(e){error=e;}
 return {calls,result,error};
}
const success=await simulate();
check('API updates exactly one issue body and no other resource',()=>{
 assert.ifError(success.error);const writes=success.calls.filter(c=>c.method!=='GET');
 assert.equal(writes.length,1);assert.equal(writes[0].path,'/issues/200');assert.deepEqual(Object.keys(JSON.parse(writes[0].body)),['body']);
 assert.equal(success.result.ready,9);
});
for(const [name,options] of [['missing target',{targets:[]}],['duplicate target',{targets:[target,{...target,number:201}]}],['wrong target title',{targets:[{...target,title:'Other'}]}],['failed API read',{badRead:true}],['issue cap reached',{fullIssues:true}]]) {
 const run=await simulate(options);
 check(`${name} refuses all writes`,()=>{assert(run.error);assert(!run.calls.some(c=>c.method!=='GET'));});
}
check('no credentials appear in rendered queue',()=>assert(!JSON.parse(success.calls.find(c=>c.method==='PATCH').body).body.includes('fixture-token')));
console.log(`next-up prove ok: ${checks} checks`);
