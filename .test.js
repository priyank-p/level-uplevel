const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Uplevel = require('./lib/uplevel');

const testDBPath = path.resolve(__dirname, 'test-db');
function rmTestDB() {
  const files = fs.readdirSync(testDBPath);
  files.forEach(file => {
    file = path.resolve(testDBPath, file);
    fs.unlinkSync(file);
  });
  fs.rmdirSync(testDBPath);
}

if (fs.existsSync(testDBPath)) {
  rmTestDB();
}

const uplevel = new Uplevel(testDBPath);
(async function () {
  const table = await uplevel.createTable('test');
  
  await table.addField({
    name: 'Test',
    type: 'string'
  });

  await table.addRow({ 'Test': 'sample' });
  await table.addRow({ 'Test': 'dasdasda' });
  await table.addRow({ 'Test': 'samsdasdasaple' });
  await table.updateRow(1, { 'Test': 'jksd', id: 2 });
  console.log(await table.getRows());
})();
