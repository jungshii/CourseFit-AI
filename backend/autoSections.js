
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  extractPdfText
} = require("./syllabusAnalyzer");

const {
  importSections
} = require("./timetable");

const {
  getCourses
} = require("./database");

const folder = path.join(__dirname, "syllabi");

const draftFile = path.join(
  __dirname,
  "sections.generated.json"
);

const DAY = new Set([
  "MON", "TUE", "WED", "THU",
  "FRI", "SAT", "SUN"
]);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ==========================================
// 1. 추출된 수업시간 검증
// ==========================================
function validate(row) {
  if (
    !row ||
    typeof row.courseCode !== "string" ||
    !row.courseCode.trim() ||
    typeof row.section !== "string" ||
    !row.section.trim() ||
    !Array.isArray(row.meetings) ||
    !row.meetings.length
  ) {
    return false;
  }

  return row.meetings.every(m =>
    m &&
    DAY.has(m.day) &&
    TIME.test(m.start) &&
    TIME.test(m.end) &&
    m.start < m.end &&
    (
      m.room == null ||
      typeof m.room === "string"
    )
  );
}

// ==========================================
// 2. AI JSON 응답 파싱
// ==========================================
function parseJson(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const obj = JSON.parse(cleaned);

  if (
    !obj ||
    typeof obj !== "object" ||
    Array.isArray(obj)
  ) {
    throw new Error("INVALID_JSON");
  }

  return obj;
}

// ==========================================
// 3. ChatKHU 수업시간 추출
// ==========================================
async function extractSection(text) {
  const response = await fetch(
    "https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions/",
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${process.env.CHATKHU_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.CHATKHU_MODEL,
        messages: [
          {
            role: "system",
            content: `
당신은 대학 강의계획서에서 정규 수업시간 정보를 추출하는 AI입니다.

반드시 JSON 객체 하나만 반환하세요.

[반환 형식]
{
  "courseCode": null,
  "section": null,
  "meetings": [
    {
      "day": "MON",
      "start": "16:30",
      "end": "17:45",
      "room": null
    }
  ]
}

[추출 규칙]
1. 학수번호-분반을 courseCode로 추출하세요.
   예: FR3043-00

2. section에는 분반 번호만 넣으세요.
   예: 00

3. 정규 강의시간만 추출하세요.

4. 교수 면담시간, 상담시간, 시험 일정,
   주차별 강의 날짜는 제외하세요.

5. 요일은 다음 값만 사용하세요.
   MON, TUE, WED, THU, FRI, SAT, SUN

6. 시간은 24시간 HH:MM 형식으로 반환하세요.

7. 강의실은 원문 그대로 기록하세요.

8. 확인되지 않은 정보는 추측하지 마세요.

9. 정규 수업시간을 확인할 수 없다면
   meetings를 빈 배열로 반환하세요.

10. Markdown을 사용하지 마세요.
JSON만 출력하세요.
            `.trim()
          },
          {
            role: "user",
            content: text
          }
        ]
      }),
      signal: AbortSignal.timeout(180000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `CHATKHU_HTTP_${response.status}`
    );
  }

  const json = await response.json();

  const raw =
    json.choices?.[0]?.message?.content;

  if (typeof raw !== "string") {
    throw new Error("EMPTY_AI_RESPONSE");
  }

  return parseJson(raw);
}

// ==========================================
// 4. PDF 일괄 분석 및 JSON 생성
// ==========================================
async function generate() {
  if (
    !process.env.CHATKHU_API_KEY ||
    !process.env.CHATKHU_MODEL
  ) {
    throw new Error(
      "CHATKHU_API_KEY 또는 CHATKHU_MODEL 누락"
    );
  }

  if (!fs.existsSync(folder)) {
    throw new Error(
      "syllabi 폴더가 없습니다."
    );
  }

  const knownCodes = new Set(
    getCourses()
      .map(c => c.courseCode)
      .filter(Boolean)
  );

  const pdfs = fs.readdirSync(folder)
    .filter(f =>
      f.toLowerCase().endsWith(".pdf")
    );

  const rows = [];

  console.log(
    `분석할 PDF: ${pdfs.length}개`
  );

  for (const file of pdfs) {
    try {
      console.log(`분석 중: ${file}`);

      const pdf = fs.readFileSync(
        path.join(folder, file)
      );

      const text =
        await extractPdfText(pdf);

      const result =
        await extractSection(text);

      const section =
        result.section == null
          ? null
          : String(result.section);

      const row = {
        courseCode: result.courseCode,
        section,
        meetings: result.meetings
      };

      if (!validate(row)) {
        throw new Error(
          "수업시간 또는 분반 정보가 불완전합니다"
        );
      }

      if (!knownCodes.has(row.courseCode)) {
        throw new Error(
          `DB에 없는 과목 코드: ${row.courseCode}`
        );
      }

      if (
        rows.some(r =>
          r.courseCode === row.courseCode &&
          r.section === row.section
        )
      ) {
        throw new Error(
          "중복된 학수번호/분반"
        );
      }

      rows.push(row);

      console.log(
        `추출 성공: ${file} → ${row.courseCode}`
      );

    } catch (error) {
      console.error(
        `확인 필요: ${file} → ${error.message}`
      );
    }
  }

  fs.writeFileSync(
    draftFile,
    JSON.stringify(rows, null, 2),
    "utf8"
  );

  console.log("");
  console.log("자동 추출 완료");
  console.log(`성공: ${rows.length}개 분반`);
  console.log(`결과 파일: ${draftFile}`);

  console.log(
    "원본 PDF와 비교한 후 --apply를 실행하세요."
  );
}

// ==========================================
// 5. 검증된 결과를 SQLite에 등록
// ==========================================
function apply() {
  if (!fs.existsSync(draftFile)) {
    throw new Error(
      "먼저 node autoSections.js 를 실행하세요."
    );
  }

  const rows = JSON.parse(
    fs.readFileSync(draftFile, "utf8")
  );

  if (
    !Array.isArray(rows) ||
    !rows.length ||
    !rows.every(validate)
  ) {
    throw new Error(
      "등록 가능한 분반이 없습니다."
    );
  }

  const keys = rows.map(
    r => `${r.courseCode}:${r.section}`
  );

  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "중복된 분반이 존재합니다."
    );
  }

  // 포함된 과목의 기존 분반 데이터 교체
  const result = importSections(rows);

  console.log("DB 등록 완료");
  console.log(result);
}

// ==========================================
// 6. 실행
// ==========================================
if (process.argv.includes("--apply")) {
  Promise.resolve()
    .then(apply)
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
} else {
  generate().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
