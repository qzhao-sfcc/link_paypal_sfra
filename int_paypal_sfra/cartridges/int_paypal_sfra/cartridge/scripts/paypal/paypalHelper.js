'use strict';

/* global empty dw request session customer */

var HashMap = require('dw/util/HashMap');
var Transaction = require('dw/system/Transaction');
var prefs = require('~/cartridge/config/paypalPreferences');
var paypalApi = require('~/cartridge/scripts/paypal/paypalApi');
var paypalLogger = require('~/cartridge/scripts/paypal/logger');
var commonLibrary = require('~/cartridge/scripts/paypal/commonLibrary');

var paypalHelper = {};

/**
 * Calculates the amount to be payed by a non-gift certificate payment instrument based
 * on the given basket. The method subtracts the amount of all redeemed gift certificates
 * from the order total and returns this value.
 *
 * @param {Object} lineItemCtnr - LineIteam Container (Basket or Order)
 * @returns {dw.value.Money} non gift certificate amount
 */
function calculateNonGiftCertificateAmount(lineItemCtnr) {
    var giftCertTotal = new dw.value.Money(0.0, lineItemCtnr.currencyCode);
    var gcPaymentInstrs = lineItemCtnr.getGiftCertificatePaymentInstruments();
    var iter = gcPaymentInstrs.iterator();
    var orderPI = null;

    while (iter.hasNext()) {
        orderPI = iter.next();
        giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
    }

    var orderTotal = lineItemCtnr.totalGrossPrice;
    var amountOpen = orderTotal.subtract(giftCertTotal);
    return amountOpen;
}

/**
 * Create transaction history array

 * @param {dw.object.CustomAttributes} customObj - Custom properties
 * @param {string} transactionId - Transaction ID from new transaction
 */
function writeTransactionHistory(customObj, transactionId) {
    var customObject = customObj;
    var transactionsHistory = [];

    customObject.transactionsHistory.forEach(function (transactionID) {
        transactionsHistory.push(transactionID);
    });

    transactionsHistory.push(transactionId);
    customObject.transactionsHistory = transactionsHistory;
}

/**
 * Update transaction history of a PayPalNewTransactions Custom Object

 * @param {string} orderNo - Order number
 * @param {string} transactionId - Transaction ID from new transaction
 */
function updateCustomOrderData(orderNo, transactionId) {
    var order = dw.object.CustomObjectMgr.getCustomObject('PayPalNewTransactions', orderNo);
    var transactionDetailsResult = paypalApi.getTransactionDetails(order.custom.transactionsHistory[0], order.currencyCode);

    if (transactionDetailsResult.error) {
        throw new Error('transactionDetailsResult.error');
    }

    var paymentStatus = transactionDetailsResult.responseData.paymentstatus;

    writeTransactionHistory(order.custom, transactionId);
    order.custom.transactionId = transactionId;
    order.custom.paymentStatus = paymentStatus;
}

/**
 * Update transaction history of a Order

 * @param {string} orderNo - Order number
 * @param {string} transactionId - Transaction ID from new transaction
 * @param {string} methodName - Method name
 */
function updateOrderData(orderNo, transactionId, methodName) {
    var order = dw.order.OrderMgr.getOrder(orderNo);
    var paymentInstrument = paypalHelper.getPaypalPaymentInstrument(order);
    var paymentTransaction = paymentInstrument.getPaymentTransaction();
    var transactionDetailsResult = paypalApi.getTransactionDetails(paymentTransaction.custom.transactionsHistory[0], order.getCurrencyCode());

    if (transactionDetailsResult.error) {
        throw new Error('transactionDetailsResult.error');
    }
    var paymentStatus = transactionDetailsResult.responseData.paymentstatus;

    if (empty(order)) {
        throw new Error();
    }

    writeTransactionHistory(paymentTransaction.custom, transactionId);
    paymentTransaction.setTransactionID(transactionId);
    paymentInstrument.custom.paypalPaymentStatus = paymentStatus;

    if (paymentStatus === 'Completed') {
        order.setPaymentStatus(dw.order.Order.PAYMENT_STATUS_PAID);
    } else if (paymentStatus === 'In-Progress' && methodName === 'DoCapture') {
        order.setPaymentStatus(dw.order.Order.PAYMENT_STATUS_PARTPAID);
    }
}

