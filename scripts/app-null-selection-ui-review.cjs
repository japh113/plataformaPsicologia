const {chromium}=require('/review/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function main(){
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP frontend.localhost '+process.env.FRONTEND_IP]});
 const errors=[],results=[],auth=[0,1].map(()=>({seen:gate(),release:gate()})),lists=[0,1].map(()=>({seen:gate(),release:gate()}));
 const counts={auth:0,lists:0,clinicalWrites:0};let controlled=true;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX'});
  const session=await context.request.post('http://api:5000/api/auth/login',{data:{email:'a@episodes.invalid',password:'Episode-Demo-Only-284!'}});
  assert.equal(session.status(),200);
  const body=await session.json();assert.ok(body.data.token);
  await context.addInitScript(token=>localStorage.setItem('psicopanel_auth_token',token),body.data.token);
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   if(path.startsWith('/api/patients')&&['POST','PATCH','PUT','DELETE'].includes(req.method()))counts.clinicalWrites++;
   let control,index=-1;
   if(controlled&&path==='/api/auth/me'){index=counts.auth++;control=auth[index];}
   if(controlled&&path==='/api/patients'&&req.method()==='GET'){index=counts.lists++;control=lists[index];}
   if(!control)return route.continue({url:'http://api:5000'+path+url.search});
   const response=await route.fetch({url:'http://api:5000'+path+url.search});assert.equal(response.status(),200);
   const data=await response.json();
   if(path==='/api/patients')assert.equal(data.data.some(p=>String(p.id)==='p'),true);
   control.seen.resolve();await control.release.promise;
   if(path==='/api/patients'&&index===1)return route.fulfill({response,contentType:'application/json',body:JSON.stringify({...data,data:[]})});
   return route.fulfill({response});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://frontend.localhost:5173');
  await Promise.all(auth.map(c=>c.seen.promise));
  auth[0].release.resolve();await lists[0].seen.promise;
  auth[1].release.resolve();await lists[1].seen.promise;
  lists[0].release.resolve();
  await page.locator('aside').getByRole('button',{name:'Mis Pacientes',exact:true}).click();
  await page.getByRole('button',{name:'Expediente',exact:true}).click();
  await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
  await page.getByText('FICTIONAL_PRIVATE_OBJECTIVE',{exact:false}).first().waitFor();
  lists[1].release.resolve();
  const fallback=page.getByRole('status',{name:'Sin expediente seleccionado',exact:true});
  await fallback.waitFor();
  assert.equal(await page.getByRole('button',{name:'Notas clinicas',exact:true}).count(),0);
  assert.equal((await page.locator('body').innerText()).includes('FICTIONAL_PRIVATE'),false);
  assert.equal(await page.getByText('No pudimos sincronizar la informacion',{exact:true}).count(),0);
  assert.equal(await page.getByText('Ya no tienes acceso a este expediente. Vuelve a comprobar tu sesión.',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Cerrar sesion',exact:true}).isVisible(),true);
  assert.equal(await page.evaluate(()=>Boolean(localStorage.getItem('psicopanel_auth_token'))),true);
  await page.screenshot({path:'/work/no-selected-patient-safe-view.png',fullPage:true,animations:'disabled'});
  await fallback.getByRole('button',{name:'Volver al tablero',exact:true}).click();
  await fallback.waitFor({state:'hidden'});
  await page.locator('aside').getByRole('button',{name:'Mis Pacientes',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Expediente',exact:true}).count(),0);
  controlled=false;
  await page.reload();
  await page.locator('aside').getByRole('button',{name:'Mis Pacientes',exact:true}).click();
  await page.getByRole('button',{name:'Expediente',exact:true}).click();
  await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
  await page.getByRole('button',{name:'Abrir nota clinica',exact:true}).first().waitFor();
  assert.equal(await fallback.count(),0);assert.equal(counts.clinicalWrites,0);
  assert.deepEqual({auth:counts.auth,lists:counts.lists},{auth:2,lists:2});
  assert.deepEqual(errors,[]);
  results.push('Real StrictMode App: two retained auth/list loads -> first P -> open private file -> second [] -> safe selection view, no private DOM/error/logout; back/dashboard/list and authorized P reopen work; zero clinical writes: PASS');
  fs.writeFileSync('/work/null-selection-browser-result.json',JSON.stringify({results,errors,counts,runtime:{node:process.version,playwright:require('/review/node_modules/playwright/package.json').version,chromium:browser.version()}},null,2));
  console.log(JSON.stringify({results,errors,counts}));
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
