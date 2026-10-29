
# CourseFit AI

### AI 기반 대학 강의 분석 및 맞춤형 시간표 추천 서비스

CourseFit AI는 대학생이 자신의 수강 조건과 학습 선호도를 바탕으로 최적의 시간표를 구성할 수 있도록 돕는 AI 기반 수강 계획 지원 애플리케이션입니다.

대학 강의계획서를 AI로 분석하여 강의 정보와 평가 방식을 구조화하고, 학생이 설정한 학점 조건, 필수과목, 희망 과목, 공강 및 학습 선호도를 종합적으로 고려하여 시간표를 추천합니다.

## 1. 프로젝트 개요

대학생들은 매 학기 수강신청을 준비하면서 여러 강의계획서를 직접 확인하고, 강의별 평가 방식과 수업시간을 비교해야 합니다.

특히 수강 학점, 필수 이수구분, 시간 충돌, 개인적인 선호도까지 고려하여 시간표를 구성하는 과정에는 상당한 시간과 노력이 필요합니다.

CourseFit AI는 이러한 과정을 간소화하기 위해 개발되었습니다.

**핵심 목표**

- AI를 활용한 강의계획서 분석 자동화
- 강의별 평가 방식 및 수업 정보의 구조화
- 학생 맞춤형 수강 계획 수립 지원
- 다양한 제약조건을 반영한 시간표 자동 생성
- 메인 및 예비 시간표를 통한 수강신청 대안 제공

## 2. 주요 기능

### 2.1 AI 기반 강의계획서 분석

ChatKHU API를 활용하여 강의계획서의 내용을 분석하고 정형화된 데이터로 변환합니다.

주요 분석 항목은 다음과 같습니다.

- 강의명 및 학수번호
- 학점 및 이수구분
- 강의 개요
- 중간고사 및 기말고사
- 퀴즈 및 과제
- 팀 프로젝트 및 발표
- 출석 평가
- 기타 평가 항목과 반영 비율

분석 결과는 JSON 형식으로 구조화하여 SQLite 데이터베이스에 저장합니다.

### 2.2 개인별 수강 조건 설정

학생은 원하는 수강 계획을 직접 설정할 수 있습니다.

- 총 수강 학점
- 전공 및 교양 이수구분별 학점
- 온라인 강의 수
- 반드시 포함할 필수과목
- 희망 과목 및 우선순위

전공필수, 전공선택, 전공기초와 중핵교과, 기초교과, 배분이수교과, 자유이수교과 등의 구분을 지원합니다.

### 2.3 학습 선호도 설정

강의의 평가 방식에 대한 학생의 선호도를 반영합니다.

- 시험 횟수
- 팀 프로젝트
- 퀴즈
- 발표
- 보고서 및 과제

각 항목의 선호도를 설정하고 시간표 추천 점수에 반영합니다.

### 2.4 시간표 선호도 설정

학생의 생활 패턴에 맞는 시간표를 구성할 수 있습니다.

- 희망 공강 요일
- 기피 시간대
- 수강 불가능한 시간대
- 연속 수업 선호 여부

수업시간이 서로 겹치지 않도록 제약조건을 적용합니다.

### 2.5 맞춤형 시간표 추천

학생이 설정한 조건을 기반으로 시간표 조합을 탐색합니다.

학점 및 이수구분, 필수과목, 수업시간 충돌, 온라인 과목 수 등의 조건을 고려하며, 희망 과목과 학습·시간표 선호도를 점수화합니다.

추천 결과는 다음 세 가지로 구성됩니다.

| 구분 | 설명 |
|---|---|
| 메인 시간표 | 현재 추천 점수가 가장 높은 시간표 |
| 예비 시간표 A | 메인과 다른 과목 구성을 포함한 대안 |
| 예비 시간표 B | 추가적인 과목 조합을 제공하는 대안 |

추천 알고리즘은 후보 제한이 있는 탐색 방식을 사용하므로 모든 가능한 시간표를 완전 탐색하거나 전역 최적해를 보장하지는 않습니다.

### 2.6 수강 계획 저장 및 복원

학생이 설정한 수강 조건과 선호도를 백엔드에 저장하고, 이후 다시 불러올 수 있도록 구성했습니다.

선택한 시간표 역시 별도로 저장하고 조회할 수 있습니다.

## 3. 기술 스택

| 구분 | 기술 |
|---|---|
| 모바일 애플리케이션 | Flutter, Dart |
| 백엔드 | Node.js, Express |
| 데이터베이스 | SQLite |
| AI 분석 | ChatKHU API |
| PDF 텍스트 추출 | Poppler (pdftotext) |
| 데이터 통신 | REST API, JSON |
| 개발 환경 | Windows, Android Studio |

## 4. 시스템 아키텍처

```text
                [Flutter Android App]
                          |
                       REST API
                          |
                          v
                [Node.js / Express]
                          |
              +-----------+-----------+
              |                       |
              v                       v
        [SQLite DB]           [추천 알고리즘]
              |                       |
         강의 정보 저장           제약조건 검증
         평가 방식 저장           시간표 조합 탐색
         사용자 설정 저장         선호도 기반 평가

[강의계획서 PDF]
        |
        v
[Poppler 텍스트 추출]
        |
        v
[ChatKHU AI 분석]
        |
        v
[구조화된 JSON 데이터]
        |
        v
[SQLite DB]
```

