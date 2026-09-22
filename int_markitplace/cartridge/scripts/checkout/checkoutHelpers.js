'use strict';

/**
 * Thin override of SFRA checkoutHelpers.
 *
 * Older RefArch / app_storefront_base builds place the order without calling
 * HookMgr.callHook('app.order.created', ...). Without that call, hooks.json
 * registrations never run for storefront checkout.
 *
 * We re-export the base helpers and wrap placeOrder to fire app.order.created
 * after a successful place (same signature newer SFRA uses).
 *
 * Requires cartridge path: int_markitplace:app_storefront_base
 */

var HookMgr = require('dw/system/HookMgr');
var Logger = require('dw/system/Logger');

var base = require('app_storefront_base/cartridge/scripts/checkout/checkoutHelpers');
var log = Logger.getLogger('markitplace', 'MarkitplacePurchase');

/**
 * @param {dw.order.Order} order
 * @param {Object} fraudDetectionStatus
 * @returns {Object}
 */
function placeOrder(order, fraudDetectionStatus) {
    var result = base.placeOrder(order, fraudDetectionStatus);

    if (!result.error && order) {
        try {
            if (HookMgr.hasHook('app.order.created')) {
                HookMgr.callHook('app.order.created', 'created', order);
            } else {
                log.warn(
                    'app.order.created hook not registered; Markitplace purchase notify skipped for order {0}',
                    order.getOrderNo()
                );
            }
        } catch (e) {
            // Never fail storefront place-order because of notify
            log.error(
                'Error calling app.order.created for order {0}: {1}',
                order.getOrderNo(),
                e.message || e
            );
        }
    }

    return result;
}

var exported = {};
var key;
for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
        exported[key] = base[key];
    }
}
exported.placeOrder = placeOrder;

module.exports = exported;
