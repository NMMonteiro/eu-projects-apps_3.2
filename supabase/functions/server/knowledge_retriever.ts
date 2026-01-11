import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface KnowledgeChunk {
    content: string;
    source_name: string;
    metadata: {
        type: string;
        keywords: string[];
        source_id?: string;
    };
}

export class KnowledgeRetriever {
    private supabase;

    constructor() {
        const url = Deno.env.get('SUPABASE_URL') || '';
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        this.supabase = createClient(url, key);
    }

    /**
     * Retrieves relevant intelligence chunks based on provided keywords
     */
    async getRelevantKnowledge(keywords: string[], limit: number = 5): Promise<string> {
        try {
            if (!keywords || keywords.length === 0) return '';

            console.log(`[RAG] Searching knowledge for: ${keywords.join(', ')}`);

            // Clean and prepare keywords for ILIKE search
            const searchTerms = keywords.map(kw => `%${kw.toLowerCase()}%`);

            // Search in content column
            const orFilters = searchTerms.map(term => `content.ilike.${term}`).join(',');

            const { data, error } = await this.supabase
                .from('global_knowledge')
                .select('source_name, content, metadata')
                .or(orFilters)
                .limit(limit);

            if (error) {
                console.error('[RAG] Retrieval error:', error);
                return '';
            }

            if (!data || data.length === 0) {
                console.log('[RAG] No relevant chunks found in library.');
                return '';
            }

            console.log(`[RAG] Found ${data.length} relevant intelligence chunks.`);

            return data.map(chunk => `
--- EXPERT KNOWLEDGE: ${chunk.source_name} (${chunk.metadata?.type || 'Guideline'}) ---
${chunk.content}
`).join('\n');

        } catch (e) {
            console.error('[RAG] Failed to retrieve knowledge:', e);
            return '';
        }
    }

    /**
     * Extracts smart keywords from text to facilitate RAG lookup
     */
    static extractSmartKeywords(text: string): string[] {
        if (!text) return [];

        const keywords = new Set<string>();

        // 1. Funding Program Patterns
        const programs = [
            /Erasmus\+?/gi,
            /Horizon\s*Europe/gi,
            /Creative\s*Europe/gi,
            /Digital\s*Europe/gi,
            /Interreg/gi,
            /Aurora/gi, // Added specifically as user has Aurora docs
            /LIFE\s*Programme/gi,
            /KA\d{3}(-ADU|-VET|-YOU|-HED)?/gi
        ];

        programs.forEach(regex => {
            const matches = text.match(regex);
            if (matches) matches.forEach(m => keywords.add(m.trim()));
        });

        // 2. Transversal Priorities
        const priorities = [
            'Inclusion', 'Digital', 'Green', 'Sustainable', 'Circular Economy',
            'SME', 'Innovation', 'Skills', 'Capacity Building', 'Impact',
            'Cross-border', 'Integration', 'Diversity', 'VET', 'Adult Education'
        ];

        priorities.forEach(p => {
            if (text.toLowerCase().includes(p.toLowerCase())) keywords.add(p);
        });

        // 3. Extract technical-looking capitalized words (min 5 chars)
        const techTerms = text.match(/[A-Z][a-z]{4,}/g);
        if (techTerms) {
            techTerms.slice(0, 5).forEach(term => keywords.add(term));
        }

        return Array.from(keywords);
    }
}
