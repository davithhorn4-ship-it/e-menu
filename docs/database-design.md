# E-Menu — Frontend feature review & database design

Source reviewed: `../core-system-next-ts-main` (package `qr-restaurant-admin`, Next.js 16), commit `ab852fa`.
The frontend runs on mock data (`USE_MOCK = true`); its `core/model.ts` files and the mock backend
`components/modules/order/core/server.ts` define what this API must store and enforce.

Status: **design only** — `prisma/schema.prisma` is not changed yet.

---

## 1. Frontend features (what the database must support)

| Area | Pages | What it does | Data it needs |
|---|---|---|---|
| Auth | `/auth/sign-in`, `/sign-up`, `/sign-up/verification`, `/forgot-password` | Email + password login, register with email OTP, password reset | users, sessions, one-time tokens |
| Roles | (everywhere) | `owner`, `branch_manager`, `cashier`, `kitchen` (+ platform `super_admin`); capability matrix in `constants/permissions.ts`; non-owners locked to their branches | shop membership + member branches |
| Shop profile | `/shop/profile` | Name km/en, logo, default language, base currency USD/KHR, show 2nd currency + exchange rate, tax %, service %, prices include tax | shops |
| Branches | `/shop/branches` | Name km/en, address, phone, opening hours per weekday, dine-in/takeaway/pickup, prep target, tax/service override, active | branches |
| Staff | `/shop/staff` | Invite by email/phone, one role, list of branches, active, "joined" | shop_members, shop_member_branches, user_tokens (invite) |
| Menu | `/menu`, `/menu/categories`, `/menu/products` (+new/[id]), `/menu/modifiers` | Categories; products with image, km/en text, base price, size variants, modifier groups, allergens, sort; modifier groups (required, min/max) with options (price delta); per-branch price / sold-out / hidden | categories, products, product_variants, modifier_groups, modifier_options, product_modifier_groups, branch_product_overrides |
| Menu publish | `/menu/publish` | Validate → publish an immutable numbered version; guests order from the latest | menu_versions (JSON snapshot) |
| Tables & QR | `/qr/tables`, `/qr/print` | Tables per branch (table QR or one branch/counter QR), area, seats, map position, random revocable token; print presets; extra QR cards (WiFi, Maps, Facebook, Telegram) | dining_tables, qr_links |
| Guest app | `/m/[token]`, `/cart`, `/order/[viewToken]` | Resolve token → branch + table + menu, cart, checkout pay now (KHQR) or pay later, live order tracking by view token, "Call staff" (help / bill / water, 30 s cooldown) | orders, order_items, payments, service_calls |
| Orders / table map | `/orders` | Live orders per table, ticket printing (first claim wins, reprint), collect cash / counter KHQR, clear when guests leave | orders, order_events, payments |
| POS | `/orders/new` | Staff order at counter/table → kitchen at once as UNPAID | orders (source = STAFF) |
| Order history | `/orders/all` | Search/filter all orders | orders (+ indexes) |
| Payments | `/payments`, `/payments/accounts` | Transactions, refunds; Bakong KHQR account per branch (write-only webhook secret, health) | payments, refunds, payment_events, payment_configs |
| Close shift | `/close-shift` | Z report: count USD + KHR notes, expected vs counted cash, bank expected vs reported, frozen record | shift_closes (+ orders.shift_close_id) |
| Reports | `/reports/sales`, `orders`, `payments`, `products`, `branches`, `closings` | All computed from paid orders, refunds and closes (revenue = paid − refunds) | no extra tables; indexes on orders/payments/refunds |
| Printing | (Orders page) | Per-branch thermal printer settings: 58/80 mm, auto print, copies, start preparing on print, ticket language | print_settings |
| Audit | (no page, still recorded) | Who did what: refunds, payment collected, QR regenerate, publish, sold out, staff role, order cleared, shift closed… | audit_logs |

