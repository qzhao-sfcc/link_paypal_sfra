'use strict';

/* global dw request session customer empty */

var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');
var paypalApi = require('~/cartridge/scripts/paypal/paypalApi');
var prefs = paypalHelper.getPrefs();
var controllerBase = {};

controllerBase.startCheckoutFromCart = function () {
    var basket = BasketMgr.getCurrentBasket();

    if (!basket) {
        return {
            error: 'empty_cart',
            redirectUrl: URLUtils.https(prefs.cartPageEndpoint)
        };
    }

    paypalHelper.prepareBasketForCheckoutFromCart(basket);

    var processorResult = require('~/cartridge/scripts/paypal/processor').handle(basket, true, false);
    if (processorResult.error) {
        return {
            error: processorResult.paypalErrorMessage,
            paypalErrorMessage: processorResult.paypalErrorMessage,
            redirectUrl: URLUtils.https(prefs.cartPageEndpoint, 'showPaypalError', true)
        };
    }
    return {
        token: processorResult.paypalToken
    };
};

controllerBase.returnFromPaypal = function (isFromCart) {
    var basket = BasketMgr.getCurrentBasket();
    if (!basket) {
        return {
            redirectUrl: URLUtils.https(prefs.cartPageEndpoint)
        };
    }

    var paymentInstrument = paypalHelper.getPaypalPaymentInstrument(basket);
    var expressCheckoutToken = request.httpParameterMap.token.stringValue;
    if (!paymentInstrument || !expressCheckoutToken) {
        var result = {
            paypalErrorMessage: dw.web.Resource.msg('paypal.error.notoken', 'locale', null),
            redirectUrl: URLUtils.https(prefs.checkoutBillingPageEndpoint, 'showPaypalError', true, 'stage', 'payment').toString()
        };

        if (isFromCart) {
            result = {
                paypalErrorMessage: dw.web.Resource.msg('paypal.error.notoken', 'locale', null),
                redirectUrl: URLUtils.https(prefs.cartPageEndpoint, 'showPaypalError', true).toString()
            };
        }
        return result;
    }

    var getExpressCheckoutDetailsResult = paypalApi.getExpressCheckoutDetails(expressCheckoutToken, basket.getCurrencyCode());

    if (getExpressCheckoutDetailsResult.error) {
        var payPalErrorMessage = paypalHelper.createPaypalErrorMessage(getExpressCheckoutDetailsResult.responseData);
        var errorResult = {
            paypalErrorMessage: payPalErrorMessage,
            redirectUrl: URLUtils.https(prefs.checkoutBillingPageEndpoint, 'showPaypalError', true, 'stage', 'payment')
        };
        if (isFromCart) {
            errorResult = {
                paypalErrorMessage: payPalErrorMessage,
                redirectUrl: URLUtils.https(prefs.cartPageEndpoint, 'showPaypalError', true)
            };
        }
        return errorResult;
    }
    var responseData = getExpressCheckoutDetailsResult.responseData;

    Transaction.wrap(function () {
        if (customer.authenticated) {
            basket.setCustomerEmail(customer.getProfile().getEmail());
        } else if (isFromCart) {
            basket.setCustomerEmail(responseData.email);
        }

        paymentInstrument.custom.paypalPayerID = responseData.payerid;
        paymentInstrument.custom.paypalEmail = responseData.email;
        paymentInstrument.custom.paypalToken = responseData.token;
        paymentInstrument.getPaymentTransaction().setAmount(new dw.value.Money(responseData.amt, basket.getCurrencyCode()));

        basket.custom.paypalAlreadyHandledPayerID = responseData.payerid;
        basket.custom.paypalAlreadyHandledToken = responseData.token;
        basket.custom.paypalAlreadyHandledEmail = responseData.email;

        if (!prefs.PP_API_ShippingAddressOverride || isFromCart) {
            var shippingAddress = basket.getDefaultShipment().getShippingAddress();
            paypalHelper.updateShippingAddress(responseData, shippingAddress, 0);
        }

        if (prefs.PP_API_RequestBillingAddressFromPayPal && isFromCart) {
            var billingAddress = basket.getBillingAddress();
            paypalHelper.updateBillingAddress(responseData, billingAddress);
        }

        if (!prefs.PP_API_RequestBillingAddressFromPayPal) {
            if (!basket.getCustomer().isAuthenticated() && empty(basket.getBillingAddress().getFirstName())) {
                basket.getBillingAddress().setFirstName(dw.web.Resource.msg('paypal.checkout.guest', 'locale', null));
            }
        }
    });

    var paypalForm = session.forms.billing.paypal;

    if (paypalForm.saveBillingAgreement.checked || paypalForm.useCustomerBillingAgreement.checked || isFromCart) {
        var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(basket.getCurrencyCode());
        if (!customerBillingAgreement.getDefaultShippingAddress() || paypalForm.saveBillingAgreement.checked) {
            require('~/cartridge/scripts/paypal/accountHelpers').saveShippingAddressToAccountFromBasket(basket);
        }

        if (!isFromCart) {
            customerBillingAgreement.setUseCheckboxState(paypalForm.saveBillingAgreement.checked || paypalForm.useCustomerBillingAgreement.checked);
        }
    }
    return {
        redirectUrl: URLUtils.https(prefs.summaryPageEndpoint, 'stage', 'placeOrder')
    };
};

controllerBase.startBillingAgreementCheckout = function () {
    var basket = BasketMgr.getCurrentBasket();
    if (!basket) {
        return {
            redirectUrl: URLUtils.https(prefs.cartPageEndpoint)
        };
    }

    paypalHelper.prepareBasketForCheckoutFromCart(basket);
    var orderShippingAddress = basket.getDefaultShipment().getShippingAddress();
    var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(basket.getCurrencyCode());
    var defaultShippingAddress = customerBillingAgreement.getDefaultShippingAddress();

    if (!defaultShippingAddress && orderShippingAddress.getAddress1() === null && basket.getDefaultShipment().productLineItems.length > 0) {
        return {
            redirectUrl: URLUtils.https('Paypal-EditDefaultShippinAddress')
        };
    }

    var processorResult = require('~/cartridge/scripts/paypal/processor').handle(basket, true, true);
    if (processorResult.error) {
        return {
            redirectUrl: URLUtils.https(prefs.cartPageEndpoint)
        };
    }

    Transaction.wrap(function () {
        basket.setCustomerEmail(customer.getProfile().getEmail());

        if (orderShippingAddress.getAddress1() === null && basket.getDefaultShipment().productLineItems.length > 0) {
            orderShippingAddress.setFirstName(defaultShippingAddress.firstName);
            orderShippingAddress.setLastName(defaultShippingAddress.lastName);
            orderShippingAddress.setAddress1(defaultShippingAddress.address1);
            orderShippingAddress.setAddress2(defaultShippingAddress.address2);
            orderShippingAddress.setCity(defaultShippingAddress.city);
            orderShippingAddress.setPostalCode(defaultShippingAddress.postalCode);
            orderShippingAddress.setStateCode(defaultShippingAddress.stateCode);
            orderShippingAddress.setCountryCode(defaultShippingAddress.countryCode.value);
            orderShippingAddress.setPhone(defaultShippingAddress.phone);
        }
    });

    if (prefs.PP_API_RequestBillingAddressFromPayPal) {
        Transaction.wrap(function () {
            paypalHelper.updateBillingAddress(processorResult.actualBillingAgreementData.responseData, basket.getBillingAddress());
        });
    }

    return {
        redirectUrl: URLUtils.https(prefs.summaryPageEndpoint, 'stage', 'placeOrder')
    };
};

module.exports = controllerBase;
