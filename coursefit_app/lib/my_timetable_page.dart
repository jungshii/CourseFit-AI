import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class MyTimetablePage extends StatefulWidget {
  const MyTimetablePage({super.key});

  @override
  State<MyTimetablePage> createState() => _MyTimetablePageState();
}

class _MyTimetablePageState extends State<MyTimetablePage> {
  static const apiBase = 'http://192.168.45.151:3000';
  static const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  static const dayNames = ['월', '화', '수', '목', '금'];

  bool loading = true;
  String? error;
  Map<String, dynamic>? saved;

  @override
  void initState() {
    super.initState();
    loadSavedTimetable();
  }

  Future<void> loadSavedTimetable() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final response = await http
          .get(Uri.parse('$apiBase/api/selected-timetable'))
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (!mounted) return;

      setState(() {
        final value = data['selected'];
        saved = value is Map ? Map<String, dynamic>.from(value) : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  int toMinutes(String time) {
    final p = time.split(':').map(int.parse).toList();
    return p[0] * 60 + p[1];
  }

  String timeLabel(int minutes) {
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  Widget weeklyGrid(List<dynamic> sections) {
    final events = <Map<String, dynamic>>[];

    for (int i = 0; i < sections.length; i++) {
      final course = Map<String, dynamic>.from(sections[i] as Map);

      for (final raw in (course['meetings'] as List? ?? [])) {
        final m = Map<String, dynamic>.from(raw as Map);
        final day = days.indexOf(m['day']?.toString() ?? '');

        if (day < 0) continue;

        final start = m['start']?.toString();
        final end = m['end']?.toString();

        if (start == null || end == null) continue;

        try {
          final from = toMinutes(start);
          final to = toMinutes(end);

          if (from >= to) continue;

          events.add({
            'course': course,
            'meeting': m,
            'day': day,
            'from': from,
            'to': to,
            'colorIndex': i,
          });
        } catch (_) {
          continue;
        }
      }
    }

    if (events.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Text('표시할 월~금 수업시간 정보가 없습니다.'),
      );
    }

    final first = events.map((e) => e['from'] as int).reduce(math.min);
    final last = events.map((e) => e['to'] as int).reduce(math.max);

    final firstHour = (first ~/ 60) * 60;
    final lastHour = ((last + 59) ~/ 60) * 60;

    const hourHeight = 72.0;
    const dayWidth = 115.0;
    const timeWidth = 48.0;
    const headerHeight = 36.0;

    final gridHeight = headerHeight + (lastHour - firstHour) / 60 * hourHeight;

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
        width: timeWidth + dayWidth * 5,
        height: gridHeight + 12,
        child: Stack(
          children: [
            for (int d = 0; d < 5; d++)
              Positioned(
                left: timeWidth + d * dayWidth,
                top: 0,
                width: dayWidth,
                height: headerHeight,
                child: Center(
                  child: Text(
                    dayNames[d],
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),

            for (int h = firstHour; h <= lastHour; h += 60) ...[
              Positioned(
                left: 0,
                top: headerHeight + (h - firstHour) / 60 * hourHeight,
                child: Text(timeLabel(h), style: const TextStyle(fontSize: 10)),
              ),
              Positioned(
                left: timeWidth,
                top: headerHeight + (h - firstHour) / 60 * hourHeight,
                width: dayWidth * 5,
                child: const Divider(height: 1, color: Colors.black12),
              ),
            ],

            for (int d = 0; d <= 5; d++)
              Positioned(
                left: timeWidth + d * dayWidth,
                top: headerHeight,
                height: gridHeight - headerHeight,
                child: const VerticalDivider(width: 1, color: Colors.black12),
              ),

            for (final event in events)
              Positioned(
                left: timeWidth + (event['day'] as int) * dayWidth + 2,
                top:
                    headerHeight +
                    ((event['from'] as int) - firstHour) / 60 * hourHeight +
                    1,
                width: dayWidth - 4,
                height: math.max(
                  25.0,
                  ((event['to'] as int) - (event['from'] as int)) /
                          60 *
                          hourHeight -
                      2,
                ),
                child: Builder(
                  builder: (context) {
                    final course = event['course'] as Map<String, dynamic>;
                    final meeting = event['meeting'] as Map<String, dynamic>;
                    final color =
                        colors[(event['colorIndex'] as int) % colors.length];

                    return Container(
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.16),
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
                              '${course['courseName'] ?? '과목명 미기재'}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                              ),
                            ),
                            Text(
                              '${meeting['start']}–${meeting['end']}',
                              style: const TextStyle(fontSize: 10),
                            ),
                            Text(
                              '${meeting['room'] ?? ''}',
                              style: const TextStyle(fontSize: 10),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sections = saved?['sections'] as List? ?? [];

    final credits = sections.fold<double>(0, (sum, raw) {
      final course = raw as Map;
      return sum + ((course['credits'] as num?)?.toDouble() ?? 0);
    });

    final valid = saved?['valid'] == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('내 시간표'),
        actions: [
          IconButton(
            onPressed: loading ? null : loadSavedTimetable,
            tooltip: '새로고침',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: loadSavedTimetable,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  const Text(
                    '내가 저장한 시간표',
                    style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 14),

                  if (error != null)
                    Text(
                      '서버 연결 오류: $error',
                      style: const TextStyle(color: Colors.red),
                    )
                  else if (saved == null)
                    const Card(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Column(
                          children: [
                            Icon(Icons.event_busy, size: 48),
                            SizedBox(height: 12),
                            Text('아직 저장된 시간표가 없습니다.'),
                            SizedBox(height: 6),
                            Text('새 시간표를 생성하고 저장하세요.'),
                          ],
                        ),
                      ),
                    )
                  else ...[
                    Card(
                      color: valid
                          ? const Color(0xFFE7F5EF)
                          : const Color(0xFFFFF1E5),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              valid ? '저장된 시간표' : '시간표 재확인 필요',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${sections.length}과목 · '
                              '${credits.toStringAsFixed(credits == credits.roundToDouble() ? 0 : 1)}학점',
                            ),
                            Text(
                              '저장 시각: '
                              '${saved!['selectedAt'] ?? '미확인'}',
                              style: const TextStyle(fontSize: 12),
                            ),
                            if (!valid)
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(
                                  '현재 추천 조건과 일치하지 않거나 '
                                  '일부 분반 정보가 변경되었습니다.',
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 18),
                    weeklyGrid(sections),
                    const SizedBox(height: 20),

                    const Text(
                      '수강 과목 목록',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),

                    for (final raw in sections)
                      ListTile(
                        leading: const Icon(Icons.menu_book),
                        title: Text(
                          '${(raw as Map)['courseName'] ?? '과목명 미기재'}',
                        ),
                        subtitle: Text(
                          '${raw['courseCode'] ?? ''} · '
                          '${raw['section'] ?? ''}분반',
                        ),
                        trailing: Text('${raw['credits'] ?? '?'}학점'),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
