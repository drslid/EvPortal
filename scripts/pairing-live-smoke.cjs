/* Requires the portal on :4187 and the local Worker on :8787; no production requests. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const jsqr = require('jsqr');
(async () => {
await fs.mkdir(results, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'chromium'});
try {
const errors=[];
const car=await browser.newContext({viewport:{width:1440,height:900},locale:'fr-FR'});
const phone=await browser.newContext({viewport:{width:390,height:844},locale:'fr-FR'});
for(const context of [car,phone]) {
 await context.route('**/js/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.EV_CONFIG={pairingRelayURL:'http://127.0.0.1:8787'};"}));
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
}
const receiver=await car.newPage();
await receiver.goto('http://127.0.0.1:4187/');
await receiver.evaluate(()=>{const previous=JSON.parse(localStorage.getItem('evportal.state.v2')); previous.categories[0].label='Older recovery'; localStorage.setItem('evportal.previous-transfer.v1',JSON.stringify(previous));});
await receiver.reload();
const recoveryBefore=await receiver.evaluate(()=>localStorage.getItem('evportal.previous-transfer.v1'));
await receiver.locator('#settingsButton').click();
await receiver.screenshot({path:path.join(results, 'evportal-share-desktop.png')});
await receiver.locator('#pairReceiveButton').click();
await receiver.locator('#pairReceiveQRCode').waitFor({state:'visible'});
await receiver.locator('#pairReceiveQRCode canvas').waitFor({state:'attached'});
const pixels=await receiver.locator('#pairReceiveQRCode canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height,data:Array.from(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)}));
const code=jsqr(Uint8ClampedArray.from(pixels.data),pixels.width,pixels.height);
assert.ok(code,'Receiving QR must be decodable');
assert.equal(new URL(code.data).origin,'https://drslid.github.io');
await receiver.screenshot({path:path.join(results, 'evportal-receive-desktop.png')});
const sender=await phone.newPage();
await sender.goto('http://127.0.0.1:4187/');
await sender.evaluate(()=>{
 const state=JSON.parse(localStorage.getItem('evportal.state.v2'));
 state.categories[0].shortcuts[0].name='Test téléphone chiffré';
 localStorage.setItem('evportal.state.v2',JSON.stringify(state));
});
await sender.reload();
await sender.goto('http://127.0.0.1:4187/'+new URL(code.data).hash);
await sender.locator('#pairSendDialog').waitFor({state:'visible'});
assert.equal(await sender.evaluate(()=>location.hash),'');
await sender.screenshot({path:path.join(results, 'evportal-send-mobile.png')});
await sender.locator('#pairSendButton').click();
await receiver.locator('#pairApplyButton').waitFor({state:'visible',timeout:15000});
assert.equal(await receiver.evaluate(()=>JSON.parse(localStorage.getItem('evportal.state.v2')).categories[0].shortcuts[0].name),'Netflix');
await receiver.evaluate(()=>{window.testOriginalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='evportal.state.v2')throw new DOMException('Quota exceeded','QuotaExceededError'); return window.testOriginalSetItem.call(this,key,value);};});
await receiver.locator('#pairApplyButton').click();
await receiver.waitForFunction(()=>document.getElementById('pairReceiveError').textContent.length>0);
assert.equal(await receiver.evaluate(()=>localStorage.getItem('evportal.previous-transfer.v1')),recoveryBefore);
assert.equal(await receiver.evaluate(()=>JSON.parse(localStorage.getItem('evportal.state.v2')).categories[0].shortcuts[0].name),'Netflix');
await receiver.evaluate(()=>{Storage.prototype.setItem=window.testOriginalSetItem; delete window.testOriginalSetItem;});
await receiver.locator('#pairApplyButton').click();
assert.equal(await receiver.evaluate(()=>JSON.parse(localStorage.getItem('evportal.state.v2')).categories[0].shortcuts[0].name),'Test téléphone chiffré');
await receiver.reload();
const otherTab=await car.newPage();
await otherTab.goto('http://127.0.0.1:4187/');
await otherTab.evaluate(()=>{const previous=JSON.parse(localStorage.getItem('evportal.previous-transfer.v1')); previous.categories[0].label='Updated recovery'; localStorage.setItem('evportal.previous-transfer.v1',JSON.stringify(previous));});
await receiver.locator('#settingsButton').click();
await receiver.locator('#undoTransferButton').evaluate(button=>{button.closest('details').open=true;});
await receiver.locator('#undoTransferButton').click();
assert.equal(await receiver.evaluate(()=>JSON.parse(localStorage.getItem('evportal.state.v2')).categories[0].shortcuts[0].name),'Netflix');
assert.equal(await receiver.evaluate(()=>JSON.parse(localStorage.getItem('evportal.state.v2')).categories[0].label),'Updated recovery');
assert.deepEqual(errors,[]);
console.log('Real Worker / two isolated browser contexts: QR decoded, encrypted transfer, explicit Apply, failed-storage rollback, persistence and Undo across reloads/tabs passed.');
for(const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:900}]) {
 await receiver.setViewportSize(viewport);
 for(const language of ['fr','de','ar']) {
  await receiver.evaluate(lang=>EVI18n.setLanguage(lang),language);
  if (!await receiver.locator('#settingsDialog').isVisible()) await receiver.locator('#settingsButton').click();
  await receiver.locator('#shareButton').click();
  const sizes=await receiver.locator('#shareDialog').evaluate(d=>({w:d.clientWidth,scroll:d.scrollWidth}));
  assert.ok(sizes.scroll<=sizes.w+1,JSON.stringify({viewport,language,sizes}));
  if(language==='ar'&&viewport.width===320) await receiver.screenshot({path:path.join(results, 'evportal-share-ar-mobile.png')});
  await receiver.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const a=await receiver.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}); return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});
  assert.deepEqual(a,[],JSON.stringify({viewport,language,a}));
  await receiver.locator('#shareDialog [data-close-dialog]').click();
 }
}
console.log('Share dialog: no horizontal overflow and axe checks passed at 320/390/1440px in French, German and Arabic.');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
