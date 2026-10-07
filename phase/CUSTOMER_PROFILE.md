# CUSTOMER_PROFILE.md

## Mersalak --- Customer Profile System

### Status

Planned --- Phase 6

### Goal

Build a unified, restaurant-scoped customer profile that brings together
the existing Customer, Loyalty, Rewards, and Missions systems.

The profile must reuse the existing systems and must not create a second
customer or loyalty system.

------------------------------------------------------------------------

## 1. Core Principles

1.  Customer data is always restaurant-scoped.
2.  A customer may have different points, XP, level, rewards, and
    missions at different restaurants.
3.  Guest ordering remains available; registration is never required
    before ordering.
4.  Existing `customer_profiles` and `restaurant_customer_accounts`
    remain the customer source of truth.
5.  Existing order/customer linking must be reused.
6.  Frontend must never directly mutate points, XP, levels, rewards, or
    balances.
7.  Existing Phase 1--4 behavior must remain unchanged.
8.  Profile data should come from secure server-side/RPC data rather
    than frontend recalculation.

------------------------------------------------------------------------

## 2. Customer-Facing Profile

The profile should provide one place for:

-   Display name
-   Current loyalty level
-   XP total
-   Points balance
-   Progress toward next level
-   Completed orders count
-   Total spending
-   Missions summary
-   Rewards summary
-   Recent orders
-   Recent activity

Example:

``` text
Yazan
Gold

1,250 XP
430 Points

████████████░░ 82%
350 XP until VIP

12 Completed Orders
₪1,240 Total Spending

🎯 Missions    2 active
🎁 Rewards     3 available
📦 Orders      12
```

------------------------------------------------------------------------

## 3. Sections

### 3.1 Overview

Show:

-   Customer name
-   Level
-   XP
-   Points
-   Current-level progress
-   Next level
-   Orders count
-   Total spending
-   Quick access to Missions and Rewards

Do not calculate level rules in JavaScript.

### 3.2 Loyalty

Display:

-   Points balance
-   XP total
-   Current level
-   Next level
-   XP required for next level
-   Lifetime points earned

Reuse Phase 2 loyalty data/RPCs.

Do not create new points or XP columns.

### 3.3 Missions

Reuse Phase 4 Missions.

Display:

-   Active missions
-   Progress
-   Completed missions
-   Reward information
-   Mission status

Do not calculate mission progress in the profile frontend.

### 3.4 Rewards

Reuse Phase 3 Rewards.

Display:

-   Available rewards
-   Redeemed rewards
-   Expired rewards where appropriate
-   Redemption status

Do not create a second redemption flow.

### 3.5 Orders

Show restaurant-scoped customer order history.

Each order may show:

-   Date
-   Order identifier
-   Items
-   Total
-   Status
-   Loyalty earned, if available

Only orders linked to the current restaurant customer account should be
shown.

### 3.6 Activity

Show a concise chronological feed using existing data.

Possible events:

-   Completed order
-   Points earned
-   XP earned
-   Level up
-   Mission completed
-   Reward redeemed

Do not create duplicate ledger/event systems solely for the profile.

------------------------------------------------------------------------

## 4. Backend

First inspect existing RPCs and schema.

Only create a new read-only profile RPC if the existing RPCs cannot
provide the required data.

Recommended shape if needed:

``` text
get_customer_profile(
    p_restaurant_id uuid,
    p_order_id uuid
)
returns jsonb
```

The RPC must:

1.  Resolve the customer through the existing authorized order/customer
    mechanism.
2.  Verify restaurant isolation.
3.  Return only data belonging to that restaurant.
4.  Return a clear `linked` state when no customer is linked.
5.  Avoid exposing internal IDs unnecessarily.
6.  Perform sensitive aggregation server-side.

Suggested response:

``` json
{
  "linked": true,
  "customer": {
    "displayName": "Yazan",
    "points": 430,
    "xp": 1250,
    "level": {
      "name": "Gold",
      "minXp": 700,
      "nextLevel": "VIP",
      "nextLevelXp": 1500
    },
    "stats": {
      "orders": 12,
      "spending": 1240,
      "lifetimePoints": 520
    }
  },
  "missions": {
    "active": 2,
    "completed": 5
  },
  "rewards": {
    "available": 3,
    "redeemed": 4
  },
  "recentOrders": [],
  "recentActivity": []
}
```

The actual implementation must follow the live schema. Do not assume
columns that do not exist.

------------------------------------------------------------------------

## 5. Security

Required:

