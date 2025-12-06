# ⚠️ MIGRATION FIX - Apply in This Order

**Issue Found:** The `proposals` table doesn't exist yet, but other migrations try to add columns to it.

## ✅ **Correct Migration Order**

Apply these SQL files **in this exact order** in the Supabase SQL Editor:

### **Step 1: Core Tables First**
Go to: https://supabase.com/dashboard/project/swvvyxuozwqvyaberqvu/sql/new

### **Migration 1:** Create proposals table
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20251205_create_proposals.sql
```
Click **RUN** ✅

### **Migration 2:** Create funding_schemes table  
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20251205_create_funding_schemes.sql
```
Click **RUN** ✅

### **Migration 3:** Add funding_scheme_id to proposals
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20251205_add_funding_scheme_to_proposals.sql
```
Click **RUN** ✅

### **Migration 4:** Seed default funding scheme
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20251205_seed_default_funding_scheme.sql
```
Click **RUN** ✅

### **Migration 5:** Create scraped_opportunities table (if not already created)
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20251205_create_scraped_opportunities.sql
```
Click **RUN** ✅

### **Migration 6:** Create funding_opportunities table (if not already created)
```sql
-- Copy and paste the entire contents of:
-- supabase/migrations/20250122_funding_opportunities.sql
```
Click **RUN** ✅

---

## ✅ **Verify Success**

After running all migrations, test with this query:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Should show:
-- - funding_opportunities
-- - funding_schemes
-- - proposals
-- - scraped_opportunities
```

```sql
-- Check default funding scheme was created
SELECT name, is_default, jsonb_array_length(template_json->'sections') as section_count
FROM funding_schemes 
WHERE is_default = true;

-- Should show 1 row: "Default Template" with 9 sections
```

---

## 🎯 **Once Complete**

Let me know when migrations are applied successfully, and I'll continue with Phase 3 (AI Document Parser)!
