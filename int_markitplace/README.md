# int_markitplace

Thin Salesforce B2C Commerce cartridge for SFRA. Version **1.0.0**.

It does two things:

1. **Affiliate checkout** — `Markitplace-Checkout` adds the products from a Markitplace redirect to the shopper’s SFRA session cart.
2. **Purchase notification** — when that checkout becomes an order, the cartridge POSTs the sale to Markitplace.

Catalog and coupon sync do not use this cartridge. Those run through Commerce APIs configured with your Markitplace contact.

**Compatibility:** SFRA (`app_storefront_base` and `modules`). This cartridge does not run on SiteGenesis or on a composable storefront (Storefront Next / PWA Kit).

## Prerequisites

1. The site uses SFRA controllers.
2. You can log in to Business Manager and deploy code, edit the cartridge path, and create system-object attributes.
3. You have this `int_markitplace` folder (this repository, or the versioned zip from a GitHub Release).

## 1. Upload into an existing SFRA code version

Upload `int_markitplace` into the **same code version** that already contains your live SFRA cartridges (`app_storefront_base`, `modules`, and any custom storefront cartridges).

The instance must end up with:

```text
Cartridges/{codeVersion}/int_markitplace/package.json
Cartridges/{codeVersion}/int_markitplace/hooks.json
Cartridges/{codeVersion}/int_markitplace/README.md
Cartridges/{codeVersion}/int_markitplace/cartridge/controllers/Markitplace.js
Cartridges/{codeVersion}/int_markitplace/cartridge/scripts/checkout/checkoutHelpers.js
Cartridges/{codeVersion}/int_markitplace/cartridge/scripts/hooks/orderCreated.js
```

If you create an empty code version, upload only this cartridge, and activate it, the storefront breaks with `Pipeline not found (Cart|Checkout)`. SFRA controllers are missing from the active version. That is not a Markitplace defect.

### WebDAV

1. Business Manager → **Administration → Site Development → Development Setup**.
2. Copy the Cartridges WebDAV URL, or build it:

```text
https://{host}/on/demandware.servlet/webdav/Sites/Cartridges/{codeVersion}/
```

3. Connect with Cyberduck, Transmit, WinSCP, or macOS Finder (**Go → Connect to Server…**) using your Business Manager username and password.
4. Copy the entire `int_markitplace` folder into `{codeVersion}/`.

Upload the folder as a sibling of `app_storefront_base`. Do not upload only `Markitplace.js` at the code-version root, and do not nest a second `int_markitplace` folder inside itself.

### sfcc-ci (optional)

From the directory that contains the `int_markitplace` folder (the root of this repository):

```bash
sfcc-ci client:auth

sfcc-ci cartridge:push int_markitplace \
  -i {host} \
  -c int_markitplace \
  --codeversion {codeVersion}
```

Flags vary by `sfcc-ci` version. The remote path must still be:

```text
Sites/Cartridges/{codeVersion}/int_markitplace/
```

### Verify

Business Manager → **Administration → Site Development → Code Deployment** → open the code version → confirm `int_markitplace/cartridge/controllers/Markitplace.js` is present.

## 2. Add the cartridge to the site path

1. Business Manager → **Administration → Sites → Manage Sites**.
2. Open the site Markitplace will use.
3. **Settings** → **Cartridges**.
4. Prepend `int_markitplace:` so it appears **before** `app_storefront_base`.

```text
Before:
  app_custom_storefront:app_storefront_base

After:
  int_markitplace:app_custom_storefront:app_storefront_base
```

That order matters. `checkoutHelpers.js` in this cartridge wraps SFRA `placeOrder` and fires the purchase-notify hook. If `app_storefront_base` comes first, the override does not run.

Save. Repeat only for other sites that will accept Markitplace checkouts.

## 3. Create the `markitplaceId` attribute

Checkout stamps a correlation id on the basket. The purchase hook reads that id from the order.

