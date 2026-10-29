import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class RequiredCoursesPage extends StatefulWidget {
  final Set<int> selectedIds;

  const RequiredCoursesPage({super.key, required this.selectedIds});

  @override
  State<RequiredCoursesPage> createState() => _RequiredCoursesPageState();
}

class _RequiredCoursesPageState extends State<RequiredCoursesPage> {
  static const apiBase = 'http://192.168.45.151:3000';

  late Set<int> selectedIds;

  List<Map<String, dynamic>> courses = [];
  String query = '';
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    selectedIds = Set<int>.from(widget.selectedIds);
    loadCourses();
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

      final json = jsonDecode(response.body) as Map<String, dynamic>;

      final data = (json['courses'] as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      if (!mounted) return;

      setState(() {
        courses = data;
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

  List<Map<String, dynamic>> get filteredCourses {
    final keyword = query.trim().toLowerCase();

    final filtered = courses.where((course) {
      final name = '${course['courseName'] ?? ''}'.toLowerCase();
      final code = '${course['courseCode'] ?? ''}'.toLowerCase();

      return name.contains(keyword) || code.contains(keyword);
    }).toList();

    filtered.sort((a, b) {
      final aId = (a['id'] as num).toInt();
      final bId = (b['id'] as num).toInt();

      final aSelected = selectedIds.contains(aId);
      final bSelected = selectedIds.contains(bId);

      if (aSelected != bSelected) {
        return aSelected ? -1 : 1;
      }

      return '${a['courseName'] ?? ''}'.compareTo('${b['courseName'] ?? ''}');
    });

    return filtered;
  }

  void toggleCourse(int id, bool checked) {
    setState(() {
      if (checked) {
        selectedIds.add(id);
      } else {
        selectedIds.remove(id);
      }
    });
  }

  void confirm() {
    Navigator.pop(context, selectedIds);
  }

  @override
  Widget build(BuildContext context) {
    final filtered = filteredCourses;

    return Scaffold(
      appBar: AppBar(title: const Text('필수과목 선택')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '반드시 수강할 과목',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '이번 학기에 반드시 포함할 과목을 '
                    '선택하세요. 여러 개 선택할 수 있습니다.',
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    decoration: const InputDecoration(
                      hintText: '과목명 또는 학수번호 검색',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (value) {
                      setState(() {
                        query = value;
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '선택한 필수과목: ${selectedIds.length}개',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF253D83),
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: loading
                  ? const Center(child: CircularProgressIndicator())
                  : error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('조회 실패: $error'),
                          TextButton(
                            onPressed: loadCourses,
                            child: const Text('다시 시도'),
                          ),
                        ],
                      ),
                    )
                  : filtered.isEmpty
                  ? const Center(child: Text('검색 결과가 없습니다.'))
                  : ListView.builder(
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final course = filtered[index];
                        final id = (course['id'] as num).toInt();

                        return CheckboxListTile(
                          value: selectedIds.contains(id),
                          onChanged: (checked) {
                            toggleCourse(id, checked ?? false);
                          },
                          title: Text('${course['courseName'] ?? '과목명 미기재'}'),
                          subtitle: Text(
                            '${course['courseCode'] ?? ''}'
                            ' · ${course['credits'] ?? '?'}학점',
                          ),
                          controlAffinity: ListTileControlAffinity.leading,
                        );
                      },
                    ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: confirm,
                  child: Text('${selectedIds.length}개 필수과목 선택 완료'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
