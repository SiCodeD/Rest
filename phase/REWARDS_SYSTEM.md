# Mersalak — Rewards System (Phase 3)

> **Feature specification for Agent implementation**
>
> Phase 1 — Customer Foundation is complete.
> Phase 2 — Loyalty Points, XP, Levels, and Admin Point Adjustments is complete.
>
> This document defines Phase 3: the Rewards system.
>
> **Critical:** Rewards must use the existing Phase 2 points ledger and loyalty architecture. Do not create a second points/balance system.

---

# 1. Goal

Allow restaurants to create rewards that customers can redeem using loyalty points.

The basic flow:

```text
Customer earns points
      ↓
Customer opens Rewards
      ↓
Sees available rewards
      ↓
Chooses a reward
      ↓
Confirms redemption
      ↓
Points are deducted
      ↓
Reward redemption is created
      ↓
Unique redemption code is generated
      ↓
Customer presents code to restaurant
      ↓
Staff verifies code
      ↓
Reward becomes USED
```

---

# 2. Important Product Rule

The existing Phase 2 points system is the source of truth.

Do NOT:

- Create another points balance.
- Create another points table.
- Modify `points_balance` directly from the browser.
- Deduct points without creating a ledger transaction.

A reward redemption must create a proper negative points transaction.

Example:

```text
Before:
540 Points

Redeem:
Free Drink — 200 Points

Ledger:
-200 Points
Reason: Reward redemption

After:
340 Points
```

XP must NOT decrease.

```text
XP before: 820
XP after: 820
```

---

# 3. Reward Model

Rewards are restaurant-scoped.

Suggested conceptual fields:

```text
id
restaurant_id
name
description
reward_type
value
points_cost
image_url
active
starts_at
expires_at
usage_limit
per_customer_limit
created_at
updated_at
```

The exact schema must follow the existing project conventions.

---

# 4. Reward Types

The system should support extensible reward types.

Initial types can include:

### Free Item

Example:

```text
Free Drink
```

### Percentage Discount

Example:

```text
10% Discount
```

### Fixed Discount

Example:

```text
5 USD Discount
```

### Free Meal / Product

Example:

```text
Free Burger
```

The database should store a structured reward type rather than hardcoding individual reward behavior into the UI.

---

# 5. Admin — Create Reward

Restaurant managers need a Rewards section in the Admin Dashboard.

Button:

```text
+ إضافة مكافأة
```

Form:

```text
اسم المكافأة
[ مشروب مجاني ]

الوصف
[ احصل على مشروب مجاني ]

نوع المكافأة
[ منتج مجاني ▼ ]

قيمة المكافأة
[ ... ]

تكلفة النقاط
[ 200 ]

تاريخ البداية
[ ... ]

تاريخ الانتهاء
[ ... ]

عدد الاستخدامات الكلي
[ ... ]

الحد لكل عميل
[ ... ]

الحالة
[ فعال ✓ ]

[ حفظ المكافأة ]
```

Only include fields that are relevant to the selected reward type.

---

# 6. Reward List — Admin

Display rewards in the Admin Dashboard.

Example:

| Reward | Type | Cost | Status | Redemptions |
|---|---|---:|---|---:|
| Free Drink | Free Item | 200 | Active | 34 |
| 10% Discount | Percentage | 500 | Active | 18 |
| Free Meal | Free Item | 800 | Inactive | 5 |

Actions:

- Edit
- Activate/deactivate
- View redemptions
- Delete/archive where safe

Do not physically delete rewards that already have redemption history unless the database design safely supports it.

Prefer deactivation/archive.

---

# 7. Reward Availability

A reward should only be redeemable when:

```text
active = true
```

and:

```text
current time >= starts_at
```

if a start date exists.

And:

```text
current time <= expires_at
```

if an expiration exists.

And:

```text
global usage limit not exceeded
```

if configured.

And:

```text
customer usage limit not exceeded
```

if configured.

And:

```text
customer has enough points
```

---

# 8. Customer Rewards Page

Replace the Phase 2 placeholder:

```text
المكافآت (قريبًا)
```

with:

```text
🎁 المكافآت
```

Customer sees available rewards.

Example card:

