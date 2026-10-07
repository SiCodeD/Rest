# Mersalak — Pre-Launch Production Audit

## تعليمات التدقيق

قم بعمل **تدقيق شامل للمشروع قبل النشر والاستخدام الفعلي**.

### مهم جدًا

- التدقيق فقط.
- **لا تعدّل أي ملف.**
- **لا تنشئ migrations.**
- **لا تغيّر قاعدة البيانات.**
- **لا تغيّر Production data.**
- **لا تصلح المشاكل أثناء التدقيق.**
- لا تفترض أن شيئًا يعمل لمجرد أن الواجهة تعرضه.
- افحص الـ backend وSupabase وRLS وRPCs بالإضافة إلى الـ frontend.
- إذا وجدت مشكلة، سجّلها فقط.
- إذا لم تستطع التحقق من شيء، اذكر بوضوح أنه **غير متحقق منه**.

---

# 1. الخلاصة التنفيذية

في بداية التقرير أعطني حكمًا واحدًا فقط:

- `READY FOR PRODUCTION`
- `READY WITH MINOR FIXES`
- `READY AFTER IMPORTANT FIXES`
- `NOT READY — CRITICAL BLOCKERS`

ثم اشرح السبب باختصار.

---

# 2. Critical Blockers

ابحث عن أي مشكلة قد تسبب:

- تسريب بيانات بين المطاعم.
- وصول مستخدم إلى مطعم آخر.
- تجاوز صلاحيات المستخدم.
- إنشاء طلبات بدون اشتراك صالح.
- تجاوز حدود الخطة.
- تجاوز Feature Gates.
- تعديل بيانات بدون صلاحية.
- فقدان بيانات.
- فساد بيانات.
- كسر نظام الطلبات.
- كسر تسجيل الدخول.
- مشكلة خطيرة في Super Admin.
- مشكلة أمنية تمنع إطلاق المشروع.

لكل مشكلة اذكر:

- Severity
- الملف / الدالة / الجدول
- المشكلة
- لماذا تعتبر خطيرة
- التأثير
- الحل المقترح
- هل تمنع الإطلاق أم لا؟

---

# 3. High Priority Issues

افحص المشاكل المهمة التي لا تعتبر Critical Blocker لكنها يجب أن تُحل قبل الإطلاق أو مباشرة بعده.

لكل مشكلة:

- Severity
- الملف / الدالة / الجدول
- المشكلة
- التأثير
- الحل المقترح

---

# 4. Medium Priority Issues

ابحث عن:

- مشاكل UX.
- Edge Cases.
- أخطاء validation.
- Error handling ضعيف.
- مشاكل loading.
- مشاكل empty states.
- مشاكل الأداء.
- تكرار الكود.
- منطق غير متناسق.
- مشاكل maintainability.

---

# 5. Low Priority / Polish

اذكر:

- التحسينات البصرية.
- النصوص.
- التفاصيل الصغيرة في UX.
- تنظيف الكود.
- Technical Debt غير الخطير.

---

# 6. Plans & Pricing

تحقق من أن الخطط في النظام مطابقة تمامًا لما يلي:

## Starter

- السعر: `$49/month`
- Tables: `10`
- Menu Items: `25`
- Employees: `2`

Features:

- QR Menu
- Orders
- Kitchen
- Tables / QR
- Waiter
- Restaurant Reports

---

## Professional

- السعر: `$99/month`
- Tables: `30`
- Menu Items: `50`
- Employees: `5`

Features:

- كل Features الخاصة بـ Starter
- Order Tracking
- Customer Management
- Customer Profile
- Feedback

---

## Business

- السعر: `$179/month`
- Tables: `60`
- Menu Items: `100`
- Employees: `15`

Features:

- كل Features الخاصة بـ Professional
- Loyalty
- Rewards
- Missions
- Customer Reports
- Advanced Analytics

---

## Enterprise

- Custom Pricing
- Custom Limits

Features:

- كل Features الخاصة بـ Business
- Automation
- Multi-branch
- Custom Integrations
- Custom limits

---

# 7. Plan Enforcement

تحقق أن النظام لا يعتمد على الـ frontend فقط في تطبيق الخطط.

يجب أن يكون الـ backend / database هو المصدر الحقيقي للـ enforcement.

افحص:

- Feature Gates
- Resource Limits
- RPCs
- RLS
- SECURITY DEFINER functions
- Triggers
- Subscription resolver

