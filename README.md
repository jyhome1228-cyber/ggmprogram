# 건강미 CS Manager — 주문번호 전체 조회

## 운영 주소
- [대시보드](https://jyhome1228-cyber.github.io/ggmprogram/)
- [전체 주문번호 조회](https://jyhome1228-cyber.github.io/ggmprogram/orders.html)

## 현재 구현
- 카페24 API에서 **주문번호**, 주문일, 상품·옵션·수량, 주문상태, 조회 가능한 수령인·배송 관련 필드를 수집
- 기존 주문번호와 새 주문번호를 병합하고 중복 제거. 브라우저에서는 검색, 날짜 필터, 상태 필터, 주문 상세, CSV 다운로드
- 기본 동기화는 최근 30일을 매시간 다시 조회해 주문 변경사항을 갱신
- 과거 주문은 GitHub Actions의 `history_start` / `history_end`를 설정해 **최대 180일씩** 조회하고 기존 목록에 병합. 이미 확인한 현재 대시보드 집계는 변경하지 않음
- 주문번호 및 고객·배송정보가 들어 있는 파일은 `data/orders-private.enc`에 AES-256-GCM 암호화하여 저장. 공개 JSON에는 주문번호나 고객정보를 저장하지 않음

## 처음 1회만 필요한 설정

1. [GitHub Actions Secrets](https://github.com/jyhome1228-cyber/ggmprogram/settings/secrets/actions)에 `GGM_ORDER_VIEW_PASSWORD` 생성. **추측하기 어려운 16자 이상의 임의 비밀번호**를 설정하고 별도로 보관하세요. 비밀값은 채팅에 공유하지 마세요.
2. [Cafe24 GitHub-only Order Sync](https://github.com/jyhome1228-cyber/ggmprogram/actions/workflows/cafe24-github-only.yml)에서 **Run workflow** 한 번 실행. 기존 Client ID/Secret과 토큰을 재사용하므로 정상적인 경우 OAuth 인증은 반복할 필요가 없습니다.
3. 자동 수집이 성공하면 [전체 주문번호 조회](https://jyhome1228-cyber.github.io/ggmprogram/orders.html)에서 같은 비밀번호를 입력하여 조회합니다.

## 유의사항
- 설정한 비밀번호를 변경하면 이전 암호화 파일을 열 수 없으므로, 먼저 복호화·재암호화 절차가 필요합니다.
- GitHub Pages에 저장되는 암호문도 공개 다운로드가 가능하므로 강력한 비밀번호가 필수입니다. 공용 PC에서 사용하지 마세요. 정식 다중 사용자 운영에는 로그인된 비공개 서버가 권장됩니다.
- 최초 저장되는 목록은 **최근 30일**입니다. 더 과거의 전체 주문번호는 기간별 과거 수집이 완료되어야 표시됩니다. 카페24 API가 조회를 허용하지 않는 오래된 주문은 CSV 이전도 고려해야 합니다.
- 일부 주문의 수령인·배송주소·송장정보는 카페24 주문목록 API 응답에 없을 수 있으며 그 경우 빈칸으로 남깁니다. 배송누락 확정 로직은 아직 구현되지 않았습니다.
- 현재 데이터 수집 성공 여부를 확인하기 전에는 주문번호 조회 완료라고 단정할 수 없습니다.
