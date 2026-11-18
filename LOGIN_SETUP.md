# GGM OPS 직원 전용 로그인 — 안전한 전환 가이드

## 현재 상태

1. GitHub에는 로그인 화면(`public/login.html`), 직원 계정 관리(`public/accounts.html`), 서버 인증(`src/auth.js`), D1 스키마(`migrations/0001_auth.sql`)가 구현되어 있습니다.
2. **아직 운영 전환되지 않았습니다.** 기존 Cloudflare Access 전체 트래픽 보호를 유지하세요.
3. 카페24 OAuth Secret/KV와 주문·배송 API는 기존 구조를 계속 사용합니다.
4. D1이 준비되고 최종 전환 플래그 `GGM_LOGIN_ENFORCE=true`가 켜지기 전까지 기존 접속 방식이 그대로 유지됩니다.

## 1. D1 데이터베이스 만들기 (Cloudflare 대시보드)

- Cloudflare → Storage & Databases → D1 SQL Database → Create database
- 데이터베이스 이름: `ggm-login`
- 생성 후 **Database ID(UUID)** 를 확인하세요. 이 값은 비밀번호가 아닙니다.
- D1 콘솔의 SQL 실행 창에서 `migrations/0001_auth.sql` 내용을 실행하여 `users`, `sessions` 테이블을 생성합니다.
- 기존 `ggm-ops-auth` KV 네임스페이스를 삭제하거나 이름을 변경하지 마세요.

## 2. Worker와 D1 연결 (중요)

- 기존 Worker `ggm-ops`에 D1 binding 이름 **`AUTH_DB`**, database **`ggm-login`**을 연결합니다.
- GitHub 자동 배포는 `wrangler.jsonc`가 배포 구성을 관리하기 때문에, 새 D1 ID를 확보한 뒤 아래 항목도 Wrangler 구성에 반영해야 합니다.
- **D1 ID를 확인하기 전에 가짜 ID를 `wrangler.jsonc`에 넣어두면 자동 배포가 실패할 수 있으므로 넣지 않았습니다.**

```json
"d1_databases": [
  {
    "binding": "AUTH_DB",
    "database_name": "ggm-login",
    "database_id": "<CLOUDFLARE_D1_DATABASE_ID>"
  }
]
```

## 3. 초기 관리자 생성

- Worker `ggm-ops` → Settings → Variables and Secrets에서 `GGM_BOOTSTRAP_KEY`를 **Secret**으로 등록
- 값은 **32자 이상 무작위 비밀 문자열**로 만들어야 하며, 채팅·GitHub·스크린샷에 공유하지 마세요.
- `https://ggm-ops.planus253.workers.dev/login.html`을 Cloudflare Access로 로그인한 후 방문
- 최초 관리자 생성 화면에서 비밀키·관리자 아이디(4~32자)·비밀번호(12~128자)를 입력해 생성
- 초기 관리자 생성 뒤 추가 직원은 관리자 계정으로 로그인하여 `/accounts.html`에서 생성
- 권장: 최초 관리자 생성 후 `GGM_BOOTSTRAP_KEY` Secret은 삭제하여 추가 위험을 줄입니다.

## 4. Access를 유지한 채 실제 로그인 테스트

- D1 binding이 배포된 뒤 `GGM_LOGIN_ENFORCE=true`를 Worker 환경 변수로 지정
- **중요:** 플래그를 켜면 모든 정적 페이지와 API가 새 로그인 세션을 확인합니다. D1 연결에 실패하면 503으로 **차단**합니다.
- Cloudflare Access가 켜진 상태에서 `/login.html`로 접속한 뒤 로그인 테스트
- 계정 생성 및 직원/관리자 권한 확인
- 로그아웃 후 `/api/orders`와 `/api/backup/shipping`이 각각 로그인 차단되는지 확인
- 직원 계정으로 주문 조회가 되고, 직원 계정의 **카페24 재인증과 전체 배송 백업은 403**으로 차단되는지 확인
- 관리자 계정으로 계정 발급·접근 차단·백업이 작동하는지 확인
- 다른 브라우저에서 독립적으로 로그인 되는지 확인
- 새 세션 쿠키는 HttpOnly/Secure/SameSite=Lax이며 유효 기간 30일, 만료 시 다시 로그인

## 5. Cloudflare Access 정책 전환

**이 단계는 1~4번 테스트가 끝난 다음에만 진행하세요.**
- 기존 `ggm-ops` Access 정책을 제거/변경하기 전에 D1 binding, `GGM_LOGIN_ENFORCE=true`, 서버 API 인증 검증을 모두 확인
- Cloudflare Access 전체 트래픽 보호가 꺼진 뒤에도 자체 로그인 시스템이 모든 페이지와 API 요청을 검사하는지 새 브라우저로 재확인
- Cloudflare 계정 자체는 나인웍스 계정으로 유지합니다. Cloudflare 계정과 직원 로그인 계정은 서로 독립입니다.
- 전환 전 Cloudflare WAF/Rate Limiting으로 `/auth/login`에 추가 요청 제한을 설정하는 것을 권장합니다.

## 안전 지침

- 이 시스템은 주문자명, 전화번호, 배송지 등 개인정보에 접근합니다. 전환 중 외부 접속이 열리지 않도록 검증 완료 전 Access를 해제하지 마세요.
- 고객 데이터/로그인 비밀번호/초기 비밀키/카페24 인증 토큰은 코드 또는 저장소에 절대 저장하지 마세요.
- 현재 관리자 기능은 계정 생성과 차단만 지원합니다. 비밀번호 초기화, MFA, 계정 잠금 해제 및 상세 감사 로그는 추가 개발 대상입니다.
- D1 DB를 만들지 않은 상태에서는 직원 전용 로그인 사용을 강제로 시작하지 않습니다.
