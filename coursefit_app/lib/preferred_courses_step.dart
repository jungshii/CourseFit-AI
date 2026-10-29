import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class PreferredCoursesStep extends StatefulWidget {
  final Map<int, int> majorRanks;
  final Map<int, int> generalRanks;
  final String fillMode;
  final ValueChanged<String> onFillModeChanged;
  final VoidCallback onSelectionChanged;

  const PreferredCoursesStep({
    super.key,
    required this.majorRanks,
    required this.generalRanks,
    required this.fillMode,
    required this.onFillModeChanged,
    required this.onSelectionChanged,
  });

  @override
  State<PreferredCoursesStep> createState() => _PreferredCoursesStepState();
}

class _PreferredCoursesStepState extends State<PreferredCoursesStep> {
  static const String apiBase = 'http://192.168.45.151:3000';

  List<Map<String, dynamic>> courses = [];

  bool loading = true;
  String? error;

  String category = 'major';
  String search = '';

  int visibleCount = 3;

  final TextEditingController searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    loadCourses();
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  Future<void> loadCourses() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final response = await http
          .get(Uri.parse('$apiBase/api/courses'))
          .timeout(const Duration(seconds: 20));

      if (response.statusCode != 200) {
        throw Exception('HTTP ${response.statusCode}');
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      final list = (data['courses'] as List)
          .map((item) => Map<String, dynamic>.from(item as Map))
          .toList();

      if (!mounted) return;

      setState(() {
        courses = list;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        error = '강의 목록을 불러오지 못했습니다: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  Map<int, int> get activeRanks =>
      category == 'major' ? widget.majorRanks : widget.generalRanks;

  List<Map<String, dynamic>> get filteredCourses {
    final list = courses.where((course) {
      final categoryMatches = course['courseCategory'] == category;

      final keyword = search.trim().toLowerCase();

      final name = (course['courseName'] ?? '').toString().toLowerCase();

      final code = (course['courseCode'] ?? '').toString().toLowerCase();

      return categoryMatches &&
          (keyword.isEmpty || name.contains(keyword) || code.contains(keyword));
    }).toList();

    // 선택한 과목을 먼저 보여줌
    list.sort((a, b) {
      final aId = (a['id'] as num).toInt();
      final bId = (b['id'] as num).toInt();

      final aRank = activeRanks[aId] ?? 99;
      final bRank = activeRanks[bId] ?? 99;

      if (aRank != bRank) {
        return aRank.compareTo(bRank);
      }

      return (a['courseName'] ?? '').toString().compareTo(
        (b['courseName'] ?? '').toString(),
      );
    });

    return list;
  }

  void updateRank(int courseId, int? rank) {
    if (rank == null) return;

    final ranks = activeRanks;

    if (rank == 0) {
      setState(() {
        ranks.remove(courseId);
      });
      widget.onSelectionChanged();
      return;
    }

    // 같은 유형 안에서 동일 순위 중복 불가
    final existingId = ranks.entries
        .where((entry) => entry.value == rank && entry.key != courseId)
        .map((entry) => entry.key)
        .firstOrNull;

    if (existingId != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$rank순위는 이미 다른 과목에 지정되었습니다. '
            '기존 순위를 해제합니다.',
          ),
        ),
      );
    }

    setState(() {
      if (existingId != null) {
        ranks.remove(existingId);
      }
      ranks[courseId] = rank;
    });

    widget.onSelectionChanged();
  }

  String categoryLabel(dynamic value) {
    switch (value) {
      case 'major_required':
        return '전공필수';
      case 'major_elective':
        return '전공선택';
      case 'major_foundation':
        return '전공기초';
      case 'general_required':
        return '기존 필수교양';
      case 'general_core':
        return '중핵교과';
      case 'general_foundation':
        return '기초 교과';
      case 'general_distribution':
        return '배분이수 교과';
      case 'general_free':
        return '자유이수 교과';
      default:
        return '이수구분 미확인';
    }
  }

