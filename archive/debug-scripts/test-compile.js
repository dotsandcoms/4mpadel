const fs = require('fs');
const path = require('path');
const file = fs.readFileSync(path.join(__dirname, 'src/pages/KitKatLeague.jsx'), 'utf8');
try {
  // basic syntax check
  new Function(file);
  console.log("Syntax is valid");
} catch (e) {
  // jsx will throw syntax error, so we need babel or just trust eslint
  console.log("Syntax error might be jsx:", e.message);
}
