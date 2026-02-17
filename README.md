# 🤖 Crashlytics AI 분석 봇 — 프로젝트 요약

## 프로젝트 개요

Firebase Crashlytics에서 감지된 iOS 앱 크래시를 자동으로 분석하고, Slack에 알림을 보내며, Claude AI가 원인을 분석하고 수정 코드까지 생성하여 GitHub PR을 자동으로 만들어주는 종합 자동화 봇.

**기간:** 2026년 2월 12일 ~ 2월 14일  
**기술 스택:** Firebase Cloud Functions (Gen 2), Slack Web API, GitHub API (Octokit), Claude API (Anthropic), Node.js  
**대상 플랫폼:** iOS (Swift)

---

## 작업 목표

> Slack에 연동된 Firebase Crashlytics 리포트를 토대로 실제 코드 분석 및 원인 해결까지 할 수 있는 봇 만들기

### 최종 파이프라인

```
iOS 앱 크래시 발생
  ↓
Firebase Crashlytics 감지
  ↓
Cloud Function 트리거 (onNewFatalIssuePublished 등)
  ↓
Slack 채널에 초기 알림 전송
  ↓
GitHub에서 소스 코드 자동 조회
  ↓
Claude AI가 크래시 원인 심층 분석
  ↓
Slack 쓰레드에 분석 결과 + 액션 버튼 게시
  ↓
[버튼 클릭] GitHub Issue 자동 생성
[버튼 클릭] Claude가 수정 코드 생성 → GitHub PR 자동 생성
```

---

## 단계별 진행 과정

### Phase A — 경량 확장 (Webhook 기반)

**목표:** 최소한의 구성으로 Crashlytics → Slack 알림 + Claude AI 분석 파이프라인 구축

**주요 작업:**
- Firebase Cloud Functions에서 Crashlytics Alert 트리거 설정 (`onNewFatalIssuePublished`, `onRegressionAlertPublished`, `onVelocityAlertPublished`, `onNewNonfatalIssuePublished`)
- Slack Incoming Webhook으로 크래시 알림 전송
- Claude API를 이용한 기본 크래시 원인 분석
- iOS 크래시 패턴 사전 구축 (EXC_BAD_ACCESS, EXC_BREAKPOINT, SIGABRT 등)

**결과물:** `phase-a-index.js` — Webhook + Claude 분석 기본 동작 확인

---

### Phase B — 본격 확장 (Slack Bot + GitHub 풀 연동)

**목표:** Slack Bot API + GitHub 소스 코드 조회 + 인터랙티브 버튼 기능 추가

**주요 작업:**
- Slack Incoming Webhook → **Slack Web API (Bot Token)** 전환
- Slack 쓰레드 답글 기능 구현 (초기 알림 → 분석 결과를 쓰레드로)
- GitHub API 연동하여 스택트레이스에서 실제 소스 코드 조회
- Claude에게 소스 코드 컨텍스트를 포함한 심층 분석 요청
- Slack 인터랙션 핸들러 구현 (버튼 클릭 → GitHub Issue 자동 생성)

**해결한 이슈들:**

| 이슈 | 원인 | 해결 |
|------|------|------|
| Secret Manager 충돌 | 기존 Secret과 새 Secret 버전 불일치 | Secret 재설정 (`firebase functions:secrets:set`) |
| Slack Bot Token 타입 오류 | `defineSecret`이 문자열이 아닌 Secret 객체 반환 | `.value()` 호출로 수정 |
| 에뮬레이터 이벤트 구조 | 에뮬레이터 payload 경로가 프로덕션과 다름 | `event.data?.payload \|\| event.payload \|\| event.data` 체인 |
| Claude API 분석 실패 | API 키가 함수에 바인딩되지 않음 | `secrets` 배열에 `ANTHROPIC_KEY` 추가 |

---

### Phase B+ — 자동 수정 PR 생성 기능 추가

**목표:** Claude AI가 수정 코드를 생성하여 GitHub PR을 자동으로 만드는 기능

