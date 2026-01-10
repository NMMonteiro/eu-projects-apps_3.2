import { FullProposal } from '../types/proposal';

export interface DisplaySection {
    id: string;
    title: string;
    content?: string;
    description?: string;
    type?: string;
    level: number;
    wpIdx?: number;
    isCustom?: boolean;
    isDivider?: boolean;
    charLimit?: number;
}

/**
 * Robustly extracts a WP index from strings like "Work package n°1", "WP 2", "WP3: title"
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    // Matches: WP1, WP 1, Work Package 1, Work Package n°1, WP no.1 etc.
    const match = text.match(/(?:Work\s*Package|WP)\s*(?:n°|no\.?|#|number)?\s*(\d+)/i);
    if (match) {
        return parseInt(match[1]) - 1;
    }
    return undefined;
}

function cleanTitle(title: string): string {
    if (!title) return '';
    let t = title
        .replace(/undefined/gi, '')
        .replace(/\(?\s*null\s*\)?/gi, '')
        .replace(/undefined_/gi, ' ')
        .replace(/-\s*null/gi, '') // Handle "Activities (2 - null)"
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\(\s*\)/g, '')   // Remove empty parentheses
        .replace(/\(\s*-\s*\)/g, '')
        .replace(/\s*-\s*$/, '') // Remove trailing dash
        .trim();

    // Remove repeated "WPx:" prefixes (e.g., "WP1: WP1: title" -> "WP1: title")
    t = t.replace(/^(WP\d+[:\s]+)+/i, (match) => {
        const first = match.match(/WP\d+/i);
        return first ? `${first[0].toUpperCase()}: ` : '';
    });

    return t.replace(/^\w/, (c) => c.toUpperCase());
}

const PREFERRED_ORDER = [
    'relevance',
    'project_description',
    'needs_analysis',
    'impact',
    'project_design_implementation',
    'project_design',
    'work_packages_overview',
    'work_package_1',
    'work_package_2',
    'work_package_3',
    'work_package_4',
    'work_package_5',
    'work_package_6',
    'participating_organisations',
    'partnership_arrangements',
    'organisation_profiles'
];

function getPriority(key: string, label: string): number {
    const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
    const nk = normalize(key);
    const nl = normalize(label);

    for (let i = 0; i < PREFERRED_ORDER.length; i++) {
        const p = normalize(PREFERRED_ORDER[i]);
        if (nk.includes(p) || nl.includes(p)) return i;
    }
    return 100; // Default low priority
}

export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];
    const budget = proposal.budget || (proposal as any).budget || [];
    const risks = proposal.risks || (proposal as any).risks || [];

    const finalDocument: DisplaySection[] = [];
    const renderedKeys = new Set<string>();
    const renderedWPIndices = new Set<number>();

    // 1. Collect all potential sections from both Template AND Dynamic Sources
    let pool: DisplaySection[] = [];

    // Add Executive Summary if it exists and not in template
    const summaryContent = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'];
    if (summaryContent) {
        pool.push({ id: 'summary', title: 'Executive Summary', content: summaryContent, level: 1 });
        renderedKeys.add('summary');
        renderedKeys.add('abstract');
    }

    // Process Template Sections
    if (fundingScheme?.template_json?.sections) {
        const flatten = (sections: any[], level = 1) => {
            sections.forEach(s => {
                const key = s.key || s.label.toLowerCase().replace(/\s+/g, '_').replace(/[\W_]/g, '');
                let content = dynamicSections[s.key] || dynamicSections[key];

                // Fuzzy match for content
                if (!content) {
                    const normalize = (str: string) => (str || "").toLowerCase().replace(/[\W_]/g, '');
                    const nLabel = normalize(s.label);
                    for (const [dk, dv] of Object.entries(dynamicSections)) {
                        if (normalize(dk) === nLabel) {
                            content = dv as string;
                            renderedKeys.add(dk);
                            break;
                        }
                    }
                } else {
                    renderedKeys.add(s.key || key);
                }

                const wpIdx = extractWPIndex(s.key || key) ?? extractWPIndex(s.label);
                if (wpIdx !== undefined) renderedWPIndices.add(wpIdx);

                pool.push({
                    id: s.key || key,
                    title: cleanTitle(s.label),
                    content: content,
                    description: s.description,
                    level: level,
                    wpIdx: wpIdx,
                    type: wpIdx !== undefined ? 'work_package' : s.type
                });

                if (s.subsections && s.subsections.length > 0) {
                    flatten(s.subsections, level + 1);
                }
            });
        };
        flatten(fundingScheme.template_json.sections);
    }

    // Add remaining AI Dynamic Sections (Catch-all)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!renderedKeys.has(key) && val) {
            const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
            const nk = normalize(key);
            if (['summary', 'abstract', 'budget', 'partners', 'risks'].includes(nk)) return;

            const wpIdx = extractWPIndex(key);
            if (wpIdx !== undefined) renderedWPIndices.add(wpIdx);

            pool.push({
                id: key,
                title: cleanTitle(key),
                content: val as string,
                level: 1,
                wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'work_package' : undefined
            });
            renderedKeys.add(key);
        }
    });

    // 2. Add structural leftovers (WPs not in narrative, Partners, Budget, Risks)
    workPackages.forEach((wp: any, idx: number) => {
        if (!renderedWPIndices.has(idx)) {
            pool.push({
                id: `wp_${idx + 1}_auto`,
                title: cleanTitle(wp.name || `Work Package ${idx + 1}`),
                content: wp.description,
                level: 2,
                wpIdx: idx,
                type: 'work_package'
            });
        }
    });

    if (proposal.partners?.length > 0) {
        pool.push({ id: 'auto_partners', title: 'Participating Organisations', level: 1, type: 'partners' });
        pool.push({ id: 'auto_profiles', title: 'Organisation Profiles & Capacity', level: 1, type: 'partner_profiles' });
    }
    if (budget.length > 0) {
        pool.push({ id: 'auto_budget', title: 'Budget & Cost Estimation', level: 1, type: 'budget' });
    }
    if (risks.length > 0) {
        pool.push({ id: 'auto_risks', title: 'Risk Management & Mitigation', level: 1, type: 'risk' });
    }

    // 3. SORT based on Preferred Order mapping
    finalDocument.push(...pool.sort((a, b) => {
        // Special case: Executive Summary is ALWAYS first
        if (a.id === 'summary') return -1;
        if (b.id === 'summary') return 1;

        const pA = getPriority(a.id, a.title);
        const pB = getPriority(b.id, b.title);

        if (pA !== pB) return pA - pB;

        // Preserve original relative order for items with same priority
        return pool.indexOf(a) - pool.indexOf(b);
    }));

    // 4. Special injection: All Workpackages and activities (WP Overview)
    // Find the first individual WP and inject the overview before it if not present
    const firstWPIdx = finalDocument.findIndex(s => s.type === 'work_package');
    const hasOverview = finalDocument.some(s => s.type === 'wp_list' || s.title.toLowerCase().includes('overview'));

    if (firstWPIdx !== -1 && !hasOverview) {
        finalDocument.splice(firstWPIdx, 0, {
            id: 'wp_overview_injected',
            title: 'All Workpackages and activities',
            level: 1,
            type: 'wp_list'
        });
    }

    return finalDocument;
}