1. Business Manager → **Administration → Site Development → System Object Types**.
2. Edit **Basket** → **Attribute Definitions → New**.
   - ID: `markitplaceId` (API name `c_markitplaceId`)
   - Display name: `Markitplace Id`
   - Type: **String**
3. Edit **Order** and create the same attribute.
4. On **Order** → **Attribute Grouping**, add `markitplaceId` to a group (create one named `Markitplace` if you need a new group) so the value shows on order details.
5. Save and replicate if your instance asks you to.

## 4. Activate the code version

1. Business Manager → **Administration → Site Development → Code Deployment**.
2. Activate the version you uploaded into. Activate an already-active version again so the server reloads cartridges.
3. Wait 10–30 seconds.

Activate a new version only after SFRA and your custom cartridges are in that same version.

## 5. Smoke test

Use the classic controller URL. Replace `{host}`, `{siteId}`, and `{locale}` (`default` or `en_US`).

```text
https://{host}/on/demandware.store/Sites-{siteId}-Site/{locale}/Markitplace-Checkout?items={productId}:1&mid=test-123
```

Expected: redirect to the SFRA cart with that product in the basket.

Do not use `https://{host}/s/{siteId}/Markitplace-Checkout` unless you add a Business Manager SEO alias for it. Without the alias, SFCC returns `Pipeline not found (RedirectURL)`.

Query parameters:

| Param | Required | Example |
| --- | --- | --- |
| `items` | yes | `701642854784M:1` or `pid1:1,pid2:2` |
| `mid` | yes | Correlation id from Markitplace |
| `coupon` | no | `SAVE10` |

Invalid coupons are logged and ignored. Products still go to the cart. Existing cart lines are cleared so the redirect is deterministic.

## Purchase notification

When an order has `order.custom.markitplaceId`, the cartridge POSTs JSON to:

```text
https://apiv2.markit.place/checkout/purchase
```

```json
{
  "storeDomain": "https://{storefront-https-host}",
  "externalCartId": "<markitplaceId>",
  "purchasedProducts": [
    { "sku": "701642854784M", "price": 19.99, "quantity": 1 }
  ]
}
```

`storeDomain` comes from the site HTTPS host and must match the storefront domain you gave Markitplace. The payload is the store domain, the correlation id, and line items (SKU, price, quantity). Orders without `markitplaceId` are skipped. HTTP errors are logged and do not block checkout.

Hooks:

| Extension point | Export | When |
| --- | --- | --- |
| `app.order.created` | `created` | SFRA place-order, via the `checkoutHelpers` override |
| `dw.ocapi.shop.order.afterPOST` | `afterPOST` | OCAPI / SCAPI order create |

If callouts fail on certificates, import the Markitplace API certificate in Business Manager → **Administration → Operations → Private Keys and Certificates**.

After a test order, open it in Business Manager (**Merchant Tools → Ordering → Orders**) and confirm **Markitplace Id** is set. Logs use the `markitplace` / `MarkitplacePurchase` category.

## If the storefront shows “Pipeline not found”

`Pipeline not found (Cart|Checkout)` means the active code version does not contain SFRA controllers.

1. Business Manager → **Administration → Site Development → Code Deployment**.
2. Open the **Active** version.
3. Confirm `app_storefront_base`, `modules`, and `int_markitplace` are all present.
4. If only `int_markitplace` is there, activate the previous SFRA code version and upload this cartridge into that version.
5. Confirm the site cartridge path still lists `int_markitplace` before `app_storefront_base`.

These storefront URLs should load before you retest checkout:

```text
https://{host}/on/demandware.store/Sites-{siteId}-Site/{locale}/Home-Show
https://{host}/on/demandware.store/Sites-{siteId}-Site/{locale}/Cart-Show
https://{host}/s/{siteId}/
https://{host}/s/{siteId}/cart
```

## Support

Send your Markitplace contact:

1. The exact URL you tested
2. The storefront or HTTP error text
3. SFCC log lines for `markitplace`, `MarkitplaceCheckout`, or `MarkitplacePurchase`
4. The active code version contents and the site cartridge path
