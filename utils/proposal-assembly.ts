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
    const match = text.match(/\b(?:Work\s*Packages?|WP|WP_)\s*(?:n°|no\.?|#|number)?\s*(\d+)\b/i);
    if (match) return parseInt(match[1]) - 1;
    return undefined;
}

/**
 * PURE Sanitizer: Removes nulls, underscores, and LEADING WP PREFIXES.
 * The 'decoration' (adding WP1: etc) is handled by the caller who knows the index.
 */
function cleanTitle(title: string): string {
    if (!title) return '';
    // 1. Basic cleanup
    let t = title.replace(/undefined/gi, '').replace(/\(?\s*null\s*\)?/gi, '').replace(/-\s*null/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    // 2. Trim trailing dashes
    t = t.replace(/\s*-\s*$/, '');
    // 3. STRIP leading WP prefixes and artifacts like "WP1:" or "Work Package 1 -"
    t = t.replace(/^(WP\d+[:\s\.-]*)+/i, '');
    t = t.replace(/^Work\s*Package\s*(?:n°|no\.?|#)?\s*\d+\s*[:\.-]*/i, '');

    t = t.trim();
    // 4. Default if empty (e.g. original was just "WP1")
    if (!t) return title;

    return t.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Assembles a structured document with ABSOLUTE WP INDEX DEDUPLICATION.
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

    // 1. Process template to establish anchors
    if (fundingScheme?.template_json?.sections) {
        const processTemplate = (sections: any[], level = 1) => {
            sections.forEach((s, sIdx) => {
                const nl = normalize(s.label);
                const bk = s.key || nl;
                const wpIdx = extractWPIndex(bk) ?? extractWPIndex(s.label);

                if (wpIdx !== undefined && wpIdxToPoolKey.has(wpIdx)) {
                    if (s.subsections) processTemplate(s.subsections, level + 1);
                    return;
                }

                const pk = `t_${level}_${sIdx}_${bk}`;
                const isWPHeader = wpIdx !== undefined && (nl.includes('workpackage') || nl.includes('wp n'));

                if (isWPHeader && !wpIdxToPoolKey.has(wpIdx!)) wpIdxToPoolKey.set(wpIdx!, pk);
                normTitleToPoolKey.set(nl, pk);

                sectionPool.set(pk, {
                    id: pk,
                    title: isWPHeader ? `Work Package ${wpIdx! + 1}: ${cleanTitle(s.label)}` : cleanTitle(s.label),
                    description: s.description,
                    level: (isWPHeader || MASTER_ORDER[nl]) ? 1 : level,
                    wpIdx: wpIdx,
                    type: isWPHeader ? 'work_package' : (wpIdx !== undefined ? 'wp_item' : s.type),
                    order: getPriority(bk, s.label) + (sIdx * 0.001)
                });

                if (s.subsections && s.subsections.length > 0) processTemplate(s.subsections, level + 1);
            });
        };
        processTemplate(fundingScheme.template_json.sections);
    }

    // 2. Ensure ALL 5 WP slots exist
    [0, 1, 2, 3, 4].forEach(idx => {
        if (!wpIdxToPoolKey.has(idx)) {
            const id = `extra_wp_${idx}`;
            sectionPool.set(id, {
                id, title: `WP${idx + 1}: Loading...`, level: 1, wpIdx: idx, type: 'work_package',
                order: 1101 + idx
            });
            wpIdxToPoolKey.set(idx, id);
        }
    });

    // 3. Merge Dynamic Content
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!val || typeof val !== 'string' || val.length < 10) return;
        const nk = normalize(key);
        if (['summary', 'budget', 'partners', 'risks'].some(x => nk.includes(x))) return;

        const wpIdx = extractWPIndex(key);
        let target = wpIdx !== undefined ? wpIdxToPoolKey.get(wpIdx) : normTitleToPoolKey.get(nk);

        if (!target) {
            for (const [pK, pV] of sectionPool.entries()) {
                const pn = normalize(pK);
                const tn = normalize(pV.title);
                if (pn.includes(nk) || nk.includes(pn) || tn.includes(nk) || nk.includes(tn)) { target = pK; break; }
            }
        }

        if (target) {
            const s = sectionPool.get(target)!;
            if (!s.content || val.length > s.content.length) s.content = val;
            else if (!s.content.includes(val.substring(0, 30))) s.content += "\n\n" + val;
        } else {
            sectionPool.set(key, {
                id: key,
                title: wpIdx !== undefined ? `WP${wpIdx + 1}: ${cleanTitle(key)}` : cleanTitle(key),
                content: val, level: 1, wpIdx: wpIdx, order: getPriority(key)
            });
        }
    });

    // 4. Final DB Sync (Solves Double WP3: WP3: issue)
    workPackages.forEach((wp: any, idx: number) => {
        const key = wpIdxToPoolKey.get(idx);
        if (key) {
            const s = sectionPool.get(key)!;
            const dbName = wp.name ? cleanTitle(wp.name) : "";
            const isGeneric = s.title.toLowerCase().includes('n°') || s.title.toLowerCase().includes('activities') || s.title.toLowerCase().includes('loading') || s.title.length < 20;

            if (dbName && (isGeneric || dbName.length + 5 > s.title.length)) {
                s.title = `WP${idx + 1}: ${dbName}`;
            }
            if (wp.description && (!s.content || wp.description.length > s.content.length)) {
                s.content = wp.description;
            }
            s.type = 'work_package';
        }
    });

    // 5. Structural Blocks
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

    if (proposal.partners?.length > 0) {
        ensureHeader('p_main', 'Participating Organisations', 'partners');
        ensureHeader('p_prof', 'Organisation Profiles', 'partner_profiles');
    }
    if ((proposal.budget || []).length > 0) ensureHeader('b_main', 'Budget', 'budget');
    if ((proposal.risks || []).length > 0) ensureHeader('r_main', 'Risk Management', 'risk');

    const sumVal = proposal.summary || (proposal as any).abstract || dynamicSections['summary'];
    if (sumVal) sectionPool.set('summary', { id: 'summary', title: 'Executive Summary', content: sumVal, level: 1, order: 0 });

    // 6. Assemble & Inject Overview
    let items = Array.from(sectionPool.values()).sort((a, b) => (a.order ?? 5000) - (b.order ?? 5000));

    const hasOverview = items.some(s => {
        const n = normalize(s.title);
        return n.includes('workpackagesoverview') || n.includes('wplist') || n.includes('listofworkpackages');
    });

    if (!hasOverview) {
        const firstWPIdx = items.findIndex(s => s.wpIdx !== undefined && s.type === 'work_package');
        if (firstWPIdx !== -1) {
            items.splice(firstWPIdx, 0, { id: 'wp_list_gen', title: 'Work packages overview', level: 1, type: 'wp_list', order: 1000 });
        }
    } else {
        const ov = items.find(s => {
            const n = normalize(s.title);
            return n.includes('workpackagesoverview') || n.includes('wplist') || n.includes('listofworkpackages');
        });
        if (ov) ov.type = 'wp_list';
    }

    return items.filter(s => {
        if (['wp_list', 'partners', 'budget', 'risk', 'work_package', 'partner_profiles'].includes(s.type || '')) return true;
        if (s.content && s.content.length > 5) return true;
        if (s.level === 1) return items.some(child => child.id.startsWith(s.id) && child.id !== s.id && (child.content || child.type));
        return false;
    });
}
