# 건강미 CS Manager — GitHub 전용

- 메인 화면: https://jyhome1228-cyber.github.io/ggmprogram/
- OAuth 초기 인증: https://jyhome1228-cyber.github.io/ggmprogram/oauth.html
- 주문 집계 자동화: GitHub Actions > Cafe24 GitHub-only Order Sync

## 구현 상태

GitHub Pages에는 **개인정보 없는 제품별 주문 집계**만 게시합니다. 고객명, 전화번호, 주소, 주문번호, 송장번호는 절대 공개 파일에 저장하지 않습니다.

카페24는 Client ID/Secret만으로 주문 조회가 불가능합니다. 쇼핑몰 관리자에게 OAuth 동의를 받은 후 authorization code를 한 번 교환해야 refresh token이 발급됩니다.

## 최초 인증 (한 번만)

1. 카페24 개발자센터 앱 설정의 Redirect URI 목록에 다음 URL 추가: `https://jyhome1228-cyber.github.io/ggmprogram/oauth.html`
2. GitHub Pages `oauth.html` 접속 → 공개 Client ID 입력 → 카페24 관리자 동의
3. 돌아온 페이지에서 인증코드 복사 → **1분 내에** GitHub Actions의 `Cafe24 GitHub-only Order Sync` → `Run workflow` → `oauth_code` 입력 후 실행
4. 작업 성공 시 최근 7일 제품별 집계가 공개 화면에 표시됩니다. 이후 매시간 자동 갱신합니다.

GitHub Secrets는 기존 `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET`, `CAFE24_MALL_ID`, `FIREBASE_SERVICE_ACCOUNT_GGMAPI`를 재사용합니다. Firebase 함수·데이터베이스·Cloud 서비스를 호출하지 않습니다. 마지막 비밀값은 GitHub Actions 내부에서 암호화 키 재료로만 사용하며, 갱신 토큰은 GitHub 저장소의 `data/oauth-token.enc`에 AES-GCM 암호문으로만 보관합니다.

> 참조: GitHub Actions 실행 대기시간 때문에 인증코드가 1분 내에 교환되지 못할 수 있습니다. 그때는 카페24 승인을 다시 받아야 합니다.

## 미구현/주의

- 현재 **실제 OAuth 인증/주문 조회 성공 확인 전**입니다.
- 공개 페이지에서 고객별 주문 상세·배송조회·CS 메모는 지원하지 않습니다. 개인정보 보호가 필요한 이 기능은 로그인/서버 접근통제를 별도로 구현해야 합니다.
- 엑셀용 CSV로 제품별 주문건수/수량만 다운로드합니다. 결제금액은 계산하지 않습니다.
- 최근 7일 동안 1,000건 이상이면 부분집계 게시를 방지하기 위해 실패시킵니다.
- 운영 전 기존에 노출된 카페24 Client Secret을 재발급해야 합니다.
