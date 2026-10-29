const {chromium}=require('/review/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function main(){
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP frontend.localhost '+process.env.FRONTEND_IP]});
 const results=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX'});
  let detail=null,profile=null,recovery=null;const counts={note:0,objective:0,profile:0,detail:0};
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,target='http://api:5000'+path+url.search;
   if(path.includes('/clinical-notes/')&&req.method()==='PATCH')counts.note++;
   if(path.includes('/objectives/')&&req.method()==='PATCH')counts.objective++;
   let control=null;
   if(path==='/api/patients/p'&&req.method()==='GET'){
    counts.detail++;
    if(detail){control=detail;detail=null;}
    else if(recovery){
     const next=recovery;recovery=null;next.requested.resolve();
     if(next.fail)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Fictional recovery unavailable'})});
    }
   }else if(path==='/api/patients/p'&&req.method()==='PUT')control=profile;
   if(control){
    if(req.method()==='PUT')counts.profile++;
    const response=await route.fetch({url:target});assert.equal(response.status(),200);
    control.confirmed.resolve();await control.release.promise;await route.fulfill({response});return;
   }
   return route.continue({url:target});
  });
  const page=await context.newPage();
  await page.addInitScript(()=>{
   const original=window.fetch;
   window.fetch=async(...args)=>{
    const response=await original(...args);
    if(new URL(String(args[0]),location.href).pathname==='/api/patients/p'){
     const key=args[1]?.method==='PUT'?'__profileConsumed':'__detailConsumed';
     const read=response.json.bind(response);
     response.json=async()=>{
      const body=await read();const channel=new MessageChannel();
      channel.port1.onmessage=()=>{window[key]=(window[key]||0)+1;channel.port1.close();channel.port2.close();};
      channel.port2.postMessage(null);return body;
     };
    }return response;
   };
  });
  page.on('pageerror',e=>errors.push(e.message));
  async function login(id,navigate=true){
   if(navigate)await page.goto('http://frontend.localhost:5173');
   await page.getByRole('button',{name:'Iniciar sesion',exact:true}).click();
   const form=page.locator('form').filter({has:page.getByRole('button',{name:'Entrar',exact:true})});
   await form.locator('[name=email]').fill(id+'@episodes.invalid');
   await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
   await form.getByRole('button',{name:'Entrar',exact:true}).click();
   await page.getByRole('button',{name:'Cerrar sesion',exact:true}).waitFor();
  }
  async function shot(name){
   await page.screenshot({path:'/work/'+name+'.png',fullPage:true,animations:'disabled',
    mask:[page.locator('input[name=email]'),page.locator('input[name=password]'),page.getByText(/@|Password demo:/)],maskColor:'#475569'});
  }
  await login('a');
  await page.locator('aside').getByRole('button',{name:'Mis Pacientes',exact:true}).click();
  await page.getByRole('button',{name:'Expediente',exact:true}).click();
  async function assertNoteAndTask(content,task){
   await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
   const taskRow=page.getByText(task,{exact:true});
   await taskRow.waitFor();
   const card=page.locator('div.rounded-2xl.border.bg-slate-50').filter({has:taskRow});
   assert.equal(await card.getByRole('button',{name:'Abrir nota clinica',exact:true}).count(),1,'task must belong to this note card');
   await card.getByRole('button',{name:'Abrir nota clinica',exact:true}).click();
   const modal=page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Editar nota clinica',exact:true})});
   assert.equal(await modal.locator('textarea').nth(3).inputValue(),content);
   // The editor and card come from the current authorized App DTO, not a saved snapshot.
   assert.equal(await modal.locator('input').evaluateAll((inputs,text)=>inputs.some(input=>input.value===text),task),true);
   await modal.getByRole('button').first().click();
   await page.getByRole('button',{name:'Objetivos',exact:true}).click();
   assert.equal(await page.getByRole('checkbox',{name:'Cumplimiento de Fictional shared objective',exact:true}).isChecked(),true);
  }
  async function editWithConflict(suffix,fail){
   const content='FICTIONAL_PRIVATE_RECOVERED_'+suffix,task='Fictional recovered task '+suffix;
   await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
   await page.getByRole('button',{name:'Abrir nota clinica',exact:true}).first().click();
   const modal=page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Editar nota clinica',exact:true})});
   await modal.locator('textarea').nth(3).fill(content);
   await modal.getByPlaceholder('Ej. Registro diario de emociones, practica de respiracion o ejercicio de exposicion gradual...').fill(task);
   await modal.getByRole('button',{name:'Agregar tarea',exact:true}).click();
   const held={confirmed:gate(),release:gate()},next={requested:gate(),fail};detail=held;
   const before={...counts};
   await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();
   await held.confirmed.promise;
   await modal.getByRole('button').first().click();
   await page.getByRole('button',{name:'Objetivos',exact:true}).click();
   const objective=page.getByRole('checkbox',{name:'Cumplimiento de Fictional shared objective',exact:true});
   const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.includes('/objectives/'));
   await objective.click();assert.equal((await patched).status(),200);
   await page.waitForFunction(()=>document.querySelector('input[aria-label="Cumplimiento de Fictional shared objective"]')?.checked);
   recovery=next;held.release.resolve();await next.requested.promise;
   if(fail){
    await page.getByText('La nota clínica se guardó. No se pudo actualizar el expediente; recarga la página para ver los últimos cambios.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Recargar expediente',exact:true}).waitFor();
    assert.equal(await objective.isChecked(),true);
    await shot('confirmed-note-recovery-pending');
   }else{
    await page.getByText('Nota clinica actualizada correctamente.',{exact:true}).waitFor();
    await assertNoteAndTask(content,task);
    await shot('note-task-and-objective-after-recovery');
   }
   assert.equal(counts.note-before.note,1);assert.equal(counts.objective-before.objective,1);
   assert.equal(counts.detail-before.detail,2,'one secondary GET and one recovery GET');
   if(fail){
    await page.getByRole('button',{name:'Recargar expediente',exact:true}).click();
    await page.locator('aside').getByRole('button',{name:'Mis Pacientes',exact:true}).click();
    await page.getByRole('button',{name:'Expediente',exact:true}).click();
    await assertNoteAndTask(content,task);
    assert.equal(counts.note-before.note,1);assert.equal(counts.objective-before.objective,1);
    await shot('confirmed-note-after-explicit-reload');
   }
   results.push('Note '+suffix+': one confirmed PATCH with new task -> old GET -> objective PATCH -> '+(fail?'recovery 500, persistent saved/pending warning and explicit reload restores current note/task':'fresh GET restores current note and linked task')+'; objective complete, no duplicate writes: PASS');
  }
  await editWithConflict('SUCCESS',false);
  // Explicit fixture preparation for a second independent race, outside its write count.
  const prepare=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.includes('/objectives/'));
  await page.getByRole('checkbox',{name:'Cumplimiento de Fictional shared objective',exact:true}).click();assert.equal((await prepare).status(),200);
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Cumplimiento de Fictional shared objective"]')?.checked===false);
  await editWithConflict('PENDING',true);
  let modal;
  await page.getByRole('button',{name:'Resumen',exact:true}).click();
  await page.getByRole('button',{name:'Editar ficha',exact:true}).click();
  modal=page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Editar ficha del caso',exact:true})});
  await modal.locator('select').first().selectOption('medio');
  profile={confirmed:gate(),release:gate()};
  const profileBefore=await page.evaluate(()=>window.__profileConsumed||0);
  await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await profile.confirmed.promise;
  await modal.getByRole('button').first().click();
  await page.getByRole('button',{name:'Cerrar sesion',exact:true}).click();
  await login('p',false);
  await page.getByRole('button',{name:'Ver detalle',exact:true}).waitFor();
  profile.release.resolve();
  await page.waitForFunction(n=>(window.__profileConsumed||0)>n,profileBefore);
  assert.equal(await page.getByText('Ficha del paciente actualizada.',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Ver detalle',exact:true}).click();
  await page.getByRole('button',{name:'Mi seguimiento',exact:true}).click();
  const timeline=page.getByRole('region',{name:'Mi seguimiento',exact:true});
  await timeline.locator('article').nth(2).waitFor();
  assert.equal((await page.locator('body').innerText()).includes('FICTIONAL_PRIVATE'),false);
  assert.equal(await page.getByRole('button',{name:'Notas clinicas',exact:true}).count(),0);
  assert.equal(counts.profile,1);
  await shot('patient-after-old-professional-put');
  results.push('Profile: confirmed professional PUT retained -> logout -> patient same file -> old response consumed; no old success/visible private content; state contamination separately checked by real App unit tests: PASS');
  assert.deepEqual(errors,[]);
  fs.writeFileSync('/work/callback-browser-result.json',JSON.stringify({results,errors,counts,runtime:{
   node:process.version,playwright:require('/review/node_modules/playwright/package.json').version,chromium:browser.version(),
  }},null,2));
  console.log(JSON.stringify({results,errors,counts}));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
