'use strict';

/* global dw */

var paypalLogger = require('~/cartridge/scripts/paypal/logger');
var logger = paypalLogger.getLogger();
var prefs = require('~/cartridge/config/paypalPreferences');

// https://developer.paypal.com/docs/api/overview/

var paypalApi = {};

/**
 * Executes request
 *
 * @param {string} methodType - Method type (DELETE, GET, PATCH, POST, PUT, REDIRECT)
 * @param {string} path - Resource/Endpoint
 * @param {Object} data - Request data
 * @param {string} contentType - Content type
 * @param {boolean} isUpadateBearToken - Is need Bear Token updating
 * @returns {Object} Response object
 */
paypalApi.call = function (methodType, path, data, contentType, isUpadateBearToken) {
    var serviceName = prefs.initialRestServiceName + '.' + dw.system.Site.getCurrent().getID();
    var service;
    var result;
    var errorMsg;
    var responseData;

    try {
        service = dw.svc.ServiceRegistry.get(serviceName);
    } catch (error) {
        errorMsg = 'Service "' + serviceName + '" is undefined. Need to create "' + serviceName + '" service in BM > Administration > Operations > Services';
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }

    try {
        result = service.setThrowOnError().call(methodType, path, data, contentType, paypalApi, isUpadateBearToken);
    } catch (error) {
        logger.error(error);
        throw new Error(error);
    }

    if (result.isOk()) {
        responseData = service.getResponse();
    } else {
        if (result.getErrorMessage() === null) {
            errorMsg = 'Likely Resource/Endpoint "' + path + '" is not supported by PayPal server';
            logger.error(errorMsg);
            throw new Error(errorMsg);
        }
        responseData = JSON.parse(result.getErrorMessage());
        if (responseData.error === 'invalid_client') {
            logger.error('Double check Client ID (User field) and Sercret (Password field) in BM > Administration >  Operations >  Services > Service Credentials > ' + service.getConfiguration().getCredential().getID());
        }
        if (responseData.error === 'invalid_token') {
            return paypalApi.call(methodType, path, data, contentType, true);
        }
    }

    return responseData;
};

paypalApi.oauth2 = {};
/**
 * Gets oauth2 token
 * https://developer.paypal.com/docs/limited-release/financing-options/api/#active-merchant-financing-options
 * @returns {Object} Response object
 */
paypalApi.oauth2.getToken = function () {
    return paypalApi.call('POST', 'oauth2/token', {
        grant_type: 'client_credentials'
    }, 'application/x-www-form-urlencoded');
};

// https://developer.paypal.com/docs/limited-release/financing-options/api/
paypalApi.credit = {};

/**
 * Gets the currently active financing options
 * https://developer.paypal.com/docs/limited-release/financing-options/api/#active-merchant-financing-options
 *
 * @param {string} countryCode - Country Code to filter the options that appear in the response
 * @returns {Object} Response object
 */
paypalApi.credit.getActiveMerchantFinancingOptions = function (countryCode) {
    var path = 'credit/active-merchant-financing-options';
    if (countryCode) {
        path += '?country_code=' + countryCode;
    }
    return paypalApi.call('GET', path);
};

/**
 * Calculates financing options available for a transaction
 * https://developer.paypal.com/docs/limited-release/financing-options/api/#calculated-financing-options_calculate
 *
 * @param {Obejct} data - Request data
 * @returns {Object} Response object
 */
paypalApi.credit.getCalculatedFinancingOptions = function (data) {
    return paypalApi.call('POST', 'credit/calculated-financing-options', data);
};

paypalApi.activities = {};
paypalApi.payments = {};
paypalApi.customer = {};
paypalApi.identity = {};
paypalApi.invoicing = {};

module.exports = paypalApi;
