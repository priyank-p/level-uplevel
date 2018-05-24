const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const uplevel = require('./uplevel');

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

async function assertThrows(func, exception) {
  let error;
  await func().catch(err => { error = err });
  assert.throws(() => {
    if (error)
      throw error;
  }, exception);
}
