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
    const cleanText = text.replace(/&nbsp;/g, ' ').replace(/\s/g, '').replace(/,/g, '');
    const match = cleanText.match(/(?:€|EUR|budgetof|totalof|amountof)?(\d+)/i);
    return match ? parseInt(match[1]) : null;
  };

  const rawBudget = extractNumericBudget(userPrompt || '') || extractNumericBudget(constraints.budget || '') || 250000;
  // Ensure we don't have a suspiciously low budget (less than 1000)
  const budgetNum = rawBudget < 1000 ? 250000 : rawBudget;

  const finalBudgetStr = `€${budgetNum.toLocaleString()}`;
  const personnelBudget = Math.floor(budgetNum * 0.6);
  const operationalBudget = Math.floor(budgetNum * 0.4);

  const sectionInstructions = allSections.map((s, i) => {
    return `SECTION [${i + 1}]: ${s.label} (Key: "${s.key}")
    Description: ${s.description}
    AI Instructions: ${s.aiPrompt || 'Write a detailed technical narrative for this section.'}
    Requirement: You MUST provide the full content for this section in "dynamicSections["${s.key}"]".`;
  }).join('\n\n');

  return `You are a high-level EU grant writing consultant. You are drafting a multi-million euro proposal.

IMPORTANT: ALL BUDGET VALUES MUST BE LARGE INTEGERS. NEVER USE FRACTIONS OR RATIOS (e.g., 0.3).
Example: If the total budget is €250,000, then "cost" should be 250000.

SELECTED PROJECT IDEA:
Title: ${idea.title}
Description: ${idea.description}

CONTEXT & BACKGROUND: 
${summary}

CONSTRAINTS & REQUIREMENTS:
${userRequirements}
- ALL PARTNERS MUST BE INCLUDED: You have EXACTLY ${partners.length} organizations to distribute work and budget to.
- EXACT TOTAL BUDGET: The sum of all items in the "budget" array MUST TOTAL EXACTLY ${budgetNum}.
- MULTIPLE WORK PACKAGES: Generate 4-6 Work Packages in the "workPackages" array.
- NARRATIVE SEQUENCE: Follow the EXACT sequence of the Funding Scheme Template below.

${partnerInfo}

FUNDING SCHEME TEMPLATE:
${sectionInstructions}

STRICT OUTPUT RULES:
1. **INTEGERS ONLY**: All "cost", "unitCost", and "amount" fields MUST be integers (e.g. 45000). Total must be exactly ${budgetNum}.
2. **WP ACTIVITIES**: Every Work Package MUST have at least 3-4 activities with individual lead partners and estimated budgets.
3. **NARRATIVE CONTENT**: Every section (including WPs) MUST have a corresponding HTML narrative in "dynamicSections".
4. **NARRATIVE QUALITY**: Content must be academic, technical, and professional. Use H3, H4, P, UL, LI tags.

OUTPUT FORMAT (JSON ONLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map(p => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Project Coordinator' : 'Technical Partner'}", "isCoordinator": ${p.isCoordinator || false}, "description": "Professional 3-sentence profile..." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management & Coordination",
      "description": "Administrative and technical management throughout M1-M24.",
      "duration": "M1-M24",
      "activities": [
        { "name": "Financial Management", "description": "...", "leadPartner": "${partners[0]?.name}", "participatingPartners": [], "estimatedBudget": ${Math.floor(personnelBudget * 0.1)} }
      ],
      "deliverables": ["Progress Report 1", "Management Plan"]
    }
  ],
  "budget": [
    {
      "item": "Personnel - Project Management",
      "cost": ${Math.floor(personnelBudget * 0.2)},
      "description": "Management staff costs.",
      "breakdown": [
        { "subItem": "Project Manager", "quantity": 1, "unitCost": ${Math.floor(personnelBudget * 0.2)}, "total": ${Math.floor(personnelBudget * 0.2)} }
      ],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor((personnelBudget * 0.2) / partners.length)} }`).join(', ')}]
    }
  ],
  "risks": [{ "risk": "Technical failure", "likelihood": "Low", "impact": "High", "mitigation": "Redundancy measures..." }],
  "summary": "Full executive summary (HTML)...",
  "dynamicSections": {
    "context": "HTML content...",
    "project_summary": "HTML content..."
    // INCLUDE EVERY KEY FROM THE TEMPLATE
  }
}

Return ONLY valid JSON.`;
}
