'use strict';

/* global dw request session customer */

var server = require('server');

var URLUtils = require('dw/web/URLUtils');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');

var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

server.use('StartCheckoutFromCart', server.middleware.https, function (req, res, next) {
    var isAjax = request.httpParameterMap.isAjax.booleanValue;
    var result = require('~/cartridge/scripts/paypal/controllerBase').startCheckoutFromCart();

    if (isAjax) {
        res.json(result);
    } else {
        if (result.paypalErrorMessage) {
            session.custom.paypalErrorMessage = result.paypalErrorMessage;
        }
        res.redirect(result.redirectUrl);
    }
    next();
});

server.get('ReturnFromPaypal', server.middleware.https, function (req, res, next) {
    var isFromCart = request.httpParameterMap.isFromCart.booleanValue;
    var result = require('~/cartridge/scripts/paypal/controllerBase').returnFromPaypal(isFromCart);

    if (result.paypalErrorMessage) {
        session.custom.paypalErrorMessage = result.paypalErrorMessage;
    }

    var basket = BasketMgr.getCurrentBasket();
    Transaction.wrap(function () {
        if (!customer.authenticated) {
            basket.setCustomerEmail(basket.custom.paypalAlreadyHandledEmail);
        }
    });

    res.redirect(result.redirectUrl);
    next();
});

server.get('StartBillingAgreementCheckout', server.middleware.https, function (req, res, next) {
    var result = require('~/cartridge/scripts/paypal/controllerBase').startBillingAgreementCheckout();

    if (result.paypalErrorMessage) {
        session.custom.paypalErrorMessage = result.paypalErrorMessage;
    }

    res.redirect(result.redirectUrl);
    next();
});

server.post('HandleDefaultShippinAddress', csrfProtection.validateAjaxRequest, function (req, res, next) {
    var formErrors = require('*/cartridge/scripts/formErrors');
    var addressForm = server.forms.getForm('address');
    var addressFormObj = addressForm.toObject();

    if (addressForm.valid) {
        res.setViewData(addressFormObj);
        this.on('route:BeforeComplete', function () {
            var formInfo = res.getViewData();
            Transaction.wrap(function () {
                var basket = BasketMgr.getCurrentBasket();
                var shippingAddress = basket.defaultShipment.createShippingAddress();

                shippingAddress.setFirstName(formInfo.firstName || '');
                shippingAddress.setLastName(formInfo.lastName || '');
                shippingAddress.setAddress1(formInfo.address1 || '');
                shippingAddress.setAddress2(formInfo.address2 || '');
                shippingAddress.setCity(formInfo.city || '');
                shippingAddress.setPostalCode(formInfo.postalCode || '');

                if (formInfo.states && formInfo.states.stateCode) {
                    shippingAddress.setStateCode(formInfo.states.stateCode);
                }

                if (formInfo.country) {
                    shippingAddress.setCountryCode(formInfo.country);
                }

                shippingAddress.setPhone(formInfo.phone || '');
                res.json({
                    success: true,
                    redirectUrl: URLUtils.url('Paypal-StartBillingAgreementCheckout').toString()
                });
            });
        });
    } else {
        res.json({
            success: false,
            fields: formErrors(addressForm)
        });
    }
    next();
});

module.exports = server.exports();
