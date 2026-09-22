'use strict';

/**
 * Markitplace affiliate checkout entrypoint for SFRA.
 *
 * ?items=<productId>:<qty>[,...]&mid=<uuid>[&coupon=<code>]
 *
 * Classic Controllers export (no require('server')). Fills the browser-session
 * basket, then redirects to the SFRA SEO cart URL.
 */

var BasketMgr = require('dw/order/BasketMgr');
var ProductMgr = require('dw/catalog/ProductMgr');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var HookMgr = require('dw/system/HookMgr');
var Logger = require('dw/system/Logger');

var log = Logger.getLogger('markitplace', 'MarkitplaceCheckout');

/**
 * @param {string} path e.g. '/cart'
 * @returns {string}
 */
function storefrontSeoUrl(path) {
    var siteId = Site.getCurrent().getID();
    var normalized = path && path.charAt(0) === '/' ? path : '/' + path;
    return 'https://' + request.httpHost + '/s/' + siteId + normalized;
}

/**
 * @param {dw.order.Basket} basket
 */
function clearBasket(basket) {
    var productLineItems = basket.getProductLineItems().toArray();
    productLineItems.forEach(function (pli) {
        basket.removeProductLineItem(pli);
    });

    var couponLineItems = basket.getCouponLineItems().toArray();
    couponLineItems.forEach(function (cli) {
        basket.removeCouponLineItem(cli);
    });
}

/**
 * @param {string} itemsParam
 * @returns {Array<{productId: string, quantity: number}>}
 */
function parseItems(itemsParam) {
    if (!itemsParam) {
        return [];
    }

    return String(itemsParam)
        .split(',')
        .map(function (pair) {
            var parts = pair.split(':');
            var productId = (parts[0] || '').trim();
            var quantity = parseInt(parts[1] || '1', 10);
            if (!productId || !(quantity > 0)) {
                return null;
            }
            return { productId: productId, quantity: quantity };
        })
        .filter(Boolean);
}

/**
 * @param {dw.order.Basket} basket
 * @param {string} productId
 * @param {number} quantity
 * @returns {boolean}
 */
function addProductToBasket(basket, productId, quantity) {
    var product = ProductMgr.getProduct(productId);
    if (!product || !product.online) {
        log.error('Product not found or offline: {0}', productId);
        return false;
    }

    if (product.isMaster() && product.variationModel) {
        var defaultVariant = product.variationModel.defaultVariant;
        if (defaultVariant && defaultVariant.online) {
            product = defaultVariant;
        } else {
            log.error('Master product {0} has no orderable default variant', productId);
            return false;
        }
    }

    var shipment = basket.defaultShipment;
    var pli = basket.createProductLineItem(product, null, shipment);
    if (!pli) {
        log.error('createProductLineItem failed for {0}', productId);
        return false;
    }
    pli.setQuantityValue(quantity);
    return true;
}

/**
 * Minimal error page when nothing could be added.
 * @param {string} message
 */
function writeErrorPage(message) {
    var cartUrl = storefrontSeoUrl('/cart');
    var homeUrl = storefrontSeoUrl('/');
    response.setContentType('text/html; charset=UTF-8');
    response.writer.print(
        '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Markitplace</title></head><body>' +
            '<h1>Could not update cart</h1><p>' +
            message +
            '</p><p><a href="' +
            cartUrl +
            '">Cart</a> · <a href="' +
            homeUrl +
            '">Home</a></p></body></html>'
    );
}

/**
 * Markitplace-Checkout
 */
function Checkout() {
    var params = request.httpParameterMap;
    var items = parseItems(params.items.submitted ? params.items.stringValue : null);
    var markitplaceId = params.mid.submitted ? params.mid.stringValue : null;
    var couponCode = params.coupon.submitted ? params.coupon.stringValue : null;

    if (!items.length) {
        log.warn('Markitplace-Checkout called without valid items');
        writeErrorPage('Missing or invalid <code>items</code> query parameter.');
        return;
    }

    var currentBasket = BasketMgr.getCurrentOrNewBasket();
    var addedCount = 0;

    Transaction.wrap(function () {
        clearBasket(currentBasket);

        items.forEach(function (item) {
            if (addProductToBasket(currentBasket, item.productId, item.quantity)) {
                addedCount += 1;
            }
        });

        if (couponCode) {
            try {
                currentBasket.createCouponLineItem(couponCode, true);
            } catch (e) {
                log.warn(
                    'Could not apply coupon {0}: {1}',
                    couponCode,
                    e.message || e
                );
            }
        }

        if (markitplaceId) {
            currentBasket.custom.markitplaceId = markitplaceId;
        }

        HookMgr.callHook('dw.order.calculate', 'calculate', currentBasket);
    });

    if (!addedCount) {
        writeErrorPage(
            'No orderable products were added. Check product ids and inventory.'
        );
        return;
    }

    log.info(
        'Markitplace-Checkout added {0} line(s), mid={1}',
        addedCount,
        markitplaceId || ''
    );

    // SFRA SEO cart — shopper continues to checkout from the storefront CTA
    response.redirect(storefrontSeoUrl('/cart'));
}

Checkout.public = true;

module.exports.Checkout = Checkout;
