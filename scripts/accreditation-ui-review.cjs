const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const base=process.env.REVIEW_BASE;
const password='Episode-Demo-Only-284!';
const email='olivia@accreditation.invalid';
const name='Olivia Ejemplo';
const result={results:[],events:[],screenshots:[]};
const button=(page,name)=>page.getByRole('button',{name,exact:true});
let scenario='SETUP',browser;
const save=()=>fs.writeFileSync('/control/results.json',JSON.stringify(result));
const monitor=page=>{
  page.on('pageerror',()=>result.events.push({scenario,kind:'pageerror',expected:false}));
  page.on('response',response=>{
    if(response.status()>=400)result.events.push({scenario,kind:'http',status:response.status(),expected:false});
  });
};
async function screenshot(page,name){
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow');
  await page.screenshot({
    path:'/evidence/screenshots/'+name+'.png',fullPage:true,animations:'disabled',
    mask:[page.locator('input[type=password],input[type=email]'),page.getByText(/@accreditation\.invalid/)],maskColor:'#475569',
  });
  result.screenshots.push({file:'screenshots/'+name+'.png',scenario,secretsMasked:true});
}
async function test(id,action){
  scenario=id;
  try{
    await action();
    result.results.push({id,status:'PASS'});
    console.log(id+' PASS');
  }catch(error){
    result.results.push({id,status:'FAIL',failureCategory:error.name==='TimeoutError'?'timeout':'assertion'});
    fs.writeFileSync('/control/browser-failure.txt',error.stack);
    throw error;
  }finally{save();}
}
async function login(page,account){
  await page.goto(base);
  await button(page,'Iniciar sesion').click();
  await page.locator('input[name=email]').fill(account);
  await page.locator('input[name=password]').fill(password);
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/login');
  await button(page,'Entrar').click();
  assert.equal((await response).status(),200);
}
async function main(){
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]});
  fs.writeFileSync('/control/runtime.json',JSON.stringify({
    playwright:require('playwright/package.json').version,chromium:browser.version(),
    node:process.version,revision:process.env.REVIEW_REVISION,headless:true,
  }));
  const desktop=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX',timezoneId:'America/Chihuahua'});
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'es-MX',timezoneId:'America/Chihuahua'});
  const owner=await mobile.newPage(),admin=await desktop.newPage();
  monitor(owner);monitor(admin);
  await test('ACR01',async()=>{
    await owner.goto(base);
    await button(owner,'Registro psicologo').click();
    await owner.locator('input[name=firstName]').fill('Olivia');
    await owner.locator('input[name=lastName]').fill('Ejemplo');
    await owner.locator('input[name=email]').fill(email);
    await owner.locator('input[name=password]').fill(password);
    const registration=owner.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/register/psychologist');
    await button(owner,'Solicitar alta como psicologo').click();
    assert.equal((await registration).status(),202);
    await login(owner,email);
    await owner.getByRole('heading',{name:'Prepara tu solicitud'}).waitFor();
    assert.equal(await owner.evaluate(()=>localStorage.getItem('psicopanel_auth_token')),null);
    await button(owner,'Preparar solicitud').press('Enter');
    assert.equal(await owner.getByLabel('Nombre profesional',{exact:true}).inputValue(),name);
    await owner.getByLabel('Número de cédula profesional').fill('900028');
    await owner.getByLabel('Título de licenciatura en Psicología').fill('Licenciatura en Psicología');
    await owner.getByLabel('Institución educativa').fill('Instituto Ficticio de Psicología');
    await button(owner,'Revisar antes de enviar').press('Enter');
    await screenshot(owner,'ACR01-profesional-movil');
    await button(owner,'Enviar para revisión').press('Enter');
    await owner.getByRole('heading',{name:'En revisión'}).waitFor();
    const widescreen=await(await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
    monitor(widescreen);await login(widescreen,email);
    await widescreen.getByRole('heading',{name:'En revisión'}).waitFor();
    await screenshot(widescreen,'ACR01-profesional-escritorio');
  });
  await test('ACR02',async()=>{
    await login(admin,'reviewer@accreditation.invalid');
    await button(admin,'Credenciales profesionales').click();
    await button(admin,'Revisar '+name+', versión 1').click();
    await admin.getByRole('heading',{name:'Comprobaciones manuales'}).waitFor();
    await screenshot(admin,'ACR02-revision-escritorio');
    await admin.setViewportSize({width:390,height:844});
    await admin.getByLabel('Resultado',{exact:true}).scrollIntoViewIfNeeded();
    await screenshot(admin,'ACR02-resolucion-movil');
    await admin.setViewportSize({width:1440,height:1000});
    await admin.getByLabel('Resultado',{exact:true}).selectOption('approved');
    await admin.getByLabel('Mensaje para el profesional').fill('Tus credenciales ficticias están acreditadas. Falta resolver la cuenta.');
    await button(admin,'Revisar resolución').click();
    await admin.getByRole('alert').filter({hasText:'Marca cada comprobación'}).waitFor();
    for(const label of ['Existencia de la cédula','Correspondencia con la persona titular','Licenciatura en Psicología','Institución que expidió el título','Identidad cotejada con la cuenta']){
      await admin.getByLabel(label,{exact:true}).selectOption('matches');
    }
    await admin.getByLabel('Método de cotejo de identidad').selectOption('simulated_official_id');
    await button(admin,'Revisar resolución').click();
    await admin.getByRole('heading',{name:'Aprobar acreditación'}).waitFor();
    await button(admin,'Confirmar resolución').scrollIntoViewIfNeeded();
    await screenshot(admin,'ACR02-confirmacion-escritorio');
    await button(admin,'Confirmar resolución').click();
    await admin.getByText('Acreditación registrada.',{exact:false}).waitFor();
    await login(owner,email);
    await owner.getByRole('heading',{name:'Acreditación aprobada'}).waitFor();
    await screenshot(owner,'ACR02-acreditacion-aprobada-movil');
  });
  await test('ACR03',async()=>{
    await button(admin,'Usuarios').click();
    await admin.locator('article').filter({has:admin.getByRole('heading',{name,exact:true})}).getByRole('button',{name:'Revisar solicitud',exact:true}).click();
    await button(admin,'Aprobar').click();
    await admin.getByLabel('Mensaje destinado al profesional',{exact:true}).fill('Cuenta de ensayo aprobada.');
    const response=admin.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.endsWith('/review'));
    await button(admin,'Guardar revision').click();
    assert.equal((await response).status(),200);
    await login(owner,email);
    await owner.waitForFunction(()=>localStorage.getItem('psicopanel_auth_token'));
    await button(owner,'Perfil profesional').click();
    await owner.getByRole('heading',{name:'Acreditación vigente'}).waitFor();
    await screenshot(owner,'ACR03-perfil-profesional-movil');
  });
  assert.deepEqual(result.events,[]);
}
main().catch(()=>{process.exitCode=1;}).finally(async()=>{save();if(browser)await browser.close();});
