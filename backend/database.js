
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  path.join(__dirname, "coursefit.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// 1. 기본 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_name TEXT,
    summary TEXT,
    course_code TEXT,
    credits REAL,
    additional_details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    exists_value INTEGER,
    weight REAL,
    evidence TEXT,
    FOREIGN KEY (course_id)
      REFERENCES courses(id)
      ON DELETE CASCADE,
    UNIQUE(course_id, category)
  );

  CREATE TABLE IF NOT EXISTS original_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    weight REAL,
    evidence TEXT,
    FOREIGN KEY (course_id)
      REFERENCES courses(id)
      ON DELETE CASCADE
  );
`);

// 2. 기존 DB의 누락된 컬럼 추가
const columns = db
  .prepare("PRAGMA table_info(courses)")
  .all()
  .map(column => column.name);

for (const [name, type] of [
  ["course_code", "TEXT"],
  ["credits", "REAL"],
  ["additional_details", "TEXT"],
]) {
  if (!columns.includes(name)) {
    db.exec(`ALTER TABLE courses ADD COLUMN ${name} ${type}`);
  }
}

// 3. SQL Statements
const findCourse = db.prepare(`
  SELECT id FROM courses
  WHERE course_code = ?
  ORDER BY id DESC
  LIMIT 1
`);

const insertCourse = db.prepare(`
  INSERT INTO courses
    (course_name, summary, course_code,
     credits, additional_details)
  VALUES (?, ?, ?, ?, ?)
`);

const updateCourse = db.prepare(`
  UPDATE courses SET
    course_name = ?,
    summary = ?,
    course_code = ?,
    credits = ?,
    additional_details = ?
  WHERE id = ?
`);

const deleteEvaluations = db.prepare(`
  DELETE FROM evaluations WHERE course_id = ?
`);

const deleteOriginalEvaluations = db.prepare(`
  DELETE FROM original_evaluations WHERE course_id = ?
`);

const insertEvaluation = db.prepare(`
  INSERT INTO evaluations
    (course_id, category, exists_value, weight, evidence)
  VALUES (?, ?, ?, ?, ?)
`);

const insertOriginalEvaluation = db.prepare(`
  INSERT INTO original_evaluations
    (course_id, name, weight, evidence)
  VALUES (?, ?, ?, ?)
`);

// 4. 분석 결과 저장 (Transaction)
const saveAnalysis = db.transaction((analysis) => {
  const code =
    typeof analysis.courseCode === "string"
      ? analysis.courseCode.trim() || null
      : null;

  let courseId;

  // 학수번호가 있으면 기존 과목 업데이트
  const existing = code ? findCourse.get(code) : null;

  if (existing) {
    courseId = existing.id;

    updateCourse.run(
      analysis.courseName ?? null,
      analysis.summary ?? null,
      code,
      analysis.credits ?? null,
      analysis.additionalDetails ?? null,
      courseId
    );

    deleteEvaluations.run(courseId);
    deleteOriginalEvaluations.run(courseId);
  } else {
    const result = insertCourse.run(
      analysis.courseName ?? null,
      analysis.summary ?? null,
      code,
      analysis.credits ?? null,
      analysis.additionalDetails ?? null
    );

    courseId = Number(result.lastInsertRowid);
  }

  // 기본 평가 항목 저장
  for (const [category, value] of Object.entries(
    analysis.evaluations || {}
  )) {
    insertEvaluation.run(
      courseId,
      category,
      value.exists == null
        ? null
        : value.exists ? 1 : 0,
      value.weight ?? null,
      value.evidence ?? null
    );
  }

  // PDF 원본 평가표 저장
  for (const item of analysis.originalEvaluations || []) {
    insertOriginalEvaluation.run(
      courseId,
      item.name,
      item.weight ?? null,
      item.evidence ?? null
    );
  }

  return courseId;
});

// 5. 학생 앱에서 강의 목록 조회
function getCourses() {
  const courses = db.prepare(`
    SELECT * FROM courses
    ORDER BY id DESC
  `).all();

  const getEvaluations = db.prepare(`
    SELECT category, exists_value, weight, evidence
    FROM evaluations
    WHERE course_id = ?
  `);

  const getOriginalEvaluations = db.prepare(`
    SELECT name, weight, evidence
    FROM original_evaluations
    WHERE course_id = ?
    ORDER BY id
  `);

  return courses.map((course) => ({
    id: course.id,
    courseName: course.course_name,
    courseCode: course.course_code,
    credits: course.credits,
    summary: course.summary,
    additionalDetails: course.additional_details,
    createdAt: course.created_at,
    department: course.department,
    courseCategory: course.course_category,
    courseSubcategory: course.course_subcategory,
    deliveryMode: course.delivery_mode,
    semester: course.semester,
    evaluations: Object.fromEntries(
      getEvaluations.all(course.id).map(row => [
        row.category,
        {
          exists: row.exists_value === null
            ? null
            : Boolean(row.exists_value),
          weight: row.weight,
          evidence: row.evidence
        }
      ])
    ),

    originalEvaluations:
      getOriginalEvaluations.all(course.id)
  }));
}

module.exports = {
  saveAnalysis,
  getCourses
};
