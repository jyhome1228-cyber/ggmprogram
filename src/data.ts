export type Status = '송장 미등록' | '배송 준비' | '배송 중' | '배송 완료' | '취소 요청';
export type Shipment = { id: string; orderId: string; customer: string; product: string; quantity: number; courier: string; tracking: string; status: Status; orderedAt: string; vendor: string; note: string; };
export const mockShipments: Shipment[] = [
{id:'A01',orderId:'20261107-000101',customer:'김○○',product:'건강미 욕세럼',quantity:2,courier:'',tracking:'',status:'송장 미등록',orderedAt:'2026-11-07',vendor:'욕세럼 공급처',note:'출고 확인 필요'},
{id:'A02',orderId:'20261107-000102',customer:'이○○',product:'페이스푸드 식물성 세럼',quantity:1,courier:'CJ대한통운',tracking:'EXAMPLE-0002',status:'배송 중',orderedAt:'2026-11-07',vendor:'페이스푸드 공급처',note:''},
{id:'A03',orderId:'20261106-000103',customer:'박○○',product:'리셀에클로',quantity:1,courier:'',tracking:'',status:'취소 요청',orderedAt:'2026-11-06',vendor:'리셀에클로 공급처',note:'출고 제외 대상'},
{id:'A04',orderId:'20261106-000104',customer:'최○○',product:'건강미 욕세럼',quantity:3,courier:'',tracking:'',status:'배송 준비',orderedAt:'2026-11-06',vendor:'욕세럼 공급처',note:'발주 대조 필요'},
{id:'A05',orderId:'20261105-000105',customer:'정○○',product:'페이스푸드 식물성 세럼',quantity:2,courier:'CJ대한통운',tracking:'EXAMPLE-0005',status:'배송 완료',orderedAt:'2026-11-05',vendor:'페이스푸드 공급처',note:''},
{id:'A06',orderId:'20261105-000106',customer:'한○○',product:'리셀에클로',quantity:1,courier:'CJ대한통운',tracking:'EXAMPLE-0006',status:'배송 중',orderedAt:'2026-11-05',vendor:'리셀에클로 공급처',note:''},
];
export function analyze(rows:Shipment[]) {
 const duplicates = new Set<string>(); const seen = new Set<string>();
 for (const row of rows) if (row.tracking) {if (seen.has(row.tracking)) duplicates.add(row.tracking); seen.add(row.tracking);}
 return rows.map(r=>({...r,issues:[
 ...(r.status==='송장 미등록' ? ['송장 누락 의심'] : []),
 ...(r.status==='취소 요청' && r.tracking ? ['취소 건 송장 확인'] : []),
 ...(r.tracking && duplicates.has(r.tracking) ? ['중복 송장 확인'] : []),
 ...(r.status==='배송 준비' && !r.tracking ? ['발주·출고 확인'] : [])
 ]}));
}
