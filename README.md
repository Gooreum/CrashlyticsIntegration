# 🤖 Crashlytics AI 분석 봇 — 프로젝트 요약

## 프로젝트 개요

Firebase Crashlytics에서 감지된 iOS 앱 크래시를 자동으로 분석하고, Slack에 알림을 보내며, Claude AI가 원인을 분석하고 수정 코드까지 생성하여 GitHub PR을 자동으로 만들어주는 종합 자동화 봇.

**기간:** 2026년 2월 12일 ~ 2월 17일  
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

## 디버깅 및 문제 해결 과정

### 이슈 1: Cloud Functions Gen 2 인증 문제

**증상:** `slackInteraction` 함수 로그에 호출 기록이 전혀 없음  
**원인:** Gen 2는 기본적으로 인증된 요청만 허용. Slack은 인증 없이 요청하므로 403 거부  
**해결:** Cloud Run 콘솔에서 `allUsers`에 `Cloud Run Invoker` 역할 부여

### 이슈 2: Gen 2에서 res.send() 후 비동기 코드 미실행

**증상:** 함수 호출은 되지만 후속 작업이 실행 안 됨  
**원인:** Gen 2(Cloud Run 기반)에서 `res.send()` 이후 CPU 스로틀링  
**해결:** `res.send()`를 함수 맨 끝으로 이동

### 이슈 3: 파일명 파싱 실패

**증상:** "🔀 수정 PR 생성" 버튼이 표시되지 않음  
**원인:** `File.swift ... line 53` 형식을 인식 못함 (콜론 형식만 지원)  
**해결:** 4가지 파싱 패턴으로 확장 + 패턴 4(클래스명 추론)는 실제 .swift 파일을 못 찾았을 때만 작동하도록 최적화

### 이슈 4: GitHub Code Search API 인덱싱 문제

**증상:** 파일이 레포에 있는데도 `found: false`  
**원인:** `search.code`는 인덱싱에 의존, 소규모 레포는 인덱싱 안 될 수 있음  
**해결:** 하이브리드 3단계 검색 전략 + 전역 TTL 캐시 (상세 내용 아래)

### 이슈 5: 인터랙션 핸들러 데이터 키 불일치

**증상:** PR 버튼 클릭 → "수정 코드를 생성할 수 없었습니다"  
**원인:** 버튼은 `{ filePath }`, 함수는 `{ file }` 기대  
**해결:** `const file = item.file || item.filePath`로 양쪽 호환

### 이슈 6: Claude 응답 JSON 토큰 초과로 잘림

**증상:** "Unterminated string in JSON at position 10833"  
**원인:** `max_tokens: 4096` 부족으로 JSON 중간 잘림  
**해결:**
- `max_tokens` 4096 → **16384** (4배)
- `stop_reason === "max_tokens"` 잘림 감지
- 잘린 JSON 자동 복구 (열린 따옴표/중괄호/대괄호 닫기)

### 이슈 7: Slack 블록 3000자 제한

**증상:** 동시 크래시 시 AI 분석 결과 Slack 전송 실패  
**원인:** Slack section block text 3000자 제한 초과  
**해결:** 2900자 단위 자동 분할, 여러 블록으로 전송

### 이슈 8: 동시 크래시 시 타임아웃 및 안정성

**증상:** 동시 3개 크래시 시 일부 분석 실패  
**원인:** 기본 타임아웃 60초, 메모리 256MB 부족  
**해결:**
- `timeoutSeconds: 300`, `memory: "512MiB"`
- Claude 분석 실패 시 5초 대기 후 자동 재시도 1회
- 에러 시 Slack 쓰레드에 에러 메시지 표시 (무한 대기 방지)

---

## GitHub 소스 코드 검색 전략 (하이브리드)

### 진화 과정

