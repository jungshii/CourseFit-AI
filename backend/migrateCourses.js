
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
  path.join(__dirname, "coursefit.db")
);

try {
  const columns = db
    .prepare("PRAGMA table_info(courses)")
    .all()
    .map((column) => column.name);

  if (columns.length === 0) {
    throw new Error("courses 테이블이 없습니다.");
  }

  const newColumns = {
    department: "TEXT",
    course_category: "TEXT",
    course_subcategory: "TEXT",
    delivery_mode: "TEXT",
    semester: "TEXT",
  };

  const migrate = db.transaction(() => {
    for (const [name, type] of Object.entries(
      newColumns
    )) {
      if (!columns.includes(name)) {
        db.exec(
          `ALTER TABLE courses ADD COLUMN ${name} ${type}`
        );
        console.log(`추가됨: ${name}`);
      } else {
        console.log(`이미 존재함: ${name}`);
      }
    }
  });

  migrate();

  console.log("\nDB 확장 완료");

  const count = db
    .prepare("SELECT COUNT(*) AS count FROM courses")
    .get();

  console.log(`기존 강의: ${count.count}개 유지`);
} catch (error) {
  console.error("Migration 실패:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
