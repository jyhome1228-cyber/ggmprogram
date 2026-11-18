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
  async function staffSession(){
    try {
      const modeResponse=await fetch('/auth/mode',{credentials:'same-origin',cache:'no-store'});
      if(modeResponse.ok){
        const modeData=await modeResponse.json();
        if(modeData.mode==='shared'){
          const status=await fetch('/auth/shared/me',{credentials:'same-origin',cache:'no-store'});
          if(status.ok && !document.getElementById('ggm-staff-control')){
            const controls=document.createElement('div');controls.id='ggm-staff-control';
            controls.style.cssText='position:fixed;bottom:14px;right:20px;z-index:90;display:flex;align-items:center;gap:12px;background:#fff;padding:9px 13px;border:1px solid #dae6e8;border-radius:10px;box-shadow:0 8px 22px #28465026;font:12px Pretendard,-apple-system,sans-serif;color:#597983';
            const title=document.createElement('span');title.textContent='테스트 관리자 접속 중';
            const logout=document.createElement('button');logout.type='button';logout.textContent='로그아웃';logout.style.cssText='border:0;background:#edf3f4;padding:6px 10px;color:#3d626c;border-radius:6px;cursor:pointer';
            logout.addEventListener('click',async()=>{
              logout.disabled=true;try{await fetch('/auth/shared/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'})}finally{location.assign('/login.html')}
            });
            controls.append(title,logout);document.body.append(controls);
          }
          return;
        }
      }
      const res=await fetch('/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)return;
      const data=await res.json();
      if(!data.authenticated||!data.user||document.getElementById('ggm-staff-control'))return;
      const controls=document.createElement('div');controls.id='ggm-staff-control';
      controls.style.cssText='position:fixed;bottom:14px;left:245px;z-index:90;display:flex;align-items:center;gap:12px;background:#fff;padding:9px 13px;border:1px solid #dae6e8;border-radius:10px;box-shadow:0 8px 22px #28465026;font:12px Pretendard,-apple-system,sans-serif;color:#597983';
      const name=document.createElement('span');name.textContent=data.user.username+' · '+(data.user.role==='admin'?'관리자':'직원');controls.append(name);
      if(data.user.role==='admin'){
        const a=document.createElement('a');a.href='/accounts.html';a.textContent='계정 관리';a.style.cssText='color:#4e6e79;font-weight:700';controls.append(a);
      }
      const logout=document.createElement('button');logout.textContent='로그아웃';
      logout.style.cssText='border:0;background:#edf3f4;padding:6px 10px;color:#3d626c;border-radius:6px;cursor:pointer';
      logout.addEventListener('click',async()=>{
        logout.disabled=true;
        try{await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'})}finally{location.assign('/login.html')}
      });
      controls.append(logout);document.body.append(controls);
      if(window.matchMedia?.('(max-width: 900px)').matches)controls.style.left='70px';
    }catch{}
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{check();staffSession()},{once:true});
  }else{check();staffSession()}

})();
