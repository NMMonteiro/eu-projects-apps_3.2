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

  const sectionInstructions = allSections.map((s, i) => {
    return `SECTION [${i + 1}]: ${s.label} (Key: "${s.key}")
    Description: ${s.description}
    AI Instructions: ${s.aiPrompt || 'Write a detailed technical narrative for this section.'}
    Requirement: You MUST provide the full content for this section in "dynamicSections["${s.key}"]".`;
  }).join('\n\n');

  return `You are an expert EU funding proposal writer specializing in high-value innovative projects (Erasmus+, Horizon Europe, etc.).

SELECTED PROJECT IDEA:
Title: ${idea.title}
Description: ${idea.description}

CONTEXT & BACKGROUND: 
${summary}

CONSTRAINTS & REQUIREMENTS:
${userRequirements}
- ALL PARTNERS MUST BE INCLUDED: You have EXACTLY ${partners.length} organizations to distribute work and budget to.
- EXACT BUDGET: The TOTAL project budget MUST BE EXACTLY ${finalBudgetStr}.
- DYNAMIC WORK PACKAGES: You MUST generate at least 4-6 logically necessary Work Packages (WPs) in the "workPackages" array.
  * WP1: Project Management (Standard)
  * WP2: Preparation, Research, and User Requirements
  * WP3: Technical Development / Implementation / Pilots
  * WP4: Quality Assurance & Testing (or combined with WP3 if appropriate)
  * WP5: Dissemination, Communication & Exploitation
  * WP6: Project Sustainability & Legacy (Optional depending on scope)

${partnerInfo}

FUNDING SCHEME TEMPLATE STRUCTURE:
This project follows a specific funding scheme template. You MUST generate content for EACH of the following sections and place them in the "dynamicSections" object using the specified keys:

${sectionInstructions}

STRICT OUTPUT RULES:
1. **PARTNERS ARRAY**: The "partners" array MUST contain EXACTLY ${partners.length} elements.
2. **WP STRUCTURE**: Each Work Package in the "workPackages" array MUST have at least 3-4 DETAILED activities.
3. **ACTIVITIES CONTENT**: Each activity must have a clear name, lead partner, and an estimated budget that makes sense for its scope.
4. **NARRATIVE CONSISTENCY**: For EVERY section listed in the TEMPLATE (including Work Packages if they are listed as sections), you MUST provide a technical narrative in "dynamicSections".
5. **NARRATIVE DEPTH**: The narrative for each section must be technical, professional, and directly address the AI Instructions provided for that section. Use HTML tags (<h3>, <h4>, <p>, <ul>, <li>) for formatting.
6. **ITEMIZED BUDGET**: The "budget" array items should be SPECIFIC (e.g., "Hardware & Equipment", "Software Licenses", "Travel for Coordination Meetings") instead of generic categories.
7. **EXACT MATH**: The sum of all main budget items in the "budget" array MUST BE EXACTLY ${budgetNum}.
8. **DETAILED BREAKDOWN**: Each main budget item MUST include a "breakdown" array with specific sub-items (name, quantity, unitCost).

OUTPUT FORMAT (JSON ONLY):
{
  "title": "${idea.title}",
  "partners": [
    ${partners.map(p => `{ "name": "${p.name}", "role": "${p.isCoordinator ? 'Project Coordinator' : 'Technical Partner'}", "isCoordinator": ${p.isCoordinator || false}, "description": "Professional 3-sentence profile..." }`).join(',\n    ')}
  ],
  "workPackages": [
    {
      "name": "WP1: Project Management & Coordination",
      "description": "Comprehensive administrative and technical management...",
      "duration": "M1-M24",
      "activities": [
        { "name": "Financial & Administrative Management", "description": "...", "leadPartner": "${partners[0]?.name}", "participatingPartners": [], "estimatedBudget": ${Math.floor(personnelBudget * 0.1)} },
        { "name": "Technical Orchestration", "description": "...", "leadPartner": "${partners[0]?.name}", "participatingPartners": [${partners.slice(1).map(p => `"${p.name}"`).join(', ')}], "estimatedBudget": ${Math.floor(personnelBudget * 0.1)} },
        { "name": "Quality Assurance & Risk Monitoring", "description": "...", "leadPartner": "${partners[0]?.name}", "participatingPartners": [], "estimatedBudget": ${Math.floor(personnelBudget * 0.05)} }
      ],
      "deliverables": ["Project Management Plan", "Progress Reports", "QA Handbook"]
    }
    // CONTINUE FOR ALL WPS...
  ],
  "budget": [
    {
      "item": "Senior Personnel & Development",
      "cost": ${Math.floor(personnelBudget * 0.8)},
      "description": "Implementation staff for core technical tasks.",
      "breakdown": [
        { "subItem": "Technical Lead", "quantity": 1, "unitCost": ${Math.floor(personnelBudget * 0.3)}, "total": ${Math.floor(personnelBudget * 0.3)} },
        { "subItem": "Senior Developers", "quantity": 2, "unitCost": ${Math.floor(personnelBudget * 0.25)}, "total": ${Math.floor(personnelBudget * 0.5)} }
      ],
      "partnerAllocations": [${partners.map(p => `{ "partner": "${p.name}", "amount": ${Math.floor((personnelBudget * 0.8) / partners.length)} }`).join(', ')}]
    }
    // CONTINUE WITH SPECIFIC BUDGET CATEGORIES (Hardware, Travel, Subcontracting...)
  ],
  "risks": [{ "risk": "...", "likelihood": "...", "impact": "...", "mitigation": "..." }],
  "summary": "Full executive summary (HTML)...",
  "dynamicSections": {
    "section_key_1": "HTML content...",
    "section_key_2": "HTML content..."
    // MUST INCLUDE ALL KEYS FROM THE TEMPLATE LISTED ABOVE
  }
}

Return ONLY valid JSON.`;
}
