/**
 * ============================================================
 * Phase B: Slack Bot + GitHub + Claude 풀 연동 + 자동 수정 PR
 * ============================================================
 *
 * 기능:
 * 1. Slack Web API (Bot Token) → 쓰레드 답글, 버튼 인터랙션
 * 2. GitHub API → 스택트레이스에서 실제 소스 코드 조회
 * 3. Claude 심층 분석 → 코드 컨텍스트 기반 근본 원인 분석
 * 4. GitHub Issue 자동 생성 버튼
 * 5. ✨ Claude 코드 수정 제안 → GitHub PR 자동 생성
 *
 * 필요한 패키지:
 *   cd functions && npm install @anthropic-ai/sdk @slack/web-api @octokit/rest
 *
 * Secret 등록:
 *   firebase functions:secrets:set SLACK_BOT_TOKEN
 *   firebase functions:secrets:set SLACK_WEBHOOK_URL
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase functions:secrets:set GITHUB_TOKEN
 *
 * GitHub Token 권한 (PR 생성에 필요):
 *   - Contents: Read & Write (브랜치 생성, 파일 커밋)
 *   - Pull requests: Read & Write (PR 생성)
 *   - Issues: Read & Write (이슈 생성)
 *   - Metadata: Read
 */

const { setGlobalOptions } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  onNewFatalIssuePublished,
  onRegressionAlertPublished,
  onVelocityAlertPublished,
  onNewNonfatalIssuePublished,
} = require("firebase-functions/v2/alerts/crashlytics");
const Anthropic = require("@anthropic-ai/sdk");
const { WebClient } = require("@slack/web-api");
const { Octokit } = require("@octokit/rest");

// ── 설정 ──────────────────────────────────────────────
setGlobalOptions({ maxInstances: 10, region: "asia-northeast3" });

const SLACK_BOT_TOKEN = defineSecret("SLACK_BOT_TOKEN");
const SLACK_WEBHOOK = defineSecret("SLACK_WEBHOOK_URL");
const ANTHROPIC_KEY = defineSecret("ANTHROPIC_API_KEY");
const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");

const CONFIG = {
  github: {
    owner: "Gooreum",                // GitHub organization/user
    repo: "CrashlyticsIntegration",  // iOS 앱 레포지토리 이름
    defaultBranch: "Development",    // 기본 브랜치
  },
  slack: {
    channelId: "C0AEKU0J1MY",        // Crashlytics 알림 채널 ID
  },
  firebase: {
    projectId: "crashyltics-slack",  // Firebase 프로젝트 ID
  },
};

// ── iOS 크래시 패턴 사전 ──────────────────────────────
const IOS_CRASH_PATTERNS = {
  "EXC_BAD_ACCESS":
    "메모리 접근 위반 — 해제된 객체 접근, 댕글링 포인터, force unwrap nil",
  "EXC_BREAKPOINT":
    "Swift 런타임 에러 — force unwrap(!), fatalError(), 배열 인덱스 초과",
  "EXC_CRASH (SIGABRT)":
    "명시적 abort — assertion failure, uncaught exception, precondition 실패",
  "EXC_RESOURCE":
    "리소스 한도 초과 — 메모리 제한, CPU 과사용, Watchdog 타임아웃",
  "EXC_BAD_INSTRUCTION":
    "잘못된 명령어 — implicitly unwrapped optional이 nil",
  SIGABRT:
    "프로세스 abort — NSException, fatalError, 메인스레드 외 UI 업데이트",
  SIGSEGV: "세그멘테이션 폴트 — 잘못된 메모리 접근, C/C++ interop 관련",
};

// =====================================================
// 1. 스택트레이스 파서 (iOS Swift 전용)
// =====================================================
function parseIosStacktrace(stacktrace) {
  if (!stacktrace) return [];
  const frames = [];
  const symbolicated =
    /(\d+)\s+(\S+)\s+0x[\da-f]+\s+(.+?)\s+\+\s+\d+\s+\((\S+\.swift):(\d+)\)/gi;
  const titlePattern = /(\w+\.swift)\s+line\s+(\d+)\s+in\s+(\S+)/gi;
  let match;
  while ((match = symbolicated.exec(stacktrace)) !== null) {
    frames.push({
      frameNumber: parseInt(match[1]),
      module: match[2],
      method: match[3].trim(),
      file: match[4],
      line: parseInt(match[5]),
    });
  }
  while ((match = titlePattern.exec(stacktrace)) !== null) {
    frames.push({
      frameNumber: 0,
      module: "App",
      method: match[3].trim(),
      file: match[1],
      line: parseInt(match[2]),
    });
  }
  return frames;
}

