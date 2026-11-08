# 건강미 카페24 연동 작업 순서

## 현재 상태
Firebase 프로젝트: `ggmapi-e15be`. GitHub Pages는 샘플 데이터를 보여주는 공개 데모이며, **실주문 데이터는 아직 연결되지 않았습니다**.

## 1. Cloud Functions 배포 전
- Firebase Blaze 요금제/결제 계정 연결 (사용량 기반 과금).
- Firebase CLI 로그인 및 `firebase use ggmapi-e15be`.
- `cd functions && npm install`
- `firebase functions:secrets:set CAFE24_CLIENT_ID`
- `firebase functions:secrets:set CAFE24_CLIENT_SECRET`
- Firebase 환경 매개변수 `CAFE24_MALL_ID`, `GGM_ADMIN_UID`는 배포 과정에서 요청받으면 입력. `GGM_ADMIN_UID`는 Firebase Authentication에서 확인한 관리자 UID만 허용.
- 이전 캡처에 노출된 카페24 비밀키는 반드시 재발급 후 설정.

## 2. 배포
`firebase deploy --only functions`

카페24 개발자센터의 Redirect URI는 다음 **실제 배포 URL**을 확인하여 등록해야 합니다.
`https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`

## 3. 인증
관리자 Firebase ID 토큰을 Authorization: Bearer로 제출하여
`GET /cafe24Connect`의 `authorizationUrl`을 얻고, **브라우저**에서 승인합니다.
Callback은 5분 이내의 일회용 state를 확인하고 토큰을 Firestore 서버 전용 문서에 저장합니다.

## 4. 주문 조회
승인 후 관리자 인증을 제출한 `GET /cafe24Orders?limit=20&offset=0` 호출로 조회할 수 있습니다.

## 보안
- Frontend에 Client Secret/Refresh Token을 넣지 않습니다.
- Firestore 공개 읽기/쓰기는 계속 차단합니다.
- Functions 서비스는 외부 HTTP 접근 가능하나 관리자 ID 토큰 검증 후 주문 반환.
- 이 초기 서버는 읽기만 지원합니다. 송장 등록/배송변경은 의도적으로 미구현.
- 운영 전 Refresh Token 동시 갱신 방지, 요청제한, 접근감사, 다중 계정 관리, 비정상 API 응답 대응, 개인정보 최소화/보존 기준을 강화해야 합니다.
- GitHub Pages 공개 데모 화면에 주문 실데이터를 표시하지 마세요. Firebase Auth 권한검증을 포함한 전용 로그인 화면과 연결한 후에만 활성화합니다.
