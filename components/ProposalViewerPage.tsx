import React, { useState, useEffect } from 'react';
import {
    Loader2, Save, Download, Eye, ArrowLeft,
    Layers, Users, DollarSign, AlertTriangle,
    FileText, CheckCircle2, ChevronDown, Sparkles,
    Terminal, Settings, Layout, Search, Filter,
    Plus, Trash2, Edit, Save as SaveIcon, X,
    Folder, File, ChevronRight, RefreshCw, Wand2
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
    const [activeTab, setActiveTab] = useState<'structured' | 'narrative' | 'settings'>('structured');
    const [expandedWp, setExpandedWp] = useState<number | null>(0);
    const [fundingScheme, setFundingScheme] = useState<any>(null);

    // Consortium Management State
    const [allPartners, setAllPartners] = useState<any[]>([]);
    const [showConsortiumDialog, setShowConsortiumDialog] = useState(false);
    const [selectedPartnerIds, setSelectedPartnerIds] = useState<Set<string>>(new Set());
    const [coordinatorId, setCoordinatorId] = useState<string | null>(null);
    const [savingConsortium, setSavingConsortium] = useState(false);

    // AI Generation State
    const [generatingSection, setGeneratingSection] = useState<string | null>(null);

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
            if (data.partners) {
                const ids = new Set(data.partners.map((p: any) => p.id));
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
                setAllPartners(data);
            }
        } catch (error) {
            console.error('Failed to load partners:', error);
        }
    };

    const handleUpdateProposal = async (updates: any) => {
        try {
            const response = await fetch(`${serverUrl}/proposals/${proposalId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Update failed');
            const updated = await response.json();
            setProposal(updated);
            return updated;
        } catch (error) {
            console.error('Update error:', error);
            toast.error('Failed to save changes');
        }
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

    const totalBudget = (proposal.budget || []).reduce((sum: number, item: any) => sum + (item.cost || 0), 0);

    // Flatten sections from funding scheme template
    const getFlattenedSections = (sections: any[]): any[] => {
        let result: any[] = [];
        sections.forEach(s => {
            result.push({
                key: s.key,
                label: s.label,
                level: s.level || 0,
                isSub: !!s.subsections?.length
            });
            if (s.subsections?.length) {
                result = [...result, ...getFlattenedSections(s.subsections.map((sub: any) => ({ ...sub, level: (s.level || 0) + 1 })))];
            }
        });
        return result;
    };

    const dynamicSections = proposal.dynamic_sections || proposal.dynamicSections || {};
    const expectedSections = fundingScheme?.template_json?.sections
        ? getFlattenedSections(fundingScheme.template_json.sections)
        : Object.keys(dynamicSections).map(k => ({ key: k, label: k.replace(/_/g, ' '), level: 0 }));

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
                            <span>{proposal.workPackages?.length || 0} Work Packages</span>
                        </div>
                        <div className="h-1 w-1 rounded-full bg-white/10"></div>
                        <div className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-green-400" />
                            <span>{proposal.partners?.length || 0} Organizations</span>
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
                    <TabsList className="bg-secondary/40 p-1 rounded-2xl border border-white/5 backdrop-blur-lg">
                        <TabsTrigger value="structured" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold transition-all duration-300">
                            <Layout className="h-4 w-4" />
                            Project Design
                        </TabsTrigger>
                        <TabsTrigger value="narrative" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold transition-all duration-300">
                            <FileText className="h-4 w-4" />
                            Narrative Structure
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold transition-all duration-300">
                            <Settings className="h-4 w-4" />
                            Configuration
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
                                {proposal.workPackages?.length || 0} Total Packages
                            </Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {(proposal.workPackages || []).map((wp: any, idx: number) => (
                                <Card key={idx} className={`bg-secondary/10 border-white/5 hover:border-primary/20 transition-all duration-300 overflow-hidden rounded-3xl group ${expandedWp === idx ? 'ring-1 ring-primary/30 shadow-2xl shadow-primary/5' : ''}`}>
                                    <div
                                        className="p-6 cursor-pointer flex items-center justify-between"
                                        onClick={() => setExpandedWp(expandedWp === idx ? null : idx)}
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-2xl font-black text-white shadow-lg group-hover:scale-110 transition-transform">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-bold group-hover:text-primary transition-colors">{wp.name || `Work Package ${idx + 1}`}</h4>
                                                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground font-mono">
                                                    <span>{wp.duration || 'All project duration'}</span>
                                                    <div className="h-1 w-1 rounded-full bg-white/10"></div>
                                                    <span>{wp.activities?.length || 0} Activities</span>
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronDown className={`h-6 w-6 text-muted-foreground transition-transform duration-500 ${expandedWp === idx ? 'rotate-180 text-primary' : ''}`} />
                                    </div>

                                    {expandedWp === idx && (
                                        <CardContent className="px-8 pb-8 space-y-8 animate-in slide-in-from-top-4 duration-300">
                                            <div className="h-px w-full bg-white/5"></div>
                                            <div className="space-y-4">
                                                <h5 className="text-sm font-bold uppercase tracking-widest text-primary/70">Overview & Objectives</h5>
                                                <p className="text-muted-foreground leading-relaxed text-sm bg-black/20 p-4 rounded-2xl border border-white/5 italic">
                                                    {wp.description}
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <h5 className="text-sm font-bold uppercase tracking-widest text-primary/70">Planned Activities</h5>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {(wp.activities || []).map((act: any, aIdx: number) => (
                                                        <div key={aIdx} className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-3 hover:bg-white/10 transition-colors">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-mono text-primary/50">ACT {idx + 1}.{aIdx + 1}</span>
                                                                <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[10px]">€{act.estimatedBudget?.toLocaleString()}</Badge>
                                                            </div>
                                                            <h6 className="font-bold text-white/90">{act.name}</h6>
                                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                                {act.description}
                                                            </p>
                                                            <div className="flex items-center gap-2 pt-2">
                                                                <div className="h-5 w-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[8px] font-bold text-blue-400">LD</div>
                                                                <span className="text-[10px] text-muted-foreground font-bold">{act.leadPartner}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h5 className="text-sm font-bold uppercase tracking-widest text-primary/70">Deliverables</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {(wp.deliverables || []).map((del: string, dIdx: number) => (
                                                        <Badge key={dIdx} variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 text-xs">
                                                            <CheckCircle2 className="h-3 w-3 mr-2" />
                                                            {del}
                                                        </Badge>
                                                    ))}
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

                        <Card className="bg-secondary/10 border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Budget Category</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Allocation Details</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-muted-foreground text-right italic">Amount (€)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(proposal.budget || []).map((item: any, i: number) => (
                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-6 font-bold text-white/80">{item.item}</td>
                                            <td className="px-6 py-6 text-sm text-muted-foreground max-w-md">
                                                {item.description}
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {item.breakdown?.map((sub: any, sI: number) => (
                                                        <span key={sI} className="text-[10px] bg-black/30 px-2 py-0.5 rounded border border-white/5">
                                                            {sub.subItem} ({sub.quantity})
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 text-right font-mono font-bold text-emerald-400">€{item.cost.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-emerald-500/10">
                                        <td colSpan={2} className="px-6 py-6 text-right font-black uppercase text-xs tracking-[0.2em] text-emerald-500 italic">Consolidated Total</td>
                                        <td className="px-6 py-6 text-right font-black text-2xl text-emerald-500 italic border-l border-emerald-500/20 tracking-tighter">€{totalBudget.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
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
                            {(proposal.partners || []).map((partner: any, pIdx: number) => (
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
                                    <h4 className="text-xs font-black uppercase tracking-widest text-primary/50">Structural Layout</h4>
                                    <Badge variant="outline" className="text-[8px] opacity-40">AI GEN v2.0</Badge>
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
                <TabsContent value="settings" className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
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