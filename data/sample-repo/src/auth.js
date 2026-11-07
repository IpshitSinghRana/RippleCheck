const utils = require('./utils');

function login() {
    console.log("User login");
    utils.logActivity("Login successful");
}

module.exports = { login };
