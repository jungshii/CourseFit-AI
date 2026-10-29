const { recommendCourses } = require("./recommendation");

const {
  saveWizardPlan,
  getWizardPlan
} = require("./wizardPlan");

const {
  generateBackupTimetables
} = require("./backupTimetables");

const {
  saveSelectedTimetable,
  getSelectedTimetable,
} = require("./selectedTimetable");

const {
  listSections,
  generateTimetables
} = require("./timetable");

const {
  saveStudyPlan,
  getStudyPlan
} = require("./studyPlan");

require("dotenv").config();

const express = require("express");
const { getCourses } = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

// 서버 상태 확인
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "CourseFit AI backend is running!"
  });
});

// 학생용 강의 목록 조회
app.get("/api/courses", (req, res) => {
  try {
    const courses = getCourses();

    res.json({
      success: true,
      count: courses.length,
      courses
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "강의 목록 조회에 실패했습니다."
    });
  }
});


app.post("/api/recommend", (req, res) => {
  try {
    const preferences = req.body?.preferences;

    if (
      !preferences ||
      typeof preferences !== "object" ||
      Array.isArray(preferences)
    ) {
      return res.status(400).json({
        error: "학습 선호도를 입력하세요.",
      });
    }

    const recommendations =
      recommendCourses(preferences);

    return res.json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (error) {
    if (error.message.startsWith("INVALID_PREFERENCE")) {
      return res.status(400).json({
        error: "선호도는 0~4 사이의 정수여야 합니다.",
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "강의 추천 계산에 실패했습니다.",
    });
  }
});


app.get("/api/study-plan", (req, res) => {
  try {
    res.json({
      success: true,
      plan: getStudyPlan()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "수강 계획 조회 실패"
    });
  }
});

app.post("/api/study-plan", (req, res) => {
  try {
    const plan = saveStudyPlan(req.body);

    res.json({
      success: true,
      plan
    });
  } catch (error) {
    console.error(error.message);

    if (
      error.message.startsWith("INVALID_") ||
      error.message === "COURSE_NOT_FOUND"
    ) {
      return res.status(400).json({
        error: error.message
      });
    }

    res.status(500).json({
      error: "수강 계획 저장 실패"
    });
  }
});

app.get("/api/sections", (req, res) => {
  try {
    res.json({
      success: true,
      sections: listSections()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "분반 조회 실패" });
  }
});


app.get("/api/timetables", (req, res) => {
  try {
    res.json({
      success: true,
      ...generateBackupTimetables(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "시간표 생성 오류",
    });
  }
});



app.get("/api/selected-timetable", (req, res) => {
  try {
    res.json({
      success: true,
      selected: getSelectedTimetable(),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "선택한 시간표 조회 실패",
    });
  }
});

app.post("/api/selected-timetable", (req, res) => {
  try {
    const selected = saveSelectedTimetable(
      req.body?.sectionIds
    );

    res.json({
      success: true,
      selected,
    });
  } catch (error) {
    console.error(error);

    res.status(error.status || 500).json({
      error: error.message,
    });
  }
});


app.get("/api/wizard-plan", (req, res) => {
  try {
    res.json({
      success: true,
      plan: getWizardPlan()
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "수강 설정 조회 실패"
    });
  }
});

app.post("/api/wizard-plan", (req, res) => {
  try {
    const plan = saveWizardPlan(req.body);

    res.json({
      success: true,
      plan
    });
  } catch (error) {
    console.error("Wizard validation:", error.message);

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});


app.listen(PORT, "0.0.0.0", () => {
  console.log(`CourseFit API running on port ${PORT}`);
});
