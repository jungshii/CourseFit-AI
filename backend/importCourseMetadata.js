
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { extractPdfText } = require("./syllabusAnalyzer");

const ROOT = __dirname;
const PDF_FOLDER = path.join(ROOT, "syllabi");
const RESULT_FILE = path.join(ROOT, "course-metadata.generated.json");

const GATEWAY =
  "https://factchat-cloud.mindlogic.ai/v1/gateway";

const CATEGORIES = {
  major_required: "major",
  major_elective: "major",
  major_foundation: "major",
  general_required: "general",
  general_distribution: "general",
  general_free: "general",
};

const MODES = ["offline", "online", "hybrid"];

function clean(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function parseJSON(content) {
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

function validate(data) {
  if (!data || typeof data !== "object" ||
      Array.isArray(data)) {
    throw new Error("INVALID_METADATA");
  }

  const courseCode = clean(data.courseCode);
  const department = clean(data.department);
  const subcategory = clean(data.courseSubcategory);
  const mode = clean(data.deliveryMode);
  const semester = clean(data.semester);

  if (!courseCode) {
    throw new Error("COURSE_CODE_MISSING");
  }

  if (subcategory && !(subcategory in CATEGORIES)) {
    throw new Error("INVALID_COURSE_CATEGORY");
  }

  if (mode && !MODES.includes(mode)) {
    throw new Error("INVALID_DELIVERY_MODE");
  }

  if (semester && !/^\d{4}-[12]$/.test(semester)) {
    throw new Error("INVALID_SEMESTER");
  }

  return {
    courseCode,
    department,
    courseCategory: subcategory
      ? CATEGORIES[subcategory]
      : null,
    courseSubcategory: subcategory,
    deliveryMode: mode,
    semester,
  };
}

async function analyzeMetadata(text) {
  const prompt = `
당신은 대학 강의계획서에서 학사 정보를 추출합니다.
반드시 JSON 객체 하나만 반환하세요.

{
  "courseCode": null,
  "department": null,
  "courseSubcategory": null,
  "deliveryMode": null,
  "semester": null
}

추출 규칙:

1. courseCode:
   학수번호와 분반을 포함합니다.
   예: FR3043-00

2. department:
   PDF의 "개설학과" 필드에서 추출합니다.
   교수 소속 학과와 혼동하지 마세요.

3. courseSubcategory:
   전공필수 -> major_required
   전공선택 -> major_elective
   전공기초 -> major_foundation
   필수교양 -> general_required
   배분이수 -> general_distribution
   자유이수 -> general_free

4. deliveryMode:
   대면 수업 -> offline
   완전 온라인 수업 -> online
   대면과 온라인이 정규적으로 혼합 -> hybrid

   특별한 사유로 대면 수업을 온라인으로
   대체할 수 있다는 설명만으로 hybrid로
   판단하지 마세요.

5. semester:
   2026학년도 2학기 -> 2026-2
   2026학년도 1학기 -> 2026-1

6. 문서에 없는 정보는 null로 반환하세요.
7. 필드명과 가까운 값을 우선 사용하세요.
8. 주차별 강의 계획을 기본 정보로 오인하지 마세요.
9. JSON 이외의 설명은 출력하지 마세요.
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
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(180000),
    }
  );

  if (!response.ok) {
    throw new Error(`CHATKHU_HTTP_${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("EMPTY_AI_RESPONSE");
  }

  return validate(parseJSON(content));
}

async function generate() {
  if (!process.env.CHATKHU_API_KEY ||
      !process.env.CHATKHU_MODEL) {
    throw new Error("ChatKHU 환경변수가 없습니다.");
  }

  if (!fs.existsSync(PDF_FOLDER)) {
    throw new Error("syllabi 폴더가 없습니다.");
  }

  const db = new Database(path.join(ROOT, "coursefit.db"), {
    readonly: true,
    fileMustExist: true,
  });

  let knownCodes;
  try {
    knownCodes = new Set(
      db.prepare(
        "SELECT course_code FROM courses WHERE course_code IS NOT NULL"
      ).all().map(row => row.course_code)
    );
  } finally {
    db.close();
  }

  const files = fs.readdirSync(PDF_FOLDER)
    .filter(file => file.toLowerCase().endsWith(".pdf"));

  const rows = [];
  const seen = new Set();

  for (const filename of files) {
    console.log(`분석 중: ${filename}`);

    try {
      const buffer = fs.readFileSync(
        path.join(PDF_FOLDER, filename)
      );

      const text = await extractPdfText(buffer);
      const metadata = await analyzeMetadata(text);

      if (!knownCodes.has(metadata.courseCode)) {
        throw new Error(
          `DB에 없는 학수번호: ${metadata.courseCode}`
        );
      }

      if (seen.has(metadata.courseCode)) {
        throw new Error("중복된 학수번호");
      }

      seen.add(metadata.courseCode);

      rows.push({
        filename,
        ...metadata,
      });

      console.log(`성공: ${metadata.courseCode}`);
    } catch (error) {
      console.error(`실패: ${filename} - ${error.message}`);
    }
  }

  fs.writeFileSync(
    RESULT_FILE,
    JSON.stringify(rows, null, 2),
    "utf8"
  );

  console.log(`추출 완료: ${rows.length}/${files.length}`);
  console.log("결과:", RESULT_FILE);
  console.log("검토한 후 --apply를 실행하세요.");
}

function apply() {
  if (!fs.existsSync(RESULT_FILE)) {
    throw new Error("먼저 분석을 실행하세요.");
  }

  const rows = JSON.parse(
    fs.readFileSync(RESULT_FILE, "utf8")
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("저장할 데이터가 없습니다.");
  }

  const validated = rows.map(validate);
  const codes = validated.map(row => row.courseCode);

  if (new Set(codes).size !== codes.length) {
    throw new Error("중복 학수번호가 있습니다.");
  }

  const db = new Database(path.join(ROOT, "coursefit.db"));
  db.pragma("foreign_keys = ON");

  try {
    const update = db.prepare(`
      UPDATE courses SET
        department = COALESCE(?, department),
        course_category = COALESCE(?, course_category),
        course_subcategory = COALESCE(?, course_subcategory),
        delivery_mode = COALESCE(?, delivery_mode),
        semester = COALESCE(?, semester)
      WHERE course_code = ?
    `);

    const transaction = db.transaction(() => {
      for (const row of validated) {
        const result = update.run(
          row.department,
          row.courseCategory,
          row.courseSubcategory,
          row.deliveryMode,
          row.semester,
          row.courseCode
        );

        if (result.changes !== 1) {
          throw new Error(
            `학수번호 매칭 오류: ${row.courseCode}`
          );
        }
      }
    });

    transaction();
    console.log(`DB 저장 완료: ${validated.length}개`);
  } finally {
    db.close();
  }
}

if (process.argv.includes("--apply")) {
  try {
    apply();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  generate().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
