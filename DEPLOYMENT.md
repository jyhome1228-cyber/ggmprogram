# GitHub 자동 배포 안내 (GGM OPS)

이 저장소는 기존 Cloudflare Worker **`ggm-ops`** 에 배포됩니다. GitHub Pages가 아닙니다.

## 최초 1회 설정

GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 아래 두 항목을 등록합니다.

- `CLOUDFLARE_API_TOKEN`: Cloudflare 대시보드에서 생성하는 **Edit Cloudflare Workers** 권한의 최소 범위 API 토큰. 이 값은 **GitHub Secret에만 입력**하고 코드·채팅·스크린샷에 노출하지 않습니다.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID (대시보드에서 확인)

Cloudflare 공식 안내: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

설정 후 **Actions → Deploy GGM OPS to Cloudflare → Run workflow** 를 실행하세요. 이후 `main`에 코드를 push하면 자동 배포됩니다.

## 기존 설정 보존

이 Workflow는 `wrangler deploy`를 통해 동일 이름의 기존 Worker를 배포합니다.

배포 후 Cloudflare에서 아래 환경 구성이 그대로 있는지 반드시 확인합니다.
- **Secrets**: `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET`
- **KV**: `GGM_AUTH` → `ggm-ops-auth`
- **Access**: 전체 트래픽 보호 정책
- **Worker URL**: https://ggm-ops.planus253.workers.dev/

현재 인증 토큰은 기존 KV에 저장됩니다. 저장소 내에 Client Secret, OAuth token 또는 개인 고객정보를 넣지 않습니다.

## CI/CD 관련 주의

Cloudflare 대시보드 자체 GitHub 통합에 '연결 끊김'이 표시되어도 **GitHub Actions는 위 API 토큰으로 별도 인증**하기 때문에 실행할 수 있습니다. 중복 빌드를 피하려면 나중에 작동하지 않는 Cloudflare 기본 Git 빌드를 꺼둘 수 있습니다.

**GitHub로 코드가 올라갔다는 사실만으로 Cloudflare에 실제 배포됐다는 뜻은 아닙니다.** Actions에서 녹색 완료를 확인하고 실제 사이트도 확인해야 합니다.
