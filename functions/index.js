/**
 * ============================================================
 * Crashlytics Slack Bot — Firebase Cloud Functions 진입점
 * ============================================================
 *
 * 핵심 로직은 crashlytics-slack-bot 패키지에 있습니다.
 * 이 파일은 Firebase 트리거 등록과 Secret 설정만 담당합니다.
 *
 * Secret 등록:
 *   firebase functions:secrets:set SLACK_BOT_TOKEN
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set GITHUB_TOKEN
 *
 * 배포:
 *   firebase deploy --only functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onRequest } = require("firebase-functions/v2/https");
const {
  onNewFatalIssuePublished,
  onRegressionAlertPublished,
  onVelocityAlertPublished,
  onNewNonfatalIssuePublished,
} = require("firebase-functions/v2/alerts/crashlytics");
const { createCrashlyticsBot } = require("crashlytics-slack-bot");

// ── 전역 설정 ──────────────────────────────────────────────
setGlobalOptions({ maxInstances: 10, region: "asia-northeast3" });

// ── Secrets ────────────────────────────────────────────────
const SLACK_BOT_TOKEN = defineSecret("SLACK_BOT_TOKEN");
const ANTHROPIC_KEY   = defineSecret("ANTHROPIC_API_KEY");
const GITHUB_TOKEN    = defineSecret("GITHUB_TOKEN");

const SECRETS = {
  secrets: [SLACK_BOT_TOKEN, ANTHROPIC_KEY, GITHUB_TOKEN],
  timeoutSeconds: 300,
  memory: "512MiB",
};

// ── Bot 설정 ───────────────────────────────────────────────
// secrets.value()는 함수 실행 컨텍스트 내에서만 호출 가능하므로
// 트리거 핸들러 안에서 bot을 생성합니다.
function getBot() {
  return createCrashlyticsBot({
    github: {
      owner: "Gooreum",
      repo: "CrashlyticsIntegration",
      branch: "Development",
      token: GITHUB_TOKEN.value(),
    },
    slack: {
      botToken: SLACK_BOT_TOKEN.value(),
      channelId: "C0AEKU0J1MY",
    },
    claude: {
      apiKey: ANTHROPIC_KEY.value(),
    },
    firebase: {
      projectId: "crashyltics-slack",
    },
  });
}

// ── Crashlytics 트리거 ─────────────────────────────────────
exports.postFatalToSlack = onNewFatalIssuePublished(SECRETS, async (event) => {
  await getBot().analyzeCrash(event, "초기 치명적 문제 발생", "🔥");
});

exports.postNonFatalToSlack = onNewNonfatalIssuePublished(SECRETS, async (event) => {
  await getBot().analyzeCrash(event, "신규 비치명적 문제 발생", "✨");
});

exports.postRegressionToSlack = onRegressionAlertPublished(SECRETS, async (event) => {
  await getBot().analyzeCrash(event, "회귀됨 (다시 발생한 이슈)", "↩️");
});

exports.postVelocityToSlack = onVelocityAlertPublished(SECRETS, async (event) => {
  await getBot().analyzeCrash(event, "반복되는 문제 (폭주 알림)", "📈");
});

// ── Slack 버튼 인터랙션 핸들러 ─────────────────────────────
//
// ⚠️ Gen 2 주의: res.send() 이후 CPU 스로틀링 → 모든 작업 완료 후 응답
// (InteractionHandler 내부에서 처리됨)
//
exports.slackInteraction = onRequest(
  { secrets: [SLACK_BOT_TOKEN, ANTHROPIC_KEY, GITHUB_TOKEN], cors: true, timeoutSeconds: 300 },
  async (req, res) => {
    await getBot().handleSlackInteraction(req, res);
  }
);

// ── 테스트용 HTTP 트리거 ────────────────────────────────────
//
// 사용법:
//   curl ".../testCrashAlert"                        ← 랜덤 시나리오
//   curl ".../testCrashAlert?scenario=force_unwrap_user"
//   curl ".../testCrashAlert?scenario=list"          ← 시나리오 목록
//   curl ".../testCrashAlert?scenario=all"           ← 전체 순차 실행
//
exports.testCrashAlert = onRequest(
  { secrets: [SLACK_BOT_TOKEN, ANTHROPIC_KEY, GITHUB_TOKEN], cors: true },
  async (req, res) => {
    const TEST_SCENARIOS = [
      { id: "force_unwrap_user", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - UserService.getCurrentUserName() line 53", appVersion: "1.0.2" },
      { id: "nested_optional", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - UserService.getFirstFriendEmail() line 58", appVersion: "1.0.2" },
      { id: "dict_force_unwrap", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - UserService.getCachedUser(id:) line 63", appVersion: "1.0.2" },
      { id: "division_empty_array", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - CartService.getAveragePrice() line 71", appVersion: "1.0.2" },
      { id: "empty_filter_index", title: "Fatal error: Index out of range", subtitle: "CrashScenarios.swift - CartService.getMostDiscountedItem() line 77", appVersion: "1.0.2" },
      { id: "force_cast", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - CartService.processPayment(method:) line 82", appVersion: "1.0.2" },
      { id: "race_condition", title: "EXC_BAD_ACCESS (code=1, address=0x0)", subtitle: "CrashScenarios.swift - OrderService.fetchOrdersAsync(completion:) line 101", appVersion: "1.0.2" },
      { id: "order_not_found", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - OrderService.getOrderShippingLabel(orderId:) line 109", appVersion: "1.0.2" },
      { id: "invalid_url", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - NetworkManager.fetchData(from:) line 118", appVersion: "1.0.2" },
      { id: "json_type_mismatch", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - NetworkManager.parseResponse(data:) line 124", appVersion: "1.0.2" },
      { id: "empty_last_message", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - ChatService.getLastMessage() line 180", appVersion: "1.0.2" },
      { id: "string_index_overflow", title: "Fatal error: String index is out of bounds", subtitle: "CrashScenarios.swift - ChatService.getMessagePreview(messageId:) line 187", appVersion: "1.0.2" },
      { id: "remove_at_invalid", title: "Fatal error: Index out of range", subtitle: "CrashScenarios.swift - ChatService.removeTypingUser(at:) line 193", appVersion: "1.0.2" },
      { id: "invalid_regex", title: "NSInternalInconsistencyException", subtitle: "CrashScenarios.swift - SearchService.searchWithRegex(pattern:in:) line 201", appVersion: "1.0.2" },
      { id: "search_cache_miss", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - SearchService.getTopSearchResult(query:) line 209", appVersion: "1.0.2" },
      { id: "pagination_overflow", title: "Fatal error: Range requires lowerBound <= upperBound", subtitle: "CrashScenarios.swift - SearchService.getSearchPage(query:page:pageSize:) line 216", appVersion: "1.0.2" },
      { id: "nil_deeplink", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - NotificationService.handleNotification(_:) line 225", appVersion: "1.0.2" },
      { id: "payload_type_error", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - NotificationService.getNotificationTitle(_:) line 233", appVersion: "1.0.2" },
      { id: "badge_overflow", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - NotificationService.incrementBadge(for:) line 240", appVersion: "1.0.2" },
      { id: "empty_shuffle", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - MediaService.getShuffledTrack() line 250", appVersion: "1.0.2" },
      { id: "negative_index", title: "Fatal error: Index out of range", subtitle: "CrashScenarios.swift - MediaService.getPreviousTrack(currentIndex:) line 256", appVersion: "1.0.2" },
      { id: "int_exact_fail", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - MediaService.getTrackProgress(current:total:) line 262", appVersion: "1.0.2" },
      { id: "settings_type_mismatch", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - ProfileService.getNotificationPreference() line 271", appVersion: "1.0.2" },
      { id: "empty_languages", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - ProfileService.getPrimaryLanguage() line 278", appVersion: "1.0.2" },
      { id: "string_to_int_fail", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - ProfileService.getUserAge() line 284", appVersion: "1.0.2" },
      { id: "cache_miss_image", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - CacheManager.getCachedImage(key:) line 293", appVersion: "1.0.2" },
      { id: "file_not_found", title: "NSCocoaErrorDomain (260)", subtitle: "CrashScenarios.swift - CacheManager.getCacheFileSize(at:) line 299", appVersion: "1.0.2" },
      { id: "date_format_mismatch", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - DateFormatterService.parseServerDate(dateString:) line 308", appVersion: "1.0.2" },
      { id: "date_calc_fail", title: "EXC_BREAKPOINT", subtitle: "CrashScenarios.swift - DateFormatterService.getDaysBetween(start:end:) line 315", appVersion: "1.0.2" },
      { id: "codable_infinity", title: "NSInvalidArgumentException", subtitle: "CrashScenarios.swift - DeepCopyService.deepCopy(object:) line 325", appVersion: "1.0.2" },
    ];

    const scenarioId = req.query.scenario || (req.method === "POST" && req.body?.scenario);

    if (scenarioId === "list") {
      res.status(200).json({
        scenarios: TEST_SCENARIOS.map((s) => ({ id: s.id, subtitle: s.subtitle })),
        usage: {
          random: "GET /testCrashAlert",
          specific: "GET /testCrashAlert?scenario=force_unwrap_user",
          all: "GET /testCrashAlert?scenario=all",
          custom: "POST /testCrashAlert with JSON body { title, subtitle, appVersion }",
        },
      });
      return;
    }

    if (scenarioId === "all") {
      const bot = getBot();
      const results = [];
      for (const scenario of TEST_SCENARIOS) {
        try {
          await bot.analyzeCrash(buildFakeEvent(scenario), `🧪 [테스트] ${scenario.id}`, "🧪");
          results.push({ id: scenario.id, success: true });
        } catch (error) {
          results.push({ id: scenario.id, success: false, error: error.message });
        }
      }
      res.status(200).json({ success: true, results });
      return;
    }

    let issueData;
    if (req.method === "POST" && req.body?.title) {
      issueData = {
        id: "CUSTOM_TEST",
        title: req.body.title,
        subtitle: req.body.subtitle || "N/A",
        appVersion: req.body.appVersion || "1.0.0",
      };
    } else {
      const scenario = scenarioId
        ? TEST_SCENARIOS.find((s) => s.id === scenarioId)
        : TEST_SCENARIOS[Math.floor(Math.random() * TEST_SCENARIOS.length)];

      if (!scenario) {
        res.status(400).json({ error: `시나리오 '${scenarioId}'을(를) 찾을 수 없습니다.` });
        return;
      }
      issueData = { id: `TEST_${scenario.id}`, ...scenario };
    }

    try {
      await getBot().analyzeCrash(buildFakeEvent(issueData), `🧪 [테스트] ${issueData.id}`, "🧪");
      res.status(200).json({ success: true, issue: issueData });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

function buildFakeEvent(issueData) {
  return {
    appId: "1:240595016161:ios:d252a48f861e6f240d5aa0",
    project: "crashyltics-slack",
    data: { payload: { issue: issueData } },
  };
}
