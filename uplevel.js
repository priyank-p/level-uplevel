const level = require('level');

class Uplevel {
  /*
    Create a db, form the path passed in
    then read the internal props for db.

    InternalProps will be like a DB tracker,
    which will make use to fast key, value paring
    of LevelDB with the organization of DB Tables, Fields
    and Rows.

    InternalProps are the main components. So it needs to
    be tested really carefully!
  */
  constructor(filePath) {
    let db;

    // if an error occures this
    // will throw
    db = level(filePath, {
      valueEncoding: 'json'
    });

    this.levelDBErrors = level.errors;

    this.db = db;
    this.isReady = false;
    this.readyPromise = db.get('__InternalProps')
      .then(/* istanbul ignore next */(props) => {
        // make json date object be a date object.
        props = this.convertDateJSON(props);
        this.InternalProps = props;
        this.isReady = true;
      })
      .catch(err => {
        this.handleLevelError(err);
        this.InternalProps = {
          tables: {}
        };

        this.isReady = true;
      });
  }

  // This is really important since, we rely on the
  // InterProps, for the whole module to work correctly.
  // currently all the important properties call this method
  // and it tested via sinon's spy.
  async waitUntilReady() {
    await this.readyPromise;
  }

  // likewise waitUntilReady we also want to check for this
  // method being called by using spies or something like that
  // This method is also as important as waitUntilReady since if the
  // properties are not upto date between script up/down or when a program is killed
  // and/or restarted, the whole DB will be broken! For this method we also want
  // to check if the this.InternalProps == DB's __InternalProps!
  // Not to say addTable, addRows, and addField are not that important
  // tho they can be easily and will be tested.
  syncInternalProps() {
    const { InternalProps, db } = this;
    return db.put('__InternalProps', InternalProps)
      .catch(err => {
        throw err;
      });
  }

  // convert date json objects to real
  // date object's.
  convertDateJSON(props) {
    for (let prop in props) {
      if (typeof props[prop] === 'object') {
        props[prop] = this.convertDateJSON(props[prop]);
      }

      if (typeof props[prop] === 'string') {
        const parsedDate = Date.parse(props[prop]);
        if (!isNaN(parsedDate)) {
          props[prop] = new Date(parsedDate);
        }
      }
    }

    return props;
  }

  // All the tables will be stored in InternalProps.tables
  // to when a new table is added it's an object with ids set
  // to an empty array, other fields will be added
  async createTable(name) {
    await this.waitUntilReady();

    const { InternalProps } = this;
    InternalProps.tables[name] = { ids: [] };
    await this.syncInternalProps();
  }


  /*
    The field id is already present and is uniques by default.
    Its not possible to pass in id field.

    Note: The object field is a convienent filed, can be used for
    some already computed stuff, and for internal use only.
  */
  async addField(tableName, fieldName, opts) {
    await this.waitUntilReady();

    const { InternalProps } = this;
    if (!this.hasTable(tableName)) {
      const msg = `Table ${tableName} needs to added before adding fields to it!`;
      throw Error(msg);
    }

    const table = InternalProps.tables[tableName];
    if (table[fieldName] !== undefined) {
      throw Error('Field already added!');
    }

    opts.type = opts.type.name;
    table[fieldName] = opts;
    await this.syncInternalProps();
  }

  hasTable(tableName) {
    const { InternalProps } = this;
    return InternalProps.tables[tableName] !== undefined;
  }

  handleLevelError(err) {
    if (err.name !== 'NotFoundError') {
      throw err;
    }
  }

  async getCurrentTable(tableName) {
    await this.readyPromise;

    const { db, handleLevelError } = this;
    return new Promise(resolve => {
      db.get(tableName)
        .then(tables => {
          tables = this.convertDateJSON(tables);
          resolve(tables);
        })
        .catch(err => {
          handleLevelError(err);
          resolve([]);
        });
    });
  }

  async saveTable(tableName, table) {
    await this.readyPromise;
    await this.db.put(tableName, table)
      .catch(this.handleLevelError);
  }

  // The table hold all fields and an object
  // while the table itself is a object!
  // eg:
  //    [
  //      { id: 1, field: value }
  //      { id: 2, date: DateObject }
  //    ]
  async addRow(tableName, fields = {}) {
    const { InternalProps } = this;
    const tableOpts = InternalProps.tables[tableName];
    await this.waitUntilReady();


    if (!this.hasTable(tableName)) {
      throw Error('Cannot add fields to a table that is not added!');
    }

    const table = await this.getCurrentTable(tableName);
    for (let field in tableOpts) {
      if (field === 'ids') {
        continue;
      }

      const requirements = tableOpts[field];
      const fieldToAdd = fields[field];
      const isUndefined = fieldToAdd === undefined;
      if (requirements.required && isUndefined)
        throw Error(`The ${field} is required!`);

      if (requirements.default && isUndefined)
        fields[field] = requirements.default;

      if (requirements.type === 'Date' && requirements.timestamp) {
        if (fieldToAdd) {
          throw Error(`The field ${field} is set to timestamp, but a value was passed in!`);
        }

        fields[field] = new Date();
      }

      const isStringField = requirements.type === 'String';
      const thingToCheck = isStringField ? fieldToAdd.length : fieldToAdd;
      const minMaxErrors = {
        min: `${field} is less than it's min value ${requirements.min}.`,
        max: `${field} is greater than it's max value ${requirements.max}.`
      };

      if (isStringField) {
        minMaxErrors.min = `${field}'s is less than its required min length ${requirements.min}.`;
        minMaxErrors.max = `${field}'s is greather its than required max length ${requirements.max}.`;
      }

      if (requirements.min && thingToCheck < requirements.min)
        throw Error(minMaxErrors.min);

      if (requirements.max && thingToCheck > requirements.max)
       throw Error(minMaxErrors.max);

      if (requirements.unique) {
        let isUnique = true;
        table.forEach(row => {
          if (row[field] === fieldToAdd) {
            isUnique = false;
          }
        });

        if (!isUnique) {
          throw Error(`${field} is set to unique, this new value is not unique.`);
        }
      }
    }

    if (fields.id !== undefined) {
      throw Error('Cannot pass custom id, it is auto generated!');
    }

    const newId = tableOpts.ids.length;
    tableOpts.ids.push(newId);
    delete fields['id'];
    fields['id'] = newId;

    // add the filed to table
    table.push(fields);

    await this.syncInternalProps();
    await this.saveTable(tableName, table);
  }

  async getAllRows(tableName) {
    await this.readyPromise;

    let rows = [];
    await this.db.get(tableName)
      .then(data => {
        rows = this.convertDateJSON(data);
      })
      .catch(this.handleLevelError);
    return rows;
  }

  hasRow(tableName, id) {
    const { InternalProps } = this;
    const tableIds = InternalProps.tables[tableName].ids;
    return tableIds.includes(id);
  }

  async deleteRow(tableName, id) {
    await this.readyPromise;

    const { InternalProps } = this;
    const table = await this.getCurrentTable(tableName);
    let rowIndex = null;
    table.filter((row, index) => {
      if (row.id === id) {
        rowIndex = index;
      }
    });

    if (rowIndex === null) {
      throw Error('Cannot delete a row that not added yet!');
    }

    const internalTableIds = InternalProps.tables[tableName].ids;
    internalTableIds.splice(internalTableIds.indexOf(id), 1);
    await this.syncInternalProps();

    table.splice(rowIndex, 1);
    await this.saveTable(tableName, table);
  }
}

module.exports = Uplevel;
