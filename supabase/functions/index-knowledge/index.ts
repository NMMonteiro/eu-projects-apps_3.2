import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileUrl, sourceName } = await req.json()

    if (!fileUrl) throw new Error('fileUrl is required')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Download file
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('global-library')
      .download(fileUrl)

    if (downloadError) throw downloadError

    const arrayBuffer = await fileData.arrayBuffer()
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') ?? '')
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a Senior EU Funding Strategist. Analyze the provided guidelines for "${sourceName}".
        
        EXTRACT AT LEAST 15-20 HIGH-DENSITY KNOWLEDGE CHUNKS.
        
        For each chunk, focus on:
        1. QUALIFYING CRITERIA: Exact technical requirements for eligibility.
        2. EXPECTED OUTPUTS: Performance indicators and results the EU rewards.
        3. BEST PRACTICES: Strategic advice on tone, methodology, and consortium structure.
        4. EVALUATION TIPS: Key phrases and markers used by expert scorers.

        Each chunk must be self-contained and technical. 
        Include EXTREMELY SPECIFIC keywords for better search retrieval.
        Return ONLY valid JSON:
        {
          "chunks": [
            {
              "content": "Professional text chunk...",
              "type": "criteria" | "best_practice" | "output",
              "keywords": ["key1", "key2"]
            }
          ]
        }`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Data
        }
      }
    ])

    const responseText = result.response.text()
    const cleanedText = responseText.replace(/```json\s*|```/g, '').trim()
    const { chunks } = JSON.parse(cleanedText)

    // Store chunks (without embeddings for now, we'll use keyword search initially)
    for (const chunk of chunks) {
      await supabaseClient
        .from('global_knowledge')
        .insert({
          source_name: sourceName,
          content: chunk.content,
          metadata: {
            type: chunk.type,
            keywords: chunk.keywords,
            source_id: fileUrl
          }
        })
    }

    return new Response(
      JSON.stringify({ success: true, count: chunks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
