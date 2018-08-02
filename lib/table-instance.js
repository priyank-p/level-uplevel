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

  async deleteField(fieldName) {
    const res = await this.uplevel.deleteField(this.tableName, fieldName);
    return res;
  }

  async renameField(oldField, newField) {
    const res = await this.uplevel.renameField(this.tableName, oldField, newField);
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
  
  async hasRow(id) {
    const isRowAdded = await this.uplevel.hasRow(this.tableName, id);
    return isRowAdded;
  }

  async updateRow(id, row) {
    await this.uplevel.updateRow(this.tableName, id, row);
    return this.updateRow;
  }
  
  async deleteRow(id) {
    await this.uplevel.deleteRow(this.tableName, id);
    return this.deleteRow;
  }
}

module.exports = UplevelTableInstance;