### Business rules the database must make safe
1. **Server pricing.** Checkout sends only choices (`productId`, `variantId`, `optionIds`, `quantity`, `note`); the API prices them from the published menu + branch overrides (`menu/core/pricing.ts`). Service charge first, then tax on (subtotal + service), or tax included.
2. **Payment state ≠ kitchen state.** Two separate columns, never merged (`paymentStatus`, `kitchenStatus`). Staff see a short stage derived from both: Pending → Unpaid → Paid → Clear.
3. **One payment reference per checkout attempt**, with exact amount and 10-minute expiry. A retry creates a new attempt; old attempts stay.
4. **Callbacks:** verify signature → match reference + amount + currency → deduplicate by provider event id → in **one transaction** mark paid + release to kitchen + log the event.
5. **Refunds never edit the payment**; they are separate rows. `refunded_amount ≤ total`.
6. **Snapshots:** order lines copy names, variant, options and prices; a shift close freezes its totals.
7. **Ticket printing:** the first station to claim the ticket prints (`kitchen_printed_at` set once).
8. **Money** in integer minor units (USD cents, KHR riel). Revenue counts PAID orders only.

### Review findings (frontend ↔ API gaps)
| # | Finding | Impact | Recommendation |
|---|---|---|---|
| F1 | Frontend models use `_id`; this API returns `id` | Every screen breaks when mocks are switched off | Map `id → _id` in the frontend axios layer (one place), or agree on one name now |
| F2 | Frontend roles (`owner`, `branch_manager`, `cashier`, `kitchen`) ≠ API `Role` enum (`ADMIN`, `DEVELOPER`, `MANAGER`, `STAFF`) | Login works, permissions don't | Keep `users.role` for **platform** access; add `shop_members.role` (`ShopRole`) for restaurant roles |
| F3 | `orderNo` prefix is hard-coded in the mock (`branchId.includes("river") ? "B" : "A"`) | Wrong numbers with real branches | `branches.order_prefix` + an atomic per-branch counter |
| F4 | Menu versions are shop-wide; branch overrides apply instantly without publishing | Overrides must not live inside the snapshot | `branch_product_overrides` table, read live at checkout |
| F5 | Register / verify OTP / forgot password pages exist; the API has none of these endpoints | Sign-up can't work | `user_tokens` table + endpoints |
| F6 | One-row `app_settings` vs a SaaS with many shops (`super_admin`, "cross-tenant access fails safely") | Single tenant only | `shops` table as the tenant; every business row carries `shop_id` |
| F7 | Guest view token and QR token are bearer secrets in URLs | Leaked DB = trackable orders | Store `view_token_hash` (SHA-256); QR token stays plain (it is printed publicly) but long and random |
| F8 | Webhook secret is a constant in the mock | — | Store encrypted (`webhook_secret_enc`), return only `secret_last4` |
| F9 | `docs/mvp-plan.md` still says "plan only, nothing built" | Misleading | Update the doc |

---

## 2. Design decisions

| Decision | Choice | Why |
|---|---|---|
| Tenant | `shops` row = one restaurant business; all business tables have `shop_id` | SaaS, cross-tenant isolation, per-shop reporting |
| People | Global `users` (login) + `shop_members` (role in a shop) + `shop_member_branches` | Same person can work for a shop in several branches; platform admins keep `users.role` |
| IDs | `uuid` everywhere (matches existing tables) | Not guessable, safe in URLs |
| Money | `Int` minor units + `currency` enum (`USD`, `KHR`) | Frontend decision D5; no float errors |
| Percentages | `Decimal(5,2)` | 10.00 %, 2.50 % exact |
| Languages | `name` + `name_km` columns (and `description_km`) | The UI is fixed to km/en; simple and fast. Move to a translations table only if a 3rd language comes |
| Opening hours, cash count, menu snapshot | `jsonb` | Always read/written as a whole; validated by DTOs |
| Menu versions | Immutable JSON snapshot per publish; orders keep `menu_version_id` | Guests always order from one consistent menu; history is exact |
| Order timeline | `order_events` rows (append-only) | Audit-quality history; replaces the `timeline[]` array |
| Payment attempts | `payments` table (1 order → many attempts) | Retries, counter KHQR, cash; references unique |
| Deletes | `active` flags / `deleted_at` on things orders reference (branches, products, tables); `Restrict` FKs from orders | Past orders and reports never break |
| Counters | `branches.order_seq` / `close_seq` incremented with `UPDATE … RETURNING` | Gap-free per-branch numbers without races |

---

## 3. Entity-relationship diagrams

### 3.1 Overview (all tables)

