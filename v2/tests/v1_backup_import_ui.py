"""UI regression for explicitly importing a V1 encrypted backup on a fresh V2 origin.
Fake crypto and storage in about:blank are used ONLY for UI flow; real crypto is
covered by node tests. Never use the fixture in production.
"""
import asyncio, base64, json, re
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parent.parent

def envelope():
    obj={'startDate':'2026-11-02','checks':{'2026-11-03':{'morning/march':True}},'logs':{'2026-11-03':{'knee':2,'note':'Historical note'}},'weights':{'2026-11-03':{'strengthA/legpress':'55'}}}
    return {'format':'training-week-encrypted-v1','version':1,'iterations':310000,'salt':base64.b64encode(bytes(range(16))).decode(),'iv':base64.b64encode(bytes(range(12))).decode(),'ciphertext':base64.b64encode(json.dumps(obj).encode()).decode()}

async def run():
    html=(root/'index.html').read_text()
    html=re.sub(r'<link rel="stylesheet"[^>]*>','',html)
    html=re.sub(r'<script type="module"[^>]*></script>','',html)
    html=html.replace('</head>',f'<style>{(root/"style.css").read_text()}</style></head>')
    core=re.sub(r'(?m)^export\s+','',(root/'js/core.mjs').read_text())
    app=re.sub(r"^import\s+.*?from\s+'./core.mjs';\s*",'',(root/'js/app.mjs').read_text())
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
        page=await browser.new_page()
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:asyncio.create_task(d.accept()))
        await page.set_content(html,wait_until='domcontentloaded')
        await page.evaluate('''legacy => {
         const m=new Map(),c=window.crypto;
         Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}});
         Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>`test-${Math.random()}`,getRandomValues:a=>c.getRandomValues(a),subtle:{importKey:async()=>({}),deriveKey:async()=>({}),encrypt:async(_,k,x)=>x,decrypt:async(_,k,x)=>x}}});
         window.fetch=async ()=>({ok:true,json:async()=>legacy});
        }''',json.loads((root/'legacy-plan.json').read_text()))
        await page.add_script_tag(content=core+'\n'+app)
        assert await page.locator('#auth-import-v1').is_visible()
        await page.locator('#auth-pass').fill('right-password-at-least-12')
        # Invalid fixture cannot create V2 data.
        await page.locator('#auth-import-file').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':b'{}'})
        await page.locator('#auth-error').get_attribute('id')
        assert await page.locator('#app').is_hidden()
        await page.locator('#auth-import-file').set_input_files({'name':'backup-v1.json','mimeType':'application/json','buffer':json.dumps(envelope()).encode()})
        await page.locator('#app').wait_for(state='visible',timeout=14000)
        assert await page.evaluate('localStorage.getItem("training-v2-secure-v1")') is not None
        assert await page.evaluate('localStorage.getItem("training-week-secure-v1")') is None
        assert not errors,errors
        print('PASS: fresh-origin encrypted V1 backup import, invalid format rejection, source untouched')
        await browser.close()

if __name__=='__main__':asyncio.run(run())