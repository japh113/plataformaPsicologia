const {chromium}=require('/review/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function main(){
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP frontend.localhost '+process.env.FRONTEND_IP]});
 const results=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX'});
  let detail=null,profile=null;const counts={note:0,objective:0,profile:0};
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,target='http://api:5000'+path+url.search;
   if(path.includes('/clinical-notes/')&&req.method()==='PATCH')counts.note++;
   if(path.includes('/objectives/')&&req.method()==='PATCH')counts.objective++;
   const control=path==='/api/patients/p'&&req.method()==='GET'?detail:path==='/api/patients/p'&&req.method()==='PUT'?profile:null;
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
  await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
  await page.getByRole('button',{name:'Abrir nota clinica',exact:true}).first().click();
  let modal=page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Editar nota clinica',exact:true})});
  await modal.locator('textarea').nth(3).fill('FICTIONAL_PRIVATE_AUDIT_EDITED');
  detail={confirmed:gate(),release:gate()};
  const before=await page.evaluate(()=>window.__detailConsumed||0);
  await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await detail.confirmed.promise;
  await modal.getByRole('button').first().click();
  await page.getByRole('button',{name:'Objetivos',exact:true}).click();
  const objective=page.getByRole('checkbox',{name:'Cumplimiento de Fictional shared objective',exact:true});
  const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.includes('/objectives/'));
  await objective.click();assert.equal((await patched).status(),200);
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Cumplimiento de Fictional shared objective"]')?.checked);
  detail.release.resolve();await page.waitForFunction(n=>(window.__detailConsumed||0)>n,before);detail=null;
  assert.equal(await objective.isChecked(),true);
  assert.deepEqual(counts,{note:1,objective:1,profile:0});
  await shot('objective-survives-old-professional-get');
  results.push('Objective: real note PATCH -> retained professional detail GET -> objective PATCH 200 -> old GET consumed; objective remains completed, one write each: PASS');
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
