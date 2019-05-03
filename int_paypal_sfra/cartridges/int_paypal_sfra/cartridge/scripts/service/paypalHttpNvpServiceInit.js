'use strict';

/* global dw empty */

var NvpUtil = require('~/cartridge/scripts/service/paypalNvpUtil');
var prefs = require('~/cartridge/config/paypalPreferences');
var customResponseParsers = require('~/cartridge/scripts/service/paypalResponseParsers');
var NvpProcessor = NvpUtil.NvpProcessor;

var getServiceConfig = function (site) {
    /**
     * checkRequestDataContainer() function. Checks requestDataContainer object {method: String, data: Object}
     * @param {Object} requestDataContainer object.
     * @config {string} [method] API Method to run
     * @config {Object} [data] Data object
     * @returns {boolean} is requestDataContainer valid or not
     */
    function checkRequestDataContainer(requestDataContainer) {
        var result = (!empty(requestDataContainer)
                    && !empty(requestDataContainer.method)
                    && !empty(requestDataContainer.data)
                    && typeof requestDataContainer.method === 'string'
                    && typeof requestDataContainer.data === 'object');

        return result;
    }

    /**
     * prepareLogData() prepare formatted data for writing in log file
     * @param {string} data - URI encoded string
     * @returns {string} formatted string
     */
    function prepareLogData(data) {
        if (data === null) {
            return 'Data of response or request is null';
        }
        var result = '\n';
        var params = data.split('&');

        params.forEach(function (param) {
            var paramArr = param.split('=');
            var key = paramArr[0];
            var value = paramArr[1];
            if (key === 'SIGNATURE' || key === 'CVV2' || key === 'EXPDATE' || key === 'ACCT' || key === 'PWD') {
                value = '*****';
            }
            result += decodeURIComponent(key + '=' + value) + '\n';
        });

        return result;
    }

    /**
     * Creates data-string for request body
     * @param {dw.svc.HTTPService} service - Service, which will be used for the call
     * @param {Object} requestDataContainer - Request Data Container
     * @param {dw.system.Log} inpLogger - Logger
     * @returns {string} formatted string
     */
    function createPaypalRequestString(service, requestDataContainer, inpLogger) {
        var isDataContainerValid = checkRequestDataContainer(requestDataContainer);
        var msg;
        var logger = inpLogger;

        if (empty(logger)) {
            logger = require('~/cartridge/scripts/paypal/logger').getLogger(requestDataContainer.method);
        }

        // Check if requestDataContainer has valid structure
        if (!isDataContainerValid) {
            msg = 'Wrong requestDataContainer object specified for service, cannot proceed with call';
            logger.error(msg);
            throw new Error(msg);
        }

        var serviceCredential = null;

        try {
            serviceCredential = service.getConfiguration().getCredential();
        } catch (error) {
            msg = 'Cannot get Credential or Configuration object for ' + prefs.initialNvpServiceName + '.' + site.getID() + ' service. Please check configuration';
            logger.error(msg);
            throw new Error(msg);
        }

        // POST is default method
        // PayPal requires http x-www-form-urlencoded header for NVP
        service.addHeader('Content-Type', 'application/x-www-form-urlencoded');

        var headers = require('./paypalCreateRequestHeaders')(requestDataContainer.method, serviceCredential);

        if (!serviceCredential.custom.PP_API_UseCertificate) {
            headers.put('SIGNATURE', serviceCredential.custom.PP_API_Signature);
        }

        return NvpProcessor.createNvp(requestDataContainer.data).merge(headers);
    }

    /**
     * Creates data-string for IPN request body
     * @param {dw.svc.HTTPService} service - Service, which will be used for the call
     * @param {Object} requestDataContainer - Request Data Container
     * @returns {string} formatted string
     */
    function createIPNRequestString(service, requestDataContainer) {
        service.setURL(prefs.paypalEndpoint);
        service.setRequestMethod('POST');
        return NvpProcessor.createNvp(requestDataContainer);
    }
    return {
        /**
         * Parse object with request data into string line for request
         * @param {dw.svc.HTTPService} inpService - Service, which will be used for the call
         * @param {Object} requestDataContainer - Object with request data
         * @param {dw.system.Log} logger - Logger
         * @param {boolean} isIpn - Is need to create request string for IPN
         * @returns {string} string line for request
         */
        createRequest: function (inpService, requestDataContainer, logger, isIpn) {
            var service = inpService;
            var nvp;
            service.isIpn = isIpn || false;
            if (isIpn) {
                nvp = createIPNRequestString(service, requestDataContainer);
            } else {
                nvp = createPaypalRequestString(service, requestDataContainer, logger);
            }
            return nvp.toString();
        },

        parseResponse: function (service, httpClient) {
            if (service.getRequestData().indexOf('METHOD=TransactionSearch') + 1) {
                return customResponseParsers.transactionSearch(service, httpClient);
            }
            return service.isIpn ? httpClient.getText() : NvpProcessor.parse(httpClient.getText(), true);
        },

        getRequestLogMessage: function (request) {
            return prepareLogData(request);
        },

        getResponseLogMessage: function (response) {
            return prepareLogData(response.text);
        }
    };
};

var allSites = dw.system.Site.getAllSites();

// NVP service registration for all sites
Object.keys(allSites).forEach(function (siteId) {
    var site = allSites.get(siteId);
    var serviceName = prefs.initialNvpServiceName + '.' + site.getID();
    var allCurrencies = site.getAllowedCurrencies();
    if (dw.svc.ServiceRegistry.getDefinition(serviceName) instanceof dw.svc.HTTPServiceDefinition) {
        dw.svc.ServiceRegistry.configure(serviceName, getServiceConfig(site));
    }
    Object.keys(allCurrencies).forEach(function (currencyIndex) {
        var currencyCode = allCurrencies.get(currencyIndex);
        var serviceName = prefs.initialNvpServiceName + '.' + site.getID() + '.' + currencyCode; // eslint-disable-line no-shadow
        if (dw.svc.ServiceRegistry.getDefinition(serviceName) instanceof dw.svc.HTTPServiceDefinition) {
            dw.svc.ServiceRegistry.configure(serviceName, getServiceConfig(site));
        }
    });
});
