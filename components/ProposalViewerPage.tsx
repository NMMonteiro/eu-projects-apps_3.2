import React, { useState, useEffect } from 'react';
import {
    Loader2, Save, Download, Eye, ArrowLeft,
    Layers, Users, DollarSign, AlertTriangle,
    FileText, CheckCircle2, ChevronDown, Sparkles,
    Terminal, Settings, Layout, Search, Filter,
    Plus, Trash2, Edit, Save as SaveIcon, X,
    Folder, File, ChevronRight, RefreshCw, Wand2, Shield,
    Activity, PlusCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';

interface ProposalViewerPageProps {
    proposalId: string;
    onBack: () => void;
}

export function ProposalViewerPage({ proposalId, onBack }: ProposalViewerPageProps) {
    const [proposal, setProposal] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generatingSection, setGeneratingSection] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'legacy' | 'narrative' | 'structured' | 'settings'>('legacy');
    const [expandedWp, setExpandedWp] = useState<number | null>(0);
    const [fundingScheme, setFundingScheme] = useState<any>(null);

    // Consortium Management State
    const [allPartners, setAllPartners] = useState<any[]>([]);
    const [showConsortiumDialog, setShowConsortiumDialog] = useState(false);
    const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<string>>(new Set());
    const [coordinatorId, setCoordinatorId] = useState<string | null>(null);
    const [savingConsortium, setSavingConsortium] = useState(false);

    // AI Generation State

    useEffect(() => {
        loadProposal();
        loadAllPartners();
    }, [proposalId]);

    const loadProposal = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${serverUrl}/proposals/${proposalId}`, {
                headers: { 'Authorization': `Bearer ${publicAnonKey}` }
            });
            if (!response.ok) throw new Error('Failed to load proposal');
            const data = await response.json();
            setProposal(data);

            // Set consortium state
            if (data.partners && Array.isArray(data.partners)) {
                const ids = new Set(data.partners.map((p: any) => p.id).filter(Boolean));
                setSelectedPartnerIds(ids);
                const lead = data.partners.find((p: any) => p.isCoordinator);
                if (lead) setCoordinatorId(lead.id);
            }

            // If proposal has a funding scheme, fetch it
            if (data.funding_scheme_id || data.fundingSchemeId) {
                const schemeId = data.funding_scheme_id || data.fundingSchemeId;
                const schemeResponse = await fetch(`${serverUrl}/funding-schemes/${schemeId}`, {
                    headers: { 'Authorization': `Bearer ${publicAnonKey}` }
                });
                if (schemeResponse.ok) {
                    const schemeData = await schemeResponse.json();
                    setFundingScheme(schemeData);
                }
            }
        } catch (error) {
            console.error('Load error:', error);
            toast.error('Failed to load proposal details');
        } finally {
            setLoading(false);
        }
    };

    const loadAllPartners = async () => {
        try {
            const response = await fetch(`${serverUrl}/partners`, {
                headers: { 'Authorization': `Bearer ${publicAnonKey}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAllPartners(Array.isArray(data) ? data : (data.partners || []));
            }
        } catch (error) {
            console.error('Failed to load partners:', error);
        }
    };

    const handleUpdateProposal = async (updates: Partial<any>) => {
        if (!proposal) return;
        setSaving(true);
        try {
            const up = { ...proposal, ...updates };
            up.updatedAt = new Date().toISOString();
            const response = await fetch(`${serverUrl}/proposals`, {
                method: 'POST', // Or PUT if your backend uses PUT
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                },
                body: JSON.stringify(up)
            });

            if (!response.ok) throw new Error('Update failed');

            setProposal(up);
            toast.success('Proposal updated');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    // --- Budget Editor Functions ---
    const handleAddBudgetItem = () => {
        const newBudget = [...(proposal?.budget || [])];
        newBudget.push({
            item: 'New Budget Category',
            cost: 0,
            description: 'Description of this budget category...',
            breakdown: []
        });
        handleUpdateProposal({ budget: newBudget });
    };

    const handleUpdateBudgetItem = (index: number, updates: any) => {
        const newBudget = [...(proposal?.budget || [])];
        newBudget[index] = { ...newBudget[index], ...updates };
        handleUpdateProposal({ budget: newBudget });
    };

    const handleRemoveBudgetItem = (index: number) => {
        const newBudget = (proposal?.budget || []).filter((_, i) => i !== index);
        handleUpdateProposal({ budget: newBudget });
    };

    const handleAddBreakdownItem = (index: number) => {
        const newBudget = [...(proposal?.budget || [])];
        const item = { ...newBudget[index] };
        if (!item.breakdown) item.breakdown = [];
        item.breakdown.push({ subItem: 'New Item', quantity: 1, unitCost: 0, total: 0 });
        newBudget[index] = item;
        handleUpdateProposal({ budget: newBudget });
    };

    const handleUpdateBreakdownItem = (budgetIdx: number, breakdownIdx: number, updates: any) => {
        const newBudget = [...(proposal?.budget || [])];
        const item = { ...newBudget[budgetIdx] };
        const breakdown = [...(item.breakdown || [])];

        // Handle potential AI field name variations (cost vs unitCost)
        const currentSubItem = { ...breakdown[breakdownIdx] };
        if (currentSubItem.cost !== undefined && currentSubItem.unitCost === undefined) {
            currentSubItem.unitCost = currentSubItem.cost;
        }

        breakdown[breakdownIdx] = { ...currentSubItem, ...updates };

        // Auto-calculate sub-total
        const q = parseFloat(breakdown[breakdownIdx].quantity) || 0;
        const u = parseFloat(breakdown[breakdownIdx].unitCost) || 0;
        breakdown[breakdownIdx].total = q * u;

        item.breakdown = breakdown;
        // Recalculate main cost
        item.cost = breakdown.reduce((sum, b) => sum + (b.total || 0), 0);
        newBudget[budgetIdx] = item;
        handleUpdateProposal({ budget: newBudget });
    };

    const handleRemoveBreakdownItem = (budgetIdx: number, breakdownIdx: number) => {
        const newBudget = [...(proposal?.budget || [])];
        const item = { ...newBudget[budgetIdx] };
        item.breakdown = (item.breakdown || []).filter((_, i) => i !== breakdownIdx);
        // Recalculate main cost
        item.cost = (item.breakdown || []).reduce((sum, b) => sum + (b.total || 0), 0);
        newBudget[budgetIdx] = item;
        handleUpdateProposal({ budget: newBudget });
    };

    const handleSaveConsortium = async () => {
        setSavingConsortium(true);
        try {
            // Map selected partners with their data from the database
            const newPartners = allPartners
                .filter(p => selectedPartnerIds.has(p.id))
                .map(p => ({
                    ...p,
                    isCoordinator: p.id === coordinatorId,
                    role: p.id === coordinatorId ? 'Project Coordinator' : 'Technical Partner'
                }))
                .sort((a, b) => (a.isCoordinator ? -1 : b.isCoordinator ? 1 : 0));

            await handleUpdateProposal({ partners: newPartners });
            setShowConsortiumDialog(false);
            toast.success('Consortium updated successfully');
        } catch (error) {
            toast.error('Failed to update consortium');
        } finally {
            setSavingConsortium(false);
        }
    };

    const generateSection = async (sectionKey: string, sectionTitle: string) => {
        setGeneratingSection(sectionKey);
        try {
            const response = await fetch(`${serverUrl}/generate-section`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sectionTitle,
                    proposalContext: `Project Title: ${proposal.title}\nDescription: ${proposal.summary}`,
                    existingSections: Object.keys(dynamicSections)
                })
            });
            if (!response.ok) throw new Error('Generation failed');
            const data = await response.json();

            const newDynamicSections = { ...dynamicSections, [sectionKey]: data.content };
            await handleUpdateProposal({ dynamic_sections: newDynamicSections });
            toast.success(`Generated content for ${sectionTitle}`);
        } catch (error) {
            console.error('AI error:', error);
            toast.error(`Failed to generate ${sectionTitle}`);
        } finally {
            setGeneratingSection(null);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-primary/20 animate-pulse"></div>
                    <Loader2 className="h-8 w-8 animate-spin text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-muted-foreground animate-pulse">Loading Premium Proposal View...</p>
            </div>
        );
    }

    if (!proposal) return <div>Proposal not found</div>;

    const budgetArray = Array.isArray(proposal.budget) ? proposal.budget : [];
    const partnersArray = Array.isArray(proposal.partners) ? proposal.partners : [];
    const workPackagesArray = Array.isArray(proposal.workPackages) ? proposal.workPackages : [];

    const totalBudget = budgetArray.reduce((sum: number, item: any) => sum + (item.cost || 0), 0);

    // Flatten sections from funding scheme template
    const getFlattenedSections = (sections: any[]): any[] => {
        if (!Array.isArray(sections)) return [];
        let result: any[] = [];
        sections.forEach(s => {
            if (!s) return;
            result.push({
                key: s.key,
                label: s.label,
                level: s.level || 0,
                isSub: !!(s.subsections && Array.isArray(s.subsections) && s.subsections.length)
            });
            if (s.subsections && Array.isArray(s.subsections) && s.subsections.length) {
                result = [...result, ...getFlattenedSections(s.subsections.map((sub: any) => ({ ...sub, level: (s.level || 0) + 1 })))];
            }
        });
        return result;
    };

    const dynamicSections = proposal.dynamic_sections || proposal.dynamicSections || {};

    const standardKeys = [
        { key: 'applicant_organisation', label: '1. Applicant Organisation', level: 0 },
        { key: 'participating_organisations', label: '2. Participating Organisations', level: 0 },
        { key: 'background_and_experience', label: '3. Background and Experience', level: 0 },
        { key: 'context', label: '4. Context', level: 0 },
        { key: 'project_summary', label: '5. Project Summary', level: 0 },
        { key: 'relevance', label: '6. Relevance', level: 0 },
        { key: 'partnership_arrangements', label: '7. Partnership Arrangements', level: 0 },
        { key: 'impact', label: '8. Impact', level: 0 },
        { key: 'project_design_implementation', label: '9. Project Design & Implementation', level: 0 },
        { key: 'work_package_1', label: 'WP1: Management', level: 0 },
        { key: 'work_package_2', label: 'WP2: Development', level: 0 },
        { key: 'work_package_3', label: 'WP3: Implementation', level: 0 },
        { key: 'work_package_4', label: 'WP4: Dissemination', level: 0 },
        { key: 'work_package_5', label: 'WP5: Evaluation', level: 0 },
        { key: 'work_package_6', label: 'WP6: Sustainability', level: 0 },
        { key: 'work_package_7', label: 'WP7: Impact', level: 0 },
        { key: 'work_package_8', label: 'WP8: Additional', level: 0 },
        { key: 'work_package_9', label: 'WP9: Additional', level: 0 },
        { key: 'work_package_10', label: 'WP10: Additional', level: 0 },
        { key: 'eu_values', label: 'EU Values', level: 0 }
    ];

    let templateSections = fundingScheme?.template_json?.sections
        ? getFlattenedSections(fundingScheme.template_json.sections)
        : [...standardKeys];

    const templateKeys = new Set((templateSections || []).map(s => s.key));

    // Ensure all standard keys that HAVE content are included even if not in template
    standardKeys.forEach(s => {
        if (!templateKeys.has(s.key) && dynamicSections[s.key]) {
            templateSections.push(s);
            templateKeys.add(s.key);
        }
    });

    const extraSections = Object.keys(dynamicSections || {})
        .filter(key => !templateKeys.has(key))
        .map(key => ({
            key,
            label: key.replace(/_/g, ' ').replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()),
            level: 0
        }));

    const expectedSections = [...templateSections, ...extraSections];

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 pt-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-secondary/20 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
                            {fundingScheme?.name || 'Official Proposal'}
                        </Badge>
                        <span className="text-muted-foreground/40 font-mono text-xs">ID: {proposal.id.split('-').pop()}</span>
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent italic">
                        {proposal.title}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <Layers className="h-4 w-4 text-blue-400" />
                            <span>{workPackagesArray.length} Work Packages</span>
                        </div>
                        <div className="h-1 w-1 rounded-full bg-white/10"></div>
                        <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-green-400" />
                            <span>{partnersArray.length} Organizations</span>
                        </div>
                        <div className="h-1 w-1 rounded-full bg-white/10"></div>
                        <div className="flex items-center gap-1.5 font-bold text-white/80">
                            <DollarSign className="h-4 w-4 text-emerald-400" />
                            <span>€{totalBudget.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-white border border-white/5 hover:bg-white/5 px-6 rounded-2xl">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 px-8 rounded-2xl font-bold flex gap-2">
                        <Download className="h-4 w-4" />
                        Export DOCX
                    </Button>
                </div>
            </div>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                <div className="flex items-center justify-center mb-8">
                    <TabsList className="bg-white/5 border border-white/10 p-1 rounded-2xl">
                        <TabsTrigger value="legacy" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                            Full Report (Standard)
                        </TabsTrigger>
                        <TabsTrigger value="structured" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs opacity-60">
                            Interactive Editor
                        </TabsTrigger>
                        <TabsTrigger value="narrative" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs opacity-60">
                            Narrative Structure
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs opacity-60">
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Legacy View */}
                <TabsContent value="legacy" className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="bg-white text-black border-none shadow-2xl relative overflow-hidden font-serif">
                        <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
                        <CardContent className="p-12 md:p-20 space-y-12">
                            <div className="text-center space-y-6 pb-12 border-b border-gray-100">
                                <h1 className="text-5xl font-bold tracking-tight text-gray-900 leading-tight">
                                    {proposal.title}
                                </h1>
                                <div className="flex justify-center gap-8 text-gray-500 font-sans tracking-widest uppercase text-xs font-semibold">
                                    <span>{fundingScheme?.name || 'Erasmus+ KA220'}</span>
                                    <span>•</span>
                                    <span>Grant Proposal</span>
                                    <span>•</span>
                                    <span>Version 1.0</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 py-10">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-primary font-sans">Lead Organization</h4>
                                    <p className="text-xl font-bold text-gray-800">{partnersArray[0]?.name || 'Not Assigned'}</p>
                                    <p className="text-sm text-gray-500">{partnersArray[0]?.country || 'N/A'}</p>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-primary font-sans">Total Grant Requested</h4>
                                    <p className="text-4xl font-black text-gray-900">€{totalBudget.toLocaleString()}</p>
                                    <p className="text-sm text-gray-500 italic">Personnel and Operational combined</p>
                                </div>
                            </div>

                            <div className="space-y-20">
                                {expectedSections.map((section, idx) => {
                                    const content = dynamicSections[section.key];
                                    if (!content) return null;

                                    return (
                                        <div key={idx} className="space-y-6 scroll-mt-20">
                                            <div className="flex items-baseline gap-4 border-b border-gray-100 pb-4">
                                                <span className="text-primary font-sans font-bold text-sm tracking-tighter opacity-30">
                                                    SECTION {String(idx + 1).padStart(2, '0')}
                                                </span>
                                                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                                                    {section.label}
                                                </h2>
                                            </div>
                                            <div
                                                className="prose prose-slate max-w-none text-gray-700 leading-relaxed text-lg"
                                                dangerouslySetInnerHTML={{ __html: content }}
                                            />
                                        </div>
                                    );
                                })}

                                <div className="pt-20 border-t border-gray-200 space-y-12">
                                    <div className="space-y-4 text-center">
                                        <h2 className="text-3xl font-bold text-gray-900">Appendix A: Consortium Members</h2>
                                        <p className="text-gray-500 max-w-2xl mx-auto">This section lists all participating organizations and their assigned roles in the project.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {partnersArray.map((p: any, i: number) => (
                                            <div key={i} className="p-6 border border-gray-100 rounded-xl bg-gray-50 space-y-2 font-sans">
                                                <div className="flex justify-between items-start">
                                                    <h5 className="font-bold text-gray-900">{p.name}</h5>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest ${p.isCoordinator ? "bg-primary text-white" : "bg-gray-200 text-gray-600"}`}>
                                                        {p.isCoordinator ? 'Lead Coordinator' : 'Partner'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500">{p.country} • {p.organizationType || 'Institution'}</p>
                                                <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed mt-4 italic">{p.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-20 border-t border-gray-200 space-y-12">
                                    <div className="space-y-4 text-center">
                                        <h2 className="text-3xl font-bold text-gray-900">Appendix B: Detailed Financial Breakdown</h2>
                                        <p className="text-gray-500 max-w-2xl mx-auto">Consolidated budget breakdown per category and partner allocations.</p>
                                    </div>
                                    <div className="overflow-hidden border border-gray-100 rounded-xl font-sans">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] text-gray-400 font-black uppercase tracking-widest">
                                                    <th className="px-6 py-4">Item Detail</th>
                                                    <th className="px-6 py-4 text-right">Requested (€)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-sm divide-y divide-gray-50">
                                                {budgetArray.map((b: any, i: number) => (
                                                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-6 py-5">
                                                            <p className="font-bold text-gray-900">{b.item}</p>
                                                            <p className="text-xs text-gray-500 mt-1">{b.description}</p>
                                                        </td>
                                                        <td className="px-6 py-5 text-right font-black text-primary">
                                                            €{(b.cost || 0).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-primary/5 font-black text-gray-900 text-lg">
                                                    <td className="px-6 py-6">TOTAL ESTIMATED BUDGET</td>
                                                    <td className="px-6 py-6 text-right text-primary">€{totalBudget.toLocaleString()}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Structured View */}
                <TabsContent value="structured" className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <Layers className="h-6 w-6 text-blue-500" />
                                Work Packages
                            </h3>
                            <Badge variant="secondary" className="px-4 py-1.5 rounded-full text-blue-400 border border-blue-500/20 bg-blue-500/5">
                                {workPackagesArray.length} Total Packages
                            </Badge>
                        </div>
                        <div className="grid gap-6">
                            {workPackagesArray.map((wp: any, idx: number) => (
                                <Card key={idx} className="bg-white/5 border-white/10 overflow-hidden group hover:border-primary/50 transition-all duration-300">
                                    <CardHeader
                                        className="cursor-pointer flex flex-row items-center justify-between py-6 px-8"
                                        onClick={() => setExpandedWp(expandedWp === idx ? -1 : idx)}
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                <Activity className="h-7 w-7" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-xl font-bold tracking-tight italic uppercase">
                                                    {wp.name || `WP${idx + 1}: Untitled Work Package`}
                                                </CardTitle>
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-1">
                                                    Duration: {wp.duration || 'M1-M24'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => {
                                                e.stopPropagation();
                                                const newWPs = workPackagesArray.filter((_, i) => i !== idx);
                                                handleUpdateProposal({ workPackages: newWPs });
                                            }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <ChevronDown className={`h-6 w-6 transition-transform duration-300 text-muted-foreground ${expandedWp === idx ? "rotate-180" : ""}`} />
                                        </div>
                                    </CardHeader>

                                    {expandedWp === idx && (
                                        <CardContent className="px-8 pb-8 pt-0 animate-in slide-in-from-top-4 duration-300">
                                            <div className="space-y-8">
                                                <div className="p-6 bg-white/[0.02] rounded-2xl border border-white/5">
                                                    <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary mb-4">Technical Objectives</h4>
                                                    <textarea
                                                        className="w-full bg-transparent border-none focus:ring-0 text-sm leading-relaxed text-muted-foreground resize-none min-h-[80px]"
                                                        value={wp.description}
                                                        onChange={(e) => {
                                                            const newWPs = [...workPackagesArray];
                                                            newWPs[idx] = { ...wp, description: e.target.value };
                                                            handleUpdateProposal({ workPackages: newWPs });
                                                        }}
                                                    />
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-primary">Planned Activities</h4>
                                                        <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest gap-2 hover:bg-white/5 px-2 h-7" onClick={() => {
                                                            const newWPs = [...workPackagesArray];
                                                            const activities = [...(wp.activities || [])];
                                                            activities.push({ name: 'New Activity', description: '', leadPartner: '', estimatedBudget: 0 });
                                                            newWPs[idx] = { ...wp, activities };
                                                            handleUpdateProposal({ workPackages: newWPs });
                                                        }}>
                                                            <Plus className="h-3 w-3" /> Add Activity
                                                        </Button>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {(wp.activities || []).map((act: any, aIdx: number) => (
                                                            <div key={aIdx} className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 hover:border-white/10 transition-colors relative overflow-hidden group/act">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="text-[9px] font-black font-mono text-primary bg-primary/10 px-2 py-0.5 rounded uppercase">Act {idx + 1}.{aIdx + 1}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">€{act.estimatedBudget?.toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                <Input
                                                                    className="text-sm font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0 mb-2"
                                                                    value={act.name}
                                                                    onChange={(e) => {
                                                                        const newWPs = [...workPackagesArray];
                                                                        const activities = [...wp.activities];
                                                                        activities[aIdx] = { ...act, name: e.target.value };
                                                                        newWPs[idx] = { ...wp, activities };
                                                                        handleUpdateProposal({ workPackages: newWPs });
                                                                    }}
                                                                />
                                                                <textarea
                                                                    className="w-full bg-transparent border-none p-0 text-xs text-muted-foreground leading-relaxed focus:outline-none min-h-[40px] resize-none"
                                                                    value={act.description}
                                                                    onChange={(e) => {
                                                                        const newWPs = [...workPackagesArray];
                                                                        const activities = [...wp.activities];
                                                                        activities[aIdx] = { ...act, description: e.target.value };
                                                                        newWPs[idx] = { ...wp, activities };
                                                                        handleUpdateProposal({ workPackages: newWPs });
                                                                    }}
                                                                />
                                                            </div>
                                                        ))}
                                                        {(!wp.activities || wp.activities.length === 0) && (
                                                            <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
                                                                <p className="text-xs text-muted-foreground italic">No activities generated for this Work Package yet.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </div>

                    {/* Financial Section */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <DollarSign className="h-6 w-6 text-emerald-500" />
                                Financial Statement
                            </h3>
                            <div className="text-right">
                                <span className="text-xs text-muted-foreground block mb-1 font-mono">Total Budget Requested</span>
                                <span className="text-3xl font-black text-emerald-400 tracking-tighter italic">€{totalBudget.toLocaleString()}</span>
                            </div>
                        </div>

                        <Card className="bg-secondary/10 border-white/5 rounded-[32px] overflow-hidden shadow-2xl border-t-2 border-emerald-500/20">
                            <div className="p-8 space-y-8">
                                {budgetArray.map((item: any, i: number) => (
                                    <div key={i} className="space-y-4 group">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 space-y-1">
                                                <Input
                                                    className="text-xl font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0 text-white group-hover:text-emerald-400 transition-colors"
                                                    value={item.item}
                                                    onChange={(e) => handleUpdateBudgetItem(i, { item: e.target.value })}
                                                />
                                                <Input
                                                    className="bg-transparent border-none p-0 h-auto focus-visible:ring-0 text-sm text-muted-foreground italic"
                                                    value={item.description}
                                                    onChange={(e) => handleUpdateBudgetItem(i, { description: e.target.value })}
                                                    placeholder="Category description..."
                                                />
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className="text-2xl font-black text-emerald-400">€{item.cost?.toLocaleString()}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive/30 hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                                                    onClick={() => handleRemoveBudgetItem(i)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Nested Breakdown Table - Premium Style */}
                                        <div className="bg-black/20 rounded-2xl overflow-hidden border border-white/5">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="bg-white/5 text-muted-foreground font-black uppercase tracking-widest h-10">
                                                        <th className="px-4 text-left">Budget Item</th>
                                                        <th className="px-4 text-center w-24">Quantity</th>
                                                        <th className="px-4 text-right w-32">Unit Cost (€)</th>
                                                        <th className="px-4 text-right w-32 font-black italic text-emerald-500/70">Total (€)</th>
                                                        <th className="w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(item.breakdown || []).map((sub: any, sIdx: number) => (
                                                        <tr key={sIdx} className="border-t border-white/5 hover:bg-white/5 transition-colors group/row">
                                                            <td className="px-4 py-3">
                                                                <Input
                                                                    className="bg-transparent border-none p-0 h-auto focus-visible:ring-0 text-white/80"
                                                                    value={sub.subItem}
                                                                    onChange={(e) => handleUpdateBreakdownItem(i, sIdx, { subItem: e.target.value })}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <Input
                                                                    type="number"
                                                                    className="bg-black/30 border-white/10 h-7 rounded text-center font-bold"
                                                                    value={sub.quantity || 0}
                                                                    onChange={(e) => handleUpdateBreakdownItem(i, sIdx, { quantity: parseInt(e.target.value) || 0 })}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <Input
                                                                    type="number"
                                                                    className="bg-black/30 border-white/10 h-7 rounded text-right font-bold"
                                                                    value={sub.unitCost || 0}
                                                                    onChange={(e) => handleUpdateBreakdownItem(i, sIdx, { unitCost: parseInt(e.target.value) || 0 })}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-emerald-400">
                                                                €{(sub.total || 0).toLocaleString()}
                                                            </td>
                                                            <td className="px-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 text-white/10 hover:text-destructive transition-colors"
                                                                    onClick={() => handleRemoveBreakdownItem(i, sIdx)}
                                                                >
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    <tr>
                                                        <td colSpan={5} className="p-2">
                                                            <Button
                                                                variant="ghost"
                                                                className="w-full h-8 border-dashed border border-white/5 hover:bg-emerald-500/5 hover:border-emerald-500/20 text-emerald-500/50 hover:text-emerald-500 text-[10px] font-black uppercase tracking-widest transition-all"
                                                                onClick={() => handleAddBreakdownItem(i)}
                                                            >
                                                                <Plus className="h-3 w-3 mr-2" /> Add Breakdown Line
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    className="w-full py-8 border-dashed border-2 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded-3xl group flex flex-col gap-2"
                                    onClick={handleAddBudgetItem}
                                >
                                    <PlusCircle className="h-8 w-8 text-emerald-500 group-hover:scale-110 transition-transform" />
                                    <span className="font-black uppercase tracking-[0.2em] text-emerald-500/70">Add Main Budget Item</span>
                                </Button>
                            </div>

                            <div className="bg-emerald-500/10 p-8 flex items-center justify-between border-t border-emerald-500/20">
                                <span className="font-black uppercase tracking-[0.4em] text-emerald-500 text-sm italic">Consolidated Total Project Grant</span>
                                <span className="text-4xl font-black text-emerald-400 tracking-tighter italic shadow-emerald-500/20 drop-shadow-lg">€{totalBudget.toLocaleString()}</span>
                            </div>
                        </Card>
                    </div>

                    {/* Consortium Section */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <Users className="h-6 w-6 text-indigo-500" />
                                Consortium Members
                            </h3>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                                onClick={() => setShowConsortiumDialog(true)}
                            >
                                <Edit className="h-4 w-4 mr-2" />
                                Manage Consortium
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {partnersArray.map((partner: any, pIdx: number) => (
                                <Card key={pIdx} className="bg-secondary/10 border-white/5 rounded-3xl p-6 hover:bg-secondary/20 transition-all border-l-4 border-l-indigo-500/50 shadow-xl">
                                    <div className="space-y-4">
                                        <div className="flex items-start justify-between">
                                            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                                <Users className="h-6 w-6 text-indigo-400" />
                                            </div>
                                            {partner.isCoordinator && (
                                                <Badge className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] uppercase font-black italic">Coordinator</Badge>
                                            )}
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-lg">{partner.name}</h5>
                                            <p className="text-xs text-muted-foreground font-mono mt-0.5">Role: {partner.role || 'Partner'}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                            {partner.description}
                                        </p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* Narrative Structure */}
                <TabsContent value="narrative" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <div className="md:col-span-1 space-y-4">
                            <Card className="bg-secondary/10 border-white/5 rounded-3xl p-6 sticky top-24 backdrop-blur-xl shadow-2xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#4472C4]">Document Structure</h4>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full bg-white/5 hover:bg-white/10">
                                        <Plus className="h-3 w-3 text-white/40" />
                                    </Button>
                                </div>
                                <ScrollArea className="h-[65vh] -mx-2 px-2">
                                    <div className="space-y-1">
                                        <a href="#summary" className="px-3 py-2 rounded-xl bg-primary/10 text-primary flex items-center gap-2 font-bold cursor-pointer mb-2 hover:bg-primary/20 transition-all">
                                            <Sparkles className="h-3 w-3" />
                                            Executive Summary
                                        </a>
                                        {expectedSections.map((sec: any, idx: number) => (
                                            <a
                                                key={sec.key}
                                                href={`#${sec.key}`}
                                                className={`group px-3 py-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-white transition-all text-sm flex items-center gap-2 cursor-pointer ${sec.level > 0 ? 'ml-4 border-l border-white/10 pl-4' : ''}`}
                                            >
                                                {sec.level > 0 ? (
                                                    <ChevronRight className="h-3 w-3 opacity-30 group-hover:translate-x-0.5 transition-transform" />
                                                ) : (
                                                    <span className="text-[10px] font-mono opacity-20">{idx + 1}.</span>
                                                )}
                                                <span className="truncate uppercase font-medium tracking-tight text-[11px] group-hover:translate-x-1 transition-transform">{sec.label}</span>
                                                {dynamicSections?.[sec.key] ? (
                                                    <CheckCircle2 className="h-3 w-3 ml-auto text-emerald-500/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                ) : (
                                                    <AlertTriangle className="h-3 w-3 ml-auto text-amber-500/20" />
                                                )}
                                            </a>
                                        ))}
                                    </div>
                                </ScrollArea>

                                {/* Sidebar Data Tabs - Matching user screenshot */}
                                <div className="pt-6 border-t border-white/5 space-y-4">
                                    <div className="space-y-1">
                                        <button onClick={() => setActiveTab('structured')} className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all group">
                                            <div className="flex items-center gap-3">
                                                <Folder className="h-4 w-4 text-[#4472C4]" />
                                                <span className="font-bold">Work Packages</span>
                                            </div>
                                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full group-hover:bg-primary/20 transition-colors">{workPackagesArray.length}</span>
                                        </button>

                                        <div className="ml-4 space-y-1 mt-1">
                                            {workPackagesArray.slice(0, 4).map((wp: any, i: number) => (
                                                <button key={i} onClick={() => { setActiveTab('structured'); setExpandedWp(i); }} className="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-white truncate transition-colors flex items-center gap-2">
                                                    <Layers className="h-3 w-3 opacity-20" />
                                                    {wp.name || `WP${i + 1}`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <button onClick={() => setActiveTab('structured')} className="w-full flex items-center justify-between px-3 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all group">
                                            <div className="flex items-center gap-3">
                                                <Folder className="h-4 w-4 text-green-500/50" />
                                                <span className="font-bold">Consortium</span>
                                            </div>
                                            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full">{partnersArray.length}</span>
                                        </button>
                                        <button onClick={() => setActiveTab('structured')} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                                            <DollarSign className="h-4 w-4 text-emerald-500/50" />
                                            <span className="font-bold">Budget</span>
                                        </button>
                                        <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all opacity-50">
                                            <Shield className="h-4 w-4 text-amber-500/50" />
                                            <span className="font-bold">Risk Management</span>
                                        </button>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        <div className="md:col-span-3 space-y-16 pb-40">
                            {/* Executive Summary */}
                            <section id="summary" className="space-y-8 scroll-mt-24">
                                <div className="space-y-3 border-l-4 border-primary pl-6 py-2">
                                    <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em]">Section 0.0</p>
                                    <h2 className="text-4xl font-extrabold italic tracking-tight">Executive Summary</h2>
                                </div>
                                <div className="prose prose-invert prose-blue max-w-none text-muted-foreground/90 leading-relaxed text-lg font-medium selection:bg-primary/30"
                                    dangerouslySetInnerHTML={{ __html: proposal.summary }} />
                            </section>

                            {expectedSections.map((sec: any, idx: number) => (
                                <section key={sec.key} id={sec.key} className={`space-y-8 scroll-mt-24 relative ${sec.level > 0 ? 'ml-8' : ''}`}>
                                    <div className="absolute -left-4 top-0 bottom-0 w-px bg-white/5"></div>
                                    <div className={`space-y-3 ${sec.level === 0 ? 'border-l-4 border-indigo-500/50 pl-6' : 'border-l-2 border-white/10 pl-4'}`}>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                                                    {sec.level === 0 ? `Section 0${idx + 1}` : `Sub-section ${idx + 1}`}
                                                </p>
                                                <h2 className={`${sec.level === 0 ? 'text-4xl' : 'text-2xl'} font-extrabold italic tracking-tight capitalize`}>
                                                    {sec.label}
                                                </h2>
                                            </div>
                                            {!dynamicSections?.[sec.key] && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                                                    onClick={() => generateSection(sec.key, sec.label)}
                                                    disabled={generatingSection === sec.key}
                                                >
                                                    {generatingSection === sec.key ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                                                    Generate Section
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`prose prose-invert max-w-none text-muted-foreground leading-relaxed selection:bg-white/10 ${sec.level === 0 ? 'text-md font-medium' : 'text-sm'}`}>
                                        {dynamicSections?.[sec.key] ? (
                                            <div dangerouslySetInnerHTML={{ __html: dynamicSections[sec.key] }} />
                                        ) : (
                                            <div className="bg-amber-500/5 border border-amber-500/10 p-12 rounded-3xl text-center space-y-4">
                                                <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                                                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-amber-500/80 font-bold">Incomplete Proposal Section</p>
                                                    <p className="text-xs text-muted-foreground">This section was either not generated yet or is missing from the current draft.</p>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    className="border-primary/50 text-primary hover:bg-primary/10"
                                                    onClick={() => generateSection(sec.key, sec.label)}
                                                    disabled={generatingSection === sec.key}
                                                >
                                                    {generatingSection === sec.key ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                                    AI Generation
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="legacy" className="mt-0 space-y-8 pb-40">
                    <Card className="bg-white p-12 md:p-20 rounded-[48px] shadow-2xl text-black min-h-[2000px] border-none selection:bg-blue-100">
                        <div className="max-w-4xl mx-auto space-y-16">
                            {/* Formal Letterhead Style */}
                            <div className="border-b-8 border-black pb-12 space-y-6">
                                <div className="flex justify-between items-start">
                                    <Badge className="bg-black text-white px-4 py-1 rounded-none font-bold tracking-tighter">EU FUNDING PROPOSAL 2025</Badge>
                                    <span className="text-xs font-mono uppercase text-gray-400">Ref: {proposal.id.split('-').pop()}</span>
                                </div>
                                <h1 className="text-6xl font-black uppercase tracking-tighter leading-none">{proposal.title}</h1>
                                <div className="grid grid-cols-2 gap-8 pt-8">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Target Scheme</p>
                                        <p className="font-bold text-sm">{fundingScheme?.name || 'Erasmus+ KA220'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Total Requested</p>
                                        <p className="font-bold text-sm text-blue-600">€{totalBudget.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Executive Summary Section */}
                            <section className="space-y-6">
                                <h2 className="text-3xl font-black uppercase border-b-2 border-black pb-4">0. Executive Summary</h2>
                                <div
                                    className="prose prose-lg max-w-none prose-p:leading-relaxed text-gray-800"
                                    dangerouslySetInnerHTML={{ __html: proposal.summary }}
                                />
                            </section>

                            {expectedSections.map((s, idx) => (
                                <section key={s.key} className="space-y-6">
                                    <h2 className="text-3xl font-black uppercase border-b-2 border-gray-100 pb-4 flex items-center gap-4">
                                        <span className="text-gray-200">{idx + 1}.</span>
                                        {s.label}
                                    </h2>
                                    {dynamicSections[s.key] ? (
                                        <div
                                            className="prose prose-lg max-w-none prose-headings:font-black prose-headings:uppercase prose-p:leading-relaxed text-gray-800"
                                            dangerouslySetInnerHTML={{ __html: dynamicSections[s.key] }}
                                        />
                                    ) : (
                                        <div className="p-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl text-center">
                                            <p className="text-gray-400 italic text-sm">Waiting for content generation for this section...</p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="mt-4 text-xs hover:bg-black hover:text-white"
                                                onClick={() => generateSection(s.key, s.label)}
                                            >
                                                Generate Now
                                            </Button>
                                        </div>
                                    )}
                                </section>
                            ))}

                            {/* Partner List Summary in Report */}
                            <section className="space-y-8 pt-12 border-t-8 border-black">
                                <h2 className="text-4xl font-black uppercase border-b-4 border-black pb-4">Appendix A: Consortium Members</h2>
                                <p className="text-sm italic text-gray-500 mb-8">Verification of all selected partners included in this proposal draft.</p>
                                <div className="grid grid-cols-1 gap-6">
                                    {partnersArray.map((p: any, i: number) => (
                                        <div key={i} className="flex gap-8 items-start p-8 bg-gray-50 rounded-[32px] border-2 border-gray-100 group hover:border-black transition-colors">
                                            <div className="h-16 w-16 bg-black text-white flex items-center justify-center font-black text-2xl rounded-2xl shrink-0 group-hover:scale-110 transition-transform">
                                                {i + 1}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="font-black uppercase text-xl tracking-tighter">{p.name}</h3>
                                                    {p.isCoordinator && <Badge className="bg-blue-600 text-white font-bold px-2 py-0 border-none rounded-none text-[10px]">LEAD APPLICANT</Badge>}
                                                </div>
                                                <p className="text-sm font-bold text-gray-400 font-mono tracking-widest uppercase italic">
                                                    Status: {p.isCoordinator ? 'Project Coordinator' : 'Technical Partner'}
                                                </p>
                                                <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed italic border-l-4 border-gray-200 pl-4 py-2">
                                                    {p.description || "No description provided."}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Detailed Budget Appendix */}
                            <section className="space-y-8 pt-12 border-t-8 border-black">
                                <h2 className="text-4xl font-black uppercase border-b-4 border-black pb-4">Appendix B: Financial Breakdown</h2>
                                <div className="bg-black text-white p-8 rounded-[32px] space-y-4 shadow-xl">
                                    <div className="flex justify-between items-end border-b border-white/20 pb-4">
                                        <span className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40">Consolidated Grant Request</span>
                                        <span className="text-5xl font-black italic tracking-tighter">€{totalBudget.toLocaleString()}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                        {budgetArray.map((item: any, i: number) => (
                                            <div key={i} className="space-y-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-bold uppercase tracking-widest">{item.item}</span>
                                                    <span className="text-lg font-black text-emerald-400 font-mono">€{item.cost?.toLocaleString()}</span>
                                                </div>
                                                <p className="text-[10px] text-white/40 leading-relaxed">{item.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </Card>
                </TabsContent>

                <TabsContent value="settings" className="mt-0 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="bg-secondary/10 border-white/5 rounded-[40px] p-12 overflow-hidden relative shadow-2xl">
                        <div className="absolute top-0 right-0 h-32 w-32 bg-primary/20 blur-[100px] -mr-16 -mt-16 rounded-full"></div>
                        <div className="space-y-8 relative">
                            <div className="space-y-2 text-center">
                                <h3 className="text-3xl font-black italic">Proposal Configuration</h3>
                                <p className="text-muted-foreground">Fine-tune the project metadata and core parameters.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                                <div className="space-y-4">
                                    <label className="text-xs font-black uppercase tracking-widest text-primary">Target Currency</label>
                                    <Input defaultValue="EUR (€)" className="bg-black/40 border-white/10 rounded-2xl h-12" />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-xs font-black uppercase tracking-widest text-primary">Language Settings</label>
                                    <Input defaultValue="English (EN)" className="bg-black/40 border-white/10 rounded-2xl h-12" />
                                </div>
                            </div>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Consortium Management Dialog */}
            < Dialog open={showConsortiumDialog} onOpenChange={setShowConsortiumDialog} >
                <DialogContent className="max-w-4xl bg-secondary border-white/10 text-white rounded-3xl overflow-hidden p-0">
                    <div className="p-8 space-y-6">
                        <DialogHeader>
                            <DialogTitle className="text-3xl font-black italic">Consortium Management</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Add or remove organizations from this proposal. Assign the Lead Coordinator role.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[50vh]">
                            <div className="space-y-4 flex flex-col">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Users className="h-4 w-4" /> Available Partners
                                </h4>
                                <ScrollArea className="flex-1 bg-black/20 rounded-2xl border border-white/5 p-4">
                                    <div className="space-y-2">
                                        {allPartners.map(p => (
                                            <div
                                                key={p.id}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${selectedPartnerIds.has(p.id) ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                onClick={() => {
                                                    const next = new Set(selectedPartnerIds);
                                                    if (next.has(p.id)) {
                                                        next.delete(p.id);
                                                        if (coordinatorId === p.id) setCoordinatorId(null);
                                                    } else {
                                                        next.add(p.id);
                                                        if (!coordinatorId) setCoordinatorId(p.id);
                                                    }
                                                    setSelectedPartnerIds(next);
                                                }}
                                            >
                                                <div>
                                                    <p className="font-bold text-sm">{p.name}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{p.country || 'Unknown Country'}</p>
                                                </div>
                                                {selectedPartnerIds.has(p.id) && <CheckCircle2 className="h-4 w-4 text-indigo-400" />}
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            <div className="space-y-4 flex flex-col">
                                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Layers className="h-4 w-4" /> Selected Consortium
                                </h4>
                                <ScrollArea className="flex-1 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 p-4">
                                    <div className="space-y-3">
                                        {allPartners.filter(p => selectedPartnerIds.has(p.id)).map(p => (
                                            <div key={p.id} className="p-3 bg-black/20 rounded-xl border border-white/10 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-sm text-white/90">{p.name}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className={`h-7 px-2 text-[10px] font-black uppercase tracking-tighter italic ${coordinatorId === p.id ? 'bg-yellow-500/10 text-yellow-500' : 'text-muted-foreground hover:text-white'}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCoordinatorId(p.id);
                                                        }}
                                                    >
                                                        {coordinatorId === p.id ? 'Coordinator' : 'Set Coordinator'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        {selectedPartnerIds.size === 0 && (
                                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic py-12 text-sm">
                                                No partners selected.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        <DialogFooter className="pt-6 border-t border-white/5">
                            <Button variant="ghost" onClick={() => setShowConsortiumDialog(false)}>Cancel</Button>
                            <Button
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 rounded-xl font-bold"
                                onClick={handleSaveConsortium}
                                disabled={savingConsortium || selectedPartnerIds.size === 0 || !coordinatorId}
                            >
                                {savingConsortium && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Update Consortium & Recalculate
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}