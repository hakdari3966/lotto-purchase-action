# 🎰 동행복권 로또 자동구매

**실제 동행복권 계정으로 로또 6/45를 자동 구매하는 GitHub Action입니다.**

매주 정해진 시간에 GitHub Actions가 실행되어, 실제 동행복권 사이트에 로그인하고 로또를 구매합니다. 구매 결과는 [GitHub Issue](https://github.com/kkd927/lotto-purchase-action/issues/1) 또는 저장소 내 추적 파일로 기록되며, 추첨 후 당첨 여부도 자동으로 확인됩니다.

## ✨ 주요 기능

| 기능 | 설명 |
| --- | --- |
| 🤖 **자동번호 구매** | 게임 수만 정하면 번호는 자동 생성 |
| ✍️ **수동번호 구매** | 내가 원하는 번호를 직접 지정해서 구매 |
| 🔀 **자동 + 수동 조합** | 한 번에 자동과 수동을 섞어서 구매 |
| 🧩 **커스텀 로직** | JS 파일 하나로 나만의 구매 전략을 자유롭게 작성 |
| 💡 **AI 연동** | Gemini API로 추천 번호를 받아 구매하는 예제 포함 |
| 📋 **결과 기록** | 구매 내역이 GitHub Issue 또는 저장소 추적 파일에 자동 정리 |
| 🔔 **텔레그램 알림** | 구매/당첨 결과를 텔레그램으로 알림 (선택) |

## 🚀 바로 시작

> **⚠️ 동행복권 예치금이 미리 충전되어 있어야 구매가 진행됩니다.**
> 예치금이 없으면 워크플로우는 실행되지만 구매에 실패합니다.

> GitHub `Issues`가 꺼져 있어도 구매/당첨 텔레그램 알림과 당첨 확인은 계속 동작합니다. 이 경우 기록은 `.github/lotto-purchase-history.json` 파일에 저장됩니다.

### 방법 1: Fork (가장 간단)

> **📢 참고**: Fork한 저장소는 **public**이므로, **구매 이력(GitHub Issue)이 누구나 볼 수 있습니다.**
> 구매 이력을 비공개로 유지하고 싶다면 아래 **방법 2**를 사용하세요.

1. 이 저장소를 **Fork**합니다.
2. Fork한 저장소의 **Actions** 탭에서 **I understand my workflows, go ahead and enable them**을 눌러 활성화합니다.
3. **Settings > Secrets and variables > Actions > Repository secrets**에서 **New repository secret** 버튼을 눌러 시크릿을 추가합니다. (아래 표 참고)
4. **Actions** 탭에서 `lotto-purchase.yml`의 **Enable workflow**를 누릅니다.
5. 바로 테스트하려면 **Run workflow**를 누릅니다.

### 방법 2: Clone → 내 Private 저장소로 Push

구매 이력을 비공개로 유지하고 싶다면 이 방법을 추천합니다.

1. GitHub에서 **New Repository**를 만들고 **Private**을 선택합니다. (README 추가 체크 해제)
2. 아래 명령어를 실행합니다.

```bash
git clone https://github.com/kkd927/lotto-purchase-action.git
cd lotto-purchase-action

# 위에서 만든 private 저장소로 remote 변경
git remote set-url origin https://github.com/<내-계정>/<내-저장소>.git
git push -u origin main
```

이후 설정은 Fork 방식과 동일합니다. (시크릿 추가 → 워크플로우 활성화)

> **💡 Tip**: Private 저장소의 GitHub Actions는 월 무료 한도(2,000분)가 적용됩니다.
> 이 워크플로우는 1회 실행에 약 1~2분이므로, 매주 실행해도 충분합니다.

### 시크릿 설정

**Settings > Secrets and variables > Actions > Repository secrets > New repository secret** 버튼을 눌러 아래 항목을 하나씩 추가합니다.

| Name | 필수 여부 | 설명 |
| --- | :---: | --- |
| `DHLOTTERY_ID` | ✅ 필수 | 동행복권 로그인 아이디 |
| `DHLOTTERY_PASSWORD` | ✅ 필수 | 동행복권 로그인 비밀번호 |
| `TELEGRAM_BOT_TOKEN` | 선택 | 알림용 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 선택 | 알림용 텔레그램 채팅 ID |
| `TELEGRAM_NOTIFY_PURCHASE` | 선택 | `false`이면 구매 완료 텔레그램 알림을 보내지 않음 |
| `APNS_KEY_ID` | 선택 | iPhone 앱 푸시용 Apple APNs Auth Key ID |
| `APNS_TEAM_ID` | 선택 | Apple Developer Team ID |
| `APNS_BUNDLE_ID` | 선택 | iPhone 앱 Bundle ID. 기본 앱은 `com.bangju.lottostatus` |
| `APNS_PRIVATE_KEY` | 선택 | APNs `.p8` private key 전체 내용 |
| `APNS_DEVICE_TOKEN` | 선택 | iPhone 앱 설정 화면에서 복사한 device token |
| `APNS_USE_SANDBOX` | 선택 | 개발/TestFlight 전에는 `true`, App Store 배포 후에는 `false` |

> **💡 참고**: `GITHUB_TOKEN`은 GitHub가 자동으로 제공하므로 직접 추가할 필요가 없습니다.

## 👥 친구와 독립적으로 쓰기

각 사용자는 아래 항목을 **완전히 따로** 가져야 합니다.

| 항목 | 나 | 친구 |
| --- | --- | --- |
| GitHub 저장소 | 내 `lotto-purchase-action` repo | 친구의 `lotto-purchase-action` repo |
| 동행복권 계정 | 내 `DHLOTTERY_ID`, `DHLOTTERY_PASSWORD` | 친구의 `DHLOTTERY_ID`, `DHLOTTERY_PASSWORD` |
| 알림 채널 | 내 Telegram bot/chat | 친구 Telegram bot/chat |
| 구매/당첨 기록 | 내 GitHub Issues | 친구 GitHub Issues |
| iPhone 앱 설정 | 내 GitHub owner/repo/token | 친구 GitHub owner/repo/token |

친구용 설정 순서:

1. 친구 GitHub 계정에 이 저장소를 Fork하거나, 친구의 Private 저장소로 Clone 후 Push합니다.
2. 친구 저장소의 Actions를 활성화합니다.
3. 친구 저장소 Secrets에 친구의 `DHLOTTERY_ID`, `DHLOTTERY_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`를 등록합니다.
4. 친구 iPhone 앱 설정에서 친구의 GitHub `owner`, `repo`, private repo 접근용 token을 입력합니다.

동행복권 아이디/비밀번호는 iPhone 앱에 넣지 않습니다. 앱은 GitHub Issue에 기록된 구매/당첨/예치금 요약만 읽습니다.

친구 구매 내역은 텔레그램으로 안 받고 당첨 확인만 받고 싶다면, 친구 저장소 Secrets에 `TELEGRAM_NOTIFY_PURCHASE=false`를 추가하면 됩니다. 이 경우 구매 완료 메시지는 건너뛰고, 토요일 당첨 확인/당첨 발생 메시지는 그대로 전송됩니다.

## 📱 iPhone 앱 푸시 알림

iPhone 앱으로 구매/당첨 알림을 받으려면 Apple Developer 계정의 APNs 설정이 필요합니다.

1. iPhone 앱을 실제 기기에 설치합니다.
2. 앱 설정에서 **알림 권한 요청**을 누른 뒤 **디바이스 토큰 복사**를 누릅니다.
3. GitHub Actions Secrets에 `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY`, `APNS_DEVICE_TOKEN`을 등록합니다.
4. 개발 빌드나 TestFlight 전 단계에서는 `APNS_USE_SANDBOX`를 `true`로 둡니다.

APNs Secrets가 없으면 앱 푸시는 건너뛰고, 기존 텔레그램/Issue 기록은 그대로 동작합니다.

## 🔒 비밀번호는 안전한가요?

**안전합니다.** 동행복권 아이디와 비밀번호는 [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)에 저장됩니다.

- Secrets는 **암호화**되어 저장되며, 한 번 등록하면 누구도 다시 볼 수 없습니다.
- 워크플로우 실행 로그에서도 `***`로 자동 마스킹되어 **절대 노출되지 않습니다.**
- Fork한 다른 사람도, 저장소 관리자 본인도 등록된 값을 확인할 수 없습니다.

자세한 보안 정책은 [SECURITY.md](./SECURITY.md)를 참고하세요.

## 🧪 실제 구매 전 드라이런

예치금이 충전된 상태에서 테스트할 때는 먼저 드라이런으로 로그인과 번호 선택까지만 확인하세요. 드라이런은 구매 버튼을 누르지 않고, GitHub Issue나 텔레그램 구매 알림도 만들지 않습니다.

1. GitHub 저장소의 **Actions** 탭으로 이동합니다.
2. `로또 구매 (수동 + 스케줄)` workflow를 선택합니다.
3. **Run workflow**를 누릅니다.
4. `dry-run`은 `true`, `game-count`는 `1`로 둔 뒤 실행합니다.

드라이런 로그에서 정상 동작을 확인한 뒤 실제 구매를 직접 실행하려면 `dry-run`을 `false`로 바꾸고, `purchase-confirmation`에 `BUY`를 입력해야 합니다. 확인 문구가 없으면 수동 실제 구매는 로그인 전 차단됩니다.

## ⏰ 자동화 스케줄

기본 GitHub Actions workflow는 두 번 실행됩니다.

| 한국 시간 | 용도 | 동작 |
| --- | --- | --- |
| 매주 토요일 21:07 | 당첨 확인 | 이전 구매 Issue만 확인하고 텔레그램으로 당첨/낙첨 요약을 보냅니다. 구매는 하지 않습니다. |
| 매주 월요일 09:30 | 구매 | 이전 구매 당첨 여부를 확인한 뒤 새 회차 로또를 5게임 구매하고 텔레그램으로 구매 내역과 예치금 잔액을 보냅니다. |

로또 6/45 추첨은 토요일 20:35에 진행되므로, 당첨 확인 전용 스케줄은 결과 공개 지연과 GitHub Actions 정각 부하를 감안해 21:07로 잡았습니다.

## 🛠️ 워크플로우 예제

기본 워크플로우는 [lotto-purchase.yml](./.github/workflows/lotto-purchase.yml)에 포함되어 있습니다. `workflow-file` 한 줄만 바꿔서 다양한 예제를 실행할 수 있습니다.

```yaml
workflow-file: custom-workflows/01-auto-basic.js
# workflow-file: custom-workflows/02-manual-fixed-numbers.js
# workflow-file: custom-workflows/03-auto-plus-manual.js
```

| 예제 | 설명 |
| --- | --- |
| `01-auto-basic.js` | 자동 10게임까지 구매 |
| `02-manual-fixed-numbers.js` | 고정 번호 수동 구매 |
| `03-auto-plus-manual.js` | 자동 + 수동 조합 구매 |
| `04-gemini-recommendation.js` | Gemini API 추천 번호 구매 |

<details>
<summary><b>나만의 구매 전략 만들기</b></summary>

`purchaseAuto`와 `purchaseManual` API를 조합하면 어떤 전략이든 JS로 작성할 수 있습니다.

```javascript
// 예: 자동 3게임 + 고정번호 수동 2게임
export default async ({ purchaseAuto, purchaseManual }) => {
  await purchaseAuto(3);
  await purchaseManual([
    [3, 11, 19, 25, 33, 42],
    [7, 14, 21, 28, 35, 40],
  ]);
};
```

더 많은 예제와 API 설명은 [custom-workflows/README.md](./custom-workflows/README.md)를 참고하세요.

</details>

## 📊 역대 당첨번호 분석

구매와 별개로, 1회부터 최신 확인 가능 회차까지 당첨번호를 가져와 빈도/최근 추세/미출현/패턴을 분석하고 추천 조합을 출력할 수 있습니다.

```bash
npm run analyze:winning
```

옵션 예시:

```bash
npm run analyze:winning -- --start 900 --recent 100 --recommendations 10
npm run analyze:winning -- --end 1150 --seed my-strategy
```

최근 1년 1등 당첨 게임의 번호 선택 방식(자동/수동/반자동)을 분석하려면 아래 명령을 사용합니다.

```bash
npm run analyze:winning-methods
```

옵션 예시:

```bash
npm run analyze:winning-methods -- --weeks 26
npm run analyze:winning-methods -- --start 1175 --end 1226
```

> 이 기능은 통계 필터일 뿐 당첨을 보장하지 않습니다. 실행해도 복권 구매는 일어나지 않습니다.

## 🔗 링크

- 관리자 대시보드: [`dashboard/index.html`](./dashboard/index.html)
- 커스텀 워크플로우 가이드: [custom-workflows/README.md](./custom-workflows/README.md)
- 기여 가이드: [CONTRIBUTING.md](./CONTRIBUTING.md)
- 보안 정책: [SECURITY.md](./SECURITY.md)
- 라이선스: MIT
