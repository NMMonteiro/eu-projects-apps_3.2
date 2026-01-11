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
 * EXTREME WP Index extraction.
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    // Handle ALL variations: "work_package_2", "WP_2", "Work package-3", "WorkPlan1", etc.
    const match = text.match(/\b(?:Work|WP|WorkPlan)[\s_-]*(?:Packages?|Plan)?[\s_-]*(?:n°|no\.?|#|number)?[\s_-]*(\d+)\b/i);
    if (match) return parseInt(match[1]) - 1;
    return undefined;
}

/**
 * PURE Sanitizer: Removes nulls, underscores, and ALL WP PREFIXES.
 * Returns a totally clean title (e.g. "Project Management").
 */
function cleanTitle(title: string): string {
    if (!title) return '';
    // 1. Basic string cleanup
    let t = title.replace(/undefined/gi, '').replace(/\(?\s*null\s*\)?/gi, '').replace(/-\s*null/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s*-\s*$/, '');

    // 2. EXTREME Regex for prefixes like "WP1:", "WP 1:", "Work Package 1 -", "work_package_1", etc.
    const wpPrefixRegex = /^(?:WP|Work[\s_-]*Packages?|Work[\s_-]*Plan)[\s_-]*(?:n°|no\.?|#|number)?[\s_-]*\d+\s*[:\.-]*/i;

    // Strip recursively to handle "WP1: WP1: ..."
    let safety = 0;
    while (wpPrefixRegex.test(t) && safety < 5) {
        t = t.replace(wpPrefixRegex, '').trim();
        safety++;
    }

    if (!t && title) {
        // If stripping the prefix leaves nothing (e.g. title was just "WP1"), 
        // return the cleaned original title instead of an empty string
        return title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
    }
    return t ? t.replace(/^\w/, (c) => c.toUpperCase()) : '';
}

/**
 * Standardized Naming: Always format as "WPX: Title"
 */
function formatWPTitle(idx: number, rawTitle: string): string {
    const clean = cleanTitle(rawTitle);
    const prefix = `WP${idx + 1}`;
    if (!clean || clean.toLowerCase() === 'activities' || clean.toLowerCase() === 'loading') {
        return prefix;
    }
    return `${prefix}: ${clean}`;
}

/**
 * Assembles a structured document with ABSOLUTE Sequential Lockdown and NO DUPLICATION.
 */
export function assembleDocument(proposal: FullProposal): DisplaySection[] {
    const layout = proposal.layout?.sequence || [];
    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];

    const sectionPool = new Map<string, DisplaySection>();
    const wpIdxToPoolKey = new Map<number, string>();
    const normTitleToPoolKey = new Map<string, string>();

    const MASTER_ORDER: Record<string, number> = {
        'summary': 0, 'abstract': 0, 'projectsummary': 0,
        'context': 100,
        'relevance': 200,
        'projectdescription': 300,
        'needsanalysis': 400,
        'impact': 500,
        'design': 600, 'implementation': 600, 'projectdesignandimplementation': 600,
        'partnershiparrangements': 700, 'partnershipandcooperation': 700,
        'workpackagesoverview': 1000, 'wplist': 1000, 'listofworkpackages': 1000,
        'budget': 3000,
        'risks': 4000,
        'declaration': 9000,
        'annexes': 9500,
        'checklist': 9900, 'otherdocuments': 9910
    };

    const getPriority = (key: string, title?: string): number => {
        const nk = normalize(key);
        const nt = normalize(title || "");
        const wpNum = extractWPIndex(key) ?? extractWPIndex(title || '');
        if (wpNum !== undefined) return 1101 + wpNum;
        if (MASTER_ORDER[nk]) return MASTER_ORDER[nk];
        if (MASTER_ORDER[nt]) return MASTER_ORDER[nt];
        for (const [mk, mv] of Object.entries(MASTER_ORDER)) {
            if (nk.includes(mk) || nt.includes(mk)) return mv;
        }
        return 5000;
    };

    // 1. Process Template Skeleton
    if (fundingScheme?.template_json?.sections) {
        const process = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const nl = normalize(s.label);
                const bk = s.key || nl;
                const wpIdx = extractWPIndex(bk) ?? extractWPIndex(s.label);

                if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
                    if (s.subsections) process(s.subsections, level + 1);
                    return;
                }

                const pk = `t_${level}_${sIdx}_${bk}`;
                const isWPHeader = wpIdx !== undefined && (nl.includes('workpackage') || nl.includes('wp n'));

                if (isWPHeader && !wpIdxToPoolKey.has(wpIdx!)) wpIdxToPoolKey.set(wpIdx!, pk);
                normTitleToPoolKey.set(nl, pk);

                sectionPool.set(pk, {
                    id: pk,
                    title: isWPHeader ? formatWPTitle(wpIdx!, s.label) : (cleanTitle(s.label) || s.label),
                    description: s.description,
                    level: (isWPHeader || MASTER_ORDER[nl]) ? 1 : level,
                    wpIdx: wpIdx,
                    type: isWPHeader ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: getPriority(bk, s.label) + (sIdx * 0.001)
                });

                if (s.subsections && s.subsections.length > 0) process(s.subsections, level + 1);
            });
        };
        process(fundingScheme.template_json.sections);
    }

    // 2. Build Anchors
    [0, 1, 2, 3, 4].forEach(idx => {
        if (!wpIdxToPoolKey.has(idx)) {
            const id = `extra_wp_${idx}`;
            sectionPool.set(id, {
                id, title: `WP${idx + 1}`, level: 1, wpIdx: idx, type: 'work_package',
                order: 1101 + idx
            });
            wpIdxToPoolKey.set(idx, id);
        }
    });

    // 3. Merge Dynamic content & Legacy Fields
    const allContentSource: Record<string, any> = { ...dynamicSections };
    // Add legacy fields if they have content
    const legacyFields = ['introduction', 'relevance', 'methods', 'impact', 'objectives', 'methodology', 'expectedResults', 'innovation', 'sustainability', 'consortium', 'workPlan', 'riskManagement', 'dissemination'];
    legacyFields.forEach(f => {
        if ((proposal as any)[f] && (proposal as any)[f].length > 10) {
            allContentSource[f] = (proposal as any)[f];
        }
    });

    Object.entries(allContentSource).forEach(([key, val]) => {
        if (!val || typeof val !== 'string' || val.length < 5) return;
        const nk = normalize(key);
        if (['summary', 'budget', 'partners', 'risks'].some(x => nk.includes(x))) return;

        const wpIdx = extractWPIndex(key);
        let target = wpIdx !== undefined ? wpIdxToPoolKey.get(wpIdx) : normTitleToPoolKey.get(nk);

        if (!target) {
            for (const [pK, pV] of sectionPool.entries()) {
                const pn = normalize(pV.title);
                if (normalize(pK).includes(nk) || nk.includes(normalize(pK)) || pn.includes(nk) || nk.includes(pn)) {
                    target = pK;
                    break;
                }
            }
        }

        if (target) {
            const s = sectionPool.get(target)!;
            if (!s.content || val.length > s.content.length) s.content = val;
            else if (!s.content.includes(val.substring(0, 30))) s.content += "\n\n" + val;
        } else {
            sectionPool.set(key, {
                id: key,
                title: wpIdx !== undefined ? formatWPTitle(wpIdx, key) : (cleanTitle(key) || key),
                content: val, level: 1, wpIdx: wpIdx, order: getPriority(key)
            });
        }
    });

    // 3.5 Fallback for organization/background sections from partner data
    const coord = (proposal.partners || []).find(p => p.isCoordinator || (p as any).is_coordinator);
    if (coord) {
        for (const [pk, s] of sectionPool.entries()) {
            const nl = normalize(s.title);
            const isBackground = nl === 'background' || nl === 'organisationalbackground' || nl.includes('backgroundandexperience');
            if (isBackground && (!s.content || s.content.length < 50)) {
                const bgContent = [coord.description, coord.experience].filter(Boolean).join("\n\n");
                if (bgContent.length > 50) {
                    s.content = bgContent;
                    console.log(`Populated ${s.title} from Coordinator data`);
                }
            }
        }
    }

    // 4. Final DB Sync (The Hammer of Cleanliness)
    workPackages.forEach((wp: any, idx: number) => {
        const key = wpIdxToPoolKey.get(idx);
        if (key) {
            const s = sectionPool.get(key)!;
            // Always overwrite with DB name if it's more descriptive, but format it carefully
            const dbNameClean = wp.name ? cleanTitle(wp.name) : "";
            if (dbNameClean) {
                s.title = formatWPTitle(idx, dbNameClean);
            }
            if (wp.description && (!s.content || wp.description.length > s.content.length)) {
                s.content = wp.description;
            }
            s.type = 'work_package';
        }
    });

    // 5. Structural Anchors
    const ensureHeader = (id: string, searchTitle: string, type: string) => {
        let found = '';
        const nt = normalize(searchTitle);
        for (const [pK, pV] of sectionPool.entries()) {
            const pn = normalize(pV.title);
            if (pn.includes(nt) || nt.includes(pn)) { found = pK; break; }
        }
        if (found) {
            const s = sectionPool.get(found)!;
            s.type = type; s.level = 1; s.order = MASTER_ORDER[nt] || s.order;
        } else {
            sectionPool.set(id, { id, title: searchTitle, level: 1, type, order: MASTER_ORDER[nt] || 5000 });
        }
    };

    if (proposal.partners?.length > 0) { ensureHeader('pm', 'Participating Organisations', 'partners'); ensureHeader('pp', 'Organisation Profiles', 'partner_profiles'); }
    if ((proposal.budget || []).length > 0) ensureHeader('bm', 'Budget', 'budget');
    if ((proposal.risks || []).length > 0) ensureHeader('rm', 'Risk Management', 'risk');

    const sumVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'];
    if (sumVal) sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: sumVal, level: 1, order: 0 });

    // 6. Injection
    let items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 5000) - (b.order ?? 5000));
    const hasOverview = items.some(s => { const n = normalize(s.title); return n.includes('workpackagesoverview') || n.includes('wplist') || n.includes('listofworkpackages'); });

    if (!hasOverview) {
        const firstWPIdx = items.findIndex(s => s.wpIdx !== undefined && s.type === 'work_package');
        if (firstWPIdx !== -1) items.splice(firstWPIdx, 0, { id: 'wp_list_final', title: 'Work packages overview', level: 1, type: 'wp_list', order: 1000 });
    } else {
        const ov = items.find(s => { const n = normalize(s.title); return n.includes('workpackagesoverview') || n.includes('wplist') || n.includes('listofworkpackages'); });
        if (ov) ov.type = 'wp_list';
    }

    return items.filter(s => {
        const type = s.type || '';
        // Always show structured data sections
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package', 'partner_profiles'].includes(type)) return true;

        // Show all level 1 sections (headers) even if empty
        if (s.level === 1) return true;

        // For others, only show if they have real content
        return !!(s.content && s.content.trim().length > 10);
    });
}
