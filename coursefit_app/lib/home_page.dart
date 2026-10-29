import 'package:flutter/material.dart';

import 'coursefit_wizard.dart';
import 'my_timetable_page.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  void openPage(BuildContext context, Widget page) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => page));
  }

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
        child: ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const SizedBox(height: 20),

            const Icon(
              Icons.school_rounded,
              size: 68,
              color: Color(0xFF253D83),
            ),

            const SizedBox(height: 20),

            const Text(
              '나에게 맞는 시간표',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 27, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 8),

            const Text(
              '강의 선호도를 반영해 시간표를 만들고\n'
              '선택한 시간표를 관리하세요.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),

            const SizedBox(height: 36),

            Card(
              color: const Color(0xFFEAF0FF),
              child: ListTile(
                contentPadding: const EdgeInsets.all(16),
                leading: const Icon(
                  Icons.auto_awesome,
                  color: Color(0xFF253D83),
                  size: 32,
                ),
                title: const Text(
                  '새 시간표 만들기',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                subtitle: const Text('수강 조건과 선호도를 설정하세요.'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openPage(context, const CourseFitWizard()),
              ),
            ),

            const SizedBox(height: 12),

            Card(
              color: Colors.white,
              child: ListTile(
                contentPadding: const EdgeInsets.all(16),
                leading: const Icon(
                  Icons.calendar_month,
                  color: Color(0xFF253D83),
                  size: 32,
                ),
                title: const Text(
                  '내 시간표',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                ),
                subtitle: const Text('저장한 시간표를 바로 확인하세요.'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => openPage(context, const MyTimetablePage()),
              ),
            ),

            const SizedBox(height: 26),

            const Card(
              color: Color(0xFFF3F6FC),
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  '시간표는 서버에 저장됩니다.\n'
                  '수강 계획이나 분반 정보가 변경되면 '
                  '시간표를 다시 확인해야 할 수 있습니다.',
                  style: TextStyle(fontSize: 13, color: Colors.black87),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
