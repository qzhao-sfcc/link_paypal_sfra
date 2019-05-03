'use strict';

var util = require('dw/util');

var NvpUtil = require('~/cartridge/scripts/service/paypalNvpUtil');
var NvpProcessor = NvpUtil.NvpProcessor;

/**
 * Checks whether the result of TransactionSeach API call has more than 100 results and return number of TransactionSeach results
 *
 * @param {dw.util.HashMap} response - Response from TransactionSeach API call
 * @returns {number} number of TransactionSeach results
 */
function returnMaxTransactionNumber(response) {
    var maxResult = null;

    if (response.containsKey('l_transactionid99')) {
        return 99;
    }

    for (var i = 0; i <= 98; i++) {
        if (maxResult) { break; }

        if (!response.containsKey('l_transactionid' + (i + 1))) {
            return i;
        }
    }
    return 0;
}

/**
 * Removes unnecessary characters from response for better reading
 *
 * @param {number} position - Position number of the current element
 * @param {dw.util.HashMap} response - Response from TransactionSeach API call
 * @returns {util.HashMap} number of TransactionSeach results
 */
function createResponseElement(position, response) {
    var responseParams = ['l_amt', 'l_currencycode', 'l_email', 'l_feeamt', 'l_name', 'l_netamt', 'l_status', 'l_timestamp', 'l_timezone', 'l_transactionid', 'l_type'];

    var element = new util.HashMap();

    responseParams.forEach(function (param) {
        element.put(param.replace('l_', ''), response[param + position] ? response[param + position] : null);
    });

    return element;
}

// object with custom responses for API PayPal calls
var customResponseParsers = {
    /**
     * transactionSearch() custom response parser for TransactionSearch API call
     *
     * @param {dw.svc.HTTPService} service - Service, which was used for the call
     * @param {dw.net.HTTPClient} httpClient - Response from http call
     * @returns {Object} Parsed NVP response which returns to service object
     */
    transactionSearch: function (service, httpClient) {
        var response = httpClient.getText();
        var parsedResponse = NvpProcessor.parse(response, true);
        var resultNumber = returnMaxTransactionNumber(parsedResponse);
        var resultArray = [];
        var resultObj = {
            resultArray: resultArray,
            responseAck: parsedResponse.ack
        };

        for (var i = 0; i <= resultNumber; i++) {
            resultArray.push(createResponseElement(i, parsedResponse));
        }

        return resultObj;
    }
};

module.exports = customResponseParsers;
