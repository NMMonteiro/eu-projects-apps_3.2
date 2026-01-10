// Prompt Builder module for AI integration
// Constructs prompts for Google Gemini API

export const extractNumericBudget = (text: string): number | null => {
  if (!text) return null;
  let clean = text.replace(/&nbsp;/g, ' ').replace(/\s/g, '');
  const match = clean.match(/(?:€|EUR|budgetof|totalof|amountof)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/i);
  if (!match) return null;
  let val = match[1];
  if (val.includes('.') && val.includes(',')) {
    val = val.indexOf('.') < val.indexOf(',') ? val.split(',')[0].replace(/\./g, '') : val.split('.')[0].replace(/,/g, '');
  } else if (val.includes('.') || val.includes(',')) {
    const sep = val.includes('.') ? '.' : ',';
    const parts = val.split(sep);
    if (parts[parts.length - 1].length === 3) val = val.replace(/[.,]/g, '');
    else val = parts[0].replace(/[.,]/g, '');
  }
  return parseInt(val) || null;
};

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
  partners: any = [],
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

  const userRequirements = userPrompt
    ? `\n\n🎯 MANDATORY USER REQUIREMENTS - HIGHEST PRIORITY:\n${userPrompt}\n============================================================`
    : '';

  // Robust budget extraction

  const rawBudget = extractNumericBudget(userPrompt || '') || extractNumericBudget(constraints.budget || '') || 250000;
  const budgetNum = rawBudget < 1000 ? 250000 : rawBudget;

  const finalBudgetStr = `€${budgetNum.toLocaleString()}`;
  const personnelBudget = Math.floor(budgetNum * 0.6);
  const operationalBudget = Math.floor(budgetNum * 0.4);

  const partnerDictionary = partners.map((p: any, i: number) => `[PARTNER ${i + 1}]: "${p.name}" 
   - Acronym: ${p.acronym || 'N/A'}
   - Role: ${p.isCoordinator ? 'LEAD COORDINATOR (APPLICANT ORGANISATION)' : 'Partner'}
   - Country: ${p.country || 'N/A'}
   - Profile: ${p.description || 'No profile provided.'}
   - Expertise: ${p.experience || 'No expertise provided.'}`).join('\n\n');

  const sectionInstructions = allSections.map((s) => {
    return `SECTION: ${s.label}
    KEY: "${s.key}"
    AI INSTRUCTION: ${s.aiPrompt || 'Write a technical narrative addressing this section.'}`;
  }).join('\n\n');

  return `You are an elite European Grant Writing Consultant. You are drafting a multi-million euro proposal for the following project.

PROJECT IDEA:
Title: ${idea.title}
Summary: ${idea.description}

CONSORTIUM PARTNERS (LOADED FROM DATABASE - YOU MUST USE ALL ${partners.length} OF THEM):
${partnerDictionary}

BUDGET CONSTRAINTS:
- Total: ${finalBudgetStr} (${budgetNum} EUR)
- Rule: USE ONLY LARGE INTEGERS for "cost", "unitCost", and "amount".
- STRICT TOTAL: The sum of all items in the "budget" array MUST equal EXACTLY ${budgetNum} EUR.
- PRIORITY: If a different budget was mentioned in the user prompt, IGNORE it and USE EXACTLY ${budgetNum} EUR.
- PARTNER ALLOCATION: Distribute the ${budgetNum} EUR across all ${partners.length} partners in the "partnerAllocations" arrays.

STRICT OUTPUT CONTRACT:
1. **PARTNERS MAPPING**: 
   - You MUST include EXACTLY ${partners.length} partners in the "partners" array.
   - The first partner MUST be the Lead Coordinator: "${partners[0]?.name}".
2. **WORK PACKAGES**:
   - You MUST generate 5 to 6 distinct Work Packages in the "workPackages" array.
   - For EACH Work Package, you MUST also create a narrative summary in "dynamicSections" using keys like "work_package_1", "work_package_2", etc.
3. **SECTION MAPPING**: 
   - You MUST fill content for EVERY key listed in the "STRUCTURE TO FOLLOW" section below.
   - If you see a key like "applicant_organisation", provide a technical description of "${partners[0]?.name}".
   - If you see a key like "participating_organisations", describe the synergy between ALL partners.
4. **EXACT BUDGET**: The total budget MUST be exactly ${budgetNum} EUR. Distribute it realistically among Personnel, Equipment, and Travel.
5. **NO HALLUCINATIONS**: Do NOT invent partners. Use ONLY the ${partners.length} organizations provided.

STRUCTURE TO FOLLOW (MANDATORY KEYS):
${sectionInstructions}

STRICT JSON OUTPUT FORMAT (FOLLOW EXACTLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map((p: any) => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Lead Coordinator' : 'Partner'}", "country": "${p.country || ''}", "isCoordinator": ${p.isCoordinator || false}, "description": "Professional technical profile based on expertise." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management",
      "description": "Exhaustive management narrative...",
      "duration": "M1-M24",
      "activities": [
        { "name": "Project Coordination", "description": "...", "leadPartner": "${partners[0]?.name}", "estimatedBudget": ${Math.floor(personnelBudget * 0.1)} },
        { "name": "Quality Assurance", "description": "...", "leadPartner": "${partners[0]?.name}", "estimatedBudget": ${Math.floor(personnelBudget * 0.05)} }
      ],
      "deliverables": ["Management Plan", "Progress Report"]
    }
  ],
  "budget": [
    {
      "item": "Personnel",
      "cost": ${personnelBudget},
      "description": "Staff costs for all partners.",
      "breakdown": [{ "subItem": "Researchers", "quantity": 1, "unitCost": ${personnelBudget}, "total": ${personnelBudget} }],
      "partnerAllocations": [${partners.map((p: any) => `{ "partner": "${p.name}", "amount": ${Math.floor(personnelBudget / partners.length)} }`).join(', ')}]
    }
  ],
  "risks": [{ "risk": "Technical delay", "likelihood": "Low", "impact": "High", "mitigation": "Proper planning..." }],
  "summary": "Full project summary (HTML)...",
  "dynamicSections": {
    "key_from_structure_above": "HTML technical narrative...",
    "work_package_1": "Narrative for WP1..."
  }
}

Return ONLY valid JSON.`;
}
