# 건강미 CS Manager — 정리된 구성

## 접속
- 관리자 대시보드: https://jyhome1228-cyber.github.io/ggmprogram/
- 전체 주문번호 검색: https://jyhome1228-cyber.github.io/ggmprogram/orders.html
- CSV 수동 주문조회(예비 기능): https://jyhome1228-cyber.github.io/ggmprogram/private-orders.html

## 꼭 필요한 파일
- `index.html`: 기존 제품 집계·운영 화면
- `orders.html`: 암호화된 전체 주문번호 검색 및 CSV 다운로드
- `scripts/cafe24-sync.mjs`: 단일 수집 프로그램 (카페24 OAuth 갱신 → 최근 30일 주문 → 주문번호 누적 → 제품 집계)
- `.github/workflows/cafe24-github-only.yml`: 수동 실행 워크플로 1개
- `data/oauth-token.enc`: 기존 OAuth 토큰의 암호화 파일 (삭제 금지)
- `data/summary.json`: 공개 가능한 제품·날짜별 집계
- `data/orders-private.enc`: **최초 수집 성공 시 생성**되는 암호화 주문 상세 파일

## 현재 상태
- 기존 카페24 주문 84건이 포함된 `data/summary.json` (2026-11-09) 보존
- 주문번호를 포함한 비공개 파일은 아직 없음 → 실제 주문번호 조회 성공 **미검증**
- 복잡한 자동 과거수집 및 중복 테스트 워크플로 제거
- 반복적인 실패 메시지를 피하기 위해 GitHub Actions의 push/정기 실행을 **일시 중단**
- 주문번호 수집이 한 번 정상 검증된 뒤 정기 실행 재활성화 예정

## 최초 실행
1. GitHub Secrets에 `GGM_ORDER_VIEW_PASSWORD`가 있는지 확인. 없으면 16자 이상의 **새 비밀번호**를 등록. 이 값은 카페24 Client Secret이 아닌, 주문조회 암호화용 별도 비밀번호임
2. GitHub Actions → **Cafe24 Order Sync** → Run workflow (모든 입력칸 비운 채 실행)
3. 초록색 체크가 표시되면 `data/orders-private.enc` 생성 여부 확인
4. 주문번호 검색 페이지에서 **동일한** 조회 비밀번호를 입력하면 주문내역 확인 가능

주문번호 누적 파일과 주문자 정보는 암호화해서 저장하며, CSV 다운로드는 사용자의 브라우저에서 이뤄집니다. 강한 비밀번호를 사용하더라도 공개 GitHub Pages에 암호문이 게시되므로 정식 개인정보 시스템의 보안을 대체하지는 않습니다.

## 과거 주문
수동 실행 시 `history_start`, `history_end`(YYYY-MM-DD)를 지정하면 한 번에 최대 90일씩 조회해 기존 주문번호에 병합합니다. 전체 과거 주문을 자동으로 가져온 상태는 아닙니다.

## 문제 발생 시
- `SYNC_VIEW_PASSWORD`: GitHub Secret `GGM_ORDER_VIEW_PASSWORD` 확인
- `SYNC_TOKEN_KEY`: 기존 토큰을 암호화한 Client Secret·서비스 계정 키와 현재 Secrets가 다른 상태. **암호문 삭제하지 말 것**
- `SYNC_OAUTH`: 카페24 OAuth 재인증 또는 토큰 갱신 문제
- `SYNC_ORDERS`: 카페24 실제 주문 조회 API 오류
- `SYNC_ARCHIVE_PASSWORD`: 주문조회 비밀번호가 이전 암호화 파일과 다름. **이전 비밀번호 복원 필요**

고객 이름·주소·연락처·송장번호가 주문 목록 응답에서 빠져 있으면 화면에 값을 만들어 넣지 않습니다. 정확한 배송 누락 판정은 후속 API 검증 과제입니다.
