const level = require('level');

class UplevelTableInstance {
  constructor(uplevel, tableName) {
    this.uplevel = uplevel;
    this.tableName = tableName;
  }

  async addField(field) {
    await this.uplevel.addField(this.tableName, field);
    return this.addField;
  }
  
  async hasField(fieldName) {
    const res = await this.uplevel.hasField(this.tableName, fieldName);
    return res;
  }
  
  async addRow(row) {
    const newId = await this.uplevel.addRow(this.tableName, row);
    return newId;
  }
  
  async getRows() {
    const row = await this.uplevel.getRows(this.tableName);
    return row;
  }
  
  async updateRow(id, row) {
    await this.uplevel.updateRow(this.tableName, id, row);
    return this.updateRow;
  }
}

class UplevelDB {
  constructor(path) {
    const levelDB = new level(path, {
      valueEncoding: 'json'
    });

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

  async addField(tableName, field) {
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
        throw new Error(`Field has already been added!`);
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
    
    const InternalProps = await this.getInternalProps();
    const table = InternalProps.tables[tableName];
    const fieldName = field.name;
    delete field.name;
    table[fieldName] = field;
    await this.sync();
    return this.addField;
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
  
  async validateRow(tableName, row) {
    const InternalProps = await this.getInternalProps();
    const fields = InternalProps.tables[tableName];
    for (let field of Object.keys(row)) {
      if (field === 'id')
        throw new Error('id cannot be passed in, it is auto generated.');
      if (fields[field] === undefined)
        throw new Error('Cannot add a field that not added to db by .addField method');
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
      if (value && fieldDetail.type === types.string)
        row[field] = value = value.toString();
      if (value && fieldDetail.type === types.number)
        row[field] = value = Number(value);
      
      if (value && fieldDetail.type === types.date) {
        row[field] = value = new Date(value);
        fieldDetail.min = new Date(fieldDetail.min);
        fieldDetail.max = new Date(fieldDetail.max);
      }
      
      if (value === undefined || value === '' ||
          (fieldDetail.type === types.number && isNaN(value))) {
        row[field] = value = defaultValue || null;
      }

      if (fieldDetail.required &&
          fieldDetail.isNullable !== true &&
          value === null) {
            throw new Error(`${field} is required`);
          }

      let { min, max } = fieldDetail;
      const minError = 'The value is greater than it\'s maximum required value:';
      const maxError = 'The value is less than it\'s minimum required value:';
      if (fieldDetail.type === types.string || fieldDetail.type === types.array) {
        row[field] = value = value.toString();
        if (min && value.length < min)
          throw new Error(`${minError} ${min}`);
        if (max && value.length > max)
          throw new Error(`${maxError} ${max}`);

        continue;
      }

      if (fieldDetail.type === types.object) {
            continue;
          }

      if (min && value < min)
          throw new Error(`${minError} ${min}`);
      if (max && value > max)
        throw new Error(`${maxError} ${max}`);  
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
    await this.putIntoDB(tableName, updatedRow);
  }

  async getRows(tableName) {
    const tableAdded = await this.hasTable(tableName);
    if (!tableAdded) {
      throw new Error(`Table ${tableName} is not added, cannot get rows!`);
    }

    const rows = await this.getFromDB(tableName);
    return rows;
  }
}

module.exports = UplevelDB;
module.exports.UplevelTableInstance = UplevelTableInstance;
