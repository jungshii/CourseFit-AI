
const Database = require("better-sqlite3");
const path = require("path");

const {
  listSections
} = require("./timetable");

const {
  generateBackupTimetables
} = require("./backupTimetables");

const db = new Database(
  path.join(__dirname, "coursefit.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS selected_timetables (
    plan_id INTEGER PRIMARY KEY,
    section_ids_json TEXT NOT NULL,
    selected_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP
  );
`);

// STEP 6과 동일한 개발용 단일 사용자 ID
const PLAN_ID = 1;

function normalize(ids) {
  return [...ids].sort((a, b) => a - b).join(",");
}

// 현재 생성 가능한 시간표인지 확인
function validateCurrent(ids) {
  const generated =
    generateBackupTimetables().timetables || [];

  return generated.some(
    (t) =>
      normalize(t.sections.map((s) => s.id)) ===
      normalize(ids)
  );
}

const commit = db.transaction((ids) => {
  db.prepare(`
    INSERT INTO selected_timetables
      (plan_id, section_ids_json, selected_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(plan_id) DO UPDATE SET
      section_ids_json = excluded.section_ids_json,
      selected_at = CURRENT_TIMESTAMP
  `).run(PLAN_ID, JSON.stringify(ids));
});

function saveSelectedTimetable(sectionIds) {
  if (
    !Array.isArray(sectionIds) ||
    sectionIds.length === 0 ||
    sectionIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0
    ) ||
    new Set(sectionIds).size !== sectionIds.length
  ) {
    const error = new Error("INVALID_SECTION_IDS");
    error.status = 400;
    throw error;
  }

  if (!validateCurrent(sectionIds)) {
    const error = new Error("TIMETABLE_NOT_CURRENT");
    error.status = 409;
    throw error;
  }

  commit(sectionIds);
  return getSelectedTimetable();
}

function getSelectedTimetable() {
  const saved = db.prepare(`
    SELECT
      section_ids_json AS sectionIdsJson,
      selected_at AS selectedAt
    FROM selected_timetables
    WHERE plan_id = ?
  `).get(PLAN_ID);

  if (!saved) return null;

  const sectionIds = JSON.parse(saved.sectionIdsJson);

  const byId = new Map(
    listSections().map((s) => [s.id, s])
  );

  const sections = sectionIds
    .map((id) => byId.get(id))
    .filter(Boolean);

  return {
    sectionIds,
    sections,
    selectedAt: saved.selectedAt,
    valid:
      sections.length === sectionIds.length &&
      validateCurrent(sectionIds),
  };
}

module.exports = {
  saveSelectedTimetable,
  getSelectedTimetable,
};
