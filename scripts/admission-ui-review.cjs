const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.REVIEW_BASE,api='http://api:5000/api',control='/control',out='/evidence';
const results=[],events=[],screenshots=[];let current='SETUP',allowed=new Set(),browser,psy,pac,selected,initial;
const save=()=>fs.writeFileSync(control+'/results.json',JSON.stringify({results,events,screenshots},null,2));
const button=(p,name)=>p.getByRole('button',{name,exact:true});
function gate(){
  let release;
  const wait=new Promise(resolve=>{release=resolve;});
  return {release,wait};
}
async function waitForGate(gate,label){
  let timer;
  try{
    await Promise.race([gate.wait,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Timed out waiting for '+label)),10000);
    })]);
  }finally{clearTimeout(timer);}
}
function watch(p){p.on('pageerror',()=>events.push({scenario:current,type:'pageerror',expected:false}));p.on('response',r=>{if(r.status()>=400)events.push({scenario:current,type:'http',status:r.status(),expected:allowed.has(r.status())});});}
async function shot(id,p=pac||psy){await p.screenshot({path:out+'/screenshots/'+id+'.png',fullPage:true,animations:'disabled',mask:[p.locator('input'),p.locator('textarea'),p.getByText(/@|Password demo:/)],maskColor:'#475569'});screenshots.push({file:'screenshots/'+id+'.png',scenario:current,secretsMasked:true});save();}
async function scenario(id,fn,statuses=[]){current=id;allowed=new Set(statuses);try{await fn();await shot(id);results.push({id,status:'PASS'});}catch(e){fs.writeFileSync(control+'/browser-failure.txt',e.stack||e.message);results.push({id,status:'FAIL',failureCategory:e.name==='TimeoutError'?'timeout':'assertion'});try{await shot(id+'-failure');}catch{}save();throw Error('Scenario '+id+' failed');}save();console.log(id+' PASS');}
async function submitLogin(p,id){
  await p.locator('input[name=email]').fill(id+'@bilateral.invalid');
  await p.locator('input[name=password]').fill('Episode-Demo-Only-284!');
  await button(p,'Entrar').click();
}
async function signIn(p,id){await p.goto(base);await submitLogin(p,id);}
async function login(id){const context=await browser.newContext({viewport:{width:375,height:812},locale:'es-MX'}),p=await context.newPage();watch(p);await signIn(p,id);const nav=p.getByRole('navigation',{name:'Navegación móvil'});await nav.waitFor();const entry=nav.getByRole('button',{name:'Admisión',exact:true});await entry.click();await p.getByRole('heading',{name:'Admisiones individuales',exact:true}).waitFor();assert.ok(await nav.evaluate(n=>n.scrollWidth<=n.clientWidth));return p;}
async function json(p,path='',body){return p.evaluate(async({api,path,body})=>{const r=await fetch(api+'/admissions'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+localStorage.getItem('psicopanel_auth_token'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};},{api,path,body});}
async function open(p){await Promise.all([p.waitForResponse(r=>r.url().endsWith('/admissions')&&r.status()===200),button(p,'Actualizar admisiones').click()]);await p.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});await p.getByRole('region',{name:'Admisiones individuales',exact:true}).locator('li button').first().click();await p.getByRole('heading',{name:'Admisión individual ficticia',exact:true}).waitFor();}
async function saveDraft(){await Promise.all([pac.waitForResponse(r=>r.url().endsWith('/save')&&r.status()===200),button(pac,'Guardar borrador privado').click()]);await pac.waitForLoadState('networkidle');}
async function send(){const before=(await json(pac,'/'+selected)).body.data.latestSubmission;await pac.getByLabel(/Confirmo enviar esta versión guardada/).check();await Promise.all([pac.waitForResponse(r=>r.url().endsWith('/submit')&&r.status()===200),button(pac,'Enviar versión inmutable').click()]);await pac.getByText('Envío '+(before+1),{exact:true}).waitFor();}
async function main(){
 browser=await chromium.launch({headless:true,args:['--no-sandbox',...(process.env.REVIEW_FRONTEND_IP?['--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]:[])]});
 fs.writeFileSync(control+'/runtime.json',JSON.stringify({playwright:require('playwright/package.json').version,chromium:browser.version(),node:process.version,revision:process.env.REVIEW_REVISION,headless:true}));
 await scenario('ADM01',async()=>{psy=await login('bp1');pac=await login('bq1');selected=(await json(pac)).body.data[0].id;await open(psy);await open(pac);assert.ok(await button(pac,'Aceptar asignación').isDisabled());assert.equal(await psy.getByText('Borrador privado',{exact:true}).count(),0);});
 await scenario('ADM23',async()=>{
   for(const [id,status,viewport] of [['bp1',503,{width:1280,height:900}],['bq1',403,{width:375,height:812}]]){
     const context=await browser.newContext({viewport,locale:'es-MX'}),page=await context.newPage();
     watch(page);
     let failedReads=0;
     const patients=url=>url.pathname==='/api/patients';
     await page.route(patients,async route=>{
       if(route.request().method()!=='GET')return route.continue();
       failedReads++;
       return route.fulfill({status,json:{success:false,message:'Fallo clínico ficticio'},headers:{'access-control-allow-origin':'*'}});
     });
     try{
       await signIn(page,id);
       const nav=viewport.width<768?page.getByRole('navigation',{name:'Navegación móvil'}):page.locator('aside');
       await page.getByRole('heading',{name:'No pudimos sincronizar la informacion',exact:true}).waitFor();
       assert.ok(failedReads>0);
       if(id==='bq1')await page.getByRole('heading',{name:'Mi identidad y contactos',exact:true}).waitFor();
       await button(nav,'Vinculación bilateral').click();
       await page.getByText(/Acuerdo completado/).first().waitFor();
       await button(nav,'Admisión').click();
       const list=page.getByRole('region',{name:'Admisiones individuales',exact:true});
       await list.locator('li button').filter({hasText:'Autoadministrada'}).click();
       await page.getByRole('heading',{name:'Admisión individual ficticia',exact:true}).waitFor();
       await page.getByText(/Episodio preparado:/).waitFor();
       assert.equal(await button(page,'Activar tratamiento').count(),0);
       await shot('ADM23-'+id,page);
     }finally{await context.close();}
   }
   const unassigned=await login('bq2');
   try{
     await unassigned.getByText('No tienes admisiones asignadas.',{exact:true}).waitFor();
     assert.equal(await button(unassigned,'Aceptar asignación').count(),0);
     assert.deepEqual((await json(unassigned)).body.data,[]);
   }finally{await unassigned.context().close();}
 },[403,503]);
 await scenario('ADM02',async()=>{await pac.getByLabel(/Acepto específicamente esta asignación/).check();await button(pac,'Aceptar asignación').click();await pac.getByRole('heading',{name:'Borrador privado',exact:true}).waitFor();await open(psy);initial=(await json(psy,'/'+selected)).body.data;});
 await scenario('ADM03',async()=>{await pac.getByLabel('Motivo ficticio para este ensayo',{exact:true}).fill('Motivo exclusivo de ensayo');await pac.getByLabel('Contexto ficticio adicional',{exact:true}).fill('Borrador ficticio secreto');await saveDraft();assert.deepEqual((await json(psy,'/'+selected)).body.data,initial);assert.doesNotMatch(JSON.stringify((await json(psy)).body),/Borrador ficticio|answers|revision|draft/i);assert.ok(await button(pac,'Enviar versión inmutable').isDisabled());});
 await scenario('ADM04',async()=>{await send();await open(psy);await psy.locator('details').filter({hasText:'Borrador ficticio secreto'}).waitFor();assert.ok(await button(psy,'Registrar validación exacta').isDisabled());});
 await scenario('ADM24',async()=>{
   for(const status of [403,404]){
     const page=await login('bp1');
     const denyRecord=gate(),deliverDetail=gate(),recordStarted=gate(),detailStarted=gate();
     const detailPath='**/admissions/'+selected,recordPath=detailPath+'/record';
     let recordReads=0;
     const headers={'access-control-allow-origin':'*'};
     try{
       await page.route(recordPath,async route=>{
         if(route.request().method()!=='GET')return route.continue();
         recordReads++;
         recordStarted.release();
         await denyRecord.wait;
         await route.fulfill({status,headers,json:{success:false,message:'Acceso ficticio retirado'}});
       });
       const recordRequest=page.waitForRequest(r=>r.method()==='GET'&&r.url().endsWith('/'+selected+'/record'));
       await open(page);
       await recordRequest;
       await waitForGate(recordStarted,'pending assessment read');
       const detail=page.getByRole('article',{name:'Detalle de admisión'});
       await detail.getByText(/Borrador ficticio secreto/).waitFor();
       // Keep the existing fixture for the remaining scenarios. Only the receipt is simulated.
       await page.route(detailPath+'/validate',route=>route.request().method()==='POST'
         ?route.fulfill({status:200,headers,json:{success:true,data:{}}}):route.continue());
       await page.route(detailPath,async route=>{
         if(route.request().method()!=='GET')return route.continue();
         const response=await route.fetch();
         assert.equal(response.status(),200);
         detailStarted.release();
         await deliverDetail.wait;
         await route.fulfill({response});
       });
       const detailRequest=page.waitForRequest(r=>r.method()==='GET'&&r.url().endsWith('/admissions/'+selected));
       await page.getByLabel(/Registro expresamente la validación profesional/).check();
       await button(page,'Registrar validación exacta').click();
       await detailRequest;
       await waitForGate(detailStarted,'retained self-admission detail');
       const pendingRecordReads=recordReads;
       denyRecord.release();
       await page.getByRole('region',{name:'Valoración profesional privada'}).waitFor({state:'hidden'});
       assert.equal(await detail.getByText(/Borrador ficticio secreto/).count(),0);
       const delivered=page.waitForResponse(r=>r.url().endsWith('/admissions/'+selected)&&r.status()===200);
       deliverDetail.release();
       await (await delivered).finished();
       await page.waitForLoadState('networkidle');
       assert.equal(await detail.getByText(/Borrador ficticio secreto/).count(),0);
       assert.equal(await detail.locator('button, textarea, input').count(),0);
       assert.equal(recordReads,pendingRecordReads);
     }finally{
       denyRecord.release();
       deliverDetail.release();
       await page.context().close();
     }
   }
 },[403,404]);
 await scenario('ADM25',async()=>{
   const context=await browser.newContext({viewport:{width:1280,height:900},locale:'es-MX'});
   const first=await context.newPage(),second=await context.newPage();
   const deliver=gate(),retained=gate(),delivered=gate(),detailPath='**/admissions/'+selected;
   first.setDefaultTimeout(12000);second.setDefaultTimeout(12000);
   watch(first);watch(second);
   try{
     await second.goto(base);
     await button(second,'Entrar').waitFor();
     await signIn(first,'bp1');
     const firstNav=first.locator('aside'),secondNav=second.locator('aside');
     await firstNav.getByText('Profesional ficticio bp1',{exact:true}).waitFor();
     await button(firstNav,'Admisión').click();
     await open(first);
     await first.getByText(/Borrador ficticio secreto/).waitFor();
     await button(first,'Actualizar admisiones').click();
     await first.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});
     await first.route(detailPath,async route=>{
       if(route.request().method()!=='GET')return route.continue();
       const response=await route.fetch();
       assert.equal(response.status(),200);
       retained.release();
       await deliver.wait;
       await route.fulfill({response});
       delivered.release();
     });
     const request=first.waitForRequest(r=>r.method()==='GET'&&r.url().endsWith('/admissions/'+selected));
     await first.getByRole('region',{name:'Admisiones individuales'}).locator('li button').first().click();
     await request;
     await waitForGate(retained,'the first tab detail snapshot');
     await submitLogin(second,'bp2');
     await secondNav.getByText('Profesional ficticio bp2',{exact:true}).waitFor();
     await button(first,'Entrar').waitFor();
     const response=first.waitForResponse(r=>r.url().endsWith('/admissions/'+selected)&&r.status()===200);
     deliver.release();
     await Promise.all([response,waitForGate(delivered,'the first tab late response')]);
     await button(first,'Entrar').waitFor();
     assert.equal(await firstNav.count(),0);
     assert.equal(await first.getByText(/Profesional ficticio bp[12]|Borrador ficticio secreto/).count(),0);
     assert.equal(await first.getByRole('region',{name:'Admisiones individuales'}).count(),0);
     await button(secondNav,'Admisión').click();
     await second.getByText('No tienes admisiones asignadas.',{exact:true}).waitFor();
     const mirror=await context.newPage();
     await mirror.goto(base);
     await mirror.locator('aside').getByText('Profesional ficticio bp2',{exact:true}).waitFor();
     await button(secondNav,'Cerrar sesion').click();
     await button(second,'Entrar').waitFor();
     await button(mirror,'Entrar').waitFor();
     await submitLogin(second,'bp2');
     await secondNav.getByText('Profesional ficticio bp2',{exact:true}).waitFor();
     await second.route('**/api/admissions',route=>route.request().method()==='GET'
       ?route.fulfill({status:401,headers:{'access-control-allow-origin':'*'},json:{success:false,message:'Sesión ficticia revocada'}})
       :route.continue());
     await button(secondNav,'Admisión').click();
     await button(second,'Entrar').waitFor();
     await second.reload();
     await button(second,'Entrar').waitFor();
   }finally{
     deliver.release();
     await context.close();
   }
 },[401]);
 await scenario('ADM13',async()=>{
   const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});await panel.locator('strong').filter({hasText:'NO EVALUADO'}).waitFor();
   await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('high');await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('BORRADOR P2 GUARDADO');
   let release,started,delivered;const held=new Promise(r=>{release=r;}),seen=new Promise(r=>{started=r;}),finished=new Promise(r=>{delivered=r;});
   const pattern='**/admissions/'+selected+'/assess';
   await psy.route(pattern,async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}started();await held;await route.continue();delivered();});
   await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await seen;
   assert.ok(await button(psy,'Actualizar referencias y conservar texto').isDisabled());
   const reloaded=psy.waitForResponse(r=>r.url().endsWith('/record')&&r.status()===200);
   await psy.getByLabel(/Registro expresamente la validación profesional/).check();await button(psy,'Registrar validación exacta').click();await psy.getByText(/Validación del envío 1/).waitFor();await reloaded;
   const response=psy.waitForResponse(r=>r.url().endsWith('/assess')&&r.status()===409);release();await finished;await response;await psy.unroute(pattern);await psy.waitForLoadState('networkidle');
   assert.ok(await button(psy,'Actualizar referencias y conservar texto').isEnabled());assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'BORRADOR P2 GUARDADO');assert.equal(await psy.getByLabel('Riesgo profesional',{exact:true}).inputValue(),'high');
   await button(psy,'Actualizar referencias y conservar texto').click();await psy.waitForLoadState('networkidle');assert.ok(await button(psy,'Registrar valoración privada').isDisabled());assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'BORRADOR P2 GUARDADO');await shot('ADM13-professional',psy);
 },[409]);
 await scenario('ADM09',async()=>{
   const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});
   await panel.locator('strong').filter({hasText:'NO EVALUADO'}).waitFor();assert.equal(await pac.getByRole('region',{name:'Valoración profesional privada',exact:true}).count(),0);
   assert.ok(await button(psy,'Registrar valoración privada').isDisabled());
   await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('high');await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('Valoración ficticia privada del envío 1');
   await psy.getByLabel(/Registro expresamente esta valoración/).check();
   await Promise.all([psy.waitForResponse(r=>r.url().endsWith('/assess')&&r.status()===200),button(psy,'Registrar valoración privada').click()]);
   await panel.getByText('Contexto vigente: Valoración ficticia privada del envío 1',{exact:true}).waitFor();
   assert.doesNotMatch(JSON.stringify((await json(pac,'/'+selected)).body),/Valoración ficticia privada|riskLevel|authorId|recordedAt/);
 });
 await scenario('ADM10',async()=>{
   const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});
   await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('MI TEXTO LOCAL CONSERVADO');
   const r=(await json(psy,'/'+selected+'/record')).body.data;
   const body={operationId:require('node:crypto').randomUUID(),confirmed:true,expectedVersion:r.version,expectedRevision:r.expectedRevision,episodeId:r.episodeId,submission:r.submission,riskLevel:'low',context:'Otro escritor ficticio'};
   assert.equal((await json(psy,'/'+selected+'/assess',body)).status,200);
   await psy.getByLabel(/Registro expresamente esta valoración/).check();
   await Promise.all([psy.waitForResponse(r=>r.url().endsWith('/assess')&&r.status()===409),button(psy,'Registrar valoración privada').click()]);
   assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'MI TEXTO LOCAL CONSERVADO');assert.ok(await button(psy,'Registrar valoración privada').isDisabled());
   await panel.getByText(/Tu texto local se conserva/).waitFor();await button(psy,'Actualizar referencias y conservar texto').click();await panel.getByText('Contexto vigente: Otro escritor ficticio',{exact:true}).waitFor();
   assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'MI TEXTO LOCAL CONSERVADO');assert.ok(await button(psy,'Registrar valoración privada').isDisabled());
   await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await panel.getByText('Contexto vigente: MI TEXTO LOCAL CONSERVADO',{exact:true}).waitFor();
 },[409]);
 await scenario('ADM14',async()=>{
   const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});
   await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('medium');await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('BORRADOR P2 CORRECCIÓN');
   let release,started,delivered;const held=new Promise(r=>{release=r;}),seen=new Promise(r=>{started=r;}),finished=new Promise(r=>{delivered=r;});const pattern='**/admissions/'+selected+'/record';
   await psy.route(pattern,async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}started();await held;await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:false,message:'Indisponibilidad ficticia controlada'})});delivered();});
   await psy.getByLabel('Mensaje destinado al paciente para corregir',{exact:true}).fill('Aclaración ficticia destinada al paciente');await button(psy,'Solicitar corrección').click();await psy.getByText(/Corrección del envío 1/).waitFor();await seen;
   const safe=async()=>{assert.equal(await panel.getByText(/^Contexto vigente:/).count(),0);assert.equal(await panel.locator('strong').textContent(),'NO EVALUADO');assert.ok(await button(psy,'Registrar valoración privada').isDisabled());assert.ok(await psy.getByLabel(/Registro expresamente esta valoración/).isDisabled());assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'BORRADOR P2 CORRECCIÓN');assert.equal(await psy.getByLabel('Riesgo profesional',{exact:true}).inputValue(),'medium');assert.equal(await panel.getByText('Historial de valoraciones privadas (3)',{exact:true}).count(),1);};
   await safe();const response=psy.waitForResponse(r=>r.url().endsWith('/record')&&r.status()===503);release();await finished;await response;await psy.unroute(pattern);await psy.waitForLoadState('networkidle');await safe();
   await panel.locator('summary').click();await panel.getByText('MI TEXTO LOCAL CONSERVADO',{exact:true}).waitFor();await shot('ADM14-professional',psy);
   await button(psy,'Actualizar referencias y conservar texto').click();await psy.waitForLoadState('networkidle');await safe();
 },[503]);
 await scenario('ADM05',async()=>{await open(pac);await pac.getByLabel('Contexto ficticio adicional',{exact:true}).fill('Respuesta ficticia corregida');await saveDraft();await send();await open(psy);const d=(await json(psy,'/'+selected)).body.data;assert.equal(d.submissions.length,2);assert.equal(d.submissions[0].answers.context,'Borrador ficticio secreto');assert.equal(d.reviewState,'submitted');const other=await login('bp2');assert.equal((await json(other,'/'+selected)).status,404);await other.context().close();const wrong=await login('bq2');assert.equal((await json(wrong,'/'+selected)).status,404);await wrong.context().close();},[404]);
 await scenario('ADM11',async()=>{
   const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});await panel.locator('strong').filter({hasText:'NO EVALUADO'}).waitFor();
   const r=(await json(psy,'/'+selected+'/record')).body.data;assert.equal(r.submission,2);assert.equal(r.current,null);assert.equal(r.history.length,3);assert.ok(r.history.every(v=>v.submission===1));
   await panel.locator('summary').click();await panel.getByText(/Revisión 4 · Envío 1/).waitFor();
   await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('Valoración exclusiva del envío 2');await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('unevaluated');await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await panel.getByText('Contexto vigente: Valoración exclusiva del envío 2',{exact:true}).waitFor();
 });
 await scenario('ADM06',async()=>{await pac.getByLabel(/Confirmo cancelar esta admisión/).check();await button(pac,'Retirar consentimiento').click();await pac.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});await button(psy,'Actualizar admisiones').click();assert.equal((await json(psy)).body.data.length,0);assert.equal((await json(psy,'/'+selected)).status,404);assert.equal((await json(psy,'/'+selected+'/record')).status,404);await open(pac);await pac.getByText(/Consulta propia de respuestas conservadas/).waitFor();assert.ok(await pac.getByLabel('Contexto ficticio adicional',{exact:true}).isDisabled());assert.equal(await button(pac,'Guardar borrador privado').count(),0);assert.equal(await button(pac,'Enviar versión inmutable').count(),0);assert.equal((await json(pac,'/'+selected)).body.data.submissions.length,2);},[404]);
 await scenario('ADM07',async()=>{await psy.getByLabel('Acuerdo bilateral vigente',{exact:true}).selectOption({index:1});assert.ok(await button(psy,'Preparar episodio').isDisabled());await psy.getByLabel(/Preparar explícitamente un episodio/).check();await button(psy,'Preparar episodio').click();await psy.getByLabel(/Asignar esta plantilla a este episodio/).waitFor();await psy.getByLabel(/Asignar esta plantilla a este episodio/).check();await Promise.all([psy.waitForResponse(r=>r.url().endsWith('/assign')&&r.status()===200),button(psy,'Asignar plantilla').click()]);await Promise.all([pac.waitForResponse(r=>r.url().endsWith('/admissions')&&r.status()===200),button(pac,'Actualizar admisiones').click()]);await pac.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});await pac.locator('li button').filter({hasText:'Pendiente de aceptación'}).click();assert.ok(await button(pac,'Aceptar asignación').isDisabled());});
 await scenario('ADM08',async()=>{const pending=(await json(pac)).body.data.find(i=>i.id!==selected&&i.state==='proposed');assert.ok(pending);assert.notEqual(pending.episodeId,(await json(pac,'/'+selected)).body.data.episodeId);const detail=(await json(pac,'/'+pending.id)).body.data;assert.equal(detail.state,'proposed');assert.deepEqual(detail.submissions,[]);assert.doesNotMatch(JSON.stringify(detail),/riskLevel|risk_level|professional_context|technical_author|writer_login|episode_private/);assert.equal(await button(psy,'Activar tratamiento').count(),0);for(const page of [psy,pac]){const r=await page.evaluate(async({api,id})=>{const response=await fetch(api+'/episodes/'+id+'/clinical-record',{headers:{Authorization:'Bearer '+localStorage.getItem('psicopanel_auth_token')}});return response.status;},{api,id:pending.episodeId});assert.equal(r,404);}},[404]);
 await scenario('ADM12',async()=>{
   await pac.getByLabel(/Acepto específicamente esta asignación/).check();await button(pac,'Aceptar asignación').click();await pac.getByRole('heading',{name:'Borrador privado',exact:true}).waitFor();
   const pending=(await json(pac)).body.data.find(i=>i.id!==selected&&i.state==='accepted');assert.ok(pending);
   selected=pending.id;await pac.getByLabel('Motivo ficticio para este ensayo',{exact:true}).fill('Motivo propio del segundo episodio');await pac.getByLabel('Contexto ficticio adicional',{exact:true}).fill('Envío independiente sin valoración');await saveDraft();await send();
   const snapshot=await json(psy,'/'+pending.id+'/record');assert.equal(snapshot.status,200);
   let release,started,delivered,deadline;const waiting=new Promise(r=>{release=r;}),seen=new Promise(r=>{started=r;}),finished=new Promise(r=>{delivered=r;});
   await psy.route('**/admissions/'+pending.id+'/record',async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}started();await waiting;await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(snapshot.body)});delivered();});
   await button(psy,'Actualizar admisiones').click();await psy.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});await psy.locator('li button').filter({hasText:'Episodio '+pending.episodeId+' ·'}).click();
   try{await Promise.race([seen,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Delayed record request was not observed')),10000);})]);}finally{clearTimeout(deadline);}
   await button(psy,'Actualizar admisiones').click();await psy.getByRole('article',{name:'Detalle de admisión'}).waitFor({state:'hidden'});release();await finished;await psy.unroute('**/admissions/'+pending.id+'/record');
   await psy.locator('li button').filter({hasText:'Episodio '+pending.episodeId+' ·'}).click();const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});await panel.locator('strong').filter({hasText:'NO EVALUADO'}).waitFor();assert.equal((await json(psy,'/'+pending.id+'/record')).body.data.history.length,0);
 });
 const confirmDirected=async p=>p.getByLabel('Confirmo expresamente la acción y la versión de esta entrevista dirigida.',{exact:true}).check();
 const openDirected=async p=>{const d=(await json(p,'/'+selected)).body.data;await button(p,'Actualizar admisiones').click();await p.locator('li button').filter({hasText:'Episodio '+d.episodeId+' ·'}).click();await p.getByRole('heading',{name:'Entrevista individual dirigida ficticia',exact:true}).waitFor();await button(p,'Actualizar entrevista y conservar texto').waitFor();await p.waitForLoadState('networkidle');};
 await scenario('ADM15',async()=>{
   await psy.getByLabel('Acuerdo bilateral vigente',{exact:true}).selectOption('');await psy.getByLabel('Modalidad de entrevista',{exact:true}).selectOption('directed');await psy.getByLabel('Acuerdo bilateral vigente',{exact:true}).selectOption({index:1});
   await psy.getByLabel(/Preparar explícitamente un episodio/).check();await button(psy,'Preparar episodio').click();await psy.getByLabel(/Asignar esta plantilla a este episodio/).check();await button(psy,'Asignar plantilla').click();await psy.waitForLoadState('networkidle');
   selected=(await json(psy)).body.data.find(x=>x.mode==='directed').id;await openDirected(pac);assert.ok(await button(pac,'Aceptar entrevista dirigida').isDisabled());await confirmDirected(pac);await button(pac,'Aceptar entrevista dirigida').click();await pac.getByText(/Estado: Aceptada/).waitFor();
   await openDirected(psy);await confirmDirected(psy);await button(psy,'Declaro que realicé la entrevista').click();await psy.getByRole('heading',{name:'Declaraciones para incorporar',exact:true}).waitFor();
   await psy.getByLabel('Motivo ficticio para este ensayo',{exact:true}).fill('DECLARACION_DIRIGIDA_FICTICIA');await psy.getByLabel('Contexto ficticio adicional',{exact:true}).fill('CONTEXTO_DECLARADO_FICTICIO');
   const before=(await json(pac,'/'+selected)).body.data;assert.equal(before.documents.length,0);assert.doesNotMatch(JSON.stringify(before),/DECLARACION_DIRIGIDA_FICTICIA/);
   await confirmDirected(psy);await button(psy,'Incorporar versión dirigida').click();await psy.getByText('DECLARACION_DIRIGIDA_FICTICIA',{exact:false}).waitFor();await openDirected(pac);await pac.getByText(/DECLARACION_DIRIGIDA_FICTICIA/).waitFor();assert.equal((await json(pac,'/'+selected)).body.data.documents[0].source,'professional_directed_interview');
 });
 await scenario('ADM16',async()=>{
   await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('VALORACION_DIRIGIDA_RESERVADA');await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('medium');await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await psy.getByText('Contexto vigente: VALORACION_DIRIGIDA_RESERVADA',{exact:true}).waitFor();
   await confirmDirected(psy);await button(psy,'Validar expresamente esta versión ficticia').click();await psy.getByText(/Estado: Aceptada · Validación registrada/).waitFor();const own=await json(pac,'/'+selected);assert.doesNotMatch(JSON.stringify(own.body),/VALORACION_DIRIGIDA_RESERVADA|riskLevel|expectedRevision/);assert.equal((await json(pac,'/'+selected+'/directed/record')).status,404);
 },[404]);
 await scenario('ADM17',async()=>{
   await openDirected(pac);await pac.getByLabel('Motivo de la solicitud',{exact:true}).fill('RECTIFICACION_RECHAZADA');await confirmDirected(pac);await button(pac,'Solicitar corrección de esta versión').click();await pac.getByText(/Corrección pendiente:/).waitFor();await openDirected(psy);assert.equal(await button(psy,'Validar expresamente esta versión ficticia').count(),0);
   await psy.getByLabel('Explicación de la decisión para el paciente',{exact:true}).fill('RECHAZO_MOTIVADO_FICTICIO');await confirmDirected(psy);await button(psy,'Rechazar corrección con explicación').click();await psy.getByText(/RECHAZO_MOTIVADO_FICTICIO/).waitFor();await openDirected(pac);await pac.getByText(/RECHAZO_MOTIVADO_FICTICIO/).waitFor();assert.equal((await json(pac,'/'+selected)).body.data.documents.length,1);
 });
 await scenario('ADM18',async()=>{
   await pac.getByLabel('Motivo de la solicitud',{exact:true}).fill('RECTIFICACION_ACEPTADA');await confirmDirected(pac);await button(pac,'Solicitar corrección de esta versión').click();await pac.getByText(/Corrección pendiente:/).waitFor();await openDirected(psy);
   await psy.getByLabel('Motivo ficticio para este ensayo',{exact:true}).fill('VERSION_DIRIGIDA_CORREGIDA');await psy.getByLabel('Contexto ficticio adicional',{exact:true}).fill('CONTEXTO_CORREGIDO');await psy.getByLabel('Explicación de la decisión para el paciente',{exact:true}).fill('CORRECCION_INCORPORADA');await confirmDirected(psy);await button(psy,'Aceptar corrección e incorporar nueva versión').click();
   await psy.getByText(/Documento 2 · Documentado/).waitFor();const r=(await json(psy,'/'+selected+'/directed/record')).body.data;assert.equal(r.current,null);assert.equal(r.documentRevision,2);assert.equal(r.history.length,1);await openDirected(pac);assert.equal((await json(pac,'/'+selected)).body.data.documents.length,2);await pac.getByText(/VERSION_DIRIGIDA_CORREGIDA/).waitFor();
 });
 await scenario('ADM19',async()=>{
   await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('TEXTO_DIRIGIDO_LOCAL');await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('low');
   const d=(await json(psy,'/'+selected)).body.data;assert.equal((await json(psy,'/'+selected+'/directed/validate',{operationId:crypto.randomUUID(),confirmed:true,expectedVersion:d.version,documentRevision:2,episodeId:d.episodeId})).status,200);
   await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await psy.getByText(/Tu texto local se conserva/).waitFor();assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'TEXTO_DIRIGIDO_LOCAL');
   await button(psy,'Actualizar referencias y conservar texto').click();await psy.waitForLoadState('networkidle');await psy.getByLabel(/Registro expresamente esta valoración/).check();await button(psy,'Registrar valoración privada').click();await psy.getByText('Contexto vigente: TEXTO_DIRIGIDO_LOCAL',{exact:true}).waitFor();
 },[409]);
 await scenario('ADM21',async()=>{
   const d=(await json(psy,'/'+selected)).body.data,recordPattern='**/admissions/'+selected+'/directed/record',parentPattern='**/admissions/'+selected;
   let releaseChild,releaseParent,childSeen,parentSeen,recordCount=0;
   const childHeld=new Promise(r=>{releaseChild=r;}),parentHeld=new Promise(r=>{releaseParent=r;}),childStarted=new Promise(r=>{childSeen=r;}),parentStarted=new Promise(r=>{parentSeen=r;});
   await psy.route(recordPattern,async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}if(++recordCount>1){await route.continue();return;}childSeen();await childHeld;await route.fulfill({status:404,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:false,message:'Recurso no disponible.'})});});
   try{
     await button(psy,'Actualizar referencias y conservar texto').click();await childStarted;
     await psy.getByText(/VERSION_DIRIGIDA_CORREGIDA/).waitFor();
     await psy.route(parentPattern,async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}parentSeen();await parentHeld;await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:true,data:d})});});
     await button(psy,'Actualizar entrevista y conservar texto').click();await parentStarted;
     releaseChild();await psy.getByRole('region',{name:'Valoración profesional privada',exact:true}).waitFor({state:'hidden'});
     assert.equal(await button(psy,'Cancelar entrevista dirigida').count(),0);
     releaseParent();await psy.waitForLoadState('networkidle');
     assert.equal(await psy.getByText(/VERSION_DIRIGIDA_CORREGIDA/).count(),0);assert.equal(await button(psy,'Cancelar entrevista dirigida').count(),0);assert.equal(recordCount,1);
   }finally{releaseChild();releaseParent();await psy.unroute(parentPattern);await psy.unroute(recordPattern);}
   await button(psy,'Actualizar entrevista y conservar texto').click();await psy.getByText(/VERSION_DIRIGIDA_CORREGIDA/).waitFor();await psy.getByText('Contexto vigente: TEXTO_DIRIGIDO_LOCAL',{exact:true}).waitFor();
 },[404]);
 await scenario('ADM22',async()=>{
   const pattern='**/admissions/'+selected+'/directed/record';let count=0,failing=true;
   await psy.route(pattern,async route=>{if(route.request().method()==='OPTIONS'){await route.continue();return;}++count;if(failing){await route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:false,message:'Indisponibilidad ficticia controlada'})});}else await route.continue();});
   try{
     await openDirected(psy);const panel=psy.getByRole('region',{name:'Valoración profesional privada',exact:true});
     await panel.getByRole('alert').waitFor();assert.equal(await panel.locator('form').count(),0);assert.ok(await button(psy,'Actualizar referencias y conservar texto').isEnabled());
     const failedReads=count;failing=false;await button(psy,'Actualizar referencias y conservar texto').click();await panel.getByText('Contexto vigente: TEXTO_DIRIGIDO_LOCAL',{exact:true}).waitFor();assert.equal(count,failedReads+1);assert.ok(await psy.getByLabel(/Registro expresamente esta valoración/).isEnabled());
     assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'TEXTO_DIRIGIDO_LOCAL');
     await psy.getByLabel('Contexto profesional privado',{exact:true}).fill('P2_77_B_LOCAL');await psy.getByLabel('Riesgo profesional',{exact:true}).selectOption('low');
     await button(psy,'Actualizar referencias y conservar texto').click();await psy.waitForLoadState('networkidle');
     assert.equal(await psy.getByLabel('Contexto profesional privado',{exact:true}).inputValue(),'P2_77_B_LOCAL');assert.equal(await psy.getByLabel('Riesgo profesional',{exact:true}).inputValue(),'low');
   }finally{await psy.unroute(pattern);}
 },[503]);
 await scenario('ADM20',async()=>{
   await confirmDirected(pac);await button(pac,'Retirar consentimiento dirigido').click();await pac.getByText(/Consulta propia conservada/).waitFor();assert.equal((await json(psy,'/'+selected+'/directed/record')).status,404);await openDirected(pac);await pac.getByText(/VERSION_DIRIGIDA_CORREGIDA/).waitFor();assert.equal(await button(pac,'Solicitar corrección de esta versión').count(),0);assert.equal((await json(pac,'/'+selected)).body.data.documents.length,2);
 },[404]);
 await scenario('ADM26',async()=>{
   const clinician=await login('bp3'),patient=await login('bq3');
   try{
     async function consultation(page) {
       await button(page,'Abrir primera consulta ficticia').click();
       const select=page.getByLabel('Seleccionar episodio');
       await select.locator('option').nth(1).waitFor({state:'attached'});
       await select.selectOption({index:1});
       return page.getByRole('region',{name:'Estado de la primera consulta'});
     }
     const clinicianPanel=await consultation(clinician);
     await clinicianPanel.getByLabel(/Declaro suficiente para este ensayo/).check();
     await button(clinician,'Declarar suficiencia').click();
     await clinicianPanel.getByText('El paciente debe aceptar el consentimiento de tratamiento.').waitFor();
     const patientPanel=await consultation(patient);
     await patientPanel.getByLabel(/He leído y acepto el consentimiento/).check();
     await button(patient,'Aceptar tratamiento ficticio').click();
     await patientPanel.getByText('El profesional puede activar el episodio.').waitFor();
     await button(clinician,'Actualizar episodio').click();
     await button(clinician,'Activar episodio ficticio').click();
     const date=new Date(Date.now()-48*3600*1000).toISOString().slice(0,10);
     await clinicianPanel.getByLabel('Fecha de la primera cita').fill(date);
     const hours=clinicianPanel.getByLabel('Hora de inicio');
     assert.equal(await hours.locator('option[value="09:30"]').count(),0);
     assert.deepEqual((await hours.locator('option').allTextContents()).slice(1),
       Array.from({length:24},(_,hour)=>String(hour).padStart(2,'0')+':00'));
     await hours.selectOption('09:00');
     await button(clinician,'Reservar cita de 60 minutos').click();
     await clinicianPanel.getByText(/09:00 · 60 minutos · Pendiente/).waitFor();
     await button(clinician,'Completar cita').click();
     await clinicianPanel.getByLabel('Nota profesional privada').fill('Texto profesional ficticio, solo visible para su autor.');
     await button(clinician,'Registrar nota privada').click();
     await clinicianPanel.getByText('Texto profesional ficticio, solo visible para su autor.').waitFor();
     await button(patient,'Actualizar episodio').click();
     await patientPanel.getByText(/09:00 · 60 minutos · Completada/).waitFor();
     assert.equal(await patientPanel.getByText(/Nota profesional privada|Texto profesional ficticio/).count(),0);
     await button(patient,'Retirar consentimiento de tratamiento').click();
     await patientPanel.getByText(/Acceso clínico retirado/).waitFor();
     await button(clinician,'Actualizar episodio').click();
     await clinicianPanel.getByText(/Acceso clínico retirado/).waitFor();
     assert.equal(await clinicianPanel.getByText(/Texto profesional ficticio/).count(),0);
     await shot('ADM26-consulta-controles',clinician);
   } finally {await clinician.context().close();await patient.context().close();}
 });
 assert.equal(events.filter(e=>!e.expected).length,0);save();await browser.close();
}
main().catch(async()=>{save();if(browser)await browser.close();process.exitCode=1;});
