# GGM OPS Cloudflare 배포

배포 방식: **Cloudflare Workers Builds (GitHub 기본 연결)**

- Cloudflare Worker: `ggm-ops`
- GitHub 저장소: `jyhome1228-cyber/ggmprogram`
- 브랜치: `main`
- 빌드 명령: 비움
- 배포 명령: `npx wrangler deploy`
- 프로젝트 루트: `/`

GitHub 저장소의 새 커밋을 Cloudflare가 감지하면 자동 빌드 및 배포합니다. 기존에 등록했던 GitHub Actions 중복 배포는 제거했습니다.

배포 여부는 Cloudflare > Workers & Pages > ggm-ops > **배포(Deployments)** 에서 최근 기록을 확인합니다. GitHub에 커밋이 있어도 Cloudflare 배포 내역에 보이지 않으면 운영 사이트가 갱신된 것이 아닙니다.

배포 전후 보존할 설정:
- Secret: `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET`
- KV binding: `GGM_AUTH` → `ggm-ops-auth`
- Cloudflare Access: 전체 Traffic 보호
- Worker URL: https://ggm-ops.planus253.workers.dev/

토큰과 고객 개인정보는 GitHub에 기록하지 않습니다. 배포 후 API 401이 발생하면 기존 OAuth 토큰과 앱 권한/갱신 흐름을 확인합니다. 주문 수정 및 배송 처리는 현재 구현하지 않았습니다.
