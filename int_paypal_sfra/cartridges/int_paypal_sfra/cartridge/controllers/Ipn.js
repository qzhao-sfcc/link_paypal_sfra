'use strict';

var server = require('server');
var ipn = require('~/cartridge/scripts/paypal/ipn');

server.post('Listener', server.middleware.https, ipn.listen);

module.exports = server.exports();
