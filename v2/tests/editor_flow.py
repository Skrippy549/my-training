"""Editor flow UI with mocked crypto only (see README)."""
import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def test():
 html=(ROOT/'index.html').read_text();html=re.sub(r'<link rel="stylesheet"[^>]*>','',html);html=re.sub(r'<script type="module"[^>]*></script>','',html);html=html.replace('</head>',f'<style>{(ROOT/"style.css").read_text()}</style></head>')
 core=re.sub(r'(?m)^export\s+','',(ROOT/'js/core.mjs').read_text());app=re.sub(r"^import\s+.*?from\s+'./core.mjs';\s*",'',(ROOT/'js/app.mjs').read_text());bundle=core+'\n'+app
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=await browser.new_page(viewport={'width':393,'height':852});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html);await page.evaluate('''() => {const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});const c=window.crypto;Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>`test-${Math.random()}`,getRandomValues:a=>c.getRandomValues(a),subtle:{importKey:async(_,data)=>({data}),deriveKey:async(_,key)=>key,encrypt:async(_,key,data)=>data,decrypt:async(_,key,data)=>data}}})}''')
  await page.add_script_tag(content=bundle)
  await page.locator('#auth-pass').fill('long-private-test-pass');await page.locator('#auth-confirm').fill('long-private-test-pass');await page.locator('#auth-submit').click();await page.locator('#app').wait_for(state='visible')
  today=await page.evaluate('() => dateISO()');weekday=await page.evaluate('() => dayOfWeek(dateISO())')
  # Create reusable exercise bank item.
  await page.locator('[data-tab="programs"]').click();await page.locator('[data-action="programs-mode"][data-value="bank"]').click()
  await page.locator('[data-action="new-exercise"]').click()
  await page.locator('#modal-form [name="name"]').fill('Жим тестовый')
  await page.locator('#modal-form [type="submit"]').click()
  assert await page.get_by_text('Жим тестовый').count()>0
  await page.locator('[data-action="programs-mode"][data-value="active"]').click()
  await page.locator('[data-action="new-program"]').click()
  await page.locator('#modal-form [name="name"]').fill('Конечная программа')
  await page.locator('#modal-form [name="mode"]').select_option('finite');await page.locator('#modal-form [name="weeks"]').fill('3')
  await page.locator('#modal-form [type="submit"]').click()
  await page.locator(f'[data-action="choose-weekday"][data-value="{weekday}"]').click()
  await page.locator('[data-action="add-template"]').click();await page.locator('#modal-form [name="name"]').fill('Сила А');await page.locator('#modal-form [type="submit"]').click()
  await page.locator('[data-action="add-exercise-to-workout"]').click();await page.locator('#modal-form [name="sets"]').fill('3');await page.locator('#modal-form [type="submit"]').click()
  await page.locator('[data-action="save-program-day"]').click();await page.locator('#modal-form [name="scope"]').select_option('future');await page.locator('#modal-form [type="submit"]').click();await page.locator('#dialog').wait_for(state='hidden')
  # Current week now has a saved training and the other 2 weeks too.
  assert await page.evaluate('() => workoutsForDate(dbStore.data,dateISO()).some(w=>w.name==="Сила А")')
  await page.locator('[data-action="choose-week"][data-value="1"]').click()
  await page.locator('[data-action="edit-template"]').click();await page.locator('#modal-form [name="name"]').fill('Сила Б');await page.locator('#modal-form [type="submit"]').click()
  await page.locator('[data-action="save-program-day"]').click();await page.locator('#modal-form [name="scope"]').select_option('selected')
  await page.locator('#modal-form input[name="week"]').first.uncheck()
  await page.locator('#modal-form input[name="week"]').nth(1).check()
  await page.locator('#modal-form [type="submit"]').click();await page.locator('#dialog').wait_for(state='hidden')
  names=await page.evaluate('''() => {const p=dbStore.data.programs[0];const d=dateISO();const w1=addDays(d,7),w2=addDays(d,14);return [d,w1,w2].map(x=>workoutsForDate(dbStore.data,x).find(x=>x.programId===p.id)?.name)}''')
  assert names==['Сила А','Сила Б','Сила А'],names
  # One-off with bank exercise and single-day override.
  await page.locator('[data-action="back-programs"]').click();await page.locator('[data-tab="calendar"]').click()
  await page.locator('[data-action="add-oneoff"]').click();await page.locator('#modal-form [name="name"]').fill('Разовая силовая');await page.locator('#modal-form [name="type"]').select_option('strength');await page.locator('#modal-form [type="submit"]').click()
  await page.get_by_text('Разовая силовая').first.wait_for();id=await page.evaluate('() => Object.keys(dbStore.data.overrides).find(k=>k.startsWith("one:"))')
  await page.locator(f'[data-action="edit-day"][data-id="{id}"]').click();await page.locator('#modal-form [name="newEx"]').select_option(index=1);await page.locator('#modal-form [type="submit"]').click()
  count=await page.evaluate('''id=>dbStore.data.overrides[id].exercises.length''',id);assert count==1,count
  # Multiple measurements and custom metrics.
  await page.locator('[data-tab="progress"]').click();await page.locator('[data-action="progress-mode"][data-value="body"]').click()
  await page.locator('[data-action="add-custom-metric"]').click();await page.locator('#modal-form [name="name"]').fill('Гибкость');await page.locator('#modal-form [name="unit"]').fill('см');await page.locator('#modal-form [type="submit"]').click()
  assert await page.evaluate('()=>dbStore.data.customMetrics.length')==1
  await page.locator('[data-action="add-measurements"]').click();key=await page.evaluate('()=>dbStore.data.customMetrics[0].id');await page.locator(f'#modal-form [name="{key}"]').fill('12.5');await page.locator('#modal-form [type="submit"]').click()
  assert await page.get_by_text('Гибкость: 12.5 см').count()==1
  await page.locator('[data-action="edit-measurement"]').first.click();await page.locator('#modal-form [name="value"]').fill('13.5');await page.locator('#modal-form [type="submit"]').click()
  assert await page.get_by_text('Гибкость: 13.5 см').count()==1
  assert not errors,errors
  print('EDITOR FLOW UI PASS: day drafts, scope, one-off exercise, custom measurement editing')
  await browser.close()
if __name__=='__main__':asyncio.run(test())