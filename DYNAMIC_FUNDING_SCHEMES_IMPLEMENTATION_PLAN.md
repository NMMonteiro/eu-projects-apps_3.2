# Dynamic Funding Scheme Templates - Implementation Plan

**Created:** 2025-12-05  
**Status:** Planning Phase  
**Backup Commit:** `542da0c` - "Backup before implementing dynamic funding scheme templates feature"

---

## 📋 Overview

Add support for **dynamic funding scheme templates** that allow different project applications (Horizon Europe, Erasmus+, Creative Europe, etc.) to have customized sections, character limits, and requirements. Includes AI-powered document parsing to automatically extract templates from PDF/DOCX guideline documents.

---

## 🎯 Goals

1. **Backward Compatibility**: Existing proposals continue to work without changes
2. **Flexibility**: Easy to add new funding schemes without code changes
3. **AI-Assisted**: Upload PDF/DOCX guidelines and let AI extract the structure
4. **User-Friendly**: Simple UI for managing and using templates

---

## 🏗️ Architecture

### Phase 1: Database Schema ✅
- Create `funding_schemes` table
- Add optional `funding_scheme_id` to existing tables
- Seed default template for backward compatibility

### Phase 2: TypeScript Types ✅
- Define `FundingScheme`, `FundingSchemeSection` interfaces
- Update `FullProposal` to support dynamic sections
- Maintain legacy fields for backward compatibility

### Phase 3: AI Document Parser 🔧
- Create Edge Function to parse PDF/DOCX documents
- Extract sections, limits, mandatory flags
- Return structured JSON for review

### Phase 4: Admin UI 🔧
- Template upload interface
- AI extraction review/edit screen
- Template management (CRUD)

### Phase 5: Proposal Generator Integration 🔧
- Add funding scheme selector
- Update AI prompts to use dynamic sections
- Conditional rendering based on scheme

### Phase 6: Export & Display 🔧
- Update DOCX export to handle dynamic sections
- Update proposal viewer
- Character count validation per section

---

## 📝 Detailed Implementation Steps

---

## **PHASE 1: Database Schema** 
**Estimated Time:** 30-45 minutes  
**Priority:** HIGH ⚡

### Step 1.1: Create `funding_schemes` Table

**File:** `supabase/migrations/create_funding_schemes.sql`

```sql
-- Create funding_schemes table
CREATE TABLE IF NOT EXISTS public.funding_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    template_json JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_funding_schemes_name ON public.funding_schemes(name);
CREATE INDEX IF NOT EXISTS idx_funding_schemes_is_default ON public.funding_schemes(is_default);

-- Enable RLS
ALTER TABLE public.funding_schemes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active schemes
CREATE POLICY "Allow public read access to active schemes" 
    ON public.funding_schemes
    FOR SELECT 
    USING (is_active = true);

-- Allow authenticated users to manage schemes
CREATE POLICY "Allow authenticated users to insert schemes" 
    ON public.funding_schemes
    FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update schemes" 
    ON public.funding_schemes
    FOR UPDATE 
    USING (auth.role() = 'authenticated');
```

### Step 1.2: Add `funding_scheme_id` to Proposals

**File:** `supabase/migrations/add_funding_scheme_to_proposals.sql`

```sql
-- Add funding_scheme_id column (nullable for backward compatibility)
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS funding_scheme_id UUID REFERENCES public.funding_schemes(id);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_proposals_funding_scheme_id 
    ON public.proposals(funding_scheme_id);

-- Add dynamic_sections JSONB column for storing section content
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS dynamic_sections JSONB DEFAULT '{}'::jsonb;
```

### Step 1.3: Seed Default Template

**File:** `supabase/migrations/seed_default_funding_scheme.sql`

