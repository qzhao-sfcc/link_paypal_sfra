'use strict';

/* global empty customer */

var Transaction = require('dw/system/Transaction');

var prefs = require('~/cartridge/config/paypalPreferences');
var paypalApi = require('~/cartridge/scripts/paypal/paypalApi');

var accountHelper = {};

/**
 * Determines a unique address ID for an address to be save the given
 * address book. The function first checks the city as the candidate ID
 * or appends a counter to the city (if already used as address ID) and
 * checks the existence of the resulting ID candidate. If the resulting
 * ID is unique this ID is returned, if not the counter is incremented and
 * checked again.
 *
 * @param {string} city customer city
 * @param {dw.customer.AddressBook} addressBook customer address book
 * @returns {boolean} candidateID or null
 */
function determineUniqueAddressID(city, addressBook) {
    var counter = 0;
    var existingAddress = null;

    if (city === null || empty(city)) {
        return null;
    }

    var candidateID = city;

    while (existingAddress === null) {
        existingAddress = addressBook.getAddress(candidateID);
        if (existingAddress !== null) {
            counter++;
            candidateID = city + '-' + counter;
            existingAddress = null;
        } else {
            return candidateID;
        }
    }

    return null;
}

/**
 * Returns a possible equivalent address to the given order address from the
 * address book or null, if non equivalent address was found.
 *
 * @param {dw.customer.AddressBook} addressBook customer address book
 * @param {dw.order.OrderAddress} orderAddress order shipping address
 * @returns {dw.customer.CustomerAddress} customer address
 */
function getEquivalentAddress(addressBook, orderAddress) {
    var iterator = addressBook.addresses.iterator();
    var address = null;
    while (iterator.hasNext()) {
        address = iterator.next();
        if (address.isEquivalentAddress(orderAddress)) {
            return address;
        }
    }

    return null;
}

/**
 * Return Customer Billing Agreement Object for work with customer Billing Agreement Data which is related with customer
 *
 * @param {string} currencyCode - Currency Code
 * @returns {Object} Customer Billing Agreement Object
 */
accountHelper.getCustomerBillingAgreement = function (currencyCode) {
    var customerBillingAgreement = {
        hasAnyBillingAgreement: false,
        isCheckedUseCheckbox: true,
        currencyCode: currencyCode,
        savedData: {
            items: []
        },
        add: function (inpItem) {
            var item = inpItem;
            if (empty(item.email) || empty(item.id)) {
                return false;
            }
            if (!this.hasAnyBillingAgreement) {
                this.items = [];
            }
            for (var i = 0; i < this.items.length; i++) {
                if (this.items[i].id === item.id) {
                    return true;
                }
            }
            item.time = Date.now();
            this.items.push(item);
            this._commit();
            return true;
        },
        remove: function (billingAgreementId) {
            if (empty(billingAgreementId)) {
                return false;
            }
            this.items = this.items.filter(function (item) {
                return item.id !== billingAgreementId;
            });
            this._commit();
            return true;
        },
        getDefault: function () {
            if (this.items) {
                if (currencyCode) {
                    for (var i = 0; i < this.items.length; i++) {
                        if (this.items[i].currencyCode === this.currencyCode) {
                            return this.items[i];
                        }
                    }
                } else if (this.items[0]) {
                    return this.items[0];
                }
            }
            return {
                id: null,
                email: null,
                currencyCode: null
            };
        },
        removeAll: function () {
            this.items = [];
            this._commit();
        },
        setUseCheckboxState: function (state) {
            this.isCheckedUseCheckbox = !!state;
            this._commit();
        },
        getDefaultShippingAddress: function () {
            if (customer.profile) {
                var addressBook = customer.profile.addressBook;

                var iterator = addressBook.addresses.iterator();
                var address = null;
                while (iterator.hasNext()) {
                    address = iterator.next();
                    if (address.custom.paypalDefaultShippingAddressCurrencyCode === this.currencyCode) {
                        return address;
                    }
                }
            }
            return null;
        },
        _commit: function () {
            this.savedData.items = this.items || [];
            this.savedData.isCheckedUseCheckbox = this.isCheckedUseCheckbox;
            if (customer.profile) {
                var _savedData = this.savedData;
                if (this.savedData.items && this.savedData.items.length > 0) {
                    Transaction.wrap(function () {
                        customer.profile.custom.paypalBillingAgreementData = JSON.stringify(_savedData);
                    });
                    this.hasAnyBillingAgreement = true;
                } else {
                    Transaction.wrap(function () {
                        customer.profile.custom.paypalBillingAgreementData = null;
                    });
                    this.hasAnyBillingAgreement = false;
                }
            }
        }
    };
    if (!customer || customer.authenticated === false) {
        return customerBillingAgreement;
    }
    if (!customer.profile.custom.paypalBillingAgreementData) {
        return customerBillingAgreement;
    }
    try {
        customerBillingAgreement.savedData = JSON.parse(customer.profile.custom.paypalBillingAgreementData);
        customerBillingAgreement.items = customerBillingAgreement.savedData.items;
        customerBillingAgreement.isCheckedUseCheckbox = customerBillingAgreement.savedData.isCheckedUseCheckbox !== false;
        if (currencyCode) {
            for (var i = 0; i < customerBillingAgreement.items.length; i++) {
                if (customerBillingAgreement.items[i].currencyCode === customerBillingAgreement.currencyCode) {
                    customerBillingAgreement.hasAnyBillingAgreement = true;
                    break;
                }
            }
        } else if (customerBillingAgreement.items.length > 0) {
            customerBillingAgreement.hasAnyBillingAgreement = true;
        }
    } catch (error) {
        return customerBillingAgreement;
    }
    return customerBillingAgreement;
};