```text
🥤

مشروب مجاني

احصل على مشروب مجاني من اختيارك

200 ⭐

رصيدك:
540 ⭐

[ استبدال ]
```

If the customer cannot afford it:

```text
200 ⭐
الرصيد غير كافٍ
```

Disable redemption.

---

# 9. Reward Confirmation

Before redeeming:

```text
استبدال المكافأة

🥤 مشروب مجاني

تكلفة المكافأة:
200 نقطة

رصيدك الحالي:
540 نقطة

الرصيد بعد الاستبدال:
340 نقطة

هل تريد المتابعة؟

[ تأكيد الاستبدال ]
[ إلغاء ]
```

The final redemption must be performed server-side.

---

# 10. Atomic Redemption

Redemption must be atomic.

The server/database must:

1. Lock/check the customer reward state.
2. Verify the reward is active and available.
3. Verify customer belongs to the restaurant.
4. Verify sufficient points.
5. Verify usage limits.
6. Deduct points through the existing ledger.
7. Create redemption record.
8. Generate unique redemption code.
9. Commit everything as one transaction.

If any step fails:

```text
No points deducted
No redemption created
```

This prevents:

- Double redemption
- Negative balances
- Race conditions
- Points deducted without reward
- Reward created without points deduction

---

# 11. Redemption Record

Conceptually:

```text
id
restaurant_id
customer_id
reward_id
points_cost
redemption_code
status
expires_at
redeemed_at
redeemed_by
created_at
```

Status:

```text
active
used
expired
cancelled
```

---

# 12. Redemption Code

Each redemption receives a unique code.

Example:

```text
MSL-7K29-XP
```

Requirements:

- Unique.
- Hard to guess.
- Not based only on customer ID.
- Case-insensitive if appropriate.
- Server-generated.
- Cannot be reused after redemption.

The code belongs to the redemption, not directly to the reward.

---

# 13. Customer Reward Details

After redemption:

```text
🎉 تمت عملية الاستبدال

مشروب مجاني

-200 نقطة

رمز المكافأة

MSL-7K29-XP

الحالة:
صالحة

صالحة حتى:
15 أكتوبر 2026

[ عرض الكود ]
```

Customer should be able to access their active/previous redemptions.

Suggested sections:

```text
المكافآت المتاحة
مكافآتي
```

---

# 14. Customer — My Rewards

Show:

### Active

```text
🥤 مشروب مجاني
MSL-7K29-XP
صالحة
```

### Used

```text
🍔 وجبة مجانية
MSL-AB21-KD
تم الاستخدام
```

### Expired

```text
10% خصم
MSL-92KD-PL
منتهية
```

---

# 15. Staff Redemption Verification

Restaurant staff must have a way to verify a reward code.

The implementation should reuse the existing staff/admin architecture.

Possible interface:

```text
التحقق من المكافأة

[ MSL-7K29-XP ]

[ تحقق ]
```

If valid:

```text
✅ المكافأة صالحة

العميل:
Yazan

المكافأة:
مشروب مجاني

الحالة:
صالحة

تنتهي:
15 أكتوبر 2026

[ استخدام المكافأة ]
```

If invalid:

```text
❌ الرمز غير صالح
```

---

# 16. Redemption Validation

When staff presses "Use Reward", server-side validation must verify:

- Code exists.
- Code belongs to the current restaurant.
- Status is active.
- Not expired.
- Not already used.
- Reward is still valid according to the redemption rules.

Then:

```text
status = used
redeemed_at = now()
redeemed_by = current staff/admin
```

This operation must be atomic.

Two employees attempting to use the same code at the same time must not both succeed.

---

# 17. Restaurant Isolation

Every reward and redemption belongs to one restaurant.

Restaurant A must never be able to:

- View Restaurant B rewards.
- Redeem Restaurant B rewards.
- Validate Restaurant B codes.
- View Restaurant B redemptions.
- Modify Restaurant B rewards.

All operations must enforce restaurant authorization server-side.

---

# 18. RLS / Security

Use the existing Mersalak RLS architecture.

Do not expose unrestricted direct writes from the browser.

Prefer secure RPCs for:

- Reward creation/update where needed.
- Customer redemption.
- Staff verification.
- Staff reward usage.

Customer redemption must not rely on client-side balance checks alone.

The server must re-check everything.

---

