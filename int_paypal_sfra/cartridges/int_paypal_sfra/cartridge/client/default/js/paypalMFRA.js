'use strict';

/* global paypalUtils $ */

$(document).ready(function () {
    var console = paypalUtils.console;

    $('.js_paypal_button').each(function () {
        var $paypalButton = $(this);
        if ($paypalButton.data('isInited')) {
            return;
        }
        var config = $paypalButton.data('paypalConfig');
        if (typeof config !== 'object') {
            console.error('paypalMFRA: not valid data-paypal-config');
            return;
        }
        if (config.billingAgreementFlow) {
            var billingAgreementFlowConfig = {
                isShippingAddressExist: config.billingAgreementFlow.isShippingAddressExist,
                startBillingAgreementCheckoutUrl: config.billingAgreementFlow.startBillingAgreementCheckoutUrl
            };
            if (!config.style) {
                config.style = {
                    layout: 'horizontal',
                    label: 'paypal',
                    maxbuttons: 1,
                    fundingicons: false,
                    shape: 'rect',
                    size: 'responsive',
                    tagline: false
                };
            }
            config.style.maxbuttons = 1;
            config.payment = function () {};
            config.onAuthorize = function () {};
            config.validate = function (actions) {
                return actions.disable();
            };
            config.onClick = function () {
                if (billingAgreementFlowConfig.isShippingAddressExist === true) {
                    window.location.href = billingAgreementFlowConfig.startBillingAgreementCheckoutUrl;
                    return;
                }
                var $paypalAddShippingAddressModal = $('#paypalAddShippingAddressModal');
                $('body').append($paypalAddShippingAddressModal);
                $('#paypalAddShippingAddressModal').modal();
            };
            delete config.billingAgreementFlow;
        }
        paypalUtils.initButton(config, $paypalButton[0]);
        $paypalButton.data('isInited', true);
    });

    var $continueButton = $('button.submit-payment');
    var $paymentOptionsTabs = $('.payment-options[role=tablist] a[data-toggle="tab"]');

    function continueButtonToggle(flag) {
        var stage = (new URL(window.location)).searchParams.get('stage');
        if (stage !== 'placeOrder' && stage !== 'shipping' && stage !== null) {
            $continueButton.toggle(flag);
        }
    }

    $('.js_paypal_button_on_billing_form').each(function () {
        var $paypalButton = $(this);
        if ($paypalButton.data('isInited')) {
            return;
        }
        var config = $paypalButton.data('paypalConfig');
        if (typeof config !== 'object') {
            console.error('paypalMFRA: not valid data-paypal-config');
            return;
        }

        var $paypalContent = $paypalButton.parents('.paypal-content:first');
        var $useAnotherAccountCheckbox = $paypalContent.find('input[name$="billing_paypal_useAnotherAccount"]');
        var $useAnotherAccountCheckboxWrap = $paypalContent.find('.js_paypal-use-another-account-wrap');
        var $saveBillingAgreementCheckbox = $paypalContent.find('input[name$="billing_paypal_saveBillingAgreement"]');
        var $saveBillingAgreementWrap = $('.js_paypa-save-ba-wrap');
        var $useCustomerBillingAgreementCheckbox = $paypalContent.find('input[name$="billing_paypal_useCustomerBillingAgreement"]');
        var $errorContainer = $paypalContent.find('.js_paypal_error');
        var $emailContainer = $paypalContent.find('.js_paypal_emailConainter');

        if ($useAnotherAccountCheckbox.length) {
            $useAnotherAccountCheckbox[0].checked = false;
            $useAnotherAccountCheckbox.change(function () {
                $paypalButton.parent().toggle(this.checked);
                continueButtonToggle(!this.checked);
                $paypalContent.data('paypalIsHideContinueButton', this.checked);
                $saveBillingAgreementWrap.toggle(this.checked);
                if ($useCustomerBillingAgreementCheckbox.length && this.checked) {
                    $useCustomerBillingAgreementCheckbox[0].checked = !this.checked;
                }
                if (this.checked) {
                    $emailContainer.hide();
                    $emailContainer.find('input').attr('disabled', 'disabled');
                } else {
                    $emailContainer.show();
                    $emailContainer.find('input').removeAttr('disabled');
                }
            });
        }

        if ($useCustomerBillingAgreementCheckbox.length) {
            $useCustomerBillingAgreementCheckbox[0].checked = $useCustomerBillingAgreementCheckbox.data('paypalChecked');
            $useCustomerBillingAgreementCheckbox.change(function () {
                $useAnotherAccountCheckboxWrap.toggle(!this.checked);
                $paypalButton.parent().toggle(!this.checked);
                continueButtonToggle(this.checked);
                $paypalContent.data('paypalIsHideContinueButton', !this.checked);
                if ($saveBillingAgreementCheckbox.length) {
                    $saveBillingAgreementCheckbox[0].checked = false;
                    $saveBillingAgreementWrap.toggle(!this.checked);
                }
                if (this.checked === false) {
                    $useAnotherAccountCheckbox.change();
                }
                if (this.checked) {
                    $emailContainer.hide();
                    $emailContainer.find('input').attr('disabled', 'disabled');
                } else {
                    $emailContainer.show();
                    $emailContainer.find('input').removeAttr('disabled');
                }
            });
            $useCustomerBillingAgreementCheckbox[0].checked = $paypalContent.find('.js_useCustomerFillingAgreementState').val();
            $useCustomerBillingAgreementCheckbox.change();
        }

        if ($saveBillingAgreementCheckbox.length) {
            $saveBillingAgreementCheckbox[0].checked = false;
        }

        var $form = $('#dwfrm_billing');

        config.payment = function (resolve, reject) {
            $errorContainer.hide();
            $.ajax({
                url: $form.attr('action'),
                method: 'POST',
                data: $form.serialize(),
                success: function (data) {
                    if (data.error) {
                        if (data.paypalProcessorResult && data.paypalProcessorResult.error) {
                            $errorContainer.text(data.paypalProcessorResult.error).show();
                        }
                        if (data.fieldErrors.length) {
                            $form.submit();
                        }
                        if (data.serverErrors.length) {
                            data.serverErrors.forEach(function (error) {
                                $('.error-message').show();
                                $('.error-message-text').text(error);
                            });
                        }
                        if (data.cartError) {
                            window.location.href = data.redirectUrl;
                        }
                        reject();
                    } else {
                        resolve(data.paypalProcessorResult.paypalToken);
                    }
                },
                error: function (err) {
                    if (err.responseJSON.redirectUrl) {
                        window.location.href = err.responseJSON.redirectUrl;
                    }
                }
            });
        };

        paypalUtils.initButton(config, $paypalButton[0]);
        $paypalButton.data('isInited', true);
    });

    $paymentOptionsTabs.on('shown.bs.tab', function (e) {
        $paymentOptionsTabs.each(function () {
            var $tabContent = $($(this).attr('href'));
            // if ($tabContent.hasClass('js_paypal-content')) {
            if (this === e.target) {
                $tabContent.find('input, textarea, select').removeAttr('disabled', 'disabled');
            } else {
                $tabContent.find('input, textarea, select').attr('disabled', 'disabled');
            }
            // }
        });
        var $currentTabContent = $($(e.target).attr('href'));
        if ($currentTabContent.find('.js_paypal_button_on_billing_form').length) {
            continueButtonToggle(!$currentTabContent.data('paypalIsHideContinueButton'));
        } else {
            continueButtonToggle(true);
        }
    });

    if ($('.js_paypal_fraudnet_data').length) {
        paypalUtils.initFraudnet();
    }
});
