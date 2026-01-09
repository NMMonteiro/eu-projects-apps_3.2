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

  // No forced WP count logic - AI will decide based on the project idea and partners

  const partnerInfo = partners.length > 0
    ? `\n\nCONSORTIUM PARTNERS (LOADED FROM DATABASE - YOU MUST USE ALL ${partners.length} OF THEM):\n${partners.map((p, i) => `- ${p.name}${p.acronym ? ` (${p.acronym})` : ''} - ${p.country || 'Country'}${p.isCoordinator ? ' [LEAD COORDINATOR]' : ''}\n  - Role: ${p.role || (p.isCoordinator ? 'Project Coordinator' : 'Partner')}\n  - Profile: ${p.description || 'No description'}\n  - Expertise: ${p.experience || ''}`).join('\n')}`
    : '';

  const userRequirements = userPrompt
    ? `\n\n🎯 MANDATORY USER REQUIREMENTS - HIGHEST PRIORITY:\n${userPrompt}\n============================================================`
    : '';

  // Robust budget extraction: handle dot as thousands separator (250.000) or comma (250,000)
  const extractNumericBudget = (text: string): number | null => {
    if (!text) return null;
    const cleanText = text.replace(/&nbsp;/g, ' ').replace(/\s/g, '');
    const match = cleanText.match(/(?:€|EUR|budgetof|totalof|amountof)?(\d{1,3}(?:[.,]\d{3})*(?:\s*k)?)/i);
    if (match) {
      let val = match[1].toLowerCase();
      if (val.endsWith('k')) {
        return parseInt(val.replace('k', '')) * 1000;
      }
      // If there are multiple dots/commas, it's definitely thousands separators
      // If there is one dot/comma, we assume it's thousands if there are 3 digits after it
      if (val.includes('.') && val.includes(',')) {
        // Complex European format: 250.000,00
        val = val.split(',')[0].replace(/\./g, '');
      } else if (val.includes('.')) {
        const parts = val.split('.');
        if (parts[parts.length - 1].length === 3) val = val.replace(/\./g, '');
        else val = parts[0]; // Assume decimal
      } else if (val.includes(',')) {
        const parts = val.split(',');
        if (parts[parts.length - 1].length === 3) val = val.replace(/,/g, '');
        else val = parts[0]; // Assume decimal
      }
      return parseInt(val) || null;
    }
    return null;
  };

  const budgetNum = extractNumericBudget(userPrompt || '') || extractNumericBudget(constraints.budget || '') || 250000;
  const finalBudgetStr = `€${budgetNum.toLocaleString()}`;
  const personnelBudget = Math.floor(budgetNum * 0.6);
  const operationalBudget = Math.floor(budgetNum * 0.3);
  const miscBudget = budgetNum - personnelBudget - operationalBudget;

  return `You are an expert EU funding proposal writer.

SELECTED PROJECT IDEA:
Title: ${idea.title}
Description: ${idea.description}

CONTEXT: ${summary}

CONSTRAINTS & REQUIREMENTS:
${userRequirements}
- ALL PARTNERS MUST BE INCLUDED: You have EXACTLY ${partners.length} organizations to distribute work and budget to.
- EXACT BUDGET: The TOTAL project budget MUST BE EXACTLY ${finalBudgetStr}.
- DYNAMIC WORK PACKAGES: Generate logically necessary Work Packages (WP1: Management, followed by technical/implementation WPs, and a final Dissemination WP) based on the project scope.

STRICT OUTPUT RULES:
1. **PARTNERS ARRAY**: The "partners" array in JSON MUST contain EXACTLY ${partners.length} elements.
2. **COORDINATOR**: The first partner (${partners[0]?.name}) IS THE COORDINATOR.
3. **BUDGET ITEMS**: The sum of all "cost" values in the "budget" array MUST EQUAL EXACTLY ${budgetNum}.
4. **CONSISTENCY**: For EVERY entry in the "workPackages" array, there MUST be a corresponding narrative section in "dynamicSections" (using keys like work_package_1, work_package_2, etc.).
5. **TECHNICAL DEPTH**: Each Work Package description MUST be technical and specific to the project idea.

OUTPUT FORMAT (JSON ONLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map(p => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Project Coordinator' : 'Technical Partner'}", "isCoordinator": ${p.isCoordinator || false}, "description": "Concise profile..." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management & Coordination",
      "description": "Comprehensive management led by ${partners[0]?.name}. Includes administrative, financial, and technical orchestration.",
      "duration": "M1-M24",
      "activities": [
        { "name": "Project Coordination", "description": "Weekly technical meetings and resource management.", "leadPartner": "${partners[0]?.name}", "participatingPartners": [${partners.slice(1).map(p => `"${p.name}"`).join(', ')}], "estimatedBudget": ${Math.floor(personnelBudget * 0.2)} },
        { "name": "Quality Assurance", "description": "Monitoring deliverables and risk assessment.", "leadPartner": "${partners[0]?.name}", "participatingPartners": [], "estimatedBudget": ${Math.floor(personnelBudget * 0.05)} }
      ],
      "deliverables": ["Project Management Plan", "Progress Reports", "Quality Handbook"]
    }
    // YOU MUST CONTINUE GENERATING ALL NECESSARY WPs (WP2, WP3, WP4...)
    // EVERY WP MUST HAVE AT LEAST 2-3 DETAILED ACTIVITIES.
  ],
  "budget": [
    {
      "item": "Personnel Costs",
      "cost": ${personnelBudget},
      "description": "Salaries for staff across all partners for technical development and management.",
      "breakdown": [
        { "subItem": "Senior Developers", "quantity": "12 months", "cost": ${Math.floor(personnelBudget * 0.5)} },
        { "subItem": "Project Managers", "quantity": "24 months", "cost": ${Math.floor(personnelBudget * 0.3)} },
        { "subItem": "Administrative Support", "quantity": "24 months", "cost": ${Math.floor(personnelBudget * 0.2)} }
      ],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor(personnelBudget / partners.length)} }`).join(', ')}]
    },
    { 
      "item": "Operational Expenses", 
      "cost": ${operationalBudget}, 
      "description": "Travel to partner meetings, equipment for pilot testing, and software licenses.", 
      "breakdown": [
        { "subItem": "Travel & Subsistence", "quantity": "10 trips", "cost": ${Math.floor(operationalBudget * 0.4)} },
        { "subItem": "Equipment & Licenses", "quantity": "Varies", "cost": ${Math.floor(operationalBudget * 0.6)} }
      ], 
      "partnerAllocations": [] 
    },
    { "item": "Miscellaneous / Contingency", "cost": ${miscBudget}, "description": "Contingency fund to ensure total budget matches requirement exactly.", "breakdown": [], "partnerAllocations": [] }
  ],
  "risks": [{ "risk": "Technical delay", "likelihood": "Low", "impact": "High", "mitigation": "..." }],
  "summary": "<p>Project summary...</p>",
  "dynamicSections": {
    "work_package_1": "<p>Technical narrative for Management...</p>"
    // Add narrative sections for ALL generated work packages here (work_package_2, work_package_3, etc.)
  }
}

Return ONLY valid JSON.`;
}
