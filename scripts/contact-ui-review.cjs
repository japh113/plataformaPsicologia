const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),readline=require('node:readline');
const base=process.env.REVIEW_BASE,pw='Episode-Demo-Only-284!',oldEmail='r@episodes.invalid',newEmail='renata.changed@contact-review.invalid';
const secrets=new Set([pw,'Incorrect-Password-Only!']),results=[],events=[],screenshots=[],layouts=[],receivers=[];
const input=readline.createInterface({input:process.stdin});input.on('line',line=>receivers.shift()?.(JSON.parse(line)));
let browser,page,current='SETUP',allowed=new Set();
const clean=v=>{let s=String(v);for(const value of secrets)if(value)s=s.split(value).join('[OCULTO]');return s.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,'[SESIÓN OCULTA]').replace(/(https?:\/\/[^\s?#)"']+)[?#][^\s)"']+/g,'$1[PARÁMETROS OCULTOS]');};
const save=()=>fs.writeFileSync('/control/results.json',clean(JSON.stringify({results,events,screenshots,layouts},null,2)));
async function rpc(action,values={}){const promise=new Promise(r=>receivers.push(r));console.log('CONTROL '+JSON.stringify({action,...values}));const reply=await promise;if(reply.error)throw Error(reply.error);if(reply.secret)secrets.add(reply.secret);return reply;}
function watch(p){p.on('console',m=>{if(!['error','warning'].includes(m.type()))return;const message=clean(m.text()),code=/status of (\d+)/.exec(message);events.push({scenario:current,type:'console-'+m.type(),message,expected:!!(code&&allowed.has(+code[1]))});save();});p.on('requestfailed',r=>{const message=r.failure()?.errorText||'';events.push({scenario:current,type:'requestfailed',message:clean(message),expected:message==='net::ERR_ABORTED'});save();});p.on('pageerror',e=>{events.push({scenario:current,type:'pageerror',message:clean(e.message),expected:false});save();});p.on('response',r=>{if(r.status()>=400){events.push({scenario:current,type:'http',path:new URL(r.url()).pathname,status:r.status(),expected:allowed.has(r.status())});save();}});}
async function settle(p=page){await p.waitForLoadState('networkidle',{timeout:9000}).catch(()=>{});}
const panel=(p=page)=>p.locator('[aria-label="Cambio seguro de contactos"]');
const button=(p,name)=>p.getByRole('button',{name,exact:true});
async function click(p,locator,path,status=200){const response=p.waitForResponse(r=>new URL(r.url()).pathname===path);await locator.click();const res=await response;assert.equal(res.status(),status,path);await settle(p);return (await res.json()).data;}
async function shot(name,p=page){
 await settle(p);assert.ok(!/[#?].*(changeEmail|verifyEmail|Token)/.test(p.url()));
 const viewport=p.viewportSize(),mobile=viewport.width<500;
 const region=p.locator('section').filter({has:p.getByRole('heading',{name:'Mi identidad y contactos',exact:true})});
 const options={path:'/evidence/screenshots/'+name+'.png',animations:'disabled',mask:[p.locator('input'),p.getByText(/@|\+\d[\d ()-]{6,}/),p.locator('p').filter({hasText:/Password demo:/})],maskColor:'#475569'};
 let captureViewport=viewport;
 try {
  if(mobile && await region.count()===1){
   const height=Math.ceil((await region.boundingBox()).height)+240;
   captureViewport={width:viewport.width,height:Math.max(viewport.height,height)};
   await p.setViewportSize(captureViewport);await region.scrollIntoViewIfNeeded();await region.screenshot(options);
  } else await p.screenshot({...options,fullPage:true});
 } finally {if(mobile)await p.setViewportSize(viewport);}
 screenshots.push({file:'screenshots/'+name+'.png',scenario:current,viewport,captureViewport,region:mobile?'complete identity section at mobile width':'page',secretsMasked:true});save();return 'screenshots/'+name+'.png';
}
async function scenario(id,description,fn,statuses=[]){current=id;allowed=new Set(statuses);try{await fn();results.push({id,description,status:'PASS'});}catch(error){results.push({id,description,status:'FAIL',error:clean(error.message).split('\n').slice(0,6).join(' ')});try{await shot(id+'-failure');}catch{}save();throw error;}save();console.log(id+' PASS');}
async function login(p,email,password=pw){await p.goto(base);await settle(p);await button(p,'Iniciar sesion').click();const f=p.locator('form').filter({has:button(p,'Entrar')});await f.locator('[name=email]').fill(email);await f.locator('[name=password]').fill(password);await click(p,button(p,'Entrar'),'/api/auth/login');await panel(p).waitFor();await settle(p);}
async function begin(p,channel,contact,name){await button(p,name||(channel==='email'?'Cambiar correo':'Cambiar teléfono')).click();await p.getByLabel(channel==='email'?'Nuevo correo':'Nuevo teléfono internacional',{exact:true}).fill(contact);await p.getByLabel('Contraseña para iniciar cambio',{exact:true}).fill(pw);return click(p,button(p,name?.startsWith('Sustituir')?'Sustituir expresamente':'Iniciar cambio seguro'),'/api/auth/contact-changes');}
async function state(p){return p.evaluate(async()=>{const r=await fetch('http://api:5000/api/auth/contact-changes',{headers:{Authorization:'Bearer '+localStorage.getItem('psicopanel_auth_token')}});return (await r.json()).data.request;});}
async function verify(p,email,channel){const row=await state(p);await click(p,button(p,'Enviar verificación al nuevo contacto'),'/api/auth/contact-changes/'+row.id+'/resend');const {secret}=await rpc('mailbox',{email,channel});await p.getByLabel('Secreto del nuevo contacto',{exact:true}).fill(secret);await click(p,button(p,'Verificar candidato'),'/api/auth/contact-changes/'+row.id+'/verify');return row;}
async function layout(p,label){const size=await p.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));layouts.push({label,...size});assert.ok(size.documentWidth<=size.viewport+1);save();}
async function main(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]});
 fs.writeFileSync('/control/runtime.json',JSON.stringify({playwright:require('playwright/package.json').version,chromium:browser.version(),node:process.version,revision:process.env.REVIEW_REVISION,headless:true}));
 const desktop=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-MX',timezoneId:'America/Mexico_City'});page=await desktop.newPage();watch(page);
 let other,tab,row,emailSecret;
 await scenario('C01','Dos sesiones independientes y una pestaña compartida',async()=>{
  await login(page,oldEmail);const context=await browser.newContext({viewport:{width:1280,height:900},locale:'es-MX'});other=await context.newPage();watch(other);await login(other,oldEmail);
  tab=await desktop.newPage();watch(tab);await tab.goto(base);await panel(tab).waitFor();await shot('01-desktop-current');await layout(page,'desktop');
 });
 await scenario('C02','Contraseña incorrecta no inicia ni sustituye',async()=>{
  await button(page,'Cambiar correo').click();await page.getByLabel('Nuevo correo',{exact:true}).fill(newEmail);await page.getByLabel('Contraseña para iniciar cambio',{exact:true}).fill('Incorrect-Password-Only!');
  await click(page,button(page,'Iniciar cambio seguro'),'/api/auth/contact-changes',400);await page.getByText('Contraseña incorrecta.',{exact:false}).waitFor();await shot('02-wrong-password');
 },[400]);
 await scenario('C03','Candidato separado y plazo de reautenticación',async()=>{
  await page.getByLabel('Contraseña para iniciar cambio',{exact:true}).fill(pw);const data=await click(page,button(page,'Iniciar cambio seguro'),'/api/auth/contact-changes');row=data.request;
  await page.getByText('Correo: '+oldEmail,{exact:true}).waitFor();await panel().getByText('Candidato: '+newEmail,{exact:true}).waitFor();await shot('03-pending-email');
  await click(page,button(page,'Enviar verificación al nuevo contacto'),'/api/auth/contact-changes/'+row.id+'/resend');emailSecret=(await rpc('mailbox',{email:oldEmail,channel:'email'})).secret;
 });
 await scenario('C04','Enlace se limpia y no sustituye ni verifica automáticamente',async()=>{
  await page.goto(base+'/#changeEmail='+row.id+'.'+emailSecret);await panel().waitFor();await settle();assert.ok(!page.url().includes('changeEmail'));
  assert.equal(await page.getByLabel('Secreto del nuevo contacto',{exact:true}).inputValue(),emailSecret);assert.equal((await state(page)).verified,false);await shot('04-link-explicit');
 });
 await scenario('C05','Verificar candidato conserva correo vigente',async()=>{
  await click(page,button(page,'Verificar candidato'),'/api/auth/contact-changes/'+row.id+'/verify');await page.getByText('Correo: '+oldEmail,{exact:true}).waitFor();assert.equal((await state(page)).verified,true);await shot('05-candidate-verified');
 });
 await scenario('C06','Recarga y contraseña vencida conservan candidato verificado',async()=>{
  await rpc('expire_reauthentication',{requestId:row.id});await page.reload();await panel().waitFor();await page.getByText('Reautenticación requerida antes de confirmar.',{exact:true}).waitFor();
  assert.ok(await button(page,'Confirmar cambio y cerrar sesiones').isDisabled());assert.equal((await state(page)).verified,true);await shot('06-reauthentication-required');
 });
 await scenario('C07','Nueva contraseña reciente permite confirmación explícita',async()=>{
  await page.getByLabel('Contraseña para reautenticar',{exact:true}).fill(pw);await click(page,button(page,'Validar contraseña de nuevo'),'/api/auth/contact-changes/'+row.id+'/reauthenticate');assert.ok(await button(page,'Confirmar cambio y cerrar sesiones').isEnabled());assert.equal(await page.getByText('Los cambios de correo y teléfono estarán disponibles en una entrega posterior.',{exact:true}).count(),0);await shot('07-ready-to-confirm');
 });
 await scenario('C08','Confirmación cierra sesión actual, pestaña y sesión independiente',async()=>{
  await click(page,button(page,'Confirmar cambio y cerrar sesiones'),'/api/auth/contact-changes/'+row.id+'/confirm');await button(page,'Entrar').waitFor();await button(tab,'Entrar').waitFor();
  await other.reload();await button(other,'Entrar').waitFor();await shot('08-all-sessions-ended');
 },[401]);
 await scenario('C09','Login con nuevo correo conserva identidad y evidencia',async()=>{await login(page,newEmail);await page.getByText('Correo: '+newEmail,{exact:true}).waitFor();await shot('09-new-email-login');});
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'es-MX',timezoneId:'America/Mexico_City'}),m=await mobile.newPage();watch(m);
 await scenario('M01','Móvil: cancelar conserva contacto vigente',async()=>{
  await login(m,newEmail);await begin(m,'sms','+525500998811');const q=await state(m);await shot('10-mobile-pending',m);await click(m,button(m,'Cancelar solicitud'),'/api/auth/contact-changes/'+q.id+'/cancel');await m.getByText('Solicitud cancelada.',{exact:false}).waitFor();await panel(m).getByText('Cancelado',{exact:true}).waitFor();await shot('11-mobile-cancelled',m);await m.reload();await panel(m).getByText('Cancelado',{exact:true}).waitFor();await shot('11b-mobile-cancelled-after-reload',m);await layout(m,'mobile-cancel');
 });
 await scenario('M02','Móvil: sustitución explícita invalida solicitud anterior',async()=>{
  await begin(m,'sms','+525500998822');const original=await state(m);await begin(m,'email','another@contact-review.invalid','Sustituir solicitud por correo');const next=await state(m);assert.notEqual(original.id,next.id);assert.equal(next.candidate,'another@contact-review.invalid');await shot('12-mobile-replaced',m);await click(m,button(m,'Cancelar solicitud'),'/api/auth/contact-changes/'+next.id+'/cancel');
 });
 await scenario('M03','Móvil: SMS, confirmación y cierre de sesión',async()=>{
  await begin(m,'sms','+525500998833');const q=await verify(m,newEmail,'sms');assert.ok(await button(m,'Cancelar solicitud').isEnabled());await shot('13-mobile-verified-phone',m);await layout(m,'mobile-verified');await click(m,button(m,'Confirmar cambio y cerrar sesiones'),'/api/auth/contact-changes/'+q.id+'/confirm');await button(m,'Entrar').waitFor();await login(m,newEmail);await m.getByText('Teléfono: +525500998833',{exact:true}).waitFor();await shot('14-mobile-completed',m);await layout(m,'mobile-completed');
 },[401]);
 await scenario('R01','Clínica legacy y acceso personal siguen disponibles',async()=>{
  await login(page,'p@episodes.invalid');await page.getByText('Desconocida en el registro histórico',{exact:false}).waitFor();await shot('15-legacy-continuity');
 },[401]);
 assert.equal(events.filter(e=>!e.expected).length,0,'Unexpected browser errors or HTTP failures');
 await browser.close();input.close();save();
}
main().catch(async error=>{console.error(clean(error.message));save();if(browser)await browser.close();input.close();process.exitCode=1;});
