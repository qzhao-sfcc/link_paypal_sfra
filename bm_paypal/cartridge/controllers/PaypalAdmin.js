/* global dw request response empty */

var paypalHelper = require('*/cartridge/scripts/paypal/paypalHelper');
var logger = require('*/cartridge/scripts/paypal/logger').getLogger();
var paypalApi = require('*/cartridge/scripts/paypal/paypalApi');

var ISML = require('dw/template/ISML');
var Transaction = require('dw/system/Transaction');

/**
 * Get PayPalNewTransactions Custom Object with given order number
 *
 * @param {string} orderNo - Order number
 * @returns {Object} (transactionIdFromOrder: String - Transaction ID from order, order: dw.object.CustomObject - Custom Object that matched with order number)
 */
function getCustomOrderInfo(orderNo) {
    var order;
    var transactionId;
    try {
        order = dw.object.CustomObjectMgr.getCustomObject('PayPalNewTransactions', orderNo);
        transactionId = order.custom.transactionId;
    } catch (error) {
        logger.error(error);
        return false;
    }
    return {
        transactionIdFromOrder: transactionId,
        order: order
    };
}

/**
 * Combine orders and PayPalNewTransactions Custom Objects into one array for pagination
 *
 * @param {string} orderNo - Order number used in "Search by order number" feature
 * @returns {dw.util.ArrayList} Combined array with all orders
 */
function getOrders(orderNo) {
    var systemOrders = dw.object.SystemObjectMgr.querySystemObjects('Order', 'orderNo LIKE {0} AND custom.paypalPaymentMethod = \'express\' AND status != {1}', 'creationDate desc', orderNo, dw.order.Order.ORDER_STATUS_FAILED);
    var paypalOrders = dw.object.CustomObjectMgr.queryCustomObjects('PayPalNewTransactions', 'custom.orderNo LIKE {0}', 'custom.orderDate desc', orderNo);
    var orders = new dw.util.ArrayList(); // eslint-disable-line no-shadow
    var order;
    var paymentInstrument;
    var orderDate;
    var orderTotal;
    var obj;

    var orderIndex = 0;
    var maxSystemOrdersCount = 9000;
    var maxPaypalOrdersCount = 9000;
    var paypalOrdersCount = paypalOrders.getCount();
    if (paypalOrdersCount < maxPaypalOrdersCount) {
        maxSystemOrdersCount = 18000 - paypalOrdersCount;
    }

    while (systemOrders.hasNext()) {
        orderIndex++;
        if (orderIndex > maxSystemOrdersCount) {
            break;
        }
        order = systemOrders.next();
        paymentInstrument = paypalHelper.getPaypalPaymentInstrument(order);
        if (paymentInstrument === null) {
            continue; // eslint-disable-line no-continue
        }
        orderDate = new Date(order.creationDate);
        obj = {
            orderNo: order.orderNo,
            orderDate: dw.util.StringUtils.formatCalendar(new dw.util.Calendar(orderDate), 'M/dd/yy h:mm a'),
            createdBy: order.createdBy,
            isRegestered: order.customer.registered,
            customer: order.customerName,
            email: order.customerEmail,
            orderTotal: order.totalGrossPrice,
            currencyCode: order.getCurrencyCode(),
            paypalAmount: paymentInstrument.getPaymentTransaction().getAmount(),
            status: paymentInstrument.custom.paypalPaymentStatus,
            dateCompare: orderDate.getTime(),
            isCustom: false
        };
        orders.push(obj);
    }

    orderIndex = 0;
    while (paypalOrders.hasNext()) {
        orderIndex++;
        if (orderIndex > maxSystemOrdersCount) {
            break;
        }
        order = paypalOrders.next().custom;
        orderDate = new Date(order.orderDate.replace('Z', '.000Z'));
        orderTotal = new dw.value.Money(order.orderTotal, order.currencyCode);
        obj = {
            orderNo: order.orderNo,
            orderDate: dw.util.StringUtils.formatCalendar(new dw.util.Calendar(orderDate), 'M/dd/yy h:mm a'),
            createdBy: 'Merchant',
            isRegestered: 'Unknown',
            customer: order.firstName + ' ' + order.lastName,
            email: order.email,
            orderTotal: orderTotal,
            currencyCode: order.currencyCode,
            paypalAmount: orderTotal,
            status: order.paymentStatus,
            isCustom: true,
            dateCompare: orderDate.getTime()
        };
        orders.push(obj);
    }

    orders.sort(new dw.util.PropertyComparator('dateCompare', false));

    return orders;
}

/**
 * Render Template
 * @param {string} templateName - Template Name
 * @param {Object} data - pdict data
 */
