# Mersalak — Loyalty System (Phase 2)

> **Feature specification for Agent implementation**
>
> Phase 1 — Customer Foundation & Guest → Customer Conversion is complete and working.
>
> This document defines Phase 2: the loyalty engine, including points, XP, customer levels, and the foundation required for future rewards, missions, and achievements.
>
> **Critical:** Do not rebuild or modify the working Phase 1 customer/order conversion flow unless a change is strictly required.

---

# 1. Current State

Phase 1 is already working:

```text
QR
 ↓
Restaurant Menu
 ↓
Guest Order
 ↓
Order Success
 ↓
Create / Find Customer
 ↓
Link Order to Customer
```

The existing customer foundation must remain stable.

Phase 2 should build the loyalty engine on top of it.

---

# 2. Phase 2 Scope

Implement only:

1. Loyalty points.
2. Point transaction ledger.
3. XP.
4. Customer levels.
5. Level progression.
6. Automatic loyalty event processing.
7. Customer-facing loyalty summary.
8. Restaurant admin loyalty overview/settings foundation.

Do NOT implement the full Rewards, Missions, or Achievements systems yet.

Those will be later phases.

---

# 3. Important Product Decision

## Points and XP are separate concepts

Do NOT use one balance for both.

### Points

Points are a redeemable loyalty currency.

Example:

```text
Customer has 520 Points
```

Later:

```text
200 Points → Free Drink
```

Points can increase and decrease.

### XP

XP represents customer progression.

Example:

```text
Customer has 820 XP
Level: Gold
```

XP should normally represent progress and should not be spent when redeeming rewards.

Therefore:

```text
Points = Spendable loyalty currency
XP     = Progress / Level experience
```

---

# 4. Example Customer State

A customer could have:

```text
Name:
Ahmed Mohammed

Level:
Silver

XP:
420 / 700

Points:
280
```

Meaning:

- The customer has 280 redeemable points.
- The customer has 420 XP toward the next level.
- Redeeming points must NOT reduce XP.

---

# 5. Points Ledger

Do not rely only on a mutable `points_balance`.

Every point change must have a ledger record.

Example:

```text
+50  First registered order
+10  Order #1842
+5   Review
+20  Visit
-200 Reward redemption
```

The current balance can be derived from the ledger or safely maintained together with a ledger.

The ledger is the source of auditability.

---

# 6. Suggested Point Transaction Structure

The final table name must follow the existing project architecture, but conceptually each transaction should contain:

```text
id
restaurant_id
customer_id
amount
transaction_type
reason
reference_type
reference_id
created_at
metadata
```

Where:

### transaction_type

Examples:

```text
earn
redeem
adjustment
refund
expiration
```

### reference_type

Examples:

```text
order
review
visit
reward
manual
system
```

### reference_id

The related entity ID when applicable.

Examples:

```text
Order ID
Review ID
Reward ID
```

---

# 7. Idempotency

This is critical.

The same event must never award points twice.

Example:

```text
Order #1842 completed
        ↓
+10 Points
```

If the order completion event is processed again:

```text
Order #1842 completed
        ↓
NO additional +10
```

Use a unique event/reference strategy.

For example, a loyalty transaction associated with:

```text
restaurant_id
customer_id
transaction_type
reference_type
reference_id
```

must not accidentally create duplicate rewards for the same qualifying event.

The exact database constraint should be designed based on the existing schema.

---

# 8. Configurable Point Rules

Point values must NOT be hardcoded into the frontend.

Create restaurant-scoped configuration.

Example:

```text
first_registered_order = 50
order_completed = 10
visit = 20
review_order = 5
review_restaurant = 10
```

These are defaults/examples.

The restaurant manager should eventually be able to change them.

Store configuration in the database.

Do not put business rules only in JavaScript.

---

# 9. Order Points

The first core loyalty event should be a completed order.

Example:

```text
Order #1842
Total: $15

Customer:
Ahmed

Loyalty:
+10 Points
+10 XP
```

The exact default amount should be configurable.

Important:

- Only qualifying/completed orders should award loyalty.
- Do not award loyalty merely because an order was created.
- Cancelled/failed/uncompleted orders must not award normal order points.
- If an order is refunded, handle the adjustment according to the future refund policy.

---

# 10. First Registered Order Bonus

If the restaurant enables it:

```text
First registered order
+50 Points
```

This should only happen once per customer per restaurant.

Do not award it every time the customer logs in or reconnects an order.

The Phase 1 conversion order is eligible for this bonus if configured.

Use an idempotent event.

---

# 11. XP Rules

XP should also be configurable.

Example:

```text
Completed order → +10 XP
First order → +50 XP
Review → +5 XP
Visit → +20 XP
```

Do not assume Points = XP.

They may have different values.

Example:

```text
Order:
+10 Points
+25 XP
```

This should be possible.

---

# 12. Customer Levels

Levels are restaurant-scoped.

Example defaults:

