import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const String apiBase = 'http://192.168.45.151:3000';

class TimetablePage extends StatefulWidget {
  const TimetablePage({super.key});

  @override
  State<TimetablePage> createState() => _TimetablePageState();
}

class _TimetablePageState extends State<TimetablePage> {
  bool loading = true;
  bool saving = false;

  String? error;

  List<dynamic> timetables = [];
  List<dynamic> issues = [];
  List<int> savedIds = [];

  bool savedValid = false;
  int index = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  List<int> sectionIds(Map<String, dynamic> timetable) {
    final result = (timetable['sections'] as List)
        .map((s) => (s['id'] as num).toInt())
        .toList();

    result.sort();
    return result;
  }

  bool sameIds(List<int> a, List<int> b) {
    if (a.length != b.length) return false;

    for (int i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }

    return true;
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final responses = await Future.wait([
        http.get(Uri.parse('$apiBase/api/timetables')),
        http.get(Uri.parse('$apiBase/api/selected-timetable')),
      ]).timeout(const Duration(seconds: 30));

      if (responses.any((r) => r.statusCode != 200)) {
        throw Exception('서버 API 응답 오류');
      }

      final timetableData =
          jsonDecode(responses[0].body) as Map<String, dynamic>;

      final selectedData =
          jsonDecode(responses[1].body) as Map<String, dynamic>;

      final options = timetableData['timetables'] as List? ?? [];

      final selected = selectedData['selected'] as Map?;

      final saved = (selected?['sectionIds'] as List? ?? [])
          .map((v) => (v as num).toInt())
          .toList();

      saved.sort();

      int found = 0;

      for (int i = 0; i < options.length; i++) {
        final option = Map<String, dynamic>.from(options[i] as Map);

        if (sameIds(sectionIds(option), saved)) {
          found = i;
          break;
        }
      }

      if (!mounted) return;

      setState(() {
        timetables = options;
        issues = timetableData['issues'] as List? ?? [];
        savedIds = saved;
        savedValid = selected?['valid'] == true;
        index = found;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  Future<void> save() async {
    if (timetables.isEmpty) return;

    final timetable = Map<String, dynamic>.from(timetables[index] as Map);

    final chosen = sectionIds(timetable);

    setState(() {
      saving = true;
      error = null;
    });

    try {
      final response = await http
          .post(
            Uri.parse('$apiBase/api/selected-timetable'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'sectionIds': chosen}),
          )
          .timeout(const Duration(seconds: 20));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode != 200) {
        throw Exception(data['error'] ?? '저장 실패');
      }

      if (!mounted) return;

      setState(() {
        savedIds = chosen;
        savedValid = data['selected']?['valid'] == true;
      });

      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('시간표가 저장되었습니다.')));
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          saving = false;
        });
      }
    }
  }

  int toMinutes(String time) {
    final parts = time.split(':').map(int.parse).toList();
    return parts[0] * 60 + parts[1];
  }

  String dayName(String day) {
    return const {
          'MON': '월',
          'TUE': '화',
          'WED': '수',
          'THU': '목',
          'FRI': '금',
        }[day] ??
        day;
  }

  Widget weeklyGrid(Map<String, dynamic> timetable) {
    final sections = (timetable['sections'] as List).cast<Map>();

    final meetings = <({Map course, Map meeting})>[];

    for (final course in sections) {
      for (final meeting in course['meetings'] as List) {
        if (const [
          'MON',
          'TUE',
          'WED',
          'THU',
          'FRI',
        ].contains(meeting['day'])) {
          meetings.add((course: course, meeting: meeting as Map));
        }
      }
    }

    if (meetings.isEmpty) {
      return const Text('월~금 수업 정보가 없습니다.');
    }

    final earliest = meetings
        .map((x) => toMinutes(x.meeting['start'] as String))
        .reduce(math.min);

    final latest = meetings
        .map((x) => toMinutes(x.meeting['end'] as String))
        .reduce(math.max);

    final start = (earliest ~/ 60) * 60;
    final end = ((latest + 59) ~/ 60) * 60;

    const hourHeight = 66.0;
    const timeWidth = 43.0;
    const dayWidth = 112.0;
    const headHeight = 36.0;

    final height = headHeight + (end - start) / 60 * hourHeight;

    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

    final colors = [
      Colors.indigo,
      Colors.teal,
      Colors.deepOrange,
      Colors.purple,
      Colors.blue,
      Colors.brown,
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SizedBox(
        width: timeWidth + 5 * dayWidth,
        height: height,
        child: Stack(
          children: [
            // 요일 헤더
            for (int d = 0; d < 5; d++)
              Positioned(
                left: timeWidth + d * dayWidth,
                top: 0,
                width: dayWidth,
                height: headHeight,
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Text(
                    dayName(days[d]),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),

            // 시간 표시와 가로선
            for (int h = start; h <= end; h += 60) ...[
              Positioned(
                left: 0,
                top: headHeight + (h - start) / 60 * hourHeight - 7,
                child: Text(
                  '${h ~/ 60}:00',
                  style: const TextStyle(fontSize: 11),
                ),
              ),
              Positioned(
                left: timeWidth,
                top: headHeight + (h - start) / 60 * hourHeight,
                width: dayWidth * 5,
                child: const Divider(height: 1, color: Colors.black12),
              ),
            ],

            // 요일 구분선
            for (int d = 0; d <= 5; d++)
              Positioned(
                left: timeWidth + d * dayWidth,
                top: headHeight,
                height: height - headHeight,
                child: const VerticalDivider(width: 1, color: Colors.black12),
              ),

            // 강의 블록
            for (int i = 0; i < meetings.length; i++)
              Builder(
                builder: (_) {
                  final item = meetings[i];

                  final day = days.indexOf(item.meeting['day'] as String);

                  final from = toMinutes(item.meeting['start'] as String);

                  final to = toMinutes(item.meeting['end'] as String);

                  final courseIndex = sections.indexWhere(
                    (s) => s['id'] == item.course['id'],
                  );

                  final color =
                      colors[(courseIndex >= 0 ? courseIndex : 0) %
                          colors.length];

                  return Positioned(
                    left: timeWidth + day * dayWidth + 2,
                    top: headHeight + (from - start) / 60 * hourHeight + 1,
                    width: dayWidth - 4,
                    height: math.max(24.0, (to - from) / 60 * hourHeight - 2),
                    child: Container(
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.15),
                        border: Border(
                          left: BorderSide(color: color, width: 3),
                        ),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: ClipRect(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${item.course['courseName']}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              '${item.meeting['start']}~'
                              '${item.meeting['end']}',
                              style: const TextStyle(fontSize: 10),
                            ),
                            Text(
                              '${item.meeting['room'] ?? ''}',
                              style: const TextStyle(fontSize: 10),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget timetableOption(Map<String, dynamic> timetable, int optionIndex) {
    final selected = index == optionIndex;

    final optionIds = sectionIds(timetable);

    final isSaved = savedValid && sameIds(optionIds, savedIds);

    final label = timetable['label']?.toString() ?? '${optionIndex + 1}위';

    final credits = timetable['credits'] ?? '?';

    final sectionCount = (timetable['sections'] as List).length;

    final preferredCount = timetable['preferredCount'] ?? 0;

    return Card(
      elevation: selected ? 2 : 0,
      color: selected ? const Color(0xFFEAF0FF) : null,
      margin: const EdgeInsets.only(bottom: 8),
      child: RadioListTile<int>(
        value: optionIndex,
        title: Text(
          '$label · $credits학점',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text('$sectionCount과목 · 희망 $preferredCount개'),
        secondary: isSaved
            ? const Icon(Icons.check_circle, color: Colors.green)
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final timetable = timetables.isEmpty
        ? null
        : Map<String, dynamic>.from(timetables[index] as Map);

    final selectedNow =
        timetable != null &&
        savedValid &&
        sameIds(sectionIds(timetable), savedIds);

    return Scaffold(
      appBar: AppBar(
        title: const Text('추천 시간표'),
        actions: [
          IconButton(
            onPressed: loading ? null : load,
            tooltip: '새로고침',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    '추천 시간표 비교',
                    style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
                  ),

                  const SizedBox(height: 8),

                  const Text(
                    '메인 시간표와 예비 시간표를 비교하고 '
                    '원하는 시간표를 저장하세요.',
                  ),

                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: Text(
                        error!,
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),

                  if (savedIds.isNotEmpty && !savedValid)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                        '저장된 시간표가 현재 수강 조건과 '
                        '일치하지 않습니다. 다시 선택하세요.',
                        style: TextStyle(color: Colors.deepOrange),
                      ),
                    ),

                  for (final issue in issues)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('안내: $issue'),
                    ),

                  if (timetables.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('조건을 만족하는 시간표가 없습니다.'),
                    ),

                  if (timetable != null) ...[
                    const SizedBox(height: 16),

                    // 최신 Flutter RadioGroup 사용
                    RadioGroup<int>(
                      groupValue: index,
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            index = value;
                          });
                        }
                      },
                      child: Column(
                        children: [
                          for (int i = 0; i < timetables.length; i++)
                            timetableOption(
                              Map<String, dynamic>.from(timetables[i] as Map),
                              i,
                            ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    Text(
                      '${timetable['label'] ?? '${index + 1}위'}'
                      ' · ${timetable['credits']}학점',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 12),

                    weeklyGrid(timetable),

                    const SizedBox(height: 18),

                    const Text(
                      '포함된 과목',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    const SizedBox(height: 8),

                    for (final raw in timetable['sections'] as List)
                      ListTile(
                        title: Text('${raw['courseName']}'),
                        subtitle: Text(
                          '${raw['courseCode']} · '
                          '${raw['section']}분반',
                        ),
                        trailing: raw['required'] == true
                            ? const Text(
                                '필수',
                                style: TextStyle(
                                  color: Color(0xFF253D83),
                                  fontWeight: FontWeight.bold,
                                ),
                              )
                            : null,
                      ),

                    const SizedBox(height: 16),

                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: saving ? null : save,
                        icon: Icon(
                          selectedNow ? Icons.check_circle : Icons.save,
                        ),
                        label: Text(
                          saving
                              ? '저장 중...'
                              : selectedNow
                              ? '저장된 시간표'
                              : '이 시간표 저장',
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
