"""Localhost Chromium WebCrypto + PWA offline validation. No mocked storage or encryption."""
import asyncio, subprocess, time, socket
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
PORT=19764

async def test():
    proc=subprocess.Popen(['python','-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        await asyncio.sleep(.7)
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
            context=await browser.new_context(viewport={'width':390,'height':844},service_workers='allow')
            page=await context.new_page()
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://127.0.0.1:{PORT}/',wait_until='domcontentloaded')
            await page.locator('#auth-title').wait_for(timeout=10000)
            await page.locator('#auth-pass').fill('encrypted-real-test-pass-12')
            await page.locator('#auth-confirm').fill('encrypted-real-test-pass-12')
            await page.locator('#auth-submit').click()
            await page.locator('#app').wait_for(state='visible',timeout=20000)
            assert 'training-v2-encrypted-v1' in (await page.evaluate('localStorage.getItem("training-v2-secure-v1")'))
            assert 'Прогресс' in await page.locator('#tabs').inner_text()
            await page.reload()
            assert await page.locator('#auth-title').inner_text()=='Введи пароль'
            await page.locator('#auth-pass').fill('encrypted-real-test-pass-12')
            await page.locator('#auth-submit').click()
            await page.locator('#app').wait_for(state='visible',timeout=20000)
            sw=await page.evaluate('''async()=>{if(!navigator.serviceWorker)return false;await navigator.serviceWorker.ready;return !!(await caches.keys()).find(k=>k.includes('trenirovki-v2'))}''')
            assert sw,'PWA cache missing'
            await context.set_offline(True)
            await page.reload(wait_until='domcontentloaded')
            assert await page.locator('#auth-title').inner_text()=='Введи пароль'
            await page.locator('#auth-pass').fill('encrypted-real-test-pass-12')
            await page.locator('#auth-submit').click()
            await page.locator('#app').wait_for(state='visible',timeout=20000)
            assert not errors,errors
            print('LOCALHOST REAL WEBCRYPTO + PASSWORD RELOAD + PWA OFFLINE PASS')
            await browser.close()
    finally:
        proc.terminate();proc.wait(timeout=5)

if __name__=='__main__':asyncio.run(test())