# Mersalak — Customer Experience & Loyalty System

> **Feature specification for Agent implementation**
>
> This document defines the Customer Experience, Customer Accounts, Loyalty, Rewards, Missions, Reviews, and Customer Analytics layer for Mersalak.
>
> **Critical:** This feature must be added on top of the existing restaurant/menu/order system. Do not rebuild or break the existing ordering flow.

---

## 1. Objective

Add a customer experience layer to the restaurant QR Menu.

The customer should be able to:

1. Scan a table QR code.
2. Open the restaurant menu as a guest.
3. Browse the menu and place an order without creating an account.
4. After successfully placing an order, optionally create a customer account.
5. Link the completed/current order to the newly created customer account.
6. Earn points, progress through levels, complete missions, and redeem rewards.
7. View their own orders, points, rewards, missions, achievements, and reviews.

The restaurant manager should be able to manage and monitor the entire customer experience from the restaurant dashboard.

---

# 2. Core UX Principle

## Guest ordering must remain possible

Do **NOT** force customers to create an account before ordering.

The primary flow must remain:

```text
Scan QR
   ↓
Open Menu
   ↓
Browse
   ↓
Add items
   ↓
Checkout / Send Order
   ↓
Order created
   ↓
Order success
   ↓
Optional: Create Customer Account
```

Customer registration is an optional post-order conversion step.

---

# 3. Post-Order Account Conversion

After a successful guest order, show an optional CTA.

Example:

```text
🎉 Keep your order history & earn rewards

Create your account at [Restaurant Name]

• Save your orders
• Earn loyalty points
• Unlock new levels
• Get discounts and rewards
• Track your progress

🎁 Bonus:
+50 points for your first registered order

[ Create Account ]

[ Maybe Later ]
```

The customer must be able to dismiss this without affecting the order.

---

# 4. Account Creation

Keep registration simple.

Initial required fields:

- Name
- Phone number

Use the project's existing authentication architecture where possible.

Do not introduce a second authentication system if one already exists.

After successful registration:

```text
Guest Customer
      ↓
Create / identify Customer
      ↓
Link current order
      ↓
Apply eligible loyalty points
      ↓
Show customer profile / success state
```

---

# 5. Existing Customer Detection

If the phone number already belongs to a customer account:

- Do not create a duplicate customer.
- Offer login/verification using the existing authentication flow.
- Link the current guest order to the authenticated customer after successful verification.

Customer identity must be unique within the appropriate restaurant/customer architecture.

---

# 6. Customer Profile

Each customer should have a profile within the restaurant context.

Suggested profile:

```text
Customer Name
Level: Silver
XP: 320 / 500
Points: 240

Orders: 12
Visits: 8
```

Sections:

- My Orders
- My Points
- Rewards
- Missions
- Achievements
- Favorites
- My Reviews

The customer experience must be mobile-first.

---

# 7. Restaurant Isolation

This is a SaaS system.

Customer loyalty data must be isolated by restaurant.

The same person can have different loyalty states in different restaurants.

Example:

```text
Customer: Ahmed

Restaurant A
Level: Gold
XP: 850
Points: 420

Restaurant B
Level: New Customer
XP: 80
Points: 30
```

Do not share restaurant-specific points, levels, missions, rewards, or reviews between restaurants.

Every restaurant-owned record must be correctly scoped to the restaurant.

---

# 8. Loyalty Points

Build a configurable points system.

Example rules:

| Action | Example Points |
|---|---:|
| First registered order | +50 |
| Order | +10 |
| Visit | +20 |
| Spending | +1 per $1 |
| Review order | +5 |
| Review restaurant | +10 |
| Referral | +50 |

These values are examples only.

They must NOT be hardcoded as permanent business rules.

The restaurant manager should eventually be able to configure them.

---

# 9. Points Ledger

Do not only store a customer's current point balance.

Maintain a transaction/ledger history.

Each point transaction should have information such as:

- Customer
- Restaurant
- Amount
- Type
- Reason
- Related order, if applicable
- Related reward, if applicable
- Created at

Example:

```text
+50  First registered order
+10  Order #1842
+5   Order review
-200 Reward redemption
```

This makes the system auditable and prevents balance inconsistencies.

---

# 10. Customer Levels

Implement configurable levels.

Example:

```text
New Customer
0–99 XP

Regular
100–299 XP

Silver
300–699 XP

Gold
700–1499 XP

VIP
1500+ XP
```

These are examples.

The restaurant should eventually be able to configure:

- Level name
- Minimum XP
- Badge/icon
- Benefits
- Active/inactive

Use XP/progress separately from redeemable points if that makes the architecture cleaner.

---

# 11. Missions

Add a mission system.

Example:

### Mission: Visit 3 times

```text
Progress
2 / 3

Reward
+100 Points
```

Other examples:

- Order 3 times this month.
- Try 3 different menu items.
- Review 5 orders.
- Visit during a specific period.
- Order from a specific category.
- Spend a certain amount.

Mission definitions should be data-driven.

The restaurant manager should eventually be able to create, edit, activate, deactivate, and schedule missions.

Suggested fields:

- Name
- Description
- Mission type
- Target
- Progress rule
- Reward
- Start date
- End date
- Active status
- Restaurant ID

---

# 12. Rewards

Create a rewards system.

Examples:

```text
Free Drink
200 Points

10% Discount
400 Points

Free Meal
800 Points
```

A reward should support:

- Name
- Description
- Points required
- Reward type
- Value
- Expiration
- Usage limit
- Active/inactive
- Restaurant ID

When a customer redeems a reward:

1. Validate balance.
2. Deduct/redeem points.
3. Create redemption record.
4. Generate a redemption/coupon code if required.
5. Track status.
6. Prevent duplicate use.
7. Allow restaurant staff to verify/redeem it.

---

# 13. Reward Redemption

Recommended lifecycle:

```text
Available
   ↓
Redeemed
   ↓
Unused
   ↓
Used / Expired
```

A redemption should be traceable to:

- Customer
- Restaurant
- Reward
- Points transaction
- Redemption code
- Created timestamp
- Used timestamp
- Staff/user who redeemed it, if available

---

# 14. Customer Reviews

Customers should be able to review completed orders.

Possible review structure:

```text
Overall:
⭐⭐⭐⭐⭐

Comment:
"Great food and fast service."
```

Reviews should be linked to:

- Customer
- Restaurant
- Order
- Optional order items
- Rating
- Comment
- Created timestamp

A customer should not be able to submit multiple reviews for the same order unless the existing product requirements explicitly support editing/review updates.

---

# 15. Restaurant → Customer Data

The restaurant can maintain internal customer activity/reliability information.

Examples:

- Completed orders
- Cancelled orders
- No-show orders
- Order history
- Customer activity
- Total visits
- Total spending

Avoid exposing an embarrassing or punitive public rating to the customer.

Do not create a public-facing "customer score" that could negatively label customers.

---

# 16. Customer Dashboard

Add a Customer Experience section to the restaurant admin dashboard.

Suggested overview cards:

```text
Total Customers
New Customers
Active Customers
Returning Customers
VIP Customers
```

Additional metrics:

- Customer retention
- Repeat order rate
- Average customer spend
- Average visits
- Points issued
- Points redeemed
- Rewards redeemed
- Mission completion
- Average restaurant rating

---

# 17. Restaurant Admin — Customer List

The manager should be able to browse customers.

Suggested columns:

- Customer name
- Phone
- Level
- XP
- Points
- Orders
- Visits
- Total spend
- Last activity
- Status

Provide search and useful filters.

Possible filters:

- Level
- Active/inactive
- New customers
- VIP
- High spending
- Returning customers

---

# 18. Restaurant Admin — Customer Details

When opening a customer:

```text
Ahmed Mohammed

Level: Gold
XP: 820
Points: 540
Orders: 43
Visits: 27
Total Spend: $XXX
```

Tabs/sections:

### Orders
Customer order history.

### Reviews
Reviews submitted by the customer.

### Points
Points balance and ledger.

### Rewards
Rewards earned/redeemed/used/expired.

### Missions
Current and completed missions.

### Activity
Customer activity timeline.

---

# 19. Loyalty Settings

Restaurant managers should eventually have a configuration area.

## Levels

- Add
- Edit
- Delete
- Activate/deactivate

## Points

Configure points awarded for actions.

## Rewards

Create and manage rewards.

## Missions

Create and manage missions.

The system should be configurable per restaurant.

---

# 20. Analytics

The system should eventually provide analytics such as:

### Customer Growth

```text
New customers over time
```

### Retention

```text
First-time customers
Returning customers
Repeat order rate
```

### Loyalty

```text
Points issued
Points redeemed
Rewards redeemed
Mission completion
```

### Customer Value

```text
Average order value
Average spend
Orders per customer
Visits per customer
```

Analytics should use actual database data and respect restaurant isolation.

---

# 21. QR / Table Context

The existing QR/table flow is critical.

When a customer scans a table QR:

```text
QR
 ↓
Restaurant
 ↓
Table
 ↓
Menu
 ↓
Order
```

Customer account information should be added without breaking this relationship.

The order should continue to retain:

- Restaurant
- Table
- Order data
- Existing guest/session information

When a guest becomes a registered customer, link the order to the customer without losing the existing table/order information.

---

# 22. Guest → Customer Conversion

This is one of the most important requirements.

Example:

```text
Guest

Order #1842
Restaurant A
Table 12

        ↓

Customer registration

        ↓

Customer #1042

        ↓

Order #1842 linked to Customer #1042
```

The order must not be duplicated.

The customer must not lose their order history.

Eligible loyalty rewards/points should be calculated exactly once.

---

# 23. Duplicate Protection

The implementation must protect against:

- Duplicate customer records
- Duplicate point awards
- Duplicate reward redemption
- Duplicate review submissions
- Repeated post-order conversion requests
- Double-clicking registration/redeem buttons
- Reprocessing the same order event

Use unique constraints/idempotency where appropriate.

---

# 24. Security / RLS

Before implementation, inspect the current Supabase/database security model.

Every customer/loyalty table must respect restaurant isolation.

Customers must not be able to access another restaurant's:

- Customers
- Orders
- Points
- Rewards
- Missions
- Reviews
- Analytics

Restaurant staff must only access data belonging to restaurants they are authorized to manage.

Do not bypass RLS simply to make the feature work.

If a SECURITY DEFINER function is necessary, use it carefully with:

- Explicit authorization checks
- Fixed search_path
- Minimal privileges
- No unrestricted access

---

# 25. Database Design

Before creating tables, inspect the existing schema.

Do not create duplicate versions of concepts that already exist.

Potential entities may include:

```text
customers
customer_restaurants
customer_points
customer_point_transactions
customer_levels
customer_rewards
customer_reward_redemptions
customer_missions
customer_mission_progress
customer_achievements
customer_reviews
```

These are suggestions, not mandatory table names.

The final schema must be based on the existing project architecture.

---

# 26. Technical Discovery — REQUIRED BEFORE CODING

Before making changes, inspect:

1. Existing menu architecture.
2. Existing order architecture.
3. Restaurant table/schema.
4. Table/QR architecture.
5. Existing authentication.
6. Existing users/profile tables.
7. Existing employee/staff authorization.
8. Existing RLS policies.
9. Existing restaurant isolation.
10. Existing Supabase functions/triggers.
11. Existing frontend routing.
12. Existing local/session storage if used.
13. Existing order completion/success screen.
14. Existing customer-related functionality.

Do not assume any of these structures.

Read the actual project first.

