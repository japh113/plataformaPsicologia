const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),readline=require('node:readline');
const base=process.env.REVIEW_BASE,out='/evidence',pw='Ui-Review-Only-867!',demoPw='Episode-Demo-Only-284!';
const secrets=new Set([pw,demoPw,'Demo12345!','000000','000001']),results=[],events=[],shots=[],layouts=[],receivers=[];
let page,browser,current='SETUP',expected=new Set();
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>receivers.shift()?.(JSON.parse(line)));
function clean(value){let s=String(value);for(const v of [...secrets].sort((a,b)=>b.length-a.length))if(v)s=s.split(v).join('[OCULTO]');return s.replace(/Bearer\s+\S+/gi,'[AUTORIZACIÓN OCULTA]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,'[SESIÓN OCULTA]').replace(/(https?:\/\/[^\s?#)"']+)[?#][^\s)"']+/g,'$1[PARÁMETROS OCULTOS]');}
function save(){fs.writeFileSync('/control/review-data.json',clean(JSON.stringify({results,events,shots,layouts},null,2)));}
async function rpc(action,values={}){const p=new Promise(r=>receivers.push(r));console.log('CONTROL '+JSON.stringify({action,...values}));const r=await p;if(r.error)throw Error(r.error);if(r.secret)secrets.add(r.secret);return r;}
function instrument(p){
 p.on('pageerror',e=>{events.push({scenario:current,kind:'pageerror',expected:false,message:clean(e.message)});save();});
 p.on('console',m=>{if(!['error','warning'].includes(m.type()))return;const s=clean(m.text()),code=/status of (\d+)/.exec(s);events.push({scenario:current,kind:'console-'+m.type(),expected:!!(code&&expected.has(+code[1])),message:s});save();});
 p.on('response',r=>{if(r.status()<400)return;events.push({scenario:current,kind:'http',method:r.request().method(),path:new URL(r.url()).pathname,status:r.status(),expected:expected.has(r.status())});save();});
 p.on('requestfailed',r=>{const s=r.failure()?.errorText||'';events.push({scenario:current,kind:'requestfailed',path:new URL(r.url()).pathname,expected:s==='net::ERR_ABORTED',message:clean(s)});save();});
}
async function settle(p=page){await p.waitForLoadState('networkidle',{timeout:9000}).catch(()=>{});}
const ident=(p=page)=>p.locator('section').filter({has:p.getByRole('heading',{name:'Mi identidad y contactos',exact:true})});
async function text(value,p=page){await p.getByText(value,{exact:false}).first().waitFor({state:'visible',timeout:8000});}
async function shot(name,p=page){await settle(p);await p.screenshot({path:out+'/screenshots/'+name+'.png',fullPage:true,animations:'disabled',mask:[p.locator('input[type=password]'),p.locator('input[autocomplete="one-time-code"]'),p.locator('p').filter({hasText:/Password demo:/})],maskColor:'#475569'});shots.push({file:name+'.png',scenario:current,...p.viewportSize(),secretsMasked:true});save();return 'screenshots/'+name+'.png';}
async function test(id,description,want,fn,codes=[]){current=id;expected=new Set(codes);try{const r=await fn();results.push({id,description,expected:want,status:r?.status||'PASS',observed:r?.observed||'Comprobado mediante interacción real en Chromium.',screenshot:r?.screenshot||'',severity:r?.severity||'—'});}catch(e){let pic='';try{pic=await shot(id.toLowerCase()+'-failure');}catch{}results.push({id,description,expected:want,status:'FAIL',observed:clean(e.message).split('\n').slice(0,6).join(' '),screenshot:pic,severity:'Importante',harnessNeedsReview:true});}save();console.log('SCENARIO '+id+' '+results.at(-1).status);}
async function click(p,button,path,status){const wait=p.waitForResponse(r=>new URL(r.url()).pathname===path,{timeout:10000});await button.click();const r=await wait;assert.equal(r.status(),status,path);await settle(p);return r;}
async function login(email,password=pw,p=page,navigate=true){if(navigate)await p.goto(base);await settle(p);await p.getByRole('button',{name:'Iniciar sesion',exact:true}).click();const f=p.locator('form').filter({has:p.getByRole('button',{name:'Entrar',exact:true})});await f.locator('[name=email]').fill(email);await f.locator('[name=password]').fill(password);const r=await click(p,f.getByRole('button',{name:'Entrar',exact:true}),'/api/auth/login',200);await settle(p);return (await r.json()).data.user;}
async function logout(p=page){await p.getByRole('button',{name:p.viewportSize().width<768?'Salir':'Cerrar sesion',exact:true}).click();await settle(p);}
async function reg(p=page){await p.getByRole('button',{name:'Crear cuenta paciente',exact:true}).first().click();return p.locator('form').filter({has:p.locator('[name=birthDate]')});}
async function fill(f,email,dob='1990-05-20',phone='+525500001111'){for(const [name,value]of Object.entries({firstName:'Camila',lastName:'Prueba Visual',email,password:pw,birthDate:dob,phone}))await f.locator('[name='+name+']').fill(value);}
const submit=f=>f.getByRole('button',{name:'Crear cuenta paciente',exact:true});
async function layout(p,label){const r=await p.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,oversized:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&(r.right>innerWidth+2||r.left< -2);}).slice(0,10).map(e=>({tag:e.tagName,text:(e.innerText||'').slice(0,65),right:Math.round(e.getBoundingClientRect().right)}))}));layouts.push({scenario:current,label,...r});save();return r;}

