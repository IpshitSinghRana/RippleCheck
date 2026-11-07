const database = require('./database');

function getUser() {
    console.log("Fetching user");
    return database.getData();
}

module.exports = { getUser };