```mermaid
erDiagram
    USERS ||--o{ REFRESH_SESSIONS : "signs in"
    USERS ||--o{ USER_TOKENS : "verify / reset / invite"
    USERS ||--o{ SHOP_MEMBERS : "works as"
    SHOPS ||--o{ SHOP_MEMBERS : employs
    SHOP_MEMBERS ||--o{ SHOP_MEMBER_BRANCHES : "assigned to"
    BRANCHES ||--o{ SHOP_MEMBER_BRANCHES : staffed

    SHOPS ||--o{ BRANCHES : has
    SHOPS ||--o{ CATEGORIES : has
    SHOPS ||--o{ PRODUCTS : sells
    SHOPS ||--o{ MODIFIER_GROUPS : defines
    SHOPS ||--o{ MENU_VERSIONS : publishes
    CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ PRODUCT_VARIANTS : "sizes"
    MODIFIER_GROUPS ||--o{ MODIFIER_OPTIONS : contains
    PRODUCTS ||--o{ PRODUCT_MODIFIER_GROUPS : uses
    MODIFIER_GROUPS ||--o{ PRODUCT_MODIFIER_GROUPS : "used by"
    BRANCHES ||--o{ BRANCH_PRODUCT_OVERRIDES : overrides
    PRODUCTS ||--o{ BRANCH_PRODUCT_OVERRIDES : "overridden"

    BRANCHES ||--o{ DINING_TABLES : has
    BRANCHES ||--o{ QR_LINKS : prints
    BRANCHES ||--o| PRINT_SETTINGS : configures
    BRANCHES ||--o| PAYMENT_CONFIGS : "KHQR account"

    BRANCHES ||--o{ ORDERS : receives
    DINING_TABLES |o--o{ ORDERS : "placed at"
    MENU_VERSIONS ||--o{ ORDERS : "priced from"
    ORDERS ||--|{ ORDER_ITEMS : contains
    ORDER_ITEMS ||--o{ ORDER_ITEM_OPTIONS : "chosen options"
    ORDERS ||--o{ ORDER_EVENTS : timeline
    ORDERS ||--|{ PAYMENTS : "payment attempts"
    PAYMENTS ||--o{ REFUNDS : "refunded by"
    PAYMENTS |o--o{ PAYMENT_EVENTS : "provider callbacks"

    BRANCHES ||--o{ SHIFT_CLOSES : closes
    SHIFT_CLOSES |o--o{ ORDERS : "includes"
    BRANCHES ||--o{ SERVICE_CALLS : receives
    DINING_TABLES ||--o{ SERVICE_CALLS : "called from"
    SHOPS ||--o{ AUDIT_LOGS : records
```

### 3.2 Tenant, people and access

```mermaid
erDiagram
    USERS {
        uuid id PK
        string full_name
        string email UK
        string phone
        string password_hash
        Role role "platform: ADMIN DEVELOPER MANAGER STAFF"
        bool is_active
        timestamptz email_verified_at "NEW"
        timestamptz password_changed_at
        timestamptz last_login_at
    }
    REFRESH_SESSIONS {
        uuid id PK
        uuid user_id FK
        string token_hash
        string previous_token_hash
        timestamptz expires_at
    }
    USER_TOKENS {
        uuid id PK
        uuid user_id FK
        UserTokenType type "EMAIL_VERIFY PASSWORD_RESET INVITE"
        string token_hash "OTP or link token, hashed"
        int attempts
        timestamptz expires_at
        timestamptz used_at
    }
    SHOPS {
        uuid id PK
        string name
        string name_km
        string logo_url
        Locale default_language "km en"
        Currency base_currency "USD KHR"
        bool show_second_currency
        int exchange_rate "riel per 1 USD"
        decimal tax_percent
        decimal service_percent
        bool prices_include_tax
        bool is_active
    }
    SHOP_MEMBERS {
        uuid id PK
        uuid shop_id FK
        uuid user_id FK
        ShopRole role "OWNER BRANCH_MANAGER CASHIER KITCHEN"
        bool is_active
        timestamptz invited_at
        timestamptz joined_at "null = invitation pending"
    }
    SHOP_MEMBER_BRANCHES {
        uuid member_id PK, FK
        uuid branch_id PK, FK
    }
    BRANCHES {
        uuid id PK
        uuid shop_id FK
        string name
        string name_km
        string address
        string phone
        jsonb opening_hours "7 x day open close closed"
        bool dine_in
        bool takeaway
        bool pickup
        int prep_target_minutes
        decimal tax_percent "null = shop default"
        decimal service_percent "null = shop default"
        string order_prefix "A, B ..."
        int order_seq "last order number"
        int close_seq "last Z number"
        bool is_active
        timestamptz deleted_at
    }

    USERS ||--o{ REFRESH_SESSIONS : has
    USERS ||--o{ USER_TOKENS : has
    USERS ||--o{ SHOP_MEMBERS : "is member"
    SHOPS ||--o{ SHOP_MEMBERS : has
    SHOPS ||--o{ BRANCHES : has
    SHOP_MEMBERS ||--o{ SHOP_MEMBER_BRANCHES : "works in"
    BRANCHES ||--o{ SHOP_MEMBER_BRANCHES : has
```

