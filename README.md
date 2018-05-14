# level-uplevel

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
const uplevel = require('level-uplevel');
const db = new uplevel('./db');

// to handle error thrown by leveldb internally
// if it can't open db
// This is because level either passes error in a callback
// sent in which is impossible to implement along side with uplevel.
// and if no callback is passed then it throws in a promise internally
// which could be caught this way.
// For more context look at the level constructor https://github.com/Level/level#const-db--levellocation-options-callback
process.on('unhandledRejection', (error, promise) => {
  /* Your Code */
})
```

## API

#### `levelDBErrors` property

This property hold all the `level.errors` of the `level` module used internally.

#### `addTable(tableName)`
  - `tableName` (`string`):  the name of table

A table once added can have fields, and rows.

#### `addField(tableName, fieldName, opts)`
  - `tableName` (`string`): The table to store this
  field into.
  - fieldName (`string`): the name of the filed, 'id' is not allowed, and names are case-sensitive.
  - `opts` (`object`):
    * `type` (`String | Date | Number | Object | Boolean`):
      the type of the field
    * `min` (`Number`, `Date`): The minimum value of field (will only work for date, and numbers).
    * `max` (`Number`, `Date`): The maximun value of field (will only work for date, and numbers).
    * `required` (`boolean`): weather the field is required!
    * `default` (any): the default value.
    * `timestamp` (`Boolean`): Make the field a timestamp, add current date.
    * `unique` (`true | false`): default is false, makes that field unique. Also
    a note that all the rows have internally generated unique id field.

#### `hasTable(tableName) -> Boolean`
  - `tableName` - the name of the table to check

  Return a `Boolean` weather the table is added or not.

#### `addRow(tableName, fields)`
  - `tableName` (`String`) - the table where to add this row.
  - `fields` (`Object`): the key should be the name of the field,
    and the value shoudl be the value of field.

  This will add data to the table.

#### `getAllRows(tableName) -> Array`
  - `tableName` (`String`) - the name of the table

Return all the data stored in a table. This method return array:
```javascript
[
  { id: 0, ...fields },
  { id: 1, ...fields }
]
```

#### `deleteRow(tableName, id)`
  - `tableName` (`String`): the name of table.
  - `id` (`Number`): The id of the to delete.

  The ids are auto generated, and return by `getAllRows` method.
