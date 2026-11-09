# 건강미 배송관리 — Firebase 단일 배포 구조

## 무엇을 유지하나
- 프론트엔드: GitHub Pages (`ggmprogram`)
- 관리자 로그인: Firebase Authentication (`ggmapi-e15be`)
- 데이터: 카페24 Admin API 주문/배송 조회
- 백엔드: Firebase Cloud Functions
- 쇼핑몰: `ggmspa`

**Cloudflare, Cloud Shell, 추가 데이터베이스는 사용하지 않습니다.**

## 무엇을 바꿨나
이전 워크플로는 매번 Firebase CLI `functions:secrets:set`을 호출하여
Service Usage API 사전 권한 검사에서 403 오류가 발생했습니다.

현재 GitHub Actions는 Google Cloud SDK의 Secret Manager 명령으로
서버 비밀키를 등록한 뒤, `firebase deploy --only functions`만 실행합니다.
실제 Firebase Functions 배포에도 계정 권한이 필요하며, 이 변경이 IAM
문제를 전부 해결한다고 보장하지 않습니다.

## 단 한 번 필요한 보안 설정
GitHub Repository Secrets:
- `FIREBASE_SERVICE_ACCOUNT_GGMAPI` — **유효하고 노출되지 않은** 배포 서비스 계정 JSON
- `CAFE24_CLIENT_ID`
- `CAFE24_CLIENT_SECRET` — 노출된 키를 재발급한 값
- `CAFE24_MALL_ID` — `ggmspa`
- `GGM_ADMIN_UID` — 등록된 Firebase 관리자 UID

배포용 서비스 계정에는 Secret Manager의 비밀키 버전 추가·조회 및 Firebase Functions
배포에 필요한 IAM 권한이 있어야 합니다. 권한은 Google Cloud 프로젝트 소유자가
관리하며, GitHub 코드를 수정하는 것만으로 부여되지 않습니다.

## 실행
GitHub → Actions → `Deploy Firebase Cafe24 API` → Run workflow (main).

배포 성공 후:
1. 카페24 개발자센터 App URL: `https://jyhome1228-cyber.github.io/ggmprogram/`
2. Redirect URI: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`
3. 쇼핑몰 운영자 Order 읽기 권한 승인
4. `https://jyhome1228-cyber.github.io/ggmprogram/manage.html`에서 Firebase 관리자 로그인
5. 연결 상태 확인 → 카페24 최초 승인 → 실제 주문 조회

배포 성공과 카페24 OAuth 운영자 승인은 **다른 단계**입니다.

## 운영 전 주의
현재는 조회 전용이며 배송누락 검사는 '송장 미등록 의심'으로만 표시합니다.
실제 출고 누락은 출고업체 발주내역 및 택배사 접수내역과 교차 검증해야 합니다.
노출된 개인키는 즉시 폐기하고, 비밀키는 채팅이나 공개 GitHub에 입력하지 않습니다.
