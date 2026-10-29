const fs = require('fs');
const path = require('path');
const { importSections } = require('./timetable');
const file = path.join(__dirname, 'sections.json');
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(importSections(rows));
