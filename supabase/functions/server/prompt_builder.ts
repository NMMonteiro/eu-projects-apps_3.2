// Prompt Builder module for AI integration
// Constructs prompts for Google Gemini API

export function buildPhase2Prompt(summary: string, constraints: any, userPrompt?: string): string {
  const basePrompt = userPrompt
    ? `You are a creative brainstorming assistant.

🎯 MANDATORY USER REQUIREMENTS - HIGHEST PRIORITY:
${userPrompt}

CRITICAL: ALL project ideas MUST directly address these user requirements.
If a specific budget or duration is mentioned above, it is a MANDATORY constraint.
============================================================

CONTEXT SUMMARY: ${summary}

CONSTRAINTS:
- Partners: ${constraints.partners || 'Not specified'}
- Budget: ${constraints.budget || 'Not specified'}
- Duration: ${constraints.duration || 'Not specified'}

TASK: Generate 6-10 high-quality project ideas that DIRECTLY address the user requirements above.

Each idea must:
1. Clearly relate to the user's requirements (e.g., if a specific topic or budget is mentioned, include it)
2. Be feasible within the constraints
3. Be innovative and impactful

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no backticks) with this structure:
{
  "ideas": [
    {
      "title": "Project idea title clearly related to user requirements",
      "description": "Detailed description (2-3 sentences) showing how this fulfills the user requirements"
    }
  ]
}

Return ONLY valid JSON, no other text.`
    : `You are a creative brainstorming assistant.

CONTEXT SUMMARY: ${summary}

CONSTRAINTS:
- Partners: ${constraints.partners || 'Not specified'}
- Budget: ${constraints.budget || 'Not specified'}
- Duration: ${constraints.duration || 'Not specified'}

TASK: Generate 6-10 innovative project ideas based on the context summary.

Each idea should:
1. Align with the funding opportunity
2. Be feasible within the constraints
3. Be innovative and impactful

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no backticks) with this structure:
{
  "ideas": [
    {
      "title": "Project idea title",
      "description": "Detailed description (2-3 sentences)"
    }
  ]
}

Return ONLY valid JSON, no other text.`;

  return basePrompt;
}

export function buildRelevancePrompt(
  url: string,
  urlContent: string,
  constraints: any,
  ideas: any[],
  userPrompt?: string
): string {
  const basePrompt = userPrompt
    ? `Validate these project ideas against the user requirements and source content.

USER REQUIREMENTS (PRIMARY CRITERION - MUST BE 100% SATISFIED):
${userPrompt}

SOURCE URL: ${url}
SOURCE CONTENT: ${urlContent.substring(0, 5000)}

PROJECT IDEAS:
${JSON.stringify(ideas, null, 2)}

TASK: Evaluate how well the ideas address the user requirements AND align with the source content.
If an idea deviates from a specific budget, duration, or topic mentioned in USER REQUIREMENTS, it must be scored 'Poor'.

Scoring:
- "Good": Ideas strongly address user requirements and align with source
- "Fair": Ideas partially address requirements or have moderate alignment
- "Poor": Ideas miss user requirements or don't align with source

OUTPUT FORMAT (JSON ONLY):
{
  "score": "Good" | "Fair" | "Poor",
  "justification": "Explain why the ideas match or miss the requirements and source content"
}

Return ONLY valid JSON, no other text.`
    : `Validate these project ideas against the source content.

SOURCE URL: ${url}
SOURCE CONTENT: ${urlContent.substring(0, 5000)}

PROJECT IDEAS:
${JSON.stringify(ideas, null, 2)}

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

TASK: Evaluate how well the ideas align with the source content and constraints.

Scoring:
- "Good": Ideas strongly align with source and constraints
- "Fair": Ideas partially align
- "Poor": Ideas don't align well

OUTPUT FORMAT (JSON ONLY):
{
  "score": "Good" | "Fair" | "Poor",
  "justification": "Explain the alignment assessment"
}

Return ONLY valid JSON, no other text.`;

  return basePrompt;
}

