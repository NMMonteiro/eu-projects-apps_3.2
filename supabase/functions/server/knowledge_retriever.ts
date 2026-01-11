import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface KnowledgeChunk {
    content: string;
    source_name: string;
    metadata: {
        type: string;
        keywords: string[];
    };
}

export class KnowledgeRetriever {
    private supabase;

    constructor() {
        const url = Deno.env.get('SUPABASE_URL') || '';
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        this.supabase = createClient(url, key);
    }

    async getRelevantKnowledge(keywords: string[], limit: number = 3): Promise<string> {
        try {
            if (!keywords || keywords.length === 0) return '';

            // Clean and prepare keywords for ILIKE search
            const searchTerms = keywords.map(kw => `%${kw.toLowerCase()}%`);

            // Search in content and metadata keywords
            // Note: Since multi-word keyword search in SQL can be complex in a single call, 
            // we'll fetch a batch and filter or use an OR condition
            const orFilters = searchTerms.map(term => `content.ilike.${term}`).join(',');

            const { data, error } = await this.supabase
                .from('global_knowledge')
                .select('source_name, content, metadata')
                .or(orFilters)
                .limit(limit);

            if (error) {
                console.error('Knowledge retrieval error:', error);
                return '';
            }

            if (!data || data.length === 0) return '';

            return data.map(chunk => `
--- EXPERT KNOWLEDGE FROM: ${chunk.source_name} (${chunk.metadata?.type || 'Guideline'}) ---
${chunk.content}
`).join('\n');

        } catch (e) {
            console.error('Failed to retrieve knowledge:', e);
            return '';
        }
    }

    /**
     * Extracts smart keywords from text to facilitate RAG lookup
     */
    static extractSmartKeywords(text: string): string[] {
        if (!text) return [];

        // Focus on EU program actions and topics
        const patterns = [
            /KA\d{3}(-ADU|-VET|-YOU|-HED)?/gi, // Erasmus+ codes
            /Erasmus\+/gi,
            /Horizon Europe/gi,
            /Creative Europe/gi,
            /Adult Education/gi,
            /Vocational Education/gi,
            /High Density/gi,
            /Inclusion/gi,
            /Digital/gi,
            /Sustainable/gi,
            /Innovation/gi,
            /Mobility/gi
        ];

        const keywords = new Set<string>();
        patterns.forEach(p => {
            const matches = text.match(p);
            if (matches) matches.forEach(m => keywords.add(m));
        });

        // Add some generic high-value words
        const highValue = ['Impact', 'Relevance', 'Needs analysis', 'Priority', 'Outcome'];
        highValue.forEach(v => {
            if (text.toLowerCase().includes(v.toLowerCase())) keywords.add(v);
        });

        return Array.from(keywords);
    }
}
