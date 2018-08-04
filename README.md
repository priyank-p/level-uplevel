# level-uplevel - Uplevel 2

Uplevel provides, organized way to store data like sql databases, while
using no-sql fast key-value based database [LevelDB](https://github.com/Level/level).
It uses tables, fields and rows like a sql type db but stored in
key value pairs in db. It hold all its internal date in a key
called `__InternalProps` and every table you add is in its own key in db.

Uplevel consists of tables, fields, and rows, the tables
are the way you can classify data. You can add fields to data
that defines the structure of a table, and rows hold the actual data.
uplevel is fully async, and depends of `async/await`.

## Usage:
```javascript
const Uplevel = require('level-uplevel');
const path = require('path');

const DB_PATH = path.join(__dirname, 'my-db');
const db = new uplevel(DB_PATH);

// to handle error thrown by leveldb internally
// if it can't open db
// This is because level either passes error in a callback
// sent in which is impossible to implement along side with uplevel.
// and if no callback is passed then it throws in a promise internally
// which could be caught this way.
// For more context look at the level constructor https://github.com/Level/level#const-db--levellocation-options-callback
process.on('unhandledRejection', (error, promise) => {
  /* Your Code */
});
```

## API

All the methods, return a promise execept an chosen few as indicated,
which make a use of `InternalProps` that is sync between each call, which
acts like a cache store. We also have started to add minimal support for migrations
and will add more migration methods.

#### `isReady` property

Weather, uplevel is ready to be used! When you call a method
when uplevel is not ready i will queue that task. This property
is to be used to know if `hasTable` or `hasRow` can be used.

#### `levelDBErrors` property

This property hold all the `level.errors` of the `level` module used internally.

#### `types` propery

This is an object that hold all the possible types, that could be used
for the fields, possible types: (`string`, `boolean`, `date`, `number`, `array`, `string`)

#### `waitUntilReady -> Promise`

This method returns a promise that you should `await` which
gets resolved once uplevel is ready.

#### `createTable(tableName) -> Promise(UplevelTableInstance)`
  - `tableName` (`string`):  the name of table to create

A table once added can have fields, and rows. If table is already added
this will throw an `Error: Table already added!`. Field in table describe the
markup of the table, while rows hold the data as desribed per fields.

#### `addField(tableName, field) -> Promise`
  - `tableName` (`string`): The table to store this
  field into.
  - `field` (`object`):
    * `name` (`String`, required): the name of the field.
    * `type` (Uplevel.types, required): any one of the type form `types` property.
    * `min` (`Number`, `Date`): The minimum value of field.
    * `max` (`Number`, `Date`): The maximun value of field.
    * `required` (`boolean`): weather the field is required!
    * `default` (any): the default value, this can be a function.
    * `isNullable`: weather the field could be null.
    a note that all the rows have internally generated unique id field.

The `min` and `max` property works diffrently for diffrent types.
For `Array`, `String` the `min` and `max` are their length.

#### `hasTable(tableName) -> Promise(Boolean)`
  - `tableName` - the name of the table to check

  Return a `Boolean` weather the table is added or not.
  Note: Do check `isReady` before using this method.

#### `hasRow(tableNAme, id) -> Promise(Boolean)`
  - `tableName` - the name of the table to check
  - `id` - Row id to check wheather it exists or not.

  Note: Do check `isReady` before using this method.

#### `addRow(tableName, fields) -> Promise(id)`
  - `tableName` (`String`) - the table where to add this row.
  - `fields` (`Object`): the key should be the name of the field,
    and the value shoudl be the value of field.

  This will add data to the table, and return the `id` of the added field.

#### `deleteField(tableName, fieldName) -> Promise(void)`
  - `tableName` (`String`) - the table name.
  - `fieldName` (`String`): the name of the field to delete.

  This method delete the field from the row! Not this does not delete
  the field from added rows.

#### `renameField(tableName, oldField, newField) -> Promise(void)`
  - `tableName` (`String`) - the table name.
  - `oldField` (`String`): the name of the field to rename.
  - `newField` (`String`): the new name of the field.

  This method renames the field in the rows.

#### `getRows(tableName) -> Promise(Array)`
  - `tableName` (`String`) - the name of the table

Return all the data stored in a table. This method return array:
```javascript
[
  { id: 0, ...fields },
  { id: 1, ...fields }
]
```

#### `deleteRow(tableName, id) -> Promise`
  - `tableName` (`String`): the name of table.
  - `id` (`Number`): The id of the to delete.

  The ids are auto generated, and return by `getAllRows` method.

#### `deleteTable(tableName) -> Promise(rows)`
  - `tableName` (`String`): the name of table.

  Delete a table from db, and return rows.

#### `updateRow(tableName, id, fields) -> Promise(rows)`
  - `tableName` (`String`): the name of table.
  - `id` (`Number`): the id of the row to update.
  - `fields` (`Object`): the fiels to update.

  Allows you to update a row in a table, and return the
  rows of the table.

#### `getTableInstance(tableName) -> Promise(UplevelTableInstance)`
  - `tableName` (`String`): the name of the table.

  Return the `UplevelTableInstance` for easier manipulation of table.

## `UplevelTableInstance`

This a convience class, that holds all the methods you can
do with a table. This instance is returned when you create a
table using `Uplevel.createTable` method or by `getTableInstance`. This make it so you don't need
to pass the `tableName` parameter again and again.

### Migrations

#### `migrations.addField(field, populate) -> Promise(void)`
  - `field` (`Object`): field property that is passed in `addField` method.
  - `populate` (`Function`): This function is called with argument of row and
    you can change it and return the row to make sure validation passes.

  This function only adds field if the validation passes.

#### `addField(field) -> Promise`
#### `hasField(fieldName) -> Promise(Boolean)`
#### `deleteField(fieldName) -> Promise(void)`
#### `renameField(oldField, newField) -> Promise(void)`
#### `addRow(row) -> Promise(id)`
#### `getRows() -> Promise(rows)`
#### `hasRow(id) -> Promise(Boolean)`
#### `updateRow(id, row) -> Promise`
#### `deleteRow(id) -> Promise(rows)`

Documentation of each method is documented above.
