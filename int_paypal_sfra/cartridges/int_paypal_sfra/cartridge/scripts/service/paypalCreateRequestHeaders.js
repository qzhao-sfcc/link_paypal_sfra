'use strict';

/* global dw empty */

var prefs = require('~/cartridge/config/paypalPreferences');

/**
 * Creates authentication and requires headers for PayPal requests
 *
 * @param {string} method - Method name
 * @param {dw.svc.ServiceCredential} credential - Service credential object
 * @returns {dw.util.HashMap} HashMap of required parameters
 */
function createRequestHeaders(method, credential) {
    var headers = new dw.util.HashMap();

    // API method is mandatory argument
    if (empty(method) || typeof method !== 'string') {
        throw new Error('Cannot set PayPal API Method');
    }

    if (empty(credential)) {
        throw new Error('Credential is not provided');
    }

    // Set API Username
    headers.put('USER', credential.getUser());

    // Set API Password
    headers.put('PWD', credential.getPassword());

    // Set API Method to run
    headers.put('METHOD', method);

    // Set API Method to run
    headers.put('VERSION', prefs.PP_API_VERSION);

    return headers;
}

module.exports = createRequestHeaders;