وتحقق أن المستخدم لا يستطيع تجاوز القيود باستدعاء RPC مباشرة.

---

# 8. Resource Limits

تحقق من التطبيق الفعلي للحدود التالية:

## Employees

Starter = 2  
Professional = 5  
Business = 15

## Tables

Starter = 10  
Professional = 30  
Business = 60

## Menu Items

Starter = 25  
Professional = 50  
Business = 100

تحقق من:

- INSERT
- UPDATE
- DELETE
- Active / inactive
- Restaurant isolation
- Concurrent requests
- Race conditions
- Advisory locks
- استخدام الـ entitlement resolver

---

# 9. Feature Gates

تحقق من جميع الـ features التالية.

## Professional features

- Order Tracking
- Customer Management
- Customer Profile
- Feedback

## Business features

- Loyalty
- Rewards
- Missions
- Customer Reports
- Advanced Analytics

## Enterprise features

- Automation
- Multi-branch
- Custom Integrations
- Custom limits

تحقق أن الـ feature لا يمكن الوصول إليه عن طريق:

- UI
- Direct RPC
- Direct API call
- Database access

إذا كانت الواجهة مقفلة لكن الـ RPC يعمل، اعتبرها مشكلة.

---

# 10. Subscription System

افحص:

- `restaurant_subscriptions`
- subscription resolver
- plan resolver
- current subscription
- subscription status
- current_period_start
- current_period_end
- trial_ends_at
- cancel_at_period_end
- canceled_at

تحقق من الحالات:

- trialing
- active
- past_due
- canceled
- expired

وتحقق من كيفية تعامل النظام مع كل حالة.

---

# 11. Subscription Expiration / Read-Only

تحقق من السلوك التالي:

عند انتهاء الاشتراك:

### Admin Dashboard

يظل متاحًا ولكن في وضع:

`READ ONLY`

### Public Menu

يبقى متاحًا للزوار.

### Table QR

يجب ألا يسمح ببدء طلب جديد.

ويجب أن يرجع إلى الـ public/social menu.

### Cart

لا يجب أن يسمح بإنشاء طلب إذا كان الاشتراك غير صالح.

### Backend

يجب أن يمنع إنشاء الطلبات الجديدة حتى لو حاول المستخدم استدعاء RPC مباشرة.

### Existing Orders

يجب أن تبقى قابلة للقراءة والإدارة حسب الصلاحيات.

اذكر بوضوح:

- Implemented
- Partially implemented
- Not implemented
- Not verified

---

# 12. Restaurant Creation

تحقق من إنشاء مطعم جديد.

افحص:

- إنشاء subscription تلقائيًا.
- اختيار الخطة.
- default plan.
- duplicate subscriptions.
- restaurant isolation.

وتحقق من Default Menu Categories.

يجب أن يحصل المطعم الجديد على:

1. الإفطار
2. المقبلات
3. الوجبات
4. السندويتشات
5. الصوصات
6. المشروبات الباردة
7. المشروبات الساخنة
8. الحلويات

ولا يجب إنشاء Default Menu Items.

المطاعم القديمة يجب ألا تتغير تلقائيًا.

---

# 13. Multi-Tenant Security

هذا القسم مهم جدًا.

تحقق أن Restaurant A لا يستطيع الوصول إلى بيانات Restaurant B.

اختبر منطقيًا:

- Orders
- Menu
- Menu Categories
- Menu Items
- Tables
- Employees
- Customers
- Customer Profiles
- Feedback
- Loyalty
- Rewards
- Missions
- Reports
- Subscriptions

تحقق من:

- RLS
- RPCs
- SECURITY DEFINER
- current_restaurant_id()
- current_user_role()
- auth.uid()

---

# 14. Supabase Security Audit

افحص جميع:

- RLS policies
- RPCs
- Functions
- SECURITY DEFINER functions
- Grants
- Revokes
- search_path
- auth checks

انتبه بشكل خاص إلى:

`CREATE OR REPLACE FUNCTION`

التي قد تعيد تعريف Function كانت محمية سابقًا وتزيل منها Feature Gate أو Authorization.

### مهم جدًا

إذا وجدت:

Migration A:

- تضيف Feature Gate

ثم لاحقًا:

Migration B:

- تعمل `CREATE OR REPLACE FUNCTION`

