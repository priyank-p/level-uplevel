const uplevel = require('./level-uplevel');
const db = new uplevel('./user-db'); // TODO: probably should using absolute path here.

/*
  Make a users, table with following fields
  first_name | last_name | birthdate | is_bot | created_at | fav_num
*/
async function createUsersTable() {
  await db.createTable('users');

  const nameOpts = {
    type: String,
    min: 6,
    max: 100,
    required: true
  };

  await db.addField('users', 'first_name', nameOpts);
  await db.addField('users', 'last_name', nameOpts);

  // date related fileds
  await db.addField('users', 'birth_date', { type: Date, min: Date('January 1 2004'), required: true });
  await db.addField('users', 'created_at', { type: Date, timestamp: true });

  await db.addField('users', 'is_bot', { type: Boolean, required: true });
  await db.addField('users', 'fav_num', { type: Number, required: true });
}

async function addUser(user) {
  await db.addRow('users', user);
}

async function getUsers() {
  const users = await db.getAllRows('users');
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