/**
 * Returns store name for ship to store feature
 *
 * @param {string} storeName - Store name
 * @returns {string} store name that indicate that ship to store feature is active
 */
function decorateByShipToStorePrefix(storeName) {
    return 'S2S ' + storeName;
}

/**
 * Returns shipping data from order object for SetExpressCheckout call
 *
 * @param {order.LineItemCtnr} lineItemContainer - Basket or Order
 * @param {boolean} isDataForDoreferenceTransaction - Is need create data for DoReferenceTransaction call
 * @returns {dw.util.HashMap} shipping data
 */
function getShippingRequestData(lineItemContainer, isDataForDoreferenceTransaction) {
    var prefix = isDataForDoreferenceTransaction ? '' : 'PAYMENTREQUEST_0_';
    var data = new HashMap();
    var defaultShipment = lineItemContainer.getDefaultShipment();
    var shippingAddress = defaultShipment.getShippingAddress();

    if (!empty(shippingAddress) && shippingAddress !== null) {
        var storeName = shippingAddress.getFullName();
        data.put(prefix + 'SHIPTOSTREET', shippingAddress.getAddress1());
        data.put(prefix + 'SHIPTOSTREET2', shippingAddress.getAddress2());
        data.put(prefix + 'SHIPTOCITY', shippingAddress.getCity());
        data.put(prefix + 'SHIPTOCOUNTRYCODE', shippingAddress.getCountryCode().getValue().toUpperCase());
        data.put(prefix + 'SHIPTONAME', shippingAddress.custom.isStore ? decorateByShipToStorePrefix(storeName) : storeName);
        data.put(prefix + 'SHIPTOPHONENUM', shippingAddress.getPhone());
        data.put(prefix + 'SHIPTOSTATE', shippingAddress.getStateCode());
        data.put(prefix + 'SHIPTOZIP', shippingAddress.getPostalCode());
    }

    return data;
}

/**
 * Calculates amount of all applied Gift Certificates
 *
 * @param {dw.order.LineItemCtnr} lineItemContainer - Order or Basket
 * @returns {dw.value.Money} amount
 */
function calculateAppliedGiftCertificatesAmount(lineItemContainer) {
    var amount = new dw.value.Money(0, lineItemContainer.getCurrencyCode());
    var paymentInstruments = lineItemContainer.getGiftCertificatePaymentInstruments();

    var iterator = paymentInstruments.iterator();
    var paymentInstrument = null;
    while (iterator.hasNext()) {
        paymentInstrument = iterator.next();
        amount = amount.add(paymentInstrument.getPaymentTransaction().getAmount());
    }

    return amount;
}

/**
 * Returns payment data from order object for SetExpressCheckout & DoExpressCheckout API call
 *
 * @param {dw.order.LineItemCtnr} lineItemContainer - Basket or Order
 * @param {boolean} isDataForDoreferenceTransaction - Is need create data for DoReferenceTransaction call
 * @returns {dw.util.HashMap} payment data
 */
