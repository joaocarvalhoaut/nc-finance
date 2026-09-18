import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function load(entry, mockAnalytics=false) {
 const r=await build({entryPoints:[entry], bundle:true, write:false, platform:'node', format:'cjs', external:['react','react-dom','react-dom/server'], define:{'import.meta.env.VITE_POSTHOG_KEY':'"phc_test"','import.meta.env.VITE_POSTHOG_HOST':'"https://us.i.posthog.com"','import.meta.env.DEV':'false'}, plugins:mockAnalytics?[{name:'mock-posthog',setup(b){b.onResolve({filter:/^posthog-js$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default globalThis.__analyticsSdk',loader:'js'}));}}]:[]});
 const module={exports:{}};new Function('module','exports','require',r.outputFiles[0].text)(module,module.exports,require);return module.exports;
}
const opt=await load('supabase/functions/_shared/optOut.ts');
function db(response) {const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>response,then:(resolve)=>Promise.resolve(response).then(resolve)};return {from:()=>chain};}
await assert.rejects(()=>opt.isOptedOut(db({error:{message:'secret'},data:null}),'u','5511999999999'));
await assert.rejects(()=>opt.fetchOptOutSet(db({error:{message:'secret'},data:null}),'u'));
assert.equal(await opt.isOptedOut(db({error:null,data:{id:'1'}}),'u','5511999999999'),true);
assert.equal(await opt.isOptedOut(db({error:null,data:null}),'u','5511999999999'),false);
const limiter=await load('supabase/functions/_shared/rateLimit.ts');
assert.equal((await limiter.checkRateLimit({rpc:async()=>({error:{message:'secret'}})},'u',1,60)).allowed,false);
assert.equal((await limiter.checkRateLimit({rpc:async()=>{throw Error('offline')}},'u',1,60)).allowed,false);
const reservation=await load('supabase/functions/_shared/sendReservation.ts');
await assert.rejects(()=>reservation.reserveChargeSend({rpc:async()=>({error:{message:'missing'}})},'u','k'));
assert.equal(await reservation.reserveChargeSend({rpc:async()=>({data:false})},'u','k'),false);
let options, enabled=false, count=0;
globalThis.localStorage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
globalThis.__analyticsSdk={init(k,o){options=o},opt_in_capturing(){enabled=true},opt_out_capturing(){enabled=false},capture(){if(enabled)count++},identify(){},reset(){}};
const a=await load('src/lib/analytics.ts',true);
a.bootstrapAnalytics();assert.equal(options,undefined);
a.grantAnalyticsConsent();a.track('test');assert.equal(count,1);
a.declineAnalyticsConsent();a.track('test');assert.equal(count,1);
a.grantAnalyticsConsent();a.track('test');assert.equal(count,2);
assert.equal(options.disable_session_recording,true);
const sanitized=options.sanitize_properties({nested:{email:'a@example.com'},items:[{phone:'5511999999999'}],$current_url:'https://example.com/private/client#token'});
assert.equal(sanitized.nested.email,'[redacted]');assert.equal(sanitized.items[0].phone,'[redacted]');assert.equal(sanitized.$current_url,'https://example.com');
console.log('Proteções: falhas de opt-out, rate limit, reserva e ciclo de consentimento passaram.');

const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const Sidebar=(await load('src/components/Sidebar.tsx')).default;
const html=renderToStaticMarkup(React.createElement(Sidebar,{currentTab:'dashboard',onTabChange(){},isLoggedIn:true,onLogout(){},onLoginClick(){}}));
for(const label of ['Resumo','Carteira','Cobranças','Automações','Configurações','Expandir menu']) assert.ok(html.includes('aria-label="'+label+'"'),label);
for(const entry of ['send-whatsapp-charge','send-whatsapp-batch','process-dispatch-jobs','run-automation-scheduler','whatsapp-inbound']) await build({entryPoints:['supabase/functions/'+entry+'/index.ts'],bundle:true,write:false,platform:'neutral',packages:'external',format:'esm'});
console.log('Navegação acessível e sintaxe das funções alteradas verificadas.');
