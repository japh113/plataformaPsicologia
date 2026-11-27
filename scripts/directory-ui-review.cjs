const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const base=process.env.REVIEW_BASE;
const password='Episode-Demo-Only-284!';
const survey={results:[],events:[],screenshots:[]};
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const heading=(page,name)=>page.getByRole('heading',{name,exact:true});
const preview=page=>page.getByRole('region',{name:'Vista previa del perfil público'});
const directory=page=>page.goto(base+'/directorio');
const viewports={desktop:{width:1440,height:960},mobile:{width:390,height:844}};
let active='SETUP',browser,visitors,owners,reviewer;

async function pageFor(viewport) {
  const mobile=viewport.width<768;
  const page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile,locale:'es-MX',timezoneId:'America/Chihuahua'});
  page.on('pageerror',()=>survey.events.push({scenario:active,kind:'pageerror',expected:false}));
  page.on('response',res=>{
    const status=res.status(), path=new URL(res.url()).pathname;
    if(status>=400)survey.events.push({scenario:active,kind:'http',status,expected:
      (active==='D305' && status===404 && path.startsWith('/api/directory/')) ||
      (active==='D302' && status===503 && path==='/api/directory'),
    });
  });
  return page;
}

async function shot(page,file) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow');
  const path='screenshots/'+file+'.png';
  await page.screenshot({path:'/evidence/'+path,fullPage:true,animations:'disabled',
    mask:[page.locator('input[type=password],input[type=email]'),page.getByText(/@(?:directory|accreditation)\.invalid|Password demo:/)],
    maskColor:'#475569'});
  survey.screenshots.push({file:path,scenario:active,secretsMasked:true});
}

async function scenario(id,action) {
  active=id;
  try {await action();survey.results.push({id,status:'PASS'});console.log(id+' PASS');}
  catch(error) {
    survey.results.push({id,status:'FAIL',failureCategory:error.name==='TimeoutError'?'timeout':'assertion'});
    fs.writeFileSync('/control/browser-failure.txt',error.stack);
    throw error;
  } finally {fs.writeFileSync('/control/results.json',JSON.stringify(survey));}
}

async function login(page,email) {
  await page.goto(base);
  await button(page,'Iniciar sesion').click();
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  const response=page.waitForResponse(res=>new URL(res.url()).pathname==='/api/auth/login');
  await button(page,'Entrar').click();
  assert.equal((await response).status(),200);
}

async function ownerProfile(page) {
  const name=page.viewportSize().width<768?'Perfil profesional':'Mi perfil profesional';
  await button(page,name).click();
  await heading(page,'Visibilidad y recepción').waitFor();
}

async function photoFile(page,color='#3730a3') {
  const encoded=await page.evaluate(background=>{
    const canvas=document.createElement('canvas');
    canvas.width=128;canvas.height=128;
    const context=canvas.getContext('2d');
    context.fillStyle=background;context.fillRect(0,0,128,128);
    context.fillStyle='#e0e7ff';context.textAlign='center';context.textBaseline='middle';
    context.font='bold 44px sans-serif';context.fillText('CM',64,64);
    return canvas.toDataURL('image/png').split(',')[1];
  },color);
  return {name:'retrato-de-ensayo.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')};
}