function getPaymentRequestData(lineItemContainer, isDataForDoreferenceTransaction) {
    var prefix = isDataForDoreferenceTransaction ? '' : 'PAYMENTREQUEST_0_';
    var data = new HashMap();
    var appliedGiftCertificatesAmount = calculateAppliedGiftCertificatesAmount(lineItemContainer);
    var amount = lineItemContainer.getTotalGrossPrice().subtract(appliedGiftCertificatesAmount);
    var itemsAmount;
    var shippingDiscountAmount;

    if (dw.order.TaxMgr.getTaxationPolicy() === dw.order.TaxMgr.TAX_POLICY_NET) {
        itemsAmount = lineItemContainer.getTotalNetPrice().subtract(appliedGiftCertificatesAmount).subtract(lineItemContainer.getAdjustedShippingTotalNetPrice());
        shippingDiscountAmount = lineItemContainer.getAdjustedShippingTotalNetPrice().subtract(lineItemContainer.getShippingTotalNetPrice());
    } else {
        itemsAmount = lineItemContainer.getTotalGrossPrice().subtract(appliedGiftCertificatesAmount).subtract(lineItemContainer.getAdjustedShippingTotalGrossPrice());
        shippingDiscountAmount = lineItemContainer.getAdjustedShippingTotalGrossPrice().subtract(lineItemContainer.getShippingTotalGrossPrice());
    }

    data.put(prefix + 'AMT', amount.getValue());
    data.put(prefix + 'CURRENCYCODE', lineItemContainer.getCurrencyCode());
    data.put(prefix + 'ITEMAMT', itemsAmount.getValue());

    if (dw.order.TaxMgr.getTaxationPolicy() === dw.order.TaxMgr.TAX_POLICY_NET) {
        data.put(prefix + 'TAXAMT', lineItemContainer.getTotalTax().getValue());
    }
    data.put(prefix + 'SHIPPINGAMT', lineItemContainer.getShippingTotalPrice().getValue());
    data.put(prefix + 'SHIPDISCAMT', shippingDiscountAmount.getValue());

    return data;
}

/**
 * Returns line items information for SetExpressCheckout and DoExpressCheckout API call
 *
 * @param {dw.order.LineItemCtnr} lineItemContainer - Basket or Order
 * @param {boolean} isDataForDoreferenceTransaction - Is need create data for DoReferenceTransaction call
 * @returns {dw.util.HashMap} line items request data (include promotion)
 */
function getProductLineItemsRequestData(lineItemContainer, isDataForDoreferenceTransaction) {
    var prefix = isDataForDoreferenceTransaction ? 'L_' : 'L_PAYMENTREQUEST_0_';

    var lineItems = lineItemContainer.getAllLineItems();
    var data = new HashMap();
    var index = 0;

    var promotionDesc = null;
    var promotionName = null;
    var coupon = null;
    var promotion = null;
    var promotionClass = null;

    for (var i = 0, len = lineItems.size(); i < len; i++) {
        var productLineItem = lineItems[i];

        if (productLineItem instanceof dw.order.ProductLineItem || productLineItem instanceof dw.catalog.Variant) {
            var product = productLineItem.getProduct();
            var productDescription = '';

            if (!productLineItem.isBonusProductLineItem() && !productLineItem.isOptionProductLineItem() && !empty(product)) {
                if (!empty(product.getShortDescription())) {
                    productDescription = product.getShortDescription().getMarkup();
                } else if (!empty(product.getLongDescription())) {
                    productDescription = product.getLongDescription().getMarkup();
                } else {
                    productDescription = dw.web.Resource.msg('paypal.referencetransaction.noitemdesc', 'locale', 'No description given');
                }
            } else {
                productDescription = productLineItem.getProductName();
            }

            data.put(prefix + 'NAME' + index, productLineItem.getProductName());
            data.put(prefix + 'DESC' + index, commonLibrary.truncatePreferenceString(productDescription, 127));
            data.put(prefix + 'NUMBER' + index, productLineItem.getProductID());
            data.put(prefix + 'AMT' + index, productLineItem.getBasePrice().getValueOrNull());
            data.put(prefix + 'QTY' + index, productLineItem.getQuantity().getValue());

            index++;

            var priceAdjustments = productLineItem.getPriceAdjustments();

            if (priceAdjustments.size() > 0) {
                var iterator = priceAdjustments.iterator();
                var priceAdjustment = null;
                while (iterator.hasNext()) {
                    priceAdjustment = iterator.next();
                    promotion = priceAdjustment.getPromotion();
                    promotionClass = promotion.getPromotionClass();

                    if (!empty(promotion) && promotionClass === dw.campaign.Promotion.PROMOTION_CLASS_PRODUCT) {
                        promotionName = promotion.getName() || dw.web.Resource.msg('paypal.adjustment', 'locale', null);
                        promotionDesc = promotion.getCalloutMsg();
                        coupon = dw.web.Resource.msg('paypal.coupon', 'locale', null);

                        data.put(prefix + 'NAME' + index, promotion.isBasedOnCoupons() ? coupon : promotionName);
                        data.put(prefix + 'QTY' + index, 1);
                        data.put(prefix + 'AMT' + index, priceAdjustment.getBasePrice().getValueOrNull());
                        data.put(prefix + 'DESC' + index, promotionDesc ? commonLibrary.truncatePreferenceString(promotionDesc.getMarkup(), 110) : null);

                        index++;
                    }
                }
            }
        } else if (productLineItem instanceof dw.order.PriceAdjustment) {
            promotion = productLineItem.getPromotion();
            promotionClass = productLineItem.getPromotion().getPromotionClass();

            if (!empty(promotion) && promotionClass === dw.campaign.Promotion.PROMOTION_CLASS_ORDER) {
                promotionDesc = promotion.getCalloutMsg();
                promotionName = promotion.getName();
                coupon = dw.web.Resource.msg('paypal.coupon', 'locale', null);

                data.put(prefix + 'NAME' + index, productLineItem.isBasedOnCoupon() ? coupon : promotionName);
                data.put(prefix + 'QTY' + index, 1);
                data.put(prefix + 'AMT' + index, productLineItem.getBasePrice().getValueOrNull());
                data.put(prefix + 'DESC' + index, promotionDesc ? commonLibrary.truncatePreferenceString(promotionDesc.getMarkup(), 110) : null);

                index++;
            }
        }
    }
    return {
        data: data,
        nextIndex: index
    };
}

