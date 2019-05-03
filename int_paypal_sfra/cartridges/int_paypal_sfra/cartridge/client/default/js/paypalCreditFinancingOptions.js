'use strict';

/* global $ */

(function () {
    function updateLabelValues() {
        $('.js_paypal_fo_lower_price_label:not(.js_paypal_fo_lower_price_label_inited)').each(function () {
            var $label = $(this);
            $.ajax($label.data('url')).done(function (data) {
                $label.html(data.labelText);
            });
            $label.addClass('js_paypal_fo_lower_price_label_inited');
        });
    }
    $(function () {
        updateLabelValues();
        $('body').on('click', '.js_paypal_fo_show_allOptionsBanner', function () {
            $(this).parents('.js_paypal_fo_banner_content').hide();
            $(this).parents('.js_paypal_fo_banner').find('.js_paypal_fo_allOptionsBanner').removeClass('js_paypal_fo_allOptionsBanner_hide');
        });
        $('body').on('click', '.js_paypal_fo_allOptionsBanner_tab', function () {
            var val = $(this).data('value');
            $('.js_paypal_fo_allOptionsBanner_tab').removeClass('js_paypal_active');
            $(this).addClass('js_paypal_active');
            $('.js_paypal_fo_allOptionsBanner_tab_content').removeClass('js_paypal_active');
            $('.js_paypal_fo_allOptionsBanner_tab_content[data-value=' + val + ']').addClass('js_paypal_active');
        });
        function initWathcherCartUpdate() { // TODO change in future. This is bad solution, but MFRA base dosn't provide custom event after costs is updated
            var $grantTotal = $('.grand-total');
            var currentGrantTotalValue = $grantTotal.text();
            setInterval(function () {
                var newGrantTotalValue = $grantTotal.text();
                if (newGrantTotalValue !== '' && newGrantTotalValue !== currentGrantTotalValue) {
                    currentGrantTotalValue = newGrantTotalValue;
                    $('body').trigger('paypal:updateCartTotals');
                }
            }, 100);
        }
        initWathcherCartUpdate();
        function updateBanner(url) {
            $.ajax(url).done(function (data) {
                $('.js_paypal_fo_banner_value').text(data.lowerCostPerMonth.formatted);
                $('.js_paypal_fo_allOptionsBanner_tab_content').each(function () {
                    var $tabContent = $(this);
                    var option = data.options[$tabContent.data('value')];
                    $tabContent.find('.js__monthlyPayment').text(option.monthlyPayment.formatted);
                    $tabContent.find('.js__apr').text(option.apr);
                    $tabContent.find('.js__costOfPurchase').text(option.purchaseCost.formatted);
                    $tabContent.find('.js__totalCost').text(option.totalCost.formatted);
                });
            });
        }
        $('body').on('paypal:updateCartTotals', function () {
            updateBanner($('.js_paypal_fo_allOptionsBanner').data('url') + '&isGetCartTotalAsValue=true&t=' + Date.now());
        });
        $('body').on('product:afterAttributeSelect', function (e, data) {
            var value;
            if (data.data.product.price.type === 'range') {
                value = data.data.product.price.min.sales.value;
            }
            if (data.data.product.price.sales) {
                value = data.data.product.price.sales.value;
            }
            updateBanner($('.js_paypal_fo_allOptionsBanner').data('url') + '&value=' + value);
        });
    });
    window.paypalCreditFinancingOptions = {
        updateLabelValues: updateLabelValues
    };
}());