Constraints: `shop_members (shop_id, user_id)` unique; `branches (shop_id, order_prefix)` unique.
OWNER members ignore `shop_member_branches` (see every branch).

### 3.3 Menu

```mermaid
erDiagram
    CATEGORIES {
        uuid id PK
        uuid shop_id FK
        string name
        string name_km
        int sort_order
        bool is_active
    }
    PRODUCTS {
        uuid id PK
        uuid shop_id FK
        uuid category_id FK
        string name
        string name_km
        string description
        string description_km
        string image_url
        int base_price "minor units, used when no variants"
        string allergens
        int sort_order
        bool is_active
        timestamptz deleted_at
    }
    PRODUCT_VARIANTS {
        uuid id PK
        uuid product_id FK
        string name "Small, Large"
        string name_km
        int price "full price, minor units"
        int sort_order
        bool is_active
    }
    MODIFIER_GROUPS {
        uuid id PK
        uuid shop_id FK
        string name "Sugar level"
        string name_km
        bool required
        int min_select
        int max_select
    }
    MODIFIER_OPTIONS {
        uuid id PK
        uuid group_id FK
        string name "Less sugar"
        string name_km
        int price_delta "0 for free choices"
        int sort_order
        bool is_active
    }
    PRODUCT_MODIFIER_GROUPS {
        uuid product_id PK, FK
        uuid group_id PK, FK
        int sort_order
    }
    BRANCH_PRODUCT_OVERRIDES {
        uuid branch_id PK, FK
        uuid product_id PK, FK
        int price "null = product price"
        bool sold_out "instant, no publish"
        bool hidden "not sold at this branch"
    }
    MENU_VERSIONS {
        uuid id PK
        uuid shop_id FK
        int version "1, 2, 3 per shop"
        jsonb snapshot "categories, products, variants, groups"
        uuid published_by FK
        timestamptz published_at
    }

    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ PRODUCT_VARIANTS : has
    PRODUCTS ||--o{ PRODUCT_MODIFIER_GROUPS : uses
    MODIFIER_GROUPS ||--o{ PRODUCT_MODIFIER_GROUPS : "attached to"
    MODIFIER_GROUPS ||--|{ MODIFIER_OPTIONS : has
    PRODUCTS ||--o{ BRANCH_PRODUCT_OVERRIDES : "per branch"
```

Constraints: `menu_versions (shop_id, version)` unique; `categories → products` **Restrict** (can't delete a
category with products); `product → variants/overrides/product_modifier_groups` **Cascade**;
`CHECK (min_select <= max_select)`, `CHECK (base_price >= 0)`.

### 3.4 Orders, payments and refunds

