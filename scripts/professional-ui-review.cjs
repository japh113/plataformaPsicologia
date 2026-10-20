const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.REVIEW_BASE,pw='Episode-Demo-Only-284!',results=[],events=[],screenshots=[];
let browser,page,current='SETUP',allowed=new Set(),restrictedRequests=[];
const save=()=>fs.writeFileSync('/control/results.json',JSON.stringify({results,events,screenshots},null,2));
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const settle=async p=>p.waitForLoadState('networkidle',{timeout:10000});
function watch(p){p.on('pageerror',()=>events.push({scenario:current,type:'pageerror',expected:false}));p.on('response',r=>{if(r.status()>=400)events.push({scenario:current,type:'http',status:r.status(),expected:allowed.has(r.status())});});p.on('request',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/api/'))restrictedRequests.push(url.pathname);});}
async function shot(name,p=page){await p.screenshot({path:'/evidence/screenshots/'+name+'.png',fullPage:true,animations:'disabled',mask:[p.locator('input'),p.locator('textarea'),p.getByText(/Password demo:|@/)],maskColor:'#475569'});screenshots.push({file:'screenshots/'+name+'.png',scenario:current,secretsMasked:true});save();}
async function scenario(id,fn,statuses=[]){current=id;allowed=new Set(statuses);try{await fn();results.push({id,status:'PASS'});await shot(id);}catch(error){fs.writeFileSync('/control/browser-failure.txt',error.stack||error.message);results.push({id,status:'FAIL',failureCategory:error.name==='TimeoutError'?'timeout':'assertion'});try{await shot(id+'-failure');}catch{}save();throw Error('Scenario '+id+' failed');}save();console.log(id+' PASS');}
async function login(p,email){await p.goto(base);await button(p,'Iniciar sesion').click();await p.locator('input[name=email]').fill(email);await p.locator('input[name=password]').fill(pw);const response=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');await button(p,'Entrar').click();const session=(await(await response).json()).data;assert.ok(session);await settle(p);return session;}
async function json(p,path,method='GET',body){return p.evaluate(async({path,method,body})=>{const response=await fetch('http://api:5000/api'+path,{method,headers:{Authorization:'Bearer '+localStorage.getItem('psicopanel_auth_token'),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:(await response.json()).data};},{path,method,body});}
const reviewButton=(p,item)=>button(p,`Revisar ${item.name}, versión ${item.version}`);
async function openProposal(p,item){await reviewButton(p,item).click();await p.getByText(item.name,{exact:true}).waitFor();}
async function proposal(p,name){
 let profile=(await json(p,'/professional-profile/me')).data.profile;
 if(!profile){assert.equal((await json(p,'/professional-profile/me','POST',{})).status,200);profile=(await json(p,'/professional-profile/me')).data.profile;}
 const result=await json(p,'/professional-profile/me/credential-proposals','POST',{rowVersion:profile.rowVersion,professionalName:name,professionalTitle:'Synthetic title',licenseNumber:'Fixture only',academicTraining:[],formalSpecialties:[],certifications:[],credentialedApproaches:[]});
 assert.equal(result.status,200);return {...result.data,name};
}
async function tokenStatus(p,token){return p.evaluate(async token=>{const response=await fetch('http://api:5000/api/professional-status/me',{headers:{Authorization:'Bearer '+token}});return {status:response.status,body:await response.json()};},token);}
async function openAccount(p,name){await p.locator('article').filter({has:p.getByRole('heading',{name,exact:true})}).getByRole('button',{name:'Gestionar estado profesional',exact:true}).click();}
async function saveAccount(p,id){const response=p.waitForResponse(r=>new URL(r.url()).pathname===`/api/auth/psychologists/${id}/review`&&r.request().method()==='PATCH');await button(p,'Guardar revision').click();const result=await response;assert.equal(result.status(),200);await button(p,'Guardar revision').waitFor({state:'hidden'});return {payload:result.request().postDataJSON(),data:(await result.json()).data};}
async function main(){
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]});
 fs.writeFileSync('/control/runtime.json',JSON.stringify({playwright:require('playwright/package.json').version,chromium:browser.version(),node:process.version,revision:process.env.REVIEW_REVISION,headless:true}));
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX'});page=await context.newPage();watch(page);
 await scenario('D201',async()=>{restrictedRequests=[];await login(page,'pending@professional.invalid');await page.getByRole('heading',{name:'Pendiente de revisión',exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('psicopanel_auth_token')),null);assert.ok(restrictedRequests.every(p=>['/api/auth/login','/api/professional-status/me'].includes(p)));assert.equal(await button(page,'Mi perfil profesional').count(),0);});
 await scenario('D202',async()=>{await button(page,'Cerrar sesión').click();restrictedRequests=[];await login(page,'rejected@professional.invalid');await page.getByRole('heading',{name:'Solicitud rechazada',exact:true}).waitFor();assert.ok(restrictedRequests.every(p=>['/api/auth/login','/api/professional-status/me'].includes(p)));});
 await scenario('D203',async()=>{await button(page,'Cerrar sesión').click();restrictedRequests=[];await login(page,'suspended@professional.invalid');await page.getByRole('heading',{name:'Cuenta suspendida',exact:true}).waitFor();await page.getByText('Mensaje de prueba destinado expresamente al titular.',{exact:true}).waitFor();assert.ok(restrictedRequests.every(p=>['/api/auth/login','/api/professional-status/me'].includes(p)));assert.ok(!await page.locator('body').innerText().then(t=>t.includes('Reserved historical fixture')));});
 await scenario('D204',async()=>{await page.reload();await button(page,'Entrar').waitFor();await login(page,'pending@professional.invalid');await page.getByRole('heading',{name:'Pendiente de revisión',exact:true}).waitFor();await button(page,'Cerrar sesión').click();await button(page,'Entrar').waitFor();});
 await scenario('D205',async()=>{await login(page,'a@episodes.invalid');await button(page,'Mi perfil profesional').click();await button(page,'Crear perfil privado').click();await page.getByLabel('Descripción profesional',{exact:true}).fill('Descripción privada de prueba.');await page.getByLabel('Ciudad',{exact:true}).fill('Ciudad ficticia');await button(page,'Guardar información privada').click();await page.getByText('Información privada guardada.',{exact:true}).waitFor();assert.ok(await page.getByRole('combobox',{name:'Enfoques generales'}).isDisabled());});
 await scenario('D206',async()=>{await page.getByRole('textbox',{name:'Nombre profesional',exact:true}).fill('Profesional Ficticio D2');await page.getByRole('textbox',{name:'Cédula profesional',exact:true}).fill('Solo fixture');await button(page,'Presentar credenciales').click();await page.getByText('Versión 1. La propuesta permanece separada de lo aprobado.',{exact:true}).waitFor();});
 const admin=await browser.newContext({viewport:{width:1440,height:1000}}),admin2=await browser.newContext({viewport:{width:1440,height:1000}});const reviewer=await admin.newPage(),reviewer2=await admin2.newPage();watch(reviewer);watch(reviewer2);
 await scenario('D207',async()=>{await login(reviewer,'admin@identity.invalid');await login(reviewer2,'admin2@identity.invalid');for(const p of [reviewer,reviewer2]){await button(p,'Credenciales profesionales').click();await p.getByRole('button',{name:'Revisar Profesional Ficticio D2, versión 1',exact:true}).click();await p.getByRole('heading',{name:'Versión exacta 1',exact:true}).waitFor();assert.ok(await button(p,'Aprobar credenciales').isDisabled());await p.getByLabel('Razón destinada al profesional',{exact:true}).fill('Razón comunicable de prueba.');await p.getByLabel('Observaciones internas reservadas',{exact:true}).fill('RESERVED-D2-NOTE');}await button(reviewer,'Rechazar versión').click();await reviewer.getByText('Rechazo registrado. Se conserva la última versión aprobada.',{exact:true}).waitFor();await button(reviewer2,'Rechazar versión').click();await reviewer2.getByRole('alert').waitFor();await shot('D207-reviewer-conflict',reviewer2);},[409]);
 await scenario('D208',async()=>{await page.reload();await button(page,'Mi perfil profesional').click();await page.getByText('Versión 1: Rechazada. Razón comunicable de prueba.',{exact:true}).waitFor();const credentials=await json(page,'/professional-profile/me/credentials');assert.ok(!JSON.stringify(credentials).includes('RESERVED-D2-NOTE'));});
 await scenario('D209',async()=>{const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d').fillRect(0,0,32,32);return canvas.toDataURL('image/png').split(',')[1];});const png=Buffer.from(encoded,'base64');await page.getByLabel('Seleccionar fotografía',{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});await button(page,'Guardar fotografía privada').click();await page.getByText('Fotografía privada guardada.',{exact:true}).waitFor();await page.getByRole('img',{name:'Tu fotografía profesional privada'}).waitFor();});
 await scenario('D210',async()=>{const support=await browser.newContext(),p=await support.newPage();watch(p);await login(p,'support@identity.invalid');assert.equal(await button(p,'Credenciales profesionales').count(),0);assert.equal((await json(p,'/professional-reviews/pending')).status,403);await shot('D210-support',p);},[403]);
 await scenario('D211',async()=>{await button(reviewer,'Usuarios').click();const account=reviewer.locator('article').filter({has:reviewer.getByRole('heading',{name:'a',exact:true})});await account.getByRole('button',{name:'Gestionar estado profesional',exact:true}).click();await button(reviewer,'Suspender').click();await reviewer.getByLabel('Mensaje destinado al profesional',{exact:true}).fill('Suspensión ficticia comunicada.');await button(reviewer,'Guardar revision').click();await settle(reviewer);const request=await json(page,'/professional-profile/me');assert.ok([401,403].includes(request.status));await page.reload();await button(page,'Entrar').waitFor();restrictedRequests=[];await login(page,'a@episodes.invalid');await page.getByRole('heading',{name:'Cuenta suspendida',exact:true}).waitFor();assert.ok(restrictedRequests.every(p=>['/api/auth/login','/api/professional-status/me'].includes(p)));},[401,403]);
 await scenario('D212',async()=>{const account=reviewer.locator('article').filter({has:reviewer.getByRole('heading',{name:'a',exact:true})});await account.getByRole('button',{name:'Gestionar estado profesional',exact:true}).click();await button(reviewer,'Rehabilitar').click();await button(reviewer,'Guardar revision').click();await settle(reviewer);await button(page,'Cerrar sesión').click();await login(page,'a@episodes.invalid');await button(page,'Mi perfil profesional').click();const profile=(await json(page,'/professional-profile/me')).data.profile;assert.equal(profile.isPublic,false);assert.equal(profile.acceptsNewPatients,false);const width=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.document<=width.viewport+2);});
 // P2-02: isolate drafts and response ordering for two exact proposals.
 let ownerB,pendingA,pendingB;
 await scenario('D214',async()=>{
   ownerB=await(await browser.newContext()).newPage();watch(ownerB);await login(ownerB,'b@episodes.invalid');
   pendingA=await proposal(page,'P2 propuesta A');pendingB=await proposal(ownerB,'P2 propuesta B');
   await button(reviewer,'Credenciales profesionales').click();await openProposal(reviewer,pendingA);
   await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).fill('EXCLUSIVE-A-MESSAGE');
   await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).fill('EXCLUSIVE-A-INTERNAL');
   await openProposal(reviewer,pendingB);
   assert.equal(await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).inputValue(),'');
   assert.equal(await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).inputValue(),'');
   await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).fill('EXCLUSIVE-B-MESSAGE');
   await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).fill('EXCLUSIVE-B-INTERNAL');
   const response=reviewer.waitForResponse(r=>new URL(r.url()).pathname===`/api/professional-reviews/b/${pendingB.version}/decision`&&r.request().method()==='POST');
   await button(reviewer,'Rechazar versión').click();const result=await response;assert.equal(result.status(),200);
   assert.deepEqual(result.request().postDataJSON(),{rowVersion:pendingB.rowVersion,outcome:'rejected',ownerMessage:'EXCLUSIVE-B-MESSAGE',internalNote:'EXCLUSIVE-B-INTERNAL'});
   await reviewer.getByRole('status').waitFor();
   const own=(await json(ownerB,'/professional-profile/me/credentials')).data;
   assert.equal(own.decisions[0].version,pendingB.version);assert.equal(own.decisions[0].ownerMessage,'EXCLUSIVE-B-MESSAGE');
   assert.ok(!JSON.stringify(own).includes('EXCLUSIVE-A'));assert.ok(!JSON.stringify(own).includes('EXCLUSIVE-B-INTERNAL'));
   assert.equal((await json(page,'/professional-profile/me/credentials')).data.pending.version,pendingA.version);
   await shot('D214-isolated-review',reviewer);
 });
 await scenario('D215',async()=>{
   pendingB=await proposal(ownerB,'P2 propuesta B segunda');await button(reviewer,'Recargar propuestas').click();await reviewButton(reviewer,pendingB).waitFor();
   // Hold A's real GET response; let B finish, then deliver A out of order.
   let releaseA,receivedA;const gateA=new Promise(resolve=>{releaseA=resolve;}),seenA=new Promise(resolve=>{receivedA=resolve;});
   const pathA=`**/api/professional-reviews/a/${pendingA.version}`;
   await reviewer.route(pathA,async route=>{const response=await route.fetch();receivedA();await gateA;await route.fulfill({response});});
   try{
     await reviewButton(reviewer,pendingA).click();await seenA;await openProposal(reviewer,pendingB);
     await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).fill('B-AFTER-RACE');
     await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).fill('B-PRIVATE-AFTER-RACE');
     releaseA();await settle(reviewer);
     assert.equal(await reviewer.getByText(pendingB.name,{exact:true}).count(),1);
     assert.equal(await reviewer.getByText(pendingA.name,{exact:true}).count(),0);
     assert.equal(await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).inputValue(),'B-AFTER-RACE');
   }finally{releaseA();await reviewer.unroute(pathA);}
   assert.ok(await button(reviewer,'Aprobar credenciales').isDisabled());
   // Change B's aggregate after loading: the exact proposal is still pending,
   // but the UI must reject its stale rowVersion and require a fresh selection.
   const edited=await json(ownerB,'/professional-profile/me','PATCH',{rowVersion:pendingB.rowVersion,description:'Concurrent private fixture edit'});assert.equal(edited.status,200);
   let releaseDecision,receivedDecision;const gateDecision=new Promise(resolve=>{releaseDecision=resolve;}),seenDecision=new Promise(resolve=>{receivedDecision=resolve;});
   const pathB=`**/api/professional-reviews/b/${pendingB.version}/decision`;
   await reviewer.route(pathB,async route=>{if(route.request().method()!=='POST')return route.continue();receivedDecision();await gateDecision;await route.continue();});
   try{
     const response=reviewer.waitForResponse(r=>new URL(r.url()).pathname===`/api/professional-reviews/b/${pendingB.version}/decision`&&r.request().method()==='POST');
     await button(reviewer,'Rechazar versión').click();await seenDecision;
     assert.ok(await reviewButton(reviewer,pendingA).isDisabled());assert.ok(await reviewButton(reviewer,pendingB).isDisabled());
     assert.ok(await button(reviewer,'Recargar propuestas').isDisabled());assert.ok(await button(reviewer,'Rechazar versión').isDisabled());
     assert.ok(await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).isDisabled());
     releaseDecision();const result=await response;assert.equal(result.status(),409);assert.equal(result.request().postDataJSON().rowVersion,pendingB.rowVersion);
     await reviewer.getByRole('alert').filter({hasText:'Recarga la propuesta'}).waitFor();assert.equal(await button(reviewer,'Rechazar versión').count(),0);
   }finally{releaseDecision();await reviewer.unroute(pathB);}
   assert.equal((await json(ownerB,'/professional-profile/me/credentials')).data.pending.version,pendingB.version);
   assert.equal((await json(reviewer,'/professional-reviews/a/1')).status,409);
   await button(reviewer,'Recargar propuestas').click();await openProposal(reviewer,pendingB);
   assert.equal(await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).inputValue(),'');
   assert.equal(await reviewer.getByLabel('Observaciones internas reservadas',{exact:true}).inputValue(),'');
   await reviewer.getByLabel('Razón destinada al profesional',{exact:true}).fill('B-FRESH-DECISION');
   const response=reviewer.waitForResponse(r=>new URL(r.url()).pathname===`/api/professional-reviews/b/${pendingB.version}/decision`&&r.request().method()==='POST');
   await button(reviewer,'Rechazar versión').click();const result=await response;assert.equal(result.status(),200);assert.equal(result.request().postDataJSON().rowVersion,edited.data.profile.rowVersion);
   await reviewer.getByRole('status').waitFor();assert.equal((await json(ownerB,'/professional-profile/me/credentials')).data.decisions[0].ownerMessage,'B-FRESH-DECISION');
   assert.equal((await json(reviewer,`/professional-reviews/b/${pendingB.version}/decision`,'POST',{rowVersion:edited.data.profile.rowVersion,outcome:'rejected',ownerMessage:'No retry'})).status,409);
   await shot('D215-race-and-conflict',reviewer);
 },[409]);
 await scenario('D213',async()=>{
   await button(reviewer,'Usuarios').click();
   for(const state of ['suspended','rejected']){
     const id='d2-'+state,owner=await(await browser.newContext()).newPage();watch(owner);
     const session=await login(owner,state+'@professional.invalid');assert.equal(session.sessionKind,'restricted');
     await openAccount(reviewer,id);await reviewer.getByText('Estado actual: '+(state==='suspended'?'Suspendido':'Rechazado'),{exact:true}).waitFor();await shot('D213-'+state+'-keep-state',reviewer);await reviewer.getByLabel('Mensaje destinado al profesional',{exact:true}).fill('P2 message '+state);
     const message=await saveAccount(reviewer,id);assert.equal(message.payload.approvalStatus,state);assert.equal(message.data.psychologistProfile.approvalStatus,state);
     assert.equal((await tokenStatus(owner,session.restrictedToken)).status,200);
     await openAccount(reviewer,id);await reviewer.locator('textarea').first().fill('P2-INTERNAL-'+state);
     const note=await saveAccount(reviewer,id);assert.equal(note.payload.approvalStatus,state);assert.equal(note.data.psychologistProfile.approvalStatus,state);
     const status=await tokenStatus(owner,session.restrictedToken);assert.equal(status.status,200);assert.ok(!JSON.stringify(status.body).includes('P2-INTERNAL'));
     // A cancelled choice must not carry into another professional's modal.
     await openAccount(reviewer,id);await button(reviewer,'Rehabilitar').click();await button(reviewer,'Cerrar revisión').click();
     const other='d2-'+(state==='suspended'?'rejected':'suspended');await openAccount(reviewer,other);
     assert.equal(await reviewer.getByLabel('Mensaje destinado al profesional',{exact:true}).inputValue(),'');assert.equal(await reviewer.locator('textarea').first().inputValue(),'');
     assert.equal(await button(reviewer,'Rehabilitar').getAttribute('aria-pressed'),'false');await button(reviewer,'Cerrar revisión').click();
     await openAccount(reviewer,id);assert.equal(await button(reviewer,'Rehabilitar').getAttribute('aria-pressed'),'false');
     await button(reviewer,'Rehabilitar').click();const active=await saveAccount(reviewer,id);assert.equal(active.payload.approvalStatus,'active');assert.equal(active.data.psychologistProfile.approvalStatus,'active');
     assert.equal((await tokenStatus(owner,session.restrictedToken)).status,401);
     await login(owner,state+'@professional.invalid');assert.equal((await json(owner,'/professional-profile/me','POST',{})).status,200);
     const profile=(await json(owner,'/professional-profile/me')).data.profile;assert.equal(profile.isPublic,false);assert.equal(profile.acceptsNewPatients,false);
     // Return this fixture to its original state for the next switch check.
     assert.equal((await json(reviewer,`/auth/psychologists/${id}/review`,'PATCH',{approvalStatus:state})).status,200);
     await reviewer.reload();await button(reviewer,'Usuarios').click();
   }
   const support=await(await browser.newContext()).newPage();watch(support);await login(support,'support@identity.invalid');await button(support,'Usuarios').click();
   assert.equal(await button(support,'Gestionar estado profesional').count(),0);
   assert.equal((await json(support,'/auth/psychologists/d2-suspended/review','PATCH',{approvalStatus:'active'})).status,403);
   await shot('D213-account-state',reviewer);
 },[401,403]);
 await browser.close();save();
}
main().catch(async()=>{save();try{await browser?.close();}catch{}process.exitCode=1;});
