'use strict';

/* global dw session empty */

var URLUtils = require('dw/web/URLUtils');
var Transaction = require('dw/system/Transaction');

var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');
var paypalApi = require('~/cartridge/scripts/paypal/paypalApi');
var prefs = paypalHelper.getPrefs();
var accountHelper = require('~/cartridge/scripts/paypal/accountHelpers');

/**
 * Save result of DoExpressCheckout API call and update order data
 *
 * @param {Object} data - Parsed response result
 * @param {dw.order.LineItemCtnr} inpOrder - Order object
 * @param {dw.order.OrderPaymentInstrument} inpPaymentInstrument - Current payment instrument
 */
function saveTransactionResult(data, inpOrder, inpPaymentInstrument) {
    var order = inpOrder;
    var paymentInstrument = inpPaymentInstrument;
    Transaction.wrap(function () {
        var paymentTransaction = paymentInstrument.getPaymentTransaction();

        paymentTransaction.setTransactionID(data.paymentinfo_0_transactionid);
        paymentTransaction.setAmount(new dw.value.Money(parseFloat(data.paymentinfo_0_amt), data.paymentinfo_0_currencycode));
        paymentTransaction.custom.transactionsHistory = [data.paymentinfo_0_transactionid];

        paymentInstrument.custom.paypalAck = data.paymentinfo_0_ack;
        paymentInstrument.custom.paypalToken = data.token;
        paymentInstrument.custom.paypalPaymentStatus = data.paymentinfo_0_paymentstatus;
        paymentInstrument.custom.paypalCorrelationId = data.correlationid;

        var needSaveBillingAgreement = session.forms.billing.paypal.saveBillingAgreement.checked || prefs.PP_BillingAgreementState === 'RequireAllBuyers';

        if (order.customer.isAuthenticated()) {
            var currencyCode = order.getCurrencyCode();
            var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(currencyCode);
            if (data.billingagreementid && needSaveBillingAgreement) {
                customerBillingAgreement.remove(customerBillingAgreement.getDefault().id);
                customerBillingAgreement.add({
                    id: data.billingagreementid,
                    email: paymentInstrument.custom.paypalEmail,
                    currencyCode: currencyCode
                });
            }
            if (!customerBillingAgreement.getDefaultShippingAddress()) {
                accountHelper.saveShippingAddressToAccountFromBasket(order);
            }
        }

        paymentInstrument.custom.paypalEmail = null;

        // Change Order Payment Status to Paid if only PayPal was used as payment instrument and payment status is completed from PayPal side
        var orderPaymentInstruments = order.getPaymentInstruments();
        if (data.paymentinfo_0_paymentstatus === 'Completed' && orderPaymentInstruments.length === 1 && orderPaymentInstruments[0].getPaymentMethod() === 'PayPal') {
            order.setPaymentStatus(dw.order.Order.PAYMENT_STATUS_PAID);
        }
        order.custom.paypalPaymentMethod = 'express';
    });
}

/**
 * Save result of DoReferenceTransaction API call and update order data
 *
 * @param {Object} data - DoReferenceTransaction call response data
 * @param {dw.order.Order} inpOrder - Order being modified
 * @param {dw.order.PaymentInstrument} inpPaymentInstrument - PayPal payment instrument
 */
function saveReferenceTransactionResult(data, inpOrder, inpPaymentInstrument) {
    var order = inpOrder;
    var paymentInstrument = inpPaymentInstrument;
    Transaction.wrap(function () {
        var paymentTransaction = paymentInstrument.getPaymentTransaction();

        paymentTransaction.setTransactionID(data.transactionid);
        paymentTransaction.setAmount(new dw.value.Money(parseFloat(data.amt), data.currencycode));
        paymentTransaction.custom.transactionsHistory = [data.transactionid];

        paymentInstrument.custom.paypalPaymentStatus = data.paymentstatus;
        paymentInstrument.custom.paypalCorrelationId = data.correlationid;

        // Change Order Payment Status to Paid if only PayPal was used as payment instrument and payment status is completed from PayPal side
        var orderPaymentInstruments = order.getPaymentInstruments();
        if (data.paymentinfo_0_paymentstatus === 'Completed' && orderPaymentInstruments.length === 1 && orderPaymentInstruments[0].getPaymentMethod() === 'PayPal') {
            order.setPaymentStatus(dw.order.Order.PAYMENT_STATUS_PAID);
        }

        order.custom.paypalPaymentMethod = 'express';
    });
}

