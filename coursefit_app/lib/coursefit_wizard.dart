import 'package:flutter/material.dart';
import 'schedule_preference_step.dart';
import 'preferred_courses_step.dart';
import 'priority_step.dart';
import 'timetable_page.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'required_courses_page.dart';

class CourseFitWizard extends StatefulWidget {
  const CourseFitWizard({super.key});

  @override
  State<CourseFitWizard> createState() => _CourseFitWizardState();
}

class _CourseFitWizardState extends State<CourseFitWizard> {
  int step = 0;

  static const String apiBase = 'http://192.168.45.151:3000';

  bool loadingSavedPlan = true;
  String? loadError;

  @override
  void initState() {
    super.initState();
    loadWizardPlan();
  }

  int? _readInteger(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }

  Map<String, dynamic> _readObject(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return <String, dynamic>{};
  }

  void _restoreCreditMap(dynamic source, Map<String, int> destination) {
    final values = _readObject(source);

    for (final key in destination.keys.toList()) {
      final value = _readInteger(values[key]);
      if (value != null && value >= 0) {
        destination[key] = value;
      }
    }
  }

  void _restoreRanks(dynamic source, Map<int, int> destination) {
    destination.clear();

    for (final entry in _readObject(source).entries) {
      final id = int.tryParse(entry.key);
      final rank = _readInteger(entry.value);

      if (id != null && rank != null && rank >= 1 && rank <= 6) {
        destination[id] = rank;
      }
    }
  }

  void _restoreStringSet(dynamic source, Set<String> destination) {
    destination.clear();

    if (source is List) {
      destination.addAll(source.whereType<String>());
    }
  }

  Future<void> loadWizardPlan() async {
    if (mounted) {
      setState(() {
        loadingSavedPlan = true;
        loadError = null;
      });
    }

    try {
      final response = await http
          .get(Uri.parse('$apiBase/api/wizard-plan'))
          .timeout(const Duration(seconds: 12));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final payload = jsonDecode(response.body) as Map<String, dynamic>;

      final rawPlan = payload['plan'];

      if (!mounted) return;

      if (rawPlan is Map) {
        final plan = Map<String, dynamic>.from(rawPlan);

        setState(() {
          departmentController.text = (plan['department'] ?? '').toString();

          totalCredits = _readInteger(plan['totalCredits']) ?? totalCredits;

          onlineCourses = _readInteger(plan['onlineCourses']) ?? onlineCourses;

          _restoreCreditMap(plan['majorBreakdown'], majorBreakdown);

          _restoreCreditMap(plan['generalBreakdown'], generalBreakdown);

          examPreference = (plan['examPreference'] ?? 'any').toString();

          final study = _readObject(plan['studyPreferences']);

          for (final key in studyPreferences.keys.toList()) {
            if (study[key] is String) {
              studyPreferences[key] = study[key] as String;
            }
          }

          final schedule = _readObject(plan['schedulePreferences']);

          _restoreStringSet(schedule['freeDays'], freeDays);

          _restoreStringSet(schedule['avoidSlots'], avoidSlots);

          _restoreStringSet(schedule['blockedSlots'], blockedSlots);

          avoidConsecutive = schedule['avoidConsecutive'] == true;

          final preferred = _readObject(plan['preferredCourses']);

          _restoreRanks(preferred['majorRanks'], majorRanks);

          _restoreRanks(preferred['generalRanks'], generalRanks);

          fillMode = 'auto';

          final storedPriorities = plan['priorities'];

          if (storedPriorities is List) {
            final restored = storedPriorities.whereType<String>().toList();

            if (restored.length == 3 &&
                restored.toSet().length == 3 &&
                restored.toSet().containsAll([
                  'courses',
                  'schedule',
                  'style',
                ])) {
              priorities = restored;
            }
          }

          requiredCourseIds.clear();

          final storedRequired = plan['requiredCourseIds'];

          if (storedRequired is List) {
            for (final value in storedRequired) {
              final id = _readInteger(value);

              if (id != null) {
                requiredCourseIds.add(id);
              }
            }
          }
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          loadError = error.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          loadingSavedPlan = false;
        });
      }
    }
  }

  final Set<int> requiredCourseIds = {};

  Future<void> openRequiredCourses() async {
    final result = await Navigator.push<Set<int>>(
      context,
      MaterialPageRoute(
        builder: (_) => RequiredCoursesPage(selectedIds: requiredCourseIds),
      ),
    );

    if (!mounted || result == null) return;

    setState(() {
      requiredCourseIds
        ..clear()
        ..addAll(result);
    });
  }

