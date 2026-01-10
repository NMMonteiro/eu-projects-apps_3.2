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
    DynamicRiskSection,
    DynamicPartnerSection
} from './ProposalSections';
import { exportToDocx } from '../utils/export-docx';
import { assembleDocument, DisplaySection } from '../utils/proposal-assembly';

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

    // --- ENHANCED ASSEMBLY LOGIC (STRICT ORDERING) ---
    const finalDocument = assembleDocument(proposal);

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
            {/* Header controls */}
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

                {/* Cover Section */}
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



                {/* Narrative Sections */}
                <div className="space-y-20">
                    {finalDocument.map((section, idx) => {
                        const isWP = section.type === 'work_package' || (section.wpIdx !== undefined);
                        const isWPList = section.type === 'wp_list';
                        const isBudget = section.type === 'budget';
                        const isRisk = section.type === 'risk';
                        const isPartners = section.type === 'partners';
                        const isProfiles = section.type === 'partner_profiles';

                        // Don't render empty sections unless they are structured containers
                        if (!section.content && !isWP && !isWPList && !isBudget && !isRisk && !isPartners && !isProfiles) return null;

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

                                <div className="prose prose-slate max-w-none text-slate-700 leading-[1.8] px-4">
                                    {section.content && <ResponsiveSectionContent content={section.content} />}

                                    <div className="mt-8 not-prose">
                                        {section.type === 'partners' && (
                                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                <table className="w-full text-left border-collapse text-xs">
                                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                                                        <tr>
                                                            <th className="py-3 px-4">Role</th>
                                                            <th className="py-3 px-4">Organisation</th>
                                                            <th className="py-3 px-4">Country</th>
                                                            <th className="py-3 px-4">Type</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {proposal.partners?.map((p, pIdx) => (
                                                            <tr key={pIdx}>
                                                                <td className="py-3 px-4">
                                                                    <span className={p.isCoordinator ? "bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold" : "text-slate-400"}>
                                                                        {p.isCoordinator ? 'Coordinator' : 'Partner'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 px-4 font-semibold text-slate-800">{p.name}</td>
                                                                <td className="py-3 px-4 text-slate-600">{p.country}</td>
                                                                <td className="py-3 px-4 text-slate-400 italic">{p.organizationType || 'SME'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                        {isProfiles && <DynamicPartnerSection partners={proposal.partners || []} />}
                                        {(isWP || isWPList) && (
                                            <DynamicWorkPackageSection
                                                workPackages={workPackages}
                                                limitToIndex={section.wpIdx}
                                                currency={currency}
                                                overrideWP={(section.wpIdx !== undefined && !workPackages[section.wpIdx]) ? {
                                                    name: section.title,
                                                    description: section.content,
                                                    activities: []
                                                } : undefined}
                                            />
                                        )}
                                        {isBudget && <DynamicBudgetSection budget={budget} currency={currency} />}
                                        {isRisk && <DynamicRiskSection risks={risks} />}
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
                body { font-family: 'Inter', sans-serif; }
                @media print {
                    body { background: white !important; }
                    .print\\:hidden { display: none !important; }
                    .shadow-2xl { box-shadow: none !important; }
                    .rounded-xl { border-radius: 0 !important; }
                    .border { border: none !important; }
                }
                .prose p { margin-bottom: 1.5rem; }
                .section-entry { border-bottom: 1px solid #f8fafc; padding-bottom: 4rem; margin-bottom: 4rem; }
                .section-entry:last-child { border-bottom: none; }
            `}} />
        </div>
    );
};