وتزيل الـ Feature Gate،

اعتبر ذلك مشكلة أمنية وسجّلها.

---

# 15. Public / Anonymous Access

افحص جميع RPCs التي لديها:

- anon
- public
- authenticated

وتحقق لماذا هي public.

خصوصًا:

- Customer self-service
- Public menu
- Order tracking
- Guest ordering

لا تعتبر public access مشكلة تلقائيًا.

حدد هل هو مقصود أم لا.

---

# 16. Authentication & Authorization

افحص:

- Admin authentication
- Employee authentication
- Waiter
- Cashier
- Super Admin
- Session handling
- Logout
- Unauthorized access
- Direct URL access
- Direct RPC access
- Role escalation

تحقق أن صلاحيات الواجهة ليست هي الحماية الوحيدة.

---

# 17. Super Admin

افحص:

- Restaurants
- Plans
- Plan limits
- Plan features
- Subscriptions
- Subscription status
- Restaurant plan assignment
- Enterprise
- Legacy `restaurants.plan`

تحقق من وجود تعارض بين:

- `restaurants.plan`
- `restaurant_subscriptions`

حدد بوضوح أيهما Source of Truth.

---

# 18. Orders

افحص دورة الطلب كاملة:

1. Guest opens menu
2. Table QR
3. Add to cart
4. Checkout
5. Order creation
6. New
7. Accepted
8. Preparing
9. Ready
10. Served
11. Cancelled

تحقق من:

- duplicate orders
- refresh
- retry
- concurrent actions
- invalid status changes
- waiter
- kitchen
- order tracking

---

# 19. Customer System

افحص:

- Customer creation
- Guest → Customer conversion
- Customer profile
- Customer management
- Order history
- Feedback
- Customer reports
- Restaurant isolation
- Feature gates

---

# 20. Loyalty System

افحص:

- Points
- XP
- Levels
- Transactions
- Manual adjustments
- Automatic order rewards
- Idempotency
- Duplicate event protection
- RLS
- Admin access
- Customer access
- Restaurant isolation

تحقق خصوصًا من:

`loyalty_transactions`

و:

`loyalty_apply_transaction`

وكل الـ triggers المرتبطة بها.

---

# 21. Rewards

افحص:

- Reward creation
- Reward editing
- Reward deletion
- Customer redemption
- Admin access
- Feature gate
- RLS
- Duplicate redemption
- Restaurant isolation

---

# 22. Missions

افحص:

- Mission creation
- Mission editing
- Mission deletion
- Mission completion
- Rewards
- XP
- Points
- Idempotency
- Feature gate
- RLS
- Restaurant isolation

تحقق من أي migrations لاحقة قد تعيد تعريف Functions الخاصة بالـ Missions.

---

# 23. Customer Reports

افحص:

- Customer Reports
- Customer Analytics
- Feedback Reports

وتحقق من الفصل بينهم.

خصوصًا:

`admin_get_customer_reports_summary`

و:

`admin_get_feedback_reports`

وتحقق أن Starter لا يستطيع تجاوز Customer Reports مباشرة عن طريق RPC.

---

# 24. Frontend

افحص:

- Admin Dashboard
- Super Admin Dashboard
- Menu
- Kitchen
- Waiter
- Customer Management
- Customer Profile
- Loyalty
- Rewards
- Missions
- Reports

تحقق من:

- Loading state
- Empty state
- Error state
- Locked feature state
- Read-only state
- Subscription state
- Mobile
- Responsive layout
- Broken links
- Console errors
- Unhandled promises

---

# 25. Feature Lock UX

تحقق أن الـ locked features:

- لا يتم إخفاؤها من Sidebar بدون سبب.
- تظهر بشكل واضح أنها تحتاج خطة أعلى.
- لا تعرض جدولًا فارغًا وكأنه لا توجد بيانات.
- تعرض Locked Feature UI واضحة.
- تعرض الخطة المطلوبة بشكل صحيح.
- لا تعتمد الواجهة وحدها على الحماية.

---

# 26. Public Menu

افحص:

- Public/social menu
- Table menu
- QR
- Slug
- Restaurant lookup
- Categories
- Menu items
- Cart
- Ordering

وتحقق من الفرق بين:

`public mode`

و:

`table mode`

---

# 27. Performance

ابحث عن المشاكل الحقيقية فقط.