/**
 * Processor Handle
 *
 * @param {dw.order.LineItemCtnr} basket - Current basket
 * @param {boolean} isFromCart - Is checkout started from cart
 * @param {boolean} inpIsUseBillingAgreement - Is Billing Agreement used
 * @returns {Object} Processor handling result
 */
function handle(basket, isFromCart, inpIsUseBillingAgreement) {
    var isUseBillingAgreement = inpIsUseBillingAgreement;
    var paypalForm = session.forms.billing.paypal;

    paypalHelper.removeAllPaypalPaymentInstruments(basket);

    var methodName = 'PayPal';

    if (!isFromCart) {
        isUseBillingAgreement = paypalForm.useCustomerBillingAgreement.checked;
    }

    var paymentInstrument = paypalHelper.createPaymentInstrument(basket, methodName);
    var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(basket.getCurrencyCode());

    Transaction.wrap(function () {
        paymentInstrument.custom.paypalBillingAgreement = false;
        if (!prefs.isMFRA) {
            session.forms.billing.fulfilled.value = true;
            session.forms.billing.paymentMethods.selectedPaymentMethodID.value = methodName;
            session.forms.billing.paymentMethods.creditCard.saveCard.value = false;
        }
    });

    if (isUseBillingAgreement) {
        var actualBillingAgreementData = accountHelper.getActualBillingAgreementData(basket);
        if (actualBillingAgreementData) {
            Transaction.wrap(function () {
                paymentInstrument.custom.paypalBillingAgreement = true;
            });
            return {
                success: true,
                paymentInstrument: paymentInstrument,
                actualBillingAgreementData: actualBillingAgreementData,
                paypalEmail: customerBillingAgreement.getDefault().email,
                paypalBillingAgreementIsActaual: true
            };
        }
        return {
            error: true,
            paypalBillingAgreementNotActaual: true
        };
    }

    if (!isFromCart && basket.custom.paypalAlreadyHandledToken && !paypalForm.useAnotherAccount.checked) {
        Transaction.wrap(function () {
            paymentInstrument.custom.paypalToken = basket.custom.paypalAlreadyHandledToken;
            paymentInstrument.custom.paypalPayerID = basket.custom.paypalAlreadyHandledPayerID;
            paymentInstrument.custom.paypalEmail = basket.custom.paypalAlreadyHandledEmail;
        });
        return {
            success: true,
            redirectUrl: URLUtils.https(prefs.summaryPageEndpoint, 'stage', 'placeOrder').toString(),
            paypalEmail: basket.custom.paypalAlreadyHandledEmail,
            paypalToken: basket.custom.paypalAlreadyHandledToken,
            paymentInstrument: paymentInstrument
        };
    }

    var isNeedInitiateBillingAgreement = paypalHelper.checkIsNeedInitiateBillingAgreement(isFromCart, basket);
    var returnFromPaypalUrl = URLUtils.https('Paypal-ReturnFromPaypal', 'isFromCart', isFromCart).toString();
    var cancelUrl = URLUtils.https(isFromCart ? prefs.cartPageEndpoint : prefs.checkoutBillingPageEndpoint).toString();
    var setExpressCheckoutResult = paypalApi.setExpressCheckout(paypalHelper.createSetExpressCheckoutRequestData(basket, returnFromPaypalUrl, cancelUrl, isNeedInitiateBillingAgreement));

    paypalForm.expressCheckoutSetForBillingAgreement.setValue(isNeedInitiateBillingAgreement);

    if (setExpressCheckoutResult.error) {
        var paypalErrorMessage = paypalHelper.createPaypalErrorMessage(setExpressCheckoutResult.responseData);
        if (!isFromCart) {
            session.custom.paypalErrorMessage = paypalErrorMessage;
        }
        return {
            error: true,
            paypalErrorMessage: paypalErrorMessage
        };
    }
    var paypalToken = setExpressCheckoutResult.responseData.token;

    return {
        success: true,
        paypalToken: paypalToken,
        paymentInstrument: paymentInstrument
    };
}

/**
 * Save result of DoExpressCheckout API call and update order data
 *
 * @param {dw.order.LineItemCtnr} order - Order object
 * @param {string} orderNo - Order Number
 * @param {dw.order.OrderPaymentInstrument} inpPaymentInstrument - current payment instrument
 * @returns {Object} Processor authorizing result
 */
function authorize(order, orderNo, inpPaymentInstrument) {
    var paymentInstrument = inpPaymentInstrument;
    if (empty(paymentInstrument) || empty(order)) {
        return { error: true };
    }

    var paymentProcessor = dw.order.PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor();
    if (empty(paymentProcessor)) {
        return { error: true };
    }

    if (paymentInstrument.getPaymentTransaction().getAmount().getValue() === 0) {
        Transaction.wrap(function () {
            order.removePaymentInstrument(paymentInstrument);
        });
        return { authorized: true };
    }

    Transaction.wrap(function () {
        paymentInstrument.paymentTransaction.transactionID = order.orderNo;
        paymentInstrument.paymentTransaction.paymentProcessor = paymentProcessor;
    });

    if (paymentInstrument.custom.paypalBillingAgreement === true) {
        var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(order.getCurrencyCode());

        if (customerBillingAgreement.hasAnyBillingAgreement) {
            var doReferenceTransactionData = paypalHelper.createReferenceTransactionRequestData(customerBillingAgreement.getDefault().id, order, order.getOrderNo());
            var doReferenceDataObject = paypalApi.doReferenceTransaction(doReferenceTransactionData);

            if (doReferenceDataObject.error || empty(doReferenceDataObject.responseData)) {
                return { error: true };
            }

            saveReferenceTransactionResult(doReferenceDataObject.responseData, order, paymentInstrument);
            delete session.custom.paypalFraudnetSessionId;

            return { authorized: true };
        }
        return { error: true };
    }
    var doExpressCheckoutPaymentResult = paypalApi.doExpressCheckoutPayment(paypalHelper.createDoExpressCheckoutRequestData(order, paymentInstrument));

    var paypalErrorMessage = null;
    if (doExpressCheckoutPaymentResult.error) {
        paypalErrorMessage = paypalHelper.createPaypalErrorMessage(doExpressCheckoutPaymentResult.responseData);
        session.custom.paypalErrorMessage = paypalErrorMessage;
        if (doExpressCheckoutPaymentResult.responseData.l_errorcode0 === '10486') {
            return {
                error: true,
                paypalErrorMessage: paypalErrorMessage,
                redirectUrl: URLUtils.https(prefs.checkoutBillingPageEndpoint, 'showPaypalError', true, 'stage', 'payment').toString()
            };
        }
        return {
            error: true,
            paypalErrorMessage: paypalErrorMessage
        };
    }

    saveTransactionResult(doExpressCheckoutPaymentResult.responseData, order, paymentInstrument);

    if (prefs.PP_AuthorizationInCaseOfOrder && prefs.PP_API_ExpressPaymentAction === 'Order') {
        var result = paypalApi.doAuthorization({
            TRANSACTIONID: doExpressCheckoutPaymentResult.responseData.paymentinfo_0_transactionid,
            AMT: doExpressCheckoutPaymentResult.responseData.paymentinfo_0_amt,
            CURRENCYCODE: order.getCurrencyCode()
        });
        if (result.error) {
            paypalErrorMessage = paypalHelper.createPaypalErrorMessage(result.responseData);
            session.custom.paypalErrorMessage = paypalErrorMessage;
            if (result.responseData.l_errorcode0 === '10486') {
                return {
                    error: true,
                    paypalErrorMessage: paypalErrorMessage,
                    redirectUrl: URLUtils.https(prefs.checkoutBillingPageEndpoint, 'showPaypalError', true, 'stage', 'payment').toString()
                };
            }
            return {
                error: true,
                paypalErrorMessage: paypalErrorMessage
            };
        }

        Transaction.wrap(function () {
            paymentInstrument.getPaymentTransaction().setTransactionID(result.responseData.transactionid);
        });
    }

    return { authorized: true };
}

exports.handle = handle;
exports.authorize = authorize;
