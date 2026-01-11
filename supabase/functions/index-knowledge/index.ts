import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper for Base64 without call stack issues
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fileUrl, sourceName } = await req.json()
    console.log(`[INDEX] Starting extraction for: ${fileUrl}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')

    if (!supabaseUrl || !serviceRoleKey || !geminiKey) {
      console.error('[INDEX] Missing environment variables')
      throw new Error('Supabase environment not configured')
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    console.log(`[INDEX] Downloading file: ${fileUrl}`)
    const { data: fileData, error: downloadError } = await supabaseClient
      .storage
      .from('global-library')
      .download(fileUrl)

    if (downloadError) {
      console.error(`[INDEX] Storage detail:`, downloadError)
      throw new Error(`Failed to download ${fileUrl}: ${downloadError.message}`)
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const base64Data = arrayBufferToBase64(arrayBuffer)
    console.log(`[INDEX] File conversion complete. Bytes: ${arrayBuffer.byteLength}`)

    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a Senior European Grant Expert. Deeply analyze the guidelines for "${sourceName}".
        
        EXTRACT 15-20 TECHNICAL KNOWLEDGE CHUNKS.
        
        Structure your response as ONLY valid JSON:
        {
          "chunks": [
            {
              "content": "Professional technical description of criteria or best practice...",
              "type": "criteria" | "best_practice" | "output",
              "keywords": ["specific_key1", "specific_key2"]
            }
          ]
        }`;

    console.log(`[INDEX] Sending to Gemini 2.0 Flash...`)
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
    console.log(`[INDEX] AI Response received. Length: ${responseText.length}`)

    let chunks: any[] = []
    try {
      const cleanedText = responseText.replace(/```json\s*|```/g, '').trim()
      const parsed = JSON.parse(cleanedText)
      chunks = parsed.chunks || []
    } catch (e) {
      console.error('[INDEX] JSON Parse Error. Raw response snippet:', responseText.substring(0, 100))
      throw new Error('AI returned malformed data format')
    }

    console.log(`[INDEX] Inserting ${chunks.length} chunks into database...`)
    const { error: insertError } = await supabaseClient
      .from('global_knowledge')
      .insert(chunks.map(chunk => ({
        source_name: sourceName,
        content: chunk.content,
        metadata: {
          type: chunk.type,
          keywords: chunk.keywords,
          source_id: fileUrl
        }
      })))

    if (insertError) {
      console.error('[INDEX] Database Insert Failed:', insertError)
      throw insertError
    }

    console.log(`[INDEX] SUCCESS: Completed ${sourceName}`)
    return new Response(
      JSON.stringify({ success: true, count: chunks.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error(`[INDEX] ERROR:`, error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
