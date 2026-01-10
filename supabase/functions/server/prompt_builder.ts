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
  // Robust budget extraction
  const extractNumericBudget = (text: string): number | null => {
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

  const rawBudget = extractNumericBudget(userPrompt || '') || extractNumericBudget(constraints.budget || '') || 250000;
  const budgetNum = rawBudget < 1000 ? 250000 : rawBudget;

  const finalBudgetStr = `€${budgetNum.toLocaleString()}`;
  const personnelBudget = Math.floor(budgetNum * 0.6);
  const operationalBudget = Math.floor(budgetNum * 0.4);

  const partnerDictionary = partners.map((p, i) => `[PARTNER ${i + 1}]: "${p.name}" 
   - Acronym: ${p.acronym || 'N/A'}
   - Role: ${p.isCoordinator ? 'LEAD COORDINATOR (APPLICANT)' : 'Technical Partner'}
   - Profile: ${p.description || 'No description provided'}
   - Expertise: ${p.experience || 'No expertise provided'}`).join('\n\n');

  const sectionInstructions = allSections.map((s, i) => {
    return `SECTION: ${s.label}
    KEY: "${s.key}"
    REQUIRED PROMPT: ${s.aiPrompt || 'Detailed technical narrative.'}`;
  }).join('\n\n');

  return `You are an elite EU grant writing expert. You are generating a FINAL SUBMISSION.

PROJECT:
Title: ${idea.title}
Summary: ${idea.description}

CONSORTIUM (MANDATORY - YOU MUST USE ALL ${partners.length} ORGANIZATIONS):
${partnerDictionary}

BUDGET:
Total: ${finalBudgetStr} (${budgetNum} EUR)
Rule: Use LARGE INTEGERS for all numeric fields.

WORK PACKAGES:
- Generate 5-6 detailed Work Packages.
- EVERY Work Package MUST have 3+ activities.
- EVERY activity must specify a Lead Partner from the consortium above.

OUTPUT MAPPING RULE:
1. "dynamicSections": For every Work Package X (1,2,3...), create an entry with key "work_package_X".
2. "workPackages": For every Work Package, add a structured entry in this array.
3. BOTH must exist or the proposal is incomplete.

STRICT JSON OUTPUT RULES:
1. **PARTNER COUNT**: The "partners" array MUST have EXACTLY ${partners.length} entries. 
2. **COORDINATOR**: You MUST include the Lead Coordinator ("${partners[0]?.name}") as the first partner in the "partners" list.
3. **NO HALLUCINATIONS**: Use ONLY the partner names provided.
4. **HTML CONTENT**: "dynamicSections" values must be rich HTML (H3, H4, P, UL, LI).

EXAMPLE JSON (FOLLOW EXACTLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map(p => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Project Coordinator' : 'Partner'}", "isCoordinator": ${p.isCoordinator || false}, "description": "3-sentence professional bio..." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management",
      "description": "...",
      "duration": "M1-M24",
      "activities": [
        { "name": "Financial Coordination", "description": "...", "leadPartner": "${partners[0]?.name}", "estimatedBudget": ${Math.floor(personnelBudget * 0.1)} },
        { "name": "Quality Monitoring", "description": "...", "leadPartner": "${partners[0]?.name}", "estimatedBudget": ${Math.floor(personnelBudget * 0.05)} }
      ],
      "deliverables": ["Grant Agreement", "Management Plan"]
    },
    {
      "name": "WP2: Needs Analysis",
      "description": "...",
      "duration": "M1-M6",
      "activities": [
        { "name": "Survey Design", "description": "...", "leadPartner": "${partners[1]?.name || partners[0]?.name}", "estimatedBudget": ${Math.floor(personnelBudget * 0.2)} }
      ],
      "deliverables": ["Consolidated Needs Report"]
    }
  ],
  "budget": [
    {
      "item": "Personnel",
      "cost": ${personnelBudget},
      "description": "Implementation staff.",
      "breakdown": [{ "subItem": "Staff", "quantity": 1, "unitCost": ${personnelBudget}, "total": ${personnelBudget} }],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor(personnelBudget / partners.length)} }`).join(', ')}]
    },
    {
      "item": "Travel & Subsistence",
      "cost": ${operationalBudget},
      "description": "Travel for meetings.",
      "breakdown": [{ "subItem": "Flights", "quantity": 1, "unitCost": ${operationalBudget}, "total": ${operationalBudget} }],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor(operationalBudget / partners.length)} }`).join(', ')}]
    }
  ],
  "risks": [{ "risk": "...", "likelihood": "...", "impact": "...", "mitigation": "..." }],
  "summary": "HTML summary...",
  "dynamicSections": {
    "context": "...narrative...",
    "project_summary": "...narrative...",
    "work_package_1": "...WP1 narrative...",
    "work_package_2": "...WP2 narrative...",
    "work_package_3": "...WP3 narrative...",
    "work_package_4": "...WP4 narrative...",
    "work_package_5": "...WP5 narrative..."
  }
}

Return ONLY valid JSON.`;
}



