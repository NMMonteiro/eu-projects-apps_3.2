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
    const [activeTab, setActiveTab] = useState<'structured' | 'narrative' | 'legacy' | 'settings'>('narrative');
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

    // Explicit sections that MUST be visible if they exist in dynamicSections
    const standardKeys = [
        { key: 'context', label: 'Context', level: 0 },
        { key: 'project_summary', label: 'Project Summary', level: 0 },
        { key: 'relevance', label: 'Relevance', level: 0 },
        { key: 'partnership_arrangements', label: 'Partnership Arrangements', level: 0 },
        { key: 'impact', label: 'Impact', level: 0 },
        { key: 'project_design_implementation', label: 'Project Design & Implementation', level: 0 }
    ];

    let templateSections = fundingScheme?.template_json?.sections
        ? getFlattenedSections(fundingScheme.template_json.sections)
        : standardKeys;

    const templateKeys = new Set((templateSections || []).map(s => s.key));

    // Ensure all standard keys that HAVE content are included even if not in template
    standardKeys.forEach(s => {
        if (!templateKeys.has(s.key) && dynamicSections[s.key]) {
            templateSections.push(s);
            templateKeys.add(s.key);
        }
    });

    const templateWPKeys = new Set(templateSections
        .filter(s => s.label?.toLowerCase().includes('work package') || s.key.includes('wp'))
        .map(s => s.key));

    const extraSections = Object.keys(dynamicSections || {})
        .filter(key => {
            if (templateKeys.has(key)) return false;
            if (key.startsWith('work_package_') && templateWPKeys.size > 0) return false;
            return true;
        })
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
                        <TabsTrigger value="narrative" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                            Narrative Structure
                        </TabsTrigger>
                        <TabsTrigger value="structured" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                            Interative Editor
                        </TabsTrigger>
                        <TabsTrigger value="legacy" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                            Full Report (Legacy View)
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="rounded-xl px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                            Settings
                        </TabsTrigger>
                    </TabsList>
                </div>

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

                        <div className="space-y-4">
                            {workPackagesArray.map((wp: any, idx: number) => (
                                <Card key={idx} className="bg-secondary/10 border-white/5 rounded-3xl p-8 mb-6 overflow-hidden shadow-2xl relative group">
                                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                                            const newWPs = workPackagesArray.filter((_, i) => i !== idx);
                                            handleUpdateProposal({ workPackages: newWPs });
                                        }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-6 mb-8">
                                        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                                            <Activity className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                                        </div>
                                        <div className="flex-1">
                                            <Input
                                                className="text-2xl font-black tracking-tight italic bg-transparent border-none p-0 h-auto focus-visible:ring-0"
                                                value={wp.name}
                                                onChange={(e) => {
                                                    const newWPs = [...workPackagesArray];
                                                    newWPs[idx] = { ...wp, name: e.target.value };
                                                    handleUpdateProposal({ workPackages: newWPs });
                                                }}
                                            />
                                            <p className="text-xs text-muted-foreground font-black uppercase tracking-[0.3em] opacity-40">Duration: {wp.duration || 'Not set'}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => setExpandedWp(expandedWp === idx ? -1 : idx)}>
                                            {expandedWp === idx ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                        </Button>
                                    </div>

                                    {expandedWp === idx && (
                                        <CardContent className="p-0 pt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                            <div className="mb-8">
                                                <h5 className="text-sm font-bold uppercase tracking-widest text-primary/70 mb-3">Technical Objectives</h5>
                                                <textarea
                                                    className="w-full bg-black/30 border border-white/5 rounded-2xl p-4 text-sm text-muted-foreground min-h-[100px] focus:outline-none focus:border-primary/50 transition-colors"
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
                                                    <h5 className="text-sm font-bold uppercase tracking-widest text-primary/70">Planned Activities</h5>
                                                    <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10" onClick={() => {
                                                        const newWPs = [...workPackagesArray];
                                                        const activities = [...(wp.activities || [])];
                                                        activities.push({ name: 'New Activity', description: '', leadPartner: '', estimatedBudget: 0 });
                                                        newWPs[idx] = { ...wp, activities };
                                                        handleUpdateProposal({ workPackages: newWPs });
                                                    }}>
                                                        <Plus className="h-4 w-4 mr-1" /> Add Activity
                                                    </Button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {(Array.isArray(wp.activities) ? wp.activities : []).map((act: any, aIdx: number) => (
                                                        <div key={aIdx} className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-3 hover:bg-white/10 transition-colors relative">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-mono text-primary/50">ACT {idx + 1}.{aIdx + 1}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <Input
                                                                        type="number"
                                                                        className="w-20 h-6 text-[10px] bg-black/40 border-none p-1 text-emerald-500 font-bold"
                                                                        value={act.estimatedBudget || 0}
                                                                        onChange={(e) => {
                                                                            const newWPs = [...workPackagesArray];
                                                                            const activities = [...wp.activities];
                                                                            activities[aIdx] = { ...act, estimatedBudget: parseInt(e.target.value) || 0 };
                                                                            newWPs[idx] = { ...wp, activities };
                                                                            handleUpdateProposal({ workPackages: newWPs });
                                                                        }}
                                                                    />
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/30 hover:text-destructive" onClick={() => {
                                                                        const newWPs = [...workPackagesArray];
                                                                        const activities = wp.activities.filter((_: any, i: number) => i !== aIdx);
                                                                        newWPs[idx] = { ...wp, activities };
                                                                        handleUpdateProposal({ workPackages: newWPs });
                                                                    }}>
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <Input
                                                                className="font-bold text-white/90 bg-transparent border-none p-0 h-auto focus-visible:ring-0"
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
                                                                className="w-full bg-transparent border-none p-0 text-xs text-muted-foreground leading-relaxed focus:outline-none min-h-[60px]"
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
                                                </div>
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                            <Button
                                variant="outline"
                                className="w-full border-dashed border-2 py-8 rounded-3xl flex flex-col gap-2 hover:bg-primary/5 transition-colors"
                                onClick={() => {
                                    const newWPs = [...workPackagesArray];
                                    newWPs.push({ name: `WP${newWPs.length + 1}: New Work Package`, description: '', activities: [] });
                                    handleUpdateProposal({ workPackages: newWPs });
                                }}
                            >
                                <PlusCircle className="h-6 w-6 text-primary" />
                                <span className="font-bold text-primary/70">Add New Work Package</span>
                            </Button>
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
                <TabsContent value="legacy" className="mt-0">
                    <Card className="bg-white p-12 rounded-[32px] shadow-2xl text-black min-h-[1000px] border-none">
                        <div className="max-w-4xl mx-auto space-y-12">
                            <div className="border-b-4 border-black pb-8">
                                <h1 className="text-5xl font-black uppercase tracking-tighter mb-4">{proposal.title}</h1>
                                <p className="text-xl italic text-gray-600">Funding Proposal Report</p>
                            </div>

                            {expectedSections.map((s) => (
                                <section key={s.key} className="space-y-6">
                                    <h2 className="text-3xl font-black uppercase border-b-2 border-gray-200 pb-2 flex items-center gap-4">
                                        <span className="text-gray-300">#</span>
                                        {s.label}
                                    </h2>
                                    {dynamicSections[s.key] ? (
                                        <div
                                            className="prose prose-lg max-w-none prose-headings:font-black prose-headings:uppercase prose-p:leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: dynamicSections[s.key] }}
                                        />
                                    ) : (
                                        <p className="text-gray-400 italic">No content generated for this section.</p>
                                    )}
                                </section>
                            ))}
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
            <Dialog open={showConsortiumDialog} onOpenChange={setShowConsortiumDialog}>
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