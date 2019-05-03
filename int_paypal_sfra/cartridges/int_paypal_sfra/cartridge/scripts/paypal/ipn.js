'use strict';

/* global dw response request empty */

var util = require('dw/util');
var HookMgr = require('dw/system/HookMgr');
var svc = require('dw/svc');

var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');
var commonLibrary = require('~/cartridge/scripts/paypal/commonLibrary');
var paypalLogger = require('~/cartridge/scripts/paypal/logger');

var prefs = paypalHelper.getPrefs();
var logger = paypalLogger.getLogger('IPN');
var notificationLogger = paypalLogger.getLogger('Notification');

var ipn = {};

/**
 * Sends the received message from PayPal for validation and parse response
 * @param {Object} request DW Request
 * @returns {dw.util.HashMap} notification
 */
function handleNotification(request) {
    var notificationParameterMap = request.httpParameterMap;
    var notification = null;

    try {
        notification = ipn.parseNotification(notificationParameterMap);
    } catch (error) {
        logger.error(error);
        return { error: true };
    }

    if (prefs.PP_LogIpnNotifications) {
        ipn.logNotification(notification);
    }

    var isIpnAuthentic = ipn.isAuthentic(notification);

    if (!isIpnAuthentic) {
        logger.error('Cannot verify incoming IPN notification. Sign: ' + notification.verify_sign);
        return { error: true };
    }

    return notification;
}

/**
 * IPN should finish with the empty response.
 * Function render template to send 200 Response to PayPal IPN, empty body
 */
function sendResponse() {
    response.writer.print('');
}

/**
 * Listen for a message from PayPal
 * @returns {Object} makes call to paypal
 */
ipn.listen = function () {
    var notification = handleNotification(request);

    if (notification.error) {
        return sendResponse();
    }

    HookMgr.callHook('app.payment.processor.paypal.ipn', 'handle', notification);
    return sendResponse();
};

/**
 * parseNotification() parse PayPal IPN message
 *
 * @param {util.Map} parameters http parameters from IPN message
 * @returns {dw.util.HashMap} parsed IPN message
 */
ipn.parseNotification = function (parameters) {
    var notification = new util.HashMap();

    var keys;
    if (parameters instanceof dw.web.HttpParameterMap) {
        keys = parameters.getParameterNames().toArray();
    } else if (parameters instanceof dw.util.HashMap) {
        keys = parameters.keySet().toArray();
    } else {
        keys = Object.keys(parameters);
    }
    keys.forEach(function (property) {
        notification.put(property, parameters.get(property).getValue());
    });

    return notification;
};

/**
 * isAuthentic() checks the notification is valid
 *
 * @param {dw.util.HashMap} notification notification
 * @returns {boolean} is authentic
 */
ipn.isAuthentic = function (notification) {
    var isAuthentic = true;
    var service;

    var credentialEnding = '.' + request.httpParameterMap.credentialEnding.stringValue;
    if (credentialEnding === '.null' || credentialEnding === '.') {
        credentialEnding = '';
    }
    try {
        service = svc.ServiceRegistry.get(prefs.nvpServiceName + credentialEnding);
        service.call(notification, null, true);
    } catch (error) {
        logger.error(error);
    }

    var notificationValidationResult = service.getResponse();

    if (notificationValidationResult === 'INVALID' || notificationValidationResult !== 'VERIFIED') {
        isAuthentic = false;
    }

    return isAuthentic;
};

/**
 * logNotification() logs notification
 *
 * @param {dw.util.HashMap} notification - Notification data
 * @returns {boolean} log result
 */
ipn.logNotification = function (notification) {
    if (empty(notification)) {
        logger.warn('Cannot log empty notification');
        return false;
    }

    var notificationJsonString = null;

    try {
        notificationJsonString = JSON.stringify(commonLibrary.mapToObject(notification));
    } catch (error) {
        logger.error(error);
    }

    notificationLogger.error(notificationJsonString);

    return true;
};

module.exports = ipn;