function extractFileInfoFromIssue(issue) {
  const files = [];
  const combined = `${issue.title || ""} ${issue.subtitle || ""}`;

  // 패턴 1: File.swift:123 (콜론으로 연결된 형식)
  const fileLinePattern = /(\w+\.swift):(\d+)/g;
  let match;
  while ((match = fileLinePattern.exec(combined)) !== null) {
    files.push({ file: match[1], line: parseInt(match[2]) });
  }

  // 패턴 2: File.swift ... line 123 (Crashlytics 일반 형식)
  const fileLineSeparatePattern = /(\w+\.swift)\b.*?\bline\s+(\d+)/gi;
  while ((match = fileLineSeparatePattern.exec(combined)) !== null) {
    if (!files.some((f) => f.file === match[1])) {
      files.push({ file: match[1], line: parseInt(match[2]) });
    }
  }

  // 패턴 3: File.swift 단독 (라인 번호 없이)
  const fileOnlyPattern = /(\w+\.swift)\b/g;
  while ((match = fileOnlyPattern.exec(combined)) !== null) {
    if (!files.some((f) => f.file === match[1])) {
      files.push({ file: match[1], line: null });
    }
  }

  // 패턴 4: ClassName.methodName( → ClassName.swift 추론
  // 단, 패턴 1~3에서 이미 실제 .swift 파일을 찾았으면 추론을 건너뜀
  // (ChatService.getLastMessage() → ChatService.swift 같은 불필요한 추론 방지)
  if (files.length === 0) {
    const classPattern = /(\w+)\.\w+\(/g;
    while ((match = classPattern.exec(combined)) !== null) {
      const inferredFile = `${match[1]}.swift`;
      if (!files.some((f) => f.file === inferredFile)) {
        files.push({ file: inferredFile, line: null });
      }
    }
  }

  logger.log("📋 extractFileInfoFromIssue 결과:", { combined: combined.slice(0, 200), files });
  return files;
}

// =====================================================
// 2. GitHub 소스 코드 조회
// =====================================================

/**
 * 하이브리드 전략으로 GitHub 소스 코드를 조회합니다.
 *
 * 1차: 전체 경로를 이미 알면 repos.getContent 직접 조회 (API 1회)
 * 2차: search.code로 검색 (API 1회)
 * 3차: Git Tree로 폴백 — 전역 캐시 (인스턴스 수명 동안 5분 TTL)
 */

// 전역 Git Tree 캐시 (인스턴스가 살아있는 동안 유지)
let treeCache = { files: null, timestamp: 0 };
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5분

async function fetchSourceFromGithub(token, fileInfo) {
  const octokit = new Octokit({ auth: token });
  const { owner, repo, defaultBranch } = CONFIG.github;
  const results = [];

  async function getTreeFiles() {
    const now = Date.now();
    if (treeCache.files && (now - treeCache.timestamp) < TREE_CACHE_TTL) {
      logger.log(`📂 Git Tree 캐시 사용 (${treeCache.files.length}개 파일, ${Math.round((now - treeCache.timestamp) / 1000)}초 전)`);
      return treeCache.files;
    }
    const { data: refData } = await octokit.rest.git.getRef({
      owner, repo,
      ref: `heads/${defaultBranch}`,
    });
    const { data: tree } = await octokit.rest.git.getTree({
      owner, repo,
      tree_sha: refData.object.sha,
      recursive: "true",
    });
    treeCache.files = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
    treeCache.timestamp = now;
    logger.log(`📂 Git Tree 신규 조회: ${treeCache.files.length}개 파일`);
    return treeCache.files;
  }

  for (const item of fileInfo) {
    const file = item.file || item.filePath;
    const line = item.line;

    if (!file) {
      logger.warn("⚠️ 파일명이 없는 항목 건너뜀:", item);
      continue;
    }

    try {
      let filePath = null;

      // === 전략 1: 전체 경로면 직접 조회 (API 1회, 가장 빠름) ===
      if (file.includes("/")) {
        try {
          await octokit.rest.repos.getContent({ owner, repo, path: file, ref: defaultBranch });
          filePath = file;
          logger.log(`✅ [직접조회] ${file}`);
        } catch {
          // 경로가 틀릴 수 있음 → 다음 전략으로
        }
      }

      // === 전략 2: search.code 검색 ===
      if (!filePath) {
        try {
          const searchResult = await octokit.rest.search.code({
            q: `filename:${file.split("/").pop()} repo:${owner}/${repo}`,
            per_page: 3,
          });
          if (searchResult.data.total_count > 0) {
            // 전체 경로가 포함된 결과 우선, 없으면 첫 번째 결과
            const exactMatch = searchResult.data.items.find((i) => i.path === file);
            filePath = exactMatch ? exactMatch.path : searchResult.data.items[0].path;
            logger.log(`✅ [search.code] ${file} → ${filePath}`);
          }
        } catch (searchError) {
          logger.warn(`⚠️ search.code 실패 (${file}): ${searchError.message}`);
        }
      }

      // === 전략 3: Git Tree 폴백 (최후 수단) ===
      if (!filePath) {
        try {
          const allFiles = await getTreeFiles();
          const fileName = file.split("/").pop();
          const matchingPaths = allFiles.filter(
            (p) => p === file || p.endsWith(`/${fileName}`)
          );
          if (matchingPaths.length > 0) {
            filePath = matchingPaths[0];
            logger.log(`✅ [Git Tree 폴백] ${file} → ${filePath}`);
          }
        } catch (treeError) {
          logger.error(`❌ Git Tree 폴백도 실패: ${treeError.message}`);
        }
      }

      // 어떤 전략으로도 파일을 못 찾은 경우
      if (!filePath) {
        logger.warn(`❌ 파일 못 찾음: ${file} (모든 전략 실패)`);
        results.push({ file, line, content: null, fullContent: null, error: "파일을 찾을 수 없음" });
        continue;
      }

      // 파일 내용 조회
      const fileContent = await octokit.rest.repos.getContent({
        owner, repo,
        path: filePath,
        ref: defaultBranch,
      });
      const content = Buffer.from(fileContent.data.content, "base64").toString("utf-8");
      const lines = content.split("\n");

      // 크래시 라인 주변 코드 추출 (±20 lines)
      let excerpt;
      if (line) {
        const start = Math.max(0, line - 20);
        const end = Math.min(lines.length, line + 20);
        excerpt = lines
          .slice(start, end)
          .map((l, i) => {
            const lineNum = start + i + 1;
            const marker = lineNum === line ? " → " : "   ";
            return `${marker}${lineNum}: ${l}`;
          })
          .join("\n");
      } else {
        excerpt = lines.slice(0, 100).map((l, i) => `   ${i + 1}: ${l}`).join("\n");
      }

      // 최근 커밋 이력
      let recentCommits = "";
      try {
        const commits = await octokit.rest.repos.listCommits({
          owner, repo,
          path: filePath,
          per_page: 5,
        });
        recentCommits = commits.data
          .map((c) => `- ${c.commit.message.split("\n")[0]} (${c.commit.author.name}, ${c.commit.author.date.slice(0, 10)})`)
          .join("\n");
      } catch {
        recentCommits = "커밋 이력 조회 실패";
      }

      results.push({
        file,
        filePath,
        line,
        content: excerpt,
        fullContent: content,
        sha: fileContent.data.sha,
        recentCommits,
        error: null,
      });
    } catch (error) {
      logger.warn(`GitHub 파일 조회 실패 (${file}):`, error.message);
      results.push({ file, line, content: null, fullContent: null, error: error.message });
    }
  }
  return results;
}

// =====================================================
// 3. Claude AI 심층 분석
// =====================================================
async function analyzeWithClaude(apiKey, issue, typeLabel, sourceResults) {
  try {
    const client = new Anthropic({ apiKey });
    const crashTitle = (issue.title || "").toUpperCase();
    const patternHint =
      Object.entries(IOS_CRASH_PATTERNS)
        .filter(([key]) => crashTitle.includes(key))
        .map(([, desc]) => `• ${desc}`)
        .join("\n") || "특정 패턴 매칭 없음";

    let sourceContext = "소스 코드 조회를 수행하지 않았거나 실패했습니다.";
    if (sourceResults && sourceResults.length > 0) {
      sourceContext = sourceResults
        .map((r) => {
          if (r.error) return `### ${r.file} (라인 ${r.line || "N/A"})\n조회 실패: ${r.error}`;
          return `### ${r.filePath} (크래시 라인: ${r.line || "N/A"})
\`\`\`swift
${r.content}
\`\`\`

**최근 변경 이력:**
${r.recentCommits}`;
        })
        .join("\n\n");
    }

    const prompt = `당신은 iOS/Swift 크래시 분석 전문가입니다. Firebase Crashlytics에서 감지된 크래시를 분석해주세요.

## 크래시 정보
- 알림 유형: ${typeLabel}
- 에러 제목: ${issue.title || "N/A"}
- 상세 정보 (메서드/위치): ${issue.subtitle || "N/A"}
- 앱 버전: ${issue.appVersion || "N/A"}

## iOS 크래시 패턴 분석
${patternHint}

## 관련 소스 코드 (GitHub에서 조회)
${sourceContext}

---

다음 항목을 분석해주세요:

1. **🔍 근본 원인 (Root Cause)**
   에러명, 메서드, 소스 코드를 종합하여 크래시의 정확한 원인을 설명하세요.

2. **🔄 재현 시나리오**
   어떤 사용자 흐름에서 이 크래시가 발생할 수 있는지 1-2개 시나리오를 제시하세요.

3. **🛠️ 수정 코드**
   구체적인 Swift 코드 패치를 제안하세요. guard let, Optional 체이닝, nil 병합 등 적절한 방어 코드를 포함하세요.

4. **🛡️ 방어 코드 추가 제안**
   같은 패턴의 크래시를 예방할 수 있는 추가 방어 로직이 있다면 제안하세요.

5. **⚠️ 추가 위험 영역**
   같은 파일이나 프로젝트에서 비슷한 패턴의 위험이 있을 수 있는 곳을 지적하세요.

Slack 메시지에 표시될 내용이므로, Markdown 포맷으로 간결하게 작성해주세요. 각 항목은 3-5문장 이내.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0].text;
  } catch (error) {
    logger.error("Claude API 호출 실패:", error.message);
    return null;
  }
}

// =====================================================
// 3-B. Claude AI 코드 수정 생성 (PR용 — 구조화된 JSON 응답)
// =====================================================
async function generateFixWithClaude(apiKey, issue, sourceResults) {
  // 소스 코드가 있는 파일만 필터
  const fixableFiles = sourceResults.filter((r) => !r.error && r.fullContent);
  if (fixableFiles.length === 0) {
    logger.warn("수정 가능한 소스 파일이 없어 PR 생성을 건너뜁니다.");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });

    const filesContext = fixableFiles
      .map((r) => `### 파일: ${r.filePath} (크래시 라인: ${r.line || "N/A"})
\`\`\`swift
${r.fullContent}
\`\`\``)
      .join("\n\n");

    const prompt = `당신은 iOS/Swift 크래시를 수정하는 시니어 개발자입니다.

## 크래시 정보
- 에러: ${issue.title || "N/A"}
- 상세: ${issue.subtitle || "N/A"}

## 수정 대상 소스 코드 (전체 파일)
${filesContext}

---

위 크래시를 수정해주세요.

⚠️ 중요: 토큰 절약을 위해 **변경이 필요한 부분만** 포함해주세요.
fixedCode에는 수정된 **전체 파일 코드**를 넣되, 파일이 너무 길면 크래시와 무관한 부분은 원본 그대로 유지하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

\`\`\`json
{
  "fixes": [
    {
      "filePath": "수정할 파일의 정확한 경로",
      "fixedCode": "수정된 전체 파일 코드",
      "summary": "변경 내용 한줄 요약"
    }
  ],
  "prTitle": "간결한 PR 제목",
  "prDescription": "수정 내용 상세 설명 (Markdown)"
}
\`\`\`

중요 규칙:
- fixedCode는 해당 파일의 수정 완료된 **전체 코드**여야 합니다.
- 기존 코드 구조와 스타일을 최대한 유지하면서 크래시 원인만 수정하세요.
- guard let, Optional 체이닝, nil 병합 연산자 등 Swift 안전 패턴을 사용하세요.
- 불필요한 변경은 하지 마세요. 크래시 수정에 필요한 최소한의 변경만 하세요.
- JSON만 응답하고, \`\`\`json 마크다운 펜스로 감싸세요.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    });

    // 응답이 잘렸는지 확인
    if (response.stop_reason === "max_tokens") {
      logger.warn("⚠️ Claude 응답이 max_tokens로 잘림 — 토큰 부족");
    }

    const text = response.content[0].text;
    logger.log("🤖 Claude 응답 길이:", text.length, "stop_reason:", response.stop_reason);

    // JSON 파싱 (```json ... ``` 펜스 제거)
    let jsonStr;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // 펜스 없이 바로 JSON인 경우
      jsonStr = text;
    }

    // 잘린 JSON 복구 시도
    let parsed;
    try {
      parsed = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      logger.warn("⚠️ JSON 파싱 실패, 복구 시도:", parseError.message);

      // 잘린 JSON 복구: 열린 문자열/배열/객체 닫기
      let repaired = jsonStr.trim();
      // 잘린 문자열 닫기
      const openQuotes = (repaired.match(/"/g) || []).length;
      if (openQuotes % 2 !== 0) repaired += '"';
      // 닫히지 않은 배열/객체 닫기
      const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/]/g) || []).length;
      for (let i = 0; i < openBrackets; i++) repaired += "]";
      for (let i = 0; i < openBraces; i++) repaired += "}";

      try {
        parsed = JSON.parse(repaired);
        logger.log("✅ JSON 복구 성공");
      } catch {
        logger.error("❌ JSON 복구도 실패, 원본 길이:", text.length);
        return null;
      }
    }

    // 유효성 검증
    if (!parsed.fixes || !Array.isArray(parsed.fixes) || parsed.fixes.length === 0) {
      logger.error("Claude 수정 코드 응답에 fixes가 없습니다.");
      return null;
    }

    return parsed;
  } catch (error) {
    logger.error("Claude 수정 코드 생성 실패:", error.message);
    return null;
  }
}

// =====================================================
// 4. GitHub PR 생성
// =====================================================

/**
 * Claude가 생성한 수정 코드를 기반으로 GitHub PR을 생성합니다.
 *
 * 흐름:
 * 1. main 브랜치의 최신 커밋 SHA 조회
 * 2. 새 브랜치 생성 (fix/crashlytics-{issueId}-{timestamp})
 * 3. 수정된 파일들을 새 브랜치에 커밋
 * 4. PR 생성
 */
async function createFixPR(token, issue, fixData, sourceResults) {
  const octokit = new Octokit({ auth: token });
  const { owner, repo, defaultBranch } = CONFIG.github;
  const timestamp = Date.now();
  const issueId = (issue.id || "unknown").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const branchName = `fix/crashlytics-${issueId}-${timestamp}`;

  try {
    // Step 1: main 브랜치의 최신 커밋 SHA 조회
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    const baseSha = refData.object.sha;

    // Step 2: 새 브랜치 생성
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    logger.log(`브랜치 생성 완료: ${branchName}`);

    // Step 3: 수정된 파일들을 새 브랜치에 커밋
    for (const fix of fixData.fixes) {
      // sourceResults에서 해당 파일의 SHA 찾기 (업데이트에 필요)
      const sourceFile = sourceResults.find((s) => s.filePath === fix.filePath);
      
      if (sourceFile && sourceFile.sha) {
        // 기존 파일 업데이트
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: fix.filePath,
          message: `fix: ${fix.summary}`,
          content: Buffer.from(fix.fixedCode, "utf-8").toString("base64"),
          sha: sourceFile.sha,
          branch: branchName,
        });
      } else {
        // SHA를 모르는 경우: 새 브랜치에서 직접 조회
        try {
          const { data: currentFile } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: fix.filePath,
            ref: branchName,
          });
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fix.filePath,
            message: `fix: ${fix.summary}`,
            content: Buffer.from(fix.fixedCode, "utf-8").toString("base64"),
            sha: currentFile.sha,
            branch: branchName,
          });
        } catch {
          logger.warn(`파일 SHA 조회 실패, 새 파일로 생성: ${fix.filePath}`);
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: fix.filePath,
            message: `fix: ${fix.summary}`,
            content: Buffer.from(fix.fixedCode, "utf-8").toString("base64"),
            branch: branchName,
          });
        }
      }

      logger.log(`파일 커밋 완료: ${fix.filePath}`);
    }

    // Step 4: PR 생성
    const fixSummaries = fixData.fixes.map((f) => `- \`${f.filePath}\`: ${f.summary}`).join("\n");

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: fixData.prTitle || `[Crashlytics Fix] ${issue.title}`,
      body: `## 🤖 AI 자동 크래시 수정 PR

### 크래시 정보
- **에러:** \`${issue.title || "N/A"}\`
- **상세:** \`${issue.subtitle || "N/A"}\`
- **앱 버전:** ${issue.appVersion || "N/A"}

### 수정 내용
${fixSummaries}

### 상세 설명
${fixData.prDescription || "Claude AI가 분석한 크래시 원인을 기반으로 수정 코드를 생성했습니다."}

---

> ⚠️ **이 PR은 AI가 자동 생성한 것입니다.** 반드시 코드 리뷰 후 머지해주세요.
> 🤖 Generated by Crashlytics AI Bot`,
      head: branchName,
      base: defaultBranch,
    });

    // PR에 라벨 추가
    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: ["bug", "crashlytics", "ai-fix"],
      });
    } catch {
      logger.warn("PR 라벨 추가 실패 (라벨이 없을 수 있음)");
    }

    logger.log(`PR 생성 완료: #${pr.number} ${pr.html_url}`);
    return pr;
  } catch (error) {
    logger.error("PR 생성 실패:", error.message);

    // 실패 시 생성한 브랜치 정리 시도
    try {
      await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
    } catch {
      // 무시
    }

    throw error;
  }
}

