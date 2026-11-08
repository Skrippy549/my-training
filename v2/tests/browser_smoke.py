import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
root=Path('/mnt/data/trenirovki_v2_dev')

async def main():
 html=(root/'index.html').read_text()
 html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
 html=re.sub(r'<script type="module"[^>]*></script>','',html)
 html=html.replace('</head>',f'<style>{(root/"style.css").read_text()}</style></head>')
 core=re.sub(r'(?m)^export\s+','',(root/'js/core.mjs').read_text())
 app=re.sub(r"^import\s+.*?from\s+'./core.mjs';\s*",'',(root/'js/app.mjs').read_text())
 bundle=core+'\n'+app
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
  page=await browser.new_page(viewport={'width':393,'height':852},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html,wait_until='domcontentloaded')
  await page.evaluate('''() => {
   const map=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}});
   // Browser smoke test only: fake WebCrypto because about:blank is an insecure origin.
   const c=window.crypto;
   Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>`test-${Math.random()}`,getRandomValues:a=>c.getRandomValues(a),subtle:{
     importKey:async (_,data)=>({data}),deriveKey:async (_,key)=>key,
     encrypt:async (_,key,data)=>data,
     decrypt:async (_,key,data)=>data}}});
  }''')
  await page.add_script_tag(content=bundle)
  assert await page.locator('#auth-title').inner_text()=='Создать защищённое хранилище', errors
  await page.locator('#auth-pass').fill('long-private-test-pass')
  await page.locator('#auth-confirm').fill('long-private-test-pass')
  await page.locator('#auth-submit').click()
  await page.locator('#app').wait_for(state='visible',timeout=10000)
  assert await page.get_by_role('heading',name='Сегодня',exact=True).count()==1,errors
  await page.screenshot(path=str(root/'tests/today.png'),full_page=True)
  await page.locator('#tabs [data-tab="calendar"]').click();assert await page.get_by_role('heading',name='Календарь').count()==1
  await page.screenshot(path=str(root/'tests/calendar.png'),full_page=True)
  await page.locator('#tabs [data-tab="programs"]').click();await page.locator('[data-action="new-program"]').click()
  await page.locator('#modal-form [name="name"]').fill('Программа проверка')
  await page.locator('#modal-form [type="submit"]').click()
  await page.locator('[data-action="add-template"]').wait_for()
  await page.locator('[data-action="add-template"]').click()
  await page.locator('#modal-form [name="name"]').fill('Силовая тест')
  await page.locator('#modal-form [type="submit"]').click()
  await page.get_by_text('Силовая тест').first.wait_for()
  await page.locator('#tabs [data-tab="progress"]').click()
  await page.get_by_role('heading',name='Прогресс').wait_for()
  await page.locator('[data-action="add-weight"]').first.click()
  await page.locator('#modal-form [name="weight"]').fill('100')
  await page.locator('#modal-form [type="submit"]').click()
  await page.locator('[data-action="progress-mode"][data-value="body"]').click()
  assert await page.get_by_text('100 кг').count()>0
  await page.locator('#tabs [data-tab="profile"]').click()
  await page.locator('[data-action="new-zone"]').click()
  await page.locator('#modal-form [name="name"]').fill('Запястье тест')
  await page.locator('#modal-form [type="submit"]').click()
  await page.get_by_text('Запястье тест').wait_for()
  await page.screenshot(path=str(root/'tests/profile.png'),full_page=True)
  print('BROWSER UI PASS; runtime errors:',errors)
  await browser.close()

asyncio.run(main())
