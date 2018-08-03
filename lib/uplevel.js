const level = require('level');
const UplevelTableInstance = require('./table-instance');

class UplevelDB {
  constructor(path) {
    this.init(path);
  }

  init(path) {
    const levelDB = new level(path, {
      valueEncoding: 'json'
    });

    this.path = path;
    this.errors = level.errors;
    this.InternalProps = null;
    this.levelDB = levelDB;
    this.isReady = false;
    this.InternalPropsKey = '__InternalProps';
    this.types = {
      object: 'object',
      boolean: 'boolean',
      date: 'date',
      number: 'number',
      array: 'array',
      string: 'string'
    };

    this.readyPromise = levelDB.get(this.InternalPropsKey)
      .then(props => {
        this.InternalProps = props;
      })
      .catch(err => {
        this.handleError(err);
        this.InternalProps = { tables: {} };
        this.isReady = true;
      });
  }

  handleError(err) {
    if (err.name !== 'NotFoundError') {
      throw err;
    }
  }

  async waitUntilReady() {
    await this.readyPromise;
  }

  async sync() {
    const { InternalProps, InternalPropsKey, levelDB } = this;
    await levelDB.put(InternalPropsKey, InternalProps);
  }

  async putIntoDB(key, value) {
    const { levelDB } = this;
    await this.waitUntilReady();
    try {
      await levelDB.put(key, value);
    } catch (e) {
      this.handleError(e);
    }

    await this.sync();
  }

  normalizeDates(obj) {
    for (let prop in obj) {
      if (typeof obj[prop] === 'object') {
        obj[prop] = this.normalizeDates(obj[prop]);
      }

      if (typeof obj[prop] === 'string' && isNaN(Number(obj[prop]))) {
        const parsedDate = Date.parse(obj[prop]);
        if (!isNaN(parsedDate)) {
          obj[prop] = new Date(parsedDate);
        }
      }
    }

    return obj;
  }

  async getFromDB(key) {
    const { levelDB } = this;
    let value;
    await this.waitUntilReady();
    try {
      value = await levelDB.get(key);
    } catch (e) {
      this.handleError(e);
    }

    return this.normalizeDates(value);
  }

  async deleteFromDB(key) {
    const { levelDB } = this;
    await this.waitUntilReady();
    await levelDB.del(key);
  }

  async getInternalProps() {
    await this.waitUntilReady();
    return this.InternalProps;
  }

  async hasTable(tableName) {
    const InternalProps = await this.getInternalProps();
    return (InternalProps.tables[tableName] !== undefined);
  }

  async createTable(tableName) {
    const tableAddedAlready = await this.hasTable(tableName);
    if (tableAddedAlready) {
      throw new Error('Table already added!');
    }

    const InternalProps = await this.getInternalProps();
    InternalProps.tables[tableName] = { ids: [] };
    await this.sync();
    await this.putIntoDB(tableName, []);
    return new UplevelTableInstance(this, tableName);
  }

  async deleteTable(tableName) {
    const tableExsists = await this.hasTable(tableName);
    if (!tableExsists) {
      throw new Error('Cannot delete table not added to db.');
    }

    const InternalProps = await this.getInternalProps();
    delete InternalProps.tables[tableName];
    await this.sync();
    await this.deleteFromDB(tableName);
  }

