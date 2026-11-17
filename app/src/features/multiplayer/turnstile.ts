interface Turnstile {render:(el:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void}
declare global { interface Window {turnstile?:Turnstile} }
let loading:Promise<void>|null=null;
function load() {
  if(window.turnstile)return Promise.resolve();
  if(!loading)loading=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{loading=null;script.remove();reject(new Error('CAPTCHA_LOAD'));};document.head.append(script);
  });return loading;
}
export async function requestCaptcha(container:HTMLElement,sitekey:string,signal:AbortSignal):Promise<string> {
  if(!sitekey)throw new Error('CAPTCHA_CONFIG');await load();
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  return new Promise((resolve,reject)=>{
    let widget:string|undefined;let settled=false;
    const finish=(token?:string)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(widget)window.turnstile?.remove(widget);container.replaceChildren();token?resolve(token):reject(new Error('CAPTCHA_CANCELLED'));};
    const abort=()=>finish();signal.addEventListener('abort',abort,{once:true});
    widget=window.turnstile!.render(container,{sitekey,callback:(token:string)=>finish(token),'error-callback':()=>finish(),'expired-callback':()=>finish()});
  });
}