# 19. Points Ledger Integration

Every redemption must create a ledger entry.

Example:

```text
Customer:
Yazan

Before:
540 Points

Reward:
Free Drink

Ledger:
-200
Type: redeem
Reference:
reward_redemption:<id>

After:
340 Points
```

Do not modify the ledger transaction afterward.

If a redemption needs cancellation/refund later, create a compensating transaction.

Example:

```text
Original:
-200 Redeem

Cancellation:
+200 Reward cancellation
```

Never silently delete the original transaction.

---

# 20. XP Independence

Reward redemption must never reduce XP.

Example:

```text
Before:
Points: 540
XP: 820

Redeem:
200 Points

After:
Points: 340
XP: 820
Level: Gold
```

This must be enforced at the database/business-logic level.

---

# 21. Customer Usage Limits

Support optional:

```text
per_customer_limit
```

Example:

```text
Free Drink
Cost: 200 points
Limit per customer: 3
```

The customer can redeem it three times maximum.

After that:

```text
لقد وصلت إلى الحد الأقصى لاستخدام هذه المكافأة.
```

This must be checked server-side.

---

# 22. Global Usage Limits

Support optional:

```text
usage_limit
```

Example:

```text
Free Meal
Global limit:
100 redemptions
```

After 100 successful redemptions:

```text
نفدت هذه المكافأة.
```

Concurrent redemptions must be handled safely.

---

# 23. Expiration

Rewards can have:

- Reward expiration.
- Redemption expiration.

Prefer storing the expiration timestamp on the redemption itself when the customer redeems.

This ensures the customer's issued reward has a stable validity period.

Example:

```text
Reward:
Free Drink

Redeemed:
October 2

Redemption expires:
October 15
```

If the original reward is edited later, the already-issued redemption should not unexpectedly change unless explicitly designed to do so.

---

# 24. Admin — Redemption History

Add a redemption history view.

Columns:

```text
Customer
Reward
Code
Cost
Status
Created
Used
Used By
```

Filters:

- Active
- Used
- Expired
- Cancelled
- Reward
- Customer
- Date

---

# 25. Admin — Reward Analytics

Basic analytics:

```text
Total Rewards
Active Rewards
Total Redemptions
Active Redemptions
Used Redemptions
Points Spent on Rewards
```

Do not build advanced analytics yet.

---

# 26. Customer Experience

The customer should feel that points have real value.

Example:

```text
⭐ 540 Points

🎁 Available Rewards

🥤 Free Drink
200 ⭐
[ Redeem ]

🍟 Free Fries
300 ⭐
[ Redeem ]

💰 10% Discount
500 ⭐
[ Redeem ]
```

This is the point where the loyalty system becomes useful rather than just informational.

---

# 27. Reward Types — Implementation Strategy

Do not make the database schema depend on individual products if the existing menu architecture can support references.

For a free menu item, consider:

```text
reward_type = free_item
reference_id = menu_item_id
```

For a percentage discount:

```text
reward_type = percentage_discount
value = 10
```

For a fixed discount:

```text
reward_type = fixed_discount
value = 5
```

Inspect the existing menu/product schema before deciding the final foreign-key structure.

Do not duplicate menu item data inside rewards.

---

# 28. Product / Menu Integration

If a reward references a menu item:

- Use the existing menu item.
- Do not duplicate item name/price as the source of truth.
- Handle deleted/inactive menu items safely.

If a referenced menu item becomes unavailable:

- Existing issued redemptions should remain auditable.
- New redemptions should be prevented if appropriate.

Do not silently invalidate existing customer rewards.

---

# 29. Admin UI

Add a new Admin section:

```text
🎁 المكافآت
```

Suggested structure:

```text
المكافآت

[ + إضافة مكافأة ]

إحصائيات
────────────────────
عدد المكافآت
المكافآت النشطة
إجمالي الاستبدالات
النقاط المستبدلة
────────────────────

قائمة المكافآت
```

Match the existing Admin Dashboard visual system.

Use the existing:

- Buttons
- Inputs
- Modals
- Toasts
- Icons
- Cards
- Tables

Do not introduce a completely separate design language.

---

# 30. Customer UI

The customer account should contain:

```text
حسابي

المستوى
XP
النقاط

🎁 المكافآت
🎯 المهام
🧾 الطلبات
⭐ النشاط
```

For Phase 3, only Rewards should become functional.

Missions can remain a disabled/coming-soon section until Phase 4.

---

# 31. Error Handling

Handle at least:

### Insufficient points

```text
رصيد النقاط غير كافٍ.
```

### Reward inactive

```text
هذه المكافأة غير متاحة حاليًا.
```

### Expired

```text
انتهت صلاحية هذه المكافأة.
```

### Usage limit

```text
تم الوصول إلى الحد الأقصى لاستخدام هذه المكافأة.
```

### Already redeemed / race

```text
تمت معالجة هذه العملية بالفعل.
```

### Invalid code

```text
رمز المكافأة غير صالح.
```

### Already used

```text
تم استخدام هذه المكافأة مسبقًا.
```

All errors must come from safe server-side validation.

---

# 32. Duplicate / Race Protection

Test:

```text
Two redemption clicks at the same time
```

Expected:

```text
Only one redemption
Only one points deduction
```

Also test:

```text
Two staff members use the same code simultaneously
```

Expected:

```text
Only one succeeds.
```

Use database locking/atomic updates/unique constraints as appropriate.

---

# 33. Phase 3 Implementation Order

## Step 1 — Discovery

Inspect:

- Phase 2 points ledger.
- Customer account table.
- Menu items.
- Admin architecture.
- Staff authorization.
- RLS.
- Existing RPC conventions.

## Step 2 — Database

Create:

- Rewards table.
- Redemption table.
- Required indexes/constraints.
- RLS.
- Secure RPCs.

## Step 3 — Admin

Build:

- Reward list.
- Create/edit reward.
- Activate/deactivate.
- Redemption history.

## Step 4 — Customer

Build:

- Rewards list.
- Reward details.
- Confirmation modal.
- Redemption.
- My Rewards.

## Step 5 — Staff

Build:

- Code verification.
- Reward usage.

## Step 6 — Testing

Test all redemption/security edge cases.

---

# 34. Definition of Done

Phase 3 is complete only when:

- [ ] Admin can create a reward.
- [ ] Admin can edit a reward.
- [ ] Admin can activate/deactivate a reward.
- [ ] Customer can see available rewards.
- [ ] Customer can see point cost.
- [ ] Customer cannot redeem without enough points.
- [ ] Customer can redeem a valid reward.
- [ ] Points are deducted through the existing ledger.
- [ ] XP does not change.
- [ ] Unique redemption code is generated.
- [ ] Redemption record is created.
- [ ] Customer can see active reward.
- [ ] Staff can verify code.
- [ ] Staff can mark reward as used.
- [ ] Used code cannot be reused.
- [ ] Expired codes cannot be used.
- [ ] Usage limits work.
- [ ] Restaurant isolation works.
- [ ] RLS is enforced.
- [ ] Double redemption is prevented.
- [ ] Double code usage is prevented.
- [ ] Admin can see redemption history.
- [ ] Existing Phase 1 customer conversion still works.
- [ ] Existing Phase 2 points/XP/levels still work.
- [ ] Production build passes.

---

# 35. Explicitly Out of Scope

Do NOT implement yet:

- Missions
- Achievements
- Referrals
- Push notifications
- Marketing campaigns
- Customer social features
- Global loyalty across restaurants
- Advanced CRM
- Advanced analytics
- Automatic personalized offers

These belong to later phases.

---

# 36. Agent Instructions

**Do not start coding blindly.**

First inspect the existing Phase 2 implementation and database.

Report:

1. Current points ledger structure.
2. Current customer account structure.
3. Existing menu item structure.
4. Existing staff/admin authorization.
5. Existing RLS patterns.
6. Recommended rewards schema.
7. Redemption transaction flow.
8. Potential conflicts.

Then implement Phase 3 incrementally.

Critical rules:

- Reuse the existing points ledger.
- Never create a second points balance.
- Never trust client-side balance checks.
- Redemption must be atomic.
- XP must never decrease when spending points.
- Restaurant isolation must remain intact.
- Do not rewrite Phase 1 or Phase 2.
- Do not proceed to Missions until Rewards is fully tested.

After implementation, run the complete Phase 3 test checklist before declaring the phase complete.