افحص:

- repeated Supabase requests
- unnecessary queries
- duplicate fetching
- expensive DOM operations
- excessive animations
- excessive transitions
- polling
- event listeners
- large assets
- blocking scripts
- repeated rendering

لا تسجل مشكلة أداء إلا إذا كان لها تأثير واضح أو محتمل بشكل منطقي.

---

# 28. Data Integrity

افحص:

- Foreign Keys
- Unique Constraints
- Cascades
- Orphan records
- Duplicate records
- Transactions
- Idempotency
- Race conditions
- Delete behavior

---

# 29. Production Configuration

افحص:

- Environment variables
- Supabase configuration
- Cloudflare configuration
- Build configuration
- Deployment scripts
- Production URLs
- Development URLs
- Debug code
- Test code
- Hardcoded secrets

### مهم

إذا وجدت Secret:

لا تعرض قيمة الـ secret.

اذكر فقط:

- الملف
- مكان وجوده
- نوع المشكلة

---

# 30. Backups & Recovery

تحقق مما إذا كان المشروع يحتوي أو يفترض وجود:

- Database backups
- Restore procedure
- Migration recovery
- Data recovery

إذا لم تستطع التحقق، اكتب:

`Not verified`

ولا تفترض وجود Backup.

---

# 31. External Services

تحقق من الاعتماد على:

- Supabase
- Cloudflare
- Telegram
- Email
- Payment providers
- Printers
- QR
- أي API خارجي

إذا كان شيء يحتاج إعداد Production يدوي، سجله.

---

# 32. What Is Actually Verified?

اعمل قائمة بكل شيء تم التحقق منه فعليًا.

لا تكتب:

`Working`

إلا إذا كان لديك دليل من:

- source code
- SQL
- repository
- tests
- configuration

---

# 33. What Is NOT Verified?

اعمل قائمة منفصلة بكل شيء لم تستطع التحقق منه.

مثال:

- Production DNS
- Real printer
- Real email delivery
- Backup restore
- External payment provider
- Real mobile devices
- Production secrets
- Cloudflare production configuration

---

# 34. Final Launch Checklist

## Security

- [ ] RLS verified
- [ ] RPC permissions verified
- [ ] SECURITY DEFINER audited
- [ ] Multi-tenant isolation verified
- [ ] Super Admin security verified

## Plans

- [ ] Plan prices verified
- [ ] Plan limits verified
- [ ] Feature gates verified
- [ ] Subscription resolver verified
- [ ] Resource limits verified
- [ ] Expiration behavior verified

## Orders

- [ ] Guest ordering verified
- [ ] Table QR verified
- [ ] Public menu verified
- [ ] Kitchen verified
- [ ] Waiter verified
- [ ] Order tracking verified
- [ ] Expired subscription cannot create orders

## Customers

- [ ] Customer Management verified
- [ ] Customer Profile verified
- [ ] Feedback verified
- [ ] Customer Reports verified

## Loyalty

- [ ] Loyalty verified
- [ ] Rewards verified
- [ ] Missions verified
- [ ] Idempotency verified

## Production

- [ ] Production environment verified
- [ ] Deployment verified
- [ ] Backups verified
- [ ] Recovery verified
- [ ] Monitoring verified
- [ ] No secrets exposed
- [ ] No debug code

---

# 35. Final Report

في نهاية التقرير اكتب:

## Production readiness: XX%

ثم:

### Launch blockers

عدد المشاكل الحرجة.

### High-priority issues

عدد المشاكل المهمة.

### Medium issues

عدد المشاكل المتوسطة.

### Low-priority issues

عدد المشاكل البسيطة.

### Verified systems

قائمة مختصرة.

### Not verified

قائمة مختصرة.

### Recommended fix order

1. أهم مشكلة
2. ثاني أهم مشكلة
3. ثالث أهم مشكلة
4. وهكذا

---

# FINAL RULE

**لا تعدّل أي شيء أثناء هذا التدقيق.**

أريد تقريرًا صريحًا، وليس تقريرًا تجميليًا.

إذا المشروع غير جاهز، قل بوضوح:

`NOT READY`

واذكر السبب.

إذا كان جاهزًا، اذكر ما الذي تم التحقق منه وما الذي بقي غير متحقق منه.

لا تفترض أن أي شيء يعمل بدون دليل من الكود أو قاعدة البيانات.
