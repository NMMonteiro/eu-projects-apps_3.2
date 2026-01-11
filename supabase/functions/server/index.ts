// Main server with full AI proposal generation
// Uses Deno.serve pattern (proven to work with Supabase Edge Functions)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';
import { GoogleAIFileManager } from 'npm:@google/generative-ai/server';
import { Buffer } from 'node:buffer';
import * as KV from './kv_store.ts';
import * as PromptBuilder from './prompt_builder.ts';
import { KnowledgeRetriever } from './knowledge_retriever.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const extractJSON = (text: string) => {
    try {
        // Find the first { and last }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(text.substring(start, end + 1));
        }
        // Fallback for [ array ]
        const bStart = text.indexOf('[');
        const bEnd = text.lastIndexOf(']');
        if (bStart !== -1 && bEnd !== -1 && bEnd > bStart) {
            return JSON.parse(text.substring(bStart, bEnd + 1));
        }
        return JSON.parse(text);
    } catch (e) {
        // Try cleaning markdown
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned);
    }
};

const isUUID = (str: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
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

// Helper to sync proposal to real Supabase table for relational integrity
const saveToSupabase = async (proposal: any) => {
    try {
        const supabase = getSupabaseClient();
        const pid = proposal.id;

        // 1. Basic Metadata (The 'proposals' table)
        const dbProposal: any = {
            title: proposal.title || 'Untitled Proposal',
            summary: proposal.summary,
            project_url: proposal.projectUrl || proposal.project_url,
            selected_idea: proposal.selectedIdea,
            settings: proposal.settings || {},
            generated_at: proposal.generatedAt,
            saved_at: proposal.savedAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            funding_scheme_id: proposal.funding_scheme_id,
            // Keep JSONB as cache/backup for now
            dynamic_sections: proposal.dynamic_sections || proposal.dynamicSections || {},
            work_packages: proposal.workPackages || proposal.work_packages || [],
            budget: proposal.budget || [],
            risks: proposal.risks || [],
            partners: proposal.partners || []
        };

        let layoutId = proposal.layout_id;
        if (!layoutId && proposal.funding_scheme_id) {
            const { data: layouts } = await supabase
                .from('funding_scheme_layouts')
                .select('id')
                .eq('funding_scheme_id', proposal.funding_scheme_id)
                .eq('is_default', true)
                .limit(1);
            if (layouts && layouts.length > 0) {
                layoutId = layouts[0].id;
            }
        }

        const { data: savedProp, error: propError } = await supabase
            .from('proposals')
            .upsert({ ...dbProposal, id: pid, layout_id: layoutId }, { onConflict: 'id' })
            .select()
            .single();

        if (propError) {
            console.warn('Proposals table upsert failed (likely missing new schema):', propError.message);
            // Non-critical fallback
        }

        // 2. Relational Narrative Sections
        const dynamicSections = proposal.dynamic_sections || proposal.dynamicSections || {};
        const sectionsToInsert = Object.entries(dynamicSections).map(([key, val]) => ({
            proposal_id: pid,
            section_key: key,
            content: val as string,
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }));

        if (proposal.summary) {
            sectionsToInsert.push({
                proposal_id: pid,
                section_key: 'summary',
                content: proposal.summary,
                label: 'Executive Summary'
            });
        }

        if (sectionsToInsert.length > 0) {
            const { error: sError } = await supabase.from('proposal_sections').upsert(sectionsToInsert, { onConflict: 'proposal_id,section_key' });
            if (sError) console.warn('Relational Sections sync failed:', sError.message);
        }

        // 3. Relational Partners
        const partners = proposal.partners || [];
        if (partners.length > 0) {
            const partnersToInsert = partners.map((p: any, idx: number) => ({
                proposal_id: pid,
                partner_id: p.id && p.id.length > 30 ? p.id : null,
                name: p.name,
                role: p.role || 'Partner',
                is_coordinator: !!p.isCoordinator,
                description: p.description,
                order_index: idx
            }));
            const { error: pError } = await supabase.from('proposal_partners').upsert(partnersToInsert, { onConflict: 'proposal_id,partner_id' });
            if (pError) console.warn('Relational Partners sync failed:', pError.message);
        }

        // 4. Relational Work Packages
        const wps = proposal.workPackages || proposal.work_packages || [];
        if (wps.length > 0) {
            const wpsToInsert = wps.map((wp: any, idx: number) => ({
                proposal_id: pid,
                name: wp.name || `Work Package ${idx + 1}`,
                description: wp.description,
                duration: wp.duration || wp.timeline,
                order_index: idx,
                activities: wp.activities || []
            }));
            await supabase.from('proposal_work_packages').delete().eq('proposal_id', pid);
            await supabase.from('proposal_work_packages').insert(wpsToInsert);
        }

        console.log(`✅ Relational Sync Attempted for Proposal: ${pid}`);
    } catch (err: any) {
        console.error('❌ Supabase Relational Sync Error:', err.message);
    }
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

const rebalanceBudget = (proposal: any, targetBudget: number) => {
    if (!proposal.budget || !Array.isArray(proposal.budget) || proposal.budget.length === 0) return;

    console.log(`⚖️ Rebalancing budget to target: ${targetBudget}`);

    // 1. Proportional scaling for main budget items
    let currentTotal = proposal.budget.reduce((sum: number, item: any) => sum + (item.cost || 0), 0);

    if (currentTotal > 0 && Math.abs(currentTotal - targetBudget) > 1) {
        const scaleFactor = targetBudget / currentTotal;
        let runningTotal = 0;

        proposal.budget.forEach((item: any, idx: number) => {
            if (idx === proposal.budget.length - 1) {
                // Last item gets the remainder to ensure exact match
                item.cost = targetBudget - runningTotal;
            } else {
                item.cost = Math.round((item.cost || 0) * scaleFactor);
                runningTotal += item.cost;
            }
        });
        console.log(`   - Scaled budget items by factor ${scaleFactor.toFixed(4)}`);
    } else if (currentTotal === 0 && targetBudget > 0) {
        // Fallback if AI returned no budget - create a default item
        proposal.budget = [{
            item: "Project Implementation",
            cost: targetBudget,
            description: "Total project implementation costs as per target budget.",
            breakdown: [{ subItem: "Operational Costs", quantity: 1, unitCost: targetBudget, total: targetBudget }],
            partnerAllocations: proposal.partners?.map((p: any) => ({ partner: p.name, amount: Math.floor(targetBudget / proposal.partners.length) })) || []
        }];
    }

    // 2. Ensure internal consistency for each budget item (breakdown and partnerAllocations)
    proposal.budget.forEach((item: any) => {
        const itemTarget = item.cost || 0;

        // Partner Allocations consistency
        if (item.partnerAllocations && Array.isArray(item.partnerAllocations) && item.partnerAllocations.length > 0) {
            const paTotal = item.partnerAllocations.reduce((sum: number, pa: any) => sum + (pa.amount || 0), 0);
            if (paTotal !== itemTarget) {
                const sortedPA = [...item.partnerAllocations].sort((a, b) => (b.amount || 0) - (a.amount || 0));
                const largestPA = sortedPA[0];
                largestPA.amount = (largestPA.amount || 0) + (itemTarget - paTotal);
            }
        }

        // Breakdown consistency
        if (item.breakdown && Array.isArray(item.breakdown) && item.breakdown.length > 0) {
            const bdTotal = item.breakdown.reduce((sum: number, bd: any) => sum + (bd.total || 0), 0);
            if (bdTotal !== itemTarget) {
                const sortedBD = [...item.breakdown].sort((a, b) => (b.total || 0) - (a.total || 0));
                const largestBD = sortedBD[0];
                largestBD.total = (largestBD.total || 0) + (itemTarget - bdTotal);
            }
        }
    });

    // 3. Rebalance Work Package activity budgets
    if (proposal.workPackages && Array.isArray(proposal.workPackages) && proposal.workPackages.length > 0) {
        let wpTotal = 0;
        proposal.workPackages.forEach((wp: any) => {
            if (wp.activities && Array.isArray(wp.activities)) {
                wpTotal += wp.activities.reduce((sum: number, act: any) => sum + (act.estimatedBudget || 0), 0);
            }
        });

        if (wpTotal !== targetBudget) {
            const allActivities: any[] = [];
            proposal.workPackages.forEach((wp: any) => {
                if (wp.activities && Array.isArray(wp.activities)) {
                    wp.activities.forEach((act: any) => allActivities.push(act));
                }
            });

            if (allActivities.length > 0) {
                allActivities.sort((a, b) => (b.estimatedBudget || 0) - (a.estimatedBudget || 0));
                const largestAct = allActivities[0];
                largestAct.estimatedBudget = (largestAct.estimatedBudget || 0) + (targetBudget - wpTotal);
                console.log(`   - Adjusted WP activity "${largestAct.name}" to match total target budget.`);
            }
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

    // ===== HEALTH CHECK =====
    if (path.includes('/health')) {
        return new Response(
            JSON.stringify({
                status: 'ok',
                time: new Date().toISOString(),
                has_key: !!Deno.env.get('GEMINI_API_KEY'),
                project: 'swvvyxuozwqvyaberqvu'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

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
        console.log(`[REQUEST] ${req.method} ${path}`);

        // ===== HEALTH CHECK =====
        if (path === '/' || path === '' || path.endsWith('/server')) {
            return new Response(
                JSON.stringify({ status: 'ok', message: 'AI Proposal Generator API v2', path }),
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
${userPrompt ? `\nUSER PROVIDED INSTRUCTIONS/TEXT (THIS IS PARALLEL TO OR REPLACES URL CONTENT - USE THIS FOR BUDGET/DURATION): \n${userPrompt}\n` : ''}
URL: ${targetUrl}
CONTENT: ${content.substring(0, 5000)}

Extract:
1. A summary of the funding opportunity (incorporating user instructions if provided).
2. Partner requirements.
3. Budget range (CRITICAL: If a specific total budget like "250,000" or "€1M" is mentioned in user text or URL, use that EXACT numeric value).
4. Project duration (If a specific duration like "24 months" is mentioned, use that EXACT duration).

Return JSON:
{
  "summary": "Summary of the opportunity",
  "constraints": {
    "partners": "e.g., 3-5 partners required",
    "budget": "e.g., 250000 (MANDATORY: Numeric value only if possible, prioritize user instructions over URL)",
    "duration": "e.g., 24 months"
  }
}

Return ONLY valid JSON, no other text.`;

            let phase1Data;
            try {
                const model = ai.getGenerativeModel({
                    model: 'gemini-2.0-flash',
                    generationConfig: { temperature: 0.1 }
                });
                const phase1Result = await model.generateContent(phase1Prompt);
                const phase1Text = phase1Result.response.text();
                console.log('Phase 1 Raw Output:', phase1Text);
                phase1Data = extractJSON(phase1Text);
            } catch (error: any) {
                console.error('Phase 1 failed:', error);
                return new Response(
                    JSON.stringify({
                        error: 'Analysis failed (Phase 1)',
                        message: error.message,
                        details: error.toString(),
                        model: 'gemini-2.0-flash',
                        hint: 'This error often occurs if the Gemini model name is invalid or the API key is not authorized for this specific model.'
                    }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Phase 2: Generate ideas
            let phase2Data;
            try {
                const model = ai.getGenerativeModel({
                    model: 'gemini-2.0-flash',
                    generationConfig: { temperature: 0.7 }
                });
                const phase2Prompt = PromptBuilder.buildPhase2Prompt(
                    phase1Data.summary,
                    phase1Data.constraints,
                    userPrompt
                );

                const phase2Result = await model.generateContent(phase2Prompt);
                const phase2Text = phase2Result.response.text();
                console.log('Phase 2 Raw Output:', phase2Text);
                phase2Data = extractJSON(phase2Text);
            } catch (error: any) {
                console.error('Phase 2 failed:', error);
                return new Response(
                    JSON.stringify({
                        error: 'Idea generation failed (Phase 2)',
                        message: error.message,
                        details: error.toString(),
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
            const partnersRaw: any[] = [];
            const partners: any[] = [];
            const filteredPartners = selectedPartners.filter(Boolean);
            console.log(`🔍 Loading ${filteredPartners.length} partners from DB: ${filteredPartners.join(', ')}`);

            if (filteredPartners.length > 0) {
                const supabase = getSupabaseClient();
                // Only query UUIDs from Supabase to avoid "invalid input syntax for type uuid" error
                const uuidPartners = filteredPartners.filter((id: string) =>
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
                );

                if (uuidPartners.length > 0) {
                    const { data: dbPartners, error: partnerError } = await supabase
                        .from('partners')
                        .select('*')
                        .in('id', uuidPartners);

                    if (partnerError) console.error('❌ Error fetching partners:', partnerError);

                    if (dbPartners && dbPartners.length > 0) {
                        console.log(`✅ Found ${dbPartners.length} partners in DB.`);

                        // Map to camelCase for the prompt builder
                        partners.push(...dbPartners.map(p => ({
                            id: p.id,
                            name: p.name,
                            legalNameNational: p.legal_name_national || '',
                            acronym: p.acronym,
                            country: p.country,
                            description: p.description,
                            experience: p.experience,
                            staffSkills: p.staff_skills,
                            relevantProjects: p.relevant_projects,
                            organisationId: p.organisation_id || p.pic || '',
                            pic: p.pic || '',
                            vatNumber: p.vat_number || '',
                            businessId: p.business_id || '',
                            organizationType: p.organization_type || '',
                            isPublicBody: p.is_public_body,
                            isNonProfit: p.is_non_profit,
                            legalAddress: p.legal_address || '',
                            city: p.city || '',
                            postcode: p.postcode || '',
                            region: p.region || '',
                            website: p.website || '',
                            contactEmail: p.contact_email || '',
                            department: p.department || '',
                            legalRepName: p.legal_rep_name || '',
                            legalRepPosition: p.legal_rep_position || '',
                            legalRepEmail: p.legal_rep_email || '',
                            legalRepPhone: p.legal_rep_phone || '',
                            contactPersonName: p.contact_person_name || '',
                            contactPersonPosition: p.contact_person_position || '',
                            contactPersonEmail: p.contact_person_email || '',
                            contactPersonPhone: p.contact_person_phone || '',
                            contactPersonRole: p.contact_person_role || '',
                            role: p.role || '',
                            isCoordinator: p.id === filteredPartners[0] // First one selected is always coordinator
                        })));
                    }
                }

                // Fallback to KV if any missing (for transition)
                for (const partnerId of filteredPartners) {
                    if (!partners.find(p => p.id === partnerId)) {
                        const kvPartner = await KV.get(`partner:${partnerId}`);
                        if (kvPartner) {
                            console.log(`📦 Recovered partner ${partnerId} from KV.`);
                            partners.push({ ...kvPartner, isCoordinator: partnerId === filteredPartners[0] });
                        }
                    }
                }

                // Ensure the order matches the selection
                partners.sort((a, b) => filteredPartners.indexOf(a.id) - filteredPartners.indexOf(b.id));
            }

            if (partners.length === 0) {
                console.warn('⚠️ No partners found for this proposal generation!');
            } else {
                console.log(`🎭 Final partner list: ${partners.map(p => `${p.name} (${p.isCoordinator ? 'Coord' : 'Partner'})`).join(', ')}`);
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
                    temperature: 0.2,
                    maxOutputTokens: 8192 // Restored to full capacity for best quality
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ]
            });

            // NEW: Expert Intelligence Retrieval (RAG)
            console.log('🧠 Retrieving expert intelligence for RAG...');
            const retriever = new KnowledgeRetriever();
            const smartKeywords = KnowledgeRetriever.extractSmartKeywords(
                `${fundingScheme?.name || ''} ${idea.title} ${idea.description} ${userPrompt || ''}`
            );

            const expertKnowledge = await retriever.getRelevantKnowledge(smartKeywords, 5);

            if (expertKnowledge) {
                console.log(`✅ Found ${smartKeywords.length} relevant keywords and retrieved expert context.`);
            }

            const prompt = PromptBuilder.buildProposalPrompt(
                idea,
                summary,
                constraints,
                partners,
                userPrompt,
                fundingScheme
            );

            // Append Expert Knowledge to the prompt
            const fullyInformedPrompt = expertKnowledge
                ? `${prompt}\n\n### EXPERT INTELLIGENCE (MANDATORY GUIDELINES TO FOLLOW):\n${expertKnowledge}`
                : prompt;

            console.log(`🚀 Generating proposal with Gemini 2.0 Flash. Prompt length: ${fullyInformedPrompt.length} chars`);

            const startTime = Date.now();
            const result = await model.generateContent(fullyInformedPrompt).catch(e => {
                console.error('AI generation call failed:', e);
                throw new Error(`AI generation failed: ${e.message}`);
            });
            const text = result.response.text();
            console.log(`✅ AI responded in ${((Date.now() - startTime) / 1000).toFixed(1)}s with ${text.length} characters.`);

            if (!text) {
                throw new Error("AI returned an empty response.");
            }
            console.log(`✅ AI responded with ${text.length} characters.`);

            let proposal;
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                proposal = JSON.parse(cleanedText);
            } catch (parseError: any) {
                console.error('Initial JSON parse failed. Attempting repair...', parseError.message);
                console.error('Original Text first 500 chars:', cleanedText.substring(0, 500));

                let repairedText = cleanedText;
                repairedText = repairedText
                    .replace(/,\s*$/, '')
                    .replace(/:\s*$/, '')
                    .replace(/:\s*"[^"]*$/, '')
                    .replace(/,\s*"[^"]*$/, '')
                    .replace(/"\s*$/, '');

                repairedText = repairedText.replace(/"[^"]+$/, '');

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
                    try {
                        // Try to find the last occurrence of something that looks like a field end
                        const lastBrace = repairedText.lastIndexOf('}');
                        const lastBracket = repairedText.lastIndexOf(']');
                        const lastCutoff = Math.max(lastBrace, lastBracket);

                        if (lastCutoff > 0) {
                            repairedText = repairedText.substring(0, lastCutoff + 1);
                            const oBraces = (repairedText.match(/{/g) || []).length;
                            const cBraces = (repairedText.match(/}/g) || []).length;
                            const oBrackets = (repairedText.match(/\[/g) || []).length;
                            const cBrackets = (repairedText.match(/\]/g) || []).length;

                            let finalSuffix = '';
                            for (let i = 0; i < (oBrackets - cBrackets); i++) finalSuffix += ']';
                            for (let i = 0; i < (oBraces - cBraces); i++) finalSuffix += '}';

                            proposal = JSON.parse(repairedText + finalSuffix);
                            console.log('Emergency JSON repair successful!');
                        } else {
                            throw new Error('No valid closure character found');
                        }
                    } catch (thirdError: any) {
                        console.error('All JSON repairs failed. Text length:', text.length);
                        throw new Error(`Critical JSON failure: AI output truncated at ${text.length} chars and could not be repaired. Hint: Try a more concise prompt or fewer sections.`);
                    }
                }
            }

            if (!proposal || typeof proposal !== 'object') {
                throw new Error("AI returned a response that is not a valid JSON object.");
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

            // Merge AI-generated partner info (roles/desc) with portal metadata (OID/VAT/etc)
            if (proposal.partners && Array.isArray(proposal.partners)) {
                proposal.partners = partners.map(portalP => {
                    const aiP = (proposal.partners as any[]).find(p =>
                        p.name?.toLowerCase().includes(portalP.name.toLowerCase()) ||
                        portalP.name.toLowerCase().includes(p.name?.toLowerCase())
                    );
                    return {
                        ...portalP,
                        role: aiP?.role || portalP.role || 'Partner',
                        description: aiP?.description || portalP.description
                    };
                });
            } else {
                proposal.partners = partners;
            }

            // Rebalance budget to ensure exact accuracy
            const rawTargetBudget = PromptBuilder.extractNumericBudget(userPrompt || '') || PromptBuilder.extractNumericBudget(constraints.budget || '') || 250000;
            const targetBudget = rawTargetBudget < 1000 ? 250000 : rawTargetBudget;
            rebalanceBudget(proposal, targetBudget);

            proposal.settings = {
                currency: 'EUR',
                sourceUrl: '',
                customParams: customParams
            };

            // Auto-save to both KV and Supabase table
            await KV.set(proposal.id, proposal);
            await saveToSupabase(proposal);

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

        // GET /proposals/:id - Get single (Enhanced for Relational Loading)
        if (path.match(/\/proposals\/[^\/]+$/) && req.method === 'GET') {
            const id = path.split('/').pop();
            let proposal = await KV.get(id!);

            // Hybrid Load: Try Relational DB first for the most up-to-date structured data
            try {
                const supabase = getSupabaseClient();
                const { data: dbProp, error: dbError } = await supabase.from('proposals').select(`
                    *,
                    sections:proposal_sections(*),
                    rel_partners:proposal_partners(*),
                    rel_work_packages:proposal_work_packages(*),
                    rel_budget:proposal_budget_items(*),
                    rel_risks:proposal_risks(*),
                    fundingScheme:funding_schemes(*)
                `).eq('id', id).single();

                if (dbProp && !dbError) {
                    console.log(`💎 Loaded relational data for ${id}`);
                    // Reconstruct the proposal object
                    const dynamic_sections: any = {};
                    dbProp.sections?.forEach((s: any) => {
                        dynamic_sections[s.section_key] = s.content;
                    });

                    proposal = {
                        ...proposal,
                        ...dbProp,
                        dynamicSections: dynamic_sections,
                        dynamic_sections: dynamic_sections,
                        partners: dbProp.rel_partners?.map((p: any) => ({
                            id: p.partner_id,
                            name: p.name,
                            role: p.role,
                            isCoordinator: p.is_coordinator,
                            description: p.description
                        })) || dbProp.partners,
                        workPackages: dbProp.rel_work_packages?.map((w: any) => ({
                            name: w.name,
                            description: w.description,
                            duration: w.duration,
                            activities: w.activities
                        })) || dbProp.work_packages,
                        budget: dbProp.rel_budget?.map((b: any) => ({
                            category: b.item_category,
                            description: b.description,
                            cost: b.cost,
                            subItems: b.breakdown
                        })) || dbProp.budget
                    };
                }
            } catch (err) {
                console.error('Relational Load Error (Falling back to KV/JSONB):', err);
            }

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
            await saveToSupabase(proposal);

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
            await saveToSupabase(updated);

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

        // ===== FUNDING SCHEMES CRUD =====

        // GET /funding-schemes - List all
        if (path.includes('/funding-schemes') && req.method === 'GET' && !path.match(/\/funding-schemes\/[^\/]+$/)) {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('funding_schemes')
                .select('*')
                .order('name');

            if (error) throw error;

            return new Response(
                JSON.stringify({ schemes: data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /funding-schemes/:id - Get single
        const schemeMatch = path.match(/\/funding-schemes\/([^\/]+)$/);
        if (schemeMatch && req.method === 'GET' && !path.includes('/partners')) {
            const id = schemeMatch[1];
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('funding_schemes')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            return new Response(
                JSON.stringify(data),
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
                legalNameNational: p.legal_name_national,
                acronym: p.acronym,
                country: p.country,
                logoUrl: p.logo_url,
                organisationId: p.organisation_id,
                pic: p.pic,
                vatNumber: p.vat_number,
                businessId: p.business_id,
                organizationType: p.organization_type,
                legalAddress: p.legal_address,
                city: p.city,
                postcode: p.postcode,
                contactPersonName: p.contact_person_name,
                contactPersonPhone: p.contact_person_phone,
                contactPersonEmail: p.contact_person_email,
                contactEmail: p.contact_email,
                description: p.description,
                experience: p.experience,
                staffSkills: p.staff_skills,
                relevantProjects: p.relevant_projects,
                keywords: p.keywords,
                pdfUrl: p.pdf_url,
                createdAt: p.created_at
            }));

            // Fallback: also get from KV (for transition)
            const kvPartners = await KV.getByPrefix('partner:');
            const allPartners = [...mappedPartners];
            kvPartners.forEach(kvp => {
                const alreadyExists = allPartners.find(p =>
                    p.id === kvp.id ||
                    (p.name && kvp.name && p.name.toLowerCase() === kvp.name.toLowerCase())
                );
                if (!alreadyExists) {
                    allPartners.push(kvp);
                }
            });

            return new Response(
                JSON.stringify({ partners: allPartners }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // GET /partners/:id - Get single partner details
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'GET' && !path.endsWith('/partners')) {
            const match = path.match(/\/partners\/([^\/]+)$/);
            const id = match ? match[1] : path.split('/').pop() || '';
            console.log(`[PARTNER] Fetching single partner: ${id}`);

            const supabase = getSupabaseClient();
            let p = null;

            // Try DB first if it's a UUID
            if (isUUID(id)) {
                const { data, error } = await supabase
                    .from('partners')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();
                if (data) p = data;
                if (error) {
                    console.error('[PARTNER] DB Error:', error);
                }
            }

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
                organisation_id: body.organisationId || body.pic, // Use either
                pic: body.pic || body.organisationId,
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
                keywords: Array.isArray(body.keywords) ? body.keywords : [],
                logo_url: body.logoUrl || null,
                pdf_url: body.pdfUrl || null,
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
                .upsert(dbPartner, { onConflict: 'name' })
                .select()
                .single();

            if (error) {
                console.error('Partner Insert Error:', error);
                throw error;
            }

            return new Response(
                JSON.stringify({ ...body, id: data.id, createdAt: data.created_at }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // PUT /partners/:id - Update
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'PUT') {
            const match = path.match(/\/partners\/([^\/]+)$/);
            const id = match ? match[1] : path.split('/').pop();
            const body = await req.json();
            const supabase = getSupabaseClient();

            // Map camelCase to snake_case
            const dbPartner = {
                name: body.name,
                legal_name_national: body.legalNameNational,
                acronym: body.acronym,
                organisation_id: body.organisationId || body.pic,
                pic: body.pic || body.organisationId,
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
                keywords: Array.isArray(body.keywords) ? body.keywords : [],
                logo_url: body.logoUrl || null,
                pdf_url: body.pdfUrl || null,
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
                relevant_projects: body.relevantProjects,
                updated_at: new Date().toISOString()
            };

            console.log(`Updating partner ${id}:`, JSON.stringify(dbPartner).substring(0, 500));

            if (isUUID(id)) {
                const { error } = await supabase
                    .from('partners')
                    .update(dbPartner)
                    .eq('id', id);

                if (error) {
                    console.error(`Partner Update Error for ${id}:`, error);
                    throw error;
                }

                return new Response(
                    JSON.stringify({ ...body, id }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            } else {
                // If not a UUID, this is a legacy/temp partner from KV
                // We migrate it to Postgres by performing an INSERT
                console.log(`Migrating KV partner ${id} to Postgres...`);

                // Use upsert to handle cases where the partner name already exists in Postgres
                const { data, error } = await supabase
                    .from('partners')
                    .upsert(dbPartner, { onConflict: 'name' })
                    .select()
                    .single();

                if (error) {
                    console.error('Migration Upsert Error:', error);
                    throw error;
                }

                // Delete from KV after successful migration
                await KV.del(`partner:${id}`);

                return new Response(
                    JSON.stringify({ ...body, id: data.id, createdAt: data.created_at, migratedFrom: id }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // DELETE /partners/:id
        if (path.match(/\/partners\/[^\/]+$/) && req.method === 'DELETE') {
            const match = path.match(/\/partners\/([^\/]+)$/);
            const id = match ? match[1] : path.split('/').pop();
            const supabase = getSupabaseClient();

            if (isUUID(id)) {
                await supabase.from('partners').delete().eq('id', id);
            }
            await KV.del(`partner:${id}`); // Also delete from KV if it was there

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /partners/:id/upload-logo
        if (path.match(/\/partners\/[^\/]+\/upload-logo$/) && req.method === 'POST') {
            const match = path.match(/\/partners\/([^\/]+)\/upload-logo$/);
            const id = match ? match[1] : path.split('/')[2]; // Fallback to old behavior if regex fails
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

            // Update partner record if it's a UUID
            if (isUUID(id)) {
                const { error: dbError } = await supabase
                    .from('partners')
                    .update({ logo_url: publicUrl })
                    .eq('id', id);

                if (dbError) {
                    console.error('Logo DB update error:', dbError);
                }
            }

            // Always check KV for legacy compatibility
            const partner = await KV.get(`partner:${id}`);
            if (partner) {
                partner.logoUrl = publicUrl;
                await KV.set(`partner:${id}`, partner);
            }

            return new Response(
                JSON.stringify({ url: publicUrl }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // POST /partners/:id/upload-pdf
        if (path.match(/\/partners\/[^\/]+\/upload-pdf$/) && req.method === 'POST') {
            const match = path.match(/\/partners\/([^\/]+)\/upload-pdf$/);
            const id = match ? match[1] : path.split('/')[2]; // Fallback to old behavior if regex fails
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

            // Update partner record if it's a UUID
            if (isUUID(id)) {
                const { error: dbError } = await supabase
                    .from('partners')
                    .update({ pdf_url: publicUrl })
                    .eq('id', id);

                if (dbError) {
                    console.error('PDF DB update error:', dbError);
                }
            }

            // Always check KV for legacy compatibility
            const partner = await KV.get(`partner:${id}`);
            if (partner) {
                partner.pdfUrl = publicUrl;
                await KV.set(`partner:${id}`, partner);
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

                // Using Gemini 2.0 Flash for superior PDF parsing
                const ai = getAI();
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
            const { instruction, sectionId } = await req.json();

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
            let section = sectionId;

            if (!section) {
                const detectionPrompt = `Given this user instruction: "${instruction}"

Which ONE section of the proposal should be edited?

Available sections:
- title, summary, relevance, impact, budget, risks, partners, timeline
- workPackages (Choose this for ANYTHING related to activities, tasks, work packages, or the work plan)
- dynamic_sections (Choose this for template-specific narrative sections)

Return JSON: { "section": "sectionName" }

Return ONLY valid JSON, no other text.`;

                const detectResult = await model.generateContent(detectionPrompt);
                const detectText = detectResult.response.text();
                console.log('Detection Raw Output:', detectText);
                const detectData = extractJSON(detectText);
                section = detectData.section;
            }

            // Map aliases if needed
            if (section === 'workPlan' || section === 'activities' || section === 'tasks' || section?.startsWith('extra_wp_')) {
                section = 'workPackages';
            }

            // Special rules for structured sections
            const structuredSections = ['budget', 'risks', 'workPackages', 'timeline', 'partners'];
            const isStructured = structuredSections.includes(section);

            // RAG: Retrieve intelligence for edits
            const retriever = new KnowledgeRetriever();
            const editKeywords = KnowledgeRetriever.extractSmartKeywords(`${instruction} ${section}`);
            const expertContext = await retriever.getRelevantKnowledge(editKeywords, 3);

            const editPrompt = `Current content of ${section}: ${JSON.stringify(proposal[section])}

User instruction: ${instruction}

### EXPERT INTELLIGENCE (Apply these quality standards to the edit):
${expertContext || 'No specific guidelines found for this query.'}

TASK: Generate the NEW content for the "${section}" section only based on the user instruction.

CRITICAL RULES:
1. DATA TYPE: If the section is one of [${structuredSections.join(', ')}], the content MUST be a JSON ARRAY of objects. DO NOT return a string or HTML for these sections.
2. WORK PACKAGES: If editing 'workPackages', ensure each WP has multiple detailed activities (3-5 per WP). If the user asks to "improve activities", rewrite the descriptions to be more technical, detailed, and measurable. Keep the existing structure but improve the content.
3. NARRATIVE: For other sections (summary, relevance, impact, or keys in dynamic_sections), provide detailed HTML content (<p>, <ul>, <li>, <strong> tags).
4. ARITHMETIC: If updating 'budget' or 'workPackages' and a total amount is specified, ensure all item costs sum up EXACTLY to that total.

Return JSON: { "content": <Array OR String depending on section type> }

Return ONLY valid JSON, no other text.`;

            const editResult = await model.generateContent(editPrompt);
            const editText = editResult.response.text();
            console.log('Edit Raw Output:', editText);
            const { content } = extractJSON(editText);

            // Update proposal
            proposal[section] = content;

            // Rebalance if budget or workPackages was edited
            if (section === 'budget' || section === 'workPackages') {
                const maxBudgetParam = proposal.settings?.customParams?.find((p: any) => p.key === 'Max Budget')?.value;
                const rawTargetBudget = PromptBuilder.extractNumericBudget(instruction) || PromptBuilder.extractNumericBudget(maxBudgetParam) || 250000;
                const targetBudget = rawTargetBudget < 1000 ? 250000 : rawTargetBudget;
                rebalanceBudget(proposal, targetBudget);
            }

            proposal.updatedAt = new Date().toISOString();
            await KV.set(id, proposal);
            await saveToSupabase(proposal);

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

            // RAG: Retrieve intelligence for new section
            const retriever = new KnowledgeRetriever();
            const sectionKeywords = KnowledgeRetriever.extractSmartKeywords(`${sectionTitle} ${proposalContext}`);
            const expertContext = await retriever.getRelevantKnowledge(sectionKeywords, 3);

            const prompt = `You are generating a new section for a research/project proposal.

### EXPERT INTELLIGENCE (Guidelines for this section):
${expertContext || 'Follow general best practices for EU funding.'}

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
            JSON.stringify({
                error: error.message || 'Internal server error',
                details: error.toString(),
                stack: error.stack,
                phase: 'Global Catch'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
