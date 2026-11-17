# GGM OPS v2 — 건강미 주문관리 (Phase 1)

카페24 쇼핑몰 `ggmspa`와 연결되는 Cloudflare Workers 기반 **읽기 전용 주문관리 1차 버전**입니다.

## 구현 현황
- 실제 카페24 주문 조회 (최근 최대 30일, 페이지당 50건 / API 페이징)
- 결제 여부는 카페24 `paid` 필드 기준으로 집계 (`T`: 결제완료, `F`: 결제대기, `M`: 부분결제)
- 주문번호 클릭 시 상품명·옵션·수량·품목별 배송상태 및 송장정보 **읽기 전용 상세 조회**
- 현재 페이지 주문번호 검색, 결제상태 필터, 기간 선택, 목록 CSV 내보내기
- 주문 상태를 기본 주문목록에서 제공하지 않는 경우 `상세 조회`로 표시 (임의 상태 집계 없음)
- API 연결 상태, 응답 오류/빈 목록 표시
- OAuth 최초 연결 및 토큰 갱신. 기존 KV의 토큰 키 재사용
- 개인정보 최소화: 주문번호, 일시, 상태, 결제금액만 반환
- 주문 수정/송장 등록/CS 저장/자동 동기화는 **아직 미구현**

## 배포

1. Cloudflare > Workers & Pages > 기존 `ggm-ops` > Settings > Builds > Connect 에서 `jyhome1228-cyber/ggmprogram` 연결
2. Production branch: `main`, build command: `npm run deploy` (또는 Cloudflare 기본 Wrangler deploy 설정), root directory: `/`
3. Worker 이름이 `ggm-ops`인지 확인
4. 기존 `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET` **Secrets**, `GGM_AUTH` KV 바인딩 유지/확인
5. **Cloudflare Access 전체 Traffic 보호가 유지되는지 검증**. 이 Worker는 네트워크 경계의 Access 정책을 신뢰하므로 공개 배포 금지.
6. 배포 후 `https://ggm-ops.planus253.workers.dev/`에서 조회 테스트

Cloudflare 연결 전에는 GitHub에 코드만 반영되며 운영 Worker에는 즉시 적용되지 않습니다. 기존 수동 배포 Worker를 덮어쓰기 전에 KV/Secrets/Access가 연결된 상태인지 점검하세요.

## API
- `GET /api/status`: 연결 여부
- `GET /api/orders?days=30&offset=0&limit=50`: 주문 목록. 날짜는 KST 기준.
- `GET /api/orders/{order_id}/items`: 주문 상품 상세 (주문 읽기권한)
- `GET /oauth/start`: 재연결
- `GET /oauth/callback`: 인증코드 수신 및 토큰 저장

**보안:** Client Secret, 토큰, 고객 개인정보는 GitHub에 저장하지 않습니다. 개발 프리뷰를 공개 배포하지 마세요. OAuth KV는 최종 버전에서 D1/Durable Objects 기반 직렬화 및 장기 모니터링 보강 예정입니다.

## 기존 코드 백업
[backup/pre-rebuild-2026-11-16](https://github.com/jyhome1228-cyber/ggmprogram/tree/backup/pre-rebuild-2026-11-16)
