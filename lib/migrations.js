class UplevelMigration {
  constructor(tableInstance) {
    this.uplevel = tableInstance.uplevel;
    this.tableInstance = tableInstance;
  }

  async validate() {
    const { tableInstance } = this;
    const rows = await tableInstance.getRows();
    const validationPromises = [];
    rows.forEach(row => {
      validationPromises.push(this.validateRow(tableInstance.tableName, row));
    });

    const validatedRows = await Promise.all(validationPromises);
    return validatedRows;
  }

  async validateRow(tableName, row) {
    const { uplevel } = this;
    const copy = { ...row };
    delete copy.id;

    const validatedRow = await uplevel.validateRow(tableName, row);
    return validatedRow;
  }
}

module.exports = UplevelMigration;