---

# 27. Implementation Strategy

Do not implement the entire feature in one uncontrolled change.

Use phases.

## Phase 1 — Foundation

Implement:

- Customer model/profile
- Restaurant ↔ Customer relationship
- Guest → Customer conversion
- Existing order ↔ customer linking

Validate this completely before continuing.

## Phase 2 — Loyalty

Implement:

- Points
- Point ledger
- Levels
- XP/progress

## Phase 3 — Rewards

Implement:

- Rewards
- Redemption
- Coupon/redeem codes
- Staff verification

## Phase 4 — Gamification

Implement:

- Missions
- Mission progress
- Achievements

## Phase 5 — Reviews

Implement:

- Order reviews
- Restaurant reviews
- Review management

## Phase 6 — Admin

Implement:

- Customer list
- Customer details
- Loyalty settings
- Rewards management
- Mission management

## Phase 7 — Analytics

Implement:

- Customer analytics
- Retention
- Repeat orders
- Loyalty analytics

---

# 28. Agent Workflow

The Agent MUST follow this workflow:

### Step 1 — Inspect

Analyze the existing project and database.

### Step 2 — Report

Before making major changes, report:

- What already exists.
- What can be reused.
- What is missing.
- Proposed schema.
- Proposed frontend flow.
- Potential conflicts.
- RLS/security considerations.

### Step 3 — Implement Foundation

Start with Phase 1 only.

### Step 4 — Test

Test:

- Guest order
- Account creation
- Existing account
- Guest order linking
- Restaurant isolation
- Duplicate prevention
- RLS

### Step 5 — Continue

Only after the foundation is stable, proceed to the next phases.

---

# 29. Do Not Break Existing Functionality

This feature must NOT break:

- QR Menu
- Restaurant menu
- Table identification
- Cart
- Order creation
- Order status
- Kitchen
- Admin dashboard
- Existing authentication
- Existing restaurant isolation
- Existing RLS
- Existing Supabase functions

Prefer additive changes.

Do not rewrite existing systems unnecessarily.

---

# 30. UX Direction

The overall experience should feel like:

```text
QR Menu
    ↓
Order
    ↓
🎉 Earn rewards
    ↓
Create account
    ↓
Customer Profile
    ↓
Points
    ↓
Level
    ↓
Missions
    ↓
Rewards
    ↓
Return to restaurant
```

The goal is to turn the restaurant QR menu from a simple ordering interface into a long-term **Customer Experience & Loyalty Platform**.

---

# 31. Important Product Principle

The customer should never feel forced into the loyalty system.

The ordering experience comes first.

Loyalty should feel like an optional benefit:

> "You already ordered. Would you like to keep your history and earn rewards?"

not:

> "Create an account before you can order."

---

# 32. Definition of Done — Foundation

Phase 1 is complete only when:

- [ ] Guest can still place an order.
- [ ] Customer can create an account after ordering.
- [ ] Customer account is associated with the correct restaurant.
- [ ] Current guest order can be linked to the customer.
- [ ] Existing customer detection works.
- [ ] Duplicate customers are prevented.
- [ ] Restaurant isolation works.
- [ ] RLS is correctly enforced.
- [ ] Existing QR/menu/order functionality still works.
- [ ] No duplicate order is created during conversion.
- [ ] UI works correctly on mobile.
- [ ] Error states are handled.
- [ ] Loading states are handled.
- [ ] Double submission is prevented.

---

# 33. Final Instruction to Agent

**Do not start by blindly implementing every feature in this document.**

First inspect the existing codebase and database.

Then produce a concise technical assessment and implementation plan.

Start with **Phase 1 — Customer Foundation & Guest → Customer Conversion**.

Do not modify unrelated functionality.

Do not introduce duplicate architecture.

Reuse existing authentication, restaurant, order, QR, and security infrastructure whenever possible.

After Phase 1 is implemented and verified, continue incrementally through the remaining phases.