```sql
-- Insert default funding scheme template (matches current hardcoded sections)
INSERT INTO public.funding_schemes (name, description, is_default, template_json) 
VALUES (
    'Default Template',
    'Generic proposal template with standard sections (backward compatible)',
    true,
    '{
        "schemaVersion": "1.0",
        "sections": [
            {
                "key": "introduction",
                "label": "Introduction",
                "type": "textarea",
                "charLimit": null,
                "wordLimit": null,
                "mandatory": false,
                "order": 1,
                "description": "Project background and context"
            },
            {
                "key": "objectives",
                "label": "Objectives",
                "type": "textarea",
                "charLimit": null,
                "mandatory": false,
                "order": 2,
                "description": "Project objectives and goals"
            },
            {
                "key": "relevance",
                "label": "Relevance",
                "type": "textarea",
                "charLimit": null,
                "mandatory": true,
                "order": 3,
                "description": "Relevance to funding call"
            },
            {
                "key": "methods",
                "label": "Methodology",
                "type": "textarea",
                "charLimit": null,
                "mandatory": true,
                "order": 4,
                "description": "Methodology and approach"
            },
            {
                "key": "impact",
                "label": "Impact",
                "type": "textarea",
                "charLimit": null,
                "mandatory": true,
                "order": 5,
                "description": "Expected impact and outcomes"
            },
            {
                "key": "workPlan",
                "label": "Work Plan",
                "type": "textarea",
                "charLimit": null,
                "mandatory": false,
                "order": 6,
                "description": "Work plan and timeline"
            },
            {
                "key": "dissemination",
                "label": "Dissemination",
                "type": "textarea",
                "charLimit": null,
                "mandatory": false,
                "order": 7,
                "description": "Dissemination and communication strategy"
            }
        ],
        "metadata": {
            "totalCharLimit": null,
            "estimatedDuration": "2-3 hours"
        }
    }'::jsonb
)
ON CONFLICT (name) DO NOTHING;
```

### Step 1.4: Apply Migrations

**Commands:**
```bash
# Deploy to Supabase
npx supabase db push

# Or if using Supabase CLI locally
npx supabase migration up
```

**Testing:**
```sql
-- Verify table exists
SELECT * FROM public.funding_schemes;

-- Verify default template
SELECT name, is_default, template_json->'sections' as sections 
FROM public.funding_schemes 
WHERE is_default = true;
```

---

## **PHASE 2: TypeScript Types**
**Estimated Time:** 15-20 minutes  
**Priority:** HIGH ⚡

### Step 2.1: Create Funding Scheme Types

**File:** `types/funding-scheme.ts` (new file)

```typescript
/**
 * Funding Scheme Types
 * Defines structure for dynamic proposal templates
 */

export interface FundingSchemeSection {
  key: string; // "objectives", "relevance", "excellence"
  label: string; // "1. Objectives", "2. Relevance"
  type?: 'textarea' | 'richtext' | 'structured';
  charLimit?: number | null;
  wordLimit?: number | null;
  pageLimit?: number | null;
  mandatory: boolean;
  order: number;
  description?: string; // Helper text for users
  aiPrompt?: string; // Custom AI prompt for this section
  subsections?: FundingSchemeSection[];
}

export interface FundingSchemeTemplate {
  schemaVersion: string; // "1.0"
  sections: FundingSchemeSection[];
  metadata?: {
    totalCharLimit?: number;
    totalWordLimit?: number;
    estimatedDuration?: string;
    evaluationCriteria?: string;
  };
}

export interface FundingScheme {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  template_json: FundingSchemeTemplate;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParsedTemplate {
  fundingScheme: string;
  extractedFrom?: string;
  sections: FundingSchemeSection[];
  metadata?: {
    totalCharLimit?: number;
    estimatedDuration?: string;
  };
  needsReview: boolean;
}
```

### Step 2.2: Update Proposal Types

**File:** `types/proposal.ts` (modify existing)

Add at the top:
```typescript
import { FundingScheme } from './funding-scheme';
```

