import React, { useState, useEffect } from 'react';
import { ArrowLeft, Printer, Download, FileText, Building2, Clock, EuroIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner';
import { FullProposal } from '../types/proposal';
import {
    ResponsiveSectionContent,
    DynamicWorkPackageSection,
    DynamicBudgetSection,
    DynamicRiskSection
} from './ProposalSections';
import { exportToDocx } from '../utils/export-docx';

interface ProposalSummaryPageProps {
    proposalId: string | undefined;
    onBack: () => void;
}

export const ProposalSummaryPage: React.FC<ProposalSummaryPageProps> = ({ proposalId, onBack }) => {
    const [proposal, setProposal] = useState<FullProposal | null>(null);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const loadProposal = async () => {
            if (!proposalId) return;
            setLoading(true);
            try {
                const response = await fetch(`${serverUrl}/proposals/${proposalId}`, {
                    headers: {
                        'Authorization': `Bearer ${publicAnonKey}`,
                    }
                });
                if (!response.ok) throw new Error('Failed to load proposal');
                const data = await response.json();
                setProposal(data);
            } catch (error: any) {
                console.error('Load error:', error);
                toast.error(error.message || 'Failed to load proposal');
            } finally {
                setLoading(false);
            }
        };
        loadProposal();
    }, [proposalId]);

    const handlePrint = () => {
        window.print();
    };

    const handleExportToDocx = async () => {
        if (!proposal) return;
        setIsExporting(true);
        toast.info("Generating document...");
        try {
            await exportToDocx(proposal);
            toast.success("Proposal exported successfully!");
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export document.');
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                <p className="text-muted-foreground">Proposal not found</p>
                <Button onClick={onBack}>Go Back</Button>
            </div>
        );
    }

    const fundingScheme = proposal.fundingScheme || (proposal as any).funding_scheme;
    const dynamicSections = proposal.dynamicSections || (proposal as any).dynamic_sections || {};
    const workPackages = proposal.workPackages || (proposal as any).work_packages || [];
    const budget = proposal.budget || (proposal as any).budget || [];
    const risks = proposal.risks || (proposal as any).risks || [];
    const settings = proposal.settings || (proposal as any).settings || { currency: 'EUR' };
    const currency = settings.currency || 'EUR';
    const totalBudget = (budget || []).reduce((sum: number, item: any) => sum + (item.cost || 0), 0);
    const coordinator = proposal.partners?.find(p => p.isCoordinator);

    // --- HELPER: Robust Content Lookup ---
    const getFuzzyContent = (key: string, title: string) => {
        const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
        const nKey = normalize(key);
        const nTitle = normalize(title);

        // 1. Direct Dynamic Sections Match
        if (dynamicSections[key]) return dynamicSections[key];

        // 2. Fuzzy Dynamic Sections Match
        for (const [k, v] of Object.entries(dynamicSections)) {
            const nk = normalize(k);
            if (nk === nKey || nk === nTitle) return v;
            // Handle cross-mappings: wp1 <=> work_package_1 <=> wp_01
            if ((nk.startsWith('wp') || nk.startsWith('workpackage')) && (nKey.startsWith('wp') || nKey.startsWith('workpackage'))) {
                const numK = nk.match(/\d+/);
                const numKey = nKey.match(/\d+/);
                if (numK && numKey && numK[0] === numKey[0]) return v;
            }
        }

        // 3. Fallback to top-level proposal fields
        if ((proposal as any)[key]) return (proposal as any)[key];
        if (nKey === 'summary' || nTitle.includes('summary')) return proposal.summary || (proposal as any).abstract;
        if (nKey === 'relevance' || nTitle.includes('relevance')) return (proposal as any).relevance;
        if (nKey === 'methodology' || nTitle.includes('methodology') || nTitle.includes('methods')) return (proposal as any).methodology || (proposal as any).methods;

        return null;
    };

    // --- STEP 1: Assemble the Document Flow ---
    const finalDocument: any[] = [];
    const renderedKeys = new Set<string>();
    const wpIndicesRendered = new Set<number>();

    // Start with a Summary if it exists and isn't usually in the template
    if (proposal.summary) {
        finalDocument.push({ id: 'summary', title: 'Executive Summary', content: proposal.summary, level: 1 });
        renderedKeys.add('summary');
    }

    // Process Template Sections
    if (fundingScheme?.template_json?.sections) {
        const process = (templateSections: any[], level = 1) => {
            [...templateSections].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(ts => {
                const key = ts.key || ts.label.toLowerCase().replace(/\s+/g, '_');
                const content = getFuzzyContent(key, ts.label);

                finalDocument.push({
                    id: key,
                    title: ts.label,
                    content: content,
                    description: ts.description,
                    type: ts.type,
                    level: level
                });
                renderedKeys.add(key);

                // Track if this section is a WP
                const wpMatch = key.match(/work_package_(\d+)/i) || ts.label.match(/WP\s*(\d+)/i) || ts.label.match(/Work Package\s*(\d+)/i);
                if (wpMatch) wpIndicesRendered.add(parseInt(wpMatch[1]) - 1);
                else if (ts.type === 'work_package' || ts.label.toLowerCase().includes('work package')) {
                    // Generic WP section - usually renders all
                    workPackages.forEach((_: any, i: number) => wpIndicesRendered.add(i));
                }

                if (ts.subsections && ts.subsections.length > 0) {
                    process(ts.subsections, level + 1);
                }
            });
        };
        process(fundingScheme.template_json.sections);
    }

    // Add Leftover Dynamic Sections (Catch-all)
    Object.entries(dynamicSections).forEach(([key, val]) => {
        const normalize = (s: string) => (s || "").toLowerCase().replace(/[\W_]/g, '');
        const nk = normalize(key);

        // Skip if already rendered or if it's a known non-narrative field
        if (renderedKeys.has(key)) return;

        // Final duplicate check
        const alreadyDone = finalDocument.some(s => normalize(s.id) === nk || normalize(s.title) === nk);
        if (alreadyDone) return;

        finalDocument.push({
            id: key,
            title: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            content: val as string,
            level: 1
        });

        // Track WP if detected in catch-all
        const wpMatch = key.match(/work_package_(\d+)/i) || key.match(/wp_?(\d+)/i);
        if (wpMatch) wpIndicesRendered.add(parseInt(wpMatch[1]) - 1);
    });

    // Add User Custom Sections
    (proposal.customSections || []).forEach((s: any) => {
        finalDocument.push({ id: s.id, title: s.title, content: s.content, level: 1, isCustom: true });
    });

    // Final Safety: Add Missing Structured Data (WPs, Budget, Risks)
    if (workPackages?.length) {
        workPackages.forEach((wp: any, idx: number) => {
            if (!wpIndicesRendered.has(idx)) {
                finalDocument.push({
                    id: `work_package_${idx + 1}`,
                    title: wp.name || `Work Package ${idx + 1}`,
                    content: wp.description,
                    type: 'work_package',
                    level: 2
                });
            }
        });
    }

    // Ensure Budget is at the end if not in template
    const hasBudget = finalDocument.some(s => s.type === 'budget' || s.id?.includes('budget') || s.title?.toLowerCase().includes('budget'));
    if (!hasBudget && budget.length > 0) {
        finalDocument.push({ id: 'final_budget', title: 'Project Budget & Financial Plan', level: 1, type: 'budget' });
    }

    // Ensure Risks are at the end if not in template
    const hasRisks = finalDocument.some(s => s.type === 'risk' || s.id?.includes('risk') || s.title?.toLowerCase().includes('risk'));
    if (!hasRisks && risks.length > 0) {
        finalDocument.push({ id: 'final_risks', title: 'Risk Management', level: 1, type: 'risk' });
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 lg:p-12 print:bg-white print:p-0 font-sans">
            {/* Header controls - hide on print */}
            <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between print:hidden">
                <Button variant="ghost" onClick={onBack} className="text-slate-600 hover:text-slate-900 hover:bg-slate-200/50">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Viewer
                </Button>
                <div className="flex gap-2">
                    <Button onClick={handlePrint} variant="outline" className="border-slate-200 bg-white shadow-sm hover:bg-slate-50">
                        <Printer className="h-4 w-4 mr-2" />
                        Print / PDF
                    </Button>
                    <Button onClick={handleExportToDocx} disabled={isExporting} className="bg-primary text-white hover:bg-primary/90 shadow-sm">
                        <Download className="h-4 w-4 mr-2" />
                        {isExporting ? 'Exporting...' : 'Export DOCX'}
                    </Button>
                </div>
            </div>

            {/* Document Content */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl shadow-slate-200/60 border border-slate-200 rounded-xl p-10 md:p-20 print:shadow-none print:border-none print:p-0">

                {/* 1. COVER PAGE / HEADER */}
                <div className="mb-20 text-center border-b border-slate-100 pb-16">
                    <div className="flex justify-center mb-8">
                        <div className="w-20 h-20 bg-primary/5 rounded-2xl flex items-center justify-center border border-primary/10">
                            <FileText className="w-10 h-10 text-primary" />
                        </div>
                    </div>
                    <div className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
                        {fundingScheme?.name || "Funding Program Proposal"}
                    </div>
                    <h1 className="text-5xl font-black tracking-tight text-slate-900 mb-8 leading-[1.1] max-w-2xl mx-auto">
                        {proposal.title}
                    </h1>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-12 max-w-3xl mx-auto text-left py-8 px-10 bg-slate-50/50 rounded-2xl border border-slate-100">
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                <Building2 className="w-3 h-3" /> Coordinator
                            </span>
                            <p className="text-sm font-semibold text-slate-800 truncate">{coordinator?.name || "Pending"}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                <EuroIcon className="w-3 h-3" /> Requested Grant
                            </span>
                            <p className="text-sm font-semibold text-slate-800">{formatCurrency(totalBudget)}</p>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> Project ID
                            </span>
                            <p className="text-sm font-semibold text-slate-800 font-mono">#{proposal.id?.substring(0, 8).toUpperCase()}</p>
                        </div>
                    </div>
                </div>

                {/* 2. CONSORTIUM TABLE */}
                <div className="mb-20 page-break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-8 text-slate-900 flex items-center gap-3">
                        Participating Organisations
                    </h2>
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                                <tr>
                                    <th className="py-4 px-6">Role</th>
                                    <th className="py-4 px-6">Organisation Name</th>
                                    <th className="py-4 px-6">Country</th>
                                    <th className="py-4 px-6">Type</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {proposal.partners?.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="py-4 px-6">
                                            {p.isCoordinator ? (
                                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] font-bold">Coordinator</span>
                                            ) : (
                                                <span className="text-slate-400 font-medium">Partner</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 font-semibold text-slate-800">{p.name}</td>
                                        <td className="py-4 px-6 text-slate-600">{p.country || "—"}</td>
                                        <td className="py-4 px-6 text-slate-500 italic">{p.organizationType || "Other"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. ALL AI-GENERATED NARRATIVE SECTIONS */}
                <div className="space-y-20">
                    {finalDocument.map((section, idx) => {
                        const lowerId = (section.id || "").toLowerCase();
                        const lowerTitle = (section.title || "").toLowerCase();

                        const isWP = lowerId.includes('work_package') || lowerTitle.includes('work package') || section.type === 'work_package' || lowerId.includes('wp_');
                        const isBudget = lowerId.includes('budget') || lowerTitle.includes('budget') || section.type === 'budget';
                        const isRisk = lowerId.includes('risk') || lowerTitle.includes('risk') || section.type === 'risk' || section.type === 'risks';

                        // Don't render if it's completely empty AND not a structured data placeholder
                        if (!section.content && !isWP && !isBudget && !isRisk) return null;

                        return (
                            <div key={section.id || idx} className="page-break-inside-avoid section-entry">
                                <h2 className={`${section.level === 1 ? 'text-2xl border-l-4 border-primary pl-4' : 'text-xl text-slate-700 pl-4 border-l-2 border-slate-200'} font-bold mb-6 text-slate-900 tracking-tight`}>
                                    {section.title}
                                </h2>

                                {section.description && (
                                    <div className="mb-6 px-4 py-2 bg-slate-50 border-l border-slate-200 text-[11px] text-slate-400 italic font-medium">
                                        {section.description}
                                    </div>
                                )}

                                <div className="prose prose-slate max-w-none text-slate-700 leading-[1.8] prose-headings:text-slate-900 prose-strong:text-slate-900 prose-p:mb-6 px-4">
                                    {section.content ? (
                                        <ResponsiveSectionContent content={section.content} />
                                    ) : (
                                        <p className="text-slate-300 italic text-sm">No narrative content generated for this section.</p>
                                    )}

                                    {/* Structured data rendering embedded within the narrative flow */}
                                    <div className="mt-8 not-prose">
                                        {isWP && (() => {
                                            // 1. Try to find if this is a specific WP (e.g. WP1, WP2)
                                            // Check ID and Title
                                            const match = section.id.match(/work_package_(\d+)/i) ||
                                                section.id.match(/wp_?(\d+)/i) ||
                                                section.title.match(/WP\s*(\d+)/i) ||
                                                section.title.toLowerCase().match(/work package\s*(\d+)/i);

                                            const wpIdx = match ? parseInt(match[1]) - 1 : undefined;

                                            // 2. If it's a generic "Work Packages" section with no number, render all
                                            return <DynamicWorkPackageSection workPackages={workPackages} limitToIndex={wpIdx} currency={currency} />;
                                        })()}
                                        {isBudget && (
                                            <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 shadow-sm">
                                                <DynamicBudgetSection budget={budget} currency={currency} />
                                            </div>
                                        )}
                                        {isRisk && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <DynamicRiskSection risks={risks} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="mt-40 pt-10 border-t border-slate-100 flex justify-between items-center text-slate-400 text-[9px] font-bold tracking-[0.1em] uppercase">
                    <div className="flex items-center gap-4">
                        <Building2 className="w-3 h-3" />
                        <span>Project ID: {proposal.id}</span>
                    </div>
                    <span>© {new Date().getFullYear()} EU PROJECTS STUDIO</span>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                
                body { 
                    font-family: 'Inter', system-ui, -apple-system, sans-serif;
                    -webkit-print-color-adjust: exact;
                }

                @media print {
                    body { background: white !important; color: black !important; padding: 0 !important; }
                    .print\\:hidden { display: none !important; }
                    .page-break-inside-avoid { page-break-inside: avoid; }
                    .shadow-2xl { box-shadow: none !important; }
                    .rounded-xl { border-radius: 0 !important; }
                    .border { border: none !important; }
                    @page { margin: 1.5cm; }
                }

                .prose p { margin-bottom: 1.5rem; }
                .prose h3 { margin-top: 2rem; margin-bottom: 1rem; color: #1e293b; font-weight: 700; }
                .section-entry { border-bottom: 1px solid #f8fafc; padding-bottom: 4rem; margin-bottom: 4rem; }
                .section-entry:last-child { border-bottom: none; }
            `}} />
        </div>
    );
};
