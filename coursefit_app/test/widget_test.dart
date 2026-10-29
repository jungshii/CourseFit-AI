
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:coursefit_app/main.dart';

void main() {
  testWidgets('CourseFit AI 앱 실행 테스트', (tester) async {
    await tester.pumpWidget(const CourseFitApp());

    expect(find.text('CourseFit AI'), findsWidgets);
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