| 버전 | 방식 | 문제 |
|------|------|------|
| v1 | `search.code` 단독 | 인덱싱 안 된 파일 못 찾음 |
| v2 | Git Tree 전체 조회 | 매번 17K 파일 목록 API 호출 |
| v3 | sourceDirs 직접 조회 | 폴더 변경 시 코드 수정 필요 |
| **v4 (최종)** | **하이브리드 3단계 + 전역 TTL 캐시** | **자동, 효율적** |

### 최종 전략 (v4)

```
전략 1: 전체 경로 → repos.getContent 직접 조회 (API 1회)
  ↓ 실패 시
전략 2: search.code 검색 (API 1회)
  ↓ 실패 시
전략 3: Git Tree 폴백 — 전역 TTL 캐시 (캐시 히트면 0회, 미스면 2회)
```

### 전역 Git Tree 캐시

```javascript
let treeCache = { files: null, timestamp: 0 };
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5분
```

- 인스턴스가 살아있는 동안 캐시 유지
- 동시 3개 크래시 → Git Tree 최대 1번만 호출
- 폴더 구조 변경 시 코드 수정 불필요 (git push 후 5분 내 자동 반영)

---

## 테스트 인프라

### HTTP 테스트 엔드포인트

```bash
curl ".../testCrashAlert?scenario=list"              # 시나리오 목록
curl ".../testCrashAlert?scenario=force_unwrap_user"  # 특정 시나리오
curl ".../testCrashAlert?scenario=all"                # 전체 32개 순차
curl ".../testCrashAlert"                             # 랜덤
```

### CrashScenarios.swift — 30가지 크래시 시나리오

| # | 서비스 | 패턴 |
|---|--------|------|
| 1 | UserService | `currentUser!.name` 강제 언래핑 |
| 2 | UserService | 이중·삼중 강제 언래핑 |
| 3 | UserService | Dictionary 키 없음 강제 언래핑 |
| 4 | CartService | 빈 배열로 나누기 |
| 5 | CartService | filter 빈 결과 인덱스 접근 |
| 6 | CartService | 타입 불일치 `as!` |
| 7 | OrderService | 멀티스레드 동시 수정 |
| 8 | OrderService | nil 연쇄 강제 언래핑 |
| 9 | NetworkManager | 인코딩 안 된 URL 강제 변환 |
| 10 | NetworkManager | JSON 타입 불일치 |
| 11 | ChatService | 빈 배열 `.last!` |
| 12 | ChatService | String `offsetBy` 범위 초과 |
| 13 | ChatService | `remove(at:)` 범위 초과 |
| 14 | SearchService | 잘못된 정규식 `try!` |
| 15 | SearchService | Dictionary + 배열 이중 강제 언래핑 |
| 16 | SearchService | Array 슬라이싱 범위 초과 |
| 17 | NotificationService | nil 딥링크 삼중 강제 언래핑 |
| 18 | NotificationService | payload `as!` 타입 불일치 |
| 19 | NotificationService | Dictionary 키 미스 + 오버플로우 |
| 20 | MediaService | 빈 배열 `.randomElement()!` |
| 21 | MediaService | 음수 인덱스 배열 접근 |
| 22 | MediaService | `Int(exactly:)!` 소수점 변환 |
| 23 | ProfileService | 설정값 `as! Bool` 타입 불일치 |
| 24 | ProfileService | 빈 배열 `.first!` |
| 25 | ProfileService | `Int("twenty")!` 변환 실패 |
| 26 | CacheManager | NSCache 미스 + `as! UIImage` |
| 27 | CacheManager | FileManager `try!` 파일 없음 |
| 28 | DateFormatterService | 날짜 형식 불일치 |
| 29 | DateFormatterService | 파싱 불가 날짜 |
| 30 | DeepCopyService | `Double.infinity` JSON 인코딩 |

**+ AppView2.swift 2개 시나리오 (총 32개)**

### Xcode 프로젝트 폴더 구조

