import React, { useState, useEffect } from 'react';
import { Loader2, Plus, Edit, Search, Building2, Globe, Mail, Upload, Trash2, User, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import type { Partner } from '../types/partner';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';

interface PartnersPageProps {
    onEditPartner?: (id: string) => void;
}

export function PartnersPage({ onEditPartner }: PartnersPageProps) {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [partnerToDelete, setPartnerToDelete] = useState<{ id: string; name: string } | null>(null);

    useEffect(() => {
        loadPartners();
    }, []);

    const loadPartners = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${serverUrl}/partners`, {
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load partners');
            }

            const data = await response.json();
            setPartners(data.partners || []);
        } catch (error: any) {
            console.error('Load error:', error);
            toast.error(error.message || 'Failed to load partners');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (id: string, name: string) => {
        setPartnerToDelete({ id, name });
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!partnerToDelete) return;

        const { id, name } = partnerToDelete;
        setDeleteDialogOpen(false);

        try {
            const response = await fetch(`${serverUrl}/partners/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to delete partner');
            }

            setPartners(partners.filter(p => p.id !== id));
            toast.success(`${name} deleted`);
        } catch (error: any) {
            console.error('Delete error:', error);
            toast.error(error.message || 'Failed to delete partner');
        } finally {
            setPartnerToDelete(null);
        }
    };

    const handleCreateNew = () => {
        if (onEditPartner) {
            onEditPartner('new');
        }
    };

    const filteredPartners = partners.filter(partner =>
        partner.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.acronym?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        partner.organizationType?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                        <Building2 className="h-6 w-6 text-primary" />
                        My Partners
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {partners.length} partner{partners.length !== 1 ? 's' : ''} in your consortium
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleCreateNew}
                        className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Partner
                    </Button>
                    <div className="relative">
                        <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            id="partners-page-pdf-upload"
                            onChange={async (e) => {
                                console.log('=== FILE INPUT CHANGE DETECTED ===');
                                const file = e.target.files?.[0];
                                if (!file) {
                                    console.log('No file selected');
                                    return;
                                }
                                console.log('=== PDF IMPORT STARTED ===');
                                console.log('File selected:', file.name, file.size, 'bytes');

                                // Immediate feedback
                                const toastId = toast.loading('Starting upload...');

                                try {
                                    const formData = new FormData();
                                    formData.append('file', file);

                                    console.log('Sending request to:', `${serverUrl}/import-partner-pdf`);

                                    // Add timeout to fetch
                                    const controller = new AbortController();
                                    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

                                    const startTime = Date.now();
                                    const response = await fetch(`${serverUrl}/import-partner-pdf`, {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${publicAnonKey}`,
                                        },
                                        body: formData,
                                        signal: controller.signal
                                    });
                                    clearTimeout(timeoutId);

                                    const duration = Date.now() - startTime;
                                    console.log('Response received after', duration, 'ms');
                                    console.log('Response status:', response.status, response.statusText);

                                    const responseText = await response.text();
                                    console.log('Response body:', responseText);

                                    if (!response.ok) {
                                        throw new Error(`Server returned ${response.status}: ${responseText}`);
                                    }

                                    const data = JSON.parse(responseText);
                                    console.log('Extraction success! Partner ID:', data.partnerId);
                                    const { partnerId } = data;

                                    toast.dismiss(toastId);
                                    toast.success('Partner imported successfully!');

                                    // Navigate to edit page immediately
                                    console.log('Navigating to partner edit page for:', partnerId);
                                    if (onEditPartner) {
                                        onEditPartner(partnerId);
                                    } else {
                                        console.error('onEditPartner callback is missing!');
                                    }

                                } catch (error: any) {
                                    console.error('=== PDF IMPORT ERROR ===', error);
                                    toast.dismiss(toastId);

                                    if (error.name === 'AbortError') {
                                        toast.error('Request timed out. The server took too long to respond.');
                                    } else {
                                        toast.error(`Failed to import PDF: ${error.message}`);
                                    }
                                } finally {
                                    // Reset input
                                    e.target.value = '';
                                }
                            }}
                        />
                        <Button
                            variant="outline"
                            onClick={() => document.getElementById('partners-page-pdf-upload')?.click()}
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Import PDF
                        </Button>
                    </div>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by name, acronym, country, or type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

            {filteredPartners.length === 0 ? (
                <div className="text-center py-12">
                    <Building2 className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <p className="text-muted-foreground">
                        {searchQuery ? 'No partners match your search' : 'No partners added yet'}
                    </p>
                    {!searchQuery && (
                        <Button onClick={handleCreateNew} variant="outline" className="mt-4">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Partner
                        </Button>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filteredPartners.map((partner) => (
                        <div key={partner.id} className="flex items-center gap-4 p-4 border rounded-xl hover:border-primary/50 transition-all group bg-card/40 backdrop-blur-sm shadow-sm">
                            {/* Logo Column */}
                            <div className="shrink-0 w-14 h-14 flex items-center justify-center bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                                {partner.logoUrl ? (
                                    <img
                                        src={partner.logoUrl}
                                        alt={partner.name}
                                        className="w-full h-full object-contain p-1"
                                    />
                                ) : (
                                    <Building2 className="w-7 h-7 text-muted-foreground/50" />
                                )}
                            </div>

                            {/* Content Column */}
                            <div className="flex-1 min-w-0">
                                {/* Line 1: name | Contact Person Name | phone | email */}
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1">
                                    <h3
                                        className="font-bold text-lg group-hover:text-primary transition-colors truncate cursor-pointer"
                                        onClick={() => onEditPartner && onEditPartner(partner.id)}
                                    >
                                        {partner.name}
                                    </h3>

                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        {partner.contactPersonName && (
                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                <User className="w-3.5 h-3.5 text-primary/60" />
                                                {partner.contactPersonName}
                                            </div>
                                        )}
                                        {partner.contactPersonPhone && (
                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                <Phone className="w-3.5 h-3.5 text-primary/60" />
                                                {partner.contactPersonPhone}
                                            </div>
                                        )}
                                        {(partner.contactPersonEmail || partner.contactEmail) && (
                                            <div className="flex items-center gap-1.5 whitespace-nowrap truncate max-w-[200px]">
                                                <Mail className="w-3.5 h-3.5 text-primary/60" />
                                                {partner.contactPersonEmail || partner.contactEmail}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Line 2: country | Organization Type */}
                                <div className="flex items-center gap-3">
                                    {partner.country && (
                                        <div className="flex items-center text-xs font-medium text-foreground/80">
                                            <Globe className="w-3.5 h-3.5 mr-1.5 text-primary" />
                                            {partner.country}
                                        </div>
                                    )}
                                    {partner.organizationType && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider bg-primary/10 text-primary border-none">
                                            {partner.organizationType}
                                        </Badge>
                                    )}
                                    {partner.acronym && (
                                        <span className="text-[10px] text-muted-foreground font-mono bg-white/5 px-1 rounded uppercase">
                                            {partner.acronym}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions Column */}
                            <div className="flex items-center gap-1.5 pl-2">
                                <Button
                                    onClick={() => onEditPartner && onEditPartner(partner.id)}
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(partner.id, partner.name);
                                    }}
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <DeleteConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onConfirm={handleDeleteConfirm}
                title="Delete Partner"
                description={`Are you sure you want to delete ${partnerToDelete?.name}? This action cannot be undone.`}
            />
        </div>
    );
}