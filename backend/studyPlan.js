
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  path.join(__dirname, "coursefit.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS study_plans (
    id INTEGER PRIMARY KEY,
    min_credits INTEGER NOT NULL,
    max_credits INTEGER NOT NULL,
    preferences TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS study_plan_courses (
    plan_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    priority TEXT NOT NULL
      CHECK(priority IN ('required', 'preferred')),
    PRIMARY KEY (plan_id, course_id),
    FOREIGN KEY (plan_id)
      REFERENCES study_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id)
      REFERENCES courses(id) ON DELETE CASCADE
  );
`);

const preferenceKeys = [
  "teamProject", "quiz", "presentation",
  "assignment", "exam"
];

// 개발용 단일 사용자. 로그인 구현 시 사용자별 ID로 변경
const PLAN_ID = 1;

function validatePlan(plan) {
  const { minCredits, maxCredits, preferences, courses } = plan;

  if (
    !Number.isInteger(minCredits) ||
    !Number.isInteger(maxCredits) ||
    minCredits < 0 ||
    maxCredits > 24 ||
    minCredits > maxCredits
  ) {
    throw new Error("INVALID_CREDITS");
  }

  if (!preferences || typeof preferences !== "object") {
    throw new Error("INVALID_PREFERENCES");
  }

  for (const key of preferenceKeys) {
    const value = preferences[key];

    if (
      !Number.isInteger(value) ||
      value < 0 || value > 4
    ) {
      throw new Error("INVALID_PREFERENCES");
    }
  }

  if (!Array.isArray(courses)) {
    throw new Error("INVALID_COURSES");
  }

  const ids = new Set();

  for (const item of courses) {
    if (
      !item ||
      !Number.isInteger(item.courseId) ||
      item.courseId < 1 ||
      !["required", "preferred"].includes(item.priority) ||
      ids.has(item.courseId)
    ) {
      throw new Error("INVALID_COURSES");
    }
    ids.add(item.courseId);
  }

  const findCourse = db.prepare(
    "SELECT id FROM courses WHERE id = ?"
  );

  for (const id of ids) {
    if (!findCourse.get(id)) {
      throw new Error("COURSE_NOT_FOUND");
    }
  }
}

const saveStudyPlan = db.transaction((plan) => {
  validatePlan(plan);

  db.prepare(`
    INSERT INTO study_plans
      (id, min_credits, max_credits, preferences, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      min_credits = excluded.min_credits,
      max_credits = excluded.max_credits,
      preferences = excluded.preferences,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    PLAN_ID,
    plan.minCredits,
    plan.maxCredits,
    JSON.stringify(plan.preferences)
  );

  db.prepare(
    "DELETE FROM study_plan_courses WHERE plan_id = ?"
  ).run(PLAN_ID);

  const insert = db.prepare(`
    INSERT INTO study_plan_courses
      (plan_id, course_id, priority)
    VALUES (?, ?, ?)
  `);

  for (const item of plan.courses) {
    insert.run(PLAN_ID, item.courseId, item.priority);
  }

  return getStudyPlan();
});

function getStudyPlan() {
  const plan = db.prepare(
    "SELECT * FROM study_plans WHERE id = ?"
  ).get(PLAN_ID);

  if (!plan) return null;

  const courses = db.prepare(`
    SELECT course_id AS courseId, priority
    FROM study_plan_courses
    WHERE plan_id = ?
    ORDER BY course_id
  `).all(PLAN_ID);

  return {
    minCredits: plan.min_credits,
    maxCredits: plan.max_credits,
    preferences: JSON.parse(plan.preferences),
    courses
  };
}

module.exports = { saveStudyPlan, getStudyPlan };