// =====================================================
// 5. Slack 메시지 발송 (Bot API — 쓰레드 지원)
// =====================================================
async function postInitialAlert(botToken, event, typeLabel, emoji) {
  const slack = new WebClient(botToken);
  const payload = event.data?.payload || event.payload || event.data;
  const issue = payload?.issue;

  if (!issue) {
    logger.error(`${typeLabel} 이슈 데이터 없음`);
    return null;
  }

  const fullAppId = event.appId || "ID 확인 불가";
  const platform = fullAppId.includes("ios") ? "🍎 iOS" : "Unknown";

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
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*에러명:*\n\`${issue.title}\`\n*상세:*\n\`${issue.subtitle}\``,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "🤖 AI 분석 중... 잠시 후 쓰레드에 결과가 달립니다." },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Firebase 콘솔에서 보기" },
          style: "danger",
          url: `https://console.firebase.google.com/project/${event.project}/crashlytics`,
        },
      ],
    },
  ];

  try {
    const result = await slack.chat.postMessage({
      channel: CONFIG.slack.channelId,
      text: `${emoji} ${typeLabel}: ${issue.title}`,
      blocks,
    });
    return result.ts;
  } catch (error) {
    logger.error("Slack 초기 알림 전송 실패:", error.message);
    return null;
  }
}

