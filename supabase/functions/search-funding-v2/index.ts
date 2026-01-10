import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const FUNCTION_VERSION = 'v2.1-no-fallback'; // Force new deployment

const getAI = () => {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    return new GoogleGenerativeAI(apiKey);
};

// Search EU Funding & Tenders Portal API
async function searchEUPortal(query: string) {
    try {
        console.log('Searching EU Portal API...');
        const apiUrl = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=${encodeURIComponent(query)}&pageSize=10`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('EU Portal API error:', response.status);
            return [];
        }

        const text = await response.text();

        // The API returns HTML with embedded JSON, extract it
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.log('Response is HTML, extracting JSON...');
            const jsonMatch = text.match(/{[\s\S]*}/);
            if (jsonMatch) {
                data = JSON.parse(jsonMatch[0]);
            } else {
                console.error('Could not extract JSON from HTML response');
                return [];
            }
        }

        console.log('EU Portal API response:', JSON.stringify(data).substring(0, 500));

        const opportunities = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (data.results && Array.isArray(data.results)) {
            for (const item of data.results.slice(0, 10)) {
                const metadata = item.metadata || {};
                const content = item.content || '';

                const title = metadata.title || item.title || content.substring(0, 100) || 'Untitled';
                const identifier = metadata.identifier || metadata.id || '';
                const url = metadata.url || item.url ||
                    (identifier ? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identifier}` : '');

                const deadlineStr = metadata.deadlineDate || metadata.deadline || 'Unknown';

                // Filter out expired calls
                if (deadlineStr !== 'Unknown') {
                    try {
                        const deadlineDate = new Date(deadlineStr);
                        deadlineDate.setHours(0, 0, 0, 0);
                        if (deadlineDate < today) {
                            console.log(`Skipping expired call: ${title} (deadline: ${deadlineStr})`);
                            continue; // Skip this expired opportunity
                        }
                    } catch (e) {
                        console.log(`Could not parse deadline: ${deadlineStr}`);
                    }
                }

                opportunities.push({
                    title: title.replace(/<[^>]*>/g, ''),
                    url: url,
                    description: (metadata.description || content || '').replace(/<[^>]*>/g, '').substring(0, 300),
                    source: 'EU Funding Portal',
                    status: metadata.status || 'Open',
                    deadline: deadlineStr,
                    budget: metadata.budget || metadata.totalBudget || 'Unknown',
                    call_id: identifier,
                    funding_entity: metadata.frameworkProgramme || metadata.programme || 'Horizon Europe',
                    topic: metadata.topic || metadata.keywords?.[0] || ''
                });
            }
        }

        console.log(`Found ${opportunities.length} active opportunities from EU Portal`);
        return opportunities;
    } catch (error) {
        console.error('EU Portal search failed:', error);
        return [];
    }
}