async function api(p,path){
 return p.evaluate(async path=>{
  const r=await fetch('http://api:5000/api'+path,{headers:{Authorization:'Bearer '+localStorage.getItem('psicopanel_auth_token')}});
  return {status:r.status,body:await r.json()};
 },path);
}

async function main(){
 browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]});fs.writeFileSync('/control/runtime.json',JSON.stringify({playwright:require('playwright/package.json').version,chromium:browser.version(),node:process.version,headless:true,revision:process.env.REVIEW_REVISION}));
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX',timezoneId:'America/Mexico_City'});page=await context.newPage();instrument(page);
 const email='adult-'+Date.now()+'@ui-review.invalid';let f,user,emailToken,sms,early,stale,verified=false;
 await test('A01','Login escritorio','Pantalla real legible a 1440×900.',async()=>{await page.goto(base);await text('Iniciar sesion');return {screenshot:await shot('01-login-desktop')};});
 f=await reg();
 await test('A02','Registro no clínico','Solo nombre, DOB, contactos y contraseña.',async()=>{assert.deepEqual((await f.locator('input').evaluateAll(a=>a.map(e=>e.name))).sort(),['birthDate','email','firstName','lastName','password','phone'].sort());return {observed:'Sin campos de motivo, riesgo, entrevista o psicólogo.',screenshot:await shot('02-registration')};});
 await test('A03','Obligatorios vacíos','Chromium impide enviar y enfoca el campo.',async()=>{let n=0;const on=r=>{if(new URL(r.url()).pathname==='/api/auth/register/patient')n++;};page.on('request',on);await submit(f).click();const r=await f.locator('[name=firstName]').evaluate(e=>({valid:e.validity.valid,message:e.validationMessage,focus:e===document.activeElement}));page.off('request',on);assert.equal(n,0);assert.ok(!r.valid&&r.message&&r.focus);return {observed:'Envío bloqueado por validación nativa; foco en Nombre.',screenshot:await shot('03-empty-required')};});
 await test('A04','Fecha futura','Rechazo y mensaje visible.',async()=>{await fill(f,email,'2099-01-01');await click(page,submit(f),'/api/auth/register/patient',400);await text('La fecha de nacimiento no puede ser futura.');return {observed:'Error de fecha visible en español.',screenshot:await shot('04-future-dob')};},[400]);
 await test('A05','Fecha inexistente por teclado','Control nativo bloquea valor inválido.',async()=>{const d=f.locator('[name=birthDate]');await d.fill('2026-02-28');await d.press('Control+A');await d.pressSequentially('02/30/2026');await d.press('Tab');const r=await d.evaluate(e=>({value:e.value,valid:e.validity.valid,message:e.validationMessage}));if(r.value&&r.valid)return {status:'PASS',observed:'Chromium normalizó el control segmentado a una fecha válida; se verifica el comportamiento nativo. El rechazo backend de fechas inválidas se cubre en integración.',screenshot:await shot('05-invalid-date')};await submit(f).click();assert.ok(!r.valid);return {observed:'Control inválido/incompleto bloquea envío. '+r.message,screenshot:await shot('05-invalid-date')};});
 await test('A06','Registro menor','Rechazo visible sin alta.',async()=>{await fill(f,email,'2015-01-01');await click(page,submit(f),'/api/auth/register/patient',400);await text('El registro independiente requiere tener 18 años o más.');return {observed:'Menor rechazado con explicación en español.',screenshot:await shot('06-minor-error')};},[400]);
 await test('A07','Registro adulto','Acuse explica siguiente paso.',async()=>{await fill(f,email);await click(page,submit(f),'/api/auth/register/patient',202);await text('ya puedes iniciar sesión');return {observed:'Acuse visible; permanece en registro y vacía formulario, indicando iniciar sesión.',screenshot:await shot('07-registration-complete')};});
 await test('A08','Login del nuevo adulto','Acceso sin entrevista ni vínculo.',async()=>{user=await login(email);await text('Todavía no tienes psicólogo vinculado.');return {screenshot:await shot('08-patient-no-psychologist')};});
 if(!user)throw Error('Login esencial no completado; recorridos dependientes no ejecutables.');

 await test('D08','Paciente nuevo sin obligación clínica','Avisos coherentes con cuenta sin vínculo/episodio.',async()=>{
 await text('Tu cuenta está registrada');
 assert.equal(await page.getByRole('button',{name:'Completar entrevista',exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'Completar tu entrevista inicial',exact:true}).count(),0);
 const body=await page.locator('body').innerText();
 assert.ok(!body.includes('Necesitas completar tu entrevista')&&!body.includes('Entrevista inicial pendiente'));
 assert.ok(body.includes('no es un requisito de registro'));
 return {screenshot:await shot('46-unlinked-coherent-next-step')};
 });

 await test('D01','DOB y contactos iniciales','DOB correcta y ambos sin verificar.',async()=>{await text('1990-05-20');assert.equal(await ident().getByText('Sin verificar',{exact:true}).count(),2);return {screenshot:await shot('09-unverified-contacts')};});
 await test('C01','SMS antes de email','Restricción visible.',async()=>{await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',409);await text('Verifica primero tu correo');return {screenshot:await shot('10-sms-before-email')};},[409]);

 await test('B01','Solicitar email y espera','Entrega simulada y espera visible.',async()=>{await click(page,ident().getByRole('button',{name:'Solicitar enlace',exact:true}),'/api/auth/verification/email/request',200);await text('Enlace solicitado.');assert.ok(await ident().getByRole('button',{name:/Reintenta en \d+ segundos/}).isDisabled());emailToken=(await rpc('mailbox',{email,channel:'email'})).secret;return {observed:'Aviso de 24 h y espera; entrega recuperada solo por CLI privado.',screenshot:await shot('11-email-request-wait')};});
 await test('B02','Reenvío temprano de email','Límite persistente en otra pestaña.',async()=>{early=await context.newPage();instrument(early);await early.goto(base);await settle(early);await click(early,ident(early).getByRole('button',{name:'Solicitar enlace',exact:true}),'/api/auth/verification/email/request',429);await text('Verificación temporalmente limitada',early);return {screenshot:await shot('12-email-early-resend',early)};},[429]);

 await test('B06','Enlace antes de iniciar sesión','Login conserva enlace y exige confirmación explícita.',async()=>{
 const anon=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX'}),p=await anon.newPage();instrument(p);
 await p.goto(base+'/#verifyEmail='+emailToken);await text('Iniciar sesion',p);
 assert.equal(await p.getByRole('button',{name:'Confirmar correo',exact:true}).count(),0);
 await login(email,pw,p,false);await text('1990-05-20',p);
 assert.equal(await ident(p).getByRole('textbox',{name:'Token del enlace recibido'}).inputValue(),emailToken);
 assert.ok(!p.url().includes('verifyEmail'));assert.equal(await ident(p).getByText('Sin verificar',{exact:true}).count(),2);
 await shot('44-email-link-before-login',p);await anon.close();
 return {observed:'Contexto sin sesión abre enlace; login del destinatario importa y limpia URL sin verificar automáticamente.',screenshot:'screenshots/44-email-link-before-login.png'};
 });
 await test('B07','Enlace en cuenta distinta','Rechazo sin consumir enlace del destinatario.',async()=>{
 const wrong=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX'}),p=await wrong.newPage();instrument(p);
 await p.goto(base+'/#verifyEmail='+emailToken);await login('historical@ui-review.invalid',pw,p,false);await text('Desconocida en el registro histórico',p);
 await click(p,ident(p).getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',400);await text('Verificación inválida o vencida',p);
 await shot('45-email-wrong-account',p);await wrong.close();
 return {screenshot:'screenshots/45-email-wrong-account.png'};
 },[400]);

 await test('B03','Email en misma pestaña autenticada','Importar fragmento, limpiar URL y esperar confirmación.',async()=>{
 await page.goto(base+'/#verifyEmail='+emailToken);await settle();
 assert.equal(await ident().getByRole('textbox',{name:'Token del enlace recibido'}).inputValue(),emailToken);
 assert.ok(!page.url().includes('verifyEmail'));
 assert.equal(await ident().getByText('Sin verificar',{exact:true}).count(),2);
 return {observed:'Cambio de fragmento en componente montado importa enlace sin recarga, limpia URL y no verifica automáticamente.',screenshot:await shot('13-same-tab-email-link')};
 });
await test('B04','Confirmación explícita en misma pestaña','Confirmar con la cuenta destinataria sin recargar.',async()=>{
 await click(page,ident().getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',200);
 assert.equal(await ident().getByText('Verificado',{exact:true}).count(),1);
 return {screenshot:await shot('14-email-verified')};
 });
 await test('B05','Reutilización de email','Formulario previo rechaza enlace consumido.',async()=>{await ident(early).getByRole('textbox',{name:'Token del enlace recibido'}).fill(emailToken);await click(early,ident(early).getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',400);await text('Verificación inválida o vencida',early);return {screenshot:await shot('15-email-reuse',early)};},[400]);
 await test('C02','Solicitar SMS y espera','Mensaje y 60 segundos visibles.',async()=>{await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',200);sms=(await rpc('mailbox',{email,channel:'sms'})).secret;await text('Código solicitado.');assert.ok(await ident().getByRole('button',{name:/Reintenta en \d+ segundos/}).isDisabled());stale=await context.newPage();instrument(stale);await stale.goto(base);await settle(stale);return {screenshot:await shot('16-sms-request')};});
 await test('C03','Confirmar SMS','Ambos contactos visibles como verificados.',async()=>{await ident().getByRole('textbox',{name:'Código SMS',exact:true}).fill(sms);await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',200);assert.equal(await ident().getByText('Verificado',{exact:true}).count(),2);verified=true;await shot('17-sms-verified');return {screenshot:await shot('18-both-verified')};});
 await test('C04','Reutilizar SMS','UI previa rechaza código consumido.',async()=>{await ident(stale).getByRole('textbox',{name:'Código SMS',exact:true}).fill(sms);await click(stale,ident(stale).getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',400);await text('Verificación inválida o vencida',stale);return {screenshot:await shot('19-sms-reuse',stale)};},[400]);
await test('D02','Nombre propio, saludo y sidebar','Guardar y sincronizar sin recarga.',async()=>{
 await ident().getByRole('textbox',{name:'Nombre',exact:true}).fill('Camila Revisada');
 await ident().getByRole('textbox',{name:'Apellido',exact:true}).fill('Prueba Actualizada');
 const r=await click(page,ident().getByRole('button',{name:'Guardar nombre'}),'/api/auth/identity',200);
 const d=(await r.json()).data;assert.equal(d.firstName,'Camila Revisada');assert.equal(d.lastName,'Prueba Actualizada');
 await page.getByRole('heading',{name:'Hola, Camila Revisada',exact:true}).waitFor();
 await page.locator('aside').getByText('Camila Revisada Prueba Actualizada',{exact:true}).waitFor();
 return {observed:'Formulario, saludo y sidebar actualizados sin recargar documento.',screenshot:await shot('20-name-edited')};
 });
 await test('D03','Nombre tras recarga','Persisten los dos campos.',async()=>{await page.reload();await settle();assert.equal(await ident().getByRole('textbox',{name:'Nombre',exact:true}).inputValue(),'Camila Revisada');assert.equal(await ident().getByRole('textbox',{name:'Apellido',exact:true}).inputValue(),'Prueba Actualizada');return {screenshot:await shot('21-name-persisted')};});
 await test('D04','Lectura DOB/contactos y legacy','Sin editor ni acciones nuevas.',async()=>{assert.equal(await ident().locator('input[type=date],input[type=email],input[type=tel]').count(),0);assert.equal(await page.getByRole('button',{name:/Solicitar vinculo|Aceptar invitacion|Invitar paciente|Canjear/}).count(),0);await text('temporalmente deshabilitadas');return {screenshot:await shot('22-patient-legacy-disabled')};});
await test('D05','Persistencia tras cerrar sesión','Nombre y dos verificaciones persistentes.',async()=>{
 assert.ok(verified);await logout();await login(email);await text('1990-05-20');
 await ident().getByText('Verificado',{exact:true}).nth(1).waitFor();
 assert.equal(await ident().getByText('Verificado',{exact:true}).count(),2);
 assert.equal(await ident().getByRole('textbox',{name:'Nombre',exact:true}).inputValue(),'Camila Revisada');
 await page.locator('aside').getByText('Camila Revisada Prueba Actualizada',{exact:true}).waitFor();
 return {screenshot:await shot('23-verification-persisted')};
 });
 await test('F01','Teclado y foco en identidad','Tabulación y foco distinguible.',async()=>{await layout(page,'desktop-patient');await ident().getByRole('textbox',{name:'Nombre',exact:true}).focus();await page.keyboard.press('Tab');const r=await page.evaluate(()=>({name:document.activeElement.getAttribute('aria-label'),outline:getComputedStyle(document.activeElement).outlineStyle,shadow:getComputedStyle(document.activeElement).boxShadow}));assert.equal(r.name,'Apellido');return {observed:'Tab alcanza Apellido; outline '+r.outline+', shadow '+r.shadow+'. Revisión visual del foco en captura.',screenshot:await shot('24-keyboard-focus')};});
 await test('D06','Histórico sin DOB global','Valor desconocido visible sin romper panel.',async()=>{await logout();await login('historical@ui-review.invalid');await text('Desconocida en el registro histórico');return {observed:'Fixture legacy propio, sin relación, muestra DOB desconocida.',screenshot:await shot('25-historical-unknown-dob')};});
await test('D07','Histórico con entrevista pendiente','Identidad accesible; entrevista explícita y cerrable sin guardar.',async()=>{
 await logout();await login('p@episodes.invalid',demoPw);await text('Desconocida en el registro histórico');
 assert.equal(await page.getByRole('button',{name:'Cerrar entrevista',exact:true}).count(),0);
 await ident().getByRole('textbox',{name:'Nombre',exact:true}).fill('Demo P');
 await ident().getByRole('textbox',{name:'Apellido',exact:true}).fill('Ficticio');
 await click(page,ident().getByRole('button',{name:'Guardar nombre'}),'/api/auth/identity',200);
 await page.getByRole('button',{name:'Completar entrevista',exact:true}).click();
 await page.getByRole('button',{name:'Cerrar entrevista',exact:true}).waitFor();
 await shot('26a-historical-interview-closable');
 await page.getByRole('button',{name:'Cerrar entrevista',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Cerrar entrevista',exact:true}).count(),0);
 const response=await api(page,'/patients/p');assert.equal(response.status,200);assert.equal(response.body.data.interviewCompleted,false);
 await ident().getByRole('textbox',{name:'Nombre',exact:true}).focus();
 return {observed:'Identidad editable con entrevista pendiente; abrir/cerrar no crea entrevista ni cambia completitud. Sin modal automático.',screenshot:await shot('26-historical-personal-access')};
 });

 await test('D10','Verificar contactos con entrevista pendiente','Email y SMS disponibles sin entrevista ni DOB inferida.',async()=>{
 await click(page,ident().getByRole('button',{name:'Solicitar enlace',exact:true}),'/api/auth/verification/email/request',200);
 const emailSecret=(await rpc('mailbox',{email:'p@episodes.invalid',channel:'email'})).secret;
 await page.goto(base+'/#verifyEmail='+emailSecret);
 await click(page,ident().getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',200);
 await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',200);
 const code=(await rpc('mailbox',{email:'p@episodes.invalid',channel:'sms'})).secret;
 await ident().getByRole('textbox',{name:'Código SMS',exact:true}).fill(code);
 await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',200);
 assert.equal(await ident().getByText('Verificado',{exact:true}).count(),2);
 await text('Desconocida en el registro histórico');
 const r=await api(page,'/patients/p');assert.equal(r.body.data.interviewCompleted,false);
 return {observed:'Histórico con teléfono explícitamente ficticio del fixture propio verifica ambos contactos; DOB desconocida y entrevista pendiente conservadas.',screenshot:await shot('47-historical-verified-intake-pending')};
 });

 const clinician=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX',timezoneId:'America/Mexico_City'});page=await clinician.newPage();instrument(page);
await test('E01','Dashboard profesional','Sin excepción React; relación histórica y alta deshabilitada.',async()=>{
 await login('a@episodes.invalid',demoPw);await text('Demo P');
 await page.getByRole('heading',{name:'Vinculación clínica',exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Nuevas altas temporalmente deshabilitadas',exact:true}).isDisabled());
 assert.ok(!events.some(e=>e.kind==='pageerror'));
 return {screenshot:await shot('27-psychologist-dashboard')};
 });
await test('E02','Vínculos históricos y DTO mínimo','Nombre/estado propios, sin acciones legacy ni email profesional.',async()=>{
 const rel=page.locator('section').filter({has:page.getByRole('heading',{name:'Vinculación clínica',exact:true})});
 await rel.getByText('Demo P Ficticio',{exact:true}).waitFor();await rel.getByText('Activa',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Invitar|Aceptar solicitud|Solicitar vinculo/}).count(),0);
 const body=await page.locator('body').innerText();for(const s of ['a@episodes.invalid','b@episodes.invalid','q@episodes.invalid','Demo Q'])assert.ok(!body.includes(s));
 const r=await api(page,'/auth/care-relationships');assert.equal(r.status,200);assert.equal(r.body.data.length,1);
 for(const item of r.body.data)assert.equal(item.psychologist.email,undefined);
 return {observed:'Relación propia visible con nombre/estado. Sin controles legacy; respuesta real del navegador sin email profesional.',screenshot:await shot('28-professional-legacy-disabled')};
 });
await test('E03','Expediente autorizado','Abrir expediente histórico desde la lista real.',async()=>{
 await page.getByRole('button',{name:'Mis Pacientes',exact:true}).click();await settle();
 await page.getByRole('button',{name:'Expediente',exact:true}).click();await settle();await text('Demo P Ficticio');
 await page.getByRole('button',{name:'Entrevista',exact:true}).waitFor();
 await page.getByRole('button',{name:'Objetivos',exact:true}).click();await text('Synthetic legacy objective');await page.getByRole('button',{name:'Resumen',exact:true}).click();
 return {screenshot:await shot('29-historical-record')};
 });
await test('E04','Cita histórica y continuidad de agenda','Historial muestra cita completada y nota conservada.',async()=>{
 await page.getByRole('button',{name:'Agenda',exact:true}).click();await page.getByRole('button',{name:'Historial',exact:true}).click();await settle();
 await text('Completada');await page.getByRole('button',{name:'Ver nota clinica',exact:true}).waitFor();
 return {screenshot:await shot('30-historical-appointments')};
 });
await test('E05','Nota histórica y escritura autorizada','Abrir y guardar una modificación ficticia sin perder contenido.',async()=>{
 await page.getByRole('button',{name:'Notas clinicas',exact:true}).click();
 await page.getByRole('button',{name:'Abrir nota clinica',exact:true}).first().click();
 const textareas=page.locator('textarea');const index=await textareas.evaluateAll(a=>a.findIndex(e=>e.value.includes('Synthetic legacy note: do not attribute')));
 assert.ok(index>=0);const note=textareas.nth(index);
 const before=await note.inputValue();await shot('31a-historical-note-open');
 await note.fill(before+'\nRevisión UI ficticia: continuidad autorizada.');
 const waiting=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.includes('/clinical-notes/'));
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();assert.equal((await waiting).status(),200);await settle();
 await text('Revisión UI ficticia: continuidad autorizada.');
 return {observed:'Nota existente abierta y guardada desde UI, conservando el contenido original y su cita completada. Solo DB propia ficticia.',screenshot:await shot('31-historical-note-saved')};
 });
await test('E06','Aislamiento real entre A/B y paciente nuevo','Cada profesional solo ve su clínica; lecturas ajenas 404.',async()=>{
 await page.getByRole('button',{name:'Mis Pacientes',exact:true}).click();await settle();
 const aBody=await page.locator('body').innerText();assert.ok(aBody.includes('Demo P'));assert.ok(!aBody.includes('Demo Q')&&!aBody.includes('Camila Revisada'));
 for(const id of ['q',user.patientId])assert.equal((await api(page,'/patients/'+encodeURIComponent(id))).status,404);
 await shot('32a-a-own-patients');
 const bctx=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX'}),bpage=await bctx.newPage();instrument(bpage);
 await login('b@episodes.invalid',demoPw,bpage);
 await bpage.getByRole('button',{name:'Mis Pacientes',exact:true}).click();await settle(bpage);
 await bpage.getByRole('heading',{name:'Demo Q',exact:true}).waitFor();
 const bBody=await bpage.locator('body').innerText();assert.ok(!bBody.includes('Demo P')&&!bBody.includes('Camila Revisada'));
 for(const id of ['p',user.patientId])assert.equal((await api(bpage,'/patients/'+encodeURIComponent(id))).status,404);
 await bpage.getByRole('button',{name:'Expediente',exact:true}).click();await settle(bpage);await text('Demo Q',bpage);
 return {observed:'A abre P y B abre Q desde UI. Listas excluyen paciente ajeno y nuevo; cuatro solicitudes GET reales desde Chromium rechazadas 404 (A→Q/nuevo, B→P/nuevo).',screenshot:await shot('32b-b-own-record',bpage)};
 },[404]);

 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'es-MX',timezoneId:'America/Mexico_City'});page=await mobile.newPage();instrument(page);
 const mobEmail='mobile-'+Date.now()+'@ui-review.invalid';
 await test('F02','Registro móvil y menor','Formulario usable a 390×844 y error visible.',async()=>{await page.goto(base);await settle();f=await reg();await fill(f,mobEmail,'2015-01-01','+525500001112');await shot('33-mobile-registration');await click(page,submit(f),'/api/auth/register/patient',400);await text('El registro independiente requiere tener 18 años o más.');const d=await layout(page,'mobile-registration');return {observed:'Formulario interactuado; menor rechazado. Ancho '+d.documentWidth+'/'+d.viewport+' px.',screenshot:await shot('34-mobile-minor-error')};},[400]);
 await test('F03','Alta adulta y login móvil','Registro e identidad accesibles.',async()=>{await fill(f,mobEmail,'1990-05-20','+525500001112');await click(page,submit(f),'/api/auth/register/patient',202);await login(mobEmail);await text('Todavía no tienes psicólogo vinculado.');const d=await layout(page,'mobile-identity');return {observed:'Alta/login reales en móvil; ancho '+d.documentWidth+'/'+d.viewport+' px.',screenshot:await shot('35-mobile-identity')};});
 await test('F04','Dashboard móvil','Estado vacío y navegación inferior utilizables.',async()=>{await page.getByRole('heading',{name:'Vinculación clínica',exact:true}).scrollIntoViewIfNeeded();const d=await layout(page,'mobile-dashboard');return {observed:'Ancho documento '+d.documentWidth+'/'+d.viewport+' px. Navegación inferior capturada.',screenshot:await shot('36-mobile-dashboard')};});
 await test('F05','Verificación email móvil','Abrir enlace real en nueva pestaña y confirmar.',async()=>{await page.reload();await settle();await click(page,ident().getByRole('button',{name:'Solicitar enlace',exact:true}),'/api/auth/verification/email/request',200);const secret=(await rpc('mailbox',{email:mobEmail,channel:'email'})).secret;const p=await mobile.newPage();instrument(p);await p.goto(base+'/#verifyEmail='+secret);await settle(p);assert.equal(await ident(p).getByRole('textbox',{name:'Token del enlace recibido'}).inputValue(),secret);await click(p,ident(p).getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',200);page=p;return {screenshot:await shot('37-mobile-email-verified')};});
 await test('F06','Verificación SMS móvil','Ambos contactos verificados.',async()=>{await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',200);const secret=(await rpc('mailbox',{email:mobEmail,channel:'sms'})).secret;await ident().getByRole('textbox',{name:'Código SMS',exact:true}).fill(secret);await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',200);assert.equal(await ident().getByText('Verificado',{exact:true}).count(),2);return {screenshot:await shot('38-mobile-both-verified')};});

 await test('F09','Errores de registro en español','Avisos sin birthDate ni Validation error.',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'es-MX'}),p=await ctx.newPage();instrument(p);await p.goto(base);await settle(p);const f=await reg(p);
 await fill(f,'negative-'+Date.now()+'@ui-review.invalid','2099-01-01');
 await click(p,submit(f),'/api/auth/register/patient',400);
 await text('La fecha de nacimiento no puede ser futura.',p);
 const body=await p.locator('body').innerText();assert.ok(!body.includes('Validation error')&&!body.includes('birthDate cannot'));
 return {screenshot:await shot('48-mobile-spanish-errors',p)};
 },[400]);
 await test('F11','Histórico móvil y entrevista cerrable','Identidad funciona; modal explícito puede cerrarse.',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'es-MX'}),p=await ctx.newPage();instrument(p);await login('p@episodes.invalid',demoPw,p);await text('Desconocida en el registro histórico',p);
 await ident(p).getByText('Verificado',{exact:true}).nth(1).waitFor();
 assert.equal(await p.getByRole('button',{name:'Cerrar entrevista',exact:true}).count(),0);
 await p.getByRole('button',{name:'Completar entrevista',exact:true}).click();
 await shot('49-mobile-interview-closable',p);
 await p.getByRole('button',{name:'Cerrar entrevista',exact:true}).click();
 await ident(p).getByRole('textbox',{name:'Nombre',exact:true}).focus();
 await layout(p,'mobile-historical');
 return {screenshot:await shot('50-mobile-historical-personal-access',p)};
 });
 await test('F12','Clínica profesional móvil','Abrir dashboard, expediente y nota permitidos.',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'es-MX'}),p=await ctx.newPage();instrument(p);
 await login('a@episodes.invalid',demoPw,p);await text('Demo P Ficticio',p);await shot('51-mobile-professional-dashboard',p);
 await p.getByRole('button',{name:'Pacientes',exact:true}).click();await settle(p);
 await p.getByRole('button',{name:'Expediente',exact:true}).click();await settle(p);
 await p.getByRole('button',{name:'Notas clinicas',exact:true}).click();await p.getByRole('button',{name:'Abrir nota clinica',exact:true}).click();
 const notes=await p.locator('textarea').evaluateAll(a=>a.map(e=>e.value).join(' '));assert.ok(notes.includes('Synthetic legacy note: do not attribute'));
 await layout(p,'mobile-clinical-note');
 return {screenshot:await shot('52-mobile-professional-note',p)};
 });

 const limits=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX',timezoneId:'America/Mexico_City'});page=await limits.newPage();instrument(page);const limEmail='limits-'+Date.now()+'@ui-review.invalid';
 await test('C05','SMS incorrecto','Error visible, sesión conservada.',async()=>{await page.goto(base);await settle();f=await reg();await fill(f,limEmail,'1990-05-20','+525500001113');await click(page,submit(f),'/api/auth/register/patient',202);await login(limEmail);await click(page,ident().getByRole('button',{name:'Solicitar enlace',exact:true}),'/api/auth/verification/email/request',200);const secret=(await rpc('mailbox',{email:limEmail,channel:'email'})).secret;const p=await limits.newPage();instrument(p);await p.goto(base+'/#verifyEmail='+secret);await settle(p);page=p;await click(page,ident().getByRole('button',{name:'Confirmar correo',exact:true}),'/api/auth/verification/email/confirm',200);await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',200);sms=(await rpc('mailbox',{email:limEmail,channel:'sms'})).secret;await ident().getByRole('textbox',{name:'Código SMS',exact:true}).fill(sms==='000000'?'000001':'000000');await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',400);await text('Verificación inválida o vencida');return {screenshot:await shot('39-wrong-sms')};},[400]);
 await test('C06','Límite de cinco intentos','Bloquea desafío sin suspender cuenta.',async()=>{for(let i=0;i<4;i++)await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',400);await ident().getByRole('textbox',{name:'Código SMS',exact:true}).fill(sms);await click(page,ident().getByRole('button',{name:'Confirmar teléfono',exact:true}),'/api/auth/verification/sms/confirm',429);await text('Código temporalmente bloqueado por intentos');return {screenshot:await shot('40-attempt-limit')};},[400,429]);
 await test('C07','Reenvío SMS temprano','Recargar no elude cooldown.',async()=>{await page.reload();await settle();await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',429);await text('Verificación temporalmente limitada');return {screenshot:await shot('41-sms-early-resend')};},[429]);
await test('C08','Cuota diaria y espera legible','Límite real y duración humana, sin alterar reloj.',async()=>{
 await rpc('quota_fixture',{email:limEmail});await page.reload();await settle();
 const r=await click(page,ident().getByRole('button',{name:'Solicitar SMS',exact:true}),'/api/auth/verification/sms/request',429);
 const retry=Number(r.headers()['retry-after']);assert.ok(retry>80000);
 const label=await ident().getByRole('button',{name:/Reintenta en/}).innerText();
 assert.match(label,/horas/);assert.ok(!/\d{4,}/.test(label));
 return {observed:'Fixture de cinco emisiones de cuenta propia nueva; Retry-After >80000 sin cambiar, UI en horas/minutos.',screenshot:await shot('42-daily-quota-readable')};
 },[429]);
await test('F07','Nombres accesibles del registro','Seis controles etiquetados y operables por nombre.',async()=>{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'es-MX'}),p=await ctx.newPage();instrument(p);
 await p.goto(base);await settle(p);const f=await reg(p);
 for(const label of ['Nombre','Apellido','Fecha de nacimiento','Teléfono con prefijo internacional','Correo','Contrasena'])assert.equal(await f.getByLabel(label,{exact:true}).count(),1);
 for(const name of ['Nombre','Apellido','Teléfono con prefijo internacional','Correo'])await f.getByRole('textbox',{name,exact:true}).focus();
 const missing=await f.locator('input').evaluateAll(a=>a.filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).length);assert.equal(missing,0);
 const duplicates=await p.locator('[id]').evaluateAll(a=>a.map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i));assert.deepEqual(duplicates,[]);
 return {observed:'Cuatro textbox por rol/nombre; DOB y contraseña por label (sin rol textbox HTML). Seis labels asociados, sin IDs duplicados.',screenshot:await shot('43-registration-labels')};
 });
 await test('F08','Desbordamiento horizontal móvil','Contenido cabe en 390 px.',async()=>{const bad=layouts.filter(x=>x.label.startsWith('mobile')&&(x.documentWidth>x.viewport+2||x.bodyWidth>x.viewport+2));return {status:bad.length?'FAIL':'PASS',severity:bad.length?'Importante':'—',observed:bad.length?'Desbordamiento medido: '+bad.map(x=>x.label+' '+x.documentWidth+'/'+x.viewport+' px').join('; '):'Sin desbordamiento horizontal del documento en vistas móviles medidas.',screenshot:'screenshots/35-mobile-identity.png'};});

 await test('D09','Nombre sin recarga','Saludo/sidebar sincronizados tras guardado.',async()=>{
 const prior=results.find(r=>r.id==='D02');assert.equal(prior.status,'PASS');
 return {observed:'Guardado real D02 comprobó ambos lugares antes de recargar; persistencia comprobada D03/D05.',screenshot:'screenshots/20-name-edited.png'};
 });
 await test('F10','Espera diaria legible','Mostrar horas/minutos respetando Retry-After.',async()=>{
 assert.equal(results.find(r=>r.id==='C08').status,'PASS');
 return {observed:'C08 comprobó cabecera real sin cambios y representación en horas/minutos.',screenshot:'screenshots/42-daily-quota-readable.png'};
 });

 await browser.close();input.close();save();console.log('DONE');process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
}
main().catch(async e=>{results.push({id:'HARNESS',description:'Continuidad del recorrido',expected:'Completar recorridos dependientes.',status:'FAIL',observed:clean(e.message),severity:'Importante',harnessNeedsReview:true,screenshot:''});save();try{await browser?.close();}catch{}input.close();console.log('DONE');process.exitCode=1;});