function render(templateName, data) {
    if (typeof data !== 'object') {
        data = {}; // eslint-disable-line no-param-reassign
    }
    try {
        ISML.renderTemplate(templateName, data);
    } catch (e) {
        throw new Error(e.javaMessage + '\n\r' + e.stack, e.fileName, e.lineNumber);
    }
}

/**
 * Render JSON from Objects
 * @param {Object} responseResult - Response Result
 * @param {Object} responseData - Response Data
 */
function renderJson(responseResult, responseData) {
    var data = {};
    if (!empty(responseData)) {
        var hashMap = responseData;
        var keys = hashMap.keySet();
        var key;

        for (var i = 0, lenght = keys.size(); i < lenght; i++) {
            key = keys[i];
            data[key] = hashMap.get(key);
        }
    }
    if (!empty(responseResult)) {
        data.result = responseResult;
    }
    response.setContentType('application/json');
    response.writer.print(JSON.stringify(data, null, 2));
}

/**
 * Show template with create new transaction form
 */
function createNewTransaction() {
    render('paypalbm/components/newtransaction');
}

/**
 * Returns max amount is allowed for multiple capture operation
 */
function helperGetCaptureAmount() {
    var order = null;
    var responseResult = 'Success';

    if (!empty(request.httpParameterMap.orderNo.value)) {
        if (request.httpParameterMap.isCustomOrder.booleanValue) {
            var orderInfo = getCustomOrderInfo(request.httpParameterMap.orderNo.stringValue);
            if (!orderInfo) {
                responseResult = 'Error';
            } else {
                order = orderInfo.order;
            }
        } else {
            order = dw.order.OrderMgr.getOrder(request.httpParameterMap.orderNo.stringValue);
        }
    }

    if (!order) {
        responseResult = 'Error';
    }

    renderJson(responseResult);
}

/**
 * Create new PayPalNewTransactions Custom Object with data from a new transaction
 *
 * @param {Object} transactionData - Response data from a API call
 * @param {string} invNum - Custom order number for a PayPalNewTransactions Custom Object
 */
function createNewTransactionCustomObject(transactionData, invNum) {
    var newOrder = dw.object.CustomObjectMgr.createCustomObject('PayPalNewTransactions', invNum);
    newOrder.custom.orderDate = transactionData.ordertime;
    newOrder.custom.orderTotal = transactionData.amt;
    newOrder.custom.paymentStatus = transactionData.paymentstatus || 'Unknown';
    newOrder.custom.transactionId = transactionData.transactionid;
    newOrder.custom.firstName = transactionData.firstname;
    newOrder.custom.lastName = transactionData.lastname;
    newOrder.custom.email = transactionData.email || 'Unknown';
    newOrder.custom.currencyCode = transactionData.currencycode;
    newOrder.custom.transactionsHistory = [transactionData.transactionid];
}

/**
 * Get orders list. Can be filtered by order ID or transaction ID
 */
function orders() {
    var orderNo;
    var alternativeFlow = false;
    var orders; // eslint-disable-line no-shadow

    if (request.httpParameterMap.transactionId.submitted) {
        var callApiResponse = paypalApi.getTransactionDetails(request.httpParameterMap.transactionId.stringValue);

        if (!callApiResponse.error && callApiResponse.responseData.ack === 'Success') {
            orderNo = callApiResponse.responseData.invnum;
        } else {
            var allCurrencies = dw.system.Site.getCurrent().getAllowedCurrencies();
            Object.keys(allCurrencies).forEach(function (currencyIndex) {
                var currencyCode = allCurrencies.get(currencyIndex);
                var callApiResponse = paypalApi.getTransactionDetails(request.httpParameterMap.transactionId.stringValue, currencyCode); // eslint-disable-line no-shadow
                if (!callApiResponse.error && callApiResponse.responseData.ack === 'Success') {
                    orderNo = callApiResponse.responseData.invnum;
                    return;
                }
            });
        }
    }

    if (!orderNo) {
        alternativeFlow = true;
    }

    if (alternativeFlow) {
        orderNo = empty(request.httpParameterMap.orderNo.stringValue) ? '*' : request.httpParameterMap.orderNo.stringValue;
        orderNo = request.httpParameterMap.transactionId.submitted ? '0' : orderNo;
        orderNo = request.httpParameterMap.transactionId.stringValue === '' ? '*' : orderNo;
    }

    try {
        orders = getOrders(orderNo);
    } catch (error) {
        logger.error(error);
        render('paypalbm/components/servererror');
        return;
    }

    var pageSize = !empty(request.httpParameterMap.pagesize.intValue) ? request.httpParameterMap.pagesize.intValue : 10;
    var currentPage = request.httpParameterMap.page.intValue ? request.httpParameterMap.page.intValue : 1;
    pageSize = pageSize === 0 ? orders.length : pageSize;
    var start = pageSize * (currentPage - 1);
    var orderPagingModel = new dw.web.PagingModel(orders);

    orderPagingModel.setPageSize(pageSize);
    orderPagingModel.setStart(start);

    render('paypalbm/orderlist', {
        PagingModel: orderPagingModel
    });
}

