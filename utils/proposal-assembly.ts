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
    order?: number;
}

const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');

/**
 * Robustly extracts a WP index (0-based).
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    const match = text.match(/(?:Work\s*Packages?|WP|WP_)[^\d]*(\d+)/i);
    if (match) return parseInt(match[1]) - 1;
    return undefined;
}

function cleanTitle(title: string): string {
    if (!title) return '';
    let t = title.replace(/undefined/gi, '').replace(/\(?\s*null\s*\)?/gi, '').replace(/-\s*null/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(WP\d+[:\s]+)+/i, (match) => {
        const first = match.match(/WP\d+/i);
        return first ? `${first[0].toUpperCase()}: ` : '';
    });
    return t.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Assembles a structured document with NUCLEAR Deduplication.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>(); // Strict WP tracker
    const titleToPoolKey = new Map<string, string>(); // Title tracker for generic sections

    // --- ULTIMATE FALLBACK PRIORITY ---
    const FOUNDATION_PRIORITY: Record<string, number> = {
        'context': 1,
        'projectsummary': 2,
        'relevance': 3,
        'projectdescription': 4,
        'needsanalysis': 5,
        'partnershiparrangements': 6,
        'partnershipandcooperation': 6,
        'impact': 10,
        'projectdesignandimplementation': 11,
        'workpackagesoverview': 100,
        'wplist': 100,
        'budget': 800,
        'risks': 810,
        'checklist': 990,
        'annexes': 993,
        'declaration': 992,
        'euvalues': 994
    };

    const getLayoutPriority = (key: string, title?: string): number => {
        const nk = normalize(key);
        const nt = normalize(title || "");
        if (layout.length > 0) {
            const idx = layout.findIndex(item => {
                const ni = normalize(item);
                if (!ni) return false;
                if (nk === ni || nt === ni) return true;
                if (ni.includes('workpackage')) {
                    const lNum = ni.match(/\d+/);
                    const kNum = nk.match(/\d+/) || nt.match(/\d+/);
                    if (lNum && kNum && lNum[0] === kNum[0]) return true;
                }
                if (ni.length > 4 && (nk.includes(ni) || nt.includes(ni) || ni.includes(nk))) return true;
                return false;
            });
            if (idx !== -1) return idx;
        }
        if (FOUNDATION_PRIORITY[nk]) return FOUNDATION_PRIORITY[nk];
        for (const [fk, fv] of Object.entries(FOUNDATION_PRIORITY)) {
            if (nk.includes(fk) || nt.includes(fk)) return fv;
        }
        const wpNum = extractWPIndex(key) ?? extractWPIndex(title || '');
        if (wpNum !== undefined) return 101 + wpNum;
        if (nk.includes('checklist')) return 990;
        if (nk.includes('annex')) return 993;
        return 500;
    };

    // 1. EXECUTIVE SUMMARY (ANCHOR)
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'] || dynamicSections['project_summary'];
    if (summaryVal) {
        sectionPool.set('summary', {
            id: 'summary',
            title: 'Executive Summary',
            content: summaryVal,
            level: 1,
            order: getLayoutPriority('summary', 'Executive Summary')
        });
        titleToPoolKey.set(normalize('Executive Summary'), 'summary');
    }

    // 2. TEMPLATE SECTIONS (The Foundation)
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const baseKey = s.key || s.label.toLowerCase().replace(/\s+/g, '_');
                const poolKey = `template_${level}_${sIdx}_${baseKey}`;
                const normLabel = normalize(s.label);

                const wpIdx = extractWPIndex(s.key || baseKey) ?? extractWPIndex(s.label);
                const isWP = wpIdx !== undefined && (normLabel.includes('workpackage') || normalize(baseKey).includes('workpackage'));

                // Lift WPs to level 1
                const effectiveLevel = isWP ? 1 : level;

                if (isWP && !wpIdxToPoolKey.has(wpIdx!)) {
                    wpIdxToPoolKey.set(wpIdx!, poolKey);
                }
                titleToPoolKey.set(normLabel, poolKey);

                sectionPool.set(poolKey, {
                    id: poolKey,
                    title: cleanTitle(s.label),
                    description: s.description,
                    level: effectiveLevel,
                    wpIdx: wpIdx,
                    type: isWP ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: getLayoutPriority(baseKey, s.label) + (effectiveLevel * 0.001)
                });

                if (s.subsections && s.subsections.length > 0) {
                    processSections(s.subsections, level + 1);
                }
            });
        };
        processSections(fundingScheme.template_json.sections);
    }

    // 3. ENRICHMENT (NUCLEAR MERGING)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string') return;
        const nk = normalize(key);
        if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

        const wpIdx = extractWPIndex(key);
        let targetKey = '';

        // Rule A: WP Index Match (Strongest)
        if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
            targetKey = wpIdxToPoolKey.get(wpIdx)!;
        }
        // Rule B: Title Match
        else if (titleToPoolKey.has(nk)) {
            targetKey = titleToPoolKey.get(nk)!;
        }
        // Rule C: Fuzzy Key Match
        else {
            for (const [pK, pV] of sectionPool.entries()) {
                const pn = normalize(pK);
                const tn = normalize(pV.title);
                if (pn === nk || tn === nk || (nk.length > 4 && pn.includes(nk)) || (nk.length > 4 && nk.includes(pn))) {
                    targetKey = pK;
                    break;
                }
            }
        }

        if (targetKey) {
            const existing = sectionPool.get(targetKey)!;
            // Merge content if existing is empty or AI content is significantly longer
            if (!existing.content || val.length > existing.content.length * 1.5) {
                existing.content = val;
            }
        } else {
            // New autonomous section
            sectionPool.set(key, {
                id: key,
                title: cleanTitle(key),
                content: val,
                level: 1,
                wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'work_package' : undefined,
                order: getLayoutPriority(key, key)
            });
            if (wpIdx !== undefined) wpIdxToPoolKey.set(wpIdx, key);
        }
    });

    // 4. STRUCTURAL DATA & ANCHORS
    const ensureAnchor = (id: string, searchTitle: string, type: string) => {
        const normSearch = normalize(searchTitle);
        let foundKey = '';
        for (const [pK, pV] of sectionPool.entries()) {
            if (normalize(pV.title).includes(normSearch) || normSearch.includes(normalize(pV.title))) {
                foundKey = pK;
                break;
            }
        }
        if (foundKey) {
            const s = sectionPool.get(foundKey)!;
            s.type = type;
            s.level = 1; // Force lift
        } else {
            sectionPool.set(id, { id, title: searchTitle, level: 1, type, order: getLayoutPriority(id) });
        }
    };

    if (proposal.partners?.length > 0) {
        ensureAnchor('partners_anchor', 'Participating Organisations', 'partners');
        ensureAnchor('profiles_anchor', 'Organisation Profiles & Capacity', 'partner_profiles');
    }
    if ((proposal.budget || []).length > 0) ensureAnchor('budget_anchor', 'Budget & Cost Estimation', 'budget');
    if ((proposal.risks || []).length > 0) ensureAnchor('risks_anchor', 'Risk Management & Mitigation', 'risk');

    workPackages.forEach((wp: any, idx: number) => {
        const wpKey = wpIdxToPoolKey.get(idx);
        if (wpKey) {
            const s = sectionPool.get(wpKey)!;
            if (wp.name && (!s.title || s.title.length < 10)) s.title = cleanTitle(wp.name);
            if (!s.content) s.content = wp.description;
            s.type = 'work_package';
        }
    });

    // 5. FINAL ASSEMBLY
    let finalDocument = Array.from(sectionPool.values());
    finalDocument.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));

    // Inject Overview
    const firstWPIdx = finalDocument.findIndex(s => s.type === 'work_package');
    if (firstWPIdx !== -1 && !finalDocument.some(s => s.type === 'wp_list')) {
        finalDocument.splice(firstWPIdx, 0, {
            id: 'wp_overview_injected',
            title: 'Work packages overview',
            level: 1,
            type: 'wp_list',
            order: getLayoutPriority('work_packages_overview')
        });
    }

    return finalDocument.filter(s => (s.content && s.content.length > 10) || s.type === 'wp_list' || s.type === 'partners' || s.type === 'budget' || s.type === 'risk' || s.type === 'partner_profiles' || (s.type === 'work_package' && s.level === 1));
}
