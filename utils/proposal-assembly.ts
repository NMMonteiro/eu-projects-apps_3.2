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

function cleanTitle(title: string): string {
    if (!title) return '';
    return title
        .replace(/undefined/gi, '')
        .replace(/\(?\s*null\s*\)?/gi, '')
        .replace(/undefined_/gi, ' ')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\(\s*-\s*\)/g, '')
        .replace(/\s*-\s*$/, '') // Remove trailing dash
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
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
    let wpOverviewInserted = false;

    // 1. Executive Summary (Always First)
    const summaryContent = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'];
    if (summaryContent) {
        finalDocument.push({ id: 'summary', title: 'Executive Summary', content: summaryContent, level: 1 });
        renderedKeys.add('summary');
        renderedKeys.add('abstract');
    }

    // 2. Main Narrative (Strict Template Order)
    if (fundingScheme?.template_json?.sections) {
        const processTemplate = (sections: any[], level = 1) => {
            [...sections].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(ts => {
                const key = ts.key || ts.label.toLowerCase().replace(/\s+/g, '_').replace(/[\W_]/g, '');

                // Content matching
                let content = dynamicSections[ts.key] || dynamicSections[key];

                // Fuzzy fallback only if specific key fails
                if (!content) {
                    const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
                    const nLabel = normalize(ts.label);
                    for (const [dk, dv] of Object.entries(dynamicSections)) {
                        if (normalize(dk) === nLabel) {
                            content = dv as string;
                            renderedKeys.add(dk);
                            break;
                        }
                    }
                } else {
                    renderedKeys.add(ts.key);
                    renderedKeys.add(key);
                }

                // Identify if this is a Work Package section
                const isWP = ts.type === 'work_package' ||
                    ts.label.toLowerCase().includes('work package') ||
                    ts.label.toLowerCase().includes('workplan') ||
                    ts.label.toLowerCase().includes('work plan') ||
                    ts.label.toLowerCase().includes('tasks') ||
                    key.includes('workpackage') ||
                    key.includes('workplan') ||
                    key.includes('tasks');
                let wpIdx: number | undefined = undefined;

                if (isWP) {
                    const match = key.match(/\d+/) || ts.label.match(/\d+/);
                    if (match) {
                        wpIdx = parseInt(match[0]) - 1;
                        renderedWPIndices.add(wpIdx);
                    } else if (!wpOverviewInserted && workPackages.length > 0) {
                        finalDocument.push({
                            id: 'wp_master_list',
                            title: 'Work Package Overview & Summary',
                            level: level,
                            type: 'wp_list'
                        });
                        wpOverviewInserted = true;
                    }
                }

                finalDocument.push({
                    id: ts.key || key,
                    title: cleanTitle(ts.label),
                    content: content,
                    description: ts.description,
                    type: (isWP && wpIdx === undefined) ? 'wp_list' : (isWP ? 'work_package' : ts.type),
                    level: level,
                    wpIdx: wpIdx
                });

                if (ts.subsections && ts.subsections.length > 0) {
                    processTemplate(ts.subsections, level + 1);
                }
            });
        };
        processTemplate(fundingScheme.template_json.sections);
    }

    // 3. Catch-all for AI-generated narrative that didn't match template
    Object.entries(dynamicSections).forEach(([key, val]) => {
        if (!renderedKeys.has(key) && val) {
            const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
            const nk = normalize(key);

            // Skip common non-narrative keys or things we already did
            if (nk === 'summary' || nk === 'abstract' || nk === 'budget' || nk === 'partners' || nk === 'risks') return;

            // Critical: Don't let WP leftovers float to the top
            const wpMatch = nk.match(/workpackage(\d+)/) || nk.match(/wp(\d+)/);
            if (wpMatch) return;

            finalDocument.push({
                id: key,
                title: cleanTitle(key),
                content: val as string,
                level: 1
            });
            renderedKeys.add(key);
        }
    });

    // 4. Custom User Sections
    const customSections = (proposal as any).customSections || [];
    customSections.forEach((s: any) => {
        finalDocument.push({ id: s.id, title: s.title, content: s.content, level: 1, isCustom: true });
    });

    // 5. Work Plan / Work Packages (Grouping leftovers to avoid "WP2 on page 1")
    const hasAnyWPInTemplate = finalDocument.some(s => s.type === 'work_package' || s.type === 'wp_list');

    // Collect ALL WP indices from both structural data AND dynamic sections
    const allWPIndices = new Set<number>(workPackages.map((_, i) => i));
    Object.entries(dynamicSections).forEach(([key, val]) => {
        const nk = key.toLowerCase().replace(/[\W_]/g, '');
        const match = nk.match(/workpackage(\d+)/) || nk.match(/wp(\d+)/);
        if (match && val) {
            allWPIndices.add(parseInt(match[1]) - 1);
        }
    });

    if (allWPIndices.size > 0 && (!hasAnyWPInTemplate || renderedWPIndices.size < allWPIndices.size)) {

        // Find the best place to insert these. Ideally after the last WP already rendered.
        let insertIndex = finalDocument.length;
        const lastWPIdx = [...finalDocument].reverse().findIndex(s => s.type === 'work_package' || s.type === 'wp_list');
        if (lastWPIdx !== -1) {
            insertIndex = finalDocument.length - lastWPIdx;
        }

        const extras: DisplaySection[] = [];
        if (!wpOverviewInserted) {
            extras.push({ id: 'wp_master_list_auto', title: 'Work Package Overview', level: 1, type: 'wp_list' });
            wpOverviewInserted = true;
        }

        Array.from(allWPIndices).sort((a, b) => a - b).forEach((idx: number) => {
            if (!renderedWPIndices.has(idx)) {
                const wp = workPackages[idx] || { name: `Work Package ${idx + 1}`, description: '' };
                const narrative = dynamicSections[`work_package_${idx + 1}`] ||
                    dynamicSections[`wp${idx + 1}`] ||
                    dynamicSections[`workpackage${idx + 1}`] ||
                    wp.description;

                extras.push({
                    id: `wp_${idx + 1}_auto`,
                    title: cleanTitle(wp.name || `Work Package ${idx + 1}`),
                    content: narrative,
                    type: 'work_package',
                    level: 2,
                    wpIdx: idx
                });
                renderedWPIndices.add(idx);
            }
        });

        if (extras.length > 0) {
            finalDocument.splice(insertIndex, 0, ...extras);
        }
    }

    // 6. Consortium / Partners
    const hasPartners = finalDocument.some(s => s.id === 'partners' || s.title?.toLowerCase().includes('partner') || s.title?.toLowerCase().includes('participating'));
    if (!hasPartners && proposal.partners?.length > 0) {
        finalDocument.push({ id: 'auto_partners', title: 'Participating Organisations', level: 1, type: 'partners' });
        finalDocument.push({ id: 'auto_profiles', title: 'Organisation Profiles & Capacity', level: 1, type: 'partner_profiles' });
    }

    // 7. Final Financials & Risks
    const hasBudget = finalDocument.some(s => s.type === 'budget' || s.title?.toLowerCase().includes('budget'));
    if (!hasBudget && budget.length > 0) {
        finalDocument.push({ id: 'auto_budget', title: 'Budget & Cost Estimation', level: 1, type: 'budget' });
    }

    const hasRisks = finalDocument.some(s => s.type === 'risk' || s.title?.toLowerCase().includes('risk'));
    if (!hasRisks && risks.length > 0) {
        finalDocument.push({ id: 'auto_risks', title: 'Risk Management & Mitigation', level: 1, type: 'risk' });
    }

    return finalDocument;
}
