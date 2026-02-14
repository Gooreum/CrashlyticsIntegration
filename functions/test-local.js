/**
 * ============================================================
 * Phase A 로컬 테스트 스크립트
 * ============================================================
 *
 * 사용법:
 *   cd functions
 *   npm install
 *   node test-local.js
 *
 * 환경변수 설정 (터미널에서):
 *   export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../..."
 *   export ANTHROPIC_API_KEY="sk-ant-..."
 *
 * 또는 .env 파일 사용 (dotenv 필요):
 *   npm install dotenv
 *   → .env 파일에 위 값 작성
 */

// dotenv가 있으면 로드 (없어도 동작)
try { require("dotenv").config(); } catch {}

const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");

// ── 환경변수에서 키 로드 ──────────────────────────────
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SLACK_WEBHOOK_URL) {
  console.error("❌ SLACK_WEBHOOK_URL 환경변수를 설정해주세요.");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 환경변수를 설정해주세요.");
  process.exit(1);
}

// ── iOS 크래시 패턴 사전 (index.js와 동일) ────────────
const IOS_CRASH_PATTERNS = {
  "EXC_BAD_ACCESS":
    "메모리 접근 위반 — 해제된 객체 접근, 댕글링 포인터, 또는 force unwrap nil 가능성",
  "EXC_BREAKPOINT":
    "Swift 런타임 에러 — force unwrap(!), fatalError(), 배열 인덱스 초과 등",
  "EXC_CRASH (SIGABRT)":
    "명시적 abort — assertion failure, uncaught exception, Swift precondition 실패",
  "EXC_RESOURCE":
    "리소스 한도 초과 — 메모리 제한, CPU 과사용, Watchdog 타임아웃",
  "EXC_BAD_INSTRUCTION":
    "잘못된 명령어 — Swift의 implicitly unwrapped optional이 nil인 경우",
  "SIGABRT":
    "프로세스 abort — NSException, fatalError, 또는 잘못된 UI 업데이트(메인스레드 아닌 곳에서)",
  "SIGSEGV":
    "세그멘테이션 폴트 — 잘못된 메모리 접근, 보통 C/C++ interop 관련",
};

// ── 테스트용 이벤트 시나리오 ──────────────────────────
const TEST_EVENTS = [
  {
    name: "🔥 시나리오 1: EXC_BREAKPOINT (force unwrap 실패)",
    event: {
      appId: "1:240595016161:ios:d252a48f861e6f240d5aa0",
      specversion: "1.0",
      project: "my-project-id",
      data: {
        payload: {
          issue: {
            id: "CRASH_001",
            title: "EXC_BREAKPOINT",
            subtitle: "PaymentViewController.swift - processPayment(_:) line 87",
            appVersion: "1.0.2",
          },
        },
      },
    },
  },
  {
    name: "💥 시나리오 2: Fatal error - 배열 인덱스 초과",
    event: {
      appId: "1:240595016161:ios:d252a48f861e6f240d5aa0",
      specversion: "1.0",
      project: "my-project-id",
      data: {
        payload: {
          issue: {
            id: "CRASH_002",
            title: "Fatal error: Index out of range",
            subtitle: "CartManager.swift - getItem(at:) line 143",
            appVersion: "1.0.3",
          },
        },
      },
    },
  },
  {
    name: "🧵 시나리오 3: SIGABRT (메인스레드 UI 업데이트 위반)",
    event: {
      appId: "1:240595016161:ios:d252a48f861e6f240d5aa0",
      specversion: "1.0",
      project: "my-project-id",
      data: {
        payload: {
          issue: {
            id: "CRASH_003",
            title: "SIGABRT",
            subtitle: "ProfileView.swift - closure #1 in loadUserData() line 52",
            appVersion: "1.0.2",
          },
        },
      },
    },
  },
];

