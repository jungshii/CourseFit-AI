
"use strict";

const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  path.join(__dirname, "coursefit.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS wizard_plans (
    id INTEGER PRIMARY KEY,
    plan_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const PLAN_ID = 1;

const categories = [
  "courses",
  "schedule",
  "style"
];

const preferenceValues = [
  "dislike",
  "neutral",
  "like"
];

const examValues = [
  "none",
  "once",
  "twice",
  "any"
];

const dayValues = new Set([
  "MON", "TUE", "WED",
  "THU", "FRI"
]);

function validSlots(slots) {
  return Array.isArray(slots) &&
    slots.every(value => {
      if (typeof value !== "string") return false;

      const match = value.match(
        /^(MON|TUE|WED|THU|FRI)-(\d+)$/
      );

      return match &&
        Number(match[2]) >= 0 &&
        Number(match[2]) < 12;
    }) &&
    new Set(slots).size === slots.length;
}

function validRanks(ranks) {
  if (!ranks || typeof ranks !== "object" ||
      Array.isArray(ranks)) return false;

  const values = Object.values(ranks);

  return Object.keys(ranks).every(id =>
    /^[1-9]\d*$/.test(id)
  ) &&
    values.every(rank =>
      Number.isInteger(rank) &&
      rank >= 1 &&
      rank <= 6
    ) &&
    new Set(values).size === values.length;
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" ||
      Array.isArray(plan)) {
    throw new Error("INVALID_PLAN");
  }

  const isInt = (value) =>
    Number.isInteger(value) && value >= 0 &&
    value <= 24;

  if (
    typeof plan.department !== "string" ||
    !plan.department.trim() ||
    !isInt(plan.totalCredits) ||
    !isInt(plan.onlineCourses)
  ) {
    throw new Error("INVALID_BASIC_CONDITIONS");
  }

  const majorKeys = [
    "전공필수", "전공선택", "전공기초"
  ];

  const generalKeys = [
    "중핵교과",
    "자유이수 교과",
    "배분이수 교과",
    "기초 교과"
  ];

  function validateBreakdown(value, keys) {
    return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      keys.every(key => isInt(value[key]));
  }

  if (
    !validateBreakdown(
      plan.majorBreakdown,
      majorKeys
    ) ||
    !validateBreakdown(
      plan.generalBreakdown,
      generalKeys
    )
  ) {
    throw new Error("INVALID_CREDIT_BREAKDOWN");
  }

  const total = [
    ...majorKeys.map(k => plan.majorBreakdown[k]),
    ...generalKeys.map(k => plan.generalBreakdown[k])
  ].reduce((a, b) => a + b, 0);

  if (total !== plan.totalCredits) {
    throw new Error("CREDIT_SUM_MISMATCH");
  }

  if (!examValues.includes(plan.examPreference)) {
    throw new Error("INVALID_EXAM_PREFERENCE");
  }

  const study = plan.studyPreferences;

  if (!study || ![
    "teamProject", "quiz", "presentation", "report"
  ].every(key =>
    preferenceValues.includes(study[key])
  )) {
    throw new Error("INVALID_STUDY_PREFERENCES");
  }

  const schedule = plan.schedulePreferences;

  if (
    !schedule ||
    !Array.isArray(schedule.freeDays) ||
    !schedule.freeDays.every(d => dayValues.has(d)) ||
    new Set(schedule.freeDays).size !==
      schedule.freeDays.length ||
    !validSlots(schedule.avoidSlots) ||
    !validSlots(schedule.blockedSlots) ||
    typeof schedule.avoidConsecutive !== "boolean"
  ) {
    throw new Error("INVALID_SCHEDULE_PREFERENCES");
  }

  const overlap = schedule.avoidSlots.some(slot =>
    schedule.blockedSlots.includes(slot)
  );

  if (overlap) {
    throw new Error("OVERLAPPING_TIME_CONSTRAINTS");
  }

  const preferred = plan.preferredCourses;

  if (
    !preferred ||
    !validRanks(preferred.majorRanks) ||
    !validRanks(preferred.generalRanks) ||
    !["auto", "review", "selected"].includes(
      preferred.fillMode
    )
  ) {
    throw new Error("INVALID_PREFERRED_COURSES");
  }

  const majorIds = Object.keys(preferred.majorRanks);
  const generalIds = Object.keys(preferred.generalRanks);

  if (majorIds.some(id => generalIds.includes(id))) {
    throw new Error("DUPLICATE_PREFERRED_COURSE");
  }

  if (
    !Array.isArray(plan.priorities) ||
    plan.priorities.length !== 3 ||
    new Set(plan.priorities).size !== 3 ||
    !plan.priorities.every(v => categories.includes(v))
  ) {
    throw new Error("INVALID_PRIORITIES");
  }

  if (
    !Array.isArray(plan.requiredCourseIds) ||
    !plan.requiredCourseIds.every(id =>
      Number.isSafeInteger(id) && id > 0
    ) ||
    new Set(plan.requiredCourseIds).size !==
      plan.requiredCourseIds.length
  ) {
    throw new Error("INVALID_REQUIRED_COURSES");
  }

  // 강의 ID와 유형을 실제 DB에서 확인
  const findCourse = db.prepare(`
    SELECT course_category
    FROM courses
    WHERE id = ?
  `);

  for (const id of plan.requiredCourseIds) {
    if (!findCourse.get(id)) {
      throw new Error("REQUIRED_COURSE_NOT_FOUND");
    }
  }

  for (const [group, expected] of [
    [preferred.majorRanks, "major"],
    [preferred.generalRanks, "general"]
  ]) {
    for (const id of Object.keys(group)) {
      const course = findCourse.get(Number(id));

      if (!course ||
          course.course_category !== expected) {
        throw new Error("PREFERRED_COURSE_MISMATCH");
      }
    }
  }

  return plan;
}

function saveWizardPlan(input) {
  const plan = validatePlan(input);

  db.prepare(`
    INSERT INTO wizard_plans
      (id, plan_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      plan_json = excluded.plan_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(PLAN_ID, JSON.stringify(plan));

  return getWizardPlan();
}

function getWizardPlan() {
  const row = db.prepare(`
    SELECT plan_json, updated_at
    FROM wizard_plans
    WHERE id = ?
  `).get(PLAN_ID);

  if (!row) return null;

  return {
    ...JSON.parse(row.plan_json),
    updatedAt: row.updated_at
  };
}

module.exports = {
  saveWizardPlan,
  getWizardPlan
};
