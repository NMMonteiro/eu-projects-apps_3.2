import React, { useState, useEffect } from 'react';
import { Search, Filter, Check, AlertCircle, Briefcase, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import type { Partner } from '../types/partner';

interface PartnerSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedPartners: Partner[]) => void;
    selectedIdeaTitle?: string;
    proposalContext?: string;
}

interface ScoredPartner extends Partner {
    relevanceScore: number;
    matchReasons: string[];
}

export function PartnerSelectionModal({ isOpen, onClose, onConfirm, selectedIdeaTitle, proposalContext }: PartnerSelectionModalProps) {
    const [partners, setPartners] = useState<ScoredPartner[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [coordinatorId, setCoordinatorId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchPartners();
            setSelectedIds(new Set()); // Reset selection on open
            setCoordinatorId(null);
        }
    }, [isOpen]);

    const fetchPartners = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${serverUrl}/partners`, {
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'apikey': publicAnonKey,
                },
            });

            if (!response.ok) throw new Error('Failed to fetch partners');

            const data = await response.json();
            const partnersList = data.partners || [];
            const scored = calculateRelevance(partnersList, proposalContext);
            setPartners(scored);
        } catch (error) {
            console.error('Error fetching partners:', error);
            toast.error('Failed to load partners');
        } finally {
            setLoading(false);
        }
    };

    const calculateRelevance = (partners: Partner[], context: string): ScoredPartner[] => {
        if (!context) return partners.map(p => ({ ...p, relevanceScore: 0, matchReasons: [] }));

        const contextTokens = context.toLowerCase().split(/\W+/).filter(t => t.length > 3);
        const uniqueTokens = new Set(contextTokens);

        return partners.map(partner => {
            let score = 0;
            const reasons: string[] = [];

            // Check keywords
            if (partner.keywords) {
                partner.keywords.forEach(kw => {
                    if (context.toLowerCase().includes(kw.toLowerCase())) {
                        score += 10;
                        reasons.push(`Keyword match: ${kw}`);
                    }
                });
            }

            // Check description
            if (partner.description) {
                uniqueTokens.forEach(token => {
                    if (partner.description?.toLowerCase().includes(token)) {
                        score += 1;
                    }
                });
            }

            // Check experience
            if (partner.experience) {
                uniqueTokens.forEach(token => {
                    if (partner.experience?.toLowerCase().includes(token)) {
                        score += 1;
                    }
                });
            }

            return { ...partner, relevanceScore: score, matchReasons: reasons.slice(0, 3) };
        }).sort((a, b) => b.relevanceScore - a.relevanceScore);
    };

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
            if (coordinatorId === id) setCoordinatorId(null);
        } else {
            newSelected.add(id);
            // If no coordinator yet, auto-assign first one
            if (!coordinatorId) setCoordinatorId(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleCoordinator = (id: string) => {
        if (!selectedIds.has(id)) {
            toggleSelection(id);
        }
        setCoordinatorId(id === coordinatorId ? null : id);
    };

    const handleConfirm = () => {
        const selected = partners
            .filter(p => selectedIds.has(p.id))
            .map(p => ({
                ...p,
                role: p.id === coordinatorId ? 'Coordinator' : 'Partner',
                isCoordinator: p.id === coordinatorId
            }))
            .sort((a, b) => (a.isCoordinator ? -1 : b.isCoordinator ? 1 : 0));
        onConfirm(selected);
    };

    const filteredPartners = partners.filter(p =>
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col bg-card border-border">
                <DialogHeader>
                    <DialogTitle>Select Partners</DialogTitle>
                    <DialogDescription>
                        Choose partners to add to this proposal. They are sorted by relevance based on the proposal content.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center space-x-2 my-4">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search partners..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                    />
                </div>

                <ScrollArea className="flex-1 pr-4 -mr-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredPartners.map(partner => (
                                <div
                                    key={partner.id}
                                    className={`flex items-start space-x-4 p-4 rounded-lg border transition-colors ${selectedIds.has(partner.id)
                                        ? 'bg-primary/10 border-primary/50'
                                        : 'bg-card/50 border-border hover:border-primary/30'
                                        }`}
                                >
                                    <Checkbox
                                        checked={selectedIds.has(partner.id)}
                                        onCheckedChange={() => toggleSelection(partner.id)}
                                        className="mt-1"
                                    />
                                    {/* Logo Column */}
                                    <div className="shrink-0 w-12 h-12 flex items-center justify-center bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                                        {partner.logoUrl ? (
                                            <img
                                                src={partner.logoUrl}
                                                alt={partner.name}
                                                className="w-full h-full object-contain p-1"
                                            />
                                        ) : (
                                            <Briefcase className="w-6 h-6 text-muted-foreground/30" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-medium text-foreground">{partner.name}</h4>
                                                {selectedIds.has(partner.id) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleCoordinator(partner.id);
                                                        }}
                                                        className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${coordinatorId === partner.id
                                                            ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                                            : 'bg-white/5 text-muted-foreground border-white/10 hover:border-amber-500/30'
                                                            }`}
                                                    >
                                                        <Briefcase className="w-3 h-3" />
                                                        {coordinatorId === partner.id ? 'Coordinator' : 'Set as Coordinator'}
                                                    </button>
                                                )}
                                            </div>
                                            {partner.relevanceScore > 0 && (
                                                <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30">
                                                    <Star className="w-3 h-3 mr-1 fill-current" />
                                                    {partner.relevanceScore > 20 ? 'High Match' : 'Match'}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground line-clamp-2">{partner.description}</p>

                                        {partner.keywords && partner.keywords.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {partner.keywords.slice(0, 4).map((kw, i) => (
                                                    <Badge key={i} variant="outline" className="text-xs py-0 h-5">
                                                        {kw}
                                                    </Badge>
                                                ))}
                                                {partner.keywords.length > 4 && (
                                                    <span className="text-xs text-muted-foreground self-center">+{partner.keywords.length - 4}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {filteredPartners.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    No partners found matching your search.
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter className="mt-4 pt-4 border-t border-border">
                    <div className="flex-1 flex items-center text-sm text-muted-foreground">
                        {selectedIds.size} partner{selectedIds.size !== 1 ? 's' : ''} selected
                    </div>
                    <Button variant="outline" onClick={onClose} className="mr-2">Cancel</Button>
                    <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
                        Add Selected Partners
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
