'use strict';

/* global dw */

var paypalApi = require('~/cartridge/scripts/paypal/paypalApi');
var paypalHelper = require('~/cartridge/scripts/paypal/paypalHelper');

/*
    This hook should be used for implementation of custom ipn handlers and additional ipn logic. Order status update implemented and can used as example
*/

/**
 * getPaypalPaymentStatus() returns payment status, depending on the PayPal API call response
 *
 * @param {string} status - Payment status from PayPal API call response
 * @returns {number} order status in dw.order.Order format
 */
function getPaypalPaymentStatus(status) {
    var paid = ['Completed']; // values of the response, that will be treated as "Paid" order status
    var partiallyPaid = ['Partially_Refunded']; // values of the response, that will be treated as "Partially Paid" order status
    var paymentStatus = null;

    if (paid.indexOf(status) !== -1) {
        paymentStatus = dw.order.Order.PAYMENT_STATUS_PAID;
    } else if (partiallyPaid.indexOf(status) !== -1) {
        paymentStatus = dw.order.Order.PAYMENT_STATUS_PARTPAID;
    } else {
        paymentStatus = dw.order.Order.PAYMENT_STATUS_NOTPAID;
    }

    return paymentStatus;
}

/**
 * Change Payment Status and PayPal payment status
 *
 * @param {dw.order.Order} order - Order object which should be updated
 * @param {string} status - Payment status from GetTransactionDetails
 */
function changeOrderStatus(order, status) {
    var paymentInstrument = paypalHelper.getPaypalPaymentInstrument(order);
    var paymentStatus = getPaypalPaymentStatus(status);
    var paypalLogger = require('~/cartridge/scripts/paypal/logger');
    var logger = paypalLogger.getLogger('IPN');

    try {
        if (!paymentInstrument) {
            throw new Error('Can not find PayPal Express payment instrument in the order');
        }

        paymentInstrument.custom.paypalPaymentStatus = status;

        // If only PayPal payment instrument was used we can be sure that order can be syncronized with PayPal's payment status
        if (order.getPaymentInstruments().size() === 1) {
            order.setPaymentStatus(paymentStatus);
        }
    } catch (error) {
        logger.error(error.toString());
    }
}

/**
 * Entry point for incoming notification to be processed
 *
 * @param {Object} notification - Notification object
 * @returns {boolean} Is success
 */
function handleNotification(notification) {
    var Transaction = require('dw/system/Transaction');

    var order = dw.order.OrderMgr.getOrder(notification.invoice);
    if (!order) {
        return false;
    }

    var transactionID = notification.txn_id;
    var result = paypalApi.getTransactionDetails(transactionID, order.getCurrencyCode());

    if (result.error) {
        return false;
    }

    Transaction.wrap(function () {
        var orderTransactionResult = paypalHelper.updateOrderTransaction(notification.invoice, false, result.responseData.transactionid, null);

        if (!orderTransactionResult) {
            return false;
        }

        // In case of complete payment change order status
        if (result.responseData.paymentstatus === 'Completed') {
            changeOrderStatus(order, result.responseData.paymentstatus);
        }
        return true;
    });

    return true;
}

exports.handle = handleNotification;