```mermaid
erDiagram
    ORDERS {
        uuid id PK
        uuid shop_id FK
        uuid branch_id FK
        uuid table_id FK "null = counter without QR row"
        uuid menu_version_id FK
        uuid shift_close_id FK "set when a Z report closes it"
        uuid created_by FK "staff POS order, else null"
        string order_no "A-0042, unique per branch"
        string view_token_hash UK "guest tracking link"
        OrderSource source "GUEST STAFF"
        ServiceType service_type "DINE_IN TAKEAWAY"
        PayMode pay_mode "NOW LATER"
        string table_name "snapshot"
        string customer_name
        string note
        int subtotal
        int service
        int tax
        int total
        int refunded_amount
        Currency currency
        PaymentStatus payment_status "PENDING UNPAID PAID FAILED EXPIRED REFUNDED PART_REFUNDED"
        KitchenStatus kitchen_status "NOT_RELEASED RECEIVED PREPARING READY SERVED CANCELLED"
        timestamptz paid_at
        timestamptz kitchen_printed_at "first print claim"
        int print_count
        timestamptz cleared_at
        timestamptz created_at
    }
    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid product_id FK "null if product removed"
        uuid variant_id FK
        string name "snapshot"
        string name_km
        string variant_name
        string variant_name_km
        int unit_price
        int quantity
        int line_total
        string note
    }
    ORDER_ITEM_OPTIONS {
        uuid id PK
        uuid order_item_id FK
        uuid option_id FK "null if option removed"
        string name "snapshot"
        string name_km
        int price_delta
    }
    ORDER_EVENTS {
        uuid id PK
        uuid order_id FK
        OrderEventType type "CREATED PAID RECEIVED TICKET_PRINTED CLEARED REFUNDED ..."
        uuid actor_id FK "staff, null = guest or system"
        int amount
        string note
        timestamptz at
    }
    PAYMENTS {
        uuid id PK
        uuid order_id FK
        int attempt "1, 2, 3 per order"
        string reference UK "merchant reference"
        PaymentMethod method "KHQR CASH"
        PaymentAttemptStatus status "PENDING PAID FAILED EXPIRED CANCELLED"
        int amount
        Currency currency
        text khqr "KHQR payload"
        string khqr_md5 "Bakong lookup"
        timestamptz expires_at
        timestamptz paid_at
        string provider_event_id
        string bank_ref
        uuid collected_by FK "cash or counter KHQR"
    }
    REFUNDS {
        uuid id PK
        uuid order_id FK
        uuid payment_id FK
        int amount
        string reason
        uuid created_by FK
        timestamptz created_at
    }
    PAYMENT_EVENTS {
        uuid id PK
        uuid payment_id FK "null when reference unknown"
        string provider "BAKONG_KHQR"
        string event_id
        string reference
        int amount
        string currency
        CallbackResult result "PROCESSED DUPLICATE REJECTED"
        string reason "BAD_SIGNATURE AMOUNT_MISMATCH ..."
        jsonb raw_payload "secrets removed"
        timestamptz received_at
    }

    ORDERS ||--|{ ORDER_ITEMS : contains
    ORDER_ITEMS ||--o{ ORDER_ITEM_OPTIONS : has
    ORDERS ||--o{ ORDER_EVENTS : timeline
    ORDERS ||--|{ PAYMENTS : attempts
    ORDERS ||--o{ REFUNDS : has
    PAYMENTS ||--o{ REFUNDS : "paid back from"
    PAYMENTS |o--o{ PAYMENT_EVENTS : callbacks
```