  async validateField(tableName, field) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Cannot add field to table ${tableName}, that's not added to db.`);
    }

    // checking ids should return true, and
    // and its handled below so we just don't check for
    // it here.
    if (field.name !== 'ids') {
      const fieldAdded = await this.hasField(tableName, field.name);
      if (fieldAdded) {
        throw new Error('Field has already been added!');
      }
    }

    if (!field.name) {
      throw new Error('The name of the field is required.');
    }

    if (field.name === 'ids') {
      throw new Error('ids field is used for internal purpose.');
    }

    if (!field.type) {
      throw new Error('The type of the field is required.');
    }

    const validTypes = Object.keys(this.types);
    if (!validTypes.includes(field.type)) {
      throw new Error(`The type ${field.type} is not a valid type!`);
    }
  }

  async addField(tableName, field) {
    await this.validateField(tableName, field);
    const rows = await this.getRows(tableName);
    const rowsAdded = rows.length !== 0;
    if (rowsAdded) {
      throw new Error('Cannot add field once row have been added, it could break validation!');
    }
    
    await this._addField(tableName, field);
    return this.addField;
  }

  async _addField(tableName, field) {
    field = { ...field };

    const InternalProps = await this.getInternalProps();
    const table = InternalProps.tables[tableName];
    const fieldName = field.name;
    delete field.name;
    table[fieldName] = field;
    await this.sync();
  }

  async deleteField(tableName, fieldName) {
    if (/^ids?$/.test(fieldName)) {
      throw new Error('Cannot delete id(s) field from db.');
    }

    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, so cannot delete fields.`);
    }

    const fieldAdded = await this.hasField(tableName, fieldName);
    if (!fieldAdded) {
      throw new Error('Cannot delete field that not added yet!');
    }

    const InternalProps = await this.getInternalProps();
    const table = InternalProps.tables[tableName];
    delete table[fieldName];
    await this.sync();
  }

  async hasField(tableName, fieldName) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, so cannot check for fields.`);
    }

    const InternalProps = await this.getInternalProps();
    const table = InternalProps.tables[tableName];
    return (table[fieldName] !== undefined);
  }

  async renameField(tableName, oldField, newField) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error('Cannot rename field on table that is not added!');
    }

    const fieldAdded = await this.hasField(tableName, oldField);
    if (!fieldAdded) {
      throw new Error('Cannot rename field that is not added!');
    }

    // rename in InternalProps
    const InternalProps = await this.getInternalProps();
    const table = InternalProps.tables[tableName];
    table[newField] = table[oldField];
    delete table[oldField];
    await this.sync();

    // rename in rows
    const rows = await this.getFromDB(tableName);
    rows.forEach((row, index) => {
      if (row.hasOwnProperty(oldField)) {
        rows[index][newField] = row[oldField];
        delete rows[index][oldField];
      }
    });

    await this.putIntoDB(tableName, rows);
  } 

  async validateRow(tableName, row) {
    const InternalProps = await this.getInternalProps();
    const fields = InternalProps.tables[tableName];
    for (let field of Object.keys(row)) {
      if (field === 'id')
        throw new Error('id cannot be passed in, it is auto generated.');
      if (fields[field] === undefined)
        throw new Error(`Cannot add field (${field}) that not added to db by .addField method`);
    }

    const { types } = this;
    for (let field of Object.keys(fields)) {
      const fieldDetail = fields[field];
      let value = row[field];
      if (field === 'ids') {
        continue;
      }

      const defaultValue = typeof fieldDetail.default === 'function' ?
        fieldDetail.default() : fieldDetail.default;
      if (value === undefined || value === '' ||
          (fieldDetail.type === types.number && isNaN(value))) {
        row[field] = value = defaultValue || null;

        if (fieldDetail.type === types.boolean && typeof defaultValue === 'boolean') {
          row[field] = value = defaultValue;
        }
      }

      if (value && fieldDetail.type === types.string)
        row[field] = value = value.toString();
      if (value && fieldDetail.type === types.number)
        row[field] = value = Number(value);

      if (value && fieldDetail.type === types.date) {
        const min = new Date(fieldDetail.min);
        const max = new Date(fieldDetail.max);

        // TODO: This check should be moved to addField function instead.
        if (!isNaN(min.getTime()))
          fieldDetail.min = min;
        if (!isNaN(max.getTime()))
          fieldDetail.max = max;

        row[field] = value = new Date(value);
        if (isNaN(value.getTime())) {
          throw new Error('Invalid date was passed in for ' + field);
        }
      }

      if (fieldDetail.required &&
          fieldDetail.isNullable !== true &&
          value === null) {
        throw new Error(`${field} is required`);
      }

      let { min, max } = fieldDetail;
      const minError = 'The value is less than it\'s minimum required value:';
      const maxError = 'The value is greater than it\'s maximum required value:';
      if (value && fieldDetail.type === types.string || fieldDetail.type === types.array) {
        row[field] = value = value.toString();
        if (min && value.length < min)
          throw new Error(`${minError} ${min} for field ${field}`);
        if (max && value.length > max)
          throw new Error(`${maxError} ${max} for field ${field}`);

        continue;
      }

      if (fieldDetail.type === types.object) {
        continue;
      }

      if (min && value < min)
        throw new Error(`${minError} ${min} for field ${field}`);
      if (max && value > max)
        throw new Error(`${maxError} ${max} for field ${field}`);
    }

    return row;
  }

  async addRow(tableName, row) {
    row = await this.validateRow(tableName, row);
    const currentRow = await this.getFromDB(tableName);
    const lastRow = currentRow[currentRow.length - 1];

    row.id = lastRow ? lastRow.id + 1 : 0;
    currentRow.push(row);
    await this.putIntoDB(tableName, currentRow);
    return row.id;
  }

  async hasRow(tableName, id) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot check for row!`);
    }

    const rows = await this.getRows(tableName);
    let isRowAdded = false;
    rows.forEach(row => {
      if (row.id === id) {
        isRowAdded = true;
      }
    });

    return isRowAdded;
  }

  async updateRow(tableName, id, row) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot update row on table not added!`);
    }

    const currentRow = await this.getFromDB(tableName);
    let updatedRow = { ...currentRow[id], ...row };

    // delete row and add it back after validation
    delete updatedRow['id'];
    updatedRow = await this.validateRow(tableName, updatedRow);
    updatedRow['id'] = id;

    currentRow[id] = updatedRow;
    await this.putIntoDB(tableName, currentRow);
    return currentRow;
  }

  async deleteRow(tableName, id) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot delete row!`);
    }

    const isRowAdded = await this.hasRow(tableName, id);
    if (!isRowAdded) {
      throw new Error('Cannot delete row that is not yet added!');
    }

    const rows = await this.getRows(tableName);
    let indexToDelete;
    rows.forEach((row, index) => {
      if (row.id ==id) {
        indexToDelete = index;
      }
    });

    rows.splice(indexToDelete, 1);
    await this.putIntoDB(tableName, rows);
    return rows;
  }

  async getRows(tableName) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot get rows!`);
    }

    const rows = await this.getFromDB(tableName);
    return rows;
  }

  async getTableInstance(tableName) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot get the instance!`);
    }

    return new UplevelTableInstance(this, tableName);
  }
}

module.exports = UplevelDB;
module.exports.UplevelTableInstance = UplevelTableInstance;
