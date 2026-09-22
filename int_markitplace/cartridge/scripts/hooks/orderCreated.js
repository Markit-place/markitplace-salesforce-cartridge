'use strict';

/**
 * Notify Markitplace when an order is placed from a Markitplace checkout.
 *
 * Magento parity: dual-POST to staging + production public API. The env that
 * did not create the checkout soft-fails with "not found".
 *
 * Registered for:
 * - app.order.created (SFRA storefront — primary Markitplace path)
 * - dw.ocapi.shop.order.afterPOST (OCAPI / SCAPI order create)
 */

var HTTPClient = require('dw/net/HTTPClient');
var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');

var log = Logger.getLogger('markitplace', 'MarkitplacePurchase');

var PURCHASE_URLS = [
    'https://apiv2.markit.place/checkout/purchase'
];

var HTTP_TIMEOUT_MS = 10000;

/**
 * @param {dw.order.Order} order
 * @returns {string|null}
 */
function getMarkitplaceId(order) {
    if (!order || !order.custom) {
        return null;
    }
    var mid = order.custom.markitplaceId;
    if (!mid) {
        return null;
    }
    return String(mid);
}

/**
 * @returns {string}
 */
function getStoreDomain() {
    var host = Site.getCurrent().getHttpsHostName();
    if (!host) {
        host = Site.getCurrent().getHttpHostName();
    }
    return 'https://' + host;
}

/**
 * @param {dw.order.Order} order
 * @returns {Array<{sku: string, price: number, quantity: number}>}
 */
function buildPurchasedProducts(order) {
    var products = [];
    var lineItems = order.getProductLineItems().toArray();

    lineItems.forEach(function (pli) {
        if (pli.bundledProductLineItem) {
            return;
        }

        var sku = pli.getProductID();
        var quantity = pli.getQuantityValue();
        var price = 0;

        if (pli.adjustedPrice && pli.adjustedPrice.available) {
            price = pli.adjustedPrice.getValue();
        } else if (pli.price && pli.price.available) {
            price = pli.price.getValue();
        }

        products.push({
            sku: sku,
            price: price,
            quantity: quantity
        });
    });

    return products;
}

/**
 * @param {string} url
 * @param {string} body
 * @param {string} orderNo
 */
function postPurchase(url, body, orderNo) {
    try {
        var client = new HTTPClient();
        client.setTimeout(HTTP_TIMEOUT_MS);
        client.open('POST', url);
        client.setRequestHeader('Content-Type', 'application/json');
        client.send(body);

        log.info(
            'Markitplace purchase notify order={0} url={1} status={2} body={3}',
            orderNo,
            url,
            String(client.statusCode),
            client.text || ''
        );
    } catch (e) {
        log.error(
            'ERROR sending purchase to Markitplace order={0} url={1}: {2}',
            orderNo,
            url,
            e.message || e
        );
    }
}

/**
 * @param {dw.order.Order} order
 */
function notifyMarkitplace(order) {
    if (!order) {
        return;
    }

    var markitplaceId = getMarkitplaceId(order);
    if (!markitplaceId) {
        return;
    }

    var payload = {
        storeDomain: getStoreDomain(),
        externalCartId: markitplaceId,
        purchasedProducts: buildPurchasedProducts(order)
    };
    var body = JSON.stringify(payload);
    var orderNo = order.getOrderNo();

    log.info(
        'Notifying Markitplace purchase order={0} mid={1} products={2}',
        orderNo,
        markitplaceId,
        String(payload.purchasedProducts.length)
    );

    PURCHASE_URLS.forEach(function (url) {
        postPurchase(url, body, orderNo);
    });
}

/**
 * SFRA: HookMgr.callHook('app.order.created', 'created', order)
 * Triggered from int_markitplace checkoutHelpers.placeOrder override on older SFRA.
 * @param {dw.order.Order} order
 */
exports.created = function (order) {
    log.info(
        'app.order.created fired order={0} mid={1}',
        order ? order.getOrderNo() : '',
        order && order.custom && order.custom.markitplaceId
            ? String(order.custom.markitplaceId)
            : ''
    );
    notifyMarkitplace(order);
};

/**
 * OCAPI / SCAPI: dw.ocapi.shop.order.afterPOST
 * @param {dw.order.Order} order
 * @returns {dw.system.Status}
 */
exports.afterPOST = function (order) {
    notifyMarkitplace(order);
    return new Status(Status.OK);
};