// Suggest partners based on call requirements
async function suggestPartners(callDescription: string, callEligibility: string, callTopic: string, allPartners: any[]) {
    try {
        console.log('Suggesting partners for call...');
        const ai = getAI();
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are a consortium-building expert. Analyze this funding call and suggest the best partners from the available list.
        
        CALL DETAILS:
        Topic: ${callTopic}
        Description: ${callDescription}
        Eligibility: ${callEligibility}
        
        AVAILABLE PARTNERS:
        ${JSON.stringify(allPartners.map(p => ({
            id: p.id,
            name: p.name,
            country: p.country,
            type: p.organization_type || p.organizationType,
            description: p.description
        })))}
        
        For each partner, evaluate:
        1. Relevance to call topic and objectives
        2. Eligibility match (organization type, country)
        3. Complementary expertise and experience
        
        Return JSON array of top 5 partners (sorted by match score):
        [
            {
                "partnerId": "partner-id-from-list",
                "matchScore": 95,
                "reason": "One concise sentence explaining why they're a great fit",
                "strengths": ["AI expertise", "EU project experience", "Strong research team"]
            }
        ]
        
        Return ONLY valid JSON array.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const suggestions = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

        console.log(`Generated ${suggestions.length} partner suggestions`);
        return suggestions;
    } catch (error) {
        console.error('Partner suggestion failed:', error);
        return [];
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { query, filterStatus, deepScrape, url, customSources, partnerProfile, mode, callDescription, callEligibility, callTopic, allPartners } = body;

        // === MODE: PARTNER SUGGESTIONS ===
        if (mode === 'suggestPartners') {
            const suggestions = await suggestPartners(callDescription, callEligibility, callTopic, allPartners);
            return new Response(
                JSON.stringify({ suggestions }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // === MODE 1: DEEP ANALYSIS (Analyze a specific URL) ===
        if (deepScrape && url) {
            console.log(`Analyzing URL: ${url}`);

            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

            const fetchContent = async (targetUrl: string) => {
                try {
                    const res = await fetch(targetUrl);
                    let text = await res.text();
                    return text.substring(0, 30000);
                } catch (e) {
                    console.error(`Fetch failed for ${targetUrl}:`, e);
                    return null;
                }
            };

            let currentUrl = url;
            let content = await fetchContent(currentUrl);

            if (!content) {
                return new Response(
                    JSON.stringify({ error: 'Could not fetch content' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            const checkPrompt = `Analyze this webpage content.
            URL: ${currentUrl}
            CONTENT PREVIEW: ${content.substring(0, 5000)}...

            Is this page a SPECIFIC funding call (with deadline, budget, eligibility details) OR is it a LIST/PORTAL of multiple calls?
            
            If it is a LIST/PORTAL, identify the SINGLE most relevant/latest funding call URL on this page.
            
            Return JSON:
            {
                "type": "specific_call" OR "portal",
                "better_url": "URL of the specific call if found, otherwise null"
            }
            Return ONLY valid JSON.`;

            try {
                const checkResult = await model.generateContent(checkPrompt);
                const checkData = JSON.parse(checkResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim());

                if (checkData.type === 'portal' && checkData.better_url && checkData.better_url !== currentUrl) {
                    console.log(`Portal detected. Digging deeper to: ${checkData.better_url}`);
                    const newContent = await fetchContent(checkData.better_url);
                    if (newContent) {
                        content = newContent;
                        currentUrl = checkData.better_url;
                    }
                }
            } catch (e) {
                console.error('Smart navigation check failed, proceeding with original URL:', e);
            }

            let prompt = `Analyze this funding opportunity page.
            
            URL: ${currentUrl}
            CONTENT: ${content}
            
            Extract the following details into a JSON object. Be EXTREMELY precise and accurate.
            {
                "title": "Official Title of the Call",
                "call_id": "Call ID / Topic Code (e.g. HORIZON-CL4-2024-DATA-01)",
                "description": "A comprehensive summary (3-4 sentences)",
                "status": "Open or Upcoming or Closed",
                "deadline": "YYYY-MM-DD or 'Unknown'",
                "budget": "Total budget or range (e.g. '€5M')",
                "duration": "Project duration (e.g. '36 months')",
                "eligibility": "Key eligibility criteria (who can apply, consortium size, countries)",
                "funding_entity": "Name of the funding body (e.g. Horizon Europe)",
                "topic": "Main topic/theme (e.g. AI, Green Deal)"
            }`;

            if (partnerProfile) {
                prompt += `
                
                PARTNER PROFILE TO EVALUATE:
                ${JSON.stringify(partnerProfile)}
                
                Also perform an ELIGIBILITY CHECK for this partner.
                Add a "match" object to the JSON:
                {
                    "score": (0-100),
                    "status": "Eligible" or "Conditional" or "Ineligible",
                    "reason": "One sentence explaining why they are a good match or why they are ineligible."
                }`;
            } else {
                prompt += `
                
                Add a "match" object to the JSON with null values:
                {
                    "score": 0,
                    "status": "Unknown",
                    "reason": "No partner selected for evaluation."
                }`;
            }

            prompt += `\nReturn ONLY valid JSON.`;

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

            data.url = currentUrl;

            return new Response(
                JSON.stringify({ opportunity: data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // === MODE 2: SEARCH (Find opportunities) ===
        console.log(`[${FUNCTION_VERSION}] Searching for: ${query}`);

        let opportunities = [];

        const euResults = await searchEUPortal(query);
        opportunities.push(...euResults);

        if (customSources && customSources.length > 0) {
            console.log('Checking custom sources...');
            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

            const customPrompt = `User Query: "${query}"
            
            Custom Sources provided by user:
            ${JSON.stringify(customSources)}
            
            Which of these sources are relevant to the query? 
            Return a JSON array of relevant opportunities from this list. 
            Format: [{ "title": "...", "url": "...", "description": "...", "source": "Custom Source" }]
            
            Return ONLY valid JSON.`;

            try {
                const result = await model.generateContent(customPrompt);
                const text = result.response.text();
                const customResults = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
                if (Array.isArray(customResults)) {
                    opportunities.push(...customResults);
                }
            } catch (e) {
                console.error('Custom source analysis failed:', e);
            }
        }

        // DISABLED: These fallback sources don't provide reliable deadline information
        // which makes it impossible to filter out expired calls. Only use EU Portal API.
        /*
        if (opportunities.length === 0) {
            const googleKey = Deno.env.get('GOOGLE_SEARCH_API_KEY');
            const googleCx = Deno.env.get('GOOGLE_SEARCH_CX');

            if (googleKey && googleCx) {
                console.log('Using Google Custom Search as fallback...');
                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query + ' funding grant open call')}`;

                const res = await fetch(searchUrl);
                const data = await res.json();

                if (data.items) {
                    const googleResults = data.items.map((item: any) => ({
                        title: item.title,
                        url: item.link,
                        description: item.snippet,
                        source: 'Web Search',
                        status: 'Unknown'
                    }));
                    opportunities.push(...googleResults);
                }
            } else {
                console.log('Using Gemini Knowledge Fallback...');
                const ai = getAI();
                const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

                const today = new Date().toISOString().split('T')[0];
                const prompt = `Act as a funding search engine. The user is looking for: "${query}"
                
                Generate a list of 5-7 REAL and RELEVANT EU funding opportunities (Horizon Europe, Erasmus+, Digital Europe, etc.) that match this query.
                
                CRITICAL: Only include calls that are OPEN or UPCOMING. Today's date is ${today}.
                DO NOT include any calls with deadlines before ${today}.
                
                Return a JSON object with an "opportunities" array:
                {
                    "opportunities": [
                        {
                            "title": "Call Title",
                            "url": "https://ec.europa.eu/...",
                            "description": "Brief description",
                            "source": "Program Name",
                            "status": "Open/Upcoming",
                            "deadline": "YYYY-MM-DD (must be >= ${today})",
                            "budget": "Budget info"
                        }
                    ]
                }
                
                Return ONLY valid JSON.`;

                const result = await model.generateContent(prompt);
                const text = result.response.text();
                const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

                if (data.opportunities) {
                    opportunities.push(...data.opportunities);
                }
            }
        }
        */

        // If EU Portal returns no results, use Gemini as fallback
        if (opportunities.length === 0) {
            console.log('[FALLBACK] Using Gemini...');
            const ai = getAI();
            const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const today = new Date().toISOString().split('T')[0];
            const prompt = `Find 5 EU funding calls for "${query}". Today: ${today}. Only deadlines >= ${today}. Return JSON: {"opportunities": [{"title": "", "url": "", "description": "", "source": "Horizon Europe", "status": "Open", "deadline": "YYYY-MM-DD", "budget": "", "eligibility": ""}]}`;
            try {
                const result = await model.generateContent(prompt);
                const data = JSON.parse(result.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
                if (data.opportunities) opportunities.push(...data.opportunities);
            } catch (e) { console.error('[FALLBACK] Failed:', e); }
        }

        // === FINAL FILTER: Remove ALL expired opportunities regardless of source ===
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const filteredOpportunities = opportunities.filter(opp => {
            const deadlineStr = opp.deadline;

            // Keep opportunities with unknown deadlines
            if (!deadlineStr || deadlineStr === 'Unknown' || deadlineStr === 'TBD') {
                return true;
            }

            try {
                // Try to parse the deadline
                const deadlineDate = new Date(deadlineStr);
                deadlineDate.setHours(0, 0, 0, 0);

                // Only keep if deadline is today or in the future
                if (deadlineDate >= today) {
                    return true;
                } else {
                    console.log(`Filtered out expired opportunity: ${opp.title} (deadline: ${deadlineStr})`);
                    return false;
                }
            } catch (e) {
                // If we can't parse the date, keep it (might be a valid format we don't recognize)
                console.log(`Could not parse deadline for ${opp.title}: ${deadlineStr}, keeping it`);
                return true;
            }
        });

        console.log(`Filtered ${opportunities.length} opportunities down to ${filteredOpportunities.length} active ones`);

        return new Response(
            JSON.stringify({ opportunities: filteredOpportunities }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
