import React, { useState, useEffect, useRef } from 'react';
import {
    Loader2, Save, Download, Eye, ArrowLeft,
    Layers, Users, DollarSign, AlertTriangle,
    FileText, CheckCircle2, ChevronDown, Sparkles,
    Terminal, Settings, Layout, Search, Filter,
    Plus, Trash2, Edit, Save as SaveIcon, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import type { FullProposal } from '../types/proposal';

interface ProposalViewerTestPageProps {
    proposalId: string;
    onBack: () => void;
}

export function ProposalViewerTestPage({ proposalId, onBack }: ProposalViewerTestPageProps) {
    const [proposal, setProposal] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'structured' | 'narrative' | 'settings'>('structured');
    const [expandedWp, setExpandedWp] = useState<number | null>(0);

    useEffect(() => {
        loadProposal();
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
        } catch (error) {
            console.error('Load error:', error);
            toast.error('Failed to load proposal details');
        } finally {
            setLoading(false);
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

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 pt-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-secondary/20 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 py-1 uppercase tracking-widest text-[10px] font-bold">
                            Official Proposal
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
                        <TabsTrigger value="structured" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold">
                            <Layout className="h-4 w-4" />
                            Project Design
                        </TabsTrigger>
                        <TabsTrigger value="narrative" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold">
                            <FileText className="h-4 w-4" />
                            Narrative Structure
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="rounded-xl px-8 py-2.5 data-[state=active]:bg-primary data-[state=active]:shadow-lg flex gap-2 font-bold">
                            <Settings className="h-4 w-4" />
                            Configuration
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Structured View: Work Packages & Budget */}
                <TabsContent value="structured" className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Work Packages Grid */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h3 className="text-2xl font-bold flex items-center gap-2">
                                    <Layers className="h-6 w-6 text-blue-500" />
                                    Work Packages
                                </h3>
                                <p className="text-sm text-muted-foreground italic">Comprehensive breakdown of project phases and technical implementation.</p>
                            </div>
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
                                                                {act.description?.substring(0, 150)}...
                                                            </p>
                                                            <div className="flex items-center gap-2 pt-2">
                                                                <div className="h-5 w-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[8px] font-bold text-blue-400">LD</div>
                                                                <span className="text-[10px] text-muted-foreground font-bold">{act.leadPartner || 'TBD'}</span>
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

                    {/* Budget Overview */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h3 className="text-2xl font-bold flex items-center gap-2">
                                    <DollarSign className="h-6 w-6 text-emerald-500" />
                                    Financial Statement
                                </h3>
                                <p className="text-sm text-muted-foreground italic">Detailed allocation of project resources and partner budgets.</p>
                            </div>
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

                    {/* Partners Overview */}
                    <div className="space-y-6">
                        <div className="space-y-1">
                            <h3 className="text-2xl font-bold flex items-center gap-2">
                                <Users className="h-6 w-6 text-indigo-500" />
                                Consortium Members
                            </h3>
                            <p className="text-sm text-muted-foreground italic">Strategic partnership and organizational expertise involved in the project.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(proposal.partners || []).map((partner: any, pIdx: number) => (
                                <Card key={pIdx} className="bg-secondary/10 border-white/5 rounded-3xl p-6 hover:bg-secondary/20 transition-all border-l-4 border-l-indigo-500/50">
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
                                            {partner.description || 'Organizational profile generated based on database expertise.'}
                                        </p>
                                        <div className="pt-2">
                                            <Button variant="ghost" size="sm" className="w-full justify-start text-[10px] uppercase font-bold text-indigo-400 group">
                                                View full profile
                                                <ArrowLeft className="h-3 w-3 ml-2 rotate-180 group-hover:translate-x-1 transition-transform" />
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* Narrative Structure View */}
                <TabsContent value="narrative" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Summary Sidebar Navigation */}
                        <div className="md:col-span-1 space-y-4">
                            <Card className="bg-secondary/10 border-white/5 rounded-3xl p-6 sticky top-24 backdrop-blur-xl">
                                <h4 className="text-xs font-black uppercase tracking-widest text-primary/50 mb-4">Structural Layout</h4>
                                <ScrollArea className="h-[60vh] -mx-2 px-2">
                                    <div className="space-y-1">
                                        <div className="px-3 py-2 rounded-xl bg-primary/10 text-primary flex items-center gap-2 font-bold cursor-pointer mb-2">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                                            Summary
                                        </div>
                                        {Object.keys(proposal.dynamicSections || {}).map((key, idx) => (
                                            <div key={key} className="px-3 py-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-white transition-colors text-sm flex items-center gap-2 cursor-pointer">
                                                <span className="text-[10px] font-mono opacity-30">{idx + 1}.</span>
                                                <span className="truncate">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </Card>
                        </div>

                        {/* Narrative Content */}
                        <div className="md:col-span-3 space-y-12 pb-20">
                            {/* Summary Section */}
                            <section className="space-y-6">
                                <div className="space-y-2 border-b border-white/5 pb-4">
                                    <h2 className="text-3xl font-black italic tracking-tight">Project Summary</h2>
                                    <p className="text-xs text-muted-foreground uppercase tracking-[0.3em] font-bold">Executive Overview</p>
                                </div>
                                <div className="prose prose-invert prose-blue max-w-none text-muted-foreground leading-loose selection:bg-primary/30"
                                    dangerouslySetInnerHTML={{ __html: proposal.summary }} />
                            </section>

                            {/* Dynamic Sections */}
                            {Object.entries(proposal.dynamicSections || {}).map(([key, content]: [string, any], idx) => (
                                <section key={key} id={key} className="space-y-6 relative">
                                    <div className="absolute -left-4 top-0 bottom-0 w-px bg-white/5"></div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-black italic tracking-tight capitalize">
                                            {key.replace(/_/g, ' ')}
                                        </h2>
                                        <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Section 0{idx + 1}</p>
                                    </div>
                                    <div className="prose prose-invert prose-indigo max-w-none text-muted-foreground leading-loose selection:bg-indigo-500/30"
                                        dangerouslySetInnerHTML={{ __html: content }} />
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
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black italic">Proposal Configuration</h3>
                                <p className="text-muted-foreground">Fine-tune the project metadata and core parameters.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="text-xs font-black uppercase tracking-widest text-primary">Target Currency</label>
                                    <Input defaultValue="EUR (€)" className="bg-black/40 border-white/10 rounded-2xl h-12" />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-xs font-black uppercase tracking-widest text-primary">Language Settings</label>
                                    <Input defaultValue="English (EN)" className="bg-black/40 border-white/10 rounded-2xl h-12" />
                                </div>
                                <div className="space-y-4 md:col-span-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-primary">AI Compliance Note</label>
                                    <p className="text-xs text-muted-foreground bg-primary/5 p-4 rounded-2xl border border-primary/20 leading-relaxed italic">
                                        This proposal was generated using Gemini 2.0 Flash with explicit instructions for 4 unique Work Packages,
                                        technical needs analysis, and strict adherence to the requested financial constraints.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-8 flex justify-end gap-4">
                                <Button variant="ghost" className="rounded-2xl px-8 h-12 font-bold opacity-50">Reset Configuration</Button>
                                <Button className="bg-primary hover:bg-primary/90 rounded-2xl px-12 h-12 font-black italic">Update Proposal</Button>
                            </div>
                        </div>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

