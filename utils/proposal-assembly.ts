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
 * Strict WP Index extraction.
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    // Only match primary WP headers like "WP 1", "Work Package 1", or "wp_1"
    const match = text.match(/^(?:Work\s*Packages?|WP|WP_)\s*(\d+)/i) ||
        text.match(/(?:Work\s*package|WP)\s*n°\s*(\d+)/i);
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
 * Assembles a structured document with TOTAL Deduping and Parent Inheritance.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>();
    const titleToPoolKey = new Map<string, string>();

    const FOUNDATION_PRIORITY: Record<string, number> = {
        'context': 1, 'projectsummary': 2, 'relevance': 3, 'projectdescription': 4, 'needsanalysis': 5,
        'partnershiparrangements': 6, 'partnershipandcooperation': 6, 'impact': 10,
        'projectdesignandimplementation': 11, 'workpackagesoverview': 100, 'wplist': 100,
        'budget': 800, 'risks': 810, 'checklist': 990, 'annexes': 993, 'declaration': 992, 'euvalues': 994
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
        return 500;
    };

    // 1. ANCHORS
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'] || dynamicSections['project_summary'];
    if (summaryVal) {
        sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: summaryVal, level: 1, order: getLayoutPriority('summary') });
        titleToPoolKey.set(normalize('Executive Summary'), 'summary');
    }

    // 2. TEMPLATE SECTIONS (Recursive with Parent Inheritance)
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1, parentOrder?: number) => {
            sections.forEach((s, sIdx) => {
                const baseKey = s.key || s.label.toLowerCase().replace(/\s+/g, '_');
                const poolKey = `template_${level}_${sIdx}_${baseKey}`;
                const normLabel = normalize(s.label);

                const wpIdx = extractWPIndex(s.key || baseKey) ?? extractWPIndex(s.label);
                // ONLY Level 1 template sections can be 'work_package' anchors
                const isWP = wpIdx !== undefined && (normLabel.includes('workpackage') || normalize(baseKey).includes('workpackage')) && level === 1;

                // Inheritance Logic: If parent has a priority, children "stick" to it
                const selfPriority = getLayoutPriority(baseKey, s.label);
                const effectiveOrder = (selfPriority !== 500) ? selfPriority : (parentOrder !== undefined ? parentOrder : 500);

                if (isWP && !wpIdxToPoolKey.has(wpIdx!)) {
                    wpIdxToPoolKey.set(wpIdx!, poolKey);
                }
                titleToPoolKey.set(normLabel, poolKey);

                sectionPool.set(poolKey, {
                    id: poolKey, title: cleanTitle(s.label), description: s.description,
                    level: level, wpIdx: wpIdx,
                    type: isWP ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: effectiveOrder + (sIdx * 0.0001) + (level * 0.00001)
                });

                if (s.subsections && s.subsections.length > 0) {
                    processSections(s.subsections, level + 1, effectiveOrder);
                }
            });
        };
        processSections(fundingScheme.template_json.sections);
    }

    // 3. ENRICHMENT (Strict merging)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string') return;
        const nk = normalize(key);
        if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

        const wpIdx = extractWPIndex(key);
        let targetKey = '';

        if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
            targetKey = wpIdxToPoolKey.get(wpIdx)!;
        } else if (titleToPoolKey.has(nk)) {
            targetKey = titleToPoolKey.get(nk)!;
        } else {
            for (const [pK, pV] of sectionPool.entries()) {
                const pn = normalize(pK);
                const tn = normalize(pV.title);
                if (pn === nk || tn === nk || nk.includes(pn) || pn.includes(nk)) {
                    targetKey = pK; break;
                }
            }
        }

        if (targetKey) {
            const existing = sectionPool.get(targetKey)!;
            if (!existing.content || val.length > existing.content.length) existing.content = val;
        } else {
            sectionPool.set(key, {
                id: key, title: cleanTitle(key), content: val, level: 1, wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'wp_item' : undefined,
                order: getLayoutPriority(key)
            });
        }
    });

    // 4. STRUCTURAL DATA
    const ensureAnchor = (id: string, searchTitle: string, type: string) => {
        const normSearch = normalize(searchTitle);
        let found = '';
        for (const [pK, pV] of sectionPool.entries()) {
            if (normalize(pV.title).includes(normSearch) || normSearch.includes(normalize(pV.title))) {
                found = pK; break;
            }
        }
        if (found) {
            sectionPool.get(found)!.type = type;
        } else {
            sectionPool.set(id, { id, title: searchTitle, level: 1, type, order: getLayoutPriority(id) });
        }
    };

    if (proposal.partners?.length > 0) ensureAnchor('p_anchor', 'Participating Organisations', 'partners');
    if ((proposal.budget || []).length > 0) ensureAnchor('b_anchor', 'Budget & Cost Estimation', 'budget');
    if ((proposal.risks || []).length > 0) ensureAnchor('r_anchor', 'Risk Management & Mitigation', 'risk');

    workPackages.forEach((wp: any, idx: number) => {
        const wpKey = wpIdxToPoolKey.get(idx);
        if (wpKey) {
            const s = sectionPool.get(wpKey)!;
            if (wp.name && (!s.title || s.title.length < 10)) s.title = cleanTitle(wp.name);
            if (!s.content) s.content = wp.description;
            s.type = 'work_package';
        } else {
            const wpId = `auto_wp_${idx}`;
            sectionPool.set(wpId, {
                id: wpId, title: cleanTitle(wp.name || `Work Package ${idx + 1}`),
                content: wp.description, level: 1, wpIdx: idx, type: 'work_package',
                order: 101 + idx
            });
            wpIdxToPoolKey.set(idx, wpId);
        }
    });

    // 5. FINAL FLATTENING & CLEANUP
    const items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));

    // Inject Overview
    const firstWPIdx = items.findIndex(s => s.type === 'work_package');
    if (firstWPIdx !== -1 && !items.some(s => s.type === 'wp_list')) {
        items.splice(firstWPIdx, 0, { id: 'wp_overview', title: 'Work packages overview', level: 1, type: 'wp_list', order: 100 });
    }

    return items.filter(s => {
        // Keep structural blocks
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package'].includes(s.type || '')) return true;
        // Keep anything with narrative
        if (s.content && s.content.length > 20) return true;
        // Keep Level 1/2 headers ONLY if they have children that survived
        if (s.level <= 2) {
            return items.some(child => child.id.startsWith(s.id) && child.id !== s.id && child.content && child.content.length > 20);
        }
        return false;
    });
}
