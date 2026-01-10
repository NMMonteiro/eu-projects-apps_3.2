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
 * ULTRA STRICT WP Index extraction.
 * Only matches "WP 1", "Work Package 1", "WP_1" or "Work package n°1".
 * Does NOT match "Activities (2)" or similar.
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    // Look for WP keywords followed by a number, anchored or isolated
    const match = text.match(/\b(?:Work\s*Packages?|WP|WP_)\s*(?:n°|no\.?|#|number)?\s*(\d+)\b/i);
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
 * Assembles a structured document with TOTAL Deduping and FLAT Sequential Ordering.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>();
    const normTitleToPoolKey = new Map<string, string>();

    const FOUNDATION_PRIORITY: Record<string, number> = {
        'context': 1, 'projectsummary': 2, 'abstract': 2, 'summary': 2, 'relevance': 3,
        'projectdescription': 4, 'needsanalysis': 5, 'partnershiparrangements': 6,
        'partnershipandcooperation': 6, 'consortium': 6, 'impact': 10, 'design': 11, 'implementation': 11,
        'projectdesignandimplementation': 11, 'workpackagesoverview': 100, 'wplist': 100,
        'budget': 800, 'risks': 810, 'declaration': 990, 'checklist': 995, 'annexes': 992, 'otherdocuments': 993, 'euvalues': 994
    };

    const getLayoutPriority = (key: string, title?: string): number => {
        const nk = normalize(key);
        const nt = normalize(title || "");

        // 1. Check EXPLICIT Layout first
        if (layout.length > 0) {
            const idx = layout.findIndex(item => {
                const ni = normalize(item);
                if (nk === ni || nt === ni || (ni.length > 4 && (nk.includes(ni) || nt.includes(ni)))) return true;
                return false;
            });
            if (idx !== -1) return idx;
        }

        // 2. WP Special Zone
        const wpIdx = extractWPIndex(key) ?? extractWPIndex(title || '');
        if (wpIdx !== undefined) return 101 + wpIdx;

        // 3. Fallback Map
        if (FOUNDATION_PRIORITY[nk]) return FOUNDATION_PRIORITY[nk];
        for (const [fk, fv] of Object.entries(FOUNDATION_PRIORITY)) {
            if (nk.includes(fk) || nt.includes(fk)) return fv;
        }
        return 500;
    };

    // 1. HYDRATE Skeleton from Template
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const normLabel = normalize(s.label);
                const baseKey = s.key || normLabel;
                const poolKey = `template_${level}_${sIdx}_${baseKey}`;

                const wpIdx = extractWPIndex(baseKey) ?? extractWPIndex(s.label);
                // A WP Header must look like "Work Package 1" etc
                const isWPHeader = wpIdx !== undefined && (normLabel.includes('workpackage') || normLabel === `wp${wpIdx + 1}`);

                if (isWPHeader && !wpIdxToPoolKey.has(wpIdx!)) {
                    wpIdxToPoolKey.set(wpIdx!, poolKey);
                }
                normTitleToPoolKey.set(normLabel, poolKey);

                sectionPool.set(poolKey, {
                    id: poolKey, title: cleanTitle(s.label), description: s.description,
                    level: isWPHeader ? 1 : level, // Lift WPs to 1
                    wpIdx: wpIdx,
                    type: isWPHeader ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: getLayoutPriority(baseKey, s.label) + (sIdx * 0.001)
                });

                if (s.subsections && s.subsections.length > 0) {
                    processSections(s.subsections, level + 1);
                }
            });
        };
        processSections(fundingScheme.template_json.sections);
    }

    // 2. MERGE Dynamic Content (Aggressive Deduplication)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string' || val.length < 5) return;
        const nk = normalize(key);
        if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

        const wpIdx = extractWPIndex(key);
        let targetKey = '';

        if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
            targetKey = wpIdxToPoolKey.get(wpIdx)!;
        } else if (normTitleToPoolKey.has(nk)) {
            targetKey = normTitleToPoolKey.get(nk)!;
        } else {
            // Find by partial title/key match
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
            // Join or set content
            if (!existing.content) existing.content = val;
            else if (!existing.content.includes(val.substring(0, 20))) existing.content += "\n\n" + val;
        } else {
            sectionPool.set(key, {
                id: key, title: cleanTitle(key), content: val, level: 1, wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'wp_item' : undefined,
                order: getLayoutPriority(key)
            });
        }
    });

    // 3. SPECIAL DATA ANCHORS
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'];
    if (summaryVal) {
        sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: summaryVal, level: 1, order: -1 });
    }

    const ensureAnchor = (id: string, title: string, type: string) => {
        let found = '';
        for (const [pK, pV] of sectionPool.entries()) {
            if (normalize(pV.title).includes(normalize(title))) { found = pK; break; }
        }
        if (found) sectionPool.get(found)!.type = type;
        else sectionPool.set(id, { id, title, level: 1, type, order: getLayoutPriority(id, title) });
    };

    if (proposal.partners?.length > 0) {
        ensureAnchor('p_anchor', 'Participating Organisations', 'partners');
        ensureAnchor('prof_anchor', 'Organisation Profiles & Capacity', 'partner_profiles');
    }
    if ((proposal.budget || []).length > 0) ensureAnchor('b_anchor', 'Budget & Cost Estimation', 'budget');
    if ((proposal.risks || []).length > 0) ensureAnchor('r_anchor', 'Risk Management & Mitigation', 'risk');

    workPackages.forEach((wp: any, idx: number) => {
        const wpKey = wpIdxToPoolKey.get(idx);
        if (wpKey) {
            const s = sectionPool.get(wpKey)!;
            if (wp.name && (!s.title || s.title.length < 10)) s.title = cleanTitle(wp.name);
            if (!s.content) s.content = wp.description;
            s.type = 'work_package';
        }
    });

    // 4. FLATTEN & SORT
    const items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 500) - (b.order ?? 500));

    // Overview Injection
    const firstWPIdx = items.findIndex(s => s.type === 'work_package');
    if (firstWPIdx !== -1 && !items.some(s => s.type === 'wp_list')) {
        items.splice(firstWPIdx, 0, { id: 'wp_ov', title: 'Work packages overview', level: 1, type: 'wp_list', order: items[firstWPIdx].order! - 0.01 });
    }

    return items.filter(s => {
        // Keep structural
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package', 'partner_profiles'].includes(s.type || '')) return true;
        // Keep narrative
        if (s.content && s.content.length > 20) return true;
        // Keep structural headers ONLY if they have valid kids
        if (s.level <= 2) {
            return items.some(child => child.id.startsWith(s.id) && child.id !== s.id && (child.content || child.type));
        }
        return false;
    });
}
