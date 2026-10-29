import 'package:flutter/material.dart';

class SchedulePreferenceStep extends StatefulWidget {
  final Set<String> freeDays;
  final Set<String> avoidSlots;
  final Set<String> blockedSlots;
  final bool avoidConsecutive;
  final ValueChanged<bool> onConsecutiveChanged;

  const SchedulePreferenceStep({
    super.key,
    required this.freeDays,
    required this.avoidSlots,
    required this.blockedSlots,
    required this.avoidConsecutive,
    required this.onConsecutiveChanged,
  });

  @override
  State<SchedulePreferenceStep> createState() => _SchedulePreferenceStepState();
}

class _SchedulePreferenceStepState extends State<SchedulePreferenceStep> {
  static const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  static const dayNames = ['월', '화', '수', '목', '금'];

  // 10:00~16:00, 30분 간격
  static const int slotCount = 12;
  static const double timeWidth = 55;
  static const double cellHeight = 38;

  String mode = 'avoid';
  bool? dragAdding;
  String? lastDragged;

  String keyFor(int day, int slot) {
    return '${days[day]}-$slot';
  }

  String timeLabel(int slot) {
    final minutes = 600 + slot * 30;
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  Set<String> get activeSlots =>
      mode == 'avoid' ? widget.avoidSlots : widget.blockedSlots;

  void toggleDay(String day) {
    setState(() {
      if (widget.freeDays.contains(day)) {
        widget.freeDays.remove(day);
      } else {
        widget.freeDays.add(day);
      }
    });
  }

  void markSlot(int day, int slot, bool add) {
    if (day < 0 || day >= days.length || slot < 0 || slot >= slotCount) {
      return;
    }

    final key = keyFor(day, slot);

    if (add) {
      // Hard/Soft 중복 선택 방지
      if (mode == 'avoid') {
        widget.blockedSlots.remove(key);
      } else {
        widget.avoidSlots.remove(key);
      }
      activeSlots.add(key);
    } else {
      activeSlots.remove(key);
    }

    setState(() {});
  }

  void processGesture(Offset position, {required bool starting}) {
    const gridWidth = 5.0;
    final width =
        (MediaQuery.sizeOf(context).width - 88 - timeWidth) / gridWidth;

    final day = ((position.dx - timeWidth) / width).floor();
    final slot = (position.dy / cellHeight).floor();

    if (day < 0 || day >= 5 || slot < 0 || slot >= slotCount) {
      return;
    }

    final key = keyFor(day, slot);

    if (starting) {
      dragAdding = !activeSlots.contains(key);
      lastDragged = null;
    }

    if (key == lastDragged) return;
    lastDragged = key;

    markSlot(day, slot, dragAdding ?? true);
  }

  Widget sectionTitle(String title, String description) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: const TextStyle(color: Colors.black54, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget daySelector() {
    return Wrap(
      spacing: 7,
      runSpacing: 8,
      children: List.generate(days.length, (index) {
        final selected = widget.freeDays.contains(days[index]);

        return FilterChip(
          label: Text('${dayNames[index]}요일'),
          selected: selected,
          selectedColor: const Color(0xFFDCE6FF),
          onSelected: (_) => toggleDay(days[index]),
        );
      }),
    );
  }

  Widget timeGrid() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final dayWidth = (constraints.maxWidth - timeWidth) / 5;

        return Column(
          children: [
            Row(
              children: [
                const SizedBox(width: timeWidth),
                for (final day in dayNames)
                  SizedBox(
                    width: dayWidth,
                    height: 35,
                    child: Center(
                      child: Text(
                        day,
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
              ],
            ),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (details) {
                selectAt(details.localPosition, dayWidth, starting: true);
              },
              onPanStart: (details) {
                selectAt(details.localPosition, dayWidth, starting: true);
              },
              onPanUpdate: (details) {
                selectAt(details.localPosition, dayWidth, starting: false);
              },
              onPanEnd: (_) {
                dragAdding = null;
                lastDragged = null;
              },
              child: Column(
                children: List.generate(slotCount, (slot) {
                  return Row(
                    children: [
                      SizedBox(
                        width: timeWidth,
                        height: cellHeight,
                        child: Align(
                          alignment: Alignment.topLeft,
                          child: Text(
                            timeLabel(slot),
                            style: const TextStyle(
                              fontSize: 11,
                              color: Colors.black54,
                            ),
                          ),
                        ),
                      ),
                      for (int day = 0; day < 5; day++)
                        cell(day, slot, dayWidth),
                    ],
                  );
                }),
              ),
            ),
          ],
        );
      },
    );
  }

  void selectAt(Offset position, double dayWidth, {required bool starting}) {
    final day = ((position.dx - timeWidth) / dayWidth).floor();

    final slot = (position.dy / cellHeight).floor();

    if (day < 0 || day >= 5 || slot < 0 || slot >= slotCount) {
      return;
    }

    final key = keyFor(day, slot);

    if (starting) {
      dragAdding = !activeSlots.contains(key);
      lastDragged = null;
    }

    if (lastDragged == key) return;

    lastDragged = key;
    markSlot(day, slot, dragAdding ?? true);
  }

  Widget cell(int day, int slot, double width) {
    final key = keyFor(day, slot);
    final avoided = widget.avoidSlots.contains(key);
    final blocked = widget.blockedSlots.contains(key);

    Color background = Colors.white;

    if (avoided) {
      background = const Color(0xFFDCE6FF);
    }
    if (blocked) {
      background = const Color(0xFFFFD9D5);
    }

    return Container(
      width: width,
      height: cellHeight,
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: const Color(0xFFE1E5ED), width: 0.5),
      ),
      child: Center(
        child: blocked
            ? const Icon(Icons.close, size: 14, color: Color(0xFFBB4C43))
            : avoided
            ? const Icon(Icons.remove, size: 13, color: Color(0xFF253D83))
            : null,
      ),
    );
  }

  void quickFirstPeriod() {
    setState(() {
      for (int day = 0; day < 5; day++) {
        for (int slot = 0; slot < 2; slot++) {
          final key = keyFor(day, slot);
          widget.avoidSlots.add(key);
          widget.blockedSlots.remove(key);
        }
      }
    });
  }

  void quickLunch() {
    setState(() {
      for (int day = 0; day < 5; day++) {
        // 12:00~13:00
        for (int slot = 4; slot < 6; slot++) {
          final key = keyFor(day, slot);
          widget.avoidSlots.add(key);
          widget.blockedSlots.remove(key);
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle('희망 공강 요일', '가능하다면 수업을 배치하지 않았으면 하는 요일을 선택하세요.'),
        daySelector(),

        const SizedBox(height: 24),

        sectionTitle('피하고 싶은 시간', '시간표를 터치하거나 드래그해서 표시하세요.'),

        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
              value: 'avoid',
              label: Text('가급적 피하기'),
              icon: Icon(Icons.edit_outlined),
            ),
            ButtonSegment(
              value: 'blocked',
              label: Text('수강 불가'),
              icon: Icon(Icons.block),
            ),
          ],
          selected: {mode},
          onSelectionChanged: (value) {
            setState(() => mode = value.first);
          },
        ),

        const SizedBox(height: 14),

        Row(
          children: [
            Container(width: 13, height: 13, color: const Color(0xFFDCE6FF)),
            const SizedBox(width: 5),
            const Text('가급적 피하기', style: TextStyle(fontSize: 12)),
            const SizedBox(width: 15),
            Container(width: 13, height: 13, color: const Color(0xFFFFD9D5)),
            const SizedBox(width: 5),
            const Text('수강 불가', style: TextStyle(fontSize: 12)),
          ],
        ),

        const SizedBox(height: 14),

        Card(
          elevation: 0,
          color: const Color(0xFFF3F6FC),
          child: Padding(padding: const EdgeInsets.all(8), child: timeGrid()),
        ),

        const SizedBox(height: 24),

        sectionTitle('빠른 선택', '자주 사용하는 시간표 조건을 간편하게 설정하세요.'),

        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ActionChip(
              avatar: const Icon(Icons.wb_sunny_outlined),
              label: const Text('1교시 피하기'),
              onPressed: quickFirstPeriod,
            ),
            ActionChip(
              avatar: const Icon(Icons.restaurant_outlined),
              label: const Text('점심시간 비우기'),
              onPressed: quickLunch,
            ),
          ],
        ),

        const SizedBox(height: 14),

        SwitchListTile(
          title: const Text('연강 피하기'),
          subtitle: const Text('가능하다면 수업 사이에 쉬는 시간을 확보합니다.'),
          value: widget.avoidConsecutive,
          onChanged: widget.onConsecutiveChanged,
          contentPadding: EdgeInsets.zero,
        ),

        const SizedBox(height: 12),

        OutlinedButton.icon(
          onPressed: () {
            setState(() {
              widget.freeDays.clear();
              widget.avoidSlots.clear();
              widget.blockedSlots.clear();
              widget.onConsecutiveChanged(false);
            });
          },
          icon: const Icon(Icons.restart_alt),
          label: const Text('시간표 선호도 초기화'),
        ),

        const SizedBox(height: 12),

        const Text(
          '희망 공강 요일과 기피 시간은 가능한 범위에서 반영됩니다. '
          '수강 불가 시간은 반드시 지켜야 하는 조건으로 처리됩니다. '
          '1교시는 현재 10:00~11:00 기준의 임시 설정입니다.',
          style: TextStyle(fontSize: 12, color: Colors.black54),
        ),
      ],
    );
  }
}
