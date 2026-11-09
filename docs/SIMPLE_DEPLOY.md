# 건강미 Firebase Functions 간단 배포 (대체 경로)

GitHub Actions의 서비스 계정 배포가 계속 HTTP 403으로 실패하면, **Google Cloud 프로젝트 소유자 권한**으로 Cloud Shell에서 단 한 번 배포할 수 있습니다.

1. [Google Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=ggmapi-e15be) 열기
2. 아래 명령어 한 줄 실행 (저장소는 공개 소스, 비밀키는 포함되어 있지 않음):

```bash
git clone https://github.com/jyhome1228-cyber/ggmprogram.git && cd ggmprogram && bash scripts/deploy-cloudshell.sh
```

스크립트가 관리자 UID를 묻고 Firebase CLI가 카페24 Client ID 및 Client Secret을 비공개 입력으로 요청합니다. **이미 노출된 서비스 계정 JSON은 사용하지 않습니다.** Google Cloud Shell은 프로젝트 계정의 권한으로 실행되므로 GitHub 서비스 계정 IAM 문제를 피할 수 있으나, 계정 자체에 배포 권한이 부족하면 별도로 승인해야 합니다.

배포 후 카페24 앱 Redirect URI: `https://asia-northeast3-ggmapi-e15be.cloudfunctions.net/cafe24Callback`

주의: API 서버 배포와 카페24 OAuth 운영자 동의는 별개입니다. 배포 후 관리자 화면에서 카페24 연결을 승인해야 실제 주문이 표시됩니다. 또한 비밀키 재발급은 기존 채팅에 노출된 키의 사용을 중단하는 것이 전제입니다.
