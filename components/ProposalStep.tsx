import React, { useState, useEffect } from 'react';
import { Loader2, Save, Download, Eye, ArrowLeft, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import type { AnalysisResult, Idea, FullProposal } from '../types/proposal';

interface ProposalStepProps {
    selectedIdea: Idea;
    analysisResult: AnalysisResult;
    selectedPartners: any[];
    userPrompt: string;
    selectedSchemeId: string | null;
    onProposalGenerated: (proposal: FullProposal) => void;
    onBack: () => void;
    onViewProposal?: (id: string) => void;
}

export function ProposalStep({
    selectedIdea,
    analysisResult,
    selectedPartners,
    userPrompt,
    selectedSchemeId,
    onProposalGenerated,
    onBack,
    onViewProposal,
}: ProposalStepProps) {
    const [proposal, setProposal] = useState<FullProposal | null>(null);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const hasStartedGeneration = React.useRef(false);

    useEffect(() => {
        if (!hasStartedGeneration.current) {
            hasStartedGeneration.current = true;
            generateProposal();
        }
    }, []);

    const generateProposal = async () => {
        setGenerating(true);
        try {
            const response = await fetch(`${serverUrl}/generate-proposal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify({
                    idea: selectedIdea,
                    summary: analysisResult.summary,
                    constraints: analysisResult.constraints,
                    selectedPartners: selectedPartners.map(p => p.id),
                    userPrompt: userPrompt || undefined,
                    fundingSchemeId: selectedSchemeId || undefined,
                }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to generate proposal';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    // Fallback to text if not JSON
                    const errorText = await response.text().catch(() => '');
                    if (errorText) errorMessage = errorText.substring(0, 100);
                }
                throw new Error(errorMessage);
            }

            const data: FullProposal = await response.json();
            setProposal(data);
            onProposalGenerated(data);
            toast.success('Proposal generated and auto-saved!');
        } catch (error: any) {
            console.error('Generation error:', error);
            toast.error(error.message || 'Failed to generate proposal');
        } finally {
            setGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!proposal) return;

        setSaving(true);
        try {
            const response = await fetch(`${serverUrl}/proposals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify(proposal),
            });

            if (!response.ok) {
                throw new Error('Failed to save proposal');
            }

            toast.success('Proposal saved successfully!');
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Failed to save proposal');
        } finally {
            setSaving(false);
        }
    };

    const handleViewDetailed = () => {
        if (proposal?.id && onViewProposal) {
            onViewProposal(proposal.id);
        }
    };

    const formatBudgetTotal = (budget: any[]) => {
        return budget.reduce((sum, item) => sum + (item.cost || 0), 0).toLocaleString('en-US');
    };

    if (generating) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-[#4472C4]" />
                <div className="text-center">
                    <h3 className="text-lg font-medium">Generating Your Proposal</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                        AI is creating a comprehensive 11-section funding proposal...
                    </p>
                </div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Failed to generate proposal. Please try again.</p>
                <Button onClick={onBack} variant="outline" className="mt-4">
                    Back to Ideas
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">{proposal.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Generated {new Date(proposal.generatedAt || '').toLocaleString()}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowPrompt(true)} title="View AI Prompt">
                        <Terminal className="h-4 w-4 mr-2" />
                        Prompt
                    </Button>
                    <Button variant="outline" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <Button variant="outline" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                    <Button onClick={handleViewDetailed} className="bg-gradient-to-br from-[#4472C4] to-[#5B9BD5]">
                        <Eye className="h-4 w-4 mr-2" />
                        View Full Proposal
                    </Button>
                </div>
            </div>

            {/* Prompt Dialog */}
            <Dialog open={showPrompt} onOpenChange={setShowPrompt}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-[#1E1E1E] text-white border-white/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Terminal className="h-5 w-5 text-[#4472C4]" />
                            Generation Prompt
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 p-4 rounded bg-black/50 font-mono text-xs whitespace-pre-wrap border border-white/5">
                        {proposal.generationPrompt || 'Prompt not available for this proposal.'}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Quick Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-[#323232] border-white/10">
                    <CardHeader>
                        <CardTitle className="text-sm">Budget</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">€{formatBudgetTotal(proposal.budget || [])}</p>
                    </CardContent>
                </Card>
                <Card className="bg-[#323232] border-white/10">
                    <CardHeader>
                        <CardTitle className="text-sm">Work Packages</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{proposal.workPackages?.length || 0}</p>
                    </CardContent>
                </Card>
                <Card className="bg-[#323232] border-white/10">
                    <CardHeader>
                        <CardTitle className="text-sm">Partners</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{proposal.partners?.length || 0}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Summary Preview */}
            <Card className="bg-[#323232] border-white/10">
                <CardHeader>
                    <CardTitle>Executive Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div
                        className="prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: proposal.summary }}
                    />
                </CardContent>
            </Card>

            {/* Sections Preview */}
            <Card className="bg-[#323232] border-white/10">
                <CardHeader>
                    <CardTitle>Proposal Sections</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {proposal.dynamic_sections ? (
                        Object.entries(proposal.dynamic_sections).map(([key, content]) => {
                            const strContent = typeof content === 'string' ? content : '';
                            return (
                                <div key={key} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                                    <h4 className="font-medium mb-2 capitalize">{key.replace(/_/g, ' ')}</h4>
                                    <div
                                        className="text-sm text-muted-foreground prose prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: strContent.substring(0, 300) + (strContent.length > 300 ? '...' : '') }}
                                    />
                                </div>
                            );
                        })
                    ) : (
                        <>
                            {proposal.relevance && (
                                <div>
                                    <h4 className="font-medium mb-2">Relevance</h4>
                                    <div
                                        className="text-sm text-muted-foreground prose prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: (proposal.relevance || '').substring(0, 300) + (proposal.relevance.length > 300 ? '...' : '') }}
                                    />
                                </div>
                            )}
                            {proposal.impact && (
                                <div>
                                    <h4 className="font-medium mb-2">Impact</h4>
                                    <div
                                        className="text-sm text-muted-foreground prose prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: (proposal.impact || '').substring(0, 300) + (proposal.impact.length > 300 ? '...' : '') }}
                                    />
                                </div>
                            )}
                            {proposal.methods && (
                                <div>
                                    <h4 className="font-medium mb-2">Methodology</h4>
                                    <div
                                        className="text-sm text-muted-foreground prose prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: (proposal.methods || '').substring(0, 300) + (proposal.methods.length > 300 ? '...' : '') }}
                                    />
                                </div>
                            )}
                            {proposal.dissemination && (
                                <div>
                                    <h4 className="font-medium mb-2">Dissemination</h4>
                                    <div
                                        className="text-sm text-muted-foreground prose prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: (proposal.dissemination || '').substring(0, 300) + (proposal.dissemination.length > 300 ? '...' : '') }}
                                    />
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Budget Table */}
            {proposal.budget && proposal.budget.length > 0 && (
                <Card className="bg-[#323232] border-white/10">
                    <CardHeader>
                        <CardTitle>Budget Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/10">
                                        <th className="text-left py-2">Item</th>
                                        <th className="text-right py-2">Cost (€)</th>
                                        <th className="text-left py-2">Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {proposal.budget.map((item, index) => (
                                        <tr key={index} className="border-b border-white/5">
                                            <td className="py-2">{item.item}</td>
                                            <td className="text-right py-2">{item.cost.toLocaleString()}</td>
                                            <td className="text-sm text-muted-foreground py-2">{item.description}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold">
                                        <td className="py-2">Total</td>
                                        <td className="text-right py-2">€{formatBudgetTotal(proposal.budget)}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Call to Action */}
            <div className="flex justify-center py-6">
                <Button
                    onClick={handleViewDetailed}
                    size="lg"
                    className="bg-gradient-to-br from-[#4472C4] to-[#5B9BD5]"
                >
                    <Eye className="h-5 w-5 mr-2" />
                    View Full Proposal with All Sections
                </Button>
            </div>
        </div>
    );
}