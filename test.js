const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const Uplevel = require('./uplevel');

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

function generateRandomName() {
  const name = 'test-';
  return name + Math.random();
}

const db = new Uplevel(testDBPath);
const { levelDB } = db;
async function assertSameInternalProps(tableName) {
  const InternalProps = await db.getInternalProps();
  const DBInternalProps = await levelDB.get(db.InternalPropsKey);
  assert.deepEqual(InternalProps.tables[tableName], DBInternalProps.tables[tableName]);
}

(async function test_create_table() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);

  assert.deepStrictEqual(table.tableName, tableName);
  assert.deepStrictEqual(table.uplevel, db);
  assert.deepStrictEqual(db.InternalProps.tables[tableName], { ids: [] });
  await assertSameInternalProps(tableName);
  await assertThrows(async () => {
    await db.createTable(tableName);
  }, /^Error: Table already added!$/);
})();

(async function test_delete_and_has_table() {
  const tableName = generateRandomName();
  await db.createTable(tableName);
  assert.deepStrictEqual(await db.hasTable(tableName), true);

  await db.deleteTable(tableName);
  await assertSameInternalProps(tableName);
  await assertThrows(async () => {
    await db.deleteTable(tableName);
  }, /^Error: Cannot delete table not added to db.$/);

  assert.deepStrictEqual(db.InternalProps.tables[tableName], undefined);
  assert.deepStrictEqual(await db.hasTable(tableName), false);
})();

(async function test_add_field() {
  const tableName = generateRandomName();
  const table = db.createTable(tableName);
  
  const errors = [
    [ 'NotYetAddedTable', {}, /^Error: Cannot add field to table .*, that's not added to db.$/ ],
    [ tableName, {}, /^Error: The name of the field is required.$/ ],
    [ tableName, { name: 'ids' }, /^Error: ids field is used for internal purpose.$/ ],
    [ tableName, { name: 'Test' }, /^Error: The type of the field is required.$/ ],
    [ tableName, { name: 'Test', type: 'IncorrectType' }, /^Error: The type IncorrectType is not a valid type!$/ ],
  ];
  
  for (const [tableName, field, error] of errors) {
    await assertThrows(async () => {
      await db.addField(tableName, field);
    }, error);
  }
})();
