import {test,expect} from '@playwright/test';
test('real renderer recovers context loss without clearing the mission',async({page})=>{
 await page.request.post('/api/auth/login',{data:{email:'kestrel@plume.demo',password:'plume-demo-2040'}});
 await page.goto('/#setup');await page.getByLabel('MISSION IDENTIFIER').fill('Context recovery');
 const canvas=page.locator('.persistent-scene canvas');await expect(canvas).toBeVisible();await expect(page.locator('.fallback-map')).toHaveCount(0);
 const supported=await canvas.evaluate(c=>{const gl=(c as HTMLCanvasElement).getContext('webgl2');const ext=gl?.getExtension('WEBGL_lose_context');if(ext){ext.loseContext();return true;}return false;});
 test.skip(!supported,'Browser does not expose context-loss extension');
 await expect(page.getByLabel('MISSION IDENTIFIER')).toHaveValue('Context recovery');
 await expect(page.locator('.persistent-scene canvas')).toBeVisible();
 await expect(page.locator('.fallback-map')).toHaveCount(0);
});
test('2D fallback provides a usable explicit retry without changing inputs',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2')return null;return original.call(this,type,...(args as []));} as typeof original;});
 await page.request.post('/api/auth/login',{data:{email:'kestrel@plume.demo',password:'plume-demo-2040'}});
 await page.goto('/#setup');await page.getByLabel('MISSION IDENTIFIER').fill('Fallback mission');
 await expect(page.getByRole('button',{name:'Retry 3D',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry 3D',exact:true}).click();
 await expect(page.locator('.fallback-map')).toBeVisible();
 await expect(page.getByLabel('MISSION IDENTIFIER')).toHaveValue('Fallback mission');
});