(async()=>{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--host-resolver-rules=MAP frontend.localhost '+process.env.REVIEW_FRONTEND_IP]});
  fs.writeFileSync('/control/runtime.json',JSON.stringify({
    playwright:require('playwright/package.json').version,chromium:browser.version(),
    node:process.version,revision:process.env.REVIEW_REVISION,headless:true,
  }));
  visitors={desktop:await pageFor(viewports.desktop),mobile:await pageFor(viewports.mobile)};
  owners={desktop:await pageFor(viewports.desktop),mobile:await pageFor(viewports.mobile)};
  reviewer=await pageFor(viewports.desktop);
  const desktop=visitors.desktop;
  let publishedHref,photoSrc;

  await scenario('D301',async()=>{
    for(const [size,page] of Object.entries(visitors)){
      await page.goto(base);
      await page.getByRole('link',{name:'Explorar el directorio profesional'}).click();
      await heading(page,'Directorio profesional').waitFor();
      await heading(page,'Elena Robles').waitFor();
      for(const name of ['Bruno Salgado','Nadia Ríos']) await heading(page,name).waitFor();
      const elena=page.getByRole('article').filter({has:heading(page,'Elena Robles')});
      await elena.getByRole('heading',{name:'Enfoques declarados',exact:true}).waitFor();
      await elena.getByText('Cognitivo-conductual',{exact:true}).waitFor();
      assert.equal(await page.getByRole('article').filter({has:heading(page,'Bruno Salgado')}).getByText('Enfoques declarados',{exact:true}).count(),0);
      for(const name of ['Clara Montes','Diana Álamo','Emilio Valle','Nadia Propuesta']) assert.equal(await heading(page,name).count(),0);
      assert.equal(await page.evaluate(()=>localStorage.getItem('psicopanel_auth_token')),null);
      assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow');
      await shot(page,'directory-'+size);
    }
  });
  await scenario('D302',async()=>{
    for(const [size,page] of Object.entries(visitors)){
      await page.getByLabel('Estado',{exact:true}).selectOption('Jalisco');
      await page.getByLabel('Ciudad',{exact:true}).selectOption('Guadalajara');
      await page.getByLabel('Modalidad',{exact:true}).selectOption('online');
      await page.getByLabel('Recepción',{exact:true}).selectOption('false');
      await page.getByLabel('Nombre profesional',{exact:true}).fill('Bruno');
      await button(page,'Buscar').click();
      await page.getByText('1 perfil en esta página',{exact:true}).waitFor();
      await heading(page,'Bruno Salgado').waitFor();
      assert.equal(await heading(page,'Elena Robles').count(),0);
      await shot(page,'filters-'+size);
      await page.getByLabel('Nombre profesional',{exact:true}).fill('Sin coincidencia');
      await button(page,'Buscar').click();
      await page.getByText('No encontramos perfiles con esos filtros.').waitFor();
      await button(page,'Restablecer búsqueda').click();
      await heading(page,'Elena Robles').waitFor();
    }
    const API=await desktop.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/api/directory?')));
    assert.ok(API);
    await desktop.route('**/api/directory?*',route=>route.fulfill({status:503,body:'test'}),{times:1});
    await button(desktop,'Buscar').click();
    await desktop.getByRole('alert').filter({hasText:'No pudimos consultar el directorio.'}).waitFor();
    await button(desktop,'Reintentar').click();
    await heading(desktop,'Elena Robles').waitFor();
  });
  await scenario('D303',async()=>{
    for(const [size,page] of Object.entries(visitors)){
      await page.getByRole('link',{name:'Ver perfil de Nadia Ríos'}).click();
      await heading(page,'Nadia Ríos').waitFor();
      await heading(page,'Formación y acreditación').waitFor();
      await heading(page,'Enfoques declarados').waitFor();
      await page.getByText('Sistémico',{exact:true}).waitFor();
      await page.getByText('Sin recepción de nuevos pacientes',{exact:true}).waitFor();
      assert.equal(await page.getByText('Institución candidata reservada',{exact:false}).count(),0);
      assert.equal(await page.getByRole('button',{name:/Solicitar|Reservar|Contactar/}).count(),0);
      await shot(page,'public-profile-'+size);
      await page.getByRole('link',{name:'Volver al directorio'}).click();
      await heading(page,'Directorio profesional').waitFor();
    }
  });
  await scenario('D304',async()=>{
    for(const [size,page] of Object.entries(owners)){
      await login(page,'clara@directory.invalid');
      await ownerProfile(page);
      await page.getByText('Perfil privado',{exact:true}).waitFor();
      await shot(page,'private-profile-'+size);
      await button(page,'Editar información').click();
      await page.getByLabel('Descripción privada',{exact:true}).waitFor();
      await shot(page,'profile-edit-'+size);
      await button(page,'Cancelar').click();
      await page.getByRole('region',{name:'Visibilidad y recepción'}).scrollIntoViewIfNeeded();
      await shot(page,'publication-settings-'+size);
      const open=button(page,'Ver vista previa');
      await open.focus();
      await page.keyboard.press('Enter');
      await heading(page,'Vista previa del perfil público').waitFor();
      await page.waitForFunction(()=>document.activeElement?.id==='preview-heading');
      await preview(page).getByRole('heading',{name:'Clara Montes',exact:true}).waitFor();
      assert.equal(await preview(page).getByText('Contacto privado ficticio.',{exact:false}).count(),0);
      await shot(page,'preview-'+size);
      if(size==='mobile'){
        await button(page,'Publicar perfil').scrollIntoViewIfNeeded();
        await shot(page,'preview-publication-mobile');
      }
    }
  });
  await scenario('D305',async()=>{
    const owner=owners.desktop;
    await owner.getByText('Gestionar fotografía',{exact:true}).click();
    await owner.getByLabel('Seleccionar fotografía',{exact:true}).setInputFiles(await photoFile(owner));
    await button(owner,'Guardar fotografía').click();
    await owner.getByRole('status').filter({hasText:'Fotografía guardada en privado.'}).waitFor();
    await preview(owner).locator('img').waitFor();
    await button(owner,'Publicar perfil').click();
    await owner.getByRole('dialog',{name:'Publicar tu perfil'}).waitFor();
    await shot(owner,'confirm-publication-desktop');
    await button(owner,'Confirmar publicación').click();
    await owner.getByRole('status').filter({hasText:'Perfil publicado en el directorio.'}).waitFor();
    publishedHref=await owner.getByRole('link',{name:'Ver perfil publicado'}).getAttribute('href');
    for(const page of Object.values(visitors)){
      await page.goto(base+publishedHref);
      await heading(page,'Clara Montes').waitFor();
      await page.getByText('Sin recepción de nuevos pacientes',{exact:true}).waitFor();
      const photo=page.locator('article img');
      await photo.waitFor();
      photoSrc=await photo.getAttribute('src');
      assert.match(photoSrc,/\/photo\//);
      await photo.evaluate(image=>image.decode());
    }
    await button(owner,'Activar recepción').click();
    await owner.getByRole('status').filter({hasText:'Recepción activada.'}).waitFor();
    await desktop.reload();
    await desktop.getByText('Recibe nuevos pacientes',{exact:true}).waitFor();

    const previousPhoto=photoSrc;
    await owner.getByText('Gestionar fotografía',{exact:true}).click();
    await owner.getByLabel('Seleccionar fotografía',{exact:true}).setInputFiles(await photoFile(owner,'#065f46'));
    await owner.getByRole('img',{name:'Vista previa de la fotografía seleccionada'}).waitFor();
    await shot(owner,'replace-public-photo-desktop');
    await button(owner,'Guardar foto pública').click();
    await owner.getByRole('status').filter({hasText:'Fotografía pública actualizada.'}).waitFor();
    await owner.getByText('Perfil público',{exact:true}).waitFor();
    for(const [size,page] of Object.entries(visitors)){
      await directory(page);
      const clara=page.getByRole('article').filter({has:heading(page,'Clara Montes')});
      await clara.getByText('Humanista',{exact:true}).waitFor();
      await clara.getByText('Recibe nuevos pacientes',{exact:true}).waitFor();
      const photo=clara.locator('img');
      await photo.evaluate(image=>image.decode());
      photoSrc=await photo.getAttribute('src');
      assert.notEqual(photoSrc,previousPhoto);
      assert.equal(await page.evaluate(async url=>(await fetch(url,{cache:'no-store'})).status,previousPhoto),404);
      await shot(page,'directory-updated-photo-'+size);
      await page.getByRole('link',{name:'Ver perfil de Clara Montes'}).click();
      await heading(page,'Clara Montes').waitFor();
      assert.equal(await page.locator('article img').getAttribute('src'),photoSrc);
    }

    await button(owner,'Retirar del directorio').click();
    await owner.getByRole('dialog',{name:'Retirar tu perfil público'}).waitFor();
    await button(owner,'Confirmar retiro').click();
    await owner.getByRole('status').filter({hasText:'Perfil retirado del directorio.'}).waitFor();
    await button(owner,'Desactivar recepción').waitFor();
    for(const [size,page] of Object.entries(visitors)){
      await page.reload();
      await heading(page,'Este perfil no está disponible.').waitFor();
      assert.equal(await page.evaluate(async url=>(await fetch(url,{cache:'no-store'})).status,photoSrc),404);
      await shot(page,'withdrawal-'+size);
    }
  });
  await scenario('D306',async()=>{
    await login(reviewer,'reviewer@accreditation.invalid');
    await button(reviewer,'Credenciales profesionales').click();
    await reviewer.getByRole('button',{name:/Revisar Nadia Propuesta, versión/}).click();
    await reviewer.getByText('Institución candidata reservada',{exact:true}).waitFor();
    await shot(reviewer,'reviewer-desktop');
    await directory(desktop);
    await heading(desktop,'Nadia Ríos').waitFor();
    assert.equal(await heading(desktop,'Nadia Propuesta').count(),0);
  });
})().catch(()=>{process.exitCode=1;}).finally(async()=>{await browser?.close();});