-   Current restaurant must match `p_restaurant_id`.
-   Customer account must belong to that restaurant.
-   Source order must belong to that restaurant.
-   No customer data from another restaurant may be returned.
-   Frontend must not submit `restaurant_customer_id` as authority.
-   Frontend must not request arbitrary customer accounts by ID.

The server derives customer identity from the existing customer/order
context.

------------------------------------------------------------------------

## 6. Admin Customer View

The Admin Dashboard should eventually provide:

``` text
Customer
├── Overview
├── Loyalty
├── Orders
├── Missions
├── Rewards
└── Activity
```

Admin can view:

-   Name
-   Phone when available and permitted
-   Customer creation date
-   Level
-   XP
-   Points
-   Lifetime points
-   Orders
-   Total spending
-   Missions
-   Rewards/redemptions
-   Activity

Manual loyalty adjustments continue through the existing secure admin
RPC.

No direct balance writes from the Admin UI.

------------------------------------------------------------------------

## 7. Performance

Avoid loading the entire customer history on every profile open.

Prefer:

-   One overview/profile RPC where appropriate
-   Limited recent orders
-   Limited recent activity
-   Pagination later if needed

Avoid N+1 frontend requests.

------------------------------------------------------------------------

## 8. Empty States

### No linked customer

``` text
لا يوجد حساب عميل مرتبط بهذا الطلب.
```

### No orders

``` text
لا توجد طلبات بعد.
```

### No missions

``` text
لا توجد مهام متاحة حاليًا.
```

### No rewards

``` text
لا توجد مكافآت متاحة حاليًا.
```

### No activity

``` text
لا يوجد نشاط حتى الآن.
```

------------------------------------------------------------------------

## 9. Error Handling

Profile loading must never break the ordering flow.

If profile loading fails:

-   Keep ordering functional.
-   Show a friendly error/empty state.
-   Log technical details only where appropriate.
-   Never expose raw SQL/RPC errors to customers.

------------------------------------------------------------------------

## 10. Compatibility

Must preserve:

-   Phase 1 Customer Foundation
-   Phase 2 Loyalty
-   Phase 3 Rewards
-   Phase 4 Missions
-   `20261007_auto_link_guest_orders.sql`
-   `20261008_link_order_from_remembered.sql`

Do not introduce duplicate:

-   Customer identity
-   Points system
-   XP system
-   Reward redemption system
-   Mission progress system

------------------------------------------------------------------------

## 11. Out of Scope

Do not implement in this phase:

-   Achievements
-   Referrals
-   Customer segmentation
-   Advanced analytics
-   Push notifications
-   Loyalty automation
-   AI customer intelligence

------------------------------------------------------------------------

## 12. Implementation Order

### Step 1 --- Read-only inspection

Inspect the existing schema and RPCs.

Do not modify anything.

### Step 2 --- Backend

Only add a profile RPC if required.

### Step 3 --- Customer UI

Integrate with the existing customer/loyalty interface.

### Step 4 --- Admin Customer View

Add customer detail access to the Admin Dashboard.

### Step 5 --- Validation

Test:

-   Linked customer
-   Unlinked guest
-   Restaurant isolation
-   Points
-   XP
-   Level
-   Missions
-   Rewards
-   Orders
-   Empty states

------------------------------------------------------------------------

## 13. Acceptance Criteria

-   [ ] Linked customer can open profile.
-   [ ] Correct restaurant-scoped points are shown.
-   [ ] Correct XP is shown.
-   [ ] Correct level is shown.
-   [ ] Level progress is correct.
-   [ ] Order count is correct.
-   [ ] Spending is correct.
-   [ ] Missions reuse the existing Missions system.
-   [ ] Rewards reuse the existing Rewards system.
-   [ ] Recent orders are shown.
-   [ ] Recent activity is shown where available.
-   [ ] Guest users can still order without registration.
-   [ ] Unlinked orders do not expose customer data.
-   [ ] Cross-restaurant access is blocked.
-   [ ] No frontend direct balance mutation exists.
-   [ ] Existing Phase 1--4 behavior remains intact.
-   [ ] No duplicate customer/loyalty/reward/mission system is
    introduced.

------------------------------------------------------------------------

## 14. Coding-Agent Constraint

Implement incrementally:

``` text
Read-only inspection
        ↓
Small backend change if required
        ↓
Validate
        ↓
Small UI change
        ↓
Validate
        ↓
Test
```

The first coding-agent task must only inspect the existing schema/RPCs
and determine whether a new `get_customer_profile` RPC is actually
necessary.

Do not redesign the entire project.
