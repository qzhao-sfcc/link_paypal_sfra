'use strict';

var page = module.superModule;
var server = require('server');

server.extend(page);

server.append('Show', function (req, res, next) {
    var URLUtils = require('dw/web/URLUtils');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        next();
        return;
    }

    var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');
    var prefs = paypalHelper.getPrefs();
    var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(currentBasket.getCurrencyCode());

    var isAddressExistForBillingAgreementCheckout = !!customerBillingAgreement.getDefaultShippingAddress();

    // In this case no need shipping address
    if (currentBasket.getDefaultShipment().productLineItems.length <= 0) {
        isAddressExistForBillingAgreementCheckout = true;
    }

    var buttonConfig;
    if (customerBillingAgreement.hasAnyBillingAgreement && prefs.PP_BillingAgreementState !== 'DoNotCreate') {
        buttonConfig = prefs.PP_Cart_Button_Config;
        buttonConfig.env = prefs.environmentType;
        buttonConfig.billingAgreementFlow = {
            startBillingAgreementCheckoutUrl: URLUtils.https('Paypal-StartBillingAgreementCheckout').toString(),
            isShippingAddressExist: isAddressExistForBillingAgreementCheckout
        };
    } else {
        buttonConfig = prefs.PP_Cart_Button_Config;
        buttonConfig.env = prefs.environmentType;
        buttonConfig.createPaymentUrl = URLUtils.https('Paypal-StartCheckoutFromCart', 'isAjax', 'true').toString();
    }

    res.setViewData({
        paypal: {
            prefs: prefs,
            buttonConfig: buttonConfig
        },
        addressForm: server.forms.getForm('address'),
        paypalCalculatedCost: currentBasket.totalGrossPrice
    });
    next();
});

module.exports = server.exports();