```
CrashlyticsReport/
  ├── CrashlyticsReport/
  │   ├── Manager/
  │   │   ├── CacheManager.swift
  │   │   └── NetworkManager.swift
  │   ├── Model/
  │   │   └── Model.swift
  │   ├── Resource/
  │   │   └── Assets/GoogleService-Info
  │   ├── Service/
  │   │   ├── CartService.swift
  │   │   ├── ChatService.swift
  │   │   ├── DateFormatterService.swift
  │   │   ├── DeepCopyService.swift
  │   │   ├── MediaService.swift
  │   │   ├── NotificationService.swift
  │   │   ├── OrderService.swift
  │   │   ├── ProfileService.swift
  │   │   ├── SearchService.swift
  │   │   └── UserService.swift
  │   └── View/
  │       ├── ContentView.swift
  │       └── CrashScenarios.swift
  └── CrashlyticsReportApp.swift
```

---

## 최종 산출물

| 파일 | 설명 |
|------|------|
| `phase-b-index.js` | Phase B 전체 코드 (최종 — 하이브리드 검색, 캐시, PR 생성, 에러 복구) |
| `CrashScenarios.swift` | 30가지 크래시 시나리오 |
| `phase-a-index.js` | Phase A 코드 (Webhook + Claude 기본) |
| `PROJECT_SUMMARY.md` | 이 문서 |

---

## 필요한 외부 설정

### Firebase Secrets
```bash
firebase functions:secrets:set SLACK_BOT_TOKEN
firebase functions:secrets:set SLACK_WEBHOOK_URL
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GITHUB_TOKEN
```

### GitHub Token 권한
- Contents: Read & Write
- Pull requests: Read & Write
- Issues: Read & Write
- Metadata: Read

### Slack App 설정
- Bot Token Scopes: `chat:write`, `reactions:write`
- Interactivity URL: `https://asia-northeast3-crashyltics-slack.cloudfunctions.net/slackInteraction`
- Cloud Run `allUsers` → `Cloud Run Invoker` 권한 필수 (Gen 2)

---

## 유용한 디버깅 명령어

```bash
# 함수별 로그
firebase functions:log --only postFatalToSlack 2>&1 | tail -30
firebase functions:log --only slackInteraction 2>&1 | tail -30
firebase functions:log --only testCrashAlert 2>&1 | tail -30

# GitHub 검색 전략 확인
firebase functions:log --only postFatalToSlack 2>&1 | grep -E "직접조회|search.code|Git Tree|파일 못 찾음" | tail -20

# 테스트 크래시 발생
curl "https://asia-northeast3-crashyltics-slack.cloudfunctions.net/testCrashAlert?scenario=force_unwrap_user"

# 함수 호출 확인
curl -X POST https://asia-northeast3-crashyltics-slack.cloudfunctions.net/slackInteraction -d 'payload={"type":"test"}'
```

---

## 핵심 교훈

1. **Cloud Functions Gen 2는 Gen 1과 다르다** — 인증 정책, `res.send()` 후 CPU 스로틀링
2. **GitHub Code Search API는 신뢰할 수 없다** — 하이브리드 전략 + 캐시 필수
3. **Slack API에는 글자수 제한이 있다** — section block 3000자, 분할 전송 필요
4. **Claude 응답이 잘릴 수 있다** — `max_tokens` 넉넉히 + `stop_reason` 체크 + JSON 복구
5. **데이터 키 네이밍 일관성** — `file` vs `filePath` 불일치가 런타임 에러 유발
6. **단계별 로깅이 디버깅의 핵심** — 각 단계마다 로그 필수
7. **동시 요청 고려** — 타임아웃, 메모리, 재시도, 에러 표시
8. **전역 캐시로 반복 호출 방지** — Git Tree TTL 캐시로 인스턴스 수명 동안 재사용

---

## 주의사항

⚠️ **AI 생성 PR은 반드시 코드 리뷰 필요** — `ai-fix` 라벨 자동 추가  
⚠️ **테스트 엔드포인트 보안** — 프로덕션에서는 제거하거나 인증 추가 권장  
⚠️ **GitHub 폴더 구조 변경 시** — `git push` 필수, Git Tree 캐시 TTL 5분 후 자동 반영