/**
 * 분석 결과를 쓰레드 답글로 전송합니다.
 * sourceResults 정보도 value에 포함하여 인터랙션에서 PR 생성에 활용합니다.
 */
async function postAnalysisThread(botToken, threadTs, analysis, issue, sourceResults) {
  const slack = new WebClient(botToken);

  const analysisText = analysis || "분석을 수행할 수 없었습니다. 데이터가 부족합니다.";

  // Slack section block은 3000자 제한 — 긴 분석은 여러 블록으로 분할
  const SLACK_BLOCK_LIMIT = 2900; // 여유분 포함
  const analysisChunks = [];
  for (let i = 0; i < analysisText.length; i += SLACK_BLOCK_LIMIT) {
    analysisChunks.push(analysisText.slice(i, i + SLACK_BLOCK_LIMIT));
  }

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "🤖 AI 크래시 분석 결과", emoji: true },
    },
    { type: "divider" },
  ];

  // 분석 텍스트 블록들 추가
  for (const chunk of analysisChunks) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  // 소스 코드 링크
  if (sourceResults && sourceResults.length > 0) {
    const fileLinks = sourceResults
      .filter((r) => !r.error && r.filePath)
      .map(
        (r) =>
          `<https://github.com/${CONFIG.github.owner}/${CONFIG.github.repo}/blob/${CONFIG.github.defaultBranch}/${r.filePath}#L${r.line || 1}|${r.filePath}:${r.line || ""}>`
      )
      .join("\n");

    if (fileLinks) {
      blocks.push(
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: `📂 *관련 소스 코드:*\n${fileLinks}` },
        }
      );
    }
  }

  // 버튼 데이터 구성 — Slack value 제한(2000자)에 유의
  // 소스 코드 전체는 넣을 수 없으므로 파일 경로 정보만 전달하고,
  // 인터랙션 핸들러에서 GitHub API로 다시 조회합니다.
  const buttonData = {
    title: issue.title || "Unknown crash",
    subtitle: issue.subtitle || "",
    appVersion: issue.appVersion || "",
    files: (sourceResults || [])
      .filter((r) => !r.error && r.filePath)
      .map((r) => ({ filePath: r.filePath, line: r.line })),
  };

  const buttonValue = JSON.stringify(buttonData);

  // 액션 버튼들
  const actionElements = [
    {
      type: "button",
      text: { type: "plain_text", text: "🐛 GitHub Issue 생성" },
      action_id: "create_github_issue",
      value: buttonValue,
    },
  ];

  // 수정 가능한 소스 파일이 있을 때만 PR 버튼 표시
  const hasFixableFiles = sourceResults?.some((r) => !r.error && r.filePath);
  if (hasFixableFiles) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "🔀 수정 PR 생성" },
      style: "primary",
      action_id: "create_fix_pr",
      value: buttonValue,
      confirm: {
        title: { type: "plain_text", text: "수정 PR을 생성할까요?" },
        text: {
          type: "mrkdwn",
          text: "Claude AI가 크래시 원인을 분석하고 수정 코드를 생성하여 PR을 만듭니다.\n\n⚠️ *반드시 코드 리뷰 후 머지해주세요.*",
        },
        confirm: { type: "plain_text", text: "PR 생성" },
        deny: { type: "plain_text", text: "취소" },
      },
    });
  }

  blocks.push(
    { type: "divider" },
    { type: "actions", elements: actionElements }
  );

  try {
    await slack.chat.postMessage({
      channel: CONFIG.slack.channelId,
      thread_ts: threadTs,
      text: "AI 크래시 분석 결과",
      blocks,
    });
    await slack.reactions.add({
      channel: CONFIG.slack.channelId,
      name: "white_check_mark",
      timestamp: threadTs,
    });
  } catch (error) {
    logger.error("분석 쓰레드 전송 실패:", error.message);
  }
}

