const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function fixture(){
 let captures=[];
 const api={cancelRequests(){},onUnauthorized(){},brief:async(l,s,o)=>{captures.push({site:s,alternative:o});return {markdown:'brief',source:'template'}},assets:async()=>[],operators:async()=>[],plans:async()=>[],notices:async()=>[]};
 const exports={};
 const source=ts.transpileModule(fs.readFileSync('src/mission.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(source,{exports,require:id=>id==='./api'?{api}:require(id),setTimeout,clearTimeout,history:{replaceState(){}},Date,JSON,console});
 const store=exports.useMission;store.getState().applySession({user:{id:'a'},organization:{id:'org'},organization_id:'org',authenticated:true,permissions:['plans:write']});
 return {store,api,captures};
}
const assessment=site=>({site,assets:[],summary:{expected_loss_meur:0}});
test('account transitions reset private state and discard delayed assessment and refresh',async()=>{
 const {store,api}=fixture();let finish;
 api.assess=()=>new Promise(r=>finish=r);api.footprint=async()=>({});
 store.setState({missionReady:true,connected:true,missionName:'Private A',site:{x:100,y:200},assessment:assessment({x:100,y:200}),brief:{markdown:'private'}});
 const old=store.getState().analyze();
 store.getState().applySession({user:{id:'b'},organization:{id:'org'},organization_id:'org',authenticated:true});
 finish(assessment({x:100,y:200}));assert.equal(await old,false);
 assert.equal(store.getState().missionName,'');assert.equal(store.getState().assessment,null);assert.equal(store.getState().brief,null);assert.equal(store.getState().site.x,0);
 let plans;api.plans=()=>new Promise(r=>plans=r);
 const refresh=store.getState().refresh();
 store.getState().applySession({user:{id:'c'},organization:{id:'org'},organization_id:'org',authenticated:true});
 plans([{id:'private-b'}]);await refresh;assert.equal(store.getState().plans.length,0);
});
test('briefing always uses current assessed site before/after optimization, adoption, undo and revision',async()=>{
 const {store,captures}=fixture(),original={x:0,y:0},candidate={x:800,y:900};
 store.setState({assessment:assessment(original)});await store.getState().generateBrief();
 store.setState({optimization:{target:assessment(original),best:assessment(candidate)}});await store.getState().generateBrief();
 store.getState().adoptSite(candidate,'Candidate');store.setState({assessment:assessment(candidate)});await store.getState().generateBrief();
 store.getState().undoAdopt();store.setState({assessment:assessment(original)});await store.getState().generateBrief();
 store.setState({site:candidate,assessment:assessment(candidate),editingPlanId:'plan',editingRevision:2});await store.getState().generateBrief();
 assert.deepEqual(captures.map(c=>JSON.parse(JSON.stringify(c.site))),[original,original,candidate,original,candidate]);
 assert.equal(captures[2].alternative,null);assert.equal(captures[4].alternative,null);
 store.getState().clearPrivate();
});
test('late briefing cannot populate another account',async()=>{
 const {store,api}=fixture();let finish;api.brief=()=>new Promise(r=>finish=r);
 store.setState({assessment:assessment({x:0,y:0})});const pending=store.getState().generateBrief();
 store.getState().clearPrivate();finish({markdown:'private account A'});await pending;assert.equal(store.getState().brief,null);
});
