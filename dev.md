# Development Log & Project Status

## Project Overview
**Name**: EU Projects Generator v3
**Repository**: `NMMonteiro/eu-projects-apps_3.2`
**Deployment**: `https://eu-projects-apps-3-2-nunos-projects-d60951f9.vercel.app`
**Status**: Stabilizing Proposal Generation (Partner Display & Budget Accuracy)

---

## Recent Achievements (Jan 2026)

### 1. Proposal Generation Stabilization
- **Partner Merging Logic**: Refactored the `server` edge function to correctly merge AI-generated roles/descriptions with technical metadata (OID, PIC, VAT) from the portal. This ensures the correct number of partners are displayed while preserving the AI's content.
- **Coordinator Priority**: Ensured the lead coordinator (the first partner selected) is always correctly identified and passed as the primary organization to the AI.
- **Budget Adherence**: Enhanced the `prompt_builder.ts` with strict instructions for the AI to sum costs exactly to the specified limit (e.g., €250,000).

### 2. Infrastructure & Tooling
- **Supabase CLI**: Updated to v2.72.3 for better Deno compatibility.
- **Deno Compatibility**: Standardized imports in edge functions using `jsr:` and `npm:` schemes.
- **DOCX Export**: Improved layout formatting for tables (Budget, WP activities) and ensured partner data hydration before export.

---

## Technical Architecture

### Backend (Supabase Edge Functions)
- **`server/index.ts`**: Main orchestrator for proposal generation, CRUD, and data enrichment.
- **`server/prompt_builder.ts`**: Contains the logic for constructing the elite-level AI prompts.
- **`proposal-copilot/index.ts`**: AI assistant for iterative proposal refinement.

### Frontend (Vite + React)
- **`ProposalViewerPage.tsx`**: The primary UI for reviewing and editing proposals. Includes dynamic rendering for Narrative and Structured data (WP, Partners, Budget).
- **`ProposalStep.tsx`**: Orchestrates the multi-step generation flow.

---

- [x] **Database Linkage**: Implemented `saveToSupabase` sync logic to mirror proposal data from KV to the relational `proposals` table.
- [x] **UUID Safety**: Fixed hydration and search logic to safely handle both UUIDs and string IDs, preventing Postgres type errors.
- [x] **AI Edit for Activities**: Enabled structured AI editing for Work Package activities. Fixed section detection aliases ("activities", "tasks") and updated frontend state management for virtual sections.
- [x] **Deployment Verification**: Deployed updated `server` edge function and Vercel frontend.

---

## Technical Details: Database Linkage
- **Primary Store**: All proposals are stored as JSON documents in the `kv_store` for maximum flexibility.
- **Relational Mirror**: Proposals are now automatically synced to the `proposals` table. This provides:
  - Visibility in the Supabase Dashboard.
  - Relational links to `funding_schemes` (FK).
  - Ability for advanced SQL querying.
- **Partner Storage**: Partners are stored in the `partners` table (UUIDs). Proposals reference them via a `jsonb` array of IDs. The system safely handles both "verified" (UUID) and "ad-hoc" (string) partner IDs.

---

## Pending Tasks & Next Steps

1. **Verify AI Adherence**: Generate a fresh proposal and manually verify that:
   - All $N$ partners are present.
   - The coordinator is #1.
   - The budget total is exactly as requested.
2. **UI Polishing**: Finalize the "Narrative" vs "Structured" tab transition logic in `ProposalViewerPage.tsx`.
3. **Error Handling**: Add more robust JSON repair for truncated AI responses if they occur during long sections.

---

## Documentation Links
- [Supabase Documentation](https://supabase.com/docs)
- [Gemini API reference](https://ai.google.dev/docs)
- [Deployment URL](https://eu-projects-apps-3-2-nunos-projects-d60951f9.vercel.app)
