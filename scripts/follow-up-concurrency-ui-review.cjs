const { chromium } = require('/review/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const gate = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return { promise,resolve }; };
async function main() {
  const browser = await chromium.launch({ headless:true,args:['--host-resolver-rules=MAP frontend.localhost '+process.env.FRONTEND_IP] });
  const results=[],errors=[];
  try {
    const context=await browser.newContext({ viewport:{width:1440,height:1000},locale:'es-MX' });
    let followMode='500',readHold=null,patchHold=null;
    const interviews=new Map();
    const counts={p:0,q:0};
    await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
      const req=route.request(),url=new URL(req.url()),path=url.pathname;
      const target='http://api:5000'+path+url.search;
      if (path.endsWith('/follow-up')) {
        if (followMode!=='pass' && !readHold) return route.fulfill({
          status:Number(followMode),contentType:'application/json',
          body:JSON.stringify({success:false,message:'Fictional controlled follow-up failure'}),
        });
        if (readHold) {
          const control=readHold;readHold=null;
          const response=await route.fetch({url:target});
          assert.equal(response.status(),200);control.confirmed.resolve();
          await control.release.promise;await route.fulfill({response});control.delivered.resolve();return;
        }
      }
      if (path.includes('/tasks/') && req.method()==='PATCH' && patchHold) {
        const control=patchHold;patchHold=null;
        const response=await route.fetch({url:target});
        assert.equal(response.status(),200);control.confirmed.resolve();
        await control.release.promise;await route.fulfill({response});control.delivered.resolve();return;
      }
      const match=path.match(/^\/api\/patients\/(p|q)\/interview$/);
      if (match && req.method()==='PUT') {
        const id=match[1];counts[id]++;
        const control=interviews.get(id);
        if (control) {
          const response=await route.fetch({url:target});
          assert.equal(response.status(),200);control.confirmed.resolve();
          await control.release.promise;await route.fulfill({response});control.delivered.resolve();return;
        }
      }
      return route.continue({url:target});
    });
    const page=await context.newPage();
    await page.addInitScript(() => {
      const fetchOriginal = window.fetch;
      window.fetch = async (...args) => {
        const response = await fetchOriginal(...args);
        if (String(args[0]).endsWith('/patients/p/interview') && args[1]?.method === 'PUT') {
          const read = response.json.bind(response);
          response.json = async () => {
            const body = await read();
            // Next task after JSON consumption: all App promise continuations drain first.
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              window.__pInterviewConsumed = true;
              channel.port1.close(); channel.port2.close();
            };
            channel.port2.postMessage(null);
            return body;
          };
        }
        return response;
      };
    });
    page.on('pageerror',error=>errors.push(error.message));
    async function login(id,navigate=true) {
      if(navigate) await page.goto('http://frontend.localhost:5173');
      await page.getByRole('button',{name:'Iniciar sesion',exact:true}).click();
      const form=page.locator('form').filter({has:page.getByRole('button',{name:'Entrar',exact:true})});
      await form.locator('[name=email]').fill(id+'@episodes.invalid');
      await form.locator('[name=password]').fill('Episode-Demo-Only-284!');
      await form.getByRole('button',{name:'Entrar',exact:true}).click();
      await page.getByRole('button',{name:'Cerrar sesion',exact:true}).waitFor();
      await page.getByRole('button',{name:'Ver detalle',exact:true}).waitFor();
    }
    async function detail() {
      await page.getByRole('button',{name:'Ver detalle',exact:true}).click();
      await page.getByRole('button',{name:'Mi seguimiento',exact:true}).click();
    }
    const section=()=>page.getByRole('region',{name:'Mi seguimiento',exact:true});
    const control=()=>({confirmed:gate(),release:gate(),delivered:gate()});
    const taskName='Fictional April 1 task A';
    const input=()=>section().getByRole('checkbox',{name:taskName,exact:true});
    const retry=()=>section().getByRole('button',{name:'Reintentar seguimiento',exact:true});
    async function shot(name) {
      if(await section().count()) await section().evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:'/work/'+name+'.png',fullPage:true,animations:'disabled',
        mask:[page.locator('input[name=email]'),page.locator('input[name=password]'),page.getByText(/@|Password demo:/)],maskColor:'#475569'});
    }
    await login('p');await detail();await section().getByRole('alert').waitFor();
    readHold=control();const first=readHold;followMode='pass';
    await retry().click();await first.confirmed.promise;
    const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname.includes('/tasks/'));
    await input().click();assert.equal((await patched).status(),200);
    await page.waitForFunction(()=>document.querySelector('input[aria-label="Fictional April 1 task A"]')?.checked);
    first.release.resolve();await first.delivered.promise;
    await section().getByRole('alert').waitFor();
    assert.equal(await input().isChecked(),true);
    await shot('A1-old-get-after-patch');
    results.push('A1: retained GET snapshot -> real PATCH 200 -> old GET delivered; completion preserved: PASS');

    patchHold=control();const second=patchHold;
    await input().click();await second.confirmed.promise;
    const professional=await context.request.post('http://api:5000/api/auth/login',{data:{
      email:'a@episodes.invalid',password:'Episode-Demo-Only-284!',
    }});
    assert.equal(professional.status(),200);
    const credentials=(await professional.json()).data;
    const token=credentials.token;
    assert.ok(token);
    const auth={Authorization:'Bearer '+token};
    const file=await context.request.get('http://api:5000/api/patients/p',{headers:auth});
    assert.equal(file.status(),200);
    const note=(await file.json()).data.clinicalNotes[0].id;
    const created=await context.request.post('http://api:5000/api/patients/p/tasks',{headers:auth,
      data:{text:'Fictional concurrency new task',clinicalNoteId:note}});
    assert.equal(created.status(),201);
    await retry().click();
    await section().getByRole('checkbox',{name:'Fictional concurrency new task',exact:true}).waitFor();
    second.release.resolve();await second.delivered.promise;
    await page.waitForFunction(()=>!document.querySelector('input[aria-label="Fictional April 1 task A"]')?.disabled);
    assert.equal(await input().isChecked(),false);
    assert.equal(await section().getByRole('checkbox',{name:'Fictional concurrency new task',exact:true}).count(),1);
    assert.equal(await section().locator('article').count(),3);
    assert.equal(await section().getByRole('alert').count(),0);
    await shot('A2-get-new-task-before-patch-response');
    results.push('A2: retained PATCH -> backend creates task -> fresh GET ready -> PATCH delivered; new task/group retained: PASS');

    async function openInterview(marker) {
      await page.getByRole('button',{name:'Entrevista',exact:true}).click();
      await page.getByRole('button',{name:'Completar entrevista',exact:true}).first().click();
      const modal=page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Entrevista inicial',exact:true})});
      await modal.locator('input[type=date]').fill('1990-01-01');
      for(const field of await modal.locator('input[type=text],textarea').all()) await field.fill(marker);
      return modal;
    }
    const pControl=control();interviews.set('p',pControl);
    let modal=await openInterview('Fictional P answer');
    await modal.getByRole('button',{name:'Guardar entrevista',exact:true}).click();
    await pControl.confirmed.promise;
    await modal.getByRole('button',{name:'Cerrar entrevista',exact:true}).click();
    await page.getByRole('button',{name:'Cerrar sesion',exact:true}).click();
    await login('q',false);await detail();
    const qControl=control();interviews.set('q',qControl);
    modal=await openInterview('Fictional Q answer');
    await modal.getByRole('button',{name:'Guardar entrevista',exact:true}).click();
    await qControl.confirmed.promise;
    const oldResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/patients/p/interview');
    pControl.release.resolve();await pControl.delivered.promise;await oldResponse;
    // Observe the actual old callback completing before asserting the new modal.
    await page.waitForFunction(()=>window.__pInterviewConsumed === true);
    assert.equal(await modal.isVisible(),true);
    assert.equal(await modal.getByRole('button',{name:'Guardando...',exact:true}).isDisabled(),true);
    assert.equal(await modal.locator('input[type=text]').first().inputValue(),'Fictional Q answer');
    assert.equal(await page.getByText('Entrevista guardada correctamente.',{exact:true}).count(),0);
    assert.deepEqual(counts,{p:1,q:1});
    await shot('C-Q-modal-after-P-confirmed');
    followMode='500';qControl.release.resolve();await qControl.delivered.promise;
    await modal.waitFor({state:'hidden'});
    await page.getByText('Entrevista guardada correctamente.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Mi seguimiento',exact:true}).click();
    await section().getByRole('alert').waitFor();
    assert.deepEqual(counts,{p:1,q:1});
    results.push('C: PUT P retained -> logout -> Q modal/PUT pending -> P confirmed; Q modal/form/saving intact, one PUT each; Q success + optional 500 closes Q only: PASS');

    followMode='403';await retry().click();
    await page.getByText('Ya no tienes acceso a este expediente. Vuelve a comprobar tu sesión.',{exact:true}).waitFor();
    followMode='500';await page.getByRole('button',{name:'Reintentar',exact:true}).click();
    await page.getByText('No se pudo comprobar el acceso. El expediente sigue bloqueado; puedes reintentar.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Cerrar sesion',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Mi seguimiento',exact:true}).count(),0);
    followMode='pass';await page.getByRole('button',{name:'Reintentar',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalle',exact:true}).waitFor();
    await detail();await section().locator('article').nth(1).waitFor();
    assert.equal(await section().getByRole('alert').count(),0);
    results.push('B: 403 keeps session; explicit recheck with 500 remains denied; only explicit successful probe restores authorized Q: PASS');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('/work/concurrency-browser-result.json',JSON.stringify({results,errors,counts,runtime:{
      node:process.version,playwright:require('/review/node_modules/playwright/package.json').version,chromium:browser.version(),
    }},null,2));
    console.log(JSON.stringify({results,errors,counts}));
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
