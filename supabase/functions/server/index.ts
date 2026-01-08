// Main server with full AI proposal generation
// Uses Deno.serve pattern (proven to work with Supabase Edge Functions)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';
import { GoogleAIFileManager } from 'npm:@google/generative-ai/server';
import { Buffer } from 'node:buffer';
import * as KV from './kv_store.ts';
import * as PromptBuilder from './prompt_builder.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const getSupabaseClient = () => {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    return createClient(url, key);
};

const getAI = () => {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
        console.error('CRITICAL: GEMINI_API_KEY is missing');
        throw new Error('GEMINI_API_KEY not set in Supabase Secrets');
    }

    return new GoogleGenerativeAI(apiKey);
};

const getFileManager = () => {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    return new GoogleAIFileManager(apiKey);
};

const ensureBucket = async (bucketName: string) => {
    const supabase = getSupabaseClient();

    // Check if bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
        console.log(`Creating bucket: ${bucketName}`);
        const { error } = await supabase.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 52428800, // 50MB
        });

        if (error) {
            console.error(`Failed to create bucket ${bucketName}:`, error);
        }
    }
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Diagnostic endpoint
    if (path.includes('/test-ai')) {
        try {
            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent('Say hello');
            return new Response(
                JSON.stringify({
                    success: true,
                    message: result.response.text(),
                    apiKeyPrefix: Deno.env.get('GEMINI_API_KEY')?.substring(0, 8)
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (error: any) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: error.message,
                    details: error.toString(),
                    apiKeyPrefix: Deno.env.get('GEMINI_API_KEY')?.substring(0, 8)
                }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    try {
        // ===== HEALTH CHECK =====
        if (path === '/' || path === '') {
            return new Response(
                JSON.stringify({ status: 'ok', message: 'AI Proposal Generator API v2' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== PHASE 1: ANALYZE URL & GENERATE IDEAS =====
        if (path.includes('/analyze-url') && req.method === 'POST') {
            const { url: targetUrl, userPrompt } = await req.json();

            // Fetch URL content
            let content = '';
            try {
                const res = await fetch(targetUrl);
                content = await res.text();
                content = content.substring(0, 20000); // Limit to 20k chars
            } catch (e) {
                content = 'Could not fetch URL content. Please rely on user prompt.';
            }

            const ai = getAI();

            // Phase 1: Extract summary and constraints
            const phase1Prompt = `Analyze this funding call and extract key information.
${userPrompt ? `\nUSER PROVIDED INSTRUCTIONS/TEXT (PARALLEL TO OR REPLACING URL CONTENT):\n${userPrompt}\n` : ''}
URL: ${targetUrl}
CONTENT: ${content.substring(0, 5000)}

Extract:
1. A summary of the funding opportunity (incorporating user instructions if provided)
2. Partner requirements
3. Budget range (If the user specifies a specific budget, use that EXACTLY)
4. Project duration (If the user specifies a specific duration, use that EXACTLY)

Return JSON:
{
  "summary": "Summary of the opportunity",
  "constraints": {
    "partners": "e.g., 3-5 partners required",
    "budget": "e.g., €500,000",
    "duration": "e.g., 24 months"
  }
}

Return ONLY valid JSON, no other text.`;

            let phase1Data;
            try {
                const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
                const phase1Result = await model.generateContent(phase1Prompt);
                const phase1Text = phase1Result.response.text();
                phase1Data = JSON.parse(phase1Text.replace(/```json/g, '').replace(/```/g, '').trim());
            } catch (error: any) {
                console.error('Phase 1 failed:', error);
                return new Response(
                    JSON.stringify({
                        error: 'Analysis failed (Phase 1)',
                        message: error.message,
                        model: 'gemini-2.0-flash',
                        hint: 'This error often occurs if the Gemini model name is invalid or the API key is not authorized for this specific model.'
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Phase 2: Generate ideas
            let phase2Data;
            try {
                const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
                const phase2Prompt = PromptBuilder.buildPhase2Prompt(
                    phase1Data.summary,
                    phase1Data.constraints,
                    userPrompt
                );

                const phase2Result = await model.generateContent(phase2Prompt);
                const phase2Text = phase2Result.response.text();
                phase2Data = JSON.parse(phase2Text.replace(/```json/g, '').replace(/```/g, '').trim());
            } catch (error: any) {
                console.error('Phase 2 failed:', error);
                return new Response(
                    JSON.stringify({
                        error: 'Idea generation failed (Phase 2)',
                        message: error.message,
                        model: 'gemini-2.0-flash'
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({
                    summary: phase1Data.summary,
                    constraints: phase1Data.constraints,
                    ideas: phase2Data.ideas
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== PHASE 2: ANALYZE RELEVANCE =====
        if (path.includes('/analyze-relevance') && req.method === 'POST') {
            const { url: targetUrl, constraints, ideas, userPrompt } = await req.json();

            // Re-fetch URL content for validation
            let content = '';
            try {
                const res = await fetch(targetUrl);
                content = await res.text();
            } catch (e) {
                content = '';
            }

            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const prompt = PromptBuilder.buildRelevancePrompt(
                targetUrl,
                content,
                constraints,
                ideas,
                userPrompt
            );

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

            return new Response(
                JSON.stringify(data),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== PHASE 3: GENERATE PROPOSAL =====
        if (path.includes('/generate-proposal') && req.method === 'POST') {
            const { idea, summary, constraints, selectedPartners = [], userPrompt, fundingSchemeId } = await req.json();

            // Load partner details if provided
            const partners = [];
            if (selectedPartners.length > 0) {
                const supabase = getSupabaseClient();
                const { data: dbPartners } = await supabase
                    .from('partners')
                    .select('*')
                    .in('id', selectedPartners);

                if (dbPartners) {
                    // Map to camelCase for the prompt builder
                    partners.push(...dbPartners.map(p => ({
                        id: p.id,
                        name: p.name,
                        acronym: p.acronym,
                        country: p.country,
                        description: p.description,
                        experience: p.experience,
                        relevantProjects: p.relevant_projects,
                        isCoordinator: selectedPartners.indexOf(p.id) === 0 // Assuming first one is coordinator for now or check a role
                    })));
                }

                // Fallback to KV if any missing (for transition)
                for (const partnerId of selectedPartners) {
                    if (!partners.find(p => p.id === partnerId)) {
                        const kvPartner = await KV.get(`partner:${partnerId}`);
                        if (kvPartner) partners.push(kvPartner);
                    }
                }
            }

            // Load funding scheme if selected
            let fundingScheme = null;
            if (fundingSchemeId) {
                const supabase = getSupabaseClient();
                const { data } = await supabase
                    .from('funding_schemes')
                    .select('*')
                    .eq('id', fundingSchemeId)
                    .single();
                fundingScheme = data;
            }

            const ai = getAI();
            const model = ai.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    temperature: 0.1,
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ]
            });

            const prompt = PromptBuilder.buildProposalPrompt(
                idea,
                summary,
                constraints,
                partners,
                userPrompt,
                fundingScheme
            );

            console.log(`🚀 Generating proposal with Gemini 2.0 Flash. Prompt length: ${prompt.length} chars`);

            const result = await model.generateContent(prompt);
            const text = result.response.text();

            if (!text) {
                throw new Error("AI returned an empty response. This might be due to a safety filter or model timeout.");
            }
            console.log(`✅ AI responded with ${text.length} characters.`);

            let proposal;
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                proposal = JSON.parse(cleanedText);
            } catch (parseError: any) {
                console.error('Initial JSON parse failed. Attempting repair...', parseError.message);

                // Truncation repair: Attempting to close open JSON structures
                let repairedText = cleanedText;

                // Remove trailing garbage that would prevent closing braces from working
                repairedText = repairedText
                    .replace(/,\s*$/, '')      // Remove trailing comma
                    .replace(/:\s*$/, '')      // Remove trailing colon
                    .replace(/:\s*"[^"]*$/, '') // Remove trailing key that has an open quote value
                    .replace(/,\s*"[^"]*$/, '') // Remove trailing key that was just started
                    .replace(/"\s*$/, '');     // Remove trailing open quote

                // If it ends with a key start like "key
                repairedText = repairedText.replace(/"[^"]+$/, '');

                // Count braces and brackets to close them
                const openBraces = (repairedText.match(/{/g) || []).length;
                const closeBraces = (repairedText.match(/}/g) || []).length;
                const openBrackets = (repairedText.match(/\[/g) || []).length;
                const closeBrackets = (repairedText.match(/\]/g) || []).length;

                let repairSuffix = '';
                for (let i = 0; i < (openBrackets - closeBrackets); i++) repairSuffix += ']';
                for (let i = 0; i < (openBraces - closeBraces); i++) repairSuffix += '}';

                try {
                    proposal = JSON.parse(repairedText + repairSuffix);
                    console.log('Advanced JSON repair successful!');
                } catch (secondError: any) {
                    console.error('Advanced JSON repair failed:', secondError.message);
                    // Final attempt: Very aggressive truncation to last good property
                    try {
                        const lastGoodIndex = repairedText.lastIndexOf('",');
                        if (lastGoodIndex !== -1) {
                            repairedText = repairedText.substring(0, lastGoodIndex + 1);
                            const oBraces = (repairedText.match(/{/g) || []).length;
                            const cBraces = (repairedText.match(/}/g) || []).length;
                            const oBrackets = (repairedText.match(/\[/g) || []).length;
                            const cBrackets = (repairedText.match(/\]/g) || []).length;

                            let finalSuffix = '';
                            for (let i = 0; i < (oBrackets - cBrackets); i++) finalSuffix += ']';
                            for (let i = 0; i < (oBraces - cBraces); i++) finalSuffix += '}';
                            proposal = JSON.parse(repairedText + finalSuffix);
                            console.log('Aggressive JSON repair successful!');
                        } else {
                            throw new Error('Could not find a safe truncation point.');
                        }
                    } catch (finalError) {
                        throw new Error(`AI generated a response that was too long or malformed. Length: ${text.length} chars. Error: ${parseError.message}`);
                    }
                }
            }

            // Add the prompt to the proposal object
            proposal.generationPrompt = prompt;

            // Add metadata
            proposal.id = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            proposal.selectedIdea = idea;
            proposal.generatedAt = new Date().toISOString();
            proposal.savedAt = new Date().toISOString();
            proposal.updatedAt = new Date().toISOString();

            // Add funding scheme metadata
            if (fundingSchemeId) {
                proposal.funding_scheme_id = fundingSchemeId;
            }
            if (proposal.dynamicSections) {
                proposal.dynamic_sections = proposal.dynamicSections; // Normalize key
                delete proposal.dynamicSections;
            }

            // Initialize settings with constraints
            const customParams = [];
            if (constraints.budget) customParams.push({ key: 'Max Budget', value: constraints.budget });
            if (constraints.duration) customParams.push({ key: 'Duration', value: constraints.duration });
            if (constraints.partners) customParams.push({ key: 'Partner Requirements', value: constraints.partners });

            proposal.settings = {
                currency: 'EUR',
                sourceUrl: '',
                customParams: customParams
            };

            // Auto-save
            await KV.set(proposal.id, proposal);

            // Also save to Supabase "proposals" table for backup/persistence if needed
            // (Optional improvement for later, keeping KV consistency for now)

            return new Response(
                JSON.stringify(proposal),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== PROPOSAL CRUD =====

        // GET /proposals - List all
        if (path.includes('/proposals') && req.method === 'GET' && !path.match(/\/proposals\/[^\/]+$/)) {
            const proposals = await KV.getByPrefix('proposal-');
            return new Response(
                JSON.stringify({
                    proposals: proposals.sort((a: any, b: any) =>
                        new Date(b.savedAt || b.generatedAt).getTime() - new Date(a.savedAt || a.generatedAt).getTime()
                    )
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /proposals/:id - Get single
        if (path.match(/\/proposals\/[^\/]+$/) && req.method === 'GET') {
            const id = path.split('/').pop();
            const proposal = await KV.get(id!);

            if (!proposal) {
                return new Response(
                    JSON.stringify({ error: 'Proposal not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify(proposal),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /proposals - Create/save
        if (path.includes('/proposals') && req.method === 'POST' && !path.includes('/ai-edit')) {
            const body = await req.json();
            const id = body.id || `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const proposal = {
                ...body,
                id,
                savedAt: body.savedAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await KV.set(id, proposal);

            return new Response(
                JSON.stringify(proposal),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // PUT /proposals/:id - Update
        if (path.match(/\/proposals\/[^\/]+$/) && req.method === 'PUT') {
            const id = path.split('/').pop();
            const existing = await KV.get(id!);

            if (!existing) {
                return new Response(
                    JSON.stringify({ error: 'Proposal not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const updates = await req.json();
            const updated = {
                ...existing,
                ...updates,
                updatedAt: new Date().toISOString(),
            };

            await KV.set(id!, updated);

            return new Response(
                JSON.stringify(updated),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // DELETE /proposals/:id
        if (path.match(/\/proposals\/[^\/]+$/) && req.method === 'DELETE') {
            const id = path.split('/').pop();
            await KV.del(id!);

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== PARTNER CRUD =====

        // GET /partners - List all
        if (path.includes('/partners') && req.method === 'GET' && !path.match(/\/partners\/[^\/]+$/)) {
            const supabase = getSupabaseClient();
            const { data: partners, error } = await supabase
                .from('partners')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Simple map back to camelCase for minimal fields used in listing
            const mappedPartners = partners.map(p => ({
                id: p.id,
                name: p.name,
                acronym: p.acronym,
                country: p.country,
                logoUrl: p.logo_url,
                contactPersonName: p.contact_person_name,
                contactPersonPhone: p.contact_person_phone,
                contactPersonEmail: p.contact_person_email,
                contactEmail: p.contact_email,
                organizationType: p.organization_type,
                createdAt: p.created_at
            }));

            // Fallback: also get from KV (for transition)
            const kvPartners = await KV.getByPrefix('partner:');
            const allPartners = [...mappedPartners];
            kvPartners.forEach(kvp => {
                if (!allPartners.find(p => p.id === kvp.id)) {
                    allPartners.push(kvp);
                }
            });

            return new Response(
                JSON.stringify({ partners: allPartners }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /partners/:id - Get single
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'GET') {
            const id = path.split('/').pop();
            const supabase = getSupabaseClient();

            const { data: p, error } = await supabase
                .from('partners')
                .select('*')
                .eq('id', id)
                .single();

            if (p) {
                // Map snake_case to camelCase
                const partner = {
                    id: p.id,
                    name: p.name,
                    legalNameNational: p.legal_name_national,
                    acronym: p.acronym,
                    organisationId: p.organisation_id,
                    pic: p.pic,
                    vatNumber: p.vat_number,
                    businessId: p.business_id,
                    organizationType: p.organization_type,
                    isPublicBody: p.is_public_body,
                    isNonProfit: p.is_non_profit,
                    country: p.country,
                    legalAddress: p.legal_address,
                    city: p.city,
                    postcode: p.postcode,
                    region: p.region,
                    contactEmail: p.contact_email,
                    website: p.website,
                    description: p.description,
                    department: p.department,
                    keywords: p.keywords,
                    logoUrl: p.logo_url,
                    pdfUrl: p.pdf_url,
                    legalRepName: p.legal_rep_name,
                    legalRepPosition: p.legal_rep_position,
                    legalRepEmail: p.legal_rep_email,
                    legalRepPhone: p.legal_rep_phone,
                    contactPersonName: p.contact_person_name,
                    contactPersonPosition: p.contact_person_position,
                    contactPersonEmail: p.contact_person_email,
                    contactPersonPhone: p.contact_person_phone,
                    contactPersonRole: p.contact_person_role,
                    experience: p.experience,
                    staffSkills: p.staff_skills,
                    relevantProjects: p.relevant_projects,
                    createdAt: p.created_at
                };

                return new Response(
                    JSON.stringify(partner),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Fallback to KV
            const kvPartner = await KV.get(`partner:${id}`);
            if (kvPartner) {
                return new Response(
                    JSON.stringify(kvPartner),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({ error: 'Partner not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /partners - Create
        if (path.includes('/partners') && req.method === 'POST' && !path.includes('/upload')) {
            const body = await req.json();
            const supabase = getSupabaseClient();

            // Map camelCase to snake_case
            const dbPartner = {
                name: body.name,
                legal_name_national: body.legalNameNational,
                acronym: body.acronym,
                organisation_id: body.organisationId,
                pic: body.pic,
                vat_number: body.vatNumber,
                business_id: body.businessId,
                organization_type: body.organizationType,
                is_public_body: body.isPublicBody,
                is_non_profit: body.isNonProfit,
                country: body.country,
                legal_address: body.legalAddress,
                city: body.city,
                postcode: body.postcode,
                region: body.region,
                contact_email: body.contactEmail,
                website: body.website,
                description: body.description,
                department: body.department,
                keywords: body.keywords,
                logo_url: body.logoUrl,
                pdf_url: body.pdfUrl,
                legal_rep_name: body.legalRepName,
                legal_rep_position: body.legalRepPosition,
                legal_rep_email: body.legalRepEmail,
                legal_rep_phone: body.legalRepPhone,
                contact_person_name: body.contactPersonName,
                contact_person_position: body.contactPersonPosition,
                contact_person_email: body.contactPersonEmail,
                contact_person_phone: body.contactPersonPhone,
                contact_person_role: body.contactPersonRole,
                experience: body.experience,
                staff_skills: body.staffSkills,
                relevant_projects: body.relevantProjects
            };

            const { data, error } = await supabase
                .from('partners')
                .insert(dbPartner)
                .select()
                .single();

            if (error) throw error;

            return new Response(
                JSON.stringify({ ...body, id: data.id, createdAt: data.created_at }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // PUT /partners/:id - Update
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'PUT') {
            const id = path.split('/').pop();
            const body = await req.json();
            const supabase = getSupabaseClient();

            // Map camelCase to snake_case
            const dbPartner = {
                name: body.name,
                legal_name_national: body.legalNameNational,
                acronym: body.acronym,
                organisation_id: body.organisationId,
                pic: body.pic,
                vat_number: body.vatNumber,
                business_id: body.businessId,
                organization_type: body.organizationType,
                is_public_body: body.isPublicBody,
                is_non_profit: body.isNonProfit,
                country: body.country,
                legal_address: body.legalAddress,
                city: body.city,
                postcode: body.postcode,
                region: body.region,
                contact_email: body.contactEmail,
                website: body.website,
                description: body.description,
                department: body.department,
                keywords: body.keywords,
                logo_url: body.logoUrl,
                pdf_url: body.pdfUrl,
                legal_rep_name: body.legalRepName,
                legal_rep_position: body.legalRepPosition,
                legal_rep_email: body.legalRepEmail,
                legal_rep_phone: body.legalRepPhone,
                contact_person_name: body.contactPersonName,
                contact_person_position: body.contactPersonPosition,
                contact_person_email: body.contactPersonEmail,
                contact_person_phone: body.contactPersonPhone,
                contact_person_role: body.contactPersonRole,
                experience: body.experience,
                staff_skills: body.staffSkills,
                relevant_projects: body.relevantProjects
            };

            const { error } = await supabase
                .from('partners')
                .update(dbPartner)
                .eq('id', id);

            if (error) {
                // Check if it was in KV and needs to be migrated?
                // For now just error if DB update fails and it's not a UUID
                throw error;
            }

            return new Response(
                JSON.stringify({ ...body, id }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // DELETE /partners/:id
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'DELETE') {
            const id = path.split('/').pop();
            const supabase = getSupabaseClient();

            await supabase.from('partners').delete().eq('id', id);
            await KV.del(`partner:${id}`); // Also delete from KV if it was there

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /partners/:id/upload-logo
        if (path.match(/\/partners\/[^\/]+\/upload-logo$/) && req.method === 'POST') {
            const id = path.split('/')[2];
            const formData = await req.formData();
            const file = formData.get('file');

            if (!file) {
                return new Response(
                    JSON.stringify({ error: 'No file uploaded' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const supabase = getSupabaseClient();
            await ensureBucket('partner-assets');

            const fileName = `${id}/logo-${Date.now()}`;
            const { data, error } = await supabase.storage
                .from('partner-assets')
                .upload(fileName, file, {
                    contentType: (file as File).type,
                    upsert: true
                });

            if (error) {
                throw new Error(`Upload error: ${error.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('partner-assets')
                .getPublicUrl(fileName);

            // Update partner record
            const { error: dbError } = await supabase
                .from('partners')
                .update({ logo_url: publicUrl })
                .eq('id', id);

            if (dbError) {
                // Fallback to KV if DB fails (e.g. if it's a legacy KV partner)
                const partner = await KV.get(`partner:${id}`);
                if (partner) {
                    partner.logoUrl = publicUrl;
                    await KV.set(`partner:${id}`, partner);
                }
            }

            return new Response(
                JSON.stringify({ url: publicUrl }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /partners/:id/upload-pdf
        if (path.match(/\/partners\/[^\/]+\/upload-pdf$/) && req.method === 'POST') {
            const id = path.split('/')[2];
            const formData = await req.formData();
            const file = formData.get('file');

            if (!file) {
                return new Response(
                    JSON.stringify({ error: 'No file uploaded' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const supabase = getSupabaseClient();
            await ensureBucket('partner-assets');

            const fileName = `${id}/pdf-${Date.now()}`;
            const { data, error } = await supabase.storage
                .from('partner-assets')
                .upload(fileName, file, {
                    contentType: (file as File).type,
                    upsert: true
                });

            if (error) {
                throw new Error(`Upload error: ${error.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('partner-assets')
                .getPublicUrl(fileName);

            // Update partner record
            const { error: dbError } = await supabase
                .from('partners')
                .update({ pdf_url: publicUrl })
                .eq('id', id);

            if (dbError) {
                // Fallback to KV
                const partner = await KV.get(`partner:${id}`);
                if (partner) {
                    partner.pdfUrl = publicUrl;
                    await KV.set(`partner:${id}`, partner);
                }
            }

            return new Response(
                JSON.stringify({ url: publicUrl }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /import-partner-pdf
        if (path.includes('/import-partner-pdf') && req.method === 'POST') {
            console.log('=== PDF IMPORT ENDPOINT HIT ===');

            try {
                const formData = await req.formData();
                const file = formData.get('file');

                if (!file || !(file instanceof File)) {
                    return new Response(
                        JSON.stringify({ error: 'No PDF file uploaded' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                console.log('Processing file:', file.name, file.size);

                // Write to temp file for upload
                const tempFilePath = `/tmp/${file.name}`;
                const arrayBuffer = await file.arrayBuffer();
                await Deno.writeFile(tempFilePath, new Uint8Array(arrayBuffer));

                console.log('Uploading to Gemini File API...');
                const fileManager = getFileManager();
                const uploadResponse = await fileManager.uploadFile(tempFilePath, {
                    mimeType: 'application/pdf',
                    displayName: file.name,
                });

                console.log(`Uploaded file ${uploadResponse.file.displayName} as: ${uploadResponse.file.uri}`);

                // AI Parsing
                const ai = getAI();
                // Reverting to 2.0-flash-exp as requested
                const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

                const prompt = `Extract all possible partner organization information from the attached PDF file (PIF - Partner Information Form).
                
                Be thorough. Extract:
                - Legal Name and Acronym
                - OID / PIC / Organisation ID
                - VAT Number and Business Registration ID
                - Organisation ID (OID or PIC number)
                - VAT Number (VAT)
                - Business Registration ID (National ID)
                - Organization Type. CRITICAL: You MUST map the organization type to EXACTLY ONE of the following permitted values (case-sensitive):
                  * Accreditation, certification or qualification body
                  * Counselling body
                  * European grouping of territorial cooperation
                  * European or international public body
                  * Foundation
                  * Higher education institution (tertiary level)
                  * Large enterprise
                  * Local Public body
                  * National Public body
                  * National Youth Council
                  * Non-governmental organisation/association
                  * Organisation or association representing (parts of) the sport sector
                  * Public service provider
                  * Regional Public body
                  * Research Institute/Centre
                  * School/Institute/Educational centre – Adult education
                  * School/Institute/Educational centre – General education (pre-primary level)
                  * School/Institute/Educational centre – General education (primary level)
                  * School/Institute/Educational centre – General education (secondary level)
                  * School/Institute/Educational centre – Vocational Training (secondary level)
                  * School/Institute/Educational centre – Vocational Training (tertiary level)
                  * Small and medium sized enterprise
                  * Social enterprise
                  * Social partner or other representative of working life (chambers of commerce, trade union, trade association)
                  * Sport club
                  * Sport federation
                  * Sport league
                  * Youth organisation
                  If the value is not found or not clear, pick the most logically similar one from this list. Do not use any other values.
                - Public Body (boolean) and Non-profit (boolean) status
                - Legal Address (Street), City, Postcode, Country, Region
                - Department or Unit name
                - Website and Main Contact Email
                - Brief Description (summary of organization)
                - Expertise, Experience, staff skills, and previous relevant projects
                - Contact Person details (Name, Email, Phone, Role)

                Return ONLY a valid JSON object. 
                CRITICAL: For fields where data is not found in the PDF, return an empty string "" instead of null or omitting the field.
                
                {
                  "name": "full legal name",
                  "acronym": "acronym (string or empty)",
                  "organisationId": "OID/PIC (string or empty)",
                  "vatNumber": "VAT (string or empty)",
                  "businessId": "Business ID (string or empty)",
                  "organizationType": "SME/University/etc",
                  "isPublicBody": true/false,
                  "isNonProfit": true/false,
                  "legalAddress": "street address",
                  "city": "city",
                  "postcode": "postcode",
                  "country": "country",
                  "region": "region",
                  "website": "URL",
                  "contactEmail": "general email",
                  "department": "department name",
                  "description": "summary text",
                  "experience": "detailed experience",
                  "staffSkills": "personnel skills",
                  "relevantProjects": "list of projects",
                  "keywords": ["kw1", "kw2"],
                  "contactPersonName": "name",
                  "contactPersonEmail": "email",
                  "contactPersonPhone": "phone",
                  "contactPersonRole": "role"
                }`;


                let result;
                try {
                    result = await model.generateContent([
                        prompt,
                        {
                            fileData: {
                                mimeType: uploadResponse.file.mimeType,
                                fileUri: uploadResponse.file.uri
                            }
                        }
                    ]);
                } catch (aiError: any) {
                    console.error('Gemini multimodal error:', aiError);
                    throw new Error(`AI processing failed: ${aiError.message}`);
                } finally {
                    // Cleanup temp file
                    try {
                        await Deno.remove(tempFilePath);
                    } catch (e) {
                        console.error('Failed to cleanup temp file:', e);
                    }
                }
                let responseText = result.response.text().trim();

                // Remove markdown if present
                if (responseText.startsWith('```')) {
                    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                }

                // Extract just the JSON object - find first { and matching }
                const start = responseText.indexOf('{');
                if (start === -1) {
                    throw new Error('No JSON object found in response');
                }

                // Find the matching closing brace
                let braceCount = 0;
                let end = start;
                for (let i = start; i < responseText.length; i++) {
                    if (responseText[i] === '{') braceCount++;
                    if (responseText[i] === '}') braceCount--;
                    if (braceCount === 0) {
                        end = i;
                        break;
                    }
                }

                const jsonText = responseText.substring(start, end + 1);
                console.log('Extracted JSON length:', jsonText.length);

                const extractedData = JSON.parse(jsonText);
                console.log('Parsed partner:', extractedData.name);

                // Create Partner
                const id = `partner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const newPartner = { ...extractedData, id, createdAt: new Date().toISOString() };

                // Upload PDF
                const supabase = getSupabaseClient();
                await ensureBucket('partner-assets');

                const fileName = `${id}/profile-${Date.now()}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('partner-assets')
                    .upload(fileName, file, { contentType: file.type, upsert: true });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('partner-assets')
                        .getPublicUrl(fileName);
                    newPartner.pdfUrl = publicUrl;
                }

                // Map to snake_case for DB insert
                const dbPartner = {
                    name: newPartner.name,
                    legal_name_national: newPartner.legalNameNational,
                    acronym: newPartner.acronym,
                    organisation_id: newPartner.organisationId,
                    pic: newPartner.pic,
                    vat_number: newPartner.vatNumber,
                    business_id: newPartner.businessId,
                    organization_type: newPartner.organizationType,
                    is_public_body: newPartner.isPublicBody,
                    is_non_profit: newPartner.isNonProfit,
                    country: newPartner.country,
                    legal_address: newPartner.legalAddress,
                    city: newPartner.city,
                    postcode: newPartner.postcode,
                    region: newPartner.region,
                    contact_email: newPartner.contactEmail,
                    website: newPartner.website,
                    description: newPartner.description,
                    department: newPartner.department,
                    keywords: newPartner.keywords,
                    logo_url: newPartner.logoUrl,
                    pdf_url: newPartner.pdfUrl,
                    legal_rep_name: newPartner.legalRepName,
                    legal_rep_position: newPartner.legalRepPosition,
                    legal_rep_email: newPartner.legalRepEmail,
                    legal_rep_phone: newPartner.legalRepPhone,
                    contact_person_name: newPartner.contactPersonName,
                    contact_person_position: newPartner.contactPersonPosition,
                    contact_person_email: newPartner.contactPersonEmail,
                    contact_person_phone: newPartner.contactPersonPhone,
                    contact_person_role: newPartner.contactPersonRole,
                    experience: newPartner.experience,
                    staff_skills: newPartner.staffSkills,
                    relevant_projects: newPartner.relevantProjects
                };

                const { data: savedData, error: saveError } = await supabase
                    .from('partners')
                    .insert(dbPartner)
                    .select()
                    .single();

                if (saveError) {
                    console.error('Failed to save to DB, falling back to KV:', saveError);
                    await KV.set(`partner:${id}`, newPartner);
                }

                return new Response(
                    JSON.stringify({
                        partnerId: savedData?.id || id,
                        partner: savedData ? {
                            ...newPartner,
                            id: savedData.id,
                            createdAt: savedData.created_at
                        } : newPartner
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } catch (error: any) {
                console.error('Import error:', error);
                return new Response(
                    JSON.stringify({ error: error?.message || 'Import failed' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // POST /proposals/:id/ai-edit - AI editing
        if (path.includes('/ai-edit') && req.method === 'POST') {
            const match = path.match(/\/proposals\/([^\/]+)\/ai-edit/);
            const id = match ? match[1] : null;
            if (!id) {
                return new Response(
                    JSON.stringify({ error: 'Invalid proposal ID in path' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
            const { instruction } = await req.json();

            const proposal = await KV.get(id);
            if (!proposal) {
                return new Response(
                    JSON.stringify({ error: 'Proposal not found' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

            // Step 1: Determine which section to edit
            const detectionPrompt = `Given this user instruction: "${instruction}"

Which ONE section of the proposal should be edited?

Available sections:
- title, summary, relevance, methods, impact
- introduction, objectives, methodology, expectedResults
- innovation, sustainability, consortium, workPlan, riskManagement
- dissemination

Return JSON: { "section": "sectionName" }

Return ONLY valid JSON, no other text.`;

            const detectResult = await model.generateContent(detectionPrompt);
            const detectText = detectResult.response.text();
            const { section } = JSON.parse(detectText.replace(/```json/g, '').replace(/```/g, '').trim());

            // Step 2: Regenerate that section
            const editPrompt = `Current content of ${section}: ${JSON.stringify(proposal[section])}

User instruction: ${instruction}

Generate the NEW content for this section only. Maintain the same format (HTML string if it was HTML, array if it was array, etc.).

Return JSON: { "content": ... }

Return ONLY valid JSON, no other text.`;

            const editResult = await model.generateContent(editPrompt);
            const editText = editResult.response.text();
            const { content } = JSON.parse(editText.replace(/```json/g, '').replace(/```/g, '').trim());

            // Update proposal
            proposal[section] = content;
            proposal.updatedAt = new Date().toISOString();
            await KV.set(id, proposal);

            return new Response(
                JSON.stringify({ proposal, editedSection: section }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /generate-section - Generate new proposal section with AI
        if (path.includes('/generate-section') && req.method === 'POST') {
            const { sectionTitle, proposalContext, existingSections } = await req.json();

            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const prompt = `You are generating a new section for a research/project proposal.

SECTION TO CREATE: "${sectionTitle}"

PROPOSAL CONTEXT:
${proposalContext}

EXISTING SECTIONS:
${existingSections.join(', ')}

Generate comprehensive, professional content for the "${sectionTitle}" section.

Requirements:
- Write 3-5 well-structured paragraphs
- Use HTML formatting (<p>, <strong>, <ul>, <li> tags)
- Make it relevant to the proposal context
- Use professional, academic language
- Include specific details and examples where appropriate
- Ensure it complements existing sections without repeating content

Return JSON:
{
  "title": "${sectionTitle}",
  "content": "<p>HTML formatted content here...</p>"
}

Return ONLY valid JSON, no other text.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

            return new Response(
                JSON.stringify(data),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ===== SEED ENDPOINTS =====
        if (path.includes('/seed-sources-simple')) {
            return new Response(
                JSON.stringify({ message: 'Seeded' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (path.includes('/seed-partner-search-sources')) {
            return new Response(
                JSON.stringify({ message: 'Seeded' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Default 404
        return new Response(
            JSON.stringify({ error: 'Not found', path }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Server error:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', JSON.stringify(error, null, 2));

        // Special handling for API quota errors
        if (error.message && error.message.includes('429')) {
            return new Response(
                JSON.stringify({ error: '⏰ API Quota Limit Reached. Please try again later or use your own API key.' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error', details: error.toString() }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
