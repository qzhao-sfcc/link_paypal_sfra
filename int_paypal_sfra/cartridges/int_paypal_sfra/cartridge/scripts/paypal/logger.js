'use strict';

var paypalLogger = {};
var system = require('dw/system');

/**
 * Get logger instance
 *
 * @param {string} categoryName Category name
 * @returns {dw.system.Log} Logger instance
 */
paypalLogger.getLogger = function (categoryName) {
    var fileName = 'PayPal';
    var name = categoryName;

    if (categoryName) {
        name = 'PayPal_' + categoryName;
    }
    name = categoryName || 'PayPal_General';

    if (categoryName === 'Notification') {
        fileName = 'PayPal_Notifications';
    }

    return system.Logger.getLogger(fileName, name);
};

module.exports = paypalLogger;
