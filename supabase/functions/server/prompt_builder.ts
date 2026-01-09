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

  // FORCE: If this is an Erasmus-style project or missing WPs, ensure we have slots for 4 WPs
  const hasMultipleWPs = allSections.some(s => s.key.includes('work_package_2'));
  if (!hasMultipleWPs && fundingScheme) {
    const wp1Idx = allSections.findIndex(s => s.key.includes('work_package_1'));
    if (wp1Idx !== -1) {
      allSections.splice(wp1Idx + 1, 0,
        { key: 'work_package_2', label: 'Work package n°2 - Platform Development', description: 'Technical design and development of the core solution.' },
        { key: 'work_package_3', label: 'Work package n°3 - Implementation & Testing', description: 'Piloting and real-world testing with target groups.' },
        { key: 'work_package_4', label: 'Work package n°4 - Dissemination & Sustainability', description: 'Impact assessment and long-term sharing of results.' }
      );
    }
  }

  const partnerInfo = partners.length > 0
    ? `\n\nCONSORTIUM PARTNERS (LOADED FROM DATABASE):\n${partners.map(p => `- ${p.name}${p.acronym ? ` (${p.acronym})` : ''} - ${p.country || 'Country not specified'}${p.isCoordinator ? ' [LEAD COORDINATOR]' : ''}\n  - Profile: ${p.description || 'No description'}\n  - Expertise: ${p.experience || ''}\n  - Past Projects: ${p.relevantProjects || ''}`).join('\n')}`
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
2. DO NOT include "(dd/mm/yyyy)" in any labels or headers.
3. Currency MUST always be formatted with the symbol first, e.g., "€60,000".

TASK: Generate a comprehensive and HIGHLY DETAILED funding proposal.

CRITICAL INSTRUCTIONS:
1. **STRUCTURE PRIORITIZATION**: The JSON output format below puts structured data (partners, workPackages, budget) FIRST. You MUST complete these fully with data based on the provided partners and requirement.
2. **BUDGET PRECISION**: If a budget total is specified (e.g. €250,000), the sum of all costs in the budget table MUST MATCH EXACTLY. Add a "Miscellaneous" or "Contingency" line if necessary.
3. **FOUR WORK PACKAGES**: You MUST generate exactly 4 unique Work Packages (WP1 to WP4). Each needs unique activities and budget allocations.
4. **ALL PARTNERS**: You MUST include ALL ${partners.length} selected partners in the "partners" array. Match names exactly.
5. **NARRATIVE DEPTH**: Each section in "dynamicSections" must be 2-3 paragraphs of high-quality technical content.

OUTPUT FORMAT (JSON ONLY):
{
  "title": "${idea.title}",
  "partners": [
    { "name": "Partner Name", "role": "Role in project", "isCoordinator": true, "description": "..." }
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management",
      "description": "...",
      "duration": "M1-M24",
      "activities": [{ "name": "...", "description": "...", "leadPartner": "...", "participatingPartners": ["..."], "estimatedBudget": 5000 }],
      "deliverables": ["..."]
    },
    { "name": "WP2: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] },
    { "name": "WP3: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] },
    { "name": "WP4: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] }
  ],
  "budget": [
    {
      "item": "...",
      "cost": 10000,
      "description": "...",
      "breakdown": [{ "subItem": "...", "quantity": 1, "unitCost": 10000, "total": 10000 }],
      "partnerAllocations": [{ "partner": "...", "amount": 10000 }]
    }
  ],
  "risks": [{ "risk": "...", "likelihood": "Low", "impact": "High", "mitigation": "..." }],
  "summary": "<p>...</p>",
  "dynamicSections": {
    ${allSections.map((s: FlatSection) => `"${s.key}": "<p>Content for ${s.label}...</p>"`).join(',\n    ')}
  }
}

Return ONLY valid JSON.`;
}
