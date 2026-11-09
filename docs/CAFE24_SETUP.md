# 건강미 카페24 연동 — Firebase 직접 배포

## 목표
기존 GitHub Pages 웹사이트 + Firebase Authentication + Firebase Cloud Functions + 카페24 Admin API를 유지합니다.
GitHub Actions를 통해 Firebase 서버를 배포하던 방식은 제거했습니다.

## 최초 1회 배포 (본인 Mac의 터미널)
아래 절차는 개발자 계정이 Firebase 프로젝트 `ggmapi-e15be`의 배포 권한을 가진 경우에만 성공합니다.
Google Cloud IAM 서비스 계정 JSON을 직접 사용하지 않습니다.

```bash
git clone https://github.com/jyhome1228-cyber/ggmprogram.git
cd ggmprogram
npm install
npm install -g firebase-tools
firebase login
firebase use ggmapi-e15be
cd functions && npm install && cd ..
```

서버에만 저장할 카페24 비밀키 등록 (값을 대화나 저장소에 넣지 않기):

```bash
firebase functions:secrets:set CAFE24_CLIENT_ID --project ggmapi-e15be
firebase functions:secrets:set CAFE24_CLIENT_SECRET --project ggmapi-e15be
```

배포 시 Firebase CLI가 `CAFE24_MALL_ID`와 `GGM_ADMIN_UID`를 요청하면 각각 쇼핑몰 ID 및 Firebase Authentication의 관리자 UID를 입력합니다. 이미 설정된 런타임 매개변수는 그대로 유지됩니다.

```bash
npm run deploy:api
```

배포가 성공한 뒤 다음 URL을 확인합니다.

- 서버 상태: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/ggmHealth`
- 카페24 Redirect URI: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`
- 관리자: `https://jyhome1228-cyber.github.io/ggmprogram/manage.html`

관리자 Firebase 로그인 → 카페24 최초 승인 → 주문 조회 순서로 검증합니다.

## 명확한 한계
Firebase Functions는 서버 제품이므로 실제 배포를 생략할 수는 없습니다. Firebase CLI로 직접 배포하면 GitHub Actions에서 발생했던 별도 서비스 계정 권한 경로를 사용하지 않지만, **로그인 계정에도 배포 권한은 필요**합니다.
또한 기존 Google 서비스 계정 키는 채팅에 노출됐으므로 폐기되어야 합니다.

현재는 조회 전용으로, 송장 등록이나 배송 상태 변경은 지원하지 않습니다.
