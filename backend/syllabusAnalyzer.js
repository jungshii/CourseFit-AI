
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const GATEWAY =
  "https://factchat-cloud.mindlogic.ai/v1/gateway";

const PDFTOTEXT_PATH =
  process.env.PDFTOTEXT_PATH ||
  "C:\\poppler\\Library\\bin\\pdftotext.exe";

const evaluationKeys = [
  "teamProject",
  "quiz",
  "presentation",
  "assignment",
  "midterm",
  "finalExam",
  "attendance",
];

// ==========================================
// 1. PDF 텍스트 추출 (Poppler 사용)
// ==========================================
async function extractPdfText(buffer) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "coursefit-")
  );

  const pdfPath = path.join(tempDir, "input.pdf");
  const textPath = path.join(tempDir, "output.txt");

  try {
    if (!fs.existsSync(PDFTOTEXT_PATH)) {
      throw new Error(
        `PDFTOTEXT_NOT_FOUND: ${PDFTOTEXT_PATH}`
      );
    }

    fs.writeFileSync(pdfPath, buffer);

    await execFileAsync(
      PDFTOTEXT_PATH,
      [
        "-layout",
        "-enc",
        "UTF-8",
        pdfPath,
        textPath,
      ],
      {
        timeout: 30000,
        windowsHide: true,
      }
    );

    const text = fs.readFileSync(
      textPath,
      "utf8"
    ).trim();

    if (text.length < 30) {
      throw new Error("PDF_TEXT_EMPTY");
    }

    if (text.length > 40000) {
      throw new Error("PDF_TEXT_TOO_LONG");
    }

    return text;
  } finally {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

// ==========================================
// 2. AI JSON 응답 검증
// ==========================================
function parseAIJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const data = JSON.parse(cleaned);

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error("INVALID_AI_JSON");
  }

  const evaluations = {};

  for (const key of evaluationKeys) {
    const value = data.evaluations?.[key];

    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error(`MISSING_FIELD_${key}`);
    }

    if (
      value.exists !== null &&
      typeof value.exists !== "boolean"
    ) {
      throw new Error(`INVALID_EXISTS_${key}`);
    }

    if (
      value.weight !== null &&
      (
        typeof value.weight !== "number" ||
        !Number.isFinite(value.weight) ||
        value.weight < 0 ||
        value.weight > 100
      )
    ) {
      throw new Error(`INVALID_WEIGHT_${key}`);
    }

    evaluations[key] = {
      exists: value.exists,
      weight: value.weight,
      evidence:
        typeof value.evidence === "string"
          ? value.evidence
          : null,
    };
  }

  const originalEvaluations =
    Array.isArray(data.originalEvaluations)
      ? data.originalEvaluations.map((item) => {
          if (
            typeof item.name !== "string" ||
            typeof item.weight !== "number" ||
            !Number.isFinite(item.weight) ||
            item.weight < 0 ||
            item.weight > 100
          ) {
            throw new Error(
              "INVALID_ORIGINAL_EVALUATION"
            );
          }

          return {
            name: item.name,
            weight: item.weight,
            evidence:
              typeof item.evidence === "string"
                ? item.evidence
                : null,
          };
        })
      : [];

  const total = originalEvaluations.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  if (total > 100.01) {
    throw new Error(
      "EVALUATION_TOTAL_EXCEEDS_100"
    );
  }

  return {
    courseName:
      typeof data.courseName === "string"
        ? data.courseName
        : null,

    courseCode:
      typeof data.courseCode === "string"
        ? data.courseCode
        : null,

    credits:
      typeof data.credits === "number" &&
      Number.isFinite(data.credits) &&
      data.credits >= 0
        ? data.credits
        : null,

    summary:
      typeof data.summary === "string"
        ? data.summary
        : null,

    evaluations,
    originalEvaluations,

    additionalDetails:
      typeof data.additionalDetails === "string"
        ? data.additionalDetails
        : null,
  };
}