/**
 * Returns gift data from basket for SetExpressCheckout & DoExpressCheckout API call
 *
 * @param {dw.order.LineItemCtnr} lineItemContainer - Order object
 * @param {number} counter - Start from
 * @param {boolean} isDataForDoreferenceTransaction - Is need create data for DoReferenceTransaction call
 * @returns {dw.util.HashMap} request data about gift items and certificates
 */
function getGiftLineItemsRequestData(lineItemContainer, counter, isDataForDoreferenceTransaction) {
    var prefix = isDataForDoreferenceTransaction ? 'L_' : 'L_PAYMENTREQUEST_0_';
    var i = null;
    var len = null;

    var giftItems = lineItemContainer.getGiftCertificateLineItems();
    var giftCertificates = lineItemContainer.getGiftCertificatePaymentInstruments();
    var data = new HashMap();
    var index = counter;

    for (i = 0, len = giftItems.size(); i < len; i++) {
        var giftLineItem = giftItems[i];

        data.put(prefix + 'NAME' + index, giftLineItem.getLineItemText());
        data.put(prefix + 'DESC' + index, commonLibrary.truncatePreferenceString(giftLineItem.getLineItemText(), 127));
        data.put(prefix + 'NUMBER' + index, giftLineItem.getGiftCertificateID() ? giftLineItem.getGiftCertificateID() : giftLineItem.getLineItemText());
        data.put(prefix + 'AMT' + index, giftLineItem.getBasePrice().getValueOrNull());
        data.put(prefix + 'QTY' + index, '1');

        index++;
    }

    for (i = 0, len = giftCertificates.size(); i < len; i++) {
        var giftCertificate = giftCertificates[i];

        data.put('L_PAYMENTREQUEST_0_NAME' + index, giftCertificate.getPaymentMethod());
        data.put('L_PAYMENTREQUEST_0_DESC' + index, commonLibrary.truncatePreferenceString(giftCertificate.getPaymentMethod(), 127));
        data.put('L_PAYMENTREQUEST_0_NUMBER' + index, giftCertificate.getGiftCertificateCode());
        data.put('L_PAYMENTREQUEST_0_AMT' + index, (giftCertificate.getPaymentTransaction().getAmount().getValueOrNull() * -1)); // Multiply Number value to -1 to get negative value
        data.put('L_PAYMENTREQUEST_0_QTY' + index, '1');

        index++;
    }

    return data;
}

