## GitHub에서 직접 배포하는 방법 (Mac 터미널 불필요)

`.github/workflows/firebase-functions.yml`을 추가했습니다. GitHub Actions의 `Deploy Firebase Cafe24 API` 워크플로를 수동 실행할 수 있습니다.

**계정 소유자가 처음 한 번만 설정할 것**

GitHub `Settings > Secrets and variables > Actions`의 Repository secrets에 다음 항목을 등록합니다.

- `FIREBASE_SERVICE_ACCOUNT_GGMAPI`: `ggmapi-e15be` 배포에 필요한 최소 권한을 가진 Google Cloud 서비스 계정 JSON 전체. GitHub에 코드로 커밋하거나 채팅으로 보내지 마세요.
- `CAFE24_CLIENT_ID`: 카페24 앱 Client ID.
- `CAFE24_CLIENT_SECRET`: **재발급한** Client Secret.
- `CAFE24_MALL_ID`: 쇼핑몰 ID.
- `GGM_ADMIN_UID`: Firebase Authentication에 등록된 관리자 UID.

Google Cloud의 서비스 계정에는 Cloud Functions/Run 배포, 빌드, 서비스 계정 사용, Firebase/Secret Manager 관련 **필요한 최소 권한**을 프로젝트 보안 정책에 맞춰 부여해야 합니다.

이후 GitHub `Actions > Deploy Firebase Cafe24 API > Run workflow`를 실행하면 secrets provisioning 및 Functions 배포를 시도합니다. 필요한 Cloud APIs나 IAM 권한이 빠졌다면 Actions 로그에 오류가 출력되므로 그 오류를 기준으로 보완해야 합니다. **코드가 추가됐다고 실제 서버가 자동 배포된 것은 아닙니다.**

# 건강미 실주문 / 배송 조회 연동 체크리스트

프로젝트: Firebase `ggmapi-e15be`, GitHub `jyhome1228-cyber/ggmprogram`.

현재 **코드만 준비**된 상태입니다. Firebase Functions 배포, 카페24 앱 승인, 관리자 계정 설정이 완료되기 전에는 실제 데이터가 나타나지 않습니다.

## 1. Firebase 콘솔

1. Blaze 요금제와 결제 계정 활성화 (예산 알림 설정)
2. Authentication > 사용자에서 관리자 이메일 계정 생성
3. 해당 사용자의 **UID** 확인 (비밀번호나 토큰을 채팅으로 전송하지 않기)
4. Authentication > 설정 > 승인된 도메인에 `jyhome1228-cyber.github.io` 추가
5. Firestore 규칙은 `allow read, write: if false`로 유지 (Admin SDK는 서버에서 접근)
6. Cloud Functions를 배포하려면 Firebase CLI 및 해당 프로젝트의 배포 권한이 필요

## 2. 카페24 비밀키

이전 채팅 캡처에 노출된 Client Secret, Service Key, Front API Key, Webhook 인증정보는 교체하고 노출된 키는 사용하지 말 것.

```bash
npm install -g firebase-tools
firebase login
firebase use ggmapi-e15be
firebase functions:secrets:set CAFE24_CLIENT_ID
firebase functions:secrets:set CAFE24_CLIENT_SECRET
cd functions && npm install && cd ..
firebase deploy --only functions
```

배포 과정에 요청되는 값:

- `CAFE24_MALL_ID`: 카페24 실제 쇼핑몰 ID
- `GGM_ADMIN_UID`: Firebase Authentication에서 생성한 관리자 UID

`functions/index.js`는 카페24 Secret과 운영자 UID를 서버에서만 읽습니다.

## 3. 카페24 개발자센터

앱의 **쇼핑몰 운영자 권한**에서 `mall.read_order` 선택.

- App URL: `https://jyhome1228-cyber.github.io/ggmprogram/`
- Redirect URI: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`

**주의:** URL은 Cloud Functions 배포 성공 후 실제로 발급된 도메인과 일치해야 합니다. URI를 미리 등록해도 Functions 배포 전에는 작동하지 않습니다.

## 4. 조회 화면

- 사이트: `https://jyhome1228-cyber.github.io/ggmprogram/manage.html` (GitHub Pages Actions 배포 전제)
- Firebase 관리자 이메일로 로그인
- '연결 상태 확인' → '카페24 최초 승인' → 카페24 운영자 동의
- '주문 새로고침'으로 주문 목록 조회
- 주문의 '송장 조회' 버튼으로 부분배송을 포함한 배송정보 조회

조회 API:
- `cafe24Status`: 연동 저장 여부
- `cafe24Connect`: 관리자 인증 후 OAuth 시작 URL
- `cafe24Callback`: OAuth 콜백, 토큰 서버 저장
- `cafe24Orders`: 읽기 전용 주문목록
- `cafe24Shipments`: 읽기 전용 개별 주문 배송정보

## 5. 운영 전 필수 검증

- 실제 앱 OAuth 승인 후 주문 조회 200 응답 확인
- 기간별 조회·페이지 이동 및 주문 건수 대조
- 부분 배송·합배송·취소 주문에 대한 누락 검증
- Refresh Token 갱신 로직의 동시성 및 만료 처리
- 실제 고객정보 접근 로깅/권한 관리/개인정보 보존 정책
- 배포된 관리자 화면은 외부 누구나 접근 가능한 URL이므로 **서버 UID 권한 검증을 우회하지 않도록 유지**

이번 단계는 **조회 전용**이며 송장 생성·수정, 배송 상태 변경 및 엑셀 발주 대조는 구현되지 않았습니다.
