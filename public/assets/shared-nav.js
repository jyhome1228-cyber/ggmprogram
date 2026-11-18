(() => {
  'use strict';
  const pages=[
    ['/', '주문 대시보드'],
    ['/products.html','상품 목록'],
    ['/explorer.html','주문자·제품 조회'],
    ['/customers.html','고객조회'],
    ['/sales.html','판매액·매출 분석'],
    ['/payments.html','무통장·가상계좌 입금 확인'],
    ['/backup.html','배송 데이터 백업'],
    ['/shipping.html','배송 점검']
  ];
  const init=()=>{
    const root=document.getElementById('ggm-shared-nav');
    if(!root)return;
    const here=location.pathname==='/index.html'?'/':location.pathname;
    root.setAttribute('aria-label','건강미 운영 메뉴');
    const close=document.createElement('button');
    close.id='ggm-menu-close';close.type='button';close.setAttribute('aria-label','메뉴 닫기');close.textContent='×';
    root.appendChild(close);
    const brand=document.createElement('div');brand.className='ggm-brand';
    brand.innerHTML='<div class="ggm-lockup"><img class="ggm-mark" src="/assets/geonganmi-mark.svg" alt=""><img class="ggm-wordmark" src="/assets/geonganmi-wordmark.svg" alt="GEONGANMI"></div><small class="ggm-caption">GGM OPS · COMMERCE OPERATIONS</small>';
    root.appendChild(brand);
    const nav=document.createElement('nav');nav.setAttribute('aria-label','주요 페이지');
    pages.forEach(([href,label])=>{
      const link=document.createElement('a');link.href=href;link.textContent=label;
      link.className='ggm-link'+(here===href?' active':'');
      if(here===href)link.setAttribute('aria-current','page');
      nav.appendChild(link);
    });
    root.appendChild(nav);
    const toggle=document.createElement('button');toggle.type='button';toggle.id='ggm-menu-toggle';
    toggle.setAttribute('aria-label','메뉴 열기');toggle.setAttribute('aria-controls','ggm-shared-nav');toggle.setAttribute('aria-expanded','false');
    toggle.textContent='☰';document.body.appendChild(toggle);
    const backdrop=document.createElement('div');backdrop.id='ggm-nav-backdrop';document.body.appendChild(backdrop);
    const setOpen=(open)=>{document.body.classList.toggle('ggm-nav-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');if(open)close.focus();else toggle.focus();};
    toggle.addEventListener('click',()=>setOpen(!document.body.classList.contains('ggm-nav-open')));
    close.addEventListener('click',()=>setOpen(false));
    backdrop.addEventListener('click',()=>setOpen(false));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('ggm-nav-open'))setOpen(false)});
    const media=window.matchMedia('(min-width:901px)');
    media.addEventListener('change',()=>{document.body.classList.remove('ggm-nav-open');toggle.setAttribute('aria-expanded','false')});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
