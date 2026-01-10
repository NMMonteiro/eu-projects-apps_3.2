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
    order?: number; // Order index from layout
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
 * Assembles a structured document following the ULTIMATE Layout Foundation.
 * This is the singular source of truth for sequencing.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const renderedWPIndices = new Set<number>();

    // --- ULTIMATE FALLBACK PRIORITY (If layout is missing or item is unlisted) ---
    const FOUNDATION_PRIORITY: Record<string, number> = {
        'context': 2,
        'summary': 3,
        'project_summary': 3,
        'relevance': 4,
        'project_description': 5,
        'needs_analysis': 6,
        'partnership_arrangements': 7,
        'participating_organisations': 8,
        'auto_partners': 8.1,
        'auto_profiles': 8.2,
        'impact': 100,
        'project_design_implementation': 110,
        'work_packages_overview': 120,
        'wp_overview_injected': 120,
        'auto_budget': 500,
        'auto_risks': 510
    };

    // Helper to get priority from layout sequence
    const getLayoutPriority = (key: string, title?: string, templateIdx?: number): number => {
        const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
        const nk = normalize(key);
        const nt = normalize(title || "");

        // 1. Primary: Explicit Layout Record
        if (layout.length > 0) {
            const idx = layout.findIndex(item => {
                const ni = normalize(item);
                return nk === ni || (ni.length > 5 && (nk.includes(ni) || nt.includes(ni)));
            });
            if (idx !== -1) return idx;
        }

        // 2. Secondary: Foundation Priority Map
        if (FOUNDATION_PRIORITY[nk]) return FOUNDATION_PRIORITY[nk];

        // 3. Tertiary: Template Array Order (if provided)
        if (templateIdx !== undefined) return 200 + templateIdx;

        // 4. Quaternary: Work Package logic
        if (nk.includes('wp') || nk.includes('workpackage')) {
            const wpNum = extractWPIndex(key) ?? extractWPIndex(title || '');
            if (wpNum !== undefined) return 300 + wpNum;
        }

        return 1000; // Unlisted items go to the end
    };

    // 1. ANCHOR: EXECUTIVE SUMMARY (Always required at start if layout says so)
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'] || dynamicSections['project_summary'];
    if (summaryVal) {
        sectionPool.set('summary', {
            id: 'summary',
            title: 'Executive Summary',
            content: summaryVal,
            level: 1,
            order: getLayoutPriority('summary', 'Executive Summary')
        });
    }

    // 2. SKELETON: FUNDING SCHEME TEMPLATE
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const key = s.key || s.label.toLowerCase().replace(/\s+/g, '_').replace(/[\W_]/g, '');

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
                    order: getLayoutPriority(s.key || key, s.label, sIdx)
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
                order: getLayoutPriority(key, key)
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
                order: getLayoutPriority(`work_package_${idx + 1}`, `Work Package ${idx + 1}`)
            });
        }
    });

    // Structural Anchors
    if (proposal.partners?.length > 0) {
        sectionPool.set('auto_partners', { id: 'auto_partners', title: 'Participating Organisations', level: 1, type: 'partners', order: getLayoutPriority('auto_partners') });
        sectionPool.set('auto_profiles', { id: 'auto_profiles', title: 'Organisation Profiles & Capacity', level: 1, type: 'partner_profiles', order: getLayoutPriority('auto_profiles') });
    }
    if ((proposal.budget || []).length > 0) {
        sectionPool.set('auto_budget', { id: 'auto_budget', title: 'Budget & Cost Estimation', level: 1, type: 'budget', order: getLayoutPriority('auto_budget') });
    }
    if ((proposal.risks || []).length > 0) {
        sectionPool.set('auto_risks', { id: 'auto_risks', title: 'Risk Management & Mitigation', level: 1, type: 'risk', order: getLayoutPriority('auto_risks') });
    }

    // 5. ASSEMBLE: Sort by ULTIMATE Layout Priority
    const finalDocument = Array.from(sectionPool.values()).sort((a, b) => {
        const orderA = a.order ?? 1000;
        const orderB = b.order ?? 1000;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
    });

    // 6. POLISH: Inject "All Workpackages and activities" Overview
    const firstWPIdx = finalDocument.findIndex(s => s.type === 'work_package');
    const hasOverview = finalDocument.some(s => s.type === 'wp_list' || s.title.toLowerCase().includes('overview'));

    if (firstWPIdx !== -1 && !hasOverview) {
        finalDocument.splice(firstWPIdx, 0, {
            id: 'wp_overview_injected',
            title: 'All Workpackages and activities',
            level: 1,
            type: 'wp_list',
            order: getLayoutPriority('work_packages_overview')
        });
    }

    return finalDocument;
}
