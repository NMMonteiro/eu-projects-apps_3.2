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

/**
 * Robustly extracts a WP index from strings like "Work package n°1", "WP 2", "WP3: title"
 */
function extractWPIndex(text: string): number | undefined {
    if (!text) return undefined;
    // Matches: WP1, WP 1, Work Package 1, Work Package n°1, WP no.1 etc.
    const match = text.match(/(?:Work\s*Package|WP)\s*(?:n°|no\.?|#|number)?\s*(\d+)/i);
    if (match) {
        return parseInt(match[1]) - 1;
    }
    return undefined;
}

function cleanTitle(title: string): string {
    if (!title) return '';
    let t = title
        .replace(/undefined/gi, '')
        .replace(/\(?\s*null\s*\)?/gi, '')
        .replace(/undefined_/gi, ' ')
        .replace(/-\s*null/gi, '') // Handle "Activities (2 - null)"
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\(\s*\)/g, '')   // Remove empty parentheses
        .replace(/\(\s*-\s*\)/g, '')
        .replace(/\s*-\s*$/, '') // Remove trailing dash
        .trim();

    // Remove repeated "WPx:" prefixes (e.g., "WP1: WP1: title" -> "WP1: title")
    t = t.replace(/^(WP\d+[:\s]+)+/i, (match) => {
        const first = match.match(/WP\d+/i);
        return first ? `${first[0].toUpperCase()}: ` : '';
    });

    return t.replace(/^\w/, (c) => c.toUpperCase());
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
    let lastWPRelevantIndex = -1;
    let lastWPLevel = 2;

    // 1. Check if template has a summary section to avoid double-rendering
    const hasTemplateSummary = fundingScheme?.template_json?.sections?.some((s: any) =>
        s.key === 'summary' ||
        s.key === 'abstract' ||
        s.key === 'project_summary' ||
        s.label.toLowerCase().includes('summary')
    );

    const summaryContent = proposal.summary || (proposal as any).abstract || dynamicSections['summary'] || dynamicSections['abstract'];

    if (summaryContent && !hasTemplateSummary) {
        finalDocument.push({ id: 'summary', title: 'Executive Summary', content: summaryContent, level: 1 });
        renderedKeys.add('summary');
        renderedKeys.add('abstract');
    }

    // 2. Main Narrative (Strict Template Order)
    if (fundingScheme?.template_json?.sections) {
        const processTemplate = (sections: any[], level = 1, isInsideWP = false) => {
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
                    ((ts.label.toLowerCase().includes('work package') ||
                        ts.label.toLowerCase().includes('workplan') ||
                        ts.label.toLowerCase().includes('tasks')) && !isInsideWP);

                let wpIdx: number | undefined = extractWPIndex(ts.key || key) ?? extractWPIndex(ts.label);

                if ((isWP || wpIdx !== undefined) && !isInsideWP) {
                    lastWPLevel = level;
                    if (wpIdx !== undefined) {
                        renderedWPIndices.add(wpIdx);
                    }
                }

                let displayTitle = cleanTitle(ts.label);
                if (isWP && wpIdx !== undefined) {
                    const wpName = workPackages[wpIdx]?.name || `Work Package ${wpIdx + 1}`;
                    // Strip existing WPx: from name if present to avoid duplication
                    const cleanName = wpName.replace(/^WP\d+[:\s]+/i, '').trim();
                    displayTitle = `WP${wpIdx + 1}: ${cleanName}`;
                }

                const currentIsInsideWP = isInsideWP || isWP;

                // Only the main WP section should trigger structured data view to avoid duplication
                const isMainWP = isWP && !isInsideWP;

                finalDocument.push({
                    id: ts.key || key,
                    title: displayTitle,
                    content: content,
                    description: ts.description,
                    type: (isMainWP && wpIdx !== undefined) ? 'work_package' : ts.type,
                    level: isMainWP ? 2 : level, // Force all main WPs to level 2 to keep them as siblings
                    wpIdx: wpIdx
                });

                if (currentIsInsideWP) {
                    const lowLabel = ts.label.toLowerCase();
                    const lowKey = (ts.key || "").toLowerCase();

                    // Suppress boilerplate containers but MERGE their content into parent WP
                    if (lowLabel.startsWith('activities') ||
                        lowLabel.includes('description of') ||
                        lowKey.includes('activities_description') ||
                        lowKey.endsWith('_activities')) {

                        if (lastWPRelevantIndex !== -1 && content && finalDocument[lastWPRelevantIndex]) {
                            const parent = finalDocument[lastWPRelevantIndex];
                            // Avoid double-merging if content is same
                            if (!parent.content?.includes(content.substring(0, 50))) {
                                parent.content = (parent.content || "") + "\n\n" + content;
                            }
                        }

                        // Mark this and all children as rendered to avoid leftovers
                        const markRendered = (sArr: any[]) => {
                            sArr.forEach(s => {
                                renderedKeys.add(s.key);
                                const sk = s.key || s.label?.toLowerCase().replace(/\s+/g, '_').replace(/[\W_]/g, '');
                                renderedKeys.add(sk);
                                if (s.subsections) markRendered(s.subsections);
                            });
                        };
                        renderedKeys.add(ts.key);
                        renderedKeys.add(key);
                        if (ts.subsections) markRendered(ts.subsections);

                        // Remove the boilerplate header we just pushed
                        finalDocument.pop();
                        return;
                    }
                    if (isMainWP) {
                        lastWPRelevantIndex = finalDocument.length - 1;
                    }
                }

                if (ts.subsections && ts.subsections.length > 0) {
                    processTemplate(ts.subsections, level + 1, currentIsInsideWP);
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

            if (nk === 'summary' || nk === 'abstract' || nk === 'budget' || nk === 'partners' || nk === 'risks') return;
            if (nk.includes('descriptionoftheactivities') || nk.includes('activitiesdescription')) return;

            // Don't let WP leftovers float to the top
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
    // Collect ALL WP indices from both structural data AND dynamic sections
    const allWPIndices = new Set<number>(workPackages.map((_, i) => i));
    Object.entries(dynamicSections).forEach(([key, val]) => {
        const nk = key.toLowerCase().replace(/[\W_]/g, '');
        const match = nk.match(/workpackage(\d+)/) || nk.match(/wp(\d+)/);
        if (match && val) {
            allWPIndices.add(parseInt(match[1]) - 1);
        }
    });

    if (allWPIndices.size > 0 && (renderedWPIndices.size < allWPIndices.size)) {

        let insertIndex = finalDocument.length;
        if (lastWPRelevantIndex !== -1) {
            insertIndex = lastWPRelevantIndex + 1;
        }

        const extras: DisplaySection[] = [];

        // Add remaining WPs in order
        Array.from(allWPIndices).sort((a, b) => a - b).forEach((idx: number) => {
            if (!renderedWPIndices.has(idx)) {
                const wp = workPackages[idx] || { name: `Work Package ${idx + 1}`, description: '' };
                const narrative = dynamicSections[`work_package_${idx + 1}`] ||
                    dynamicSections[`wp${idx + 1}`] ||
                    dynamicSections[`workpackage${idx + 1}`] ||
                    wp.description;

                extras.push({
                    id: `wp_${idx + 1}_auto`,
                    title: cleanTitle(wp.name ? `WP${idx + 1}: ${wp.name}` : `Work Package ${idx + 1}`),
                    content: narrative,
                    type: 'work_package',
                    level: 2, // Always flatten leftovers to level 2
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
