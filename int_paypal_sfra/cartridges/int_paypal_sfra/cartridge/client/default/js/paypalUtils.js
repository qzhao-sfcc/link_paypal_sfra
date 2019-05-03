'use strict';

/* global paypal $ */
/* eslint no-console: 'off' */

$(document).ready(function () {
    var isDebugMode = true;
    var paypalUtils = {};

    if (console && isDebugMode) {
        var consoleLog = console.log;
        var consoleError = console.error;
        console.log = function () {
            consoleLog.apply(console, arguments);
        };
        console.error = function () {
            consoleError.apply(console, arguments);
        };
    } else {
        console = { // eslint-disable-line no-global-assign
            log: function () {},
            error: function () {}
        };
    }

    paypalUtils.console = console;

    paypalUtils.initButton = function (params, buttonEl) {
        var config = params;
        if (isDebugMode) {
            if (typeof config.env !== 'string') {
                console.error('paypalUtils: env is mandatory parameter. The value can be "production" or "sandbox"');
                return;
            }
            if (!(config.env === 'production' || config.env === 'sandbox')) {
                console.error('paypalUtils: The value of env parameter must be "production" or "sandbox"');
                return;
            }
            if (config.bmConfigurationInvalid) {
                console.error('Invalid configuration in BM: Merchant Tools > Site Preferences > Custom Preference > Paypal_Express_Checkout > Field: ' + config.bmConfigurationInvalid);
                return;
            }
        }

        var createPaymentUrl = config.createPaymentUrl;
        delete config.createPaymentUrl;

        var createPaymentErrorHandle = config.createPaymentErrorHandle || function (error) {
            if (error === 'empty_cart') {
                window.location.reload();
            } else {
                var url = window.location.href;
                url += url.indexOf('?') > -1 ? '&' : '?';
                window.location.href = url + 'showPaypalError=true';
            }
        };
        delete config.createPaymentErrorHandle;

        // https://developer.paypal.com/docs/integration/direct/express-checkout/integration-jsv4/customize-button/
        // https://developer.paypal.com/demo/checkout/#/pattern/client
        var defaultButtonConfig = {
            locale: 'en_US',
            style: {
                layout: 'vertical',  // horizontal, vertical
                size: 'responsive', // small, medium, large, responsive
                shape: 'pill', // pill, rect
                color: 'gold' // gold, blue, silver, black
                // label: 'checkout',
                    // checkout	The PayPal Checkout button. The default button.
                    // credit	The PayPal Credit button. Initializes the credit flow. Cannot be used with any custom color option.
                    // pay		The Pay With PayPal button. Initializes the checkout flow.
                    // buynow	The Buy Now button. Initializes the checkout flow. The default Buy Now button is unbranded. To include PayPal branding, set branding: true.
                    // paypal	The generic PayPal button. Initializes the checkout flow. This button contains only the PayPal brand logo.
                // tagline: true, // false - to disable the tagline/text beneath the button
                // maxbuttons: 4, //1-4
                // fundingicons: true, // true Displays funding instrument icons. Not valid for the credit button.
                                      // false Hides funding instrument icons.
            },

            funding: {
                allowed: [paypal.FUNDING.CREDIT],
                disallowed: []
                // paypal.FUNDING.CREDIT	Allow buyers to pay with PayPal Credit.					Enabled by default for US buyers.
                // paypal.FUNDING.CARD		Allow buyers to pay with their credit or debit card 	Enabled by default for all buyers.
                // paypal.FUNDING.ELV		Allow German buyers to pay with their bank account		Enabled by default for DE buyers.
            },

            payment: function (resolve, reject) {
                console.log('paypalUtils: payment', 'payment url:', createPaymentUrl);
                $.post(createPaymentUrl, {}, function (data) {
                    console.log('paypalUtils: Getting token data response', data);
                    if (data.error) {
                        createPaymentErrorHandle(data.error);
                        console.error('paypalUtils: ' + createPaymentUrl + ' returned data with error');
                        reject(data.error);
                    }
                    if (!data.token) {
                        console.error('paypalUtils: data does not have token property');
                        reject('system_error');
                        return;
                    }
                    resolve(data.token);
                });
            },
            onAuthorize: function (data, actions) {
                console.log('paypalUtils: onAuthorize.data', data);
                return actions.redirect();
            },
            onCancel: function (data, actions) { // eslint-disable-line no-unused-vars
                console.log('paypalUtils: onCancel.data', data);
                // return actions.redirect();
            },
            onError: function (msg) {
                console.log('paypalUtils: onError.msg', msg);
            }
        };

        config = $.extend(defaultButtonConfig, config); // eslint-disable-line no-param-reassign

        console.log('paypalUtils: paypal.Button.render config', config);

        paypal.Button.render(config, buttonEl);
    };

    paypalUtils.initFraudnet = function () {
        var scriptBaseURL = 'https://www.paypalobjects.com/webstatic/r/fb/';
        var dom;
        var doc;
        var where;
        var iframe = document.createElement('iframe');
        iframe.src = 'about:blank';
        iframe.title = '';
        iframe.role = 'presentation'; // a11y
        (iframe.frameElement || iframe).style.cssText = 'width: 0; height: 0; border: 0';
        where = document.getElementsByTagName('script');
        where = where[where.length - 1];
        where.parentNode.insertBefore(iframe, where);
        try {
            doc = iframe.contentWindow.document;
        } catch (e) {
            dom = document.domain;
            iframe.src = "javascript:var d=document.open();d.domain='" + dom + "';void(0);"; // eslint-disable-line  no-script-url
            doc = iframe.contentWindow.document;
        }
        doc.open()._l = function () {
            var js = this.createElement('script');
            if (dom) {
                this.domain = dom;
            }
            js.id = 'js-iframe-async';
            js.src = scriptBaseURL + 'fb-all-prod.pp.min.js';
            this.body.appendChild(js);
        };
        doc.write('<body onload="document._l();">');
        doc.close();
    };

    window.paypalUtils = paypalUtils;
});
