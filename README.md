# 건강미 배송관리 (GGM Shipping Manager)

## 목적
카페24 쇼핑몰 `ggmspa`의 **실제 주문과 송장정보 조회**를 먼저 구현합니다.
배송 누락은 주문별 송장 미등록 의심 건으로 표시하되 미출고 확정으로 취급하지 않습니다.

## 확정한 구성 — 세 가지 서비스만
- **GitHub Pages:** 관리자 웹 화면 `/ggmprogram/manage.html`
- **Firebase (`ggmapi-e15be`):** 이메일 로그인, Cloud Functions API 서버, OAuth 토큰 저장용 Firestore
- **카페24:** 주문과 배송 정보의 원본

Vercel, Cloudflare, Cloud Shell 및 추가 호스팅은 사용하지 않습니다.

## 현재 코드
- `public/manage.html` — 유일한 실주문 조회 화면. 로그인 → 연결상태 → 운영자 승인 → 주문 조회 → 송장 조회
- `src/App.tsx` — 위 조회 화면으로 이동하는 진입 페이지
- `functions/index.js` — 관리자 인증, 카페24 OAuth, 주문/송장 조회 및 송장 미등록 점검
- `.github/workflows/deploy.yml` — GitHub Pages 정적 화면 배포
- `.github/workflows/firebase-functions.yml` — **수동으로만** Firebase Functions 배포

이전 샘플 대시보드는 폐기했습니다. Firebase Functions 배포와 카페24 OAuth 운영자 승인이 완료되지 않았다면 **실제 주문은 표시되지 않습니다**.

## 실제 조회 활성화 순서
1. Firebase Functions 배포 성공 확인 (GitHub Actions의 `Deploy Firebase Cafe24 API`).
2. 카페24 Redirect URI 등록: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`.
3. 관리자 화면 `https://jyhome1228-cyber.github.io/ggmprogram/manage.html`에 로그인.
4. **카페24 최초 승인** → 쇼핑몰 운영자 동의.
5. 기간을 선택하여 주문 10~20건 조회, 주문별 송장조회 검증.

## 반복되는 403 오류에 대해
GitHub 서비스 계정 JSON에 해당하는 **실제 계정**이 Google Cloud에서 배포 권한을 갖지 못하면 배포할 수 없습니다.
이 문제는 프론트엔드 코드 수정, Firebase API 키 재입력 또는 카페24 앱 권한 설정으로 해결되지 않습니다.
앱 코드의 오류와 IAM 오류를 구분해 로그에서 확인해야 합니다.

## 보안
- 카페24 Client Secret, OAuth 토큰, Google 서비스 계정 JSON을 **커밋하지 마세요**.
- 과거 채팅/스크린샷에 노출된 비밀키는 폐기·교체하세요.
- Firestore 보안 규칙은 직접 접근 차단을 유지합니다. 서버 Admin SDK만 제한된 문서에 접근합니다.
- 현재 주문·배송 API는 읽기 전용입니다. 실제 송장 등록이나 배송처리는 아직 지원하지 않습니다.

## 개발
```bash
npm install
npm run dev
npm run build
```