/**
 * Get order transaction details
 */
function orderTransaction() {
    var errorFlow = false;
    var order = null;
    var paymentInstrument = null;
    var transactionIdFromOrder = null;

    if (request.httpParameterMap.orderNo && !empty(request.httpParameterMap.orderNo.value)) {
        if (request.httpParameterMap.isCustomOrder && !empty(request.httpParameterMap.isCustomOrder.stringValue)) {
            var orderInfo = getCustomOrderInfo(request.httpParameterMap.orderNo.stringValue);
            if (!orderInfo) {
                errorFlow = true;
            } else {
                order = orderInfo.order;
                transactionIdFromOrder = orderInfo.transactionIdFromOrder;
            }
        } else {
            order = dw.order.OrderMgr.getOrder(request.httpParameterMap.orderNo.stringValue);
            if (order) {
                paymentInstrument = paypalHelper.getPaypalPaymentInstrument(order);
            }
        }
    }

    if (!order || (!paymentInstrument && !transactionIdFromOrder)) {
        errorFlow = true;
    }

    if (errorFlow) {
        render('paypalbm/components/servererror');
        return;
    }
    transactionIdFromOrder = transactionIdFromOrder || paymentInstrument.getPaymentTransaction().getTransactionID();
    var transactionID = empty(request.httpParameterMap.transactionId.stringValue) ? transactionIdFromOrder : request.httpParameterMap.transactionId.stringValue;
    var isCustomOrder = !empty(request.httpParameterMap.isCustomOrder.stringValue);
    var currencyCode = request.httpParameterMap.currencyCode.stringValue;
    var result = paypalApi.getTransactionDetails(transactionID, currencyCode);

    if (result.error) {
        render('paypalbm/components/servererror');
        return;
    }

    render('paypalbm/ordertransaction', {
        isCustomOrder: isCustomOrder,
        Order: order,
        TransactionDetalis: result.responseData
    });
}

/**
 * Do some action, like DoAuthorize, DoCapture, DoRefund and etc
 */
function action() {
    var params = request.httpParameterMap;
    var responseResult = 'Success';
    var callApiResponse = {};

    if (!params.helperAction.submitted) {
        var methodName = params.methodName.stringValue;
        var methodData = params;
        var orderNo = params.orderNo.stringValue;
        var isCustomOrder = params.isCustomOrder.booleanValue;
        var isSaveToCustomOrder = methodName !== 'DoReferenceTransaction' && methodName !== 'DoDirectPayment';

        callApiResponse = paypalApi.callMethod(methodName, methodData);
        if (callApiResponse.error) {
            responseResult = 'Error';
        } else {
            if (callApiResponse.responseData.ack === 'Success' && isSaveToCustomOrder) { // eslint-disable-line no-lonely-if
                var orderTransactionResult = {};
                var transactionid = callApiResponse.responseData.transactionid || callApiResponse.responseData.authorizationid || callApiResponse.responseData.refundtransactionid;

                Transaction.wrap(function () {
                    orderTransactionResult = paypalHelper.updateOrderTransaction(orderNo, isCustomOrder, transactionid, methodName);
                });

                if (!orderTransactionResult) {
                    responseResult = 'Error';
                }
            } else {
                var currencyCode = request.httpParameterMap.currencycode.stringValue;
                var getTransactionResult = paypalApi.getTransactionDetails(callApiResponse.responseData.transactionid, currencyCode);

                if (getTransactionResult.error) {
                    responseResult = 'Error';
                } else {
                    Transaction.wrap(function () {
                        createNewTransactionCustomObject(getTransactionResult.responseData, callApiResponse.requestContainer.data.INVNUM);
                    });
                }
            }
        }
    } else {
        if (params.helperAction.stringValue === 'getCaptureAmount') {
            helperGetCaptureAmount();
            return;
        }
        responseResult = 'Error';
    }
    renderJson(responseResult, callApiResponse.responseData);
}

orders.public = true;
orderTransaction.public = true;
action.public = true;
createNewTransaction.public = true;

exports.Orders = orders;
exports.OrderTransaction = orderTransaction;
exports.Action = action;
exports.CreateNewTransaction = createNewTransaction;