```text
New Customer
0 XP

Regular
100 XP

Silver
300 XP

Gold
700 XP

VIP
1500 XP
```

These are examples only.

The database must support configurable levels.

Each level should have at least:

```text
id
restaurant_id
name
minimum_xp
sort_order
badge/icon
active
created_at
updated_at
```

---

# 13. Level Calculation

Level should be derived from the customer's XP and the restaurant's level configuration.

Example:

```text
0 XP    → New Customer
150 XP  → Regular
420 XP  → Silver
900 XP  → Gold
```

If the customer reaches a higher threshold:

```text
XP increases
   ↓
Level recalculated
   ↓
Customer profile updated
```

Do not manually hardcode:

```javascript
if (xp > 300) ...
```

in the frontend.

Level thresholds belong to restaurant configuration/data.

---

# 14. Level Progress

The customer UI should show progress toward the next level.

Example:

```text
Silver

420 XP

420 / 700 XP

██████████░░░░░░

280 XP until Gold
```

If the customer is at the highest level:

```text
VIP
Maximum Level
```

Do not show a misleading progress value beyond the maximum level.

---

# 15. Customer Menu/Profile UI

After login/account creation, the customer should be able to see a compact loyalty summary.

Example:

```text
👋 Ahmed

Gold
820 XP

██████████████░░
680 / 1000 XP

⭐ 540 Points
```

Then:

```text
View Rewards
View Missions
My Orders
My Activity
```

Rewards and Missions can remain placeholders/disabled until their phases are implemented.

Do not build their full functionality in Phase 2.

---

# 16. Customer Loyalty Activity

The customer should eventually be able to see why their points changed.

Example:

```text
+10  Completed order #1842
+50  Welcome bonus
+5   Order review

-200 Redeemed reward
```

For Phase 2, show earning transactions that already exist.

Redemption UI belongs to the future Rewards phase.

---

# 17. Restaurant Admin — Loyalty Overview

Add a basic loyalty section to the restaurant dashboard.

Suggested cards:

```text
Total Customers
Customers with Loyalty Activity
Total Points Issued
Total XP Earned
Customers by Level
```

Example:

```text
Customers
1,248

Points Issued
48,320

XP Earned
71,450
```

Do not build advanced retention analytics yet.

---

# 18. Restaurant Admin — Loyalty Settings

Provide the foundation for configuring:

## Point Rules

Example:

```text
Completed Order
[ 10 ] Points

[ 10 ] XP
```

## First Order Bonus

```text
Enabled [✓]

Points:
[ 50 ]
```

## Visit

```text
Enabled [✓]

Points:
[ 20 ]

XP:
[ 20 ]
```

## Review

```text
Enabled [✓]

Points:
[ 5 ]

XP:
[ 5 ]
```

The exact UI can follow the existing Mersalak Admin Dashboard design system.

---

# 19. Restaurant Admin — Levels

Allow the manager to view/manage levels.

Example:

| Level | Minimum XP |
|---|---:|
| New Customer | 0 |
| Regular | 100 |
| Silver | 300 |
| Gold | 700 |
| VIP | 1500 |

Support:

- Add
- Edit
- Activate/deactivate
- Reorder

Deletion must be handled safely.

Do not allow deleting a level in a way that leaves existing customers with invalid state.

---

# 20. Database / Security

Before adding tables or columns:

1. Inspect the Phase 1 schema.
2. Reuse the existing customer tables.
3. Reuse the existing restaurant relationship.
4. Reuse existing RLS patterns.
5. Reuse existing helper functions where appropriate.

All loyalty data must be restaurant-scoped.

Customers must never access another restaurant's:

- Points
- XP
- Levels
- Loyalty transactions
- Settings

Restaurant staff must only access loyalty data for authorized restaurants.

Do not weaken existing RLS.

---

# 21. Server-Side Business Logic

Loyalty calculations should happen server-side.

Do NOT trust:

```javascript
customer.points += 10;
```

from the browser.

The frontend may request an action, but the database/RPC/server layer must validate:

- Customer
- Restaurant
- Order
- Order status
- Eligibility
- Existing transaction
- Point rule
- XP rule

Then perform the transaction atomically.

---

# 22. Recommended Event Architecture

Build toward an event-driven loyalty model.

Conceptually:

```text
Order Completed
      ↓
Loyalty Event
      ↓
Check Rules
      ↓
Award Points
      ↓
Award XP
      ↓
Recalculate Level
      ↓
Create Ledger Entries
```

The implementation can use secure PostgreSQL functions/triggers/RPCs depending on the existing architecture.

Do not add unnecessary client-side polling.

---

# 23. Important Order Status Rule

Do not award order loyalty when the order is merely inserted.

The system must identify the existing order lifecycle and determine the correct status that represents a qualifying/completed order.

Inspect the current order statuses before implementing this.

Do not invent a new order status unless required.

---

# 24. Refund / Cancellation Foundation

Phase 2 does not need a complete refund engine.

However, the loyalty architecture must not make refunds impossible later.

