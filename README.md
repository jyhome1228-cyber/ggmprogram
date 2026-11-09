# 건강미 CS Manager V1

카페24 주문 API 기반 제품별 주문 현황 / 주문 상세 / 송장 확인 / 엑셀 다운로드 기초 관리자.

## 실행

```bash
npm install
npm run dev
```

## 배포

GitHub 저장소를 Vercel 프로젝트에 연결하고 환경변수를 등록합니다.

- `ADMIN_PASSWORD`: 관리자 접근 비밀번호 (반드시 설정)
- `CAFE24_MALL_ID`: 카페24 몰 ID
- `CAFE24_ACCESS_TOKEN`: 카페24 OAuth 액세스 토큰 (서버 전용)
- `CAFE24_API_VERSION`: 기본 `2026-06-01`

**실제 API 키, 고객 데이터, 주문 엑셀을 GitHub에 올리지 마세요.**

## 구현 범위

- 카페24 Admin Orders API 조회: `embed=items,buyer,receivers`
- 제품·옵션별 판매집계, 개별 주문 목록, 기간 검색, XLSX 다운로드
- 송장이 없는 품주 확인 목록 (배송누락 확정 아님)
- 로그인: ADMIN_PASSWORD 서버 검증 (초기 검증용, 정식 운영 시 인증 전환 필수)

## 후속 구현 전 확인

- 액세스 토큰 자동 갱신: **미구현**. 현재 토큰 만료 시 조회가 중단됩니다.
- 1,000건 초과 페이지 처리 및 기간 자동 분할: **미구현**.
- 주문 가격은 품주 단가×수량 참고값. 실제 매출/취소/부분환불 회계집계 **미구현**.
- 송장 필드/부분배송 API 응답을 실제 상점 데이터로 검증 필요.
- CS 기록과 직원 공동 DB: **미구현**.
- Vercel 환경변수 설정 전 실제 데이터 연결 불가.

## 정보보호

GitHub Pages 정적 호스팅 대신 Vercel 서버 함수에서 API를 호출합니다. 브라우저에는 Client Secret/Access Token을 전달하지 않습니다. 관리자 비밀번호는 최초 구현 편의를 위한 임시 방식이므로 정식 운영 전 Firebase Authentication 등의 세션 인증과 접속 기록이 필요합니다.
