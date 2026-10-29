# CourseFit AI STEP 7: 자동 시간표 생성

## 파일 배치

- `backend/timetable.js` -> `C:\dev\coursefit-ai\backend\timetable.js`
- `backend/importSections.js` -> `C:\dev\coursefit-ai\backend\importSections.js`
- `backend/sections.json` -> `C:\dev\coursefit-ai\backend\sections.json`
- `flutter/lib/timetable_page.dart` -> `C:\dev\coursefit-ai\coursefit_app\lib\timetable_page.dart`

## 서버 연결

`server.js` 맨 위에:
```js
const { listSections, generateTimetables } = require('./timetable');
```
`app.listen(...)` 바로 위에:
```js
app.get('/api/sections', (req,res) => {
  try { res.json({ success:true, sections:listSections() }); }
  catch (err) { console.error(err); res.status(500).json({ error:'분반 조회 실패' }); }
});
app.get('/api/timetables', (req,res) => {
  try { res.json({ success:true, ...generateTimetables() }); }
  catch (err) { console.error(err); res.status(500).json({ error:'시간표 생성 실패' }); }
});
```

## Flutter 연결

`main.dart` 상단에:
```dart
import 'timetable_page.dart';
```
`StudyPlanPage` 화면의 기존 저장 및 추천 버튼 아래에 (먼저 기존 `수강 계획 저장` 버튼으로 계획을 저장한 다음 이동):
```dart
OutlinedButton.icon(
  onPressed: () => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => const TimetablePage()),
  ),
  icon: const Icon(Icons.calendar_month),
  label: const Text('시간표 자동 생성'),
),
```


## 분반 데이터

`sections.json`의 예시는 사용자가 제공한 현대아프리카의이해 PDF에서 확인한 월/수 16:30~17:45입니다. 강의코드가 DB의 `course_code`와 정확히 같아야 합니다. 다른 강의의 분반 정보는 실제 수업시간표에서 확인한 값을 추가하세요. 시간 정보가 없는 과목은 자동 배치하지 않습니다.

## 실행

```powershell
cd C:\dev\coursefit-ai\backend
node importSections.js
node server.js
```
다른 창:
```powershell
Invoke-RestMethod http://localhost:3000/api/sections | ConvertTo-Json -Depth 10
Invoke-RestMethod http://localhost:3000/api/timetables | ConvertTo-Json -Depth 10
```
Flutter:
```powershell
cd C:\dev\coursefit-ai\coursefit_app
flutter run
```

## 제한사항
- 현재 등록된 강의는 분반별로 서로 다른 course_code가 부여될 수 있어 같은 교과목의 다른 분반을 하나로 묶는 별도 정규화 작업이 추후 필요합니다.
- 생성 조건은 등록된 수업시간, 필수과목, 최소/최대 학점을 기준으로 합니다.
- 희망 과목을 우선 고려하지만 모든 희망 과목을 필수로 강제하지 않습니다.
- 선택 후보 18개, 탐색 25만 노드 제한을 두며 전수 최적해 보장은 없습니다.
- 로그인 없는 단일 사용자 수강 계획을 가정합니다.