// =====================================================
// 6. 메인 파이프라인
// =====================================================
async function crashAnalysisPipeline(event, typeLabel, emoji) {
  const payload = event.data?.payload || event.payload || event.data;
  const issue = payload?.issue;

  if (!issue) {
    logger.error("이슈 데이터 없음, 파이프라인 종료");
    return;
  }

  const botToken = SLACK_BOT_TOKEN.value();
  const githubToken = GITHUB_TOKEN.value();
  const anthropicKey = ANTHROPIC_KEY.value();

  // Step 1: Slack에 초기 알림 전송 (즉시)
  const threadTs = await postInitialAlert(botToken, event, typeLabel, emoji);
  if (!threadTs) return;

  try {
    // Step 2: 이슈 정보에서 파일/라인 추출
    const fileInfo = extractFileInfoFromIssue(issue);
    logger.log("추출된 파일 정보:", fileInfo);

    // Step 3: GitHub에서 소스 코드 조회
    let sourceResults = [];
    if (fileInfo.length > 0) {
      sourceResults = await fetchSourceFromGithub(githubToken, fileInfo);
      logger.log("소스 코드 조회 결과:", sourceResults.map((r) => ({
        file: r.file,
        found: !r.error,
      })));
    }

    // Step 4: Claude AI 심층 분석 (재시도 1회 포함)
    let analysis = await analyzeWithClaude(anthropicKey, issue, typeLabel, sourceResults);
    if (!analysis) {
      logger.warn("⚠️ Claude 분석 첫 번째 시도 실패, 5초 후 재시도...");
      await new Promise((r) => setTimeout(r, 5000));
      analysis = await analyzeWithClaude(anthropicKey, issue, typeLabel, sourceResults);
    }

    // Step 5: 분석 결과를 쓰레드로 전송
    await postAnalysisThread(botToken, threadTs, analysis, issue, sourceResults);
  } catch (error) {
    logger.error("파이프라인 실패:", error.message, error.stack);
    // 실패해도 Slack 쓰레드에 에러 메시지 표시
    try {
      const slack = new WebClient(botToken);
      await slack.chat.postMessage({
        channel: CONFIG.slack.channelId,
        thread_ts: threadTs,
        text: `❌ AI 분석 중 오류가 발생했습니다: ${error.message}\n\n수동으로 확인해주세요.`,
      });
    } catch {
      logger.error("에러 메시지 전송도 실패");
    }
  }
}

// =====================================================
// 7. Cloud Functions 트리거
// =====================================================
const allSecrets = {
  secrets: [SLACK_BOT_TOKEN, SLACK_WEBHOOK, ANTHROPIC_KEY, GITHUB_TOKEN],
  timeoutSeconds: 300,   // 5분 (Git Tree 조회 + Claude 분석에 충분한 시간)
  memory: "512MiB",      // Git Tree 17K+ 파일 처리에 여유 메모리
};

exports.postFatalToSlack = onNewFatalIssuePublished(allSecrets, async (event) => {
  await crashAnalysisPipeline(event, "초기 치명적 문제 발생", "🔥");
});

exports.postNonFatalToSlack = onNewNonfatalIssuePublished(allSecrets, async (event) => {
  await crashAnalysisPipeline(event, "신규 비치명적 문제 발생", "✨");
});

exports.postRegressionToSlack = onRegressionAlertPublished(allSecrets, async (event) => {
  await crashAnalysisPipeline(event, "회귀됨 (다시 발생한 이슈)", "↩️");
});

exports.postVelocityToSlack = onVelocityAlertPublished(allSecrets, async (event) => {
  await crashAnalysisPipeline(event, "반복되는 문제 (폭주 알림)", "📈");
});

