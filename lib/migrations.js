class UplevelMigrations {
  constructor(tableInstance) {
    this.uplevel = tableInstance.uplevel;
    this.tableInstance = tableInstance;
  }

  async addField(field, populate) {
    const { uplevel, tableInstance } = this;
    const { tableName } = tableInstance;
    await uplevel.validateField(tableName, field);
    await uplevel._addField(tableName, field);
    let rows;
    try {
      rows = await this.validate(populate);
    } catch (err) {
      const message = 'The row validation seems not to pass, ' +
                      'hence the field was not added!';
      err.message = message + '\n  ValidationError:' + err.message;
      throw err;
    }

    uplevel.putIntoDB(tableName, rows);
  }

  async validate(populate) {
    const { tableInstance } = this;
    const rows = await tableInstance.getRows();
    const validationPromises = [];
    populate = populate || function (row) { return row; };
    rows.forEach(row => {
      row = populate(row);
      validationPromises.push(this.validateRow(tableInstance.tableName, row));
    });

    const validatedRows = await Promise.all(validationPromises);
    return validatedRows;
  }

  async validateRow(tableName, row) {
    const { uplevel } = this;
    const copy = { ...row };
    delete copy.id;

    const validatedRow = await uplevel.validateRow(tableName, copy);
    validatedRow.id = row.id;
    return validatedRow;
  }
}

module.exports = UplevelMigrations;
