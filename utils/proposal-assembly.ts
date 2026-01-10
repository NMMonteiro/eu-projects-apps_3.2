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
    order?: number; // Added to respect absolute template sequence
}

/**
 * Robustly extracts a WP index from strings like "Work package n°1", "WP 2", "WP3: title"
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    const match = text.match(/(?:Work\s*Package|WP)\s*(?:n°|no\.?|#|number)?\s*(\d+)/i);
    if (match) return parseInt(match[1]) - 1;
    return undefined;
}

function cleanTitle(title: string): string {
    if (!title) return '';
    let t = title
        .replace(/undefined/gi, '')
        .replace(/\(?\s*null\s*\)?/gi, '')
        .replace(/-\s*null/gi, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Remove repeated "WPx:" prefixes
    t = t.replace(/^(WP\d+[:\s]+)+/i, (match) => {
        const first = match.match(/WP\d+/i);
        return first ? `${first[0].toUpperCase()}: ` : '';
    });

    return t.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * ABSOLUTE FOUNDATION SEQUENCE (Used when template order is missing or ambiguous)
 * This aligns exactly with the user's reference PDF.
 */
const FOUNDATION_PRIORITY: Record<string, number> = {
    'context': 0,
    'project_summary': 1,
    'summary': 1.1,
    'abstract': 1.2,
    'relevance': 2,
    'project_description': 2.1,
    'needs_analysis': 2.2,
    'partnership_arrangements': 3,
    'partnership': 3.1,
    'applicant_organisation': 3.2,
    'participating_organisations': 3.3,
    'impact': 4,
    'project_design_implementation': 5,
    'project_design': 5.1,
    'work_packages_overview': 6,
    'work_packages_and_activities': 6.1,
};

function getPriority(id: string, title?: string, templateOrder?: number): number {
    // 1. Template order from DB is the ABSOLUTE authority
    if (templateOrder !== undefined && templateOrder > 0) return templateOrder;

    const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
    const nk = normalize(id);
    const nt = normalize(title || "");

    // 2. Exact match in Foundation Priority
    for (const [key, prio] of Object.entries(FOUNDATION_PRIORITY)) {
        const pk = normalize(key);
        if (nk === pk || (pk.length > 5 && (nk.includes(pk) || nt.includes(pk)))) {
            return prio;
        }
    }

    // 3. Work Packages (Start at 10 to ensure they follow Part B narrative)
    if (nk.startsWith('wp') || nk.includes('workpackage')) {
        const match = nk.match(/\d+/);
        if (match) return 10 + (parseInt(match[0]) / 100);
        return 10.9;
    }

    return 20; // Default: end of document
}

/**
 * Assembles a structured document following the Funding Scheme Template as the skeletal foundation.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const renderedWPIndices = new Set<number>();

    // 1. ANCHOR: EXECUTIVE SUMMARY (Always required)
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'] || dynamicSections['project_summary'];
    sectionPool.set('summary', {
        id: 'summary',
        title: 'Executive Summary',
        content: summaryVal,
        level: 1,
        order: 1
    });

    // 2. SKELETON: FUNDING SCHEME TEMPLATE (Primary Source of truth)
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1) => {
            sections.forEach(s => {
                const key = s.key || s.label.toLowerCase().replace(/\s+/g, '_').replace(/[\W_]/g, '');

                // Content lookup with fuzzy matching
                let content = dynamicSections[s.key] || dynamicSections[key];
                if (!content) {
                    const normLabel = s.label.toLowerCase().replace(/[\W_]/g, '');
                    for (const [dk, dv] of Object.entries(dynamicSections)) {
                        if (dk.toLowerCase().replace(/[\W_]/g, '') === normLabel) {
                            content = dv as string;
                            break;
                        }
                    }
                }

                // Track WPs mentioned in template
                const wpIdx = extractWPIndex(s.key || key) ?? extractWPIndex(s.label);
                if (wpIdx !== undefined) renderedWPIndices.add(wpIdx);

                sectionPool.set(s.key || key, {
                    id: s.key || key,
                    title: cleanTitle(s.label),
                    content: content,
                    description: s.description,
                    level: level,
                    wpIdx: wpIdx,
                    type: wpIdx !== undefined ? 'work_package' : s.type,
                    order: s.order || getPriority(s.key || key, s.label)
                });

                if (s.subsections && s.subsections.length > 0) {
                    processSections(s.subsections, level + 1);
                }
            });
        };
        processSections(fundingScheme.template_json.sections);
    }

    // 3. ENRICHMENT: Add AI Dynamic Sections not in template
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!sectionPool.has(key) && val) {
            const nk = key.toLowerCase().replace(/[\W_]/g, '');
            if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

            const wpIdx = extractWPIndex(key);
            if (wpIdx !== undefined) renderedWPIndices.add(wpIdx);

            sectionPool.set(key, {
                id: key,
                title: cleanTitle(key),
                content: val as string,
                level: 1,
                wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'work_package' : undefined,
                order: getPriority(key, key)
            });
        }
    });

    // 4. STRUCTURE: Add Structural Data
    workPackages.forEach((wp: any, idx: number) => {
        if (!renderedWPIndices.has(idx)) {
            const wpId = `wp_${idx + 1}_auto`;
            sectionPool.set(wpId, {
                id: wpId,
                title: cleanTitle(wp.name || `Work Package ${idx + 1}`),
                content: wp.description,
                level: 2,
                wpIdx: idx,
                type: 'work_package',
                order: 10 + (idx / 100)
            });
        }
    });

    // Participating Organizations, Profiles, Budget, Risks (Anchor at end or following structure)
    if (proposal.partners?.length > 0) {
        sectionPool.set('auto_partners', { id: 'auto_partners', title: 'Participating Organisations', level: 1, type: 'partners', order: 3.5 });
        sectionPool.set('auto_profiles', { id: 'auto_profiles', title: 'Organisation Profiles & Capacity', level: 1, type: 'partner_profiles', order: 15 });
    }
    if ((proposal.budget || []).length > 0) {
        sectionPool.set('auto_budget', { id: 'auto_budget', title: 'Budget & Cost Estimation', level: 1, type: 'budget', order: 20 });
    }
    if ((proposal.risks || []).length > 0) {
        sectionPool.set('auto_risks', { id: 'auto_risks', title: 'Risk Management & Mitigation', level: 1, type: 'risk', order: 21 });
    }

    // 5. ASSEMBLE: Sort by the absolute order foundation
    const finalDocument = Array.from(sectionPool.values()).sort((a, b) => {
        const pA = a.order ?? getPriority(a.id, a.title);
        const pB = b.order ?? getPriority(b.id, b.title);
        if (pA !== pB) return pA - pB;
        return 0;
    });

    // 6. POLISH: Final Injection of WP Overview
    const firstWPIdx = finalDocument.findIndex(s => s.type === 'work_package');
    const hasOverview = finalDocument.some(s => s.type === 'wp_list' || s.title.toLowerCase().includes('overview'));

    if (firstWPIdx !== -1 && !hasOverview) {
        finalDocument.splice(firstWPIdx, 0, {
            id: 'wp_overview_injected',
            title: 'All Workpackages and activities',
            level: 1,
            type: 'wp_list',
            order: 9.99 // Force it right before individual WPs
        });
    }

    return finalDocument;
}
