const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const LevelDB = require('./index');

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

const db = new LevelDB(testDBPath);
const levelDB = db.db;

async function getFromDB(key) {
  let val;
  await levelDB.get(key)
    .then(value => { val = value; })
    .catch(err => {
      db.handleLevelError(err);
    });
  return val;
}


async function checkSameInternalProps() {
  let internalProps = await getFromDB('__InternalProps');
  internalProps = db.convertDateJSON(internalProps);
  assert.deepEqual(internalProps.tables, db.InternalProps.tables);
}

const waitUntilReadyStub = sinon.spy(db, 'waitUntilReady');
const syncInternalPropsStub = sinon.spy(db, 'syncInternalProps');

(function test_db_created() {
  const DBCreated = fs.existsSync(testDBPath);
  assert.deepStrictEqual(DBCreated, true);
})();

async function test_addTable() {
  await db.addTable('TestAddTable');
  await checkSameInternalProps();
  assert.deepStrictEqual(waitUntilReadyStub.callCount, 1);
  assert.deepStrictEqual(syncInternalPropsStub.callCount, 1);
}

async function test_addField_function() {
  const tableName = 'TestAddFieldTable';

  const nameField = {
    type: String,
    required: true
  };

  const optionalField = {
    type: Date,
    default: new Date()
  };

  await db.addTable(tableName);
  await db.addField(tableName, 'nameField', nameField);
  await db.addField(tableName, 'optionalField', optionalField);

  // both methods should have been called 3 more times
  // one for addTable call
  // one more times for each addField call
  // so 3 for this test case + 1 from before.
  await checkSameInternalProps();
  assert.deepStrictEqual(waitUntilReadyStub.callCount, 4);
  assert.deepStrictEqual(syncInternalPropsStub.callCount, 4);
}

async function test_addRow() {
  // table and field added before!
  const tableName = 'TestAddFieldTable';

  // Previously two fields were added:
  //    nameField: name String and required!
  //    optionalField: date Date and default is currentDate.
  await assertThrows(async () => {
    await db.addRow(tableName, {});
  }, /^Error: The nameField is required!$/);

  const newDate = new Date();
  await db.addRow(tableName, { nameField: 'FirstPerson' });
  await db.addRow(tableName, {
    nameField: 'SecondPerson',
    optionalField: newDate
  });

  const rows = await db.getAllRows(tableName);
  assert.deepStrictEqual(rows[0].nameField, 'FirstPerson');
  assert.deepStrictEqual(rows[0].id, 0);
  assert.deepEqual(rows[1], {
    nameField: 'SecondPerson',
    optionalField: newDate,
    id: 1
  });

  await checkSameInternalProps();
  assert.deepStrictEqual(waitUntilReadyStub.callCount, 8);
  assert.deepStrictEqual(syncInternalPropsStub.callCount, 6);
}

(function test_levelErrorHandler() {
  const { NotFoundError } = db.levelDBErrors;
  assert.doesNotThrow(() => {
    db.handleLevelError(new NotFoundError('Test'));
  });

  assert.throws(() => {
    db.handleLevelError(new Error());
  });
})();

async function test_deleteRow() {
  const tableName = 'TestAddFieldTable';

  await db.deleteRow(tableName, 0);
  const rows = await db.getAllRows(tableName);

  await checkSameInternalProps();
  assert.deepStrictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].id, 1);

  // try to delete no exsistent row
  await db.deleteRow(tableName, 45);
  const newRows = await db.getAllRows(tableName);
  assert.deepEqual(rows, newRows);
  assert.deepStrictEqual(rows.length, 1);
  assert.deepStrictEqual(rows[0].id, 1);
}

async function test_addField_error_when_no_table_added() {
  let error;
  await db.addField('EEXIST', 'WHATEVER', {})
    .catch(err => {
      error = err;
    });

  assert.throws(() => {
    if (error) {
      throw error;
    }
  });

  await checkSameInternalProps();
  assert.deepStrictEqual(waitUntilReadyStub.callCount, 5);
  assert.deepStrictEqual(syncInternalPropsStub.callCount, 4);
}

async function test_getCurrentTable() {
  const notAddedTable = await db.getCurrentTable('NotAddedYet');
  assert.deepStrictEqual(notAddedTable, []);
}

async function test_errors() {
  await assertThrows(async () => {
    await db.addRow('UNADDEDTABLE', { FILEDS: {} });
  }, /^Error: Cannot add fields to a table that is not added!$/);

  await assertThrows(async () => {
    await db.addField('TestAddFieldTable', 'nameField', {});
  }, /^Error: Field already added!$/);

  await assertThrows(async () => {
    await db.addRow('TestAddFieldTable', { nameField: 'value', id: 342 });
  }, /^Error: Cannot pass custom id, it is auto generated!$/);

  const newDB = new LevelDB(testDBPath);
  await new Promise(resolve => {
    process.on('unhandledRejection', (err) => {
      assert.throws(() => {
        throw err;
      }, /^OpenError: IO error: lock/);
      resolve();
    });
  });

  await assertThrows(async () => {
    await newDB.syncInternalProps();
  }, /^ReadError: Database is not open$/);
}

(async function async_test_all() {
    await test_addTable();
    await test_addField_function();
    await test_addField_error_when_no_table_added();
    await test_getCurrentTable();
    await test_addRow();
    await test_deleteRow();
    await test_errors();
})();