강의계획서 분석 및 데이터 등록은 백엔드의 별도 관리 스크립트에서 수행합니다.

## 5. 프로젝트 구조

```text
CourseFit-AI/
├── backend/
│   ├── server.js
│   ├── database.js
│   ├── syllabusAnalyzer.js
│   ├── importJsonCourses.js
│   ├── timetable.js
│   ├── backupTimetables.js
│   ├── wizardPlan.js
│   ├── selectedTimetable.js
│   ├── package.json
│   └── ...
│
├── coursefit_app/
│   ├── lib/
│   │   ├── main.dart
│   │   ├── home_page.dart
│   │   ├── coursefit_wizard.dart
│   │   ├── required_courses_page.dart
│   │   ├── preferred_courses_step.dart
│   │   ├── schedule_preference_step.dart
│   │   ├── priority_step.dart
│   │   ├── timetable_page.dart
│   │   └── my_timetable_page.dart
│   │
│   ├── android/
│   ├── assets/
│   └── pubspec.yaml
│
└── README.md
```

## 6. 실행 방법

### 6.1 저장소 복제

```bash
git clone https://github.com/jungshii/CourseFit-AI.git
cd CourseFit-AI
```

### 6.2 백엔드 실행

Node.js 설치 후 다음 명령어를 실행합니다.

```bash
cd backend
npm install
```

ChatKHU 기반 분석 기능을 사용하려면 별도의 API 인증 정보와 Poppler 경로를 환경변수로 설정해야 합니다.

예시:

```env
CHATKHU_API_KEY=YOUR_API_KEY
CHATKHU_MODEL=YOUR_MODEL_NAME
PDFTOTEXT_PATH=YOUR_PDFTOTEXT_PATH
```

실제 API 인증 정보는 GitHub에 업로드하지 않아야 합니다.

이후 서버를 실행합니다.

```bash
node server.js
```

기본 API 주소:

```text
http://localhost:3000
```

### 6.3 Flutter 앱 실행

새 터미널에서 실행합니다.

```bash
cd coursefit_app
flutter pub get
flutter run
```

Android 에뮬레이터에서는 호스트 PC의 서버에 접근하기 위해 다음 주소를 사용할 수 있습니다.

```text
http://10.0.2.2:3000
```

실제 Android 기기에서는 접근 가능한 백엔드 서버 주소로 변경해야 합니다.

### 6.4 APK 빌드

```bash
flutter build apk --release
```

생성 위치:

```text
coursefit_app/build/app/outputs/flutter-apk/app-release.apk
```

## 7. 주요 API

| 메서드 | 엔드포인트 | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태 확인 |
| GET | `/api/courses` | 강의 목록 조회 |
| GET | `/api/sections` | 강의 분반 정보 조회 |
| GET | `/api/wizard-plan` | 저장된 수강 조건 조회 |
| POST | `/api/wizard-plan` | 수강 조건 저장 |
| GET | `/api/timetables` | 추천 시간표 생성 및 조회 |
| GET | `/api/selected-timetable` | 선택한 시간표 조회 |
| POST | `/api/selected-timetable` | 시간표 선택 및 저장 |

## 8. 개발 현황 및 한계

현재 CourseFit AI는 Android 기반 프로토타입입니다.

구현된 주요 기능은 다음과 같습니다.

- AI 기반 강의계획서 분석 파이프라인
- 강의 데이터의 SQLite 저장 및 관리
- 수강 조건 입력을 위한 단계별 Wizard
- 학습 및 시간표 선호도 설정
- 필수과목 및 희망 과목 선택
- 선호도 기반 시간표 추천
- 메인 및 예비 시간표 생성
- 수강 계획과 선택 시간표 저장

다음과 같은 한계가 존재합니다.

- 현재 백엔드는 별도로 실행해야 합니다.
- 데이터베이스에 등록된 강의 및 분반 정보에 따라 추천 가능한 시간표가 달라집니다.
- 시간표 탐색 과정에서 후보 수 제한을 사용하므로 최적해를 보장하지 않습니다.
- 일부 강의는 수업 방식이나 시간 정보 확인이 필요할 수 있습니다.
- 현재 수강 계획 저장 기능은 단일 사용자 프로토타입 구조를 기반으로 합니다.

## 9. 향후 개선 방향

- 시간표 탐색 알고리즘의 성능 및 효율성 개선
- 강의 데이터의 자동 갱신
- 추천 결과에 대한 상세 설명 제공
- 사용자별 수강 계획 관리
- 백엔드 서버 배포 및 모바일 환경 지원 확대
- Android 앱의 사용자 경험 개선

## 10. 프로젝트 안내

CourseFit AI는 대학생의 수강 계획 수립을 지원하기 위한 개발 프로젝트입니다.

AI가 분석한 강의 정보 및 추천 결과는 실제 수강신청 정보와 차이가 있을 수 있으므로, 최종 신청 전 대학 공식 강의 정보를 확인해야 합니다.

또한 강의계획서 원본, 분석 데이터베이스, API 인증 정보는 공개 저장소에 포함하지 않습니다.