/**
 * Alias for Returns site preferences from Preference.js file
 *
 * @returns {Object} object with preferences
 */
paypalHelper.getPrefs = function () {
    return prefs;
};

/**
 * Return PayPal order payment instrument
 *
 * @param {dw.order.LineItemCtnr} basket - Basket
 * @returns {dw.order.OrderPaymentInstrument} payment instrument with id PAYPAL
 */
paypalHelper.getPaypalPaymentInstrument = function (basket) {
    var paymentInstruments = basket.getPaymentInstruments();

    var iterator = paymentInstruments.iterator();
    var paymentInstrument = null;
    while (iterator.hasNext()) {
        paymentInstrument = iterator.next();
        var paymentMethod = dw.order.PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod());
        if (paymentMethod) {
            var paymentProcessorId = paymentMethod.getPaymentProcessor().getID();
            if (paymentProcessorId === 'PAYPAL') {
                return paymentInstrument;
            }
        }
    }
    return null;
};

/**
 * Delete all PayPal payment instruments from Basket
 *
 * @param {dw.order.LineItemCtnr} basket - Basket
 */
paypalHelper.removeAllPaypalPaymentInstruments = function (basket) {
    var paymentInstruments = basket.getPaymentInstruments();

    var iterator = paymentInstruments.iterator();
    var paymentInstrument = null;
    Transaction.wrap(function () {
        while (iterator.hasNext()) {
            paymentInstrument = iterator.next();
            var paymentProcessorId = dw.order.PaymentMgr.getPaymentMethod(paymentInstrument.getPaymentMethod()).getPaymentProcessor().getID();
            if (paymentProcessorId === 'PAYPAL') {
                basket.removePaymentInstrument(paymentInstrument);
            }
        }
    });
};

/**
 * Alias for Return Customer Billing Agreement Object for work with customer Billing Agreement Data which is related with customer
 * @param {string} currencyCode - Currency Code
 * @returns {Object} Customer Billing Agreement Object
 */
paypalHelper.getCustomerBillingAgreement = function (currencyCode) {
    return require('~/cartridge/scripts/paypal/accountHelpers').getCustomerBillingAgreement(currencyCode);
};

/**
 * CreatePaymentInstrument
 *
 * @param {Object} basket - Basket
 * @param {string} paymentType - Name of the payment method.
 * @returns {Object} Payment instrument
 */
paypalHelper.createPaymentInstrument = function (basket, paymentType) {
    var paymentInstr = null;

    if (basket == null) {
        return null;
    }

    var iter = basket.getPaymentInstruments(paymentType).iterator();
    Transaction.wrap(function () {
        while (iter.hasNext()) {
            var existingPI = iter.next();
            basket.removePaymentInstrument(existingPI);
        }
    });

    var amount = calculateNonGiftCertificateAmount(basket);

    Transaction.wrap(function () {
        paymentInstr = basket.createPaymentInstrument(paymentType, amount);
    });

    return paymentInstr;
};

/**
 * Update transactionID and transactions history for PayPal payment instrument
 *
 * @param {string} orderNo - order number
 * @param {boolean} isCustomOrder -  Indicate if current order is Custom Object
 * @param {string} transactionID - PayPal transaction ID
 * @param {string} methodName - Used API method
 * @returns {boolean} true in case of success and false when error
 */
paypalHelper.updateOrderTransaction = function (orderNo, isCustomOrder, transactionID, methodName) {
    try {
        if (isCustomOrder) {
            updateCustomOrderData(orderNo, transactionID);
        } else {
            updateOrderData(orderNo, transactionID, methodName);
        }
    } catch (error) {
        paypalLogger.getLogger().error(error);
        return false;
    }

    return true;
};

/**
 * Checks if need to initiate Billing agreement
 *
 * @param {boolean} isFromCart - Is checkout starts from the cart page
 * @param {Object} basket - Basket
 * @returns {boolean} true, if it is needed to initiate Billing Agreement
 */