  List<String> priorities = ['courses', 'schedule', 'style'];
  final Map<int, int> majorRanks = {};
  final Map<int, int> generalRanks = {};

  String fillMode = 'auto';
  final Set<String> freeDays = {};
  final Set<String> avoidSlots = {};
  final Set<String> blockedSlots = {};

  bool avoidConsecutive = false;

  // STEP 1: 수강 기본 조건
  final departmentController = TextEditingController();

  int totalCredits = 18;
  int onlineCourses = 0;

  final Map<String, int> majorBreakdown = {'전공필수': 0, '전공선택': 12, '전공기초': 0};

  final Map<String, int> generalBreakdown = {
    '중핵교과': 0,
    '자유이수 교과': 0,
    '배분이수 교과': 6,
    '기초 교과': 0,
  };

  // STEP 2: 학습 선호도
  String examPreference = 'any';

  final Map<String, String> studyPreferences = {
    'teamProject': 'neutral',
    'quiz': 'neutral',
    'presentation': 'neutral',
    'report': 'neutral',
  };

  final List<String> titles = [
    '수강 기본 조건',
    '학습 선호도',
    '시간표 선호도',
    '희망 과목 선택',
    '조건 우선순위',
    '추천 시간표',
  ];

  int get majorCredits => majorBreakdown.values.fold(0, (a, b) => a + b);

  int get generalCredits => generalBreakdown.values.fold(0, (a, b) => a + b);

  bool get validCredits => majorCredits + generalCredits == totalCredits;

  bool get canContinue =>
      step != 0 ||
      (departmentController.text.trim().isNotEmpty && validCredits);

  @override
  void dispose() {
    departmentController.dispose();
    super.dispose();
  }

  // ============================================
  // 공통 UI
  // ============================================

