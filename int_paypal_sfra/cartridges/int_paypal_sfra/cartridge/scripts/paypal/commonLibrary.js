'use strict';

/* global empty */

var Transaction = require('dw/system/Transaction');

var commonLibrary = {};

/**
 * Converts map to object
 *
 * @param {dw.util.Map} map map to transform
 * @returns {Object} filtered
 */
commonLibrary.mapToObject = function (map) {
    if (empty(map)) {
        throw new Error('Cannot convert non map object or its sub class instance');
    }

    var data = {};
    var keys = map.keySet();

    for (var i = 0, lenght = keys.size(); i < lenght; i++) {
        var key = keys[i];
        data[key] = map.get(key);
    }

    return data;
};

/**
 * Returns Object with first, second, last names from a simple string person name
 *
 * @param {string} name Person Name
 * @returns {Object} person name Object
 */
commonLibrary.createPersonNameObject = function (name) {
    var newName = name || '';
    var names = newName.trim().replace(/\s\s+/g, ' ').split(' ');
    var firstName = names[0];
    var secondName = null;
    var lastName = null;

    if (names.length === 3) {
        secondName = names[1];
        lastName = names[2];
    } else if (names.length === 2) {
        lastName = names[1];
    } else {
        firstName = newName;
    }

    return {
        firstName: firstName,
        secondName: secondName,
        lastName: lastName
    };
};

/**
 * Returns null if value length is too long
 *
 * @param {string} param parameter value
 * @param {number} size max length of parameter
 * @returns {dw.util.HashMap} parameter value or null
 */
commonLibrary.validateParameterLength = function (param, size) { // TODO I don't like this function. As minimum create up other name
    var result = null;

    if (empty(param) || param === 'null') {
        return result;
    }

    result = param.length <= size ? param : null;

    return result;
};

/**
 * Returns truncated description
 *
 * @param {string} description description
 * @param {number} size truncate size
 * @returns {string} truncated description
 */
commonLibrary.truncatePreferenceString = function (description, size) {
    var truncatedString = null;

    if (description) {
        var newDescription = description.substring(0, size);
        var separator = newDescription.lastIndexOf('.') + 1;
        if (separator > 0) {
            truncatedString = newDescription.slice(0, separator);
        } else {
            truncatedString = newDescription;
        }
    }

    return truncatedString;
};

/**
 * Removes all payment instruments from the basket
 *
 * @param {dw.order.Basket} basket Basket object
 */
commonLibrary.removeAllPaymentInstrumentsFromBasket = function (basket) {
    Transaction.wrap(function () {
        var paymentInstruments = basket.getPaymentInstruments();

        var iterator = paymentInstruments.iterator();
        var instument = null;
        while (iterator.hasNext()) {
            instument = iterator.next();
            basket.removePaymentInstrument(instument);
        }
    });
};

module.exports = commonLibrary;
