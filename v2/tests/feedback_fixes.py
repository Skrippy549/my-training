"""Feedback regression: exercise seeding, one-off editor, completed-session correction, mobile overflow. UI crypto mocked only."""
import asyncio, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent

def shell():
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
    html=re.sub(r'<script type="module"[^>]*></script>','',html)
    html=html.replace('</head>',f'<style>{(ROOT/"style.css").read_text()}</style></head>')
    core=re.sub(r'(?m)^export\s+','',(ROOT/'js/core.mjs').read_text())
    app=re.sub(r"^import\s+.*?from\s+'./core.mjs';\s*",'',(ROOT/'js/app.mjs').read_text())
    return html,core+'\n'+app

async def no_overflow(page,label):
    dims=await page.evaluate('''() => {
      const d=document.documentElement,body=document.body,dlg=document.querySelector('#dialog');
      const fields=[...document.querySelectorAll('input[type="date"], input[type="datetime-local"]')].filter(e=>e.getClientRects().length).map(e=>({name:e.name,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,w:e.offsetWidth}));
      return {innerWidth,scrollWidth:d.scrollWidth,bodyWidth:body.scrollWidth,dialogScrollWidth:dlg?.open?dlg.scrollWidth:0,dialogClientWidth:dlg?.open?dlg.clientWidth:0,fields}; }''')
    assert dims['scrollWidth']<=dims['innerWidth']+1,(label,dims)
    if dims['dialogClientWidth']:
      assert dims['dialogScrollWidth']<=dims['dialogClientWidth']+1,(label,dims)
      for f in dims['fields']:
        assert f['left']>=-1 and f['right']<=dims['innerWidth']+1,(label,dims)
    return dims

async def new_browser(pw,width):
    b=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
    page=await b.new_page(viewport={'width':width,'height':800},device_scale_factor=2,is_mobile=True,has_touch=True)
    html,bundle=shell()
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.set_content(html,wait_until='domcontentloaded')
    await page.evaluate('''() => {const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});const c=window.crypto;Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>`test-${Math.random()}`,getRandomValues:a=>c.getRandomValues(a),subtle:{importKey:async(_,data)=>({data}),deriveKey:async(_,key)=>key,encrypt:async(_,key,data)=>data,decrypt:async(_,key,data)=>data}}})}''')
    await page.add_script_tag(content=bundle)
    await page.locator('#auth-pass').fill('test-pass-1234567');await page.locator('#auth-confirm').fill('test-pass-1234567');await page.locator('#auth-submit').click()
    await page.locator('#app').wait_for(state='visible')
    assert not errors,errors
    return b,page,errors

async def checks():
  async with async_playwright() as pw:
   for width in (320,375,393,430):
    browser,page,errors=await new_browser(pw,width)
    count=await page.evaluate('() => dbStore.data.exercises.length')
    assert count>=30,(width,count)
    categories=await page.evaluate('() => [...new Set(dbStore.data.exercises.map(x=>x.category))]')
    assert len(categories)>=7,(width,categories)
    await no_overflow(page,'Today '+str(width))
    buttons=await page.locator('.today-actions button').evaluate_all('els=>els.map(e=>({top:e.getBoundingClientRect().top,h:e.getBoundingClientRect().height}))')
    assert abs(buttons[0]['top']-buttons[1]['top'])<1 and abs(buttons[0]['h']-buttons[1]['h'])<1,(width,buttons)
    await page.locator('.today-actions [data-action="add-oneoff"]').click()
    await no_overflow(page,'One-off date '+str(width))
    await page.locator('[data-action="add-oneoff-row"]').click()
    await page.locator('[data-action="add-oneoff-row"]').click()
    assert await page.locator('.oneoff-row').count()==2
    await no_overflow(page,'One-off rows '+str(width))
    rows=page.locator('.oneoff-row')
    await rows.nth(0).locator('[name="exercise"]').select_option('starter:leg-press')
    await rows.nth(0).locator('[name="sets"]').fill('2')
    await rows.nth(0).locator('[name="reps"]').fill('12')
    await rows.nth(0).locator('[name="weight"]').fill('50')
    await rows.nth(1).locator('[name="exercise"]').select_option('starter:lat-pulldown')
    await rows.nth(1).locator('[name="sets"]').fill('1')
    await page.locator('#modal-form [name="name"]').fill('Разовая силовая проверка')
    await page.locator('#modal-form [type="submit"]').click()
    await page.locator('#dialog').wait_for(state='hidden')
    assert await page.locator('[data-action="start-workout"]').count()==1,(width,'not opened after create',errors)
    sess_id=await page.evaluate('() => s.sessionId')
    ex_count=await page.evaluate('id => dbStore.data.overrides[id].exercises.length',sess_id)
    assert ex_count==2,(width,ex_count)
    # Start with explicitly chosen sliders, mark a set and finish.
    await page.locator('[data-action="start-workout"]').click()
    for r in await page.locator('#dialog input[data-rating]').all():
       await r.evaluate("el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))}")
    await page.locator('#modal-form [type="submit"]').click()
    await page.locator('#dialog').wait_for(state='hidden')
    assert await page.locator('input[data-action="toggle-set"]').count()==3
    await page.locator('input[data-action="toggle-set"]').first.check()
    await page.locator('[data-action="finish-workout"]').click()
    for r in await page.locator('#dialog input[data-rating]').all():
       await r.evaluate("el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}))}")
    await page.locator('#modal-form [name="status"]').select_option('completed')
    await page.locator('#modal-form [type="submit"]').click()
    await page.locator('#tabs [data-tab="today"]').wait_for()
    assert await page.evaluate('id=>dbStore.data.sessions[id]?.status',sess_id)=='completed'
    await page.locator(f'[data-action="edit-day"][data-id="{sess_id}"]').click()
    assert await page.get_by_text('Исправление результатов').count()==1
    assert await page.locator('input[data-action="toggle-set"]:not([disabled])').count()==3
    await page.locator('input[data-action="toggle-set"]').nth(1).check()
    await page.locator('[data-action="add-session-exercise"]').click()
    await page.locator('#modal-form [name="exercise"]').select_option('starter:chest-press')
    await page.locator('#modal-form [type="submit"]').click()
    await page.locator('#dialog').wait_for(state='hidden')
    assert await page.evaluate('id=>dbStore.data.sessions[id].exercisePlans.length',sess_id)==3
    assert await page.evaluate('id=>dbStore.data.sessions[id].status',sess_id)=='completed'
    await page.locator('[data-action="save-correction"]').click()
    assert await page.locator('input[data-action="toggle-set"]:not([disabled])').count()==0
    await page.locator('[data-action="session-exit"]').first.click()
    await page.locator('#tabs [data-tab="progress"]').click()
    await no_overflow(page,'Progress '+str(width))
    gaps=await page.evaluate("""() => {const a=document.querySelector('.progress-actions'),card=a?.nextElementSibling;return card?.getBoundingClientRect().top-a?.getBoundingClientRect().bottom;}""")
    assert gaps>=10,(width,gaps)
    await page.locator('[data-action="add-weight"]').click()
    await no_overflow(page,'Weight date '+str(width))
    await page.locator('#dialog-close').click()
    await page.locator('#tabs [data-tab="programs"]').click()
    await page.locator('[data-action="new-program"]').click()
    await no_overflow(page,'Program date '+str(width))
    await page.locator('#dialog-close').click()
    assert not errors,(width,errors)
    print('PASS feedback width',width, 'seed',count,'gap',gaps)
    await browser.close()
if __name__=='__main__':asyncio.run(checks())