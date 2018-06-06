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

async function assertThrows(func, exception) {
  let error;
  await func().catch(err => { error = err; });
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

(async function test_add_and_has_field() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  await table.addField({ name: 'TEST_FIELD_1__', type: db.types.string });
  const errors = [
    [ 'NotYetAddedTable', {}, /^Error: Cannot add field to table .*, that's not added to db.$/ ],
    [ tableName, {}, /^Error: The name of the field is required.$/ ],
    [ tableName, { name: 'TEST_FIELD_1__' }, /^Error: Field has already been added!$/ ],
    [ tableName, { name: 'ids' }, /^Error: ids field is used for internal purpose.$/ ],
    [ tableName, { name: 'Test' }, /^Error: The type of the field is required.$/ ],
    [ tableName, { name: 'Test', type: 'IncorrectType' }, /^Error: The type IncorrectType is not a valid type!$/ ],
  ];
  
  for (const [tableName, field, error] of errors) {
    await assertThrows(async () => {
      await db.addField(tableName, field);
    }, error);
  }
  
  await table.addField({
    name: 'TestField',
    type: db.types.string
  });
  
  assert.deepStrictEqual(await table.hasField('TestField'), true);
  await assertSameInternalProps(tableName);
  
  await assertThrows(async () => {
    await db.hasField('__EEXIST__', 'SomeRandomField');
  }, /^Error: Table __EEXIST__ is not added, so cannot check for fields.$/);
  
  await table.addRow({ TestField: 'String' });
  await assertThrows(async () => {
    await table.addField({ name: 'sdsadas' });
  }, /^Error: Cannot add field once row have been added, it could break validation!$/);
})();

const { types } = db;
(async function test_validate_row_type_string() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);

  await table.addField({
    name: 'TestStringField',
    type: types.string,
    required: true
  });
  
  await table.addField({
    name: 'TestStringMinMax',
    type: types.string,
    required: true,
    min: 2,
    max: 4
  });
  
  await table.addField({
    name: 'TestStringDefaults',
    type: types.string,
    required: true,
    default: 1
  });
  
  await table.addRow({
    TestStringField: '<Test>',
    TestStringMinMax: '12'
  });
  
  const rows = await table.getRows();
  assert.deepEqual(rows, [{
    TestStringField: '<Test>',
    TestStringMinMax: '12',
    TestStringDefaults: '1',
    id: 0
  }]);
  
  const errors = [
    [{ TestStringMinMax: '1223333', TestStringField: '1' }, /^Error: The value is less than it's minimum required value:/],
    [{ TestStringMinMax: '1', TestStringField: '1' }, /^Error: The value is greater than it's maximum required value:/],
  ];
  
  for (const [row, error] of errors) {
    await assertThrows(async () => {
      await table.addRow(row);
    }, error);
  }
})();

(async function test_validate_row_type_date() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  let called = false;
  let defaultDate;
  function testDefault() {
    called = true;
    defaultDate = defaultDate || new Date();
    return defaultDate;
  }

  await table.addField({ name: 'DefaultField', type: types.date, default: testDefault });
  await table.addField({ name: 'TestMin', type: types.date, min: new Date('January 1 2018') });
  await table.addField({ name: 'TestMax', type: types.date, max: new Date('December 20 2019') });

  await table.addRow({
    TestMin: new Date('March 1 2018'),
    TestMax: new Date('April 2 2018')
  });

  assert.deepEqual(await table.getRows(), [
    { DefaultField: defaultDate, TestMin: new Date('March 1 2018'), TestMax: new Date('April 2 2018'), id: 0  }
  ]);
  
  await assertThrows(async () => {
    await table.updateRow(0, {
      TestMin: new Date('March 1 2017'),
      TestMax: new Date('April 2 2018')
    });
  }, /^Error: The value is greater than it's maximum required value/);
  
  await assertThrows(async () => {
    await table.updateRow(0, {
      TestMin: new Date('March 1 2018'),
      TestMax: new Date('April 2 2020')
    });
  }, /^Error: The value is less than it's minimum required value/);

  assert(called);
})();

(async function test_update_row_method() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  await table.addField({ name: 'test', type: types.string });
  await table.addRow({ test: 'test-value' });
  
  const row = await table.getRows();
  assert.deepEqual(row, [{ test: 'test-value', id: 0 }]);

  await table.updateRow(0, {
    test: 'updated-value'
  });

  assert(await table.getRows(), [{
    test: 'updated-value',
    id: 0
  }]);
  
  await assertThrows(async () => {
    await db.updateRow('SOME_NOT_ADDED_TABLE');
  }, /^Error: Table SOME_NOT_ADDED_TABLE is not added, cannot update row on table not added!$/);
})();

(async function test_validate_row() {
  let tableName = generateRandomName();
  let table = await db.createTable(tableName);
  
  await table.addField({ name: 'NumberRequired', type: types.number, required: true });
  
  const errors = [
    [{ NumberRequired: NaN  }, /^Error: NumberRequired is required$/],
    [{ NumberRequired: 1, id: 23212 }, /^Error: id cannot be passed in, it is auto generated.$/],
    [{ SomeNotAddedField: 128912 }, /^Error: Cannot add field \(SomeNotAddedField\) that not added to db by .addField method$/]
  ];
  
  for (const [row, error] of errors) {
    await assertThrows(async () => {
      await table.addRow(row);
    }, error);
  }
  
  tableName = generateRandomName();
  table = await db.createTable(tableName);
  
  await table.addField({ name: 'number', type: types.number });
  await table.addField({ name: 'object', type: types.object });
  
  await table.addRow({
    number: 123,
    object: { a: 1 }
  });
  
  assert.deepEqual(await table.getRows(), [
    { number: 123, object: { a: 1 }, id: 0 }
  ]);
})();

(async function test_hasRow_function() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  await table.addField({ name: 'test', type: types.string });
  await table.addRow({ test: 'asd' });
  
  assert.deepStrictEqual(await table.hasRow(0), true);
  assert.deepStrictEqual(await table.hasRow(1), false);
  
  await assertThrows(async () => {
    await db.hasRow('NOT_YET_ADDED', 0);
  }, /^Error: Table NOT_YET_ADDED is not added, cannot check for row!$/);
})();

(async function test_hasRow_function() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  await table.addField({ name: 'test', type: types.string });
  await table.addRow({ test: 'asd' });
  
  assert.deepEqual(await table.getRows(), [
    { test: 'asd', id: 0 }  
  ]);
  
  await table.deleteRow(0);
  assert.deepEqual(await table.getRows(), []);
  
  const errors = [
    [ tableName, 123, /^Error: Cannot delete row that is not yet added!$/ ],
    [ 'NotYetAdded', 2313, /^Error: Table NotYetAdded is not added, cannot delete row!$/ ]
  ];
  
  for (const [tableName, id, error] of errors) {
    await assertThrows(async () => {
      await db.deleteRow(tableName, id);
    }, error);
  }
})();

(async function test_adding_boolean() {
  const tableName = generateRandomName();
  const table = await db.createTable(tableName);
  
  await table.addField({ name: 'RequiredBoolean', type: types.boolean, required: true });
  await table.addField({ name: 'RequiredBooleanDefault', type: types.boolean, required: true, default: false });

  await table.addRow({ RequiredBoolean: true });
  assert.deepEqual(await table.getRows(), [
    { RequiredBoolean: true, RequiredBooleanDefault: false, id: 0 }  
  ]);
})();

process.on('unhandledRejection', (err) => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
