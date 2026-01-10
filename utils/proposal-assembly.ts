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
    // Catch "WP 1", "Work Package 2", "WP2 activities", "Work package n°3"
    const match = text.match(/(?:Work\s*Packages?|WP|WP_)\s*(?:n°|no\.?|#|number)?\s*(\d+)/i);
    if (match) return parseInt(match[1]) - 1;
    return undefined;
}

function cleanTitle(title: string): string {
    if (!title) return '';
    let t = title.replace(/undefined/gi, '').replace(/\(?\s*null\s*\)?/gi, '').replace(/-\s*null/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    // Standardize WP prefixes
    t = t.replace(/^(WP\d+[:\s]+)+/i, (match) => {
        const first = match.match(/WP\d+/i);
        return first ? `${first[0].toUpperCase()}: ` : '';
    });
    return t.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Assembles a structured document with GROUPED WP Sequencing and HEAVY Deduplication.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>();
    const normTitleToPoolKey = new Map<string, string>();

    // --- PRIORITY SYSTEM ---
    const FOUNDATION_PRIORITY: Record<string, number> = {
        'context': 1, 'projectsummary': 2, 'abstract': 2, 'summary': 2, 'relevance': 3,
        'projectdescription': 4, 'needsanalysis': 5, 'partnershipandcooperation': 6,
        'partnershiparrangements': 6, 'consortium': 6, 'impact': 10, 'design': 11, 'implementation': 11,
        'projectdesignandimplementation': 11, 'workpackagesoverview': 100, 'wplist': 100,
        'budget': 800, 'risks': 810, 'annexes': 990, 'checklist': 995, 'declaration': 992, 'euvalues': 994
    };

    const getLayoutPriority = (key: string, title?: string): number => {
        const nk = normalize(key);
        const nt = normalize(title || "");

        // WP Grouping Logic: Force WPs to follow the Overview
        const wpIdx = extractWPIndex(key) ?? extractWPIndex(title || '');
        if (wpIdx !== undefined) {
            const base = layout.findIndex(l => normalize(l).includes('workpackageoverview') || normalize(l).includes('wplist'));
            if (base !== -1) return (base + 0.1) + (wpIdx * 0.001);
            const design = layout.findIndex(l => normalize(l).includes('design') || normalize(l).includes('implementation'));
            if (design !== -1) return (design + 0.5) + (wpIdx * 0.001);
            return 101 + (wpIdx * 0.01);
        }

        // Standard Layout Match
        if (layout.length > 0) {
            const idx = layout.findIndex(item => {
                const ni = normalize(item);
                if (nk === ni || nt === ni || (ni.length > 4 && (nk.includes(ni) || ni.includes(nk) || nt.includes(ni)))) return true;
                return false;
            });
            if (idx !== -1) return idx;
        }

        // Fallback
        if (FOUNDATION_PRIORITY[nk]) return FOUNDATION_PRIORITY[nk];
        for (const [fk, fv] of Object.entries(FOUNDATION_PRIORITY)) {
            if (nk.includes(fk) || nt.includes(fk)) return fv;
        }
        return 500;
    };

    // 1. EXECUTIVE SUMMARY
    const summaryVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'] || dynamicSections['project_summary'];
    if (summaryVal) {
        sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: summaryVal, level: 1, order: getLayoutPriority('summary') });
        normTitleToPoolKey.set(normalize('Executive Summary'), 'summary');
    }

    // 2. TEMPLATE SECTIONS (The Skeleton)
    if (fundingScheme?.template_json?.sections) {
        const processSections = (sections: any[], level = 1, parentOrder?: number) => {
            sections.forEach((s, sIdx) => {
                const normLabel = normalize(s.label);
                const baseKey = s.key || normLabel;
                const poolKey = `template_${level}_${sIdx}_${baseKey}`;

                // Deduplicate Template headers (some templates have duplicate nodes)
                if (normTitleToPoolKey.has(normLabel) && level > 1) return;

                const wpIdx = extractWPIndex(baseKey) ?? extractWPIndex(s.label);

                // MAIN WP Anchor Identification: Must look like a WP header
                const isWPHeader = wpIdx !== undefined &&
                    (normLabel.startsWith('workpackage') || normLabel.startsWith('wp') || normalize(baseKey).startsWith('workpackage')) &&
                    !normLabel.includes('activity') && !normLabel.includes('objective') && !normLabel.includes('deliverable');

                // Lift WP Headers to level 1 for consistent card rendering
                const liftedLevel = isWPHeader ? 1 : level;

                // Priority Inheritance: children stick to parents unless they have specific layout entries
                const rawPriority = getLayoutPriority(baseKey, s.label);
                const effectiveOrder = (rawPriority !== 500) ? rawPriority : (parentOrder !== undefined ? parentOrder : 500);

                if (wpIdx !== undefined && !wpIdxToPoolKey.has(wpIdx)) {
                    if (isWPHeader || !wpIdxToPoolKey.get(wpIdx)) {
                        wpIdxToPoolKey.set(wpIdx, poolKey);
                    }
                }
                normTitleToPoolKey.set(normLabel, poolKey);

                sectionPool.set(poolKey, {
                    id: poolKey, title: cleanTitle(s.label), description: s.description,
                    level: liftedLevel, wpIdx: wpIdx,
                    type: isWPHeader ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: effectiveOrder + (sIdx * 0.0001) + (level * 0.00001)
                });

                if (s.subsections && s.subsections.length > 0) {
                    processSections(s.subsections, level + 1, effectiveOrder);
                }
            });
        };
        processSections(fundingScheme.template_json.sections);
    }

    // 3. ENRICHMENT (Merging AI Narrative)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string' || val.length < 10) return;
        const nk = normalize(key);
        if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

        const wpIdx = extractWPIndex(key);
        let targetKey = '';

        if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
            targetKey = wpIdxToPoolKey.get(wpIdx)!;
        } else if (normTitleToPoolKey.has(nk)) {
            targetKey = normTitleToPoolKey.get(nk)!;
        } else {
            // Aggressive fuzzy match
            for (const [pK, pV] of sectionPool.entries()) {
                const pn = normalize(pK);
                const tn = normalize(pV.title);
                if (pn === nk || tn === nk || (nk.length > 4 && pn.includes(nk)) || (nk.length > 4 && nk.includes(pn))) {
                    targetKey = pK; break;
                }
            }
        }

        if (targetKey) {
            const existing = sectionPool.get(targetKey)!;
            // Append or replace narrative if AI content is more detailed
            if (!existing.content || val.length > existing.content.length * 0.8) {
                existing.content = val;
            }
        } else {
            sectionPool.set(key, {
                id: key, title: cleanTitle(key), content: val, level: 1, wpIdx: wpIdx,
                type: wpIdx !== undefined ? 'wp_item' : undefined,
                order: getLayoutPriority(key, key)
            });
            if (wpIdx !== undefined) wpIdxToPoolKey.set(wpIdx, key);
        }
    });

    // 4. STRUCTURAL ANCHORS (Partners, Budget, Risks)
    const ensureStructural = (id: string, title: string, type: string) => {
        const nt = normalize(title);
        let found = '';
        for (const [pK, pV] of sectionPool.entries()) {
            if (normalize(pV.title).includes(nt) || nt.includes(normalize(pV.title))) {
                found = pK; break;
            }
        }
        if (found) {
            const s = sectionPool.get(found)!;
            s.type = type; s.level = 1;
        } else {
            sectionPool.set(id, { id, title, level: 1, type, order: getLayoutPriority(id, title) });
        }
    };

    if (proposal.partners?.length > 0) {
        ensureStructural('p_anchor', 'Participating Organisations', 'partners');
        ensureStructural('prof_anchor', 'Organisation Profiles & Capacity', 'partner_profiles');
    }
    if ((proposal.budget || []).length > 0) ensureStructural('b_anchor', 'Budget & Cost Estimation', 'budget');
    if ((proposal.risks || []).length > 0) ensureStructural('r_anchor', 'Risk Management & Mitigation', 'risk');

    // 5. WP DATA SYNC
    workPackages.forEach((wp: any, idx: number) => {
        const wpKey = wpIdxToPoolKey.get(idx);
        if (wpKey) {
            const s = sectionPool.get(wpKey)!;
            if (wp.name && (!s.title || s.title.length < 15)) s.title = cleanTitle(wp.name);
            if (!s.content) s.content = wp.description;
            s.type = 'work_package';
        } else {
            const wpId = `auto_wp_${idx}`;
            sectionPool.set(wpId, {
                id: wpId, title: cleanTitle(wp.name || `Work Package ${idx + 1}`),
                content: wp.description, level: 1, wpIdx: idx, type: 'work_package',
                order: getLayoutPriority(`wp${idx + 1}`)
            });
            wpIdxToPoolKey.set(idx, wpId);
        }
    });

    // 6. FINAL ASSEMBLY & FLATTENING
    const items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000));

    // Overview Injection
    const firstWPIdx = items.findIndex(s => s.type === 'work_package');
    if (firstWPIdx !== -1 && !items.some(s => s.type === 'wp_list')) {
        items.splice(firstWPIdx, 0, { id: 'wp_ov', title: 'Work packages overview', level: 1, type: 'wp_list', order: items[firstWPIdx].order! - 0.005 });
    }

    return items.filter(s => {
        // Keep structural blocks and WPs
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package', 'partner_profiles'].includes(s.type || '')) return true;
        // Keep narrative content
        if (s.content && s.content.length > 20) return true;
        // Keep Top Level headers only if they have children that survived
        if (s.level <= 2) {
            return items.some(child => child.id.startsWith(s.id) && child.id !== s.id && (child.content || child.type));
        }
        return false;
    });
}
