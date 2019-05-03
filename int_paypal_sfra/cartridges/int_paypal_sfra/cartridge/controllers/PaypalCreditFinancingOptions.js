'use strict';

/* global dw request */

var server = require('server');
var cache = require('*/cartridge/scripts/middleware/cache');

var creditFinancialOptionsHelper = require('*/cartridge/scripts/paypal/paypalCreditFinancingOptionsHelper');

/**
 * Entry point for retrieving lowest possible monthly cost
 */
server.get('GetLowestPossibleMonthlyCost', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var value = parseFloat(request.httpParameterMap.value.stringValue);
    var currencyCode = request.httpParameterMap.currencyCode.stringValue.toUpperCase();
    var countryCode = request.httpParameterMap.countryCode.stringValue;
    if (!countryCode) {
        countryCode = dw.util.Locale.getLocale(request.locale).country;
    }
    countryCode = countryCode.toUpperCase();
    var lowerPricePerMonth = creditFinancialOptionsHelper.getLowestPossibleMonthlyCost(value, currencyCode, countryCode);
    res.json({
        value: lowerPricePerMonth.value,
        currencyCode: lowerPricePerMonth.currencyCode,
        labelText: dw.web.Resource.msgf('paypal.creditFinancingOptions.productTile.lowerMonthCost.ph', 'locale', '', lowerPricePerMonth.formatted)
    });
    next();
});

/**
 * Entry point for retrieving all Credit Financing Options
 */
server.get('GetAllOptionsData', cache.applyPromotionSensitiveCache, function (req, res, next) {
    var value = parseFloat(request.httpParameterMap.value.stringValue);
    var currencyCode = request.httpParameterMap.currencyCode.stringValue.toUpperCase();
    var countryCode = request.httpParameterMap.countryCode.stringValue;
    if (!countryCode) {
        countryCode = dw.util.Locale.getLocale(request.locale).country;
    }
    countryCode = countryCode.toUpperCase();
    var BasketMgr;
    var currentBasket;
    var isGetCartTotalAsValue = request.httpParameterMap.isGetCartTotalAsValue.booleanValue;
    var basketTotal;
    if (isGetCartTotalAsValue) {
        BasketMgr = require('dw/order/BasketMgr');
        currentBasket = BasketMgr.getCurrentBasket();
        basketTotal = currentBasket.totalGrossPrice;
        value = basketTotal.value;
        currencyCode = basketTotal.currencyCode;
    }
    var allOptionsData;
    var lowerPricePerMonth;
    if (!value || !currencyCode || !countryCode) {
        allOptionsData = {
            error: {
                errorText: 'Not all parameters are passed. Should be: value, currencyCode, countryCode'
            }
        };
    } else {
        allOptionsData = creditFinancialOptionsHelper.getDataForAllOptionsBanner(value, currencyCode, countryCode);
        lowerPricePerMonth = creditFinancialOptionsHelper.getLowestPossibleMonthlyCost(value, currencyCode, countryCode);
        allOptionsData.lowerCostPerMonth = {
            value: lowerPricePerMonth.value,
            currencyCode: lowerPricePerMonth.currencyCode,
            formatted: lowerPricePerMonth.formatted
        };
    }
    res.json(allOptionsData);
    next();
});

module.exports = server.exports();
