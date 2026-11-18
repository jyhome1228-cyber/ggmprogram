// Shared authentication status banner. Cloudflare Access protects the Worker before JS is served.
(() => {
  'use strict';
  const style=document.createElement('style');
  style.textContent='.ggm-auth-banner{position:fixed;bottom:24px;right:24px;z-index:110;background:#fff;border:1px solid #dce8ea;border-radius:12px;box-shadow:0 15px 40px #253e4838;padding:19px 21px;max-width:min(410px,calc(100vw - 60px));font:13px/1.6 Pretendard,-apple-system,sans-serif;color:#45636d}.ggm-auth-banner h3{font-size:15px;color:#29454e;margin:0 0 7px}.ggm-auth-banner p{margin:0 0 14px;color:#647e87}.ggm-auth-banner a{display:inline-block;padding:9px 14px;border-radius:8px;color:white;background:#667f89;text-decoration:none;font-weight:700}.ggm-auth-banner button{border:0;background:transparent;color:#718a92;margin-left:12px;font-size:12px;cursor:pointer}';
  document.head.append(style);
  async function check(){
    try{
      const r=await fetch('/api/status',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return;
      const result=await r.json();
      if(result.connected)return;
      if(document.getElementById('ggm-auth-banner'))return;
      const box=document.createElement('section');box.className='ggm-auth-banner';box.id='ggm-auth-banner';
      const heading=document.createElement('h3');heading.textContent='카페24 연결이 필요합니다';
      const p=document.createElement('p');p.textContent='관리자 로그인은 유지되지만 카페24 주문 API 인증이 만료되었거나 연결되지 않았습니다. 연결하기를 눌러 쇼핑몰 권한을 승인해주세요.';
      const a=document.createElement('a');a.href='/oauth/start';a.textContent='카페24 연결하기';
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='닫기';dismiss.addEventListener('click',()=>box.remove());
      box.append(heading,p,a,dismiss);document.body.append(box);
    }catch{
      // Network failures are handled by each page's own error UI; never force OAuth.
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
})();
