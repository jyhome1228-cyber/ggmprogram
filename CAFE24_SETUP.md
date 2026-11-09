# 건강미 카페24 API 연결 (Firebase 최소 구성)

GitHub Pages는 화면만 호스팅하고, Firebase Functions 4개만 사용합니다.

## 현재 상황
- 몰 ID: `ggmspa`
- Firebase 프로젝트: `ggmapi-e15be` (Blaze)
- 카페24 Redirect URI: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`
- 화면: `https://jyhome1228-cyber.github.io/ggmprogram/live.html`

## 배포 전 필수
1. 캡처 화면에 노출된 Client Secret을 **재발급**하세요.
2. Firebase 프로젝트에서 **Cloud Firestore 데이터베이스**를 생성하세요 (프로덕션 모드, asia-northeast3 권장). 함수가 토큰을 보관합니다.
3. Firebase CLI로 안전하게 비밀값 3개 설정합니다. **GitHub나 대화에 값을 붙여 넣지 마세요.**

```bash
npm install -g firebase-tools
firebase login
git clone https://github.com/jyhome1228-cyber/ggmprogram.git
cd ggmprogram
firebase functions:secrets:set CAFE24_CLIENT_ID
firebase functions:secrets:set CAFE24_CLIENT_SECRET
firebase functions:secrets:set GGM_ADMIN_PASSWORD
cd functions && npm install && cd ..
firebase deploy --only functions --project ggmapi-e15be
```

- CAFЕ24_CLIENT_ID: 현재 앱의 Client ID
- CAFE24_CLIENT_SECRET: 재발급한 비밀키
- GGM_ADMIN_PASSWORD: 관리자 화면에 사용할 새로운 강한 비밀번호

## 인증
`live.html`에서 관리자 비밀번호 입력 후 **카페24 연결** 선택 → 카페24 동의 → 인증 콜백 → 화면 복귀 → 새로고침.

## 함수
- `cafe24Start`: 관리자 검증 → OAuth 인증 URL, state를 Firestore에 저장
- `cafe24Callback`: state 검증 → 인증 코드 교환 → 토큰 Firestore에 비공개 저장
- `cafe24Orders`: 관리자 비밀번호 검증 → 토큰 자동 갱신 → 주문 조회
- `cafe24Health`: 관리자 비밀번호 검증 → 연결 여부만 표시

## 한계
- 초기 버전: CSV 다운로드, 한 번에 최대 31일/1,000개 주문. 엑셀 XLSX·전체기간 분할조회·배송 상태 고도화는 후속.
- 판매금액은 참고값이며 실결제금액 계산이 아닙니다.
- 직원 공동 운영 전 Firebase Authentication + 세션 쿠키 인증으로 강화해야 합니다.
- 인증 비밀번호를 브라우저 sessionStorage에 보관하므로 공용 PC 사용은 피하세요.
- 카페24 API의 실제 주문 데이터 필드·파라미터는 연결 후 검증해야 합니다.
