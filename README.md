# GGM OPS v2 — 건강미 주문관리 (Phase 1)

카페24 쇼핑몰 `ggmspa`와 연결되는 Cloudflare Workers 기반 **읽기 전용 주문관리 1차 버전**입니다.

## 4차 업데이트 (v0.6) — 선택기간 순차 점검

- 배송관리 화면 `/shipping.html`에서 **선택기간 순차 점검** 버튼 추가
- 기존 8건 단위 API를 순서대로 호출해 최대 **400건**까지 누적 검사. 카페24 API 부하를 고려해 요청 사이 간격 적용
- 진행률 및 누적된 점검 후보 건수 표시, **중단** 버튼 제공
- 확인 필요/관찰/판정 보류 등 점검 결과 필터 제공
- 검색한 결과를 CSV 다운로드 (부분 점검/완료 여부 표시, 수식 인젝션 방지)
- 400건 상한, 요청 실패, 사용자가 중단한 경우 **부분 점검** 표시. 전체 건수를 모두 검사했다고 오인하지 않게 처리
- 개인정보는 브라우저 메모리에서만 처리하며, 새로고침하면 검사 결과가 사라짐
- 정기 자동 검사/상태 저장/알림은 아직 미구현 — 배치 실행과 저장소 설계가 별도로 필요

## 3차 업데이트 (v0.5) — 배송·누락 의심 점검

- `/shipping.html`: 배송 점검 전용 페이지, 최근 3·7·14·30일 주문을 **한 번에 최대 8건** 점검
- `GET /api/shipping-review?days=7&hours=24&offset=0&limit=8`: 카페24 주문 목록과 주문별 배송/송장 API의 실제 응답을 교차 확인
- 결제완료 후 일정 시간 이상 배송전 + 송장 미등록 시 '확인 필요' 후보
- 취소 관련 주문에 송장이 함께 있으면 '취소·송장 동시 존재' 후보
- 배송상태 미제공 또는 송장 API 오류 시 **판정 보류**; 확정적인 누락으로 표시하지 않음
- 24시간 기본 기준은 영업일·휴무일·예약배송을 고려하지 않은 예비 기준
- **자동 스캔/알림, 전체 주문 전수 검사, 자동 배송처리, CS 저장 기능은 아직 없음**
- 조회 전용 / 기존 OAuth Secret, KV, Access 구조 유지

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
