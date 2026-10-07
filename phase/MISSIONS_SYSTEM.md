# MISSIONS_SYSTEM.md
# Mersalak — Loyalty Missions System (Phase 4)

## 1. الهدف
إضافة نظام Missions / المهام إلى نظام الولاء في Mersalak. المهمة نشاط يحقق العميل شرطه، وعند الإكمال يحصل على Points و/أو XP من نظام Loyalty الحالي.

## 2. قواعد أساسية
- استخدم نظام `loyalty_transactions` الحالي، ولا تنشئ نظام نقاط أو XP جديد.
- لا تعدّل `points_balance` أو `xp_total` مباشرة من المتصفح.
- كل إكمال Mission يجب أن يملك `event_key` فريدًا لمنع التكرار.
- XP لا ينقص أبدًا.
- كل Mission مرتبطة بمطعم واحد، مع Restaurant Isolation وRLS.
- لا تكسر Customer Foundation أو Loyalty أو Rewards.

## 3. أنواع المهام
يجب دعم:
1. `one_time` — مرة واحدة.
2. `daily` — تتجدد يوميًا.
3. `weekly` — تتجدد أسبوعيًا.
4. `monthly` — تتجدد شهريًا.

## 4. شروط الإنجاز
صمّم النظام ليكون قابلًا للتوسع، وادعم على الأقل:
- `orders_count`: عدد الطلبات المكتملة.
- `spending_amount`: قيمة الطلبات المؤهلة، بعد فحص اسم العمود المالي الفعلي في `orders`.
- `unique_items`: عدد الأصناف المختلفة.
- `review_count`: عدد التقييمات إذا كان نظام Reviews موجودًا.
- `category_orders`: عدد الطلبات التي تحتوي على أصناف من فئة محددة.

لا تنشئ نظام Reviews جديدًا ضمن هذه المرحلة إذا لم يكن موجودًا.

## 5. Database
أنشئ migration:
`supabase/20261005_missions_phase4.sql`

يجب أن تكون آمنة لإعادة القراءة/التطبيق ولا تنشئ duplicates.

### loyalty_missions
حقول أساسية مقترحة:
- `id`
- `restaurant_id`
- `title`
- `description`
- `icon`
- `mission_type`
- `condition_type`
- `target_value`
- `reward_points`
- `reward_xp`
- `starts_at`
- `ends_at`
- `is_active`
- `condition_config jsonb`
- `created_at`
- `updated_at`

### customer_mission_progress
- `id`
- `restaurant_id`
- `mission_id`
- `restaurant_customer_id`
- `period_key`
- `progress_value`
- `completed_at`
- `created_at`
- `updated_at`

ضع Unique Constraint مناسبًا مثل:
`(mission_id, restaurant_customer_id, period_key)`

لـ One-Time يمكن استخدام period ثابت مثل `lifetime`.

لا تنشئ أي جدول points/XP جديد.

## 6. Progress
التقدم يجب أن يكون Server-Side، وليس `progress++` في JavaScript.

للمهام المتعلقة بالطلبات، الطلب المؤهل هو:
`orders.status = 'served'`
مع:
`orders.restaurant_customer_id = customer account`
ونفس `restaurant_id`.

لا تعتبر `new`, `accepted`, `preparing`, `ready`, `cancelled` طلبًا مكتملًا لمهام إكمال الطلب.

## 7. Completion
عندما `progress >= target_value`:
1. ثبّت completion record.
2. أنشئ Loyalty transaction.
3. أضف Points.
4. أضف XP.
5. سجّل event key.
6. امنع التكرار.

كل ذلك Atomic. لا نريد completion بدون reward أو reward بدون completion.

## 8. Event Keys
One-Time:
`mission_completion:<mission_id>:<customer_account_id>`

Daily:
`mission_completion:<mission_id>:<customer_account_id>:YYYY-MM-DD`

Weekly:
`mission_completion:<mission_id>:<customer_account_id>:YYYY-Www`

Monthly:
`mission_completion:<mission_id>:<customer_account_id>:YYYY-MM`

استخدم قاعدة بيانات/ledger uniqueness لمنع Race Conditions.

## 9. RPCs
Customer:
- `get_customer_missions`

يُرجع:
- active missions
- progress
- target
- percentage
- reward points
- reward XP
- status
- completed_at

Admin:
- `admin_get_missions`
- `admin_save_mission`
- `admin_set_mission_active`
- `admin_delete_mission`
- `admin_get_mission_stats`

يمكن إضافة `admin_get_customer_missions` عند الحاجة.

يمكن استخدام internal/server-side function مثل:
`process_customer_mission_progress`

