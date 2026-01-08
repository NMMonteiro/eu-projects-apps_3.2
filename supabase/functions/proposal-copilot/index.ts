import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    console.log('=== COPILOT REQUEST RECEIVED ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);

    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log('Step 1: Parsing request body...');
        const body = await req.json();
        console.log('Request body:', JSON.stringify(body, null, 2));

        const { proposalId, message, history } = body;

        if (!proposalId || !message) {
            console.error('Missing required fields:', { proposalId, message });
            throw new Error('Missing proposalId or message');
        }

        console.log('Step 2: Initializing Supabase client...');
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        console.log('Supabase URL:', supabaseUrl);
        console.log('Supabase Key exists:', !!supabaseKey);

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        console.log('Supabase client created');

        console.log('Step 3: Fetching proposal from database...');
        console.log('Proposal ID:', proposalId);

        console.log('Step 3: Fetching proposal from database...');
        console.log('Proposal ID:', proposalId);

        let proposal = null;
        let fetchError = null;

        // 1. Try fetching from KV store (works for string IDs and UUIDs)
        // The app primarily uses this for generated proposals
        const KV_TABLE_NAME = 'kv_store_3cb71dae';
        console.log(`Attempting to fetch from KV store (${KV_TABLE_NAME})...`);

        const { data: kvData, error: kvError } = await supabase
            .from(KV_TABLE_NAME)
            .select('value')
            .eq('key', proposalId)
            .single();

        if (kvData && kvData.value) {
            console.log('Found proposal in KV store');
            proposal = kvData.value;
        } else {
            console.log('Not found in KV store or error:', kvError?.message);

            // 2. If not found, check if it's a UUID to try the 'proposals' table
            // This is for backward compatibility or if data was moved to real tables
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proposalId);

            if (isUuid) {
                console.log('ID is a UUID, checking Postgres "proposals" table...');
                const { data: pgData, error: pgError } = await supabase
                    .from('proposals')
                    .select('*')
                    .eq('id', proposalId)
                    .single();

                if (pgData) {
                    console.log('Found proposal in Postgres table');
                    proposal = pgData;
                } else {
                    console.log('Not found in Postgres table:', pgError?.message);
                    fetchError = pgError || kvError;
                }
            } else {
                console.log('ID is not a UUID, skipping Postgres check');
                fetchError = kvError;
            }
        }

        if (!proposal) {
            const errorMessage = fetchError?.message || 'Proposal not found in any store';
            console.error('Proposal fetch failed:', errorMessage);
            throw new Error(errorMessage);
        }

        console.log('Proposal found:', proposal.title);

        console.log('Step 4: Building context...');
        console.log('Step 4: Building context...');
        // Pass the entire proposal object to the AI, excluding potentially huge or irrelevant internal fields if necessary.
        // For now, passing the whole object is safest to ensure "full context" as requested.
        // We might want to exclude 'embedding' or similar if it existed, but standard proposal fields are fine.
        const context = {
            ...proposal,
            // Explicitly ensure these are present if they exist in the proposal object
            risks: proposal.risks,
            budget: proposal.budget,
            partners: proposal.partners,
            workPackages: proposal.workPackages,
            timeline: proposal.timeline,
            // Dynamic sections
            dynamic_sections: proposal.dynamic_sections,
            customSections: proposal.customSections
        };
        console.log('Context built with keys:', Object.keys(context).join(', '));
        console.log('Context built');

        console.log('Step 5: Initializing Gemini...');
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        console.log('Gemini API Key exists:', !!apiKey);

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        console.log('GoogleGenerativeAI instance created');

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
        console.log('Model instance created');

        console.log('Step 6: Starting chat...');

        // Step 7: Analyze intent - Check if user wants to update/redo a section
        // We use a lightweight check or a specific prompt to determine intent.
        // For simplicity and robustness, we'll ask the model to output a specific JSON structure if it detects an update request.

        const chatHistory = [
            {
                role: "user",
                parts: [{
                    text: `You are a proposal assistant. Context: ${JSON.stringify(context)}
                
IMPORTANT: If the user asks to "redo", "rewrite", "update", or "change" a specific section (e.g., "redo the methodology", "update the risks"), you MUST perform the update.

STRICT FORMATTING & LOGIC RULES:
1. All Project Start Dates MUST be in the future (Current context: Jan 2026).
2. DO NOT include "(dd/mm/yyyy)" in any labels or headers.
3. Currency MUST always be formatted with the symbol first and thousands separators, e.g., "€60,000".

To perform an update, your response MUST be a JSON object with this structure:
{
  "action": "update_section",
  "section": "section_name_key",
  "content": "The new content for the section...",
  "explanation": "I have updated the section as requested."
}

The "section_name_key" must be one of the keys in the context (e.g., 'methodology', 'risks', 'budget', 'objectives', 'summary', etc.).
The "content" should be the full new content for that section (HTML or text as appropriate).
The "explanation" is what I will show to the user.

If the user is just asking a question, reply with normal text (not JSON).` }],
            },
            {
                role: "model",
                parts: [{ text: "I understand. I will answer questions normally, but if asked to update a section, I will output the specific JSON format to trigger the update." }],
            },
        ];

        if (history && Array.isArray(history)) {
            history.forEach((msg: any) => {
                chatHistory.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            });
        }

        const chat = model.startChat({
            history: chatHistory,
        });
        console.log('Chat started');

        console.log('Step 7: Sending message to AI...');
        console.log('User message:', message);

        const result = await chat.sendMessage(message);
        console.log('AI response received');

        const response = await result.response;
        let text = response.text();
        console.log('Response text extracted, length:', text.length);

        // Check if response is JSON (action)
        let responseData = { response: text };

        try {
            // Attempt to find JSON in the response (in case of extra text)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const potentialJson = JSON.parse(jsonMatch[0]);
                if (potentialJson.action === 'update_section' && potentialJson.section && potentialJson.content) {
                    console.log('Action detected: update_section for', potentialJson.section);

                    // Perform the update in the DB
                    // Note: We need to update the KV store or the table depending on where it lives.
                    // We already fetched 'proposal', so we know where it came from? 
                    // Actually, we fetched it but didn't store the source.
                    // However, we can just try updating the KV store first as that's the primary store for this app.

                    const KV_TABLE_NAME = 'kv_store_3cb71dae';

                    // Update the local object
                    proposal[potentialJson.section] = potentialJson.content;
                    proposal.updatedAt = new Date().toISOString();

                    // Save to KV
                    const { error: updateError } = await supabase
                        .from(KV_TABLE_NAME)
                        .upsert({ key: proposalId, value: proposal });

                    if (updateError) {
                        console.error('Failed to update KV:', updateError);
                        // Fallback to 'proposals' table if UUID
                        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proposalId);
                        if (isUuid) {
                            await supabase
                                .from('proposals')
                                .update({ [potentialJson.section]: potentialJson.content })
                                .eq('id', proposalId);
                        }
                    }

                    // Return the structured response
                    responseData = {
                        response: potentialJson.explanation || "Section updated successfully.",
                        action: {
                            type: 'update_section',
                            section: potentialJson.section
                        }
                    };
                }
            }
        } catch (e) {
            // Not JSON or failed to parse, treat as normal text
            console.log('Response is not a valid action JSON, treating as text.');
        }

        console.log('Step 8: Returning response...');
        return new Response(
            JSON.stringify(responseData),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('=== COPILOT ERROR ===');
        console.error('Error name:', error?.name);
        console.error('Error type:', error?.constructor?.name);
        console.error('Error message:', error?.message);
        console.error('Error cause:', error?.cause);
        console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('Stack trace:', error?.stack);

        return new Response(
            JSON.stringify({
                error: error?.message || 'Unknown error',
                name: error?.name,
                type: error?.constructor?.name,
                details: error?.toString(),
                stack: error?.stack
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
