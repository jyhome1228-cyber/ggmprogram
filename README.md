# 건강미 배송관리 프로그램 (GGM Shipping Manager)

건강미 카페24 주문·배송 누락을 검증하기 위한 내부 관리자 웹사이트 초기 버전입니다.

## 현재 구현 상태

- React + TypeScript + Vite 기반의 반응형 관리자 UI
- 대시보드, 전체 주문, 누락 검사, 송장 관리, 배송 이력, 연동 설정 메뉴
- 샘플 주문 6건에 대한 검색/상태 필터, 누락·중복 검증 기초 규칙
- CSV 샘플 내보내기
- Firebase 연동을 위한 초기 구성
- **실제 고객 데이터 연결, 송장 업로드, 카페24 API 연동, 관리자 인증, 배포는 아직 하지 않았습니다.**

> 화면에 표시되는 주문은 모두 가상 데이터입니다. CSV 다운로드도 샘플 자료에 한정됩니다.

## 로컬 실행

```bash
npm install
npm run dev
npm run build
```

## Firebase 준비

1. Firebase Console에서 프로젝트 생성, Hosting 활성화
2. Authentication 로그인 공급자 설정 및 관리자를 위한 서버 권한검증 설계
3. `.env.example`을 참고해 로컬 `.env.local` 생성 (클라이언트 Firebase 설정만)
4. Cloud Functions와 Secret Manager에 **카페24 Client Secret, Access/Refresh Token** 저장
5. OAuth 콜백 엔드포인트 배포 후 카페24 개발자센터의 Redirect URI 등록
6. Firestore 보안 규칙을 관리자 역할 기반으로 수정하고 필요한 데이터만 수집

`firestore.rules`는 의도적으로 모든 읽기/쓰기를 차단합니다. 관리자 인증과 권한 모델 완성 전에 규칙을 개방하지 마세요.

## 카페24 연결 설계

- 주문 읽기: `mall.read_order` 권한으로 실제 배송 대상 주문을 페이징 조회
- 배송 설정 읽기: `mall.read_shipping` (필요할 때만)
- 실송장 반영: 지원 API와 권한을 재확인하고 별도 관리자 확인 단계 후 활성화
- 주문/발주/송장 세 데이터 집합을 주문품목 기준으로 비교하고 합배송·부분취소를 별도 처리
- Webhook 이벤트 수신 + 주기적 재동기화로 누락 최소화

⚠️ 이전에 채팅 캡처에 노출된 모든 카페24 비밀키와 Webhook 인증정보는 교체 후 사용하세요. GitHub에 키 또는 실고객 엑셀을 커밋하면 안 됩니다.

## 배포

Firebase Hosting을 설정한 다음 `npm run build`와 `firebase deploy --only hosting`으로 배포합니다. 배포 전 실제 관리자 인증을 구현하고 공개 접근을 차단해야 합니다.

## 저장소 공개 범위

실고객 데이터를 다루기 전 GitHub 저장소를 **Private**으로 전환하는 것을 권장합니다.