paypalHelper.checkIsNeedInitiateBillingAgreement = function (isFromCart, basket) {
    var customerBillingAgreement = paypalHelper.getCustomerBillingAgreement(basket.getCurrencyCode());
    var paypalForm = session.forms.billing.paypal;
    var BillingAgreementCase1 = prefs.PP_BillingAgreementState === 'BuyersChoose' && customer.authenticated && !customerBillingAgreement.hasAnyBillingAgreement && paypalForm.saveBillingAgreement.checked && !paypalForm.useCustomerBillingAgreement.checked;
    var BillingAgreementCase2 = prefs.PP_BillingAgreementState === 'BuyersChoose' && customer.authenticated && !customerBillingAgreement.hasAnyBillingAgreement && isFromCart;
    var BillingAgreementCase3 = prefs.PP_BillingAgreementState === 'RequireAllBuyers' && !customer.authenticated;
    var BillingAgreementCase4 = prefs.PP_BillingAgreementState === 'RequireAllBuyers' && customer.authenticated && (!customerBillingAgreement.hasAnyBillingAgreement || paypalForm.saveBillingAgreement.checked);
    var BillingAgreementCase5 = prefs.PP_BillingAgreementState === 'BuyersChoose' && customerBillingAgreement.hasAnyBillingAgreement && !paypalForm.useCustomerBillingAgreement.checked && paypalForm.saveBillingAgreement.checked;
    return (BillingAgreementCase1 || BillingAgreementCase2 || BillingAgreementCase3 || BillingAgreementCase4 || BillingAgreementCase5) && prefs.PP_BillingAgreementState !== 'DoNotCreate';
};

/**
 * updateBillingAddress() update billing address using data from GetExpressCheckout API call
 *
 * @param {dw.util.HashMap} data - Response data from GetExpressCheckout API call
 * @param {dw.order.OrderAddress} address - Current billing address
 * @returns {dw.order.OrderAddress} new billing address
 */
paypalHelper.updateBillingAddress = function (data, address) {
    if (!address) {
        return false;
    }

    var names = commonLibrary.createPersonNameObject(data.billingname);
    address.setFirstName(names.firstName);

    if (!empty(names.secondName)) {
        address.setSecondName(names.secondName);
    }

    if (!empty(names.lastName)) {
        address.setLastName(names.lastName);
    }

    var countryCode = data.countrycode || '';
    var phone = data.phonenum || data.paymentrequest_0_shiptophonenum || '';

    address.setAddress1(data.street);
    address.setCity(data.city);
    address.setPostalCode(data.zip);
    if (prefs.isMFRA) {
        address.setCountryCode(countryCode.toUpperCase());
    } else {
        address.setCountryCode(countryCode.toLowerCase());
    }

    address.setStateCode(data.state);
    address.setPhone(phone);

    return address;
};

/**
 * updateShippingAddress() update shipping address using data from GetExpressCheckout API call
 *
 * @param {dw.util.HashMap} data - Response data from GetExpressCheckout API call
 * @param {dw.customer.CustomerAddress} address - Current shipping address
 * @param {number} counter - Number, from which begins countdown
 * @returns {dw.customer.CustomerAddress} new shipping address
 */
paypalHelper.updateShippingAddress = function (data, address, counter) {
    if (!address) {
        return false;
    }

    var count = counter || 0;

    var names = commonLibrary.createPersonNameObject(data.get('paymentrequest_' + count + '_shiptoname'));

    address.setFirstName(names.firstName);

    if (!empty(names.secondName)) {
        address.setSecondName(names.secondName);
    }

    if (!empty(names.lastName)) {
        address.setLastName(names.lastName);
    }

    var countryCode = data.get('paymentrequest_' + count + '_shiptocountrycode') || '';

    address.setAddress1(data.get('paymentrequest_' + count + '_shiptostreet'));
    address.setAddress2(data.get('paymentrequest_' + count + '_shiptostreet2'));
    address.setCity(data.get('paymentrequest_' + count + '_shiptocity'));
    address.setPhone(data.get('paymentrequest_' + count + '_shiptophonenum'));
    address.setPostalCode(data.get('paymentrequest_' + count + '_shiptozip'));
    if (prefs.isMFRA) {
        address.setCountryCode(countryCode.toUpperCase());
    } else {
        address.setCountryCode(countryCode.toLowerCase());
    }
    address.setStateCode(data.get('paymentrequest_' + count + '_shiptostate'));

    return address;
};

