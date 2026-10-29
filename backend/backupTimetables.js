
"use strict";

const { listSections } = require("./timetable");
const { getCourses } = require("./database");
const { getWizardPlan } = require("./wizardPlan");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const CATEGORY = {
  major_required: "전공필수",
  major_elective: "전공선택",
  major_foundation: "전공기초",
  general_core: "중핵교과",
  general_free: "자유이수 교과",
  general_distribution: "배분이수 교과",
  general_foundation: "기초 교과",
};

// general_required는 별도 유형으로 유지합니다.
// 중핵교과로 자동 변경하지 않습니다.

const BEAM_WIDTH = 300;
const COMBINATIONS_PER_CATEGORY = 100;
const MAX_COURSES_PER_CATEGORY = 100;

function minutes(time) {
  const parts = time.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function validMeeting(m) {
  return m &&
    DAYS.includes(m.day) &&
    typeof m.start === "string" &&
    typeof m.end === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(m.start) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(m.end) &&
    minutes(m.start) < minutes(m.end);
}

function overlaps(a, b) {
  return a.day === b.day &&
    minutes(a.start) < minutes(b.end) &&
    minutes(b.start) < minutes(a.end);
}

function conflicts(a, b) {
  return a.meetings.some(x =>
    b.meetings.some(y => overlaps(x, y))
  );
}

function slotOverlaps(meeting, key) {
  const [day, slotText] = key.split("-");
  const slot = Number(slotText);

  const start = 600 + slot * 30;
  const end = start + 30;

  return meeting.day === day &&
    minutes(meeting.start) < end &&
    minutes(meeting.end) > start;
}

function hasBlockedTime(section, blocked) {
  return section.meetings.some(m =>
    blocked.some(slot => slotOverlaps(m, slot))
  );
}

function sectionSignature(sections) {
  return sections
    .map(s => s.id)
    .sort((a, b) => a - b)
    .join(",");
}

function courseDifference(a, b) {
  const x = new Set(a.sections.map(s => s.courseId));
  const y = new Set(b.sections.map(s => s.courseId));

  let count = 0;

  for (const id of x) {
    if (!y.has(id)) count++;
  }

  for (const id of y) {
    if (!x.has(id)) count++;
  }

  return count;
}

function coursePreferenceScore(sections, plan) {
  const ranks = {
    ...plan.preferredCourses.majorRanks,
    ...plan.preferredCourses.generalRanks,
  };

  const entries = Object.entries(ranks);

  if (!entries.length) return 100;

  const selectedIds = new Set(
    sections.map(s => String(s.courseId))
  );

  let achieved = 0;
  let maximum = 0;

  for (const [id, rank] of entries) {
    const weight = 7 - Number(rank);
    maximum += weight;

    if (selectedIds.has(id)) achieved += weight;
  }

  return maximum === 0
    ? 100
    : achieved / maximum * 100;
}

function styleScore(sections, courseMap, plan) {
  const prefs = plan.studyPreferences;
  let score = 0;
  let count = 0;

  for (const section of sections) {
    const e = courseMap.get(section.courseId)?.evaluations || {};

    for (const [key, pref] of [
      ["teamProject", prefs.teamProject],
      ["quiz", prefs.quiz],
      ["presentation", prefs.presentation],
      ["assignment", prefs.report],
    ]) {
      if (pref === "neutral") continue;

      const exists = e[key]?.exists;
      if (exists == null) continue;

      count++;

      const expected = pref === "like";
      score += exists === expected ? 1 : 0;
    }

    if (plan.examPreference !== "any") {
      const mid = e.midterm?.exists;
      const fin = e.finalExam?.exists;

      if (mid != null && fin != null) {
        const numberOfExams = Number(mid) + Number(fin);

        const expected = {
          none: 0,
          once: 1,
          twice: 2,
        }[plan.examPreference];

        count++;
        score += numberOfExams === expected ? 1 : 0;
      }
    }
  }

  // 정보가 없으면 중립 점수를 부여합니다.
  return count ? score / count * 100 : 50;
}

function scheduleScore(sections, plan) {
  const prefs = plan.schedulePreferences;
  const freeDays = new Set(prefs.freeDays);

  let penalty = 0;
  const meetingsByDay = new Map();

  for (const s of sections) {
    for (const m of s.meetings) {
      if (freeDays.has(m.day)) {
        penalty += 12;
      }

      for (const slot of prefs.avoidSlots) {
        if (slotOverlaps(m, slot)) {
          penalty += 2;
        }
      }

      if (!meetingsByDay.has(m.day)) {
        meetingsByDay.set(m.day, []);
      }
      meetingsByDay.get(m.day).push(m);
    }
  }

  if (prefs.avoidConsecutive) {
    for (const meetings of meetingsByDay.values()) {
      meetings.sort((a, b) =>
        minutes(a.start) - minutes(b.start)
      );

      for (let i = 1; i < meetings.length; i++) {
        const gap =
          minutes(meetings[i].start) -
          minutes(meetings[i - 1].end);

        if (gap >= 0 && gap < 15) penalty += 5;
      }
    }
  }

  return Math.max(0, 100 - penalty);
}

function calculateScore(sections, courseMap, plan) {
  const components = {
    courses: coursePreferenceScore(sections, plan),
    schedule: scheduleScore(sections, plan),
    style: styleScore(sections, courseMap, plan),
  };

  const weights = {};

  plan.priorities.forEach((key, index) => {
    weights[key] = 3 - index;
  });

  const utility =
    (
      components.courses * weights.courses +
      components.schedule * weights.schedule +
      components.style * weights.style
    ) / 6;

  return {
    utility: Math.round(utility * 100) / 100,
    components: Object.fromEntries(
      Object.entries(components).map(
        ([key, value]) => [key, Math.round(value)]
      )
    ),
  };
}

// 한 이수구분에 대해 목표 학점을 채우는
// 분반 조합을 Beam Search로 탐색합니다.
function buildCategoryCombinations(
  courseGroups,
  targetCredits,
  required,
  preferredRanks
) {
  if (targetCredits === 0) {
    // 0학점 필수과목은 별도 처리합니다.
    return [{
      sections: [],
      credits: 0,
      quickScore: 0,
    }];
  }

  let states = [{
    sections: [],
    credits: 0,
    quickScore: 0,
  }];

  for (const group of courseGroups) {
    const next = [];

    const isRequired = required.has(group.id);
    const rank = preferredRanks[String(group.id)];

    for (const state of states) {
      if (!isRequired) next.push(state);

      for (const section of group.sections) {
        const credits = state.credits + section.credits;

        if (credits > targetCredits) continue;

        if (!state.sections.every(
          s => !conflicts(s, section)
        )) continue;

        const preferenceBonus =
          rank ? (7 - rank) * 100 : 0;

        next.push({
          credits,
          sections: [...state.sections, section],
          quickScore:
            state.quickScore +
            preferenceBonus +
            1,
        });
      }
    }

    const byCredits = new Map();

    for (const state of next) {
      if (!byCredits.has(state.credits)) {
        byCredits.set(state.credits, []);
      }

      byCredits.get(state.credits).push(state);
    }

    states = [];

    for (const bucket of byCredits.values()) {
      bucket.sort((a, b) =>
        b.quickScore - a.quickScore
      );

      const seen = new Set();
      let count = 0;

      for (const state of bucket) {
        const signature =
          sectionSignature(state.sections);

        if (seen.has(signature)) continue;
        seen.add(signature);

        states.push(state);
        count++;

        if (count >= BEAM_WIDTH) break;
      }
    }
  }

  return states
    .filter(s => s.credits === targetCredits)
    .sort((a, b) =>
      b.quickScore - a.quickScore
    )
    .slice(0, COMBINATIONS_PER_CATEGORY);
}

function generateBackupTimetables() {
  const issues = [];
  const plan = getWizardPlan();

  if (!plan) {
    return {
      timetables: [],
      issues: ["먼저 수강 조건을 저장하세요."],
    };
  }

  const courses = getCourses();

  const courseMap = new Map(
    courses.map(c => [Number(c.id), c])
  );

  const required = new Set(plan.requiredCourseIds);

  const ranks = {
    ...plan.preferredCourses.majorRanks,
    ...plan.preferredCourses.generalRanks,
  };

  const preferredIds = new Set(
    Object.keys(ranks).map(Number)
  );

  const targets = {
    ...plan.majorBreakdown,
    ...plan.generalBreakdown,
  };

  const groups = new Map();
  const excluded = {
    missingCourse: 0,
    invalidCredits: 0,
    invalidMeeting: 0,
    blocked: 0,
    unsupportedCategory: 0,
    unknownMode: 0,
  };

  for (const raw of listSections()) {
    const id = Number(raw.courseId);
    const course = courseMap.get(id);

    if (!course) {
      excluded.missingCourse++;
      continue;
    }

    const category =
      CATEGORY[course.courseSubcategory];

    if (!category) {
      excluded.unsupportedCategory++;
      continue;
    }

    if (!Number.isFinite(course.credits) ||
        course.credits < 0) {
      excluded.invalidCredits++;
      continue;
    }

    if (!["online", "offline", "hybrid"]
        .includes(course.deliveryMode)) {
      excluded.unknownMode++;
      continue;
    }

    const meetings = raw.meetings || [];

    // 시간 정보가 없는 온라인 강의를
    // 비동기 수업이라고 임의로 가정하지 않습니다.
    if (!Array.isArray(meetings) ||
        meetings.length === 0 ||
        !meetings.every(validMeeting)) {
      excluded.invalidMeeting++;
      continue;
    }

    const section = {
      ...raw,
      id: Number(raw.id),
      courseId: id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      credits: Number(course.credits),
      courseSubcategory: course.courseSubcategory,
      deliveryMode: course.deliveryMode,
      meetings,
      required: required.has(id),
      preferred: preferredIds.has(id),
    };

    if (hasBlockedTime(
      section,
      plan.schedulePreferences.blockedSlots
    )) {
      excluded.blocked++;
      continue;
    }

    if (!groups.has(id)) {
      groups.set(id, {
        id,
        category,
        sections: [],
      });
    }

    groups.get(id).sections.push(section);
  }

  issues.push(
    `후보 제외 현황: 시간정보 ${excluded.invalidMeeting}, ` +
    `수업방식 미확인 ${excluded.unknownMode}, ` +
    `미지원 이수구분 ${excluded.unsupportedCategory}, ` +
    `수강 불가 시간 충돌 ${excluded.blocked}`
  );

  // 필수과목이 누락되면 임의로 제외하지 않습니다.
  for (const id of required) {
    if (!groups.has(id)) {
      return {
        timetables: [],
        issues: [
          ...issues,
          `필수과목 ${courseMap.get(id)?.courseName || id}의 ` +
          "등록된 분반 또는 수업시간을 확인하세요.",
        ],
      };
    }
  }

  const combinationsByCategory = new Map();

  for (const [category, target] of Object.entries(targets)) {
    if (target === 0) continue;

    const categoryGroups = [...groups.values()]
      .filter(g => g.category === category)
      .sort((a, b) => {
        const aRequired = required.has(a.id) ? 1 : 0;
        const bRequired = required.has(b.id) ? 1 : 0;

        if (aRequired !== bRequired) {
          return bRequired - aRequired;
        }

        const ar = ranks[String(a.id)] ?? 99;
        const br = ranks[String(b.id)] ?? 99;

        return ar - br;
      });

    if (!categoryGroups.length) {
      return {
        timetables: [],
        issues: [
          ...issues,
          `${category} ${target}학점을 충족할 수 있는 ` +
          "강의가 없습니다.",
        ],
      };
    }

    // 필수과목은 후보 제한에서 제외하지 않습니다.
    const requiredGroups = categoryGroups.filter(
      g => required.has(g.id)
    );

    const optionalGroups = categoryGroups.filter(
      g => !required.has(g.id)
    );

    const selectedGroups = [
      ...requiredGroups,
      ...optionalGroups.slice(
        0,
        MAX_COURSES_PER_CATEGORY
      ),
    ];

    if (optionalGroups.length >
        MAX_COURSES_PER_CATEGORY) {
      issues.push(
        `${category}: 전체 ${optionalGroups.length}개 ` +
        `선택 후보 중 ${MAX_COURSES_PER_CATEGORY}개 탐색`
      );
    }

    const combos = buildCategoryCombinations(
      selectedGroups,
      target,
      required,
      ranks
    );

    if (!combos.length) {
      return {
        timetables: [],
        issues: [
          ...issues,
          `${category} ${target}학점을 만족하는 ` +
          "수업시간 조합을 찾지 못했습니다.",
        ],
      };
    }

    combinationsByCategory.set(category, combos);
  }

  // 목표 학점이 0인 유형에 필수과목이 존재한다면
  // 조용히 무시하지 않고 생성 중단합니다.
  for (const id of required) {
    const group = groups.get(id);

    if (group &&
        (targets[group.category] ?? 0) === 0) {
      return {
        timetables: [],
        issues: [
          ...issues,
          `필수과목 ${courseMap.get(id)?.courseName || id}의 ` +
          "이수구분 목표 학점이 0입니다.",
        ],
      };
    }
  }

  let candidates = [{
    sections: [],
    credits: 0,
  }];

  for (const combos of combinationsByCategory.values()) {
    const next = [];

    for (const base of candidates) {
      for (const combo of combos) {
        if (!combo.sections.every(s =>
          base.sections.every(b => !conflicts(s, b))
        )) continue;

        next.push({
          sections: [
            ...base.sections,
            ...combo.sections,
          ],
          credits: base.credits + combo.credits,
        });
      }
    }

    candidates = next;

    if (!candidates.length) break;
  }

  const targetOnline = plan.onlineCourses;

  candidates = candidates.filter(candidate => {
    if (candidate.credits !== plan.totalCredits) {
      return false;
    }

    const online = candidate.sections.filter(
      s => s.deliveryMode === "online"
    ).length;

    return online === targetOnline;
  });

  if (!candidates.length) {
    return {
      timetables: [],
      issues: [
        ...issues,
        "학점별 조합은 탐색했지만 수업시간 충돌 또는 " +
        "온라인 과목 수 조건을 모두 만족하는 조합이 없습니다.",
      ],
    };
  }

  const unique = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const signature =
      sectionSignature(candidate.sections);

    if (seen.has(signature)) continue;
    seen.add(signature);

    const score = calculateScore(
      candidate.sections,
      courseMap,
      plan
    );

    unique.push({
      ...candidate,
      ...score,
      preferredCount:
        candidate.sections.filter(
          s => preferredIds.has(s.courseId)
        ).length,
    });
  }

  unique.sort((a, b) =>
    b.utility - a.utility
  );

  const main = unique[0];

  function findBackup(references) {
    const used = new Set(
      references.map(x =>
        sectionSignature(x.sections)
      )
    );

    return unique
      .filter(candidate =>
        !used.has(sectionSignature(candidate.sections)) &&
        references.every(
          ref => courseDifference(candidate, ref) > 0
        )
      )
      .sort((a, b) => {
        const aDifference = Math.min(
          ...references.map(
            r => courseDifference(a, r)
          )
        );

        const bDifference = Math.min(
          ...references.map(
            r => courseDifference(b, r)
          )
        );

        const scoreA =
          a.utility + aDifference * 8;

        const scoreB =
          b.utility + bDifference * 8;

        return scoreB - scoreA;
      })[0] || null;
  }

  const backupA = findBackup([main]);
  const backupB = backupA
    ? findBackup([main, backupA])
    : null;

  const selected = [
    { label: "메인", type: "main", value: main },
    { label: "예비 A", type: "backupA", value: backupA },
    { label: "예비 B", type: "backupB", value: backupB },
  ].filter(x => x.value);

  if (selected.length < 3) {
    issues.push(
      `고유한 과목 구성을 가진 시간표 ` +
      `${selected.length}개만 확보했습니다.`
    );
  }

  return {
    timetables: selected.map((item, index) => ({
      rank: index + 1,
      label: item.label,
      type: item.type,
      credits: item.value.credits,
      preferredCount: item.value.preferredCount,
      utility: item.value.utility,
      components: item.value.components,
      sections: item.value.sections,
    })),
    issues,
  };
}

module.exports = {
  generateBackupTimetables,
};
