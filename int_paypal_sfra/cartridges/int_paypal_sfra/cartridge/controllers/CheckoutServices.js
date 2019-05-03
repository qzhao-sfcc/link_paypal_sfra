'use strict';

/* global dw request session customer */

var page = module.superModule;
var server = require('server');

var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

server.extend(page);

server.prepend('SubmitPayment', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
    var isPaypal = request.httpParameterMap.isPaypal.booleanValue;

    if (!isPaypal) {
        next();
        return;
    }

    var data = res.getViewData();
    if (data && data.csrfError) {
        res.json();
        this.emit('route:Complete', req, res);
        return;
    }

    var HookMgr = require('dw/system/HookMgr');
    var Resource = require('dw/web/Resource');
    var PaymentMgr = require('dw/order/PaymentMgr');
    var Transaction = require('dw/system/Transaction');
    var AccountModel = require('*/cartridge/models/account');
    var OrderModel = require('*/cartridge/models/order');
    var Locale = require('dw/util/Locale');
    var URLUtils = require('dw/web/URLUtils');
    var BasketMgr = require('dw/order/BasketMgr');
    var currentBasket = BasketMgr.getCurrentBasket();

    if (!currentBasket) {
        res.json({
            error: true,
            cartError: true,
            fieldErrors: [],
            serverErrors: [],
            redirectUrl: URLUtils.url('Cart-Show').toString()
        });
        this.emit('route:Complete', req, res);
        return;
    }

    var paypalForm = session.forms.billing.paypal;
    var billingForm = server.forms.getForm('billing');
    var isUseBillingAgreement = paypalForm.useCustomerBillingAgreement.checked;
    var viewData = {};

    var paymentMethodID = 'PayPal';
    billingForm.paymentMethod.value = paymentMethodID;
    viewData.paymentMethod = {
        value: paymentMethodID,
        htmlName: billingForm.paymentMethod.htmlName
    };

    var billingFormErrors = COHelpers.validateBillingForm(billingForm.addressFields);
    var creditCardErrors = COHelpers.validateCreditCard(billingForm);

    if (Object.keys(billingFormErrors).length || Object.keys(creditCardErrors).length) {
        res.json({
            form: billingForm,
            fieldErrors: [billingFormErrors, creditCardErrors],
            serverErrors: [],
            error: true,
            paymentMethod: viewData.paymentMethod
        });
        this.emit('route:Complete', req, res);
        return;
    }

    viewData.address = {
        firstName: { value: billingForm.addressFields.firstName.value },
        lastName: { value: billingForm.addressFields.lastName.value },
        address1: { value: billingForm.addressFields.address1.value },
        address2: { value: billingForm.addressFields.address2.value },
        city: { value: billingForm.addressFields.city.value },
        postalCode: { value: billingForm.addressFields.postalCode.value },
        countryCode: { value: billingForm.addressFields.country.value }
    };

    if (Object.prototype.hasOwnProperty.call(billingForm.addressFields, 'states')) {
        viewData.address.stateCode = {
            value: billingForm.addressFields.states.stateCode.value
        };
    }

    var email = billingForm.creditCardFields.email.value;
    if (isUseBillingAgreement) {
        email = customer.getProfile().getEmail();
    }
    viewData.email = {
        value: email
    };

    res.setViewData(viewData);

    var billingAddress = currentBasket.billingAddress;
    Transaction.wrap(function () {
        if (!billingAddress) {
            billingAddress = currentBasket.createBillingAddress();
        }

        billingAddress.setFirstName(billingForm.addressFields.firstName.value);
        billingAddress.setLastName(billingForm.addressFields.lastName.value);
        billingAddress.setAddress1(billingForm.addressFields.address1.value);
        billingAddress.setAddress2(billingForm.addressFields.address2.value);
        billingAddress.setCity(billingForm.addressFields.city.value);
        billingAddress.setPostalCode(billingForm.addressFields.postalCode.value);
        billingAddress.setCountryCode(billingForm.addressFields.country.value);
        if (Object.prototype.hasOwnProperty.call(billingForm.addressFields, 'states')) {
            billingAddress.setStateCode(billingForm.addressFields.states.stateCode.value);
        }
        currentBasket.setCustomerEmail(email);
        /* TODO
        if (viewData.storedPaymentUUID) {
            billingAddress.setPhone(req.currentCustomer.profile.phone);
            currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
        } else {
            billingAddress.setPhone(viewData.phone.value);
            currentBasket.setCustomerEmail(viewData.email.value);
        }
        */
    });

    Transaction.wrap(function () {
        HookMgr.callHook('dw.order.calculate', 'calculate', currentBasket);
    });

    var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();
    if (!processor) {
        throw new Error(Resource.msg('error.payment.processor.missing', 'checkout', null));
    }

    var processorResult = null;
    if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
        processorResult = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(), 'Handle', currentBasket);
    } else {
        throw new Error('hooks/payment/processor/paypal.js file is missing or "app.payment.processor.paypal" hook is wrong setted');
    }

    if (processorResult.error) {
        res.json({
            form: billingForm,
            fieldErrors: [],
            serverErrors: [],
            error: true
        });
        if (processorResult.paypalBillingAgreementNotActaual) {
            res.json({
                fieldErrors: [],
                serverErrors: [],
                cartError: true,
                redirectUrl: ''
            });
        }
        this.emit('route:Complete', req, res);
        return;
    }

    var usingMultiShipping = false; // Current integration support only single shpping
    req.session.privacyCache.set('usingMultiShipping', usingMultiShipping);

    var currentLocale = Locale.getLocale(req.locale.id);
    var basketModel = new OrderModel(currentBasket, { usingMultiShipping: usingMultiShipping, countryCode: currentLocale.country, containerView: 'basket' });
    var accountModel = new AccountModel(req.currentCustomer);

    // The hack for MFRA renders right data in function updatePaymentInformation(order). TODO need to find better solution
    basketModel.resources.cardType = '';
    basketModel.resources.cardEnding = '';
    basketModel.billing.payment.selectedPaymentInstruments[0].type = '';
    basketModel.billing.payment.selectedPaymentInstruments[0].maskedCreditCardNumber = processorResult.paypalEmail;
    basketModel.billing.payment.selectedPaymentInstruments[0].expirationMonth = 'PayPal ';
    basketModel.billing.payment.selectedPaymentInstruments[0].expirationYear = ' ' + dw.util.StringUtils.formatMoney(new dw.value.Money(basketModel.billing.payment.selectedPaymentInstruments[0].amount, currentBasket.getCurrencyCode()));
    // End the hack

    res.json({
        renderedPaymentInstruments: COHelpers.getRenderedPaymentInstruments(req, accountModel),
        customer: accountModel,
        order: basketModel,
        paypalProcessorResult: processorResult,
        form: billingForm,
        error: false
    });
    this.emit('route:Complete', req, res);
});

module.exports = server.exports();