// ── Claude 분석 함수 (index.js와 동일 로직) ──────────
async function analyzeWithClaude(issue, typeLabel) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const crashTitle = issue.title || "";
  const patternHint =
    Object.entries(IOS_CRASH_PATTERNS)
      .filter(([key]) => crashTitle.toUpperCase().includes(key))
      .map(([, desc]) => desc)
      .join("\n") || "패턴 매칭 없음 — 제목과 상세 정보 기반으로 분석합니다.";

  const prompt = `당신은 iOS/Swift 크래시 분석 전문가입니다. 아래 Firebase Crashlytics 알림 정보를 분석해주세요.

## 크래시 알림 정보
- 알림 유형: ${typeLabel}
- 에러 제목: ${issue.title || "N/A"}
- 상세 정보: ${issue.subtitle || "N/A"}
- 앱 버전: ${issue.appVersion || "N/A"}

## iOS 크래시 패턴 힌트
${patternHint}

## 요청사항
제한된 정보이지만, 다음을 최대한 분석해주세요:

1. **추정 원인**: 에러명과 상세 정보를 기반으로 가장 가능성 높은 원인 (Swift/iOS 관점)
2. **의심 코드 패턴**: 이런 크래시를 유발하는 전형적인 Swift 코드 패턴 예시
3. **수정 방향**: 일반적인 해결 접근 방법
4. **확인 포인트**: 개발자가 코드에서 즉시 확인해야 할 사항

간결하게 Slack에 표시될 수 있도록 작성해주세요. 각 항목은 2-3문장 이내로.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

// ── Slack 메시지 생성 (index.js와 동일 로직) ─────────
function createSlackMessage(event, typeLabel, emoji, aiAnalysis) {
  const payload = event.data?.payload || event.payload || event.data;
  const issue = payload?.issue;

  if (!issue) {
    console.error("❌ issue 데이터를 찾을 수 없습니다. event 구조:", JSON.stringify(event, null, 2));
    return null;
  }

  const fullAppId = event.appId || "ID 확인 불가";
  const specVersion = event.specversion || "N/A";
  const platform = fullAppId.includes("ios") ? "🍎 iOS" :
                   fullAppId.includes("android") ? "🤖 Android" : "Unknown";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${typeLabel}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*플랫폼:*\n${platform}` },
        { type: "mrkdwn", text: `*앱 버전:*\n${issue.appVersion || "N/A"}` },
        { type: "mrkdwn", text: `*Spec 버전:*\n${specVersion}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*앱 아이디:*\n\`${fullAppId}\`` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*에러명:*\n\`${issue.title}\`\n\n*상세 정보:*\n\`${issue.subtitle}\``,
      },
    },
  ];

  if (aiAnalysis) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `🤖 *AI 크래시 분석*\n\n${aiAnalysis}` },
      }
    );
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Firebase 콘솔에서 보기" },
        style: "danger",
        url: `https://console.firebase.google.com/project/${event.project}/crashlytics`,
      },
    ],
  });

  return { text: `${emoji} ${typeLabel} 알림!`, blocks };
}

// ── 테스트 모드 선택 ─────────────────────────────────
const MODE = {
  FULL: "full",           // Claude 분석 + Slack 전송
  SLACK_ONLY: "slack",    // Slack 전송만 (Claude 건너뜀)
  CLAUDE_ONLY: "claude",  // Claude 분석만 (콘솔 출력)
  DRY_RUN: "dry",         // 데이터 파싱만 확인 (API 호출 없음)
};

// ── 여기서 테스트 모드를 변경하세요 ──────────────────
const CURRENT_MODE = process.argv[2] || MODE.DRY_RUN;
const SCENARIO_INDEX = parseInt(process.argv[3] || "0");

// ── 메인 실행 ────────────────────────────────────────
async function runTest() {
  const scenario = TEST_EVENTS[SCENARIO_INDEX];
  if (!scenario) {
    console.error(`❌ 시나리오 ${SCENARIO_INDEX}을(를) 찾을 수 없습니다. (0-${TEST_EVENTS.length - 1})`);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`테스트: ${scenario.name}`);
  console.log(`모드: ${CURRENT_MODE}`);
  console.log(`${"=".repeat(60)}\n`);

  const event = scenario.event;
  const payload = event.data?.payload || event.payload || event.data;
  const issue = payload?.issue;

  if (!issue) {
    console.error("❌ issue 추출 실패! event 구조를 확인하세요:");
    console.log(JSON.stringify(event, null, 2));
    return;
  }

  console.log("✅ issue 추출 성공:");
  console.log(`   title:      ${issue.title}`);
  console.log(`   subtitle:   ${issue.subtitle}`);
  console.log(`   appVersion: ${issue.appVersion}`);
  console.log(`   appId:      ${event.appId}`);
  console.log();

  // DRY RUN: 파싱만 확인
  if (CURRENT_MODE === MODE.DRY_RUN) {
    console.log("🏁 Dry run 완료. 데이터 파싱이 정상입니다.");
    console.log("   다른 모드로 실행하려면:");
    console.log("   node test-local.js claude 0   # Claude 분석만");
    console.log("   node test-local.js slack 0    # Slack 전송만");
    console.log("   node test-local.js full 0     # 전체 테스트");
    return;
  }

  // CLAUDE 분석
  let aiAnalysis = null;
  if (CURRENT_MODE === MODE.CLAUDE_ONLY || CURRENT_MODE === MODE.FULL) {
    console.log("🤖 Claude 분석 중...\n");
    try {
      aiAnalysis = await analyzeWithClaude(issue, "초기 치명적 문제 발생");
      console.log("── Claude 분석 결과 ──────────────────────");
      console.log(aiAnalysis);
      console.log("──────────────────────────────────────────\n");
    } catch (error) {
      console.error("❌ Claude API 실패:", error.message);
      if (CURRENT_MODE === MODE.CLAUDE_ONLY) return;
    }
  }

  // SLACK 전송
  if (CURRENT_MODE === MODE.SLACK_ONLY || CURRENT_MODE === MODE.FULL) {
    const message = createSlackMessage(event, "초기 치명적 문제 발생", "🔥", aiAnalysis);
    if (!message) {
      console.error("❌ 메시지 생성 실패");
      return;
    }

    console.log("📤 Slack 전송 중...");
    try {
      const response = await axios.post(SLACK_WEBHOOK_URL, message);
      console.log(`✅ Slack 전송 완료! (HTTP ${response.status})`);
    } catch (error) {
      console.error("❌ Slack 전송 실패:", error.response?.data || error.message);
    }
  }

  console.log("\n🏁 테스트 완료.");
}

runTest().catch(console.error);
