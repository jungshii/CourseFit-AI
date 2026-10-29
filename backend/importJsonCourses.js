
"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const { saveAnalysis } = require("./database");
const { importSections } = require("./timetable");

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "syllabi");
const DB_PATH = path.join(ROOT, "coursefit.db");

const APPLY = process.argv.includes("--apply");

const SUBCATEGORIES = {
  major_required: "major",
  major_elective: "major",
  major_foundation: "major",
  general_core: "general",
  general_free: "general",
  general_distribution: "general",
  general_foundation: "general",
  general_required: "general",
};

const EVALUATION_KEYS = [
  "teamProject",
  "quiz",
  "presentation",
  "assignment",
  "midterm",
  "finalExam",
  "attendance",
];

const DAYS = new Set([
  "MON", "TUE", "WED", "THU",
  "FRI", "SAT", "SUN",
]);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function weightValid(value) {
  return value == null ||
    (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100
    );
}

function findJsonFiles(dir) {
  let files = [];

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findJsonFiles(file));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".json")
    ) {
      files.push(file);
    }
  }

  return files.sort();
}

function pathMetadata(filepath) {
  const relative = path.relative(SOURCE, filepath);
  const parts = relative.split(path.sep).slice(0, -1);
  const joined = parts.join("/");

  const result = {
    category: null,
    subcategory: null,
    deliveryMode: null,
  };

  if (/교양|general/i.test(joined)) {
    result.category = "general";
  }

  if (/전공|major/i.test(joined)) {
    if (result.category) {
      throw new Error("전공/교양 폴더 구분 충돌");
    }
    result.category = "major";
  }

  const types = [
    [/중핵/, "general_core"],
    [/자유이수/, "general_free"],
    [/배분이수/, "general_distribution"],
    [/기초\s*교과/, "general_foundation"],
  ];

  for (const [pattern, value] of types) {
    if (pattern.test(joined)) {
      if (result.subcategory) {
        throw new Error("교양 세부 이수구분 중복");
      }
      result.subcategory = value;
    }
  }

  const online = parts.some(p =>
    /^(온라인|online)$/i.test(p.trim())
  );

  const offline = parts.some(p =>
    /^(오프라인|offline)$/i.test(p.trim())
  );

  if (online && offline) {
    throw new Error("온라인/오프라인 폴더 구분 충돌");
  }

  if (online) result.deliveryMode = "online";
  if (offline) result.deliveryMode = "offline";

  if (result.subcategory) {
    if (result.category === "major") {
      throw new Error("전공 폴더 안에 교양 이수구분");
    }
    result.category = "general";
  }

  return result;
}

function validate(raw, filename) {
  // 개별 JSON 또는 Batch Analyzer의 course 래퍼
  const data = raw?.course ?? raw;

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error("강의 JSON 객체가 아닙니다.");
  }

  const courseName = text(data.courseName);
  const courseCode = text(data.courseCode);

  if (!courseName || !courseCode) {
    throw new Error("과목명 또는 학수번호 누락");
  }

  if (
    typeof data.credits !== "number" ||
    !Number.isFinite(data.credits) ||
    data.credits < 0 ||
    data.credits > 30
  ) {
    throw new Error("학점 정보 오류");
  }

  const folder = pathMetadata(filename);

  let subcategory = text(data.courseSubcategory);
  const jsonCategory = text(data.courseCategory);
  const jsonMode = text(data.deliveryMode);

  // 과거 필수교양 분류는 신형 중핵교과와
  // 자동으로 같은 것으로 취급하지 않습니다.
  if (
    subcategory === "general_required" &&
    folder.subcategory === "general_core"
  ) {
    throw new Error(
      "general_required와 중핵교과의 관계를 확인하세요."
    );
  }

  if (
    folder.subcategory &&
    subcategory &&
    folder.subcategory !== subcategory
  ) {
    throw new Error(
      `이수구분 불일치: JSON=${subcategory}, ` +
      `폴더=${folder.subcategory}`
    );
  }

  subcategory ??= folder.subcategory;

  if (
    !subcategory ||
    !Object.hasOwn(SUBCATEGORIES, subcategory)
  ) {
    throw new Error("이수구분을 확정할 수 없습니다.");
  }

  const category = SUBCATEGORIES[subcategory];

  if (folder.category && folder.category !== category) {
    throw new Error("전공/교양 폴더 정보 불일치");
  }

  if (jsonCategory && jsonCategory !== category) {
    throw new Error("JSON courseCategory 불일치");
  }

  if (
    folder.deliveryMode &&
    jsonMode &&
    folder.deliveryMode !== jsonMode
  ) {
    throw new Error("온라인/오프라인 정보 불일치");
  }

  const deliveryMode =
    jsonMode ?? folder.deliveryMode;

  if (
    deliveryMode &&
    !["online", "offline", "hybrid"]
      .includes(deliveryMode)
  ) {
    throw new Error("수업 운영 방식 오류");
  }

  if (
    data.semester != null &&
    !/^\d{4}-[12]$/.test(data.semester)
  ) {
    throw new Error("학기 형식 오류");
  }

  if (
    !data.evaluations ||
    typeof data.evaluations !== "object"
  ) {
    throw new Error("평가 항목 누락");
  }

  for (const key of EVALUATION_KEYS) {
    const value = data.evaluations[key];

    if (
      !value ||
      ![true, false, null].includes(value.exists) ||
      !weightValid(value.weight)
    ) {
      throw new Error(`평가 항목 오류: ${key}`);
    }
  }

  if (!Array.isArray(data.originalEvaluations)) {
    throw new Error("원본 평가표 누락");
  }

  for (const e of data.originalEvaluations) {
    if (
      !e ||
      !text(e.name) ||
      !weightValid(e.weight)
    ) {
      throw new Error("원본 평가 항목 오류");
    }
  }

  if (!Array.isArray(data.meetings)) {
    throw new Error("수업시간 배열 누락");
  }

  for (const m of data.meetings) {
    if (
      !m ||
      !DAYS.has(m.day) ||
      !TIME.test(m.start) ||
      !TIME.test(m.end) ||
      m.start >= m.end
    ) {
      throw new Error("요일 또는 수업시간 오류");
    }
  }

  const section = text(data.section) ??
    courseCode.match(/-([A-Za-z0-9]+)$/)?.[1];

  if (!section) {
    throw new Error("분반 번호 누락");
  }

  return {
    ...data,
    courseName,
    courseCode,
    courseCategory: category,
    courseSubcategory: subcategory,
    deliveryMode,
    section,
  };
}

