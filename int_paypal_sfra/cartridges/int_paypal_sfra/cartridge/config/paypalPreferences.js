'use strict';

/* global dw */

var system = require('dw/system');
var svc = require('dw/svc');

/**
 * getPreferences() function. Returns PayPal custom and hardcoded preferences
 *
 * @returns {Object} custom and hardcoded preferences
 */
function getPreferences() {
    var prefs = {};
    var site = system.Site.getCurrent();

    // Site custom preferences:
    prefs.isMFRA = dw.web.Resource.msg('paypal.applicationId', 'preferences', 'SiteGenesis') === 'MFRA';
    prefs.PP_API_ExpressPaymentAction = site.getCustomPreferenceValue('PP_API_ExpressPaymentAction').getValue();
    prefs.PP_API_NoShipping = site.getCustomPreferenceValue('PP_API_NoShipping').getValue();
    prefs.PP_API_ReqConfirmShipping = site.getCustomPreferenceValue('PP_API_ReqConfirmShipping');
    prefs.PP_API_RequestBillingAddressFromPayPal = site.getCustomPreferenceValue('PP_API_RequestBillingAddressFromPayPal');
    prefs.PP_API_ShippingAddressOverride = site.getCustomPreferenceValue('PP_API_ShippingAddressOverride');
    prefs.PP_API_LogoImageUrl = site.getCustomPreferenceValue('PP_API_LogoImageUrl');
    prefs.PP_API_BrandName = site.getCustomPreferenceValue('PP_API_BrandName');
    prefs.PP_API_ExpressCheckoutSolutionType = site.getCustomPreferenceValue('PP_API_ExpressCheckoutSolutionType').getValue();
    prefs.PP_API_ExpressCheckoutLandingPage = site.getCustomPreferenceValue('PP_API_ExpressCheckoutLandingPage').getValue();
    prefs.PP_API_BillingAgreementType = site.getCustomPreferenceValue('PP_API_BillingAgreementType').getValue();
    prefs.PP_API_BillingAgreementDescription = site.getCustomPreferenceValue('PP_API_BillingAgreementDescription');
    prefs.PP_API_BillingAgreementPaymentType = site.getCustomPreferenceValue('PP_API_BillingAgreementPaymentType').getValue();
    prefs.PP_API_ReferenceTransactionPaymentAction = site.getCustomPreferenceValue('PP_API_ReferenceTransactionPaymentAction').getValue();
    prefs.PP_BillingAgreementState = site.getCustomPreferenceValue('PP_BillingAgreementState').getValue();
    prefs.PP_AuthorizationInCaseOfOrder = site.getCustomPreferenceValue('PP_AuthorizationInCaseOfOrder');
    prefs.PP_LogIpnNotifications = site.getCustomPreferenceValue('PP_LogIpnNotifications');
    prefs.PP_MultipleCapture = site.getCustomPreferenceValue('PP_MultipleCapture');

    function getPaypalButtonConfigObject(source) { // eslint-disable-line require-jsdoc
        return new Function('var paypal = {FUNDING:{BANCONTACT:"bancontact",CARD:"card",CREDIT:"credit",ELV:"elv",EPS:"eps",GIROPAY:"giropay",IDEAL:"ideal",MYBANK:"mybank",PAYPAL:"paypal",VENMO:"venmo"},CARD:{AMEX:"amex",CBNATIONALE:"cbnationale",CETELEM:"cetelem",COFIDIS:"cofidis",COFINOGA:"cofinoga",CUP:"cup",DISCOVER:"discover",ELO:"elo",HIPER:"hiper",JCB:"jcb",MAESTRO:"maestro",MASTERCARD:"mastercard",SWITCH:"switch",VISA:"visa"}}; return ' + source)(); // eslint-disable-line no-new-func
    }

    try {
        prefs.PP_Cart_Button_Config = site.getCustomPreferenceValue('PP_Cart_Button_Config');
        prefs.PP_Cart_Button_Config = getPaypalButtonConfigObject(prefs.PP_Cart_Button_Config);
    } catch (error) {
        prefs.PP_Cart_Button_Config = {
            bmConfigurationInvalid: 'Cart Button Configuration'
        };
    }

    if (prefs.PP_Cart_Button_Config === null) {
        prefs.PP_Cart_Button_Config = {};
    }

    try {
        prefs.PP_Billing_Button_Config = site.getCustomPreferenceValue('PP_Billing_Button_Config');
        prefs.PP_Billing_Button_Config = getPaypalButtonConfigObject(prefs.PP_Billing_Button_Config);
    } catch (error) {
        prefs.PP_Billing_Button_Config = {
            bmConfigurationInvalid: 'Billing Button Configuration'
        };
    }

    if (prefs.PP_Billing_Button_Config === null) {
        prefs.PP_Billing_Button_Config = {};
    }

    prefs.PP_ShowExpressCheckoutButtonOnCart = site.getCustomPreferenceValue('PP_ShowExpressCheckoutButtonOnCart');

    prefs.PP_ShowCreditFinancialBanners = site.getCustomPreferenceValue('PP_ShowCreditFinancialBanners');
    prefs.PP_CreditFinancialOptionsPassword = site.getCustomPreferenceValue('PP_CreditFinancialOptionsPassword');

    prefs.PP_API_VERSION = '121.0';
    prefs.PP_API_ButtonSource = prefs.isMFRA ? 'Demandware_EC_v4' : 'Demandware_EC_SG_v4';

    prefs.cartPageEndpoint = dw.web.Resource.msg('paypal.cartPageEndpoint', 'preferences', 'Cart-Show');
    prefs.checkoutBillingPageEndpoint = dw.web.Resource.msg('paypal.checkoutBillingPageEndpoint', 'preferences', 'COBilling-Start');
    prefs.summaryPageEndpoint = dw.web.Resource.msg('paypal.summaryPageEndpoint', 'preferences', 'COSummary-Start');

    prefs.initialRestServiceName = 'int_paypal.http.rest.payment.PayPal';
    prefs.restApiVersion = 'v1';

    prefs.initialNvpServiceName = 'int_paypal.http.nvp.payment.PayPal';
    prefs.nvpServiceName = prefs.initialNvpServiceName + '.' + site.getID();

    var nvpService = null;

    try {
        nvpService = svc.ServiceRegistry.get(prefs.nvpServiceName);
    } catch (error) {
        system.Logger.error('Service "' + prefs.nvpServiceName + '" is not configured. Need to create the service in BM > Administration > Operations > Services');
        return prefs;
    }

    var isUseSandboxUrls = !nvpService.getConfiguration().getCredential().custom.PP_API_IsProduction;
    prefs.environmentType = isUseSandboxUrls ? 'sandbox' : 'production';
    prefs.paypalEndpoint = isUseSandboxUrls ? 'https://www.sandbox.paypal.com/cgi-bin/webscr' : 'https://www.paypal.com/cgi-bin/webscr';

    return prefs;
}

module.exports = getPreferences();