  Widget courseCard(Map<String, dynamic> course) {
    final id = (course['id'] as num).toInt();
    final rank = activeRanks[id] ?? 0;

    return Card(
      elevation: 0,
      color: rank > 0 ? const Color(0xFFEAF0FF) : const Color(0xFFF3F6FC),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course['courseName']?.toString() ?? '과목명 미기재',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${course['courseCode'] ?? '코드 미기재'}'
                    ' · ${course['credits'] ?? '?'}학점',
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    categoryLabel(course['courseSubcategory']),
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF253D83),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            DropdownButton<int>(
              value: rank,
              items: [
                const DropdownMenuItem(value: 0, child: Text('미선택')),
                for (int i = 1; i <= 6; i++)
                  DropdownMenuItem(value: i, child: Text('$i순위')),
              ],
              onChanged: (v) => updateRank(id, v),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = filteredCourses;
    final visible = filtered.take(visibleCount).toList();

    final unclassified = courses
        .where(
          (c) =>
              c['courseCategory'] != 'major' &&
              c['courseCategory'] != 'general',
        )
        .length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '듣고 싶은 과목을 선택하세요',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        const Text(
          '필수과목 외에 희망하는 과목을 '
          '우선순위에 따라 지정하세요.',
          style: TextStyle(color: Colors.black54, fontSize: 13),
        ),
        const SizedBox(height: 20),

        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'major', label: Text('전공 과목')),
            ButtonSegment(value: 'general', label: Text('교양 과목')),
          ],
          selected: {category},
          onSelectionChanged: (values) {
            setState(() {
              category = values.first;
              visibleCount = 3;
              search = '';
              searchController.clear();
            });
          },
        ),

        const SizedBox(height: 16),

        TextField(
          controller: searchController,
          decoration: const InputDecoration(
            hintText: '과목명 또는 학수번호 검색',
            prefixIcon: Icon(Icons.search),
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            setState(() {
              search = value;
              visibleCount = 3;
            });
          },
        ),

        const SizedBox(height: 16),

        if (loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(30),
              child: CircularProgressIndicator(),
            ),
          )
        else if (error != null) ...[
          Text(error!, style: const TextStyle(color: Colors.red)),
          TextButton(onPressed: loadCourses, child: const Text('다시 시도')),
        ] else ...[
          Text(
            '${category == 'major' ? '전공' : '교양'} '
            '${filtered.length}개 과목',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),

          const SizedBox(height: 10),

          if (filtered.isEmpty)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                '해당 유형의 과목이 없습니다. '
                '강의 데이터의 이수구분을 확인하세요.',
              ),
            ),

          ...visible.map(courseCard),

          if (visibleCount < filtered.length)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    visibleCount += 3;
                  });
                },
                icon: const Icon(Icons.expand_more),
                label: const Text('3개 더보기'),
              ),
            ),

          if (unclassified > 0)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                '이수구분 미확인 과목 $unclassified개는 '
                '목록에서 제외되었습니다.',
                style: const TextStyle(fontSize: 12, color: Colors.deepOrange),
              ),
            ),
        ],

        const SizedBox(height: 26),

        const Text(
          '현재 선택한 희망 과목',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),

        const SizedBox(height: 10),

        Text(
          '전공 ${widget.majorRanks.length}개 '
          '· 교양 ${widget.generalRanks.length}개',
        ),

        const SizedBox(height: 16),

        const Card(
          elevation: 0,
          color: Color(0xFFEAF1FF),
          child: Padding(
            padding: EdgeInsets.all(14),
            child: Text(
              '이 단계에서는 희망 과목과 우선순위만 '
              '기록합니다. 실제 학점 충족 여부와 '
              '시간 충돌은 시간표 생성 단계에서 '
              '확인합니다.',
              style: TextStyle(fontSize: 12),
            ),
          ),
        ),
      ],
    );
  }
}
