
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  extractPdfText,
  analyzeSyllabus,
} = require("./syllabusAnalyzer");

async function main() {
  const filepath = path.join(
    __dirname,
    "syllabi",
    "planner_novelfr.pdf"
  );

  const buffer = fs.readFileSync(filepath);
  const text = await extractPdfText(buffer);

  const analysis = await analyzeSyllabus(text);

  console.log(JSON.stringify(analysis, null, 2));

  fs.writeFileSync(
    path.join(__dirname, "test-result.json"),
    JSON.stringify(analysis, null, 2),
    "utf8"
  );
}

main().catch(console.error);