**주요 작업:**
- `generateFixWithClaude()` 함수 구현 — Claude에게 전체 파일 수정 코드를 JSON으로 요청
- `createFixPR()` 함수 구현 — GitHub API로 브랜치 생성 → 파일 커밋 → PR 생성 자동화
- Slack "🔀 수정 PR 생성" 버튼 + 확인 다이얼로그 추가
- 실시간 진행 상태를 Slack 메시지 업데이트로 표시

**PR 생성 파이프라인:**
```
"🔀 수정 PR 생성" 버튼 클릭
  ↓
① GitHub에서 소스 코드 재조회 (전체 파일 내용)
② Claude에게 수정 코드 생성 요청 (구조화된 JSON 응답)
③ fix/crashlytics-{id}-{timestamp} 브랜치 생성
④ 수정된 파일들 커밋
⑤ Development ← fix 브랜치로 PR 생성
⑥ Slack 쓰레드에 PR 링크 + 수정 요약 게시
```

---

### 디버깅 및 문제 해결 과정

PR 생성 기능이 동작하지 않아 여러 단계에 걸쳐 원인을 추적하고 해결했습니다.

#### 이슈 1: Slack 3초 타임아웃

**증상:** PR 생성 버튼 클릭 후 아무 반응 없음  
**원인:** Slack은 인터랙션 응답을 3초 이내에 받아야 하는데, GitHub 조회 + Claude API + PR 생성이 끝난 후에야 `res.status(200).send("ok")`를 보내고 있었음  
**해결:** `res.send()`를 즉시 호출하고 비동기로 작업 수행 → 이후 Gen 2 호환 문제로 다시 수정

#### 이슈 2: Cloud Functions Gen 2 인증 문제

**증상:** `slackInteraction` 함수 로그에 호출 기록이 전혀 없음 (배포 로그만 존재)  
**원인:** Gen 2 Cloud Functions는 기본적으로 인증된 요청만 허용. Slack은 인증 없이 요청하므로 403으로 거부됨  
**해결:** Cloud Run 콘솔에서 `allUsers`에 `Cloud Run Invoker` 역할 부여
```bash
gcloud functions add-invoker-policy-binding slackInteraction \
  --region=asia-northeast3 --member="allUsers"
```

#### 이슈 3: Gen 2에서 res.send() 후 비동기 코드 미실행

**증상:** 함수 호출은 되지만 후속 작업(GitHub 조회, Claude API)이 실행 안 됨  
**원인:** Gen 2(Cloud Run 기반)에서는 `res.send()` 이후 CPU가 스로틀링되어 비동기 코드 실행이 보장되지 않음  
**해결:** `res.send()`를 함수 맨 끝으로 이동하여 모든 작업 완료 후 응답

#### 이슈 4: 파일명 파싱 실패

**증상:** Slack 쓰레드에 "🔀 수정 PR 생성" 버튼이 표시되지 않음  
**원인:** `extractFileInfoFromIssue` 함수가 `CrashScenarios.swift ... line 53` 형식을 인식하지 못함 (기존에는 `File.swift:53` 콜론 형식만 지원)  
**해결:** 4가지 파싱 패턴 추가
| 패턴 | 예시 |
|------|------|
| `File.swift:53` | 기존 Crashlytics 형식 |
| `File.swift ... line 53` | 테스트 시나리오 형식 |
| `File.swift` 단독 | 라인 번호 없는 경우 |
| `ClassName.method(` → 추론 | 클래스명에서 파일명 유추 |

#### 이슈 5: GitHub Code Search API 인덱싱 문제

**증상:** 파일이 레포에 있는데도 `found: false`로 나옴  
**원인:** GitHub `search.code` API는 인덱싱에 의존하며, 소규모 레포나 최근 푸시 파일은 인덱싱이 안 될 수 있음  
**해결:** `search.code` → **Git Tree API** (`git.getTree` recursive)로 교체. Development 브랜치의 전체 파일 트리를 직접 조회하여 100% 확실하게 파일을 찾도록 변경

#### 이슈 6: 인터랙션 핸들러 데이터 키 불일치

**증상:** PR 버튼 클릭 → "수정 코드를 생성할 수 없었습니다" 에러  
**원인:** Slack 버튼 데이터는 `{ filePath, line }` 형태인데, `fetchSourceFromGithub`는 `{ file, line }`을 destructure하여 `file`이 `undefined`로 됨  
**해결:** destructuring을 `const file = item.file || item.filePath`로 수정하여 양쪽 형식 모두 호환

