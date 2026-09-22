# int_markitplace — SFRA affiliate checkout + purchase notify

Thin SFRA cartridge used by catalog-manager for:

1. **Checkout** — `Markitplace-Checkout` so products land in the browser session
   basket (what SFRA checkout actually reads)
2. **Purchase notify** — order hook dual-POSTs to Markitplace
   `POST /checkout/purchase` (staging + production), Magento parity

## Why this exists

SCAPI baskets created on the Nest backend belong to a SLAS guest identity.
SFRA `Checkout-Begin` uses `BasketMgr.getCurrentBasket()` for the shopper’s
`dwsid` cookie. Those are different sessions, so `?basketId=` on `/checkout`
always shows an empty cart. OCAPI `/sessions` bridging from the backend also
cannot set cookies on the shopper’s browser.

## CRITICAL: “Pipeline not found (Cart|Checkout)” on `/s/RefArch/cart`

That error means **SFRA Controllers are not loading**. SFCC looks for controller
`Cart` / `Checkout`, does not find them, then looks for a **pipeline** with the
same name and fails ([SFRA controller path behavior](https://developer.salesforce.com/docs/commerce/sfra/guide/b2c-sfra-features-and-comps.html)).

This is **not** a Markitplace bug. It almost always means the **active code
version** lost `app_storefront_base` and/or `modules` (common if you created a
new empty code version and uploaded only `int_markitplace`, then activated it).

### Restore SFRA (do this first)

1. BM → **Administration → Site Development → Code Deployment**
2. Click the version marked **Active**
3. Confirm you see **all** of:
   - `app_storefront_base` (SFRA storefront Controllers: `Cart.js`, `Checkout.js`, …)
   - `modules` (provides `require('server')` for SFRA)
   - `int_markitplace` (this cartridge)
4. If the active version **only** lists `int_markitplace` (or is missing SFRA):
   1. Find the earlier version from the SFRA Site Import (often `version1`)
   2. Click **Activate** on that SFRA version
   3. Upload `int_markitplace` **into that same version** (WebDAV path above)
   4. Activate again to reload
5. BM → **Administration → Sites → Manage Sites → RefArch → Settings**
   - Cartridges path must include SFRA, e.g.:

     ```text
     int_markitplace:app_storefront_base
     ```

6. Verify SFRA is healthy (these must **not** show Pipeline not found):

   ```text
   https://{host}/on/demandware.store/Sites-RefArch-Site/default/Home-Show
   https://{host}/on/demandware.store/Sites-RefArch-Site/default/Cart-Show
   https://{host}/s/RefArch/
   https://{host}/s/RefArch/cart
   ```

7. Then retry Markitplace-Checkout. After a successful add, open `/s/RefArch/cart`
   (or use the link on the HTML result page).

If Home-Show / Cart-Show are still broken after activating the SFRA code version,
re-import **Storefront Reference Architecture Demo Sites** (BM → Site Import &
Export) into this sandbox, then re-add `int_markitplace` to that code version.

## Endpoint

`GET Markitplace-Checkout`

Query params:

| Param | Required | Example |
| --- | --- | --- |
| `items` | yes | `701642854784M:1` or `pid1:1,pid2:2` |
| `mid` | yes (for order correlation) | UUID from catalog-manager |
| `coupon` | no | `SAVE10` |

Example URL from catalog-manager (classic controller URL — use this, not `/s/...`):

```text
https://{host}/on/demandware.store/Sites-RefArch-Site/default/Markitplace-Checkout?items=701642854784M%3A1&mid=<uuid>
```

> **Do not use** `https://{host}/s/RefArch/Markitplace-Checkout?...` unless you
> added a BM SEO / URL alias for it. Without that alias SFCC fails with:
> `Pipeline not found (RedirectURL) for current domain (Sites-RefArch-Site)`.

## Deploy to the On-Demand Sandbox (exact steps)

Local cartridge path (this folder):

```text
catalog-manager/src/salesforce/cartridge/int_markitplace/
```

Remote layout that must exist on the sandbox (under an active or soon-to-be-active code version):

```text
Cartridges/{codeVersion}/int_markitplace/package.json
Cartridges/{codeVersion}/int_markitplace/hooks.json
Cartridges/{codeVersion}/int_markitplace/cartridge/controllers/Markitplace.js
Cartridges/{codeVersion}/int_markitplace/cartridge/scripts/checkout/checkoutHelpers.js
Cartridges/{codeVersion}/int_markitplace/cartridge/scripts/hooks/orderCreated.js
```

Replace `{host}` with your sandbox host, e.g.
`zyvr-001.dx.commercecloud.salesforce.com`.

---

### 0. Prerequisites

1. Sandbox is **started** and you can open Business Manager:

   ```text
   https://{host}/on/demandware.store/Sites-Site
   ```

2. SFRA demo data is imported (`RefArch` site exists).
3. You have a Business Manager user that can change code versions and site settings
   (Business Manager Administrator is enough).

---

### 1. Create (or pick) a code version in Business Manager

1. Log in to Business Manager.
2. Go to **Administration → Site Development → Code Deployment**.
3. Note the version marked **Active** (often something like `version1` after SFRA import).
4. Either:
   - **Reuse the active version** (simplest for a demo sandbox), or
   - Click **Add**, name it e.g. `markitplace`, leave it inactive for now.

You will upload into that version’s folder name exactly as shown in the UI
(case-sensitive).

---

### 2. Upload the cartridge via WebDAV (recommended for this repo)

Business Manager uses WebDAV for cartridge files. Auth = your **BM username + password**.

#### 2a. Get the WebDAV URL

1. In BM: **Administration → Site Development → Development Setup**.
2. Open the **WebDAV** / **Cartridges** section and copy the cartridges base URL, or build it:

   ```text
   https://{host}/on/demandware.servlet/webdav/Sites/Cartridges/{codeVersion}/
   ```

   Example:

   ```text
   https://zyvr-001.dx.commercecloud.salesforce.com/on/demandware.servlet/webdav/Sites/Cartridges/version1/
   ```

#### 2b. Connect with a WebDAV client

Use **Cyberduck**, **Transmit**, **WinSCP**, or macOS Finder:

| Field | Value |
| --- | --- |
| Protocol | WebDAV (HTTPS) |
| Server | `{host}` |
| Port | `443` |
| Path | `/on/demandware.servlet/webdav/Sites/Cartridges/{codeVersion}/` |
| Username | Business Manager login (email) |
| Password | Business Manager password |

**macOS Finder:**

1. Finder → **Go → Connect to Server…** (`⌘K`)
2. Enter:

   ```text
   https://{host}/on/demandware.servlet/webdav/Sites/Cartridges/{codeVersion}/
   ```

3. Connect with BM credentials.

#### 2c. Copy the cartridge folder

From your machine, upload the **entire** `int_markitplace` directory so the server has:

```text
{codeVersion}/
  app_storefront_base/    ← must already exist (SFRA import)
  modules/                ← must already exist (SFRA import)
  int_markitplace/
    package.json
    cartridge/
      controllers/
        Markitplace.js
```

**Important:** upload `int_markitplace` into the **same code version** that already
has SFRA (`app_storefront_base`, `modules`, etc.). If you create a brand-new empty
code version and put only this cartridge there, storefront checkout will break.

Do **not** upload only `Markitplace.js` at the code-version root.
Do **not** nest an extra `int_markitplace` folder inside itself.

Overwrite if the folder already exists.

#### 2d. Verify in Business Manager

1. **Administration → Site Development → Code Deployment**.
2. Open your code version.
3. Confirm you see resource `int_markitplace/cartridge/controllers/Markitplace.js`
   (or browse WebDAV and confirm the same path).

---

### 3. (Optional) Upload with `sfcc-ci` instead of a GUI client

If you already use Salesforce Commerce Cloud CI:

```bash
# From catalog-manager repo root
cd src/salesforce/cartridge

# Authenticate once (BM user or AM client — depends on your sfcc-ci setup)
sfcc-ci client:auth

# Deploy this cartridge into a named code version on the instance
sfcc-ci cartridge:push int_markitplace \
  -i {host} \
  -c int_markitplace \
  --codeversion {codeVersion}
```

Exact flags vary slightly by `sfcc-ci` version; if `cartridge:push` is unavailable,
use your team’s usual `code:deploy` / WebDAV zip flow, still targeting:

```text
Sites/Cartridges/{codeVersion}/int_markitplace/
```

---

### 4. Add the cartridge to the RefArch site path

1. BM → **Administration → Sites → Manage Sites**.
2. Click **RefArch**.
3. Open the **Settings** tab.
4. In **Cartridges**, prepend `int_markitplace:` to the existing path.

   Example before:

   ```text
   app_storefront_base
   ```

   Example after:

   ```text
   int_markitplace:app_storefront_base
   ```

   If SFRA already has a longer path (locales, plugins, etc.), keep those and only
   insert `int_markitplace` **before** `app_storefront_base`:

   ```text
   int_markitplace:app_storefront_base:...
   ```

5. Click **Apply** / **Save**.

Repeat for **RefArchGlobal** only if you also use that site for checkout.

---

### 5. Activate / reload the code version

1. BM → **Administration → Site Development → Code Deployment**.
2. If you uploaded into a **new** inactive version: click **Activate** on that version.
3. If you uploaded into the **already active** version: click **Activate** again on it
   (or toggle to another version and back) so the server reloads cartridges.

Wait ~10–30 seconds after activation.

---

### 6. Create the `markitplaceId` custom attribute (once per sandbox)

Needed so the controller can stamp the basket for order correlation.

1. BM → **Administration → Site Development → System Object Types**.
2. Edit **Basket**:
   - **Attribute Definitions** → **New**
   - ID: `markitplaceId` (API / order payload: `c_markitplaceId`)
   - Display name: `Markitplace Id`
   - Type: **String**
   - Save
3. Edit **Order** the same way (`markitplaceId` String) so the value survives
   order placement for the purchase notify hook.
4. Save / replicate within the sandbox as prompted.

---

### 7. Smoke test checkout

Open (incognito is fine) — **classic controller URL**:

```text
https://{host}/on/demandware.store/Sites-RefArch-Site/default/Markitplace-Checkout?items=701642854784M:1&mid=test-123
```

If `default` 404s, try `en_US` instead (and set `storefrontLocale: "en_US"` in
store `platformApi`).

Expected:

1. Redirect to SFRA **cart** (`/s/RefArch/cart`) with the product(s) in the basket.
2. Use the storefront **Checkout** button to continue.
3. If you land on an error HTML page: bad/missing `items`, or product offline.
4. If cart shows **Pipeline not found**: see **CRITICAL** section above (SFRA code version).
5. If cart opens but is **empty**: product id wrong, or `markitplaceId` attribute
   missing caused a transaction issue — check BM custom attribute + error log.

Then run catalog-manager `StoreCheckout`; the returned URL should look like:

```text
https://{host}/on/demandware.store/Sites-RefArch-Site/default/Markitplace-Checkout?items=...&mid=<uuid>
```

---

### 8. Purchase notify (dual POST)

On order create, if `order.custom.markitplaceId` is set, the hook POSTs the
same payload Magento sends to **both**:

- `https://apiv2-staging.markit.place/checkout/purchase`
- `https://apiv2.markit.place/checkout/purchase`

**SFRA trigger:** many RefArch / `app_storefront_base` builds never call
`HookMgr.callHook('app.order.created', ...)`. This cartridge overrides
`cartridge/scripts/checkout/checkoutHelpers.js` (thin wrap of base `placeOrder`)
to fire that hook after a successful place. Keep `int_markitplace` **before**
`app_storefront_base` on the cartridge path so the override is used.

Hooks registered:

| Extension point | Export | When |
| --- | --- | --- |
| `app.order.created` | `created` | SFRA storefront place-order (via our helpers override) |
| `dw.ocapi.shop.order.afterPOST` | `afterPOST` | OCAPI / SCAPI order create |

Payload:

```json
{
  "storeDomain": "https://{site-https-host}",
  "externalCartId": "<markitplaceId / mid>",
  "purchasedProducts": [
    { "sku": "701642854784M", "price": 19.99, "quantity": 1 }
  ]
}
```

`storeDomain` is built from `Site.getCurrent().getHttpsHostName()` and **must**
match `stores.domain` in catalog-manager.

Non-Markitplace orders (no `markitplaceId`) are skipped. HTTP errors are logged
and swallowed so storefront checkout is not blocked.

#### TLS / certificates

If callouts fail with certificate errors, import the Markitplace API server
certificates into the SFCC customer keystore:

BM → **Administration → Operations → Private Keys and Certificates**

#### Smoke: purchase after order

1. `StoreCheckout` from staging (or prod) → note `mid`
2. Complete the RefArch order
3. SFCC logs (`markitplace` / `MarkitplacePurchase`) should show dual POST status codes
4. Only the Markitplace env that created the checkout updates purchased products;
   the other soft-fails with not-found (expected)

---

## Notes

- Existing cart lines are cleared so the Markitplace redirect is deterministic.
- Invalid coupons are logged and ignored; products still go to checkout.
- Purchase notify requires `markitplaceId` on Basket **and** Order so `mid`
  survives onto the order the hook reads.
- Prefer uploading into a dedicated code version in shared sandboxes so you can roll back
  by reactivating the previous version.
