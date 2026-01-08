# EU Funding Proposal Tool - Architecture & Data Flow

This document provides a comprehensive overview of the application architecture, database schema, and data flow.

## 1. Core Architecture

The application is built with a modern web stack:
- **Frontend**: React (Vite), Tailwind CSS, Shadcn UI, Radix UI.
- **Backend/Edge**: Supabase Edge Functions (Deno runtime).
- **AI**: Google Gemini 2.0 Flash (via `@google/generative-ai`).
- **Storage**: 
  - **Vercel KV**: Primary ephemeral/speed-optimized store for active proposals.
  - **Supabase PostgreSQL**: Persistent store for Partners, Funding Schemes, and backup Propposals.
  - **Supabase Storage**: For logos and uploaded guideline documents.

## 2. Database Schema

### `partners` Table
Stores institutional profiles for the consortium partners.
- `id` (UUID): Primary key.
- `name` (TEXT): Legal name.
- `legal_name_national` (TEXT): Name in national language.
- `acronym` (TEXT).
- `organisation_id` (TEXT): OID or PIC number.
- `vat_number` (TEXT).
- `business_id` (TEXT).
- `organization_type` (TEXT).
- `country` (TEXT).
- `legal_address` (TEXT).
- `city` (TEXT).
- `postcode` (TEXT).
- `contact_email` (TEXT).
- `description` (TEXT): Institutional background/profile.
- `experience` (TEXT): Previous relevant experience.
- `staff_skills` (TEXT): Key staff skills.
- `relevant_projects` (TEXT).

### `funding_schemes` Table
Defines the "blueprint" for different EU grant programs (Erasmus+, Horizon, etc.).
- `id` (UUID): Primary key.
- `name` (TEXT).
- `template_json` (JSONB): The critical field. Defines the sections, their labels, keys, and AI prompts.
  - `sections`: Array of objects with `key`, `label`, `description`, `type`, `subsections`.
- `is_default` (BOOLEAN).

### `proposals` Table (Supabase Persistence)
- Matches the structured proposal object.
- Stored as a combination of flat fields and JSONB columns (`partners`, `work_packages`, `budget`, `risks`).

## 3. Data Flow & Proposal Structure

### Step-by-Step Generation
1. **Analyze URL**: AI extracts summary and constraints (budget, duration, partners) from the funding call URL.
2. **Generate Ideas**: AI suggests 6-10 project ideas based on the analysis.
3. **Generate Proposal**:
   - The system fetches selected Partners and the Funding Scheme.
   - It builds a massive prompt including the Template sections.
   - AI returns a complex JSON object containing:
     - `dynamicSections`: A map of text content for each template key (e.g., `{"relevance": "...", "work_package_1": "..."}`).
     - `workPackages`: Array of structured WP objects.
     - `budget`: Array of structured budget items.
     - `risks`: Array of risk assessment objects.
     - `partners`: Merged data from the selected partners.

### Rendering & Consistency (The "Two Tabs" Problem)
- **Narrative/Sections Tab**: Driven by `fundingScheme.template_json.sections`. It maps keys from the template to content found in `dynamicSections`.
- **Structured Data Tab**: Driven by the raw arrays (`workPackages`, `budget`, `partners`).

**Known Issue (Being Fixed):** If a template only defines sections for `work_package_1` and `work_package_2`, the "Narrative" tab only shows those two, even if the "Structured" data has more.

## 4. Key Components

- `ProposalGenerator.tsx`: Manages the wizard state (Step 1-4).
- `ProposalViewerPage.tsx`: The primary viewer/editor. Handles hydration from DB, syncing to KV, and real-time editing.
- `ProposalCopilot.tsx`: The sidebar assistant that can edit specific sections or add new ones.
- `utils/export-docx.ts`: The document generation engine. Mirroring the viewer logic to produce professional results.

## 5. Deployment Workflow
- Changes are pushed to GitHub.
- Vercel automatically deploys the frontend.
- Supabase Edge Functions are deployed via CLI (`supabase functions deploy server`).
