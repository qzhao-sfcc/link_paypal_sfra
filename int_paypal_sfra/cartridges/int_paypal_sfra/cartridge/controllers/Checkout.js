'use strict';

var page = module.superModule;
var server = require('server');

server.extend(page);

server.append('Begin', function (req, res, next) {
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        next();
        return;
    }

    var paypalForm = server.forms.getForm('billing').paypal;

    var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');
    var paypalPaymentInstrument = paypalHelper.getPaypalPaymentInstrument(currentBasket);
    var prefs = paypalHelper.getPrefs();
    var isUsedBillingAgreement = paypalPaymentInstrument && paypalPaymentInstrument.custom.paypalBillingAgreement === true;
    var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(currentBasket.getCurrencyCode());
    var customerBillingAgreementEmail = null;
    var summaryEmail = null;
    if (customerBillingAgreement.hasAnyBillingAgreement) {
        customerBillingAgreementEmail = paypalHelper.getCustomerBillingAgreement(currentBasket.getCurrencyCode()).getDefault().email;
    }
    if (isUsedBillingAgreement) {
        summaryEmail = customerBillingAgreementEmail;
    } else if (currentBasket.custom.paypalAlreadyHandledEmail) {
        summaryEmail = customerBillingAgreementEmail;
    }

    var buttonConfig = prefs.PP_Billing_Button_Config;
    buttonConfig.env = prefs.environmentType;

    res.setViewData({
        paypal: {
            prefs: prefs,
            buttonConfig: buttonConfig,
            form: paypalForm,
            currency: currentBasket.getCurrencyCode(),
            isCustomerHasAnyBillingAgreement: customerBillingAgreement.hasAnyBillingAgreement,
            customerBillingAgreementEmail: customerBillingAgreementEmail,
            isUsedBillingAgreement: isUsedBillingAgreement,
            alreadyHandledToken: currentBasket.custom.paypalAlreadyHandledToken,
            alreadyHandledEmail: currentBasket.custom.paypalAlreadyHandledEmail,
            isNeedHideContinueButton: !(currentBasket.custom.paypalAlreadyHandledToken || (customerBillingAgreement.hasAnyBillingAgreement && paypalForm.useCustomerBillingAgreement.checked)),
            summaryEmail: summaryEmail
        }
    });
    next();
});

module.exports = server.exports();
