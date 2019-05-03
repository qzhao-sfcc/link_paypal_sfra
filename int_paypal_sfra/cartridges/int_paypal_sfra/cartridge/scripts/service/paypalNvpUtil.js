'use strict';

/* global empty */

var util = require('dw/util');

var NvpProcessor = {};

/**
 * prepareValueForNvp() private module function returns ready for NVP element
 *
 * @param {string} value - Value
 * @returns {string} NVP ready value
 */
function prepareValueForNvp(value) {
    return encodeURIComponent(value).replace(/\'/g, '%27'); // eslint-disable-line no-useless-escape
}

/**
 * createNvpPairsFromObject() private module function returns ready for NVP element
 *
 * @param {Object} dataObject - Object for NVP
 * @returns {dw.util.HashMap} NVP ready pairs
 */
function createNvpPairsFromObject(dataObject) {
    var data = dataObject;
    if (empty(data) || typeof data !== 'object') {
        throw new Error('Cannot create NVP string from non-object');
    }

    var keys = data.keySet().toArray();
    var nvpPairs = new util.HashMap();

    keys.forEach(function (key) {
        nvpPairs.put(key, prepareValueForNvp(data[key]));
    });

    return nvpPairs;
}

/**
 * NVP object constructor
 *
 * @constructor
 * @param {Object} dataObject object to create NVP from
 */
function NVP(dataObject) {
    this.__nvpPairs = new util.HashMap();

    // Create NVP string optionally if data object was passed
    if (!empty(dataObject) && typeof dataObject === 'object') {
        this.__nvpPairs = createNvpPairsFromObject(dataObject);
    }

    /**
     * NVP.toString() overloaded to generate NVP string from Object/util.HashMap
     *
     * @returns {string} NVP string
     */
    this.toString = function () {
        var nvpEntrySet = this.__nvpPairs.entrySet();
        var nvpParts = [];

        for (var i = 0, len = nvpEntrySet.length; i < len; i++) {
            var value = nvpEntrySet[i].getValue();

            // It is no need to put nulls in to NVP string
            if (!empty(value) && value !== 'null') {
                nvpParts.push(nvpEntrySet[i].getKey() + '=' + value);
            }
        }

        return nvpParts.join('&');
    };
}

/**
 * NVP.add() public method adds new pair to NVP pairs
 *
 * @param {string} name (key) for NVP entry
 * @param {string} value for NVP entry
 */
NVP.prototype.add = function (name, value) {
    if (empty(name) || typeof name !== 'string') {
        throw new Error('NVP name cannot be non-string object');
    }

    if (name.indexOf('=') !== '-1') {
        throw new Error('NVP name cannot contains equal sign (=)');
    }

    if (empty(value) || typeof value !== 'string') {
        throw new Error('NVP value cannot be non-string object');
    }

    this.__nvpPairs.put(name, prepareValueForNvp(value));
};

/**
 * NVP.merge() public method adds a bunch of parameters to existing NVP object
 *
 * @param {dw.util.HashMap} mapToMerge - Map to merge with
 * @returns {NVP} instance itself
 */
NVP.prototype.merge = function (mapToMerge) {
    if (empty(mapToMerge)) {
        throw new Error('Cannot merge with not a HashMap object');
    }

    this.__nvpPairs.putAll(mapToMerge);
    // Return instance itself for suitable method calls chaining
    return this;
};

/**
 * NVP.remove() public method removes name-value pair from NVP pairs
 *
 * @param {string} name (key) for removal
 */
NVP.prototype.remove = function (name) {
    this.__nvpPairs.remove(name);
};

/**
 * parseNvpValueEntry() private module function returns value from NVP entry
 *
 * @param {string} value - Value
 * @returns {string} decoded NVP value
 */
function parseNvpValueEntry(value) {
    return decodeURIComponent(value);
}

/**
 * NvpProcessor.createNvp() method. NVP object factory
 *
 * @param {Object} dataObject - Object to create NVP from
 * @returns {NVP} NVP object itself
 */
NvpProcessor.createNvp = function (dataObject) {
    return new NVP(dataObject);
};

/**
 * NvpProcessor.parse() method. NVP object factory
 *
 * @param {string} nvpString String to create NVP from
 * @param {boolean} namesToLowerCase - Optional parameter. If true all keys will generated in lower case
 * @returns {NVP} NVP object itself
 */
NvpProcessor.parse = function (nvpString, namesToLowerCase) {
    if (empty(nvpString) && typeof nvpString !== 'string') {
        throw new Error('Cannot parse non-string NVP object');
    }

    var nvpParts = nvpString.split('&');
    var nvpMap = new util.HashMap();

    nvpParts.forEach(function (nvpEntry) {
        var entryParts = nvpEntry.split('=');
        var name = entryParts[0];

        if (namesToLowerCase) {
            name = name.toLowerCase();
        }

        var value = parseNvpValueEntry(entryParts[1]);

        nvpMap.put(name, value);
    });

    return nvpMap;
};

module.exports = {
    NvpProcessor: NvpProcessor,
    NVP: NVP
};