// =====================================================
// 8. Slack 인터랙션 핸들러 (Issue 생성 + PR 생성)
// =====================================================
//
// ⚠️ Gen 2 Cloud Functions 주의사항:
// - Gen 2에서는 res.send() 이후 CPU가 스로틀링될 수 있어 비동기 코드가 실행 안 됨
// - 따라서 모든 작업을 완료한 후 res.send()를 호출해야 합니다.
// - Slack 3초 타임아웃은 발생할 수 있지만, Slack API로 직접 메시지를 보내므로 사용자는 결과를 받습니다.
//
exports.slackInteraction = onRequest(
  { secrets: [SLACK_BOT_TOKEN, ANTHROPIC_KEY, GITHUB_TOKEN], cors: true, timeoutSeconds: 300 },
  async (req, res) => {
    logger.log("🔔 slackInteraction 호출됨", {
      method: req.method,
      contentType: req.headers["content-type"],
      hasBody: !!req.body,
      hasPayload: !!(req.body && req.body.payload),
    });

    // Slack은 application/x-www-form-urlencoded로 payload를 보냄
    let payload;
    try {
      const rawPayload = req.body?.payload || req.body;
      payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    } catch (parseErr) {
      logger.error("payload 파싱 실패:", parseErr.message, "raw body:", JSON.stringify(req.body).slice(0, 500));
      res.status(200).send("ok");
      return;
    }

    logger.log("📦 payload 파싱 완료:", {
      type: payload?.type,
      actionId: payload?.actions?.[0]?.action_id,
    });

    if (!payload || payload.type !== "block_actions") {
      logger.log("block_actions가 아님, 무시");
      res.status(200).send("ok");
      return;
    }

    const action = payload.actions[0];
    const channelId = payload.channel?.id;
    const threadTs = payload.message?.thread_ts || payload.message?.ts;

    logger.log("🎯 액션:", action.action_id, "채널:", channelId, "쓰레드:", threadTs);

    // ★ 모든 작업을 완료한 후에 res.send() 호출 (Gen 2 호환)
    try {
      const slack = new WebClient(SLACK_BOT_TOKEN.value());
      const octokit = new Octokit({ auth: GITHUB_TOKEN.value() });

      // ── GitHub Issue 생성 ────────────────────────
      if (action.action_id === "create_github_issue") {
        const crashInfo = JSON.parse(action.value);
        logger.log("📝 GitHub Issue 생성 시작");

        const { data: ghIssue } = await octokit.rest.issues.create({
          owner: CONFIG.github.owner,
          repo: CONFIG.github.repo,
          title: `[Crash] ${crashInfo.title}`,
          body: `## Crashlytics 자동 리포트

**에러:** \`${crashInfo.title}\`
**상세:** \`${crashInfo.subtitle}\`
**앱 버전:** ${crashInfo.appVersion}

---

> 이 이슈는 Crashlytics AI 분석 봇에 의해 자동 생성되었습니다.
> Slack 쓰레드에서 AI 분석 결과를 확인하세요.`,
          labels: ["bug", "crashlytics", "auto-generated"],
        });

        logger.log("✅ GitHub Issue 생성 완료:", ghIssue.html_url);

        await slack.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `✅ GitHub Issue 생성 완료: <${ghIssue.html_url}|#${ghIssue.number} ${ghIssue.title}>`,
        });
      }

      // ── 수정 PR 생성 ─────────────────────────────
      if (action.action_id === "create_fix_pr") {
        const crashInfo = JSON.parse(action.value);
        logger.log("🔀 PR 생성 시작, files:", crashInfo.files);

        // 진행 상태 메시지
        const statusMsg = await slack.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: "🔄 수정 PR을 생성하고 있습니다...\n\n① 소스 코드 조회 중...",
        });

        try {
          // Step 1: GitHub에서 소스 코드 다시 조회 (fullContent 포함)
          logger.log("📂 GitHub 소스 코드 조회 중...");
          const sourceResults = await fetchSourceFromGithub(
            GITHUB_TOKEN.value(),
            crashInfo.files
          );
          logger.log("📂 소스 코드 조회 완료:", sourceResults.map(r => ({
            file: r.file,
            found: !r.error,
            hasContent: !!r.fullContent,
          })));

          await slack.chat.update({
            channel: channelId,
            ts: statusMsg.ts,
            text: "🔄 수정 PR을 생성하고 있습니다...\n\n① 소스 코드 조회 ✅\n② Claude AI가 수정 코드 생성 중...",
          });

          // Step 2: Claude에게 수정 코드 생성 요청
          logger.log("🤖 Claude 수정 코드 생성 요청 중...");
          const fixData = await generateFixWithClaude(
            ANTHROPIC_KEY.value(),
            crashInfo,
            sourceResults
          );

          if (!fixData) {
            logger.error("❌ Claude 수정 코드 생성 실패 — null 반환");
            await slack.chat.update({
              channel: channelId,
              ts: statusMsg.ts,
              text: "❌ 수정 코드를 생성할 수 없었습니다. 소스 코드가 부족하거나 Claude API 오류가 발생했습니다.",
            });
            res.status(200).send("ok");
            return;
          }

          logger.log("🤖 수정 코드 생성 완료:", fixData.fixes?.length, "개 파일");

          await slack.chat.update({
            channel: channelId,
            ts: statusMsg.ts,
            text: "🔄 수정 PR을 생성하고 있습니다...\n\n① 소스 코드 조회 ✅\n② 수정 코드 생성 ✅\n③ GitHub에 브랜치 생성 및 커밋 중...",
          });

          // Step 3: GitHub PR 생성
          logger.log("🔀 GitHub PR 생성 중...");
          const pr = await createFixPR(
            GITHUB_TOKEN.value(),
            crashInfo,
            fixData,
            sourceResults
          );

          logger.log("✅ PR 생성 완료:", pr.html_url);

          const fixSummaries = fixData.fixes
            .map((f) => `• \`${f.filePath}\` — ${f.summary}`)
            .join("\n");

          await slack.chat.update({
            channel: channelId,
            ts: statusMsg.ts,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `✅ *수정 PR 생성 완료!*\n\n<${pr.html_url}|#${pr.number} ${pr.title}>`,
                },
              },
              { type: "divider" },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `📝 *수정 내용:*\n${fixSummaries}`,
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: "⚠️ AI가 자동 생성한 코드입니다. 반드시 코드 리뷰 후 머지해주세요.",
                  },
                ],
              },
            ],
            text: `✅ 수정 PR 생성 완료: #${pr.number}`,
          });

        } catch (error) {
          logger.error("PR 생성 파이프라인 실패:", error.message, error.stack);
          try {
            await slack.chat.update({
              channel: channelId,
              ts: statusMsg.ts,
              text: `❌ PR 생성 실패: ${error.message}`,
            });
          } catch (e) {
            logger.error("에러 메시지 전송도 실패:", e.message);
          }
        }
      }

    } catch (error) {
      logger.error("인터랙션 처리 실패:", error.message, error.stack);
    }

    // ★ 모든 작업 완료 후 응답 (Gen 2에서 비동기 작업 보장)
    res.status(200).send("ok");
  }
);