المهم أن حساب التقدم ومنح المكافأة يكونان Server-Side وAtomic.

## 10. تحديث التقدم
لا تستخدم polling مستمر.

الأولوية في Phase 4:
- `orders_count` بشكل كامل.
- ربط التقدم بانتقال الطلب إلى `served`.

بعد ذلك يمكن إضافة:
- `spending_amount`
- `unique_items`
- `category_orders`

إذا كان ذلك متوافقًا مع schema الحالي.

## 11. Admin Dashboard
أضف قسم `Missions` داخل Admin Dashboard الحالي.

Admin يستطيع:
- رؤية المهام.
- إنشاء/تعديل Mission.
- تفعيل/تعطيل.
- حذف/أرشفة.
- رؤية completion count.
- رؤية عدد العملاء الذين أكملوها.
- رؤية الفترة.
- رؤية Points وXP.

### Form
Basic:
- Title
- Description
- Icon
- Type
- Condition
- Target

Reward:
- Points
- XP

Schedule:
- Starts At
- Ends At

Status:
- Active

Condition config يظهر فقط عند الحاجة، مثل اختيار Category.

## 12. Customer UI
أضف `Missions` إلى Loyalty Modal الحالي، ولا تنشئ Loyalty Modal ثاني.

مثال:
`🔥 أكمل 5 طلبات`
`3 / 5`
`██████░░░░ 60%`
`+50 XP`
`+20 نقطة`

المهمة المكتملة:
`✓ مكتملة`

المنتهية:
`انتهت`

لا تجعل العميل يضغط `Complete Mission`. النشاط الحقيقي هو الذي يحقق التقدم.

## 13. Security
- Customer يرى Missions الخاصة بمطعمه فقط.
- Customer لا يعدّل Mission أو progress.
- Customer لا يمنح نفسه Points/XP.
- Admin يدير Missions الخاصة بمطعمه.
- لا يوجد cross-restaurant access.
- RLS بنفس نمط Phase 1/2/3.

## 14. عدم التكرار
ممنوع إنشاء:
- points system جديد
- XP system جديد
- balance جديد
- ledger جديد
- customer system جديد
- rewards system جديد

Mission rewards تستخدم Loyalty Core الحالي.

## 15. Testing
اختبر:
- One-Time: مرة واحدة فقط.
- Daily: مرة في نفس اليوم ومن ثم السماح بفترة جديدة.
- Weekly.
- Monthly.
- Progress.
- Completion.
- Points وXP في ledger.
- XP لا ينقص.
- Insufficient/invalid targets.
- Restaurant isolation.
- Customer لا يزور admin RPCs.
- Customer لا يغير progress.
- Race condition: محاولتان متزامنتان = completion واحدة وledger reward واحدة.
- عدم كسر Rewards وLoyalty.

## 16. Acceptance Criteria
لا تعتبر Phase 4 مكتملة حتى:
- [ ] migration مطبقة على Supabase.
- [ ] tables وRLS موجودة.
- [ ] Admin CRUD يعمل.
- [ ] Customer Missions تعمل.
- [ ] Progress Server-Side.
- [ ] One-Time تعمل.
- [ ] Daily تعمل.
- [ ] Weekly تعمل.
- [ ] Monthly تعمل.
- [ ] Completion Atomic.
- [ ] Loyalty ledger مستخدم.
- [ ] Duplicate rewards ممنوعة.
- [ ] XP لا ينقص.
- [ ] Restaurant isolation تعمل.
- [ ] End-to-end test ناجح.
- [ ] Race-condition test ناجح.

## 17. Implementation Order
1. Inspect current schema and existing Loyalty/Rewards implementation.
2. Create `supabase/20261005_missions_phase4.sql`.
3. Implement secure RPCs.
4. Implement Admin Missions UI.
5. Implement Customer Missions UI.
6. Connect mission progress to `served` orders.
7. Test completion + ledger.
8. Add additional condition types only if schema supports them cleanly.
9. Run final security and race-condition tests.

## 18. Agent Rules
قبل أي تعديل:
- اقرأ الملفات الحالية.
- لا تفترض أسماء أعمدة `orders`.
- لا تفترض أسماء أعمدة menu items.
- لا تعيد بناء Loyalty Core أو Rewards.
- لا تعدّل production data للاختبار.
- لا تطبق migration أكثر من مرة.
- لا تستخدم browser-side balance mutation.
- لا تعتبر Phase 4 مكتملة قبل تطبيق migration واختبار live database.
- نفذ على مراحل صغيرة لتجنب timeout.

ابدأ بالـ inspection أولًا، ثم نفذ على مراحل صغيرة. لا تنفذ Phase 4 بالكامل في طلب واحد.