export function buildProposalPrompt(
  idea: any,
  summary: string,
  constraints: any,
  partners: any[] = [],
  userPrompt?: string,
  fundingScheme?: any
): string {
  // Helper to flatten sections and subsections
  interface FlatSection {
    key: string;
    label: string;
    description: string;
    charLimit?: number;
    aiPrompt?: string;
  }

  const flattenSections = (sections: any[]): FlatSection[] => {
    let result: FlatSection[] = [];
    sections.forEach(s => {
      // Force a valid key from label if key is missing
      const fallbackKey = (s.label || 'section').toLowerCase().replace(/\s+/g, '_').replace(/\W/g, '');
      const validKey = s.key || fallbackKey;

      result.push({
        key: validKey,
        label: s.label || 'Untitled Section',
        description: s.description || '',
        charLimit: s.charLimit,
        aiPrompt: s.aiPrompt
      });
      if (s.subsections && s.subsections.length > 0) {
        result = [...result, ...flattenSections(s.subsections)];
      }
    });
    return result;
  };

  const allSections = fundingScheme?.template_json?.sections
    ? flattenSections(fundingScheme.template_json.sections)
    : [];

  const partnerInfo = partners.length > 0
    ? `\n\nCONSORTIUM PARTNERS:\n${partners.map(p => `- ${p.name}${p.acronym ? ` (${p.acronym})` : ''} - ${p.country || 'Country not specified'}${p.isCoordinator ? ' [LEAD COORDINATOR]' : ''}\n  - Profile: ${p.description || 'No description'}\n  - Expertise: ${p.experience || ''}\n  - Past Projects: ${p.relevantProjects || ''}`).join('\n')}`
    : '';

  const userRequirements = userPrompt
    ? `\n\n🎯 MANDATORY USER REQUIREMENTS - MUST BE ADDRESSED IN ALL SECTIONS:\n${userPrompt}\n============================================================`
    : '';

  const dynamicSchemeInstructions = fundingScheme
    ? `\n\nFUNDING SCHEME TEMPLATE (${fundingScheme.name}):
The proposal MUST follow this specific structure. You MUST generate content for EVERY key listed below. DO NOT skip any keys.
${allSections.map((s: FlatSection) =>
      `- ${s.label} (Key: "${s.key}"): ${s.description}${s.charLimit ? ` [Limit: ${s.charLimit} chars]` : ''}${s.aiPrompt ? ` [Instruction: ${s.aiPrompt}]` : ''}`
    ).join('\n')}`
    : '';

  const dynamicOutputFormat = fundingScheme
    ? `\n  "dynamicSections": {
${allSections.map((s: FlatSection) => `    "${s.key}": "<p>Detailed content for ${s.label}...</p>"`).join(',\n')}
  },`
    : '';

  return `You are an expert EU funding proposal writer.

SELECTED PROJECT IDEA:
Title: ${idea.title}
Description: ${idea.description}

CONTEXT: ${summary}

CONSTRAINTS & REQUIREMENTS:
${userRequirements}
- Partners: ${constraints.partners || 'Not specified'}
- Budget: ${constraints.budget || 'Not specified'}
- Duration: ${constraints.duration || 'Not specified'}${partnerInfo}${dynamicSchemeInstructions}

CURRENT CONTEXTUAL DATE: January 2026
STRICT DATE RULES:
1. All Project Start Dates MUST be in the future (after January 2026).
2. DO NOT include "(dd/mm/yyyy)" in any labels or headers (e.g., use "Project Start Date:" instead of "Project Start Date (dd/mm/yyyy):").
3. Currency MUST always be formatted with the symbol first and thousands separators, e.g., "€60,000" instead of "60000 €".


TASK: Generate a comprehensive and HIGHLY DETAILED funding proposal.${fundingScheme ? ' Follow the FUNDING SCHEME TEMPLATE structure provided above.' : ''}

CRITICAL INSTRUCTIONS:
1. **NO EMPTY SECTIONS**: You must provide rich, technical, and persuasive content for EVERY section and subsection key provided in the "dynamicSections" format. If a section seems redundant (like "English Translation" when the project is already in English), acknowledge it briefly or merge relevant summary content, but do not leave it blank. Specifically, if the project is in English, skip the secondary translation text and focus on the main summary.
2. **RELEVANCE & IMPACT**: These sections must be exceptionally detailed. Provide a fundamental explanation of needs analysis, target groups, and long-term systemic impact. 
3. **VERBATIM QUESTIONS**: Check the descriptions/instructions for each section and ensure you answer every verbatim question asked in the guidelines.
4. **STYLE**: Use HTML formatting (<p>, <strong>, <ul>, <li>).
5. **JSON INTEGRITY**: Return ONLY valid JSON. If the content is long, prioritize completing the JSON structure.
6. **STRICT NAMING**: NEVER use the word "undefined" in any JSON key or content heading. If a field is unknown, omit it or use a professional generic title.

STRICT ADHERENCE RULES:
- If a budget total is specified in requirements (e.g. €250,000), the sum of all costs in the budget table MUST MATCH EXACTLY.
- MANDATORY ITEMS & REALISTIC RESEARCH: If the user requirements mention specific items (e.g. "10 VR sets", "AI tools", "hosting"), you MUST include these with realistic current market pricing.
- DETAILED BREAKDOWN: Every main budget item MUST have specific sub-items in the "breakdown" array. Keep sub-items to max 5 per category to avoid output truncation.
- CATEGORIES TO INCLUDE: Hardware, Software Licences/Subscriptions (AI apps, etc.), Domains/Hosting, Travel & Subsistence, Dissemination Costs, and Staff/Expert Rates.
- Each narrative section MUST be well-structured and technical (approx 2-3 paragraphs each). DO NOT be overly brief, but prioritize depth over sheer word count.
- If the funding scheme has many sections (>10), keep each section focused and concise to ensure the entire JSON structure fits within the 8192 token output limit.
- TOKEN SAFETY: If the proposal is exceptionally long, prioritize quality over extreme length to ensure the JSON structure is completed before reaching token limits.


OUTPUT FORMAT (JSON ONLY, no markdown):
{
  "title": "${idea.title}",
  "summary": "<p>Detailed executive summary...</p>",${dynamicOutputFormat}
  "relevance": "<p>Broad overview of relevance (if not covered in dynamicSections)...</p>",
  "impact": "<p>Broad overview of impact (if not covered in dynamicSections)...</p>",
  "partners": [
    { 
      "name": "Partner Name", 
      "role": "Role in project", 
      "isCoordinator": true,
      "description": "Short description of role and contributions" 
    }
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management",
      "description": "Detailed description of management and coordination",
      "activities": [
        { "name": "Kick-off Meeting", "description": "Organizing the internal launch event with all partners" },
        { "name": "Quality Assurance", "description": "Continuous monitoring of tasks and deliverables" }
      ],
      "deliverables": ["Grant Agreement", "Project Management Plan"]
    }
  ],
  "risks": [
    {
      "risk": "Technical failure",
      "likelihood": "Low",
      "impact": "High",
      "mitigation": "Redundancy and expert review"
    }
  ],
  "budget": [
    {
      "item": "Hardware & Equipment",
      "cost": 6500,
      "description": "Purchase of VR Headsets and local servers",
      "breakdown": [
        { "subItem": "Meta Quest 3 Headsets", "quantity": 10, "unitCost": 550, "total": 5500 },
        { "subItem": "Local Media Server", "quantity": 1, "unitCost": 1000, "total": 1000 }
      ]
    }
  ],
  "timeline": [
    { "phase": "M1-M6: Setup", "activities": ["Kick-off", "Requirement gathering"], "startMonth": 1, "endMonth": 6 }
  ]
}

Return ONLY valid JSON.`;
}