Update `FullProposal` interface:
```typescript
export interface FullProposal {
  // Core Fields
  id?: string;
  title: string;
  summary: string;

  // NEW: Funding Scheme Support
  funding_scheme_id?: string; // Link to funding scheme
  funding_scheme?: FundingScheme; // Populated on fetch
  dynamic_sections?: Record<string, string>; // { "excellence": "text...", "impact": "text..." }

  // Legacy hardcoded sections (keep for backward compatibility)
  relevance?: string;
  methods?: string;
  impact?: string;
  introduction?: string;
  objectives?: string;
  methodology?: string;
  expectedResults?: string;
  innovation?: string;
  sustainability?: string;
  consortium?: string;
  workPlan?: string;
  riskManagement?: string;
  dissemination?: string;

  // Structured Data (unchanged)
  partners: Partner[];
  workPackages: WorkPackage[];
  milestones: Milestone[];
  risks: Risk[];
  budget: BudgetItem[];
  timeline: TimelinePhase[];
  technicalOverview?: TechnicalLayer[] | string;

  // Metadata (unchanged)
  projectUrl?: string;
  selectedIdea?: Idea;
  generatedAt?: string;
  savedAt?: string;
  updatedAt?: string;
  settings?: ProposalSettings;
}
```

---

## **PHASE 3: AI Document Parser**
**Estimated Time:** 2-3 hours  
**Priority:** MEDIUM ⚡

### Step 3.1: Create Storage Bucket

**Supabase Dashboard:**
```
Storage → Create Bucket
Name: "funding-templates"
Public: false
```

**Or via SQL:**
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('funding-templates', 'funding-templates', false);

-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'funding-templates' AND auth.role() = 'authenticated');

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated reads" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'funding-templates' AND auth.role() = 'authenticated');
```

### Step 3.2: Create Edge Function

**File:** `supabase/functions/parse-funding-template/index.ts` (new file)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileUrl, fundingSchemeName } = await req.json()

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('funding-templates')
      .download(fileUrl)

    if (downloadError) throw downloadError

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Data = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    // Determine MIME type
    const mimeType = fileUrl.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') ?? '')
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    const prompt = `You are an expert at analyzing funding application guidelines and call documents.

Analyze this document and extract the application structure for a funding scheme.

For each section in the document, identify:
- Section name/title (e.g., "1. Excellence", "Part B - Impact")
- A unique key in snake_case (e.g., "excellence", "impact")
- Order/sequence number
- Character limit, word limit, or page limit (if specified)
- Whether it's mandatory or optional
- Any subsections (nested structure)
- Brief description of what's required in that section

Look for patterns like:
- "Section 1:", "Part A:", "Question 1:", "Criterion 1:"
- "Maximum 5000 characters", "Max 3 pages", "Word limit: 2000", "up to 10 pages"
- "Mandatory", "Required", "Optional", "If applicable", "Compulsory"

Common section names to look for:
- Excellence, Objectives, State of the Art, Methodology
- Impact, Dissemination, Exploitation
- Implementation, Work Plan, Resources, Consortium
- Budget, Budget Justification
- Ethics, Data Management

Return a structured JSON following this EXACT format (no other text):
{
  "fundingScheme": "${fundingSchemeName || 'Extracted Funding Scheme'}",
  "extractedFrom": "${fileUrl}",
  "sections": [
    {
      "key": "snake_case_key",
      "label": "1. Section Name",
      "charLimit": 5000,
      "wordLimit": null,
      "pageLimit": null,
      "mandatory": true,
      "order": 1,
      "description": "Brief description of what this section requires",
      "subsections": []
    }
  ],
  "metadata": {
    "totalCharLimit": null,
    "estimatedDuration": "3-4 hours"
  }
}

Be thorough and extract ALL sections mentioned in the document.
Return ONLY valid JSON, no markdown code blocks.`

    // Send document to Gemini for analysis
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      }
    ])

    const text = result.response.text()
    
    // Clean JSON response
    let cleanedText = text.trim()
    cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    
    const extracted = JSON.parse(cleanedText)

    // Return extracted template
    return new Response(
      JSON.stringify({
        success: true,
        template: extracted,
        needsReview: true
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error parsing template:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
```

### Step 3.3: Deploy Edge Function

**Commands:**
```bash
# Deploy function
npx supabase functions deploy parse-funding-template

# Test locally first
npx supabase functions serve parse-funding-template
```

---

