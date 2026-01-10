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
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
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
 * Assembles a structured document with ABSOLUTE Sequential Lockdown.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>();
    const normTitleToPoolKey = new Map<string, string>();

    // --- MASTER SEQUENCE (ABSOLUTE TRUTH) ---
    // These values are large spread to allow for custom insertions while maintaining block order.
    const MASTER_ORDER: Record<string, number> = {
        'summary': 0, 'abstract': 0, 'projectsummary': 0,
        'context': 100,
        'relevance': 200,
        'projectdescription': 300,
        'needsanalysis': 400,
        'impact': 500,
        'design': 600, 'implementation': 600, 'projectdesignandimplementation': 600,
        'partnershiparrangements': 700, 'partnershipandcooperation': 700,
        'workpackagesoverview': 1000, 'wplist': 1000,
        'wp1': 1101, 'wp2': 1102, 'wp3': 1103, 'wp4': 1104, 'wp5': 1105,
        'partners': 2000, 'participatingorganisations': 2000,
        'partnerprofiles': 2100, 'organisationprofiles': 2100,
        'budget': 3000, 'budgetandcostestimation': 3000,
        'risks': 4000, 'riskmanagement': 4000,
        'euvalues': 8000,
        'declaration': 9000,
        'annexes': 9500,
        'checklist': 9900, 'otherdocuments': 9910
    };

    const getPriority = (key: string, title?: string): number => {
        const nk = normalize(key);
        const nt = normalize(title || "");

        // 1. Check WP Special logic
        const wpNum = extractWPIndex(key) ?? extractWPIndex(title || '');
        if (wpNum !== undefined) return 1101 + wpNum;

        // 2. Check MASTER_ORDER (The Hammer)
        if (MASTER_ORDER[nk]) return MASTER_ORDER[nk];
        if (MASTER_ORDER[nt]) return MASTER_ORDER[nt];
        for (const [mk, mv] of Object.entries(MASTER_ORDER)) {
            if (nk.includes(mk) || nt.includes(mk)) return mv;
        }

        // 3. Fallback to Layout Sequence
        if (layout.length > 0) {
            const lIdx = layout.findIndex(item => {
                const ni = normalize(item);
                return (nk === ni || nt === ni || ni.includes(nk) || nk.includes(ni));
            });
            if (lIdx !== -1) return 10000 + lIdx;
        }

        return 5000;
    };

    // 1. Process Template Skeleton
    if (fundingScheme?.template_json?.sections) {
        const process = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const nl = normalize(s.label);
                const bk = s.key || nl;
                const pk = `t_${level}_${sIdx}_${bk}`;

                const wpIdx = extractWPIndex(bk) ?? extractWPIndex(s.label);
                // A WP header MUST mention "Work Package" or "WP" explicitly and be a header
                const isWPHeader = wpIdx !== undefined && (nl.includes('workpackage') || nl.includes('wp n'));

                // FORCE LIFTING: If it's a major section, it MUST be level 1
                let finalLevel = level;
                if (isWPHeader || MASTER_ORDER[nl] || MASTER_ORDER[normalize(bk)]) {
                    finalLevel = 1;
                }

                if (isWPHeader && !wpIdxToPoolKey.has(wpIdx!)) wpIdxToPoolKey.set(wpIdx!, pk);
                normTitleToPoolKey.set(nl, pk);

                sectionPool.set(pk, {
                    id: pk, title: cleanTitle(s.label), description: s.description,
                    level: finalLevel, wpIdx: wpIdx,
                    type: isWPHeader ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: getPriority(bk, s.label) + (sIdx * 0.001)
                });

                if (s.subsections && s.subsections.length > 0) process(s.subsections, level + 1);
            });
        };
        process(fundingScheme.template_json.sections);
    }

    // 2. Sync Work Packages from DB (Guarantees WP4, WP5 visibility)
    [0, 1, 2, 3, 4].forEach(idx => {
        const dbWp = workPackages[idx];
        const existingKey = wpIdxToPoolKey.get(idx);

        if (existingKey) {
            const s = sectionPool.get(existingKey)!;
            // Merge DB data if present
            if (dbWp) {
                if (dbWp.name && (!s.title || s.title.length < 10)) s.title = cleanTitle(dbWp.name);
                if (!s.content || s.content.length < (dbWp.description || "").length) s.content = dbWp.description;
            }
            s.type = 'work_package';
            s.level = 1; // Double lock
        } else if (dbWp || dynamicSections[`wp${idx + 1}`] || dynamicSections[`work_package_${idx + 1}`]) {
            // Create placeholders for missing template nodes
            const id = `extra_wp_${idx}`;
            sectionPool.set(id, {
                id, title: cleanTitle(dbWp?.name || `Work Package ${idx + 1}`),
                content: dbWp?.description || dynamicSections[`wp${idx + 1}`] || dynamicSections[`work_package_${idx + 1}`],
                level: 1, wpIdx: idx, type: 'work_package', order: 1101 + idx
            });
            wpIdxToPoolKey.set(idx, id);
        }
    });

    // 3. Merge Dynamic Narrative Sections
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string' || val.length < 10) return;
        const nk = normalize(key);
        if (['summary', 'abstract', 'budget', 'partners', 'risks', 'project_summary'].includes(nk)) return;

        const wpIdx = extractWPIndex(key);
        let target = wpIdx !== undefined ? wpIdxToPoolKey.get(wpIdx) : normTitleToPoolKey.get(nk);

        if (!target) {
            // Last ditch fuzzy search
            for (const [pK, pV] of sectionPool.entries()) {
                if (normalize(pV.title).includes(nk) || nk.includes(normalize(pV.title))) { target = pK; break; }
            }
        }

        if (target) {
            const s = sectionPool.get(target)!;
            if (!s.content || val.length > s.content.length) s.content = val;
        } else {
            sectionPool.set(key, { id: key, title: cleanTitle(key), content: val, level: 1, wpIdx: wpIdx, order: getPriority(key) });
        }
    });

    // 4. Anchor Structural Blocks
    const ensureHeader = (id: string, searchTitle: string, type: string) => {
        let found = '';
        const nt = normalize(searchTitle);
        for (const [pK, pV] of sectionPool.entries()) {
            if (normalize(pV.title).includes(nt) || nt.includes(normalize(pV.title))) { found = pK; break; }
        }
        if (found) {
            const s = sectionPool.get(found)!;
            s.type = type; s.level = 1; s.order = MASTER_ORDER[nt] || s.order;
        } else {
            sectionPool.set(id, { id, title: searchTitle, level: 1, type, order: MASTER_ORDER[nt] || 5000 });
        }
    };

    if (proposal.partners?.length > 0) {
        ensureHeader('p_main', 'Participating Organisations', 'partners');
        ensureHeader('p_prof', 'Organisation Profiles & Capacity', 'partner_profiles');
    }
    if ((proposal.budget || []).length > 0) ensureHeader('b_main', 'Budget & Cost Estimation', 'budget');
    if ((proposal.risks || []).length > 0) ensureHeader('r_main', 'Risk Management & Mitigation', 'risk');

    // 5. Executive Summary
    const sumVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'];
    if (sumVal) sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: sumVal, level: 1, order: 0 });

    // 6. Final Sort & Filter
    const items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 5000) - (b.order ?? 5000));

    // Inject Overview strictly before WP1
    const wp1Idx = items.findIndex(s => s.wpIdx === 0 && s.type === 'work_package');
    if (wp1Idx !== -1 && !items.some(s => s.type === 'wp_list')) {
        items.splice(wp1Idx, 0, { id: 'wp_list', title: 'Work packages overview', level: 1, type: 'wp_list', order: 1000 });
    }

    return items.filter(s => {
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package', 'partner_profiles'].includes(s.type || '')) return true;
        if (s.content && s.content.length > 5) return true;
        // Keep structural headers if they contain active content
        if (s.level === 1) {
            return items.some(child => child.id.startsWith(s.id) && child.id !== s.id && (child.content || child.type));
        }
        return false;
    });
}
