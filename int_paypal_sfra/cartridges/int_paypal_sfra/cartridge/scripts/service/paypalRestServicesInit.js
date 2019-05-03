'use strict';

/* global dw */

var Transaction = require('dw/system/Transaction');

var prefs = require('*/cartridge/config/paypalPreferences');

var getServiceConfig = function (site) { // eslint-disable-line no-unused-vars
    return {
        /**
         * @param {dw.svc.HTTPService} service - Service, which will be used for the call
         * @param {string} methodType - Method type (DELETE, GET, PATCH, POST, PUT, REDIRECT)
         * @param {string} path - Resource/Endpoint
         * @param {Object} data - Request data
         * @param {string} contentType - Content type
         * @param {Object} paypalApi - API calls helper
         * @param {boolean} isUpadateBearToken - Is need Bear Token updating
         * @returns {string} String for request
         */
        createRequest: function (service, methodType, path, data, contentType, paypalApi, isUpadateBearToken) {
            var credential = service.getConfiguration().getCredential();
            if (!(credential instanceof dw.svc.ServiceCredential)) {
                throw new Error('Credential for "' + service.getConfiguration().getID() + '" is not set. Create and set cridential BM > Administration > Operations > Services');
            }

            var url = credential.getURL();
            if (!url.match(/.+\/$/)) {
                url += '/';
            }

            url += prefs.restApiVersion + '/' + path;
            service.setURL(url);

            if (contentType === 'undefined') { // It's strange behaviour of DW and createRequest
                contentType = null; // eslint-disable-line no-param-reassign
            }
            contentType = contentType || 'application/json'; // eslint-disable-line no-param-reassign

            service.setRequestMethod(methodType);
            service.addHeader('Content-Type', contentType);

            var token = credential.custom.PP_RESTAPI_TempToken;
            var tokenExpiredTime = credential.custom.PP_RESTAPI_TempTokenExpiredTime;
            if (path !== 'oauth2/token') {
                if (isUpadateBearToken === true || !token || tokenExpiredTime < (Date.now() + 10000)) {
                    var tokenResponseData = paypalApi.oauth2.getToken();
                    Transaction.wrap(function () {
                        credential.custom.PP_RESTAPI_TempToken = tokenResponseData.access_token;
                        credential.custom.PP_RESTAPI_TempTokenExpiredTime = Date.now() + (parseInt(tokenResponseData.expires_in, 10) * 1000);
                    });
                    token = credential.custom.PP_RESTAPI_TempToken;
                }
                service.addHeader('Authorization', 'Bearer ' + token);
            }

            if (contentType === 'application/x-www-form-urlencoded') {
                Object.keys(data).forEach(function (fieldName) {
                    service.addParam(fieldName, data[fieldName]);
                });
            }
            if (contentType === 'application/json') {
                return JSON.stringify(data);
            }
            return '';
        },

        parseResponse: function (service, httpClient) {
            return JSON.parse(httpClient.getText());
        },

        getRequestLogMessage: function (request) {
            return request;
        },

        getResponseLogMessage: function (response) {
            return response.text;
        }
    };
};

var allSites = dw.system.Site.getAllSites();
Object.keys(allSites).forEach(function (siteId) {
    var site = allSites.get(siteId);
    var serviceName = prefs.initialRestServiceName + '.' + site.getID();
    if (dw.svc.ServiceRegistry.getDefinition(serviceName) instanceof dw.svc.HTTPServiceDefinition) {
        dw.svc.ServiceRegistry.configure(serviceName, getServiceConfig(site));
    }
});
