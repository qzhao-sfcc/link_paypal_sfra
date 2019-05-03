'use strict';

/* global dw empty */

var paypalLogger = require('~/cartridge/scripts/paypal/logger');
var prefs = require('~/cartridge/config/paypalPreferences');
var svc = require('dw/svc');
var util = require('dw/util');

var paypalApi = {};

/**
 * Parses response and remove unnecessary information
 *
 * @param {dw.util.HashMap} data response data
 * @returns {Array} filtered response message
 */
function parseResponseForMessages(data) {
    var messages = [];

    for (var i = 0, len = data.size(); i < len; i++) {
        var message = null;
        var errorcodeIndex = 'l_errorcode' + i;
        var shortMessageIndex = 'l_shortmessage' + i;
        var longMessageIndex = 'l_longmessage' + i;

        if (data.containsKey(errorcodeIndex)) {
            message = 'Error Code: ' + data.get(errorcodeIndex) + '; Short Message: ' + data.get(shortMessageIndex) + '; Long Message: ' + data.get(longMessageIndex);
            messages.push(message);
        }
    }

    return messages;
}

/**
 * Executes http request
 *
 * @param {dw.svc.Service} service service from business manager with configuration
 * @param {Object} requestDataContainer request data
 * @param {dw.system.Log} logger logger for operation
 * @returns {Object} call response
 */
paypalApi.call = function (service, requestDataContainer, logger) {
    if (service == null) {
        throw new Error('Service is undefined. paypalApi.call(service = null)');
    }

    var serviceLogger = logger;

    if (empty(logger)) {
        serviceLogger = paypalLogger.getLogger();
    }

    var result = service.setThrowOnError().call(requestDataContainer, serviceLogger);

    if (!result.isOk()) {
        serviceLogger.error(result.getMsg());
    }

    return service.getResponse();
};

/**
 * Make API call with given requestDataContainer
 *
 * @param {Object} requestDataContainer API call request data
 * @returns {Object} Object with API call response data
*/
paypalApi.runOperation = function (requestDataContainer) {
    var method = requestDataContainer.method;
    var logger = paypalLogger.getLogger(method);
    var responseData = null;
    var service = null;

    try {
        var serviceName = prefs.nvpServiceName + '.' + requestDataContainer.currencyCode;
        if (!(dw.svc.ServiceRegistry.getDefinition(serviceName) instanceof dw.svc.HTTPServiceDefinition)) {
            serviceName = prefs.nvpServiceName;
        }
        service = svc.ServiceRegistry.get(serviceName);
        responseData = paypalApi.call(service, requestDataContainer, logger);
    } catch (error) {
        logger.error(error);
        return null;
    }

    return responseData;
};

/**
 * Handle API call result

 * @param {Object} responseData API call response data
 * @param {Object} requestContainer API call request data
 * @returns {Object} Object error data or empty object in case of success
*/
paypalApi.handleResult = function (responseData, requestContainer) {
    var method = requestContainer.method;
    var logger = paypalLogger.getLogger(method);

    try {
        var ack = responseData.ack;

        if (!empty(ack) && (ack === 'Failure' || ack === 'FailureWithWarning')) {
            var messages = parseResponseForMessages(responseData);

            messages.forEach(function (message) {
                logger.error(message);
            });

            return { error: true };
        }
    } catch (error) {
        logger.error(error);
        return { error: true };
    }

    return {};
};

/**
 * Call PayPal API method
 *
 * @param {string} methodName API method name
 * @param {Object} methodData API method data
 * @returns {Object} with success or error or/and request/response data
 */
paypalApi.callMethod = function (methodName, methodData) {
    var data = new util.HashMap();

    var keys;
    if (methodData instanceof dw.web.HttpParameterMap) {
        keys = methodData.getParameterNames().toArray();
    } else if (methodData instanceof dw.util.HashMap) {
        keys = methodData.keySet().toArray();
    } else {
        keys = Object.keys(methodData);
    }
    keys.forEach(function (property) {
        if (property !== 'methodName' && !empty(methodData[property])) {
            data.put(property.toUpperCase(), methodData[property].toString());
        }
    });

    var requestContainer = {
        method: methodName,
        data: data
    };

    for (var paramName in requestContainer.data) { // eslint-disable-line no-restricted-syntax
        if (paramName.match(/CURRENCYCODE$/i)) {
            requestContainer.currencyCode = requestContainer.data[paramName].toUpperCase();
            break;
        }
    }

    var responseData = paypalApi.runOperation(requestContainer);

    if (responseData === null) {
        return {
            error: true
        };
    }

    var handleResult = paypalApi.handleResult(responseData, requestContainer);

    if (handleResult.error) {
        return {
            error: true,
            requestContainer: requestContainer,
            responseData: responseData
        };
    }

    return {
        requestContainer: requestContainer,
        responseData: responseData
    };
};