/**
* Create PayPal error message
*
* @param {Object} responseData - Response Data from service call
* @returns {string} Error text to be presented to the customer
*/
paypalHelper.createPaypalErrorMessage = function (responseData) {
    var message = null;

    if (responseData) {
        for (var i = 0, len = responseData.size(); i < len; i++) {
            var errorCode = responseData.get('l_errorcode' + i);
            var shortMessage = responseData.get('l_shortmessage' + i);
            var longMessage = responseData.get('l_longmessage' + i);

            if (errorCode) {
                message = longMessage || shortMessage;
                message = dw.web.Resource.msg('paypal.error.code' + errorCode, 'locale', message);
            }
            break;
        }
    }

    if (!message) {
        message = dw.web.Resource.msg('paypal.error.general', 'locale', null);
    }

    return message;
};

/**
 * Function is used to preparing basket and payment instruments before proceed to PayPal
 *
 * @param {dw.order.LineItemCtnr} basket - Basket
 */
paypalHelper.prepareBasketForCheckoutFromCart = function (basket) {
    Transaction.wrap(function () {
        basket.createBillingAddress();
    });

    var defaultShipment = basket.getDefaultShipment();

    if (!defaultShipment.getShippingAddress()) {
        Transaction.wrap(function () {
            defaultShipment.createShippingAddress();
        });
    }

    if (!defaultShipment.getShippingMethod()) {
        Transaction.wrap(function () {
            defaultShipment.setShippingMethod(dw.order.ShippingMgr.getDefaultShippingMethod());
        });
    }

    Transaction.wrap(function () {
        dw.system.HookMgr.callHook(dw.web.Resource.msg('paypal.basketCalculateHookName', 'preferences', 'dw.ocapi.shop.basket.calculate'), 'calculate', basket);
    });
};

/**
 * Returns object with data for SetExpressCheckout call
 *
 * @param {dw.order.LineItemCtnr} basket - Current Basket
 * @param {string} returnUrl - URL address, on which PayPal a buyer should be returned after Express Checkout
 * @param {string} cancleUrl - URL address, on which PayPal a buyer should be returned after cancel Express Checkout
 * @param {boolean} isBillingAgreement - Indicate if Billing Agreement should be proposed to customer
 * @returns {dw.util.HashMap} requested data
 */
