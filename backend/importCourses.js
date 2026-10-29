
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  extractPdfText,
  analyzeSyllabus
} = require("./syllabusAnalyzer");

const { saveAnalysis } = require("./database");

const PDF_FOLDER = path.join(__dirname, "syllabi");

async function main() {
  if (
    !process.env.CHATKHU_API_KEY ||
    !process.env.CHATKHU_MODEL
  ) {
    throw new Error("ChatKHU 환경변수를 확인하세요.");
  }

  if (!fs.existsSync(PDF_FOLDER)) {
    throw new Error("syllabi 폴더가 없습니다.");
  }

  const files = fs.readdirSync(PDF_FOLDER)
    .filter(file => file.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    console.log("분석할 PDF 파일이 없습니다.");
    return;
  }

  console.log(`PDF ${files.length}개 발견`);

  let success = 0;
  let failed = 0;

  for (const filename of files) {
    console.log(`\n분석 중: ${filename}`);

    try {
      const filepath = path.join(PDF_FOLDER, filename);
      const buffer = fs.readFileSync(filepath);

      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error("10MB 초과 PDF");
      }

      if (
        buffer.subarray(0, 5).toString() !== "%PDF-"
      ) {
        throw new Error("유효하지 않은 PDF");
      }

      const text = await extractPdfText(buffer);
      const debugDir = path.join(__dirname, "debug");
      fs.mkdirSync(debugDir, { recursive: true });

      fs.writeFileSync(
      path.join(debugDir, filename + ".txt"),
      text,
      "utf8"
      );

      console.log("추출된 텍스트 길이:", text.length);
      console.log("텍스트 앞부분:", text.slice(0, 1500));

      const analysis = await analyzeSyllabus(text);

      // 관리자 검토를 위한 JSON 저장
      const outputPath = filepath.replace(/\.pdf$/i, ".json");
      fs.writeFileSync(
        outputPath,
        JSON.stringify(analysis, null, 2),
        "utf8"
      );

      // 초기 버전: AI 결과를 바로 데이터베이스에 저장
      const courseId = saveAnalysis(analysis);

      console.log(`저장 성공: Course ID ${courseId}`);
      success++;

    } catch (error) {
      console.error(
        `${filename} 분석 실패: ${error.message}`
      );
      failed++;
    }
  }

  console.log("\n분석 완료");
  console.log(`성공: ${success}`);
  console.log(`실패: ${failed}`);
}

main().catch(console.error);
