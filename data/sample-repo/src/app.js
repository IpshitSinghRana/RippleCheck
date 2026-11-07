const auth = require('./auth');
const userService = require('./userService');

function start() {
    console.log("Application started");
    auth.login();
    userService.getUser();
}

module.exports = { start };