paypalHelper.createSetExpressCheckoutRequestData = function (basket, returnUrl, cancleUrl, isBillingAgreement) {
    var data = new HashMap();

    data.put('RETURNURL', returnUrl);
    data.put('CANCELURL', cancleUrl);

    data.put('PAYMENTREQUEST_0_PAYMENTACTION', prefs.PP_API_ExpressPaymentAction);
    data.put('REQCONFIRMSHIPPING', prefs.PP_API_ReqConfirmShipping ? 1 : 0);
    data.put('NOSHIPPING', prefs.PP_API_NoShipping);
    data.put('ADDROVERRIDE', prefs.PP_API_ShippingAddressOverride ? 1 : 0);
    data.put('REQBILLINGADDRESS', prefs.PP_API_RequestBillingAddressFromPayPal ? 1 : 0);
    data.put('SOLUTIONTYPE', prefs.PP_API_ExpressCheckoutSolutionType);
    data.put('LANDINGPAGE', prefs.PP_API_ExpressCheckoutLandingPage);
    data.put('USERSELECTEDFUNDINGSOURCE', null);

    if (isBillingAgreement) {
        data.put('BILLINGTYPE', prefs.PP_API_BillingAgreementType);
        data.put('BILLINGAGREEMENTDESCRIPTION', commonLibrary.truncatePreferenceString(prefs.PP_API_BillingAgreementDescription, 110));
        data.put('PAYMENTTYPE', prefs.PP_API_BillingAgreementPaymentType);
    }

    data.put('EMAIL', basket.getCustomerEmail());

    var siteLocale = dw.system.Site.getCurrent().getDefaultLocale();
    if (siteLocale !== 'default' && prefs.PP_API_Use_The_Same_Locale) {
        data.put('LOCALECODE', siteLocale);
    }

    data.putAll(getShippingRequestData(basket));
    data.putAll(getPaymentRequestData(basket));

    var productLineItemsRequestData = getProductLineItemsRequestData(basket);
    data.putAll(productLineItemsRequestData.data);
    data.putAll(getGiftLineItemsRequestData(basket, productLineItemsRequestData.nextIndex));

    data.put('LOGOIMG', commonLibrary.validateParameterLength(prefs.PP_API_LogoImageUrl, 127));
    data.put('BRANDNAME', commonLibrary.validateParameterLength(prefs.PP_API_BrandName, 127));

    return data;
};

/**
 * Returns object with data for DoExpressCheckout call
 *
 * @param {dw.order.LineItemCtnr} order - Order object
 * @param {dw.order.OrderPaymentInstrument} paymentInstrument - Order payment instrument with token and paypalPayerID from SetExpressCheckout call
 * @returns {dw.util.HashMap} request data
 */
paypalHelper.createDoExpressCheckoutRequestData = function (order, paymentInstrument) {
    var data = new HashMap();

    data.put('PAYMENTREQUEST_0_PAYMENTACTION', prefs.PP_API_ExpressPaymentAction);
    data.put('BUTTONSOURCE', prefs.PP_API_ButtonSource);
    data.put('PAYERID', paymentInstrument.custom.paypalPayerID);
    data.put('TOKEN', paymentInstrument.custom.paypalToken);
    data.put('PAYMENTREQUEST_0_INVNUM', order.getOrderNo());

    data.putAll(getShippingRequestData(order));
    data.putAll(getPaymentRequestData(order));

    var productLineItemsRequestData = getProductLineItemsRequestData(order);
    data.putAll(productLineItemsRequestData.data);
    data.putAll(getGiftLineItemsRequestData(order, productLineItemsRequestData.nextIndex));

    return data;
};

/**
 * Creates data for DoReferenceTransaction API call
 *
 * @param {Object} referenceId - The earliest transaction date at which to start the search.
 * @param {dw.order.LineItemCtnr} order - Order object with items/shipping data.
 * @param {string} invNum - Unique invoice or tracking number for this purchase.
 *
 * @returns {Object} Data prepared for request {method : String, data : Object}
 */
paypalHelper.createReferenceTransactionRequestData = function (referenceId, order, invNum) {
    var data = new HashMap();

    data.put('BUTTONSOURCE', prefs.PP_API_ButtonSource);
    data.put('PAYMENTACTION', prefs.PP_API_ReferenceTransactionPaymentAction);

    data.putAll(getShippingRequestData(order, true));
    data.putAll(getPaymentRequestData(order, true));

    var productLineItemsRequestData = getProductLineItemsRequestData(order, true);
    data.putAll(productLineItemsRequestData.data);
    data.putAll(getGiftLineItemsRequestData(order, productLineItemsRequestData.nextIndex, true));

    data.put('REFERENCEID', referenceId);
    data.put('INVNUM', invNum);
    data.put('PAYMENTTYPE', prefs.PP_API_BillingAgreementPaymentType);
    data.put('IPADDRESS', request.getHttpRemoteAddress());

    if (session.custom.paypalFraudnetSessionId) {
        data.put('RISKSESSIONCORRELATIONID', session.custom.paypalFraudnetSessionId);
    }

    return data;
};

module.exports = paypalHelper;