Constraints and indexes:
- `orders (branch_id, order_no)` unique; `orders.view_token_hash` unique.
- `payments (order_id, attempt)` unique; `payments.reference` unique.
- **Exactly-once callbacks:** partial unique index (raw SQL in the migration — Prisma can't express it):
  `CREATE UNIQUE INDEX payment_events_processed_uq ON payment_events (provider, event_id) WHERE result = 'PROCESSED';`
- `CHECK (refunded_amount BETWEEN 0 AND total)`, `CHECK (quantity > 0)`, `CHECK (amount > 0)` on refunds.
- Indexes for the screens and reports: `orders (branch_id, created_at)`, `orders (branch_id, payment_status)`,
  `orders (branch_id, kitchen_status)`, `orders (shop_id, paid_at)`, `payments (status, expires_at)` (expiry job),
  `refunds (order_id)`, `refunds (created_at)`, `order_items (product_id)` (product report).
- FKs from orders to branches, tables, products, options: **Restrict / SetNull** — never cascade-delete history.
  Order children (`order_items`, `order_events`, `payments`) cascade only with their order.

### 3.5 Tables, QR, service calls, shifts, printing, payment accounts, audit

```mermaid
erDiagram
    DINING_TABLES {
        uuid id PK
        uuid branch_id FK
        QrKind kind "TABLE BRANCH"
        string name "T1, Counter"
        string area
        int seats
        int layout_col "table map"
        int layout_row
        string token UK "random, revocable, in the QR URL"
        timestamptz token_regenerated_at
        bool is_active
        timestamptz deleted_at
    }
    QR_LINKS {
        uuid id PK
        uuid branch_id FK
        QrLinkType type "WIFI MAP FACEBOOK TELEGRAM"
        string label
        string wifi_name
        string wifi_password "printed on the card anyway"
        string url
    }
    SERVICE_CALLS {
        uuid id PK
        uuid branch_id FK
        uuid table_id FK
        string table_name "snapshot"
        CallReason reason "HELP BILL WATER"
        CallStatus status "OPEN DONE"
        uuid handled_by FK
        timestamptz handled_at
        timestamptz created_at
    }
    SHIFT_CLOSES {
        uuid id PK
        uuid branch_id FK
        string close_no "Z-A-0003, unique per branch"
        timestamptz opened_at
        timestamptz closed_at
        uuid closed_by FK
        Currency currency
        int opening_cash
        int expected_cash
        int counted_cash
        int difference "counted - expected"
        jsonb cash_count "USD and KHR notes"
        int counted_usd
        int counted_khr
        int exchange_rate
        int bank_expected
        int bank_reported
        int bank_difference
        int paid_orders
        int gross
        int tax
        int service
        int cash_sales
        int khqr_sales
        int refunds
        int cash_refunds
        int net
        int collected
        int unpaid_orders
        int unpaid_total
        string note
    }
    PRINT_SETTINGS {
        uuid branch_id PK, FK
        int paper_width "58 or 80"
        bool auto_print
        int copies
        bool start_preparing_on_print
        TicketLanguage ticket_language "km en both"
    }
    PAYMENT_CONFIGS {
        uuid id PK
        uuid branch_id FK, UK
        string provider "BAKONG_KHQR"
        PaymentEnvironment environment "SANDBOX PRODUCTION"
        KhqrAccountType account_type "INDIVIDUAL MERCHANT"
        string bakong_account_id
        string merchant_id
        string acquiring_bank
        string account_name "max 25"
        string merchant_city "max 15"
        string webhook_secret_enc "encrypted, never returned"
        string secret_last4
        bool healthy
        string health_message
        timestamptz last_health_check_at
        timestamptz last_callback_at
    }
    AUDIT_LOGS {
        uuid id PK
        uuid shop_id FK
        uuid branch_id FK "null = shop-wide"
        uuid actor_id FK
        string actor_name "snapshot"
        AuditAction action "REFUND PAYMENT_COLLECTED ORDER_CLEARED SHIFT_CLOSED ..."
        string target "A-0042, T5 ..."
        string summary
        jsonb before
        jsonb after
        string request_id
        timestamptz created_at
    }

    DINING_TABLES ||--o{ SERVICE_CALLS : "called from"
```

Constraints: `dining_tables (branch_id, name)` unique among active rows; `shift_closes (branch_id, close_no)` unique;
`service_calls (table_id, status, created_at)` index (30-second cooldown check, open calls list);
`audit_logs (shop_id, created_at)` index; audit rows are insert-only.

---

## 4. Table list (32 tables: 5 existing + 27 new)

| Group | Tables |
|---|---|
| Existing (keep) | `users`, `refresh_sessions`, `permissions`, `role_permissions`, `app_settings` |
| Identity | `user_tokens` |
| Tenant & staff | `shops`, `shop_members`, `shop_member_branches`, `branches` |
| Menu | `categories`, `products`, `product_variants`, `modifier_groups`, `modifier_options`, `product_modifier_groups`, `branch_product_overrides`, `menu_versions` |
| Floor & QR | `dining_tables`, `qr_links`, `service_calls`, `print_settings` |
| Orders & money | `orders`, `order_items`, `order_item_options`, `order_events`, `payments`, `refunds`, `payment_events`, `payment_configs` |
| Operations | `shift_closes`, `audit_logs` |

`users.role` + `permissions/role_permissions` stay for **platform** staff (the people who run the SaaS).
Restaurant staff get their access from `shop_members.role`; the API maps `ShopRole` to the frontend's
capability matrix (`constants/permissions.ts`).

## 5. Suggested build order (migrations)
1. ✅ `shops`, `branches`, `shop_members`, `shop_member_branches`, `user_tokens` (+ `users.email_verified_at`)
   — migration `20261118031255_step1_shops_branches_staff` (includes CHECK constraints).
2. Menu tables + `menu_versions`.
3. `dining_tables`, `qr_links`, `print_settings`.
4. `orders`, `order_items`, `order_item_options`, `order_events`, `payments`, `refunds`, `payment_events`, `payment_configs` (+ the partial unique index).
5. `service_calls`, `shift_closes`, `audit_logs`.

Each step: `npx prisma migrate dev --create-only --name <step>` → review SQL → `npm run db:migrate`.
