const path = require('path');
const uplevel = require('../lib/uplevel');
const DB_DIR = path.join(__dirname, '/user-db');
const db = new uplevel(DB_DIR); // TODO: probably should using absolute path here.

/*
  Make a users, table with following fields
  first_name | last_name | birthdate | is_bot | created_at | fav_num
*/
async function createUsersTable() {
  const tableCreated = await db.hasTable('users');
  if (tableCreated) {
    return;
  }
  
  const { types } = db;
  const users = await db.createTable('users');
  const nameOpts = {
    type: types.string,
    max: 100,
    required: true
  };

  await users.addField({
    name: 'first_name',
    ...nameOpts
  });
  await users.addField({
    name: 'last_name',
    ...nameOpts
  });

  // date related fileds
  await users.addField({ name: 'birth_date', type: types.date, min: new Date('January 1 2004'), required: true });
  await users.addField({ name: 'created_at', type: types.date, default: Date.now });

  await users.addField({ name: 'is_bot', type: types.boolean, default: false });
  await users.addField({ name: 'fav_num', type: types.number, required: true });
}

async function addUser(user) {
  await db.addRow('users', user);
}

async function getUsers() {
  const users = await db.getRows('users');
  return users;
}

// TODO: Use it somewhere!
async function filterUserBy(field, value) {
  const users = await getUsers();
  return users.filter(user => user[field] === value);
}

(async function() {
  console.time('create-db');
  await createUsersTable(); // on average 16.27ms.
  console.timeEnd('create-db');

  console.time('add-users');
  await addUser({
    first_name: 'Test',
    last_name: 'User',
    birth_date: new Date('January 10 2007'),
    is_bot: false,
    fav_num: 1000023
  });

  await addUser({
    first_name: 'Bot',
    last_name: 'User',
    birth_date: new Date('December 18 2018'),
    is_bot: true,
    fav_num: 10
  });
  console.timeEnd('add-users');

  console.time('get-users');
  const users = await getUsers();
  console.log(users);
  console.timeEnd('get-users');
})();