/**
 * Function to initiates an Express Checkout transaction
 * https://developer.paypal.com/docs/classic/api/merchant/SetExpressCheckout_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with SetExpressCheckout API call data or error object
 */
paypalApi.setExpressCheckout = function (data) {
    return paypalApi.callMethod('SetExpressCheckout', data);
};

/**
 * Function to fetch information about an Express Checkout transaction
 * https://developer.paypal.com/docs/classic/api/merchant/GetExpressCheckoutDetails_API_Operation_NVP/
 *
 * @param {string} token - A timestamped token, the value of which was returned by SetExpressCheckout response
 * @param {string} currencyCode - Currency Code field
 * @returns {Object} Object with GetExpressCheckoutDetails API call data or error object
 */
paypalApi.getExpressCheckoutDetails = function (token, currencyCode) {
    return paypalApi.callMethod('GetExpressCheckoutDetails', {
        TOKEN: token,
        CURRENCYCODE: currencyCode
    });
};

/**
 * Function to complete an Express Checkout transaction
 * https://developer.paypal.com/docs/classic/api/merchant/DoExpressCheckoutPayment_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with DoExpressCheckoutPayment API call data or error object
 */
paypalApi.doExpressCheckoutPayment = function (data) {
    return paypalApi.callMethod('DoExpressCheckoutPayment', data);
};

/**
 * Function to fetch information about a specific transaction
 * https://developer.paypal.com/docs/classic/api/merchant/GetTransactionDetails_API_Operation_NVP/
 *
 * @param {string} transactionId - Transaction ID field
 * @param {string} currencyCode - Currency Code field
 * @returns {Object} Object with GetTransactionDetails API call data or error object
 */
paypalApi.getTransactionDetails = function (transactionId, currencyCode) {
    return paypalApi.callMethod('GetTransactionDetails', {
        TRANSACTIONID: transactionId,
        CURRENCYCODE: currencyCode
    });
};

/**
 * Function to authorize a payment
 * https://developer.paypal.com/docs/classic/api/merchant/DoAuthorization_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with DoAuthorization API call data or error object
 */
paypalApi.doAuthorization = function (data) {
    return paypalApi.callMethod('DoAuthorization', data);
};

/**
 * Function to updates or delete a billing agreement
 * https://developer.paypal.com/docs/classic/api/merchant/BAUpdate_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with BillAgreementUpdate API call data or error object
 */
paypalApi.baUpdate = function (data) {
    return paypalApi.callMethod('BillAgreementUpdate', data);
};

/**
 * Function to issues a refund to the PayPal account holder associated with a transaction
 * https://developer.paypal.com/docs/classic/api/merchant/RefundTransaction_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with RefundTransaction API call data or error object
 */
paypalApi.refundTransaction = function (data) {
    return paypalApi.callMethod('RefundTransaction', data);
};

/**
 * Function to searches transaction history for transactions that meet the specified criteria
 * https://developer.paypal.com/docs/classic/api/merchant/TransactionSearch_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with TransactionSearch API call data or error object
 */
paypalApi.transactionSearch = function (data) {
    return paypalApi.callMethod('TransactionSearch', data);
};

/**
 * Function to reauthorizes an existing authorization transaction
 * https://developer.paypal.com/docs/classic/api/merchant/DoReauthorization_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with DoReauthorization API call data or error object
 */
paypalApi.doReauthorization = function (data) {
    return paypalApi.callMethod('DoReauthorization', data);
};

/**
 * Function to processes a payment from a buyer's account, which is identified by a previous transaction
 * https://developer.paypal.com/docs/classic/api/merchant/DoReferenceTransaction_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with DoReferenceTransaction API call data or error object
 */
paypalApi.doReferenceTransaction = function (data) {
    return paypalApi.callMethod('DoReferenceTransaction', data);
};

/**
 * Function to capture an authorized payment
 * https://developer.paypal.com/docs/classic/api/merchant/DoCapture_API_Operation_NVP/
 *
 * @param {Object} data Object with Request Fields
 * @returns {Object} Object with DoCapture API call data or error object
 */
paypalApi.doCapture = function (data) {
    return paypalApi.callMethod('DoCapture', data);
};

/**
 * Function to void an order or an authorization.
 * https://developer.paypal.com/docs/classic/api/merchant/DoVoid_API_Operation_NVP/
 *
 * @param {string} authorizationID - Authorization ID field
 * @param {string} note - Note field
 * @param {string} currencyCode - Currency Code field
 * @returns {Object} Object with DoVoid API call data or error object
 */
paypalApi.doVoid = function (authorizationID, note, currencyCode) {
    return paypalApi.callMethod('DoVoid', {
        AUTHORIZATIONID: authorizationID,
        NOTE: note,
        CURRENCYCODE: currencyCode
    });
};

module.exports = paypalApi;
