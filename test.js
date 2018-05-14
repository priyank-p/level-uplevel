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

const db = new uplevel(testDBPath);
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

async function test_createTable() {
  await db.createTable('TestAddTable');
  await checkSameInternalProps();

  // at this point the readyPromise shoudl
  // resolve
  assert.deepStrictEqual(db.isReady, true, 'DB is not ready yet!');

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

  await db.createTable(tableName);
  await db.addField(tableName, 'nameField', nameField);
  await db.addField(tableName, 'optionalField', optionalField);

  // both methods should have been called 3 more times
  // one for createTable call
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

  await assertThrows(async () => {
    await db.deleteRow(tableName, 45);
  }, /^Error: Cannot delete a row that not added yet!$/);


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

async function test_addRow_min_and_max() {
  const tableName = 'TestMinMax';
  const minFieldName = 'TestMinField';
  const maxFieldName = 'TestMaxField';
  const stringFieldName = 'TestMinMaxStringField';

  await db.createTable(tableName);
  await db.addField(tableName, minFieldName, { type: Number, min: 2 });
  await db.addField(tableName, maxFieldName, { type: Date, max: new Date('January 20 2018') });
  await db.addField(tableName, stringFieldName, { type: String, min: 2, max: 5 });

  await assertThrows(async () => {
    await db.addRow(tableName, {
      [minFieldName]: 1
    });
  }, /^Error: TestMinField is less than it's min value 2.$/);

  await assertThrows(async () => {
    await db.addRow(tableName, {
      [maxFieldName]: new Date('January 28 2018')
    });
  }, /^Error: TestMaxField is greater than it's max value/);

  await assertThrows(async () => {
    await db.addRow(tableName, {
      [stringFieldName]: 'A'
    });
  }, /^Error: TestMinMaxStringField's is less than its required min length 2.$/);

  await assertThrows(async () => {
    await db.addRow(tableName, {
      [stringFieldName]: 'ABCDEFHJJS'
    });
  }, /^Error: TestMinMaxStringField's is greather its than required max length 5.$/);

  await db.addRow(tableName, {
    [minFieldName]: 3,
    [maxFieldName]: new Date('January 10 2018'),
    [stringFieldName]: 'ABCD'
  });
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

  const newDB = new uplevel(testDBPath);
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

async function test_addRow_unique_fields() {
  const tableName = 'TestUniqueFields';
  const fieldName = 'UniqueField';

  await db.createTable(tableName);
  await db.addField(tableName, fieldName, { type: Number, unique: true });

  await db.addRow(tableName, { [fieldName]: 1 });
  await assertThrows(async () => {
    await db.addRow(tableName, { [fieldName]: 1 });
  }, /^Error: UniqueField is set to unique, this new value is not unique.$/);

  await db.addRow(tableName, { [fieldName]: 2 });
}

async function test_date_timestamp_option() {
  const tableName = 'TestTimestampOption';
  const fieldName = 'DateTimestamp';

  await db.createTable(tableName);
  await db.addField(tableName, fieldName, { type: Date, timestamp: true });

  await assertThrows(async () => {
    await db.addRow(tableName, { [fieldName]: new Date() });
  }, /^Error: The field DateTimestamp is set to timestamp, but a value was passed in!$/);

  await db.addRow(tableName);
}

async function test_hasRow() {
  const tableName = 'TestHasRow';
  const fieldName = 'Test';

  await db.createTable(tableName);
  await db.addField(tableName, fieldName, { type: Number });
  await db.addRow(tableName, { [fieldName]: 0 });
  await db.addRow(tableName, { [fieldName]: 1 });

  await db.deleteRow(tableName, 0);
  assert.deepStrictEqual(db.hasRow(tableName, 0), false);
  assert.deepStrictEqual(db.hasRow(tableName, 1), true);
}

async function test_deleteTable() {
  const tableName = 'TestDeleteRow';

  await db.createTable(tableName);
  await db.deleteTable(tableName);

  assert.deepStrictEqual(db.hasTable(tableName), false);
}

(async function async_test_all() {
    await test_createTable();
    await test_addField_function();
    await test_addField_error_when_no_table_added();
    await test_getCurrentTable();
    await test_addRow();
    await test_deleteRow();
    await test_addRow_min_and_max();
    await test_addRow_unique_fields();
    await test_date_timestamp_option();
    await test_hasRow();
    await test_deleteTable();

    // This must be tested at last!
    await test_errors();
})();