function inspect() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error("기존 coursefit.db가 없습니다.");
  }

  if (!fs.existsSync(SOURCE)) {
    throw new Error("syllabi 폴더가 없습니다.");
  }

  const files = findJsonFiles(SOURCE);
  const valid = [];
  const errors = [];
  const keys = new Set();

  for (const filename of files) {
    const relative = path.relative(SOURCE, filename);

    try {
      const data = JSON.parse(
        fs.readFileSync(filename, "utf8")
      );

      const course = validate(data, filename);

      // 현재 DB는 course_code로 기존 과목을 구별합니다.
      // 동일 코드가 여러 JSON에 있다면 먼저 정리해야 합니다.
      if (keys.has(course.courseCode)) {
        throw new Error(
          `중복 학수번호: ${course.courseCode}`
        );
      }

      keys.add(course.courseCode);
      valid.push({ relative, course });
    } catch (e) {
      errors.push({
        file: relative,
        error: e.message,
      });
    }
  }

  fs.writeFileSync(
    path.join(ROOT, "json-import-report.json"),
    JSON.stringify({
      total: files.length,
      valid: valid.length,
      errors,
    }, null, 2),
    "utf8"
  );

  return { files, valid, errors };
}

async function main() {
  const { files, valid, errors } = inspect();

  console.log(`전체 JSON: ${files.length}`);
  console.log(`검증 성공: ${valid.length}`);
  console.log(`검증 실패: ${errors.length}`);

  for (const e of errors.slice(0, 20)) {
    console.error(`${e.file}: ${e.error}`);
  }

  if (errors.length > 0 || valid.length === 0) {
    console.log(
      "DB 등록 중단. json-import-report.json 확인."
    );
    process.exitCode = 1;
    return;
  }

  // 실제 등록 전, DB의 동일 학수번호 중복 확인
  const db = new Database(DB_PATH, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const duplicates = db.prepare(`
      SELECT course_code, COUNT(*) AS n
      FROM courses
      WHERE course_code IS NOT NULL
      GROUP BY course_code
      HAVING COUNT(*) > 1
    `).all();

    if (duplicates.length > 0) {
      throw new Error(
        "기존 DB에 중복 학수번호가 있습니다. " +
        "먼저 중복 데이터를 정리하세요."
      );
    }
  } finally {
    db.close();
  }

  if (!APPLY) {
    console.log("검증 완료. DB는 변경되지 않았습니다.");
    console.log(
      "등록하려면: node importJsonCourses.js --apply"
    );
    return;
  }

  // 실제 저장 전에 SQLite의 백업 API 사용
  const backupName =
    `coursefit-before-json-${Date.now()}.db`;

  const backupPath = path.join(ROOT, backupName);
  const backupDb = new Database(DB_PATH);

  try {
    await backupDb.backup(backupPath);
  } finally {
    backupDb.close();
  }

  console.log(`백업 완료: ${backupName}`);

  const metadataDb = new Database(DB_PATH);

  try {
    const update = metadataDb.prepare(`
      UPDATE courses SET
        department = ?,
        course_category = ?,
        course_subcategory = ?,
        delivery_mode = ?,
        semester = ?
      WHERE id = ?
    `);

    let count = 0;
    const sections = [];

    for (const { relative, course } of valid) {
      // 기존 데이터의 course ID는 유지
      const courseId = saveAnalysis(course);

      update.run(
        course.department ?? null,
        course.courseCategory,
        course.courseSubcategory,
        course.deliveryMode ?? null,
        course.semester ?? null,
        courseId
      );

      if (course.meetings.length > 0) {
        sections.push({
          courseCode: course.courseCode,
          section: course.section,
          meetings: course.meetings,
        });
      }

      count++;
      console.log(
        `[${count}/${valid.length}] ${relative}`
      );
    }

    if (sections.length > 0) {
      console.log(
        "분반 등록:",
        importSections(sections)
      );
    }

    console.log(
      `가져오기 완료: ${count}개 과목 처리`
    );

  } finally {
    metadataDb.close();
  }
}

main().catch(e => {
  console.error("실패:", e.message);
  process.exitCode = 1;
});