// ==========================================
// 3. ChatKHU AI 강의계획서 분석
// ==========================================
async function analyzeSyllabus(text) {
  if (
    !process.env.CHATKHU_API_KEY ||
    !process.env.CHATKHU_MODEL
  ) {
    throw new Error(
      "CHATKHU_CONFIG_MISSING"
    );
  }

  const systemPrompt = `
당신은 경희대학교 강의계획서의 정보 추출기입니다.

입력 문서는 여러 페이지의 강의계획서입니다.
강의 기본 정보와 성적 평가표를 구별해서 분석하세요.

반드시 유효한 JSON 객체 하나만 반환하세요.
Markdown 코드블록과 추가 설명은 출력하지 마세요.

[과목 기본 정보 추출]
- 과목명은 "강좌명", "강 좌 명", "교과목명", "과목명" 필드에서 추출하세요.
- 절대로 주차별 강의 제목을 과목명으로 사용하지 마세요.
- 학수번호-분반은 courseCode에 넣으세요.
- 학점은 credits에 숫자로 넣으세요.
- summary는 수업 개요와 목표를 요약하세요.
- 필드를 확인할 수 없으면 null을 반환하세요.

[평가 정보 추출]
- "평가 항목", "평가 비율(%)", "성적 평가" 표를 우선 분석하세요.
- 원본 평가표의 항목과 비중은 originalEvaluations에 그대로 보존하세요.
- 평가 비중과 수업 활동의 존재 여부를 구분하세요.
- 0%라고 명시된 항목은 weight=0으로 보존하세요.
- 비중 미기재는 weight=null로 반환하세요.
- 별도 팀 프로젝트가 없더라도 조별 발표는 있을 수 있습니다.
- 조별 발표를 무조건 팀 프로젝트로 분류하지 마세요.
- "기타" 항목에 참여도와 수시 평가가 포함되어 있다면 additionalDetails에 설명하세요.
- 기타 항목의 하위 비율을 전체 평가 비율에 중복 합산하지 마세요.
- 근거가 불명확한 정보는 추측하지 마세요.

[exists의 의미]
true: 평가 또는 활동의 존재가 확인됨.
false: 명시적으로 없거나 해당 평가 비중이 0%임.
null: 존재 여부를 확인할 수 없음.

단, 0%이더라도 수업 활동 자체가 명시되어 있다면
exists=true, weight=0으로 기록하세요.

[반환 JSON 스키마]
{
  "courseName": null,
  "courseCode": null,
  "credits": null,
  "summary": null,
  "evaluations": {
    "teamProject": {
      "exists": null, "weight": null, "evidence": null
    },
    "quiz": {
      "exists": null, "weight": null, "evidence": null
    },
    "presentation": {
      "exists": null, "weight": null, "evidence": null
    },
    "assignment": {
      "exists": null, "weight": null, "evidence": null
    },
    "midterm": {
      "exists": null, "weight": null, "evidence": null
    },
    "finalExam": {
      "exists": null, "weight": null, "evidence": null
    },
    "attendance": {
      "exists": null, "weight": null, "evidence": null
    }
  },
  "originalEvaluations": [
    {
      "name": "원문 평가 항목",
      "weight": 0,
      "evidence": "문서의 근거"
    }
  ],
  "additionalDetails": null
}

[검증 규칙]
- originalEvaluations는 최상위 평가 항목만 포함합니다.
- 비중이 확인되지 않은 항목은 배열에 넣지 마세요.
- 최상위 평가 비율의 합계가 100%를 초과하지 않도록 하세요.
- 서로 다른 평가 항목의 비중을 임의로 합치지 마세요.
- 모든 evaluations 키를 반환하세요.
- 존재하지 않는 정보는 만들어내지 마세요.
`;

  const response = await fetch(
    `${GATEWAY}/chat/completions/`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.CHATKHU_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.CHATKHU_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
      signal: AbortSignal.timeout(180000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "ChatKHU request failed:",
      response.status,
      errorText.slice(0, 300)
    );

    throw new Error(
      "CHATKHU_REQUEST_FAILED"
    );
  }

  const result = await response.json();

  const content =
    result.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error(
      "EMPTY_AI_RESPONSE"
    );
  }

  return parseAIJson(content);
}

module.exports = {
  extractPdfText,
  analyzeSyllabus,
};