// =====================================================
// 9. 테스트용 HTTP 트리거 (AppView2.swift 실제 크래시 시나리오)
// =====================================================
//
// 사용법:
//   curl ".../testCrashAlert"                          ← 랜덤 시나리오
//   curl ".../testCrashAlert?scenario=fatal_error"     ← 특정 시나리오
//   curl ".../testCrashAlert?scenario=all"             ← 전체 순차 실행
//   curl ".../testCrashAlert?scenario=list"            ← 시나리오 목록 조회

exports.testCrashAlert = onRequest(
  { secrets: [SLACK_BOT_TOKEN, SLACK_WEBHOOK, ANTHROPIC_KEY, GITHUB_TOKEN], cors: true },
  async (req, res) => {

    // ── CrashScenarios.swift + AppView2.swift 실제 크래시 시나리오 ──
    const TEST_SCENARIOS = [
      // --- CrashScenarios.swift 시나리오 ---
      {
        id: "force_unwrap_user",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - UserService.getCurrentUserName() line 53",
        appVersion: "1.0.2",
        description: "크래시1: currentUser가 nil인 상태에서 강제 언래핑",
      },
      {
        id: "nested_optional",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - UserService.getFirstFriendEmail() line 58",
        appVersion: "1.0.2",
        description: "크래시2: currentUser!.friends! 이중 강제 언래핑 + friends[0].email! 삼중 강제 언래핑",
      },
      {
        id: "dict_force_unwrap",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - UserService.getCachedUser(id:) line 63",
        appVersion: "1.0.2",
        description: "크래시3: Dictionary에 존재하지 않는 키 강제 언래핑",
      },
      {
        id: "division_empty_array",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - CartService.getAveragePrice() line 71",
        appVersion: "1.0.2",
        description: "크래시4: 빈 배열 count(0)로 나누기 — NaN/Infinity 발생",
      },
      {
        id: "empty_filter_index",
        title: "Fatal error: Index out of range",
        subtitle: "CrashScenarios.swift - CartService.getMostDiscountedItem() line 77",
        appVersion: "1.0.2",
        description: "크래시5: filter 결과가 빈 배열인데 [0] 접근",
      },
      {
        id: "force_cast",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - CartService.processPayment(method:) line 82",
        appVersion: "1.0.2",
        description: "크래시6: Int를 String으로 강제 캐스팅 (as!) 실패",
      },
      {
        id: "race_condition",
        title: "EXC_BAD_ACCESS (code=1, address=0x0)",
        subtitle: "CrashScenarios.swift - OrderService.fetchOrdersAsync(completion:) line 101",
        appVersion: "1.0.2",
        description: "크래시7: 멀티스레드에서 Array 동시 읽기/쓰기 레이스 컨디션",
      },
      {
        id: "order_not_found",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - OrderService.getOrderShippingLabel(orderId:) line 109",
        appVersion: "1.0.2",
        description: "크래시8: 존재하지 않는 주문의 옵셔널 프로퍼티 연쇄 강제 언래핑",
      },
      {
        id: "invalid_url",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - NetworkManager.fetchData(from:) line 118",
        appVersion: "1.0.2",
        description: "크래시9: 한글/공백 포함 URL을 URL(string:)!로 강제 변환",
      },
      {
        id: "json_type_mismatch",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - NetworkManager.parseResponse(data:) line 124",
        appVersion: "1.0.2",
        description: "크래시10: JSON의 String을 Int로 강제 캐스팅 + null을 Double로 강제 캐스팅",
      },
      // --- AppView2.swift 기존 시나리오 ---
      {
        id: "appview2_fatal",
        title: "[CrashlyticsReport.debug.dylib] AppView2.swift - closure #1 in closure #1 in AppView2.body.getter",
        subtitle: "EXC_BREAKPOINT",
        appVersion: "1.0.2",
        description: "AppView2: fatalError() 호출 (약 33번 줄)",
      },
      {
        id: "appview2_index",
        title: "Fatal error: Index out of range",
        subtitle: "AppView2.swift - closure #3 in closure #1 in AppView2.body.getter",
        appVersion: "1.0.2",
        description: "AppView2: array[4] 접근, 크기 3 (약 41번 줄)",
      },
      // --- CrashScenarios.swift 추가 시나리오 (11~30) ---
      {
        id: "empty_last_message",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - ChatService.getLastMessage() line 180",
        appVersion: "1.0.2",
        description: "크래시11: 빈 messages 배열에서 .last! 강제 언래핑",
      },
      {
        id: "string_index_overflow",
        title: "Fatal error: String index is out of bounds",
        subtitle: "CrashScenarios.swift - ChatService.getMessagePreview(messageId:) line 187",
        appVersion: "1.0.2",
        description: "크래시12: 50자 미만 문자열에서 offsetBy: 50 접근",
      },
      {
        id: "remove_at_invalid",
        title: "Fatal error: Index out of range",
        subtitle: "CrashScenarios.swift - ChatService.removeTypingUser(at:) line 193",
        appVersion: "1.0.2",
        description: "크래시13: 빈 배열에서 remove(at: 5) 호출",
      },
      {
        id: "invalid_regex",
        title: "NSInternalInconsistencyException",
        subtitle: "CrashScenarios.swift - SearchService.searchWithRegex(pattern:in:) line 201",
        appVersion: "1.0.2",
        description: "크래시14: 잘못된 정규식 패턴 [invalid(regex 으로 NSRegularExpression 생성 실패",
      },
      {
        id: "search_cache_miss",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - SearchService.getTopSearchResult(query:) line 209",
        appVersion: "1.0.2",
        description: "크래시15: 캐시에 없는 검색어 Dictionary 강제 언래핑 + 빈 배열 [0] 접근",
      },
      {
        id: "pagination_overflow",
        title: "Fatal error: Range requires lowerBound <= upperBound",
        subtitle: "CrashScenarios.swift - SearchService.getSearchPage(query:page:pageSize:) line 216",
        appVersion: "1.0.2",
        description: "크래시16: page=999 페이지네이션 범위 초과 Array 슬라이싱",
      },
      {
        id: "nil_deeplink",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - NotificationService.handleNotification(_:) line 225",
        appVersion: "1.0.2",
        description: "크래시17: nil 딥링크 + 잘못된 URL 강제 언래핑 + pathComponents 범위 초과",
      },
      {
        id: "payload_type_error",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - NotificationService.getNotificationTitle(_:) line 233",
        appVersion: "1.0.2",
        description: "크래시18: payload 딕셔너리 Int→String, String→Int 강제 캐스팅 실패",
      },
      {
        id: "badge_overflow",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - NotificationService.incrementBadge(for:) line 240",
        appVersion: "1.0.2",
        description: "크래시19: 존재하지 않는 키 강제 언래핑 + Int.max 오버플로우",
      },
      {
        id: "empty_shuffle",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - MediaService.getShuffledTrack() line 250",
        appVersion: "1.0.2",
        description: "크래시20: 빈 playlist에서 .randomElement()! 강제 언래핑",
      },
      {
        id: "negative_index",
        title: "Fatal error: Index out of range",
        subtitle: "CrashScenarios.swift - MediaService.getPreviousTrack(currentIndex:) line 256",
        appVersion: "1.0.2",
        description: "크래시21: currentIndex=0에서 -1 → 음수 인덱스 배열 접근",
      },
      {
        id: "int_exact_fail",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - MediaService.getTrackProgress(current:total:) line 262",
        appVersion: "1.0.2",
        description: "크래시22: 40.944...% 소수점을 Int(exactly:)!로 변환 실패",
      },
      {
        id: "settings_type_mismatch",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - ProfileService.getNotificationPreference() line 271",
        appVersion: "1.0.2",
        description: "크래시23: 존재하지 않는 설정 키 강제 언래핑 + 타입 불일치 as! Bool",
      },
      {
        id: "empty_languages",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - ProfileService.getPrimaryLanguage() line 278",
        appVersion: "1.0.2",
        description: "크래시24: 빈 언어 배열 .first! 강제 언래핑",
      },
      {
        id: "string_to_int_fail",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - ProfileService.getUserAge() line 284",
        appVersion: "1.0.2",
        description: "크래시25: 'twenty' 문자열을 Int()!로 변환 실패",
      },
      {
        id: "cache_miss_image",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - CacheManager.getCachedImage(key:) line 293",
        appVersion: "1.0.2",
        description: "크래시26: NSCache에 없는 키 강제 언래핑 + UIImage 강제 캐스팅",
      },
      {
        id: "file_not_found",
        title: "NSCocoaErrorDomain (260)",
        subtitle: "CrashScenarios.swift - CacheManager.getCacheFileSize(at:) line 299",
        appVersion: "1.0.2",
        description: "크래시27: 빈 배열 인덱스 접근 + 존재하지 않는 파일 경로 attributesOfItem 실패",
      },
      {
        id: "date_format_mismatch",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - DateFormatterService.parseServerDate(dateString:) line 308",
        appVersion: "1.0.2",
        description: "크래시28: ISO8601 포맷에 맞지 않는 날짜 문자열 강제 언래핑",
      },
      {
        id: "date_calc_fail",
        title: "EXC_BREAKPOINT",
        subtitle: "CrashScenarios.swift - DateFormatterService.getDaysBetween(start:end:) line 315",
        appVersion: "1.0.2",
        description: "크래시29: 파싱 불가능한 날짜 문자열 'not-a-date' 강제 언래핑",
      },
      {
        id: "codable_infinity",
        title: "NSInvalidArgumentException",
        subtitle: "CrashScenarios.swift - DeepCopyService.deepCopy(object:) line 325",
        appVersion: "1.0.2",
        description: "크래시30: Double.infinity를 JSONEncoder로 인코딩 시 try! 실패",
      },
    ];

    const scenarioId = req.query.scenario || (req.method === "POST" && req.body?.scenario);

    // "all" 모드: 모든 시나리오 순차 실행
    if (scenarioId === "all") {
      const results = [];
      for (const scenario of TEST_SCENARIOS) {
        const fakeEvent = buildFakeEvent(scenario);
        try {
          await crashAnalysisPipeline(fakeEvent, `🧪 [테스트] ${scenario.description}`, "🧪");
          results.push({ id: scenario.id, success: true });
        } catch (error) {
          results.push({ id: scenario.id, success: false, error: error.message });
        }
      }
      res.status(200).json({ success: true, results });
      return;
    }

    // "list" 모드: 시나리오 목록 조회
    if (scenarioId === "list") {
      res.status(200).json({
        scenarios: TEST_SCENARIOS.map((s) => ({
          id: s.id,
          description: s.description,
          title: s.title,
          subtitle: s.subtitle,
        })),
        usage: {
          random: "GET /testCrashAlert",
          specific: "GET /testCrashAlert?scenario=index_out_of_range",
          all: "GET /testCrashAlert?scenario=all",
          custom: "POST /testCrashAlert with JSON body { title, subtitle, appVersion }",
        },
      });
      return;
    }

    // POST body로 커스텀 데이터
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
        res.status(400).json({
          error: `시나리오 '${scenarioId}'을(를) 찾을 수 없습니다.`,
          available: TEST_SCENARIOS.map((s) => ({ id: s.id, description: s.description })),
        });
        return;
      }
      issueData = { id: `TEST_${scenario.id}`, ...scenario };
    }

    const fakeEvent = buildFakeEvent(issueData);
    try {
      logger.log("🧪 테스트 크래시 알림 실행:", issueData);
      const label = issueData.description
        ? `🧪 [테스트] ${issueData.description}`
        : "🧪 [테스트] 크래시 알림";
      await crashAnalysisPipeline(fakeEvent, label, "🧪");
      res.status(200).json({ success: true, issue: issueData });
    } catch (error) {
      logger.error("테스트 실행 실패:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

function buildFakeEvent(issueData) {
  return {
    appId: "1:240595016161:ios:d252a48f861e6f240d5aa0",
    specversion: "1.0",
    project: CONFIG.firebase.projectId,
    data: { payload: { issue: issueData } },
    payload: { issue: issueData },
  };
}