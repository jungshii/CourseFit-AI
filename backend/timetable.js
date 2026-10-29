const Database = require('better-sqlite3');
const path = require('path');
const { getStudyPlan } = require('./studyPlan');
const { recommendCourses } = require('./recommendation');

const db = new Database(path.join(__dirname, 'coursefit.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS course_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_label TEXT NOT NULL,
    meetings_json TEXT NOT NULL,
    UNIQUE(course_id, section_label)
  );
`);
const DAYS = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

function toMinutes(s) {
  if (typeof s !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
    throw new Error('INVALID_TIME');
  }
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function validMeetings(meetings) {
  if (!Array.isArray(meetings) || meetings.length === 0) throw new Error('INVALID_MEETINGS');
  return meetings.map(m => {
    if (!m || !DAYS.includes(m.day)) throw new Error('INVALID_DAY');
    const start = toMinutes(m.start), end = toMinutes(m.end);
    if (start >= end) throw new Error('INVALID_TIME_RANGE');
    return { day: m.day, start: m.start, end: m.end, startMin: start, endMin: end,
      room: typeof m.room === 'string' ? m.room : null };
  });
}
const importSections = db.transaction(rows => {
  if (!Array.isArray(rows)) throw new Error('INVALID_SECTIONS');
  const lookup = db.prepare('SELECT id FROM courses WHERE course_code = ?');
  const del = db.prepare('DELETE FROM course_sections WHERE course_id = ?');
  const add = db.prepare('INSERT INTO course_sections(course_id, section_label, meetings_json) VALUES (?, ?, ?)');
  const grouped = new Map();
  for (const r of rows) {
    if (!r || typeof r.courseCode !== 'string' || typeof r.section !== 'string' || !r.section.trim())
      throw new Error('INVALID_SECTION_ROW');
    const course = lookup.get(r.courseCode);
    if (!course) throw new Error(`COURSE_NOT_FOUND: ${r.courseCode}`);
    const meetings = validMeetings(r.meetings).map(({day,start,end,room}) => ({day,start,end,room}));
    if (!grouped.has(course.id)) grouped.set(course.id, []);
    grouped.get(course.id).push({ section: r.section.trim(), meetings });
  }
  for (const [courseId, group] of grouped) {
    del.run(courseId);
    for (const s of group) add.run(courseId, s.section, JSON.stringify(s.meetings));
  }
  return { importedCourses: grouped.size, importedSections: rows.length };
});
function listSections() {
  return db.prepare(`SELECT cs.id, cs.course_id AS courseId, c.course_name AS courseName,
     c.course_code AS courseCode, c.credits, cs.section_label AS section, cs.meetings_json AS meetingsJson
     FROM course_sections cs JOIN courses c ON c.id=cs.course_id ORDER BY c.id, cs.section_label`)
    .all().map(r => ({ id: r.id, courseId: r.courseId, courseName: r.courseName,
      courseCode: r.courseCode, credits: r.credits, section: r.section, meetings: JSON.parse(r.meetingsJson) }));
}
function collide(a, b) {
  return a.meetings.some(x => b.meetings.some(y =>
    x.day === y.day && toMinutes(x.start) < toMinutes(y.end) && toMinutes(y.start) < toMinutes(x.end)
  ));
}
function generateTimetables() {
  const plan = getStudyPlan();
  if (!plan) return { timetables: [], issues: ['먼저 수강 계획을 저장하세요.'] };
  const sections = listSections();
  const group = new Map();
  for (const s of sections) {
    if (!group.has(s.courseId)) group.set(s.courseId, []);
    group.get(s.courseId).push(s);
  }
  const requirements = plan.courses.filter(x => x.priority === 'required').map(x => x.courseId);
  const preferred = new Set(plan.courses.filter(x => x.priority === 'preferred').map(x => x.courseId));
  const issues = [];
  const data = db.prepare('SELECT id, course_name AS name, credits FROM courses').all();
  const byId = new Map(data.map(x => [x.id, x]));
  for (const id of requirements) {
    const c = byId.get(id);
    if (!c) issues.push(`필수과목 ID ${id}: 강의가 없습니다.`);
    else if (typeof c.credits !== 'number' || c.credits <= 0)
      issues.push(`필수과목 ${c.name}: 학점 정보가 없습니다.`);
    else if (!group.has(id)) issues.push(`필수과목 ${c.name}: 분반 및 수업시간 정보가 없습니다.`);
  }
  if (issues.length) return { timetables: [], issues };
  const requiredCredits = requirements.reduce((sum,id)=>sum+byId.get(id).credits,0);
  if (requiredCredits > plan.maxCredits) {
    return { timetables: [], issues: [`필수과목 학점 ${requiredCredits}이 최대 ${plan.maxCredits}학점을 초과합니다.`] };
  }
  const recs = recommendCourses(plan.preferences);
  const scoreById = new Map(recs.map(x => [x.id, x.score]));
  // 선택한 희망과목부터 탐색하고, 미선택 과목도 남은 학점 충족용 후보로 사용합니다.
  const optionalIds = [...group.keys()].filter(id => !requirements.includes(id) && byId.has(id)
    && typeof byId.get(id).credits === 'number' && byId.get(id).credits > 0);
  optionalIds.sort((a,b) => Number(preferred.has(b))-Number(preferred.has(a)) ||
    (scoreById.get(b) ?? -1)-(scoreById.get(a) ?? -1) || a-b);
  // 과도한 탐색 방지. 필수과목은 절대 잘라내지 않습니다.
  const candidates = optionalIds.slice(0, 18);
  if (optionalIds.length > candidates.length) issues.push('선택 후보가 많아 상위 18개 과목에서 탐색했습니다.');
  const ordered = [...requirements, ...candidates];
  const limit = requirements.length + candidates.length;
  const results = [];
  let visited = 0;
  const MAX_VISITS = 250000;
  function save(chosen, credits) {
    if (credits < plan.minCredits || credits > plan.maxCredits) return;
    const preferredCount = chosen.filter(s=>preferred.has(s.courseId)).length;
    const suitability = chosen.reduce((sum,s)=>sum+(scoreById.get(s.courseId) ?? 50),0);
    const value = preferredCount * 10000 + suitability;
    const signature = chosen.map(x=>x.id).sort((a,b)=>a-b).join('-');
    if (results.some(x=>x.signature===signature)) return;
    results.push({ signature, credits, preferredCount, value,
      sections: chosen.map(s=>({ ...s, required: requirements.includes(s.courseId),
        preferred: preferred.has(s.courseId), score: scoreById.get(s.courseId) ?? null })) });
    results.sort((a,b)=>b.value-a.value || b.credits-a.credits);
    if (results.length>3) results.pop();
  }
  function dfs(i, chosen, credits) {
    if (++visited > MAX_VISITS) return;
    if (credits > plan.maxCredits) return;
    if (i===limit) { save(chosen, credits); return; }
    const id=ordered[i], opts=group.get(id) || [];
    if (!requirements.includes(id)) dfs(i+1, chosen, credits);
    for (const s of opts) {
      if (chosen.every(prev=>!collide(prev,s))) {
        chosen.push(s);
        dfs(i+1,chosen,credits+byId.get(id).credits);
        chosen.pop();
      }
    }
  }
  dfs(0,[],0);
  if (visited > MAX_VISITS) issues.push('탐색 한도에 도달해 가능한 일부 조합만 확인했습니다.');
  if (!results.length) {
    issues.push('필수과목 시간 충돌 또는 목표 학점 조건으로 생성 가능한 시간표가 없습니다.');
    const withoutSections = data.filter(c => !group.has(c.id));
    if (withoutSections.length) issues.push(`수업시간이 없는 과목 ${withoutSections.length}개는 후보에서 제외되었습니다.`);
  }
  return { timetables: results.map(({signature,value,...r},idx)=>({rank:idx+1,...r})), issues };
}
module.exports={importSections,listSections,generateTimetables};