The ledger should support negative adjustments.

Example:

```text
Original:
+10 Points

Refund:
-10 Points
```

Do not silently delete the original transaction.

Keep an audit trail.

---

# 25. Manual Adjustments

The database architecture should support future manager adjustments.

Example:

```text
Manager Adjustment

+100 Points

Reason:
"Customer service compensation"
```

Every manual adjustment must contain a reason and actor when possible.

Do not implement unrestricted client-side balance editing.

---

# 26. Data Integrity

Protect against:

- Duplicate point awards.
- Negative balances unless explicitly allowed.
- Cross-restaurant access.
- Invalid customer IDs.
- Invalid order references.
- Points awarded to cancelled orders.
- XP being reduced when points are redeemed.
- Level thresholds becoming inconsistent.
- Duplicate first-order bonuses.
- Race conditions from simultaneous requests.

Use database constraints, transactions, locks, and server-side validation where appropriate.

---

# 27. Phase 2 Implementation Order

Implement in this order:

## Step 1 — Schema

Add/reuse:

- Point configuration
- Point transaction ledger
- XP state if needed
- Level configuration

## Step 2 — Server Logic

Implement:

- Award points
- Award XP
- Idempotency
- Level calculation
- Restaurant authorization

## Step 3 — Order Integration

Connect qualifying completed orders to loyalty processing.

## Step 4 — Customer UI

Show:

- Points
- XP
- Level
- Progress
- Loyalty activity

## Step 5 — Admin UI

Show:

- Loyalty overview
- Point rules
- XP rules
- Levels

## Step 6 — Testing

Test all edge cases before moving to Rewards.

---

# 28. Testing Requirements

Test at minimum:

### New Customer

```text
Guest Order
↓
Create Account
↓
First-order bonus
↓
Points awarded once
↓
XP awarded once
↓
Correct level
```

### Existing Customer

```text
Existing Customer
↓
New Order
↓
Points awarded
↓
XP awarded
↓
No first-order bonus
```

### Duplicate Processing

```text
Same order event twice
↓
Only one loyalty transaction
```

### Cancellation

```text
Cancelled order
↓
No normal completed-order loyalty
```

### Restaurant Isolation

```text
Customer A / Restaurant A
cannot see
Customer B / Restaurant B
loyalty data
```

### Redemption Independence

When future rewards are implemented:

```text
Points decrease
XP remains unchanged
```

Phase 2 should already preserve this architecture.

### Level Progression

Test:

```text
99 XP
→ New Customer

100 XP
→ Regular

300 XP
→ Silver

700 XP
→ Gold
```

using configurable thresholds, not hardcoded frontend logic.

---

# 29. Definition of Done

Phase 2 is complete only when:

- [ ] Points are stored through an auditable ledger.
- [ ] XP is separate from points.
- [ ] Point rules are restaurant-configurable.
- [ ] XP rules are restaurant-configurable.
- [ ] Levels are restaurant-configurable.
- [ ] Level calculation works correctly.
- [ ] Completed orders can award loyalty.
- [ ] Duplicate order processing cannot award duplicate points.
- [ ] First-order bonus can only be awarded once.
- [ ] Cancelled/invalid orders do not receive normal completed-order points.
- [ ] Customer can view points.
- [ ] Customer can view XP.
- [ ] Customer can view level.
- [ ] Customer can view level progress.
- [ ] Customer can view loyalty activity.
- [ ] Admin can view basic loyalty statistics.
- [ ] Admin can configure point/XP rules.
- [ ] Admin can manage levels.
- [ ] RLS/restaurant isolation remains intact.
- [ ] Phase 1 guest ordering still works.
- [ ] Phase 1 guest → customer conversion still works.
- [ ] Existing order/table/QR functionality is not broken.
- [ ] Production build passes.
- [ ] Relevant SQL/RPC functions have been tested.

---

# 30. Explicitly Out of Scope for Phase 2

Do NOT implement the following yet:

- Full Rewards Store
- Reward redemption UI
- Coupon generation UI
- Missions
- Mission progress
- Achievements
- Referral program
- Customer-to-customer social features
- Advanced CRM
- Push notifications
- Marketing campaigns
- Complex retention analytics

These belong to later phases.

---

# 31. Agent Instructions

**Do not start coding blindly.**

First inspect the Phase 1 implementation and existing database.

Then report:

1. Existing customer tables.
2. Existing Phase 1 customer relationship.
3. Existing order status lifecycle.
4. Best point-awarding event.
5. Existing RLS patterns.
6. Proposed Phase 2 schema.
7. Proposed server-side loyalty flow.
8. Any conflicts with existing architecture.

Then implement Phase 2 incrementally.

Do not rewrite Phase 1.

Do not duplicate customer architecture.

Do not put loyalty business rules only in frontend JavaScript.

Do not weaken RLS.

Do not award points from the browser without server-side validation.

Do not move to Rewards/Missions/Achievements until the Phase 2 foundation is tested and stable.