## **PHASE 4: Admin UI - Template Management**
**Estimated Time:** 3-4 hours  
**Priority:** MEDIUM ⚡

### Step 4.1: Create Template Upload Component

**File:** `components/FundingSchemeTemplateParser.tsx` (new file)

```typescript
import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { Upload, Loader2, Sparkles, Check, X, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { ParsedTemplate, FundingSchemeSection } from '../types/funding-scheme'

export function FundingSchemeTemplateParser() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [extractedTemplate, setExtractedTemplate] = useState<ParsedTemplate | null>(null)
  const [editingSections, setEditingSections] = useState<FundingSchemeSection[]>([])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.match(/\.(pdf|docx?)$/i)) {
        toast.error('Please upload a PDF or DOCX file')
        return
      }
      setFile(selectedFile)
    }
  }

  const handleUploadAndParse = async () => {
    if (!file) return

    try {
      setUploading(true)
      setParsing(true)

      // 1. Upload file to Supabase Storage
      const fileName = `${Date.now()}_${file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('funding-templates')
        .upload(`raw/${fileName}`, file)

      if (uploadError) throw uploadError

      toast.success('File uploaded, analyzing with AI...')

      // 2. Call AI parser Edge Function
      const { data: parseResult, error: parseError } = await supabase.functions.invoke(
        'parse-funding-template',
        {
          body: {
            fileUrl: uploadData.path,
            fundingSchemeName: file.name.replace(/\.(pdf|docx?)$/i, '')
          }
        }
      )

      if (parseError) throw parseError
      if (!parseResult.success) throw new Error(parseResult.error)

      setExtractedTemplate(parseResult.template)
      setEditingSections(parseResult.template.sections)
      toast.success('Template extracted! Please review and edit.')

    } catch (error) {
      console.error('Error:', error)
      toast.error(`Failed to parse template: ${error.message}`)
    } finally {
      setUploading(false)
      setParsing(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!extractedTemplate) return

    try {
      const { error } = await supabase
        .from('funding_schemes')
        .insert({
          name: extractedTemplate.fundingScheme,
          template_json: {
            schemaVersion: '1.0',
            sections: editingSections,
            metadata: extractedTemplate.metadata
          },
          is_default: false,
          is_active: true
        })

      if (error) throw error

      toast.success('Funding scheme template saved!')
      
      // Reset form
      setFile(null)
      setExtractedTemplate(null)
      setEditingSections([])

    } catch (error) {
      console.error('Error saving:', error)
      toast.error(`Failed to save template: ${error.message}`)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold">Import Funding Scheme Template</h2>
        <p className="text-gray-600 mt-1">
          Upload PDF/DOCX application guidelines and let AI extract the structure
        </p>
      </div>

      {/* File Upload */}
      {!extractedTemplate && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors">
          <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <span className="text-blue-600 font-medium hover:underline">
              Choose a file
            </span>
            <span className="text-gray-600"> or drag and drop</span>
          </label>
          <p className="text-sm text-gray-500 mt-2">
            PDF or DOCX up to 10MB
          </p>
          
          {file && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg inline-block">
              <p className="text-sm font-medium text-blue-900">{file.name}</p>
              <p className="text-xs text-blue-600">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}
        </div>
      )}

      {/* Parse Button */}
      {file && !extractedTemplate && (
        <button
          onClick={handleUploadAndParse}
          disabled={uploading || parsing}
          className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {parsing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              AI is analyzing document...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Parse with AI
            </>
          )}
        </button>
      )}

      {/* Extracted Template Review */}
      {extractedTemplate && (
        <div className="border rounded-lg p-6 space-y-6 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              Extracted Template (Review & Edit)
            </h3>
            <button
              onClick={() => {
                setExtractedTemplate(null)
                setEditingSections([])
                setFile(null)
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scheme Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Funding Scheme Name
            </label>
            <input
              type="text"
              value={extractedTemplate.fundingScheme}
              onChange={(e) => setExtractedTemplate({
                ...extractedTemplate,
                fundingScheme: e.target.value
              })}
              className="w-full px-4 py-2 border rounded-lg"
            />
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <h4 className="font-medium">Sections ({editingSections.length})</h4>
            {editingSections.map((section, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 space-y-3">
                    {/* Label */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Label</label>
                      <input
                        type="text"
                        value={section.label}
                        onChange={(e) => {
                          const updated = [...editingSections]
                          updated[idx].label = e.target.value
                          setEditingSections(updated)
                        }}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>

                    {/* Limits */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Char Limit</label>
                        <input
                          type="number"
                          value={section.charLimit || ''}
                          onChange={(e) => {
                            const updated = [...editingSections]
                            updated[idx].charLimit = e.target.value ? parseInt(e.target.value) : null
                            setEditingSections(updated)
                          }}
                          className="w-full px-3 py-2 border rounded"
                          placeholder="None"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Word Limit</label>
                        <input
                          type="number"
                          value={section.wordLimit || ''}
                          onChange={(e) => {
                            const updated = [...editingSections]
                            updated[idx].wordLimit = e.target.value ? parseInt(e.target.value) : null
                            setEditingSections(updated)
                          }}
                          className="w-full px-3 py-2 border rounded"
                          placeholder="None"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Order</label>
                        <input
                          type="number"
                          value={section.order}
                          onChange={(e) => {
                            const updated = [...editingSections]
                            updated[idx].order = parseInt(e.target.value)
                            setEditingSections(updated)
                          }}
                          className="w-full px-3 py-2 border rounded"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={section.mandatory}
                            onChange={(e) => {
                              const updated = [...editingSections]
                              updated[idx].mandatory = e.target.checked
                              setEditingSections(updated)
                            }}
                            className="rounded"
                          />
                          <span className="text-sm">Mandatory</span>
                        </label>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Description</label>
                      <textarea
                        value={section.description || ''}
                        onChange={(e) => {
                          const updated = [...editingSections]
                          updated[idx].description = e.target.value
                          setEditingSections(updated)
                        }}
                        className="w-full px-3 py-2 border rounded"
                        rows={2}
                        placeholder="Helper text for users..."
                      />
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => {
                      const updated = editingSections.filter((_, i) => i !== idx)
                      setEditingSections(updated)
                    }}
                    className="ml-3 text-red-500 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveTemplate}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <Check className="h-5 w-5" />
            Save Funding Scheme Template
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## **PHASE 5: Proposal Generator Integration**
**Estimated Time:** 3-4 hours  
**Priority:** HIGH ⚡

### Step 5.1: Add Funding Scheme Selector to URL Input

**File:** `components/URLInputStep.tsx` (modify)

Add state for funding scheme:
```typescript
const [selectedScheme, setSelectedScheme] = useState<string | null>(null)
const [fundingSchemes, setFundingSchemes] = useState<FundingScheme[]>([])

useEffect(() => {
  loadFundingSchemes()
}, [])

async function loadFundingSchemes() {
  const { data } = await supabase
    .from('funding_schemes')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
  
  setFundingSchemes(data || [])
}
```

Add dropdown before submit:
```tsx
<div>
  <label className="block text-sm font-medium mb-2">
    Funding Scheme Template (Optional)
  </label>
  <select
    value={selectedScheme || ''}
    onChange={(e) => setSelectedScheme(e.target.value || null)}
    className="w-full px-4 py-2 border rounded-lg"
  >
    <option value="">Default Template</option>
    {fundingSchemes.map(scheme => (
      <option key={scheme.id} value={scheme.id}>
        {scheme.name}
      </option>
    ))}
  </select>
</div>
```

Pass to next step:
```typescript
onSubmit(result, url, prompt, selectedScheme)
```

### Step 5.2: Update AI Prompt Builder

**File:** `supabase/functions/server/prompt_builder.ts` (modify)

Update function signature:
```typescript
export function buildProposalPrompt(
  idea: any,
  summary: string,
  constraints: any,
  partners: any[] = [],
  userPrompt?: string,
  fundingScheme?: FundingScheme | null
): string
```

Add dynamic section handling:
```typescript
// If funding scheme is specified, use its sections
let sectionsPrompt = ''
if (fundingScheme) {
  sectionsPrompt = `
PROPOSAL STRUCTURE (${fundingScheme.name}):
The proposal MUST include the following sections:

${fundingScheme.template_json.sections.map(section => `
"${section.key}": "${section.label}"
  ${section.description ? `Description: ${section.description}` : ''}
  ${section.charLimit ? `Character Limit: ${section.charLimit}` : ''}
  ${section.mandatory ? 'MANDATORY' : 'Optional'}
  ${section.aiPrompt ? `Focus: ${section.aiPrompt}` : ''}
`).join('\n')}
  `
} else {
  // Use legacy format
  sectionsPrompt = `
PROPOSAL STRUCTURE (Default):
- relevance: Relevance to the funding call
- methods: Methodology and approach
- impact: Expected impact and outcomes
  `
}

return `You are an expert EU funding proposal writer.
${sectionsPrompt}
...rest of prompt
`
```

---

## **PHASE 6: Export & Display**
**Estimated Time:** 2-3 hours  
**Priority:** MEDIUM ⚡

### Step 6.1: Update DOCX Export

**File:** `utils/export-docx.ts` (modify)

```typescript
export async function exportToDocx(proposal: FullProposal) {
  const children: any[] = []

  // If using dynamic sections, export those
  if (proposal.funding_scheme_id && proposal.funding_scheme && proposal.dynamic_sections) {
    const sections = proposal.funding_scheme.template_json.sections

    sections.forEach(section => {
      const content = proposal.dynamic_sections[section.key]
      if (content) {
        children.push(createHeading(section.label, HeadingLevel.HEADING_1))
        children.push(createPara(content))
      }
    })
  } else {
    // Legacy export (current behavior)
    if (proposal.relevance) {
      children.push(createHeading('Relevance', HeadingLevel.HEADING_1))
      children.push(createPara(proposal.relevance))
    }
    // ... rest of legacy sections
  }

  // ... rest of export logic
}
```

---

## 🧪 Testing Strategy

### Unit Tests
- [ ] Database schema validation
- [ ] TypeScript type checking
- [ ] Funding scheme CRUD operations

### Integration Tests
- [ ] Upload PDF → AI extraction → Save template
- [ ] Create proposal with custom scheme
- [ ] Export proposal with dynamic sections

### End-to-End Tests
- [ ] Complete workflow: Upload template → Create proposal → Export DOCX
- [ ] Backward compatibility: Legacy proposals still work

---

## 📊 Success Metrics

- [ ] Can upload and parse PDF/DOCX templates
- [ ] AI extraction accuracy > 90%
- [ ] Zero breaking changes to existing proposals
- [ ] New proposals can use custom schemes
- [ ] Export works for both legacy and dynamic proposals

---

## 🚨 Risk Mitigation

### Risk 1: AI Extraction Errors
**Mitigation:** Always allow manual review/edit before saving

### Risk 2: Breaking Changes
**Mitigation:** All new fields are optional, legacy fields maintained

### Risk 3: Complex Document Structures
**Mitigation:** Start with simple templates, iterate

---

## 📅 Timeline

**Total Estimated Time:** 10-15 hours

- **Phase 1:** 45 min
- **Phase 2:** 20 min
- **Phase 3:** 3 hours
- **Phase 4:** 4 hours
- **Phase 5:** 4 hours
- **Phase 6:** 3 hours

**Recommended Schedule:**
- Day 1: Phases 1-2 (Database + Types)
- Day 2: Phase 3 (AI Parser)
- Day 3: Phases 4-5 (UI + Integration)
- Day 4: Phase 6 + Testing

---

## ✅ Rollback Plan

If anything goes wrong:
```bash
# Revert to backup commit
git reset --hard 542da0c

# Or create new branch for experimentation
git checkout -b feature/dynamic-funding-schemes
```

---

## 📝 Next Steps

1. ✅ Review this implementation plan
2. ⏳ Proceed with Phase 1 (Database)
3. ⏳ Deploy and test each phase incrementally

---

**Questions or concerns?** Review each phase carefully before proceeding.
