import { firebaseProjectId } from './firebase';
import { useMemo, useState } from 'react';
import { Activity, AlertCircle, ArrowDownToLine, CheckCircle2, ChevronDown, ClipboardList, Database, FileSpreadsheet, LayoutDashboard, Menu, Package, RefreshCw, Search, Settings, ShieldCheck, Truck, X } from 'lucide-react';
import { analyze, mockShipments, type Shipment } from './data';
type View = 'dashboard' | 'orders' | 'issues' | 'tracking' | 'history' | 'settings';
const items: {id:View;name:string;icon:typeof LayoutDashboard}[] = [
 {id:'dashboard',name:'대시보드',icon:LayoutDashboard},{id:'orders',name:'전체 주문관리',icon:ClipboardList},
 {id:'issues',name:'배송 누락 검사',icon:ShieldCheck},{id:'tracking',name:'송장 관리',icon:Truck},
 {id:'history',name:'배송 이력',icon:Package},{id:'settings',name:'연동 설정',icon:Settings}
];
const labels:Record<View,string>={dashboard:'운영 대시보드',orders:'전체 주문관리',issues:'배송 누락 검사',tracking:'송장 관리',history:'배송 이력',settings:'연동 설정'};
const dateLabel = new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric'}).format(new Date());
const statusTone:Record<string,string>={'송장 미등록':'danger','배송 준비':'warning','배송 중':'blue','배송 완료':'success','취소 요청':'neutral'};
function csvExport(rows:Shipment[]) {
 const heads=['주문번호','고객','상품명','수량','배송상태','택배사','송장번호','공급처','주문일'];
 const values=rows.map(r=>[r.orderId,r.customer,r.product,r.quantity,r.status,r.courier,r.tracking,r.vendor,r.orderedAt]);
 const escapeCsv=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv='\uFEFF'+[heads,...values].map(row=>row.map(escapeCsv).join(',')).join('\r\n');
 const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='건강미_배송관리_샘플.csv';link.click();URL.revokeObjectURL(link.href);
}
export default function App(){
 const [view,setView]=useState<View>('dashboard'); const [search,setSearch]=useState(''); const [status,setStatus]=useState('전체');const [sidebar,setSidebar]=useState(false);
 const analyzed=useMemo(()=>analyze(mockShipments),[]);
 const filtered=useMemo(()=>analyzed.filter(r=>(status==='전체'||r.status===status)&&[r.orderId,r.customer,r.product,r.vendor,r.tracking].some(v=>v.toLowerCase().includes(search.toLowerCase()))&&(view!=='issues'||r.issues.length>0)),[analyzed,search,status,view]);
 const activeRows=analyzed.filter(r=>r.status!=='취소 요청');const missing=analyzed.filter(r=>r.issues.length>0);
 const cards=[{label:'전체 주문',value:analyzed.length,icon:ClipboardList,tone:'slate'},{label:'배송 대상',value:activeRows.length,icon:Package,tone:'slate'},{label:'송장 미등록',value:analyzed.filter(r=>r.status==='송장 미등록').length,icon:AlertCircle,tone:'red'},{label:'확인 필요',value:missing.length,icon:ShieldCheck,tone:'amber'}];
 function navigate(id:View){setView(id);setSearch('');setStatus('전체');setSidebar(false);}
 return <div className="shell">
 <aside className={'sidebar '+(sidebar?'open':'')}>
   <div className="brand"><span className="brand-mark"><img src={import.meta.env.BASE_URL + "logo/geonganmi-symbol.svg"} alt="건강미 심볼"/></span><div className="brand-identity"><img src={import.meta.env.BASE_URL + "logo/geonganmi-wordmark.svg"} alt="GEONGANMI" className="brand-wordmark"/><small>SHIPPING MANAGER</small></div><button className="mobile-close" aria-label="메뉴 닫기" onClick={()=>setSidebar(false)}><X size={20}/></button></div>
   <div className="side-caption">WORKSPACE</div><nav>{items.map(item=><button key={item.id} className={'navitem '+(view===item.id?'selected':'')} onClick={()=>navigate(item.id)}><item.icon size={18}/>{item.name}{view===item.id&&<span className="nav-dot"/>}</button>)}</nav>
   <div className="sidebar-bottom"><div className="connect-badge"><span className="indicator"/> 데모 모드 · API 미연결</div><p>카페24 주문 데이터와 연동하기 전의 기본 화면입니다.</p></div>
 </aside>
 {sidebar&&<button className="overlay" aria-label="메뉴 닫기" onClick={()=>setSidebar(false)}/>}
 <main className="main"><header className="topbar"><button className="hamburger" onClick={()=>setSidebar(true)} aria-label="메뉴 열기"><Menu size={22}/></button><div className="breadcrumb">건강미 <span>/</span> {labels[view]}</div><div className="top-right"><span className="demo-pill"><span className="indicator"/> 테스트 환경</span><span className="avatar">GM</span></div></header>
 <div className="content"><div className="heading"><div><div className="eyebrow">GGM OPERATIONS</div><h1>{labels[view]}</h1><p>{view==='dashboard'?'배송 현황과 누락 의심 주문을 한눈에 확인하세요.':view==='settings'?'카페24 및 Firebase 연결 준비 상태를 확인하세요.':'주문 데이터에서 확인이 필요한 배송 건을 검토하세요.'}</p></div><div className="heading-side"><span>{dateLabel}</span><button className="primary-btn" onClick={()=>navigate('settings')}><RefreshCw size={15}/> API 연결 준비</button></div></div>
 <div className="warning-banner"><AlertCircle size={18}/><div><strong>현재는 샘플 데이터만 표시됩니다.</strong> 실제 주문·배송 현황이 아니며, 카페24 API 연결 전에는 배송상태 변경 또는 송장 등록이 실행되지 않습니다.</div></div>
 {view==='settings'?<section className="settings-grid"><div className="panel"><h2>연동 상태</h2><div className="setting-row"><div><strong>카페24 Admin API</strong><p>주문 조회 및 송장 연동</p></div><span className="pill warning">연결 전</span></div><div className="setting-row"><div><strong>Firebase 프로젝트</strong><p>{firebaseProjectId} · 웹 SDK 구성 완료 (서버 미연동)</p></div><span className="pill blue">SDK 준비</span></div><div className="setting-row"><div><strong>Firebase Authentication</strong><p>관리자 로그인 활성화 예정</p></div><span className="pill warning">설정 전</span></div><div className="setting-row"><div><strong>Cloud Functions</strong><p>OAuth 토큰을 서버에서 안전하게 관리</p></div><span className="pill warning">설정 전</span></div></div><div className="panel"><h2>다음 설정 단계</h2><ol className="steps"><li>Firebase 프로젝트 생성 및 Hosting 활성화</li><li>관리자 로그인과 서버 권한 검증 구현</li><li>Cloud Functions에 카페24 OAuth 콜백 배포</li><li>카페24 App URL·Redirect URI 등록</li><li>실제 주문 조회 후 검증 규칙 테스트</li></ol><div className="small-note">Client Secret, Access Token은 프론트엔드나 GitHub에 입력하지 마세요.</div></div></section>:<>
 {(view==='dashboard'||view==='issues')&&<div className="stat-grid">{cards.map(c=><div className="stat-card" key={c.label}><span className="stat-icon"><c.icon size={20}/></span><div><span className="stat-label">{c.label}</span><div className="stat-value">{c.value}<span>건</span></div></div></div>)}</div>}
 <section className="panel"><div className="section-head"><div><h2>{view==='issues'?'배송 누락·오류 의심 목록':view==='tracking'?'운송장 관리 목록':view==='history'?'주문별 배송 이력':'주문 및 배송 현황'}</h2><p>총 {filtered.length}건 · 샘플 데이터 기준</p></div><button className="outline-btn" onClick={()=>csvExport(filtered)}><ArrowDownToLine size={16}/> CSV 다운로드</button></div>
 <div className="filters"><div className="searchbox"><Search size={18}/><input aria-label="주문 검색" placeholder="주문번호, 고객명, 상품명, 송장번호 검색" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="selectwrap"><select aria-label="배송상태 필터" value={status} onChange={e=>setStatus(e.target.value)}><option>전체</option>{Object.keys(statusTone).map(k=><option key={k}>{k}</option>)}</select><ChevronDown size={15}/></div></div>
 <div className="table-scroll"><table><thead><tr><th>주문번호 / 주문일</th><th>고객명</th><th>상품명</th><th>수량</th><th>송장번호</th><th>배송 상태</th><th>검증 결과</th></tr></thead><tbody>{filtered.length?filtered.map(r=><tr key={r.id}><td><b>{r.orderId}</b><small>{r.orderedAt}</small></td><td>{r.customer}</td><td><span className="product">{r.product}</span><small>{r.vendor}</small></td><td>{r.quantity}</td><td className="tracking">{r.tracking||'미등록'}</td><td><span className={'pill '+statusTone[r.status]}>{r.status}</span></td><td>{r.issues.length?<span className="issue"><AlertCircle size={14}/>{r.issues.join(', ')}</span>:<span className="ok"><CheckCircle2 size={14}/> 정상</span>}</td></tr>):<tr><td colSpan={7} className="empty">조건에 맞는 주문이 없습니다.</td></tr>}</tbody></table></div>
 </section>
 <section className="tip-grid"><div className="tip"><FileSpreadsheet size={20}/><div><strong>송장 엑셀 대조</strong><p>실제 API 연결 후 주문·발주·송장 데이터를 기준으로 누락을 검증합니다.</p></div></div><div className="tip"><Database size={20}/><div><strong>검증 이력 관리</strong><p>확인 결과와 담당자 메모는 향후 Firestore에 보관합니다.</p></div></div></section>
 </>}
 <footer>건강미 배송관리 · 초기 개발 버전 v0.1 · 실제 쇼핑몰 미연동</footer>
 </div></main></div>;
}