/**
 * Return Actual Billing Agreement data
 * @param {Object} basket - Basket
 * @returns {Object} null or object with billing agreement data
 */
accountHelper.getActualBillingAgreementData = function (basket) {
    if (!customer.authenticated) {
        return null;
    }
    var currencyCode = basket.getCurrencyCode();
    var customerBillingAgreement = accountHelper.getCustomerBillingAgreement(currencyCode);

    if (customerBillingAgreement.hasAnyBillingAgreement && prefs.PP_BillingAgreementState !== 'DoNotCreate') {
        var referenceId = customerBillingAgreement.getDefault().id;
        var response = paypalApi.baUpdate({
            referenceId: referenceId,
            currencyCode: currencyCode
        });
        if (response.error) {
            if (response.responseData) {
                var errorCodes = [10201, // Billing Agreement was cancelled
                    10204, // User's account is closed or restricted
                    10211, // Invalid billing agreement ID
                    11451]; // Billing Agreement Id or transaction Id is not valid

                if (errorCodes.indexOf(parseInt(response.responseData.l_errorcode0, 10)) >= 0) {
                    customerBillingAgreement.remove(referenceId);
                }
            }
            return null;
        }
        return response;
    }

    return null;
};

/**
 * Save shipping address as default address for future PayPal transaction through Billing Agreement
 *
 * @param {dw.order.LineItemCtnr} basket Order
 */
accountHelper.saveShippingAddressToAccountFromBasket = function (basket) {
    if (!customer.authenticated) {
        return;
    }

    Transaction.wrap(function () {
        var addressBook = customer.profile.addressBook;
        var usedAddress = basket.defaultShipment.shippingAddress;

        if (usedAddress === null) {
            return;
        }

        var address = getEquivalentAddress(addressBook, usedAddress);

        if (address === null) {
            var addressID = determineUniqueAddressID(usedAddress.city, addressBook);

            if (empty(addressID)) {
                return;
            }

            address = addressBook.createAddress(addressID);
            address.setFirstName(usedAddress.firstName);
            address.setLastName(usedAddress.lastName);
            address.setAddress1(usedAddress.address1);
            address.setAddress2(usedAddress.address2);
            address.setCity(usedAddress.city);
            address.setPostalCode(usedAddress.postalCode);
            address.setStateCode(usedAddress.stateCode);
            address.setCountryCode(usedAddress.countryCode.value);
        }

        address.setPhone(usedAddress.phone);

        var iterator = addressBook.addresses.iterator();
        var addressItem = null;
        while (iterator.hasNext()) {
            addressItem = iterator.next();
            addressItem.custom.paypalDefaultShippingAddressCurrencyCode = null;
        }

        address.custom.paypalDefaultShippingAddressCurrencyCode = basket.getCurrencyCode();
    });
};

module.exports = accountHelper;
