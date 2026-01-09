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

TASK: Generate 10-12 high-quality project ideas that DIRECTLY address the user requirements above.

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

TASK: Generate 10-12 innovative project ideas based on the context summary.

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

  let allSections = fundingScheme?.template_json?.sections
    ? flattenSections(fundingScheme.template_json.sections)
    : [
      { key: 'project_summary', label: 'Project Summary', description: 'Overview of project.' },
      { key: 'relevance', label: 'Relevance', description: 'Why this project is needed.' },
      { key: 'impact', label: 'Impact', description: 'Expected change.' }
    ];

  // ALWAYS FORCE 4 WPs in the narrative sections if not present
  const hasMultipleWPs = allSections.some(s => s.key.includes('work_package_2'));
  if (!hasMultipleWPs) {
    const wp1Idx = allSections.findIndex(s => s.key.includes('work_package_1'));
    const insertIdx = wp1Idx !== -1 ? wp1Idx + 1 : allSections.length;

    if (wp1Idx === -1) {
      allSections.push({ key: 'work_package_1', label: 'Work Package 1: Management', description: 'Coordination and admin.' });
    }

    allSections.splice(insertIdx, 0,
      { key: 'work_package_2', label: 'Work Package 2: Technical Development', description: 'Building the core solution.' },
      { key: 'work_package_3', label: 'Work Package 3: Implementation', description: 'Deploying and testing.' },
      { key: 'work_package_4', label: 'Work Package 4: Dissemination', description: 'Sharing results.' }
    );
  }

  const partnerInfo = partners.length > 0
    ? `\n\nCONSORTIUM PARTNERS (LOADED FROM DATABASE - YOU MUST USE ALL ${partners.length} OF THEM):\n${partners.map((p, i) => `- ${p.name}${p.acronym ? ` (${p.acronym})` : ''} - ${p.country || 'Country'}${p.isCoordinator ? ' [LEAD COORDINATOR]' : ''}\n  - Role: ${p.role || (p.isCoordinator ? 'Project Coordinator' : 'Partner')}\n  - Profile: ${p.description || 'No description'}\n  - Expertise: ${p.experience || ''}`).join('\n')}`
    : '';

  const userRequirements = userPrompt
    ? `\n\n🎯 MANDATORY USER REQUIREMENTS - HIGHEST PRIORITY:\n${userPrompt}\n============================================================`
    : '';

  // Robust budget extraction: look for numbers like 250,000 or 250k or €250k
  const extractNumericBudget = (text: string): string | null => {
    if (!text) return null;
    // Look for patterns like €250,000, 250,000 EUR, or just "budget of 250000"
    const regex = /(?:€|EUR|budget of|total of|amount of)?\s*(\d{1,3}(?:[.,]\d{3})*(?:\s*k)?)/i;
    const match = text.match(regex);
    if (match) {
      let val = match[1].toLowerCase().replace(/[.,\s]/g, '');
      if (val.endsWith('k')) val = (parseInt(val) * 1000).toString();
      return val;
    }
    return null;
  };

  const extractedBudget = extractNumericBudget(userPrompt || '') || extractNumericBudget(constraints.budget || '') || "250000";
  const finalBudgetStr = `€${parseInt(extractedBudget).toLocaleString()}`;

  return `You are an expert EU funding proposal writer.

SELECTED PROJECT IDEA:
Title: ${idea.title}
Description: ${idea.description}

CONTEXT: ${summary}

CONSTRAINTS & REQUIREMENTS:
${userRequirements}
- ALL PARTNERS MUST BE INCLUDED: You have EXACTLY ${partners.length} organizations to distribute work and budget to.
- EXACT BUDGET: The TOTAL project budget MUST BE EXACTLY ${finalBudgetStr}.
- EXACT WORK PACKAGES: You MUST generate EXACTLY 4 Work Packages (WP1, WP2, WP3, WP4).

STRICT OUTPUT RULES:
1. **PARTNERS ARRAY**: The "partners" array in JSON MUST contain EXACTLY ${partners.length} elements. Do not omit the coordinator or any partner.
2. **COORDINATOR**: The first partner (${partners[0]?.name}) IS THE COORDINATOR. Assign them WP1 and the coordination role.
3. **BUDGET ITEMS**: The sum of all "cost" values in the "budget" array MUST EQUAL EXACTLY ${extractedBudget.replace(/[.,]/g, '')}.
4. **NO TRUNCATION**: Keep narrative sections concise but complete (2-3 paragraphs each).

OUTPUT FORMAT (JSON ONLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map(p => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Project Coordinator' : 'Technical Partner'}", "isCoordinator": ${p.isCoordinator || false}, "description": "Concise profile..." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management & Coordination",
      "description": "Led by ${partners[0]?.name}...",
      "duration": "M1-M24",
      "activities": [{ "name": "Coordination", "description": "...", "leadPartner": "${partners[0]?.name}", "participatingPartners": [${partners.slice(1).map(p => `"${p.name}"`).join(', ')}], "estimatedBudget": 20000 }],
      "deliverables": ["Management Plan"]
    },
    { "name": "WP2: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] },
    { "name": "WP3: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] },
    { "name": "WP4: ...", "description": "...", "duration": "...", "activities": [...], "deliverables": [...] }
  ],
  "budget": [
    {
      "item": "Personnel Costs",
      "cost": ${Math.floor(parseInt(extractedBudget.replace(/[.,]/g, '')) * 0.6)},
      "description": "Staff allocation for all partners.",
      "breakdown": [],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor((parseInt(extractedBudget.replace(/[.,]/g, '')) * 0.6) / partners.length)} }`).join(', ')}]
    },
    { "item": "Operational Expenses", "cost": ${Math.floor(parseInt(extractedBudget.replace(/[.,]/g, '')) * 0.3)}, "description": "Travel, equipment, etc.", "breakdown": [], "partnerAllocations": [] },
    { "item": "Miscellaneous / Contingency", "cost": ${Math.floor(parseInt(extractedBudget.replace(/[.,]/g, '')) * 0.1)}, "description": "Adjustment to reach exact target.", "breakdown": [], "partnerAllocations": [] }
  ],
  "risks": [{ "risk": "Technical delay", "likelihood": "Low", "impact": "High", "mitigation": "..." }],
  "summary": "<p>Project summary...</p>",
  "dynamicSections": {
    ${allSections.map((s: FlatSection) => `"${s.key}": "<p>Technical narrative for ${s.label}...</p>"`).join(',\n    ')}
  }
}

Return ONLY valid JSON.`;
}