---

## 테스트 인프라

### HTTP 테스트 엔드포인트

Crashlytics Alert는 새로운 이슈에만 트리거되므로, 반복 테스트를 위한 HTTP 엔드포인트를 구현했습니다.

```bash
# 시나리오 목록 조회
curl ".../testCrashAlert?scenario=list"

# 특정 시나리오 실행
curl ".../testCrashAlert?scenario=force_unwrap_user"

# 전체 12개 시나리오 순차 실행
curl ".../testCrashAlert?scenario=all"

# 랜덤 실행
curl ".../testCrashAlert"
```

### CrashScenarios.swift (10가지 복잡한 크래시 시나리오)

실전에서 자주 발생하는 크래시 패턴 10개를 구현:

1. **force_unwrap_user** — `currentUser!.name` (로그아웃 상태 접근)
2. **nested_optional** — 이중·삼중 강제 언래핑
3. **dict_force_unwrap** — Dictionary 키 없음
4. **division_empty_array** — 빈 배열로 나누기
5. **empty_filter_index** — filter 결과 빈 배열 인덱스 접근
6. **force_cast** — 타입 불일치 강제 캐스팅
7. **race_condition** — Array 멀티스레드 동시 수정
8. **order_not_found** — nil 연쇄 강제 언래핑
9. **invalid_url** — 인코딩 안 된 URL 강제 변환
10. **json_type_mismatch** — API 응답 타입 불일치

### AppView2.swift (기존 2개 시나리오)
11. **appview2_fatal** — `fatalError()` 호출
12. **appview2_index** — `array[4]` 접근 (크기 3)

---

## 최종 산출물

| 파일 | 설명 |
|------|------|
| `phase-b-index.js` | Phase B 전체 코드 (PR 생성 기능 포함, 최종 버전) |
| `CrashScenarios.swift` | 10가지 복잡한 크래시 시나리오 |
| `phase-a-index.js` | Phase A 코드 (Webhook + Claude 기본) |
| `GUIDE.md` | 배포 가이드 |

## 필요한 외부 설정

### Firebase Secrets
```bash
firebase functions:secrets:set SLACK_BOT_TOKEN
firebase functions:secrets:set SLACK_WEBHOOK_URL
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GITHUB_TOKEN
```

### GitHub Token 권한
- Contents: Read & **Write** (브랜치 생성, 파일 커밋)
- Pull requests: Read & **Write** (PR 생성)
- Issues: Read & Write (이슈 생성)
- Metadata: Read

### Slack App 설정
- Bot Token Scopes: `chat:write`, `reactions:write`
- Interactivity URL: `https://asia-northeast3-crashyltics-slack.cloudfunctions.net/slackInteraction`
- Cloud Run `allUsers` → `Cloud Run Invoker` 권한 필수 (Gen 2)

---

## 핵심 교훈

1. **Cloud Functions Gen 2는 Gen 1과 다르다** — 인증 정책이 다르고, `res.send()` 후 CPU 스로틀링이 발생한다.
2. **GitHub Code Search API는 신뢰할 수 없다** — Git Tree API가 훨씬 안정적이다.
3. **Slack 인터랙션은 3초 제한이 있다** — 무거운 작업은 비동기 처리하되, Gen 2에서는 응답 시점을 잘 조절해야 한다.
4. **데이터 키 네이밍 일관성이 중요하다** — `file` vs `filePath` 같은 불일치가 런타임 에러를 유발한다.
5. **단계별 로깅이 디버깅의 핵심이다** — 각 단계마다 로그를 넣어야 어디서 실패하는지 빠르게 찾을 수 있다.

---

## 주의사항

⚠️ **AI 생성 PR은 반드시 코드 리뷰 필요** — Slack 메시지와 PR 본문에 경고 포함, `ai-fix` 라벨 자동 추가  
⚠️ **테스트 엔드포인트 보안** — 현재 인증 없는 공개 엔드포인트, 프로덕션에서는 제거하거나 인증 추가 권장
