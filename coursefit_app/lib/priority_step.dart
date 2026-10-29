import 'package:flutter/material.dart';

class PriorityStep extends StatelessWidget {
  final List<String> priorities;
  final ValueChanged<List<String>> onChanged;

  const PriorityStep({
    super.key,
    required this.priorities,
    required this.onChanged,
  });

  static const labels = {
    'courses': '내가 고른 과목',
    'schedule': '공강·수업 시간',
    'style': '수업 방식',
  };

  static const descriptions = {
    'courses': '희망 과목과 선택 순위를 최대한 반영합니다.',
    'schedule': '공강 요일과 기피 시간대를 최대한 반영합니다.',
    'style': '시험, 팀플, 발표 등 학습 선호도를 반영합니다.',
  };

  static const icons = {
    'courses': Icons.menu_book_outlined,
    'schedule': Icons.calendar_month_outlined,
    'style': Icons.tune_outlined,
  };

  void move(int index, int direction) {
    final target = index + direction;

    if (target < 0 || target >= priorities.length) return;

    final updated = List<String>.from(priorities);

    final value = updated.removeAt(index);
    updated.insert(target, value);

    onChanged(updated);
  }

  Widget priorityCard(int index) {
    final key = priorities[index];

    return Card(
      elevation: 0,
      color: const Color(0xFFF3F6FC),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: const Color(0xFF253D83),
              foregroundColor: Colors.white,
              child: Text('${index + 1}'),
            ),
            const SizedBox(width: 12),
            Icon(icons[key], color: const Color(0xFF253D83)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    labels[key]!,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    descriptions[key]!,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: '우선순위 올리기',
                  onPressed: index == 0 ? null : () => move(index, -1),
                  icon: const Icon(Icons.keyboard_arrow_up),
                ),
                IconButton(
                  tooltip: '우선순위 내리기',
                  onPressed: index == priorities.length - 1
                      ? null
                      : () => move(index, 1),
                  icon: const Icon(Icons.keyboard_arrow_down),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '무엇을 먼저 반영할까요?',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          '모든 선호도를 동시에 만족하기 어려울 때, '
          '더 중요한 조건을 먼저 반영합니다.',
          style: TextStyle(color: Colors.black54, fontSize: 13),
        ),
        const SizedBox(height: 24),

        for (int i = 0; i < priorities.length; i++) priorityCard(i),

        const SizedBox(height: 20),

        const Card(
          elevation: 0,
          color: Color(0xFFEAF1FF),
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.verified_user_outlined, color: Color(0xFF253D83)),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    '필수과목, 수강 불가 시간, '
                    '필수 학점 조건은 이 우선순위와 '
                    '관계없이 반드시 지킵니다.',
                    style: TextStyle(fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 18),

        const Text(
          '참고: 이 순서는 시간표 추천의 우선순위를 '
          '설정하기 위한 정보입니다. 실제 추천 점수 '
          '계산에는 다음 개발 단계에서 반영됩니다.',
          style: TextStyle(fontSize: 12, color: Colors.black54),
        ),
      ],
    );
  }
}
