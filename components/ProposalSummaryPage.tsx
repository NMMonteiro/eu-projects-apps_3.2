import React, { useState, useEffect } from 'react';
import { ArrowLeft, Printer, Download, FileText, CheckCircle2, Building2, Globe, Clock, EuroIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner';
import { FullProposal } from '../types/proposal';
import {
    ResponsiveSectionContent,
    DynamicWorkPackageSection,
    DynamicBudgetSection,
    DynamicRiskSection,
    DynamicPartnerSection
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
    const currency = proposal.settings?.currency || 'EUR';
    const totalBudget = (proposal.budget || []).reduce((sum, item) => sum + (item.cost || 0), 0);
    const coordinator = proposal.partners?.find(p => p.isCoordinator);

    let baseSections: any[] = [];
    const renderedWPIndices = new Set<number>();

    if (fundingScheme?.template_json?.sections) {
        const processTemplateSections = (templateSections: any[], level = 1): any[] => {
            let flattened: any[] = [];
            [...templateSections].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(ts => {
                const lowerKey = ts.key?.toLowerCase() || "";
                const lowerLabel = ts.label?.toLowerCase() || "";
                const isWP = lowerKey.includes('work_package') || lowerLabel.includes('work package');

                if (isWP) {
                    const match = lowerKey.match(/work_package_(\d+)/i) || lowerLabel.match(/work package (\d+)/i);
                    if (match) {
                        renderedWPIndices.add(parseInt(match[1]) - 1);
                    }
                }

                // Fallback content logic
                let content = dynamicSections[ts.key];
                if (!content) {
                    const key = ts.key as string;
                    if (key === 'summary') content = proposal.summary;
                    else if (key === 'introduction') content = proposal.introduction;
                    else if (key === 'relevance') content = proposal.relevance;
                    else if (key === 'objectives') content = proposal.objectives;
                    else if (key === 'methodology' || key === 'methods') content = proposal.methodology || proposal.methods;
                    else if (key === 'workPlan') content = proposal.workPlan;
                    else if (key === 'expectedResults') content = proposal.expectedResults;
                    else if (key === 'impact') content = proposal.impact;
                    else if (key === 'innovation') content = proposal.innovation;
                    else if (key === 'sustainability') content = proposal.sustainability;
                    else if (key === 'consortium') content = proposal.consortium;
                    else if (key === 'riskManagement') content = proposal.riskManagement;
                    else if (key === 'dissemination') content = proposal.dissemination;
                }

                flattened.push({
                    id: ts.key,
                    title: ts.label.replace(/^undefined\s*/gi, '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                    content: content,
                    description: ts.description,
                    type: ts.type,
                    level: level
                });

                if (ts.subsections && ts.subsections.length > 0) {
                    flattened = [...flattened, ...processTemplateSections(ts.subsections, level + 1)];
                }
            });
            return flattened;
        };
        baseSections = processTemplateSections(fundingScheme.template_json.sections);

        // Add missing Work Packages
        if (proposal.workPackages && proposal.workPackages.length > 0) {
            proposal.workPackages.forEach((wp, idx) => {
                if (!renderedWPIndices.has(idx)) {
                    baseSections.push({
                        id: `work_package_${idx + 1}`,
                        title: wp.name || `Work Package ${idx + 1}`,
                        content: wp.description,
                        type: 'work_package',
                        level: 2
                    });
                }
            });
        }
    } else if (Object.keys(dynamicSections).length > 0) {
        baseSections = Object.entries(dynamicSections).map(([key, content], idx) => ({
            id: key,
            title: `${idx + 1}. ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
            content: content as string
        }));
    } else {
        baseSections = [
            { id: 'summary', title: 'Executive Summary', content: proposal.summary },
            { id: 'introduction', title: 'Introduction', content: proposal.introduction },
            { id: 'relevance', title: 'Relevance', content: proposal.relevance },
            { id: 'objectives', title: 'Objectives', content: proposal.objectives },
            { id: 'methodology', title: 'Methodology', content: proposal.methodology || proposal.methods },
            { id: 'impact', title: 'Impact', content: proposal.impact },
            { id: 'consortium', title: 'Consortium', content: proposal.consortium },
            { id: 'riskManagement', title: 'Risk Management', content: proposal.riskManagement },
            { id: 'dissemination', title: 'Dissemination & Communication', content: proposal.dissemination },
        ];
    }

    // Add custom sections
    const customSections = (proposal.customSections || []).map((section: any, idx: number) => ({
        id: section.id || `custom-${idx}`,
        title: `${baseSections.length + idx + 1}. ${section.title}`,
        content: section.content,
        isCustom: true
    }));

    const sections = [...baseSections, ...customSections];

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

                {/* 2. PROJECT SUMMARY */}
                <div className="mb-20 page-break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-8 text-slate-900 flex items-center gap-3">
                        1. Project Summary
                    </h2>
                    <div className="bg-slate-50 p-8 rounded-2xl text-slate-700 italic border-l-4 border-primary leading-relaxed">
                        {proposal.summary}
                    </div>
                </div>

                {/* 3. CONSORTIUM TABLE */}
                <div className="mb-20 page-break-inside-avoid">
                    <h2 className="text-2xl font-bold mb-8 text-slate-900 flex items-center gap-3">
                        2. Participating Organisations
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

                {/* 4. MAIN NARRATIVE SECTIONS */}
                <div className="space-y-24">
                    {sections.map((section, idx) => {
                        const lowerId = (section.id || "").toLowerCase();
                        const lowerTitle = (section.title || "").toLowerCase();

                        const isWP = lowerId.includes('work_package') || lowerTitle.includes('work package');
                        const isBudget = lowerId.includes('budget') || lowerTitle.includes('budget');
                        const isRisk = lowerId.includes('risk') || lowerTitle.includes('risk');
                        const isPartner = lowerId.includes('partner') || lowerTitle.includes('partner') || lowerId.includes('consortium') || lowerTitle.includes('consortium');

                        // Skip partners as they are handled in the table above unless it's a dedicated narrative section with content
                        if (isPartner && !section.content) return null;

                        if (!section.content && !isWP && !isBudget && !isRisk) return null;

                        return (
                            <div key={section.id || idx} className="page-break-inside-avoid section-entry">
                                <h2 className={`${section.level === 1 ? 'text-2xl border-l-4 border-primary pl-4' : 'text-xl text-slate-700 pl-4 border-l-2 border-slate-200'} font-bold mb-10 text-slate-900 tracking-tight`}>
                                    {section.title}
                                </h2>

                                <div className="prose prose-slate max-w-none text-slate-700 leading-[1.7] prose-headings:text-slate-900 prose-strong:text-slate-900 prose-p:mb-6">
                                    {section.content && (
                                        <ResponsiveSectionContent content={section.content} />
                                    )}

                                    {/* Structured data rendering */}
                                    <div className="mt-12 not-prose">
                                        {isWP && (() => {
                                            const match = section.id.match(/work_package_(\d+)/i) || section.title.toLowerCase().match(/work package (\d+)/i);
                                            const wpIdx = match ? parseInt(match[1]) - 1 : undefined;
                                            return <DynamicWorkPackageSection workPackages={proposal.workPackages} limitToIndex={wpIdx} currency={currency} />;
                                        })()}
                                        {isBudget && (
                                            <div className="bg-slate-50/50 p-8 rounded-2xl border border-slate-100 shadow-sm">
                                                <DynamicBudgetSection budget={proposal.budget} currency={currency} />
                                            </div>
                                        )}
                                        {isRisk && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <DynamicRiskSection risks={proposal.risks || []} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 5. SIGNATURE BLOCK (Placeholder for professionalism) */}
                <div className="mt-40 pt-16 border-t border-slate-100 page-break-inside-avoid">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-12 text-center">Authentication & Submission</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                        <div className="space-y-8">
                            <div className="h-px bg-slate-200 w-full" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Legal Representative Signature</p>
                        </div>
                        <div className="space-y-8">
                            <div className="h-px bg-slate-200 w-full" />
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date of Submission</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-32 pt-12 border-t border-slate-50 flex justify-between items-center text-slate-400 text-[9px] font-bold tracking-[0.1em] uppercase">
                    <div className="flex items-center gap-4">
                        <Building2 className="w-3 h-3" />
                        <span>Project ID: {proposal.id}</span>
                    </div>
                    <span>© {new Date().getFullYear()} EU PROJECTS GENERATOR</span>
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
                .section-entry { border-bottom: 1px solid #f1f5f9; padding-bottom: 4rem; margin-bottom: 4rem; }
                .section-entry:last-child { border-bottom: none; }
            `}} />
        </div>
    );
};
