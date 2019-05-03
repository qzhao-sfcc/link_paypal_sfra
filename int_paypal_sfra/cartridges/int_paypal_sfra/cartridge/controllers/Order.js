'use strict';

var page = module.superModule;
var server = require('server');

server.extend(page);

server.append('Confirm', function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(req.querystring.ID);
    res.setViewData({
        paypal: {
            summaryEmail: null,
            currency: order.getCurrencyCode()
        }
    });
    next();
});

server.append('Details', function (req, res, next) {
    var OrderMgr = require('dw/order/OrderMgr');
    var order = OrderMgr.getOrder(req.querystring.orderID);

    res.setViewData({
        paypal: {
            summaryEmail: null,
            currency: order.getCurrencyCode()
        }
    });
    next();
});

module.exports = server.exports();
