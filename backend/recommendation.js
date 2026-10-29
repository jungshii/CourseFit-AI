
const { getCourses } = require("./database");

const keys = [
  "teamProject",
  "quiz",
  "presentation",
  "assignment",
  "exam",
];

const labels = {
  teamProject: "팀 프로젝트",
  quiz: "퀴즈",
  presentation: "발표",
  assignment: "과제",
  exam: "시험",
};

function exposure(item, presenceOnly = false) {
  if (!item || item.exists == null) return null;

  if (item.exists === false) return 0;

  if (presenceOnly) {
    // 활동 존재 여부만 확인된 경우의 임시 부담 가중치
    return 0.5;
  }

  if (typeof item.weight === "number") {
    // 성적 반영 비중을 0~1 범위로 변환
    return Math.min(1, Math.max(0, item.weight / 100));
  }

  // 활동은 있지만 비중을 모르는 경우
  return null;
}

function examExposure(evaluations) {
  const midterm = exposure(evaluations.midterm);
  const finalExam = exposure(evaluations.finalExam);

  if (midterm == null || finalExam == null) {
    return null;
  }

  return Math.min(1, midterm + finalExam);
}

function recommendCourses(preferences) {
  for (const key of keys) {
    const value = preferences[key];

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 4
    ) {
      throw new Error(`INVALID_PREFERENCE_${key}`);
    }
  }

  const courses = getCourses();

  const results = courses.map((course) => {
    const e = course.evaluations || {};

    const values = {
      teamProject: exposure(e.teamProject, true),
      quiz: exposure(e.quiz),
      presentation: exposure(e.presentation),
      assignment: exposure(e.assignment),
      exam: examExposure(e),
    };

    let penalty = 0;
    let knownCount = 0;
    const reasons = [];
    const unknown = [];

    for (const key of keys) {
      const value = values[key];
      const dislike = preferences[key];

      if (value === null) {
        unknown.push(labels[key]);
        continue;
      }

      knownCount++;

      const itemPenalty = (dislike / 4) * value;
      penalty += itemPenalty;

      if (dislike >= 2 && value > 0) {
        reasons.push(
          `${labels[key]} 부담이 선호도에 영향을 줍니다.`
        );
      } else if (dislike >= 2 && value === 0) {
        reasons.push(
          `${labels[key]} 부담이 없는 것으로 확인됩니다.`
        );
      }
    }

    // 확인된 항목만 계산에 반영
    const score = knownCount === 0
      ? null
      : Math.round(
          100 * (1 - penalty / knownCount)
        );

    const coverage = Math.round(
      knownCount / keys.length * 100
    );

    if (unknown.length > 0) {
      reasons.push(
        `정보 확인 필요: ${unknown.join(", ")}`
      );
    }

    return {
      id: course.id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      credits: course.credits,
      score,
      coverage,
      provisional: coverage < 100,
      reasons,
    };
  });

  // 미확인 항목이 있는 과목은 잠정 순위로 표시
  results.sort((a, b) => {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || b.coverage - a.coverage;
  });

  return results;
}

module.exports = { recommendCourses };
