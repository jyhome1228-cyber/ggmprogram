# 건강미 배송관리 (GGM Shipping Manager)

건강미 쇼핑몰 `ggmspa`의 카페24 주문·배송·송장정보를 조회하는 내부 관리자 프로젝트입니다.

## 사용하는 서비스
- **GitHub Pages**: 관리자 웹 화면
- **Firebase**: Authentication, Cloud Functions, 서버 전용 Firestore 토큰 저장
- **카페24 Admin API**: 실제 주문·배송정보

Vercel, Cloudflare, Cloud Shell 및 별도 배포 서비스는 사용하지 않습니다.

## 현재 구현
- 웹 관리자 화면 / Firebase 이메일 로그인
- 카페24 OAuth 운영자 승인 및 토큰 갱신 서버 코드
- 주문기간별 조회 / 주문별 송장조회 / 송장 누락 의심 검사
- GitHub Pages 화면 배포 워크플로 유지

**실제 Cloud Functions 서버 배포, 운영자 OAuth 승인, 실주문 조회 성공은 아직 확인되지 않았습니다.**
샘플 주문은 실제 주문으로 표시하지 않습니다. 송장 미등록은 미출고 확정이 아닙니다.

## Firebase API 서버 직접 배포
반복 실패한 GitHub Actions의 Firebase Functions 배포 워크플로는 제거했습니다.
API 서버는 Firebase CLI에서 **관리자 본인 계정으로 1회 배포**합니다.
명령어와 보안 주의사항은 [연동 안내](docs/CAFE24_SETUP.md)에 정리했습니다.

```bash
npm install
npm run build
npm run deploy:api
```

배포 전에는 Firebase CLI 로그인, 서버 비밀키 등록 및 런타임 매개변수 설정이 필요합니다.
**배포 명령만으로 비밀키나 OAuth 승인이 자동으로 완료되지는 않습니다.**

## 보안
과거 대화에 노출된 Google 서비스 계정 개인키와 카페24 Client Secret은 폐기·교체 후 사용해야 합니다.
비밀키나 고객 주문 엑셀을 공개 GitHub 또는 프런트엔드 코드에 올리지 마세요.