  Widget sectionTitle(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget numberSelector(
    String title,
    int value,
    ValueChanged<int> onChange, {
    int max = 24,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(child: Text(title, style: const TextStyle(fontSize: 15))),
          IconButton.outlined(
            onPressed: value > 0 ? () => onChange(value - 1) : null,
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 46,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ),
          IconButton.outlined(
            onPressed: value < max ? () => onChange(value + 1) : null,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
    );
  }

  Widget breakdownCard(String title, Map<String, int> values) {
    return Card(
      elevation: 0,
      color: const Color(0xFFF3F6FC),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            for (final key in values.keys)
              numberSelector(key, values[key]!, (value) {
                setState(() {
                  values[key] = value;
                });
              }),
          ],
        ),
      ),
    );
  }

  // ============================================
  // STEP 1: 수강 기본 조건
  // ============================================

  Widget basicConditions() {
    final allocated = majorCredits + generalCredits;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle('이번 학기 수강 조건', '반드시 지켜야 하는 조건을 설정하세요.'),

        TextField(
          controller: departmentController,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: '학과',
            hintText: '예: 프랑스어학과',
            prefixIcon: Icon(Icons.school_outlined),
            border: OutlineInputBorder(),
          ),
        ),

        const SizedBox(height: 20),

        numberSelector('총 수강 학점', totalCredits, (value) {
          setState(() {
            totalCredits = value;
          });
        }),

        const SizedBox(height: 12),

        breakdownCard('전공 학점', majorBreakdown),

        const SizedBox(height: 12),

        breakdownCard('교양 학점', generalBreakdown),

        const SizedBox(height: 12),

        numberSelector('희망 온라인 과목 수', onlineCourses, (value) {
          setState(() {
            onlineCourses = value;
          });
        }),

        const SizedBox(height: 16),

        Card(
          elevation: 0,
          color: validCredits
              ? const Color(0xFFE7F5EF)
              : const Color(0xFFFFF1E5),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(
                  validCredits
                      ? Icons.check_circle_outline
                      : Icons.info_outline,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '총 $totalCredits학점\n'
                    '전공 $majorCredits + 교양 $generalCredits'
                    ' = $allocated학점\n'
                    '${validCredits ? "학점 배분이 일치합니다." : "학점 배분을 확인하세요."}',
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 20),

        sectionTitle('반드시 포함할 과목', '선택한 과목은 시간표 생성 시 우선 반영합니다.'),

        Card(
          child: ListTile(
            leading: const Icon(Icons.library_books_outlined),
            title: const Text('필수과목 선택'),
            subtitle: Text(
              requiredCourseIds.isEmpty
                  ? '반드시 수강할 과목을 선택하세요.'
                  : '${requiredCourseIds.length}개 과목 선택됨',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: openRequiredCourses,
          ),
        ),
      ],
    );
  }

  // ============================================
  // STEP 2: 학습 선호도
  // ============================================

  Widget optionCard({
    required String title,
    required String description,
    required String value,
    required List<(String, String)> options,
    required ValueChanged<String> onChange,
  }) {
    return Card(
      elevation: 0,
      color: const Color(0xFFF3F6FC),
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 5),

            Text(
              description,
              style: const TextStyle(color: Colors.black54, fontSize: 13),
            ),

            const SizedBox(height: 12),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: options.map((option) {
                final selected = value == option.$1;

                return ChoiceChip(
                  label: Text(option.$2),
                  selected: selected,
                  showCheckmark: false,
                  selectedColor: const Color(0xFFDCE6FF),
                  onSelected: (_) {
                    setState(() {
                      onChange(option.$1);
                    });
                  },
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget studyPreferencePage() {
    const generalOptions = [
      ('dislike', '싫음'),
      ('neutral', '상관없음'),
      ('like', '좋음'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle('나의 학습 선호도', '선호하는 평가 방식에 맞춰 강의를 추천합니다.'),

        optionCard(
          title: '시험',
          description: '어떤 시험 구성을 선호하나요?',
          value: examPreference,
          options: const [
            ('none', '시험 없음'),
            ('once', '중간 또는 기말 한 번'),
            ('twice', '중간·기말 두 번'),
            ('any', '상관없음'),
          ],
          onChange: (value) {
            examPreference = value;
          },
        ),

        optionCard(
          title: '팀 프로젝트',
          description: '팀원들과 협력하는 과제를 선호하나요?',
          value: studyPreferences['teamProject']!,
          options: generalOptions,
          onChange: (value) {
            studyPreferences['teamProject'] = value;
          },
        ),

        optionCard(
          title: '퀴즈',
          description: '수업 중 퀴즈를 선호하나요?',
          value: studyPreferences['quiz']!,
          options: generalOptions,
          onChange: (value) {
            studyPreferences['quiz'] = value;
          },
        ),

        optionCard(
          title: '발표',
          description: '개인 또는 조별 발표를 선호하나요?',
          value: studyPreferences['presentation']!,
          options: generalOptions,
          onChange: (value) {
            studyPreferences['presentation'] = value;
          },
        ),

        optionCard(
          title: '보고서',
          description: '레포트나 서술형 과제를 선호하나요?',
          value: studyPreferences['report']!,
          options: generalOptions,
          onChange: (value) {
            studyPreferences['report'] = value;
          },
        ),

        const SizedBox(height: 12),

        const Card(
          elevation: 0,
          color: Color(0xFFEAF1FF),
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Color(0xFF253D83)),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '필수로 지정한 과목은 학습 선호도가 '
                    '맞지 않아도 자동으로 제외하지 않습니다.',
                    style: TextStyle(fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  bool savingPlan = false;
  String? saveError;

  Map<String, dynamic> buildWizardPlan() {
    return {
      'department': departmentController.text.trim(),
      'totalCredits': totalCredits,
      'majorBreakdown': Map<String, int>.from(majorBreakdown),
      'generalBreakdown': Map<String, int>.from(generalBreakdown),
      'onlineCourses': onlineCourses,
      'examPreference': examPreference,
      'studyPreferences': Map<String, String>.from(studyPreferences),
      'schedulePreferences': {
        'freeDays': freeDays.toList()..sort(),
        'avoidSlots': avoidSlots.toList()..sort(),
        'blockedSlots': blockedSlots.toList()..sort(),
        'avoidConsecutive': avoidConsecutive,
      },
      'preferredCourses': {
        'majorRanks': majorRanks.map(
          (id, rank) => MapEntry(id.toString(), rank),
        ),
        'generalRanks': generalRanks.map(
          (id, rank) => MapEntry(id.toString(), rank),
        ),
        'fillMode': 'auto',
      },
      'priorities': List<String>.from(priorities),

      // 첫 번째 화면의 필수과목 DB 연동 전까지 비워둠
      'requiredCourseIds': requiredCourseIds.toList()..sort(),
    };
  }

  Future<bool> saveWizardPlan() async {
    if (savingPlan) return false;

    setState(() {
      savingPlan = true;
      saveError = null;
    });

    try {
      final response = await http
          .post(
            Uri.parse('http://192.168.45.151:3000/api/wizard-plan'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(buildWizardPlan()),
          )
          .timeout(const Duration(seconds: 20));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode != 200) {
        throw Exception(data['error']?.toString() ?? '저장 실패');
      }

      if (!mounted) return false;

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('수강 설정이 저장되었습니다.')));

      return true;
    } catch (e) {
      if (!mounted) return false;

      setState(() {
        saveError = e.toString();
      });

      return false;
    } finally {
      if (mounted) {
        setState(() {
          savingPlan = false;
        });
      }
    }
  }

  // ============================================
  // STEP 3~6: 추후 구현
  // ============================================

  Widget temporaryStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle('나의 추천 시간표', '메인 시간표와 예비 시간표를 비교해보세요.'),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TimetablePage()),
              );
            },
            icon: const Icon(Icons.calendar_month),
            label: const Text('추천 시간표 확인하기'),
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          '현재는 이전에 서버에 저장한 수강 계획을 '
          '기준으로 시간표를 생성합니다. '
          '새 Wizard 입력값 연동은 다음 단계에서 진행합니다.',
        ),
      ],
    );
  }

  // ============================================
  // 전체 화면 구성
  // ============================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFBFE),

      appBar: AppBar(
        title: const Text(
          'CourseFit AI',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
      ),

      body: SafeArea(
        child: Column(
          children: [
            // 상단 진행 표시
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${step + 1} / 6 단계',
                    style: const TextStyle(
                      color: Color(0xFF253D83),
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  LinearProgressIndicator(
                    value: (step + 1) / 6,
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(8),
                  ),

                  const SizedBox(height: 14),

                  Text(
                    titles[step],
                    style: const TextStyle(
                      fontSize: 25,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),

            // 단계별 내용
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16),

                children: [
                  if (loadingSavedPlan)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else ...[
                    if (loadError != null)
                      Card(
                        child: ListTile(
                          title: const Text('저장된 설정을 불러오지 못했습니다.'),
                          subtitle: Text(loadError!),
                          trailing: TextButton(
                            onPressed: loadWizardPlan,
                            child: const Text('재시도'),
                          ),
                        ),
                      ),
                    if (step == 0)
                      basicConditions()
                    else if (step == 1)
                      studyPreferencePage()
                    else if (step == 2)
                      SchedulePreferenceStep(
                        freeDays: freeDays,
                        avoidSlots: avoidSlots,
                        blockedSlots: blockedSlots,
                        avoidConsecutive: avoidConsecutive,
                        onConsecutiveChanged: (value) {
                          setState(() {
                            avoidConsecutive = value;
                          });
                        },
                      )
                    else if (step == 3)
                      PreferredCoursesStep(
                        majorRanks: majorRanks,
                        generalRanks: generalRanks,
                        fillMode: fillMode,
                        onFillModeChanged: (value) {
                          setState(() {
                            fillMode = value;
                          });
                        },
                        onSelectionChanged: () {
                          setState(() {});
                        },
                      )
                    else if (step == 4)
                      Column(
                        children: [
                          PriorityStep(
                            priorities: priorities,
                            onChanged: (updated) {
                              setState(() {
                                priorities = updated;
                              });
                            },
                          ),

                          // 저장 실패 시 오류 메시지 표시
                          if (saveError != null)
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(
                                saveError!,
                                style: const TextStyle(color: Colors.red),
                              ),
                            ),
                        ],
                      )
                    else
                      temporaryStep(),
                  ],
                ],
              ),
            ),

            // 하단 이동 버튼
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  if (step > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          setState(() {
                            step--;
                          });
                        },
                        child: const Text('이전'),
                      ),
                    ),

                  if (step > 0) const SizedBox(width: 10),

                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF253D83),
                        padding: const EdgeInsets.all(15),
                      ),

                      onPressed:
                          loadingSavedPlan ||
                              savingPlan ||
                              step == 5 ||
                              !canContinue
                          ? null
                          : () async {
                              if (step == 4) {
                                final success = await saveWizardPlan();

                                if (!success || !mounted) return;
                              }

                              setState(() {
                                step++;
                              });
                            },

                      child: Text(step == 5 ? '설정 완료' : '다음 단계'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
