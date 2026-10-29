import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'timetable_page.dart';
import 'home_page.dart';

void main() => runApp(const CourseFitApp());

const apiBase = 'http://192.168.45.151:3000';

class CourseFitApp extends StatelessWidget {
  const CourseFitApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CourseFit AI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
      home: const HomePage(),
    );
  }
}

class StudyPlanPage extends StatefulWidget {
  const StudyPlanPage({super.key});

  @override
  State<StudyPlanPage> createState() => _StudyPlanPageState();
}

class _StudyPlanPageState extends State<StudyPlanPage> {
  int minCredits = 15;
  int maxCredits = 18;

  final Map<String, int> preferences = {
    'teamProject': 2,
    'quiz': 2,
    'presentation': 2,
    'assignment': 2,
    'exam': 2,
  };

  final labels = {
    'teamProject': '팀 프로젝트',
    'quiz': '퀴즈',
    'presentation': '발표',
    'assignment': '과제',
    'exam': '시험',
  };

  final Map<int, String> selections = {};
  List<dynamic> courses = [];
  List<dynamic> recommendations = [];

  bool loading = true;
  bool saving = false;
  bool recommending = false;
  String? error;

  @override
  void initState() {
    super.initState();
    loadData();
  }

  Future<void> loadData() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final responses = await Future.wait([
        http.get(Uri.parse('$apiBase/api/courses')),
        http.get(Uri.parse('$apiBase/api/study-plan')),
      ]).timeout(const Duration(seconds: 15));

      if (responses.any((r) => r.statusCode != 200)) {
        throw Exception('강의 또는 수강 계획 조회 실패');
      }

      final courseData = jsonDecode(responses[0].body);
      final planData = jsonDecode(responses[1].body);
      final plan = planData['plan'];

      if (!mounted) return;

      setState(() {
        courses = courseData['courses'] as List<dynamic>;
        selections.clear();

        if (plan != null) {
          minCredits = plan['minCredits'] as int;
          maxCredits = plan['maxCredits'] as int;

          final savedPreferences = Map<String, dynamic>.from(
            plan['preferences'] as Map,
          );

          for (final key in preferences.keys) {
            final value = savedPreferences[key];
            if (value is int) preferences[key] = value;
          }

          for (final entry in plan['courses'] as List) {
            selections[entry['courseId'] as int] = entry['priority'] as String;
          }
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> savePlan() async {
    setState(() {
      saving = true;
      error = null;
    });

    try {
      final selectedCourses = selections.entries
          .where((e) => e.value != 'none')
          .map((e) => {'courseId': e.key, 'priority': e.value})
          .toList();

      final response = await http
          .post(
            Uri.parse('$apiBase/api/study-plan'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'minCredits': minCredits,
              'maxCredits': maxCredits,
              'preferences': preferences,
              'courses': selectedCourses,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        throw Exception(jsonDecode(response.body)['error'] ?? '저장 실패');
      }

      if (!mounted) return;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('수강 계획이 저장되었습니다.')));
    } catch (e) {
      if (!mounted) return;
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> recommend() async {
    setState(() {
      recommending = true;
      error = null;
      recommendations = [];
    });

    try {
      final response = await http
          .post(
            Uri.parse('$apiBase/api/recommend'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'preferences': preferences}),
          )
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        throw Exception('추천 계산 실패');
      }

      final data = jsonDecode(response.body);
      if (!mounted) return;

      setState(() {
        recommendations = data['recommendations'] as List<dynamic>;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = '$e');
    } finally {
      if (mounted) {
        setState(() => recommending = false);
      }
    }
  }

  Widget creditSetting() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '목표 학점',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Text('최소'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: minCredits,
                  items: List.generate(25, (i) => i)
                      .where((n) => n <= maxCredits)
                      .map(
                        (n) => DropdownMenuItem(value: n, child: Text('$n학점')),
                      )
                      .toList(),
                  onChanged: (n) {
                    if (n != null) {
                      setState(() => minCredits = n);
                    }
                  },
                ),
                const Spacer(),
                const Text('최대'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: maxCredits,
                  items: List.generate(25, (i) => i)
                      .where((n) => n >= minCredits)
                      .map(
                        (n) => DropdownMenuItem(value: n, child: Text('$n학점')),
                      )
                      .toList(),
                  onChanged: (n) {
                    if (n != null) {
                      setState(() => maxCredits = n);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget courseSelection(dynamic raw) {
    final course = Map<String, dynamic>.from(raw as Map);
    final id = course['id'] as int;
    final value = selections[id] ?? 'none';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              course['courseName'] ?? '과목명 미기재',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(
              '${course['courseCode'] ?? '학수번호 미기재'}'
              ' · ${course['credits'] ?? '?'}학점',
              style: const TextStyle(color: Colors.grey),
            ),
            DropdownButton<String>(
              value: value,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'none', child: Text('선택 안 함')),
                DropdownMenuItem(
                  value: 'required',
                  child: Text('이번 학기 반드시 수강'),
                ),
                DropdownMenuItem(value: 'preferred', child: Text('일반 희망 과목')),
              ],
              onChanged: (newValue) {
                if (newValue == null) return;
                setState(() => selections[id] = newValue);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget preferenceSetting(String key) {
    final value = preferences[key]!;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${labels[key]} · 회피 정도 $value/4',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            Slider(
              value: value.toDouble(),
              min: 0,
              max: 4,
              divisions: 4,
              label: '$value',
              onChanged: (v) {
                setState(() => preferences[key] = v.round());
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('CourseFit AI')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  '나의 수강 계획',
                  style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                const Text('이번 학기의 수강 조건을 설정하세요.'),
                const SizedBox(height: 16),
                creditSetting(),
                const SizedBox(height: 20),
                const Text(
                  '수강할 과목 선택',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                ...courses.map(courseSelection),
                if (courses.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('등록된 강의가 없습니다.'),
                  ),
                const SizedBox(height: 20),
                const Text(
                  '학습 선호도',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                ...preferences.keys.map(preferenceSetting),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: saving ? null : savePlan,
                  icon: const Icon(Icons.save),
                  label: Text(saving ? '저장 중...' : '수강 계획 저장'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: recommending ? null : recommend,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(recommending ? '계산 중...' : '선호도 기반 강의 추천'),
                ),

                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TimetablePage()),
                    );
                  },
                  icon: const Icon(Icons.calendar_month),
                  label: const Text('시간표 자동 생성'),
                ),

                if (error != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                if (recommendations.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const Text(
                    '추천 결과',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  ...recommendations.asMap().entries.map((entry) {
                    final course = entry.value as Map;
                    return Card(
                      child: ListTile(
                        title: Text(
                          '${entry.key + 1}위 · '
                          '${course['courseName'] ?? '과목명 미기재'}',
                        ),
                        subtitle: Text(
                          '정보 확인율 ${course['coverage']}%'
                          '${course['provisional'] == true ? ' · 잠정' : ''}',
                        ),
                        trailing: Text(
                          course['score'] == null
                              ? 'N/A'
                              : '${course['score']}점',
                        ),
                      ),
                    );
                  }),
                ],
              ],
            ),
    );
  }
}
