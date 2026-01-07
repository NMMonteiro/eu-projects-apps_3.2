import React, { useState, useEffect } from 'react';
import { Loader2, Save, X, Upload, Building2, Globe, Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/primitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { serverUrl, publicAnonKey } from '../utils/supabase/info';
import type { Partner } from '../types/partner';

interface PartnerEditPageProps {
    partnerId: string | null;
    onBack: () => void;
}

export function PartnerEditPage({ partnerId, onBack }: PartnerEditPageProps) {
    const [partner, setPartner] = useState<Partner | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<'logo' | 'pdf' | null>(null);

    const isNew = partnerId === 'new';

    useEffect(() => {
        if (isNew) {
            setPartner({
                id: '', // Placeholder for new partner
                name: '',
                acronym: '',
                country: '',
                organizationType: '',
                contactEmail: '',
                website: '',
                description: '',
                role: '',
                logoUrl: undefined,
                pdfUrl: undefined,
                contactPersonName: undefined,
                contactPersonEmail: undefined,
                contactPersonPhone: undefined,
                experience: undefined,
                keywords: undefined,
            });
            setLoading(false);
        } else if (partnerId) {
            loadPartner();
        }
    }, [partnerId, isNew]);

    const loadPartner = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${serverUrl}/partners/${partnerId}`, {
                headers: {
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load partner');
            }

            const data = await response.json();
            setPartner(data);
        } catch (error: any) {
            console.error('Load error:', error);
            toast.error(error.message || 'Failed to load partner');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!partner?.name?.trim()) {
            toast.error('Partner name is required');
            return;
        }
        if (!partner) {
            toast.error('Partner data is not loaded.');
            return;
        }

        setSaving(true);
        try {
            const url = isNew
                ? `${serverUrl}/partners`
                : `${serverUrl}/partners/${partnerId}`;

            const method = isNew ? 'POST' : 'PUT';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`,
                },
                body: JSON.stringify(partner),
            });

            if (!response.ok) {
                throw new Error('Failed to save partner');
            }

            toast.success(isNew ? 'Partner created!' : 'Partner updated!');
            onBack();
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Failed to save partner');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (target: 'logo' | 'pdf') => {
        setDeleteTarget(target);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (deleteTarget === 'logo') {
            updateField('logoUrl', undefined);
        } else if (deleteTarget === 'pdf') {
            updateField('pdfUrl', undefined);
        }
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
    };

    const updateField = <K extends keyof Partner>(field: K, value: Partner[K]) => {
        setPartner(prev => prev ? ({ ...prev, [field]: value }) : null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                        <Building2 className="h-6 w-6 text-primary" />
                        {isNew ? 'Add New Partner' : 'Edit Partner'}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {isNew ? 'Add a new consortium partner' : 'Update partner information'}
                    </p>
                </div>
                <Button variant="outline" onClick={onBack}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>Essential partner details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Partner Name *</Label>
                            <Input
                                value={partner.name || ''}
                                onChange={(e) => updateField('name', e.target.value)}
                                placeholder="University of Example"
                            />
                        </div>
                        <div>
                            <Label>Acronym</Label>
                            <Input
                                value={partner.acronym || ''}
                                onChange={(e) => updateField('acronym', e.target.value)}
                                placeholder="UoE"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>OID (Organisation ID)</Label>
                        <Input
                            value={partner.organisationId || ''}
                            onChange={(e) => updateField('organisationId', e.target.value)}
                            placeholder="E12345678"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Country</Label>
                            <Input
                                value={partner.country || ''}
                                onChange={(e) => updateField('country', e.target.value)}
                                placeholder="Portugal"
                            />
                        </div>
                        <div>
                            <Label>Organization Type</Label>
                            <Input
                                value={partner.organizationType || ''}
                                onChange={(e) => updateField('organizationType', e.target.value)}
                                placeholder="University, SME, Research Institute, etc."
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox
                                id="isPublicBody"
                                checked={partner.isPublicBody || false}
                                onCheckedChange={(checked) => updateField('isPublicBody', checked === true)}
                            />
                            <label htmlFor="isPublicBody" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Public Body?
                            </label>
                        </div>
                        <div className="flex items-center space-x-2 pt-2">
                            <Checkbox
                                id="isNonProfit"
                                checked={partner.isNonProfit || false}
                                onCheckedChange={(checked) => updateField('isNonProfit', checked === true)}
                            />
                            <label htmlFor="isNonProfit" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Non-Profit?
                            </label>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>VAT Number</Label>
                            <Input
                                value={partner.vatNumber || ''}
                                onChange={(e) => updateField('vatNumber', e.target.value)}
                                placeholder="PT123456789"
                            />
                        </div>
                        <div>
                            <Label>Business Registration ID</Label>
                            <Input
                                value={partner.businessId || ''}
                                onChange={(e) => updateField('businessId', e.target.value)}
                                placeholder="REG-123456"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label>Legal Address</Label>
                        <Input
                            value={partner.legalAddress || ''}
                            onChange={(e) => updateField('legalAddress', e.target.value)}
                            placeholder="Street Name, No. 123"
                        />
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label>Postcode</Label>
                                <Input
                                    value={partner.postcode || ''}
                                    onChange={(e) => updateField('postcode', e.target.value)}
                                    placeholder="1000-001"
                                />
                            </div>
                            <div>
                                <Label>City</Label>
                                <Input
                                    value={partner.city || ''}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    placeholder="Lisbon"
                                />
                            </div>
                            <div>
                                <Label>Region</Label>
                                <Input
                                    value={partner.region || ''}
                                    onChange={(e) => updateField('region', e.target.value)}
                                    placeholder="Lisboa"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <Label>Role in Project</Label>
                        <Input
                            value={partner.role || ''}
                            onChange={(e) => updateField('role', e.target.value)}
                            placeholder="Coordinator, Work Package Leader, etc."
                        />
                    </div>

                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={partner.description || ''}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Brief description of the organization..."
                            rows={3}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                    <CardDescription>How to reach this partner</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Email</Label>
                            <Input
                                type="email"
                                value={partner.contactEmail || ''}
                                onChange={(e) => updateField('contactEmail', e.target.value)}
                                placeholder="contact@example.com"
                            />
                        </div>
                        <div>
                            <Label>Website</Label>
                            <Input
                                type="url"
                                value={partner.website || ''}
                                onChange={(e) => updateField('website', e.target.value)}
                                placeholder="https://example.com"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Department/Unit</Label>
                        <Input
                            value={partner.department || ''}
                            onChange={(e) => updateField('department', e.target.value)}
                            placeholder="Department of Innovation / R&D Unit"
                        />
                    </div>

                    <div>
                        <Label>Contact Person Name</Label>
                        <Input
                            value={partner.contactPersonName || ''}
                            onChange={(e) => updateField('contactPersonName', e.target.value)}
                            placeholder="John Doe"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Contact Person Email</Label>
                            <Input
                                type="email"
                                value={partner.contactPersonEmail || ''}
                                onChange={(e) => updateField('contactPersonEmail', e.target.value)}
                                placeholder="john.doe@example.com"
                            />
                        </div>
                        <div>
                            <Label>Contact Person Phone</Label>
                            <Input
                                type="tel"
                                value={partner.contactPersonPhone || ''}
                                onChange={(e) => updateField('contactPersonPhone', e.target.value)}
                                placeholder="+351 123 456 789"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Additional Information</CardTitle>
                    <CardDescription>Optional details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Experience / Expertise</Label>
                        <Textarea
                            value={partner.experience || ''}
                            onChange={(e) => updateField('experience', e.target.value)}
                            placeholder="Describe the organization's relevant experience and expertise in the field..."
                            rows={9}
                            className="resize-y"
                        />
                    </div>

                    <div>
                        <Label>Staff Skills (Key Personnel)</Label>
                        <Textarea
                            value={partner.staffSkills || ''}
                            onChange={(e) => updateField('staffSkills', e.target.value)}
                            placeholder="Summarize the key personnel and their relevant technical/administrative skills..."
                            rows={6}
                            className="resize-y"
                        />
                    </div>

                    <div>
                        <Label>Relevant Previous Projects</Label>
                        <Textarea
                            value={partner.relevantProjects || ''}
                            onChange={(e) => updateField('relevantProjects', e.target.value)}
                            placeholder="Provide a list or description of similar projects previously implemented..."
                            rows={6}
                            className="resize-y"
                        />
                    </div>

                    <div>
                        <Label>Keywords (comma-separated)</Label>
                        <Input
                            value={partner.keywords?.join(', ') || ''}
                            onChange={(e) => updateField('keywords', e.target.value.split(',').map(k => k.trim()))}
                            placeholder="AI, sustainability, innovation"
                        />
                    </div>
                </CardContent>
            </Card>

            {!isNew && partnerId && (
                <Card>
                    <CardHeader>
                        <CardTitle>Files & Assets</CardTitle>
                        <CardDescription>Upload partner logo and relevant documents</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Logo Upload */}
                            <div className="space-y-2">
                                <Label>Partner Logo</Label>
                                <div className="flex items-center gap-4">
                                    {partner.logoUrl ? (
                                        <div className="relative w-24 h-24 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center p-2">
                                            <img
                                                src={partner.logoUrl}
                                                alt="Partner Logo"
                                                className="w-full h-full object-contain"
                                            />
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-xl flex items-center justify-center p-0 hover:scale-110 transition-transform bg-red-600 hover:bg-red-700 border-2 border-white"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteClick('logo');
                                                }}
                                                title="Remove Logo"
                                            >
                                                <Trash2 className="h-4 w-4 text-white" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="w-24 h-24 bg-white/5 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-muted-foreground">
                                            <Building2 className="h-8 w-8 opacity-50" />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            id="logo-upload"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                const formData = new FormData();
                                                formData.append('file', file);

                                                try {
                                                    const response = await fetch(`${serverUrl}/partners/${partnerId}/upload-logo`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Authorization': `Bearer ${publicAnonKey}`,
                                                        },
                                                        body: formData,
                                                    });

                                                    if (!response.ok) throw new Error('Upload failed');

                                                    const { url } = await response.json();
                                                    updateField('logoUrl', url);
                                                    toast.success('Logo uploaded');
                                                } catch (error) {
                                                    toast.error('Failed to upload logo');
                                                }
                                            }}
                                        />
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => document.getElementById('logo-upload')?.click()}
                                        >
                                            <Upload className="h-4 w-4 mr-2" />
                                            Upload Logo
                                        </Button>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Recommended: Square PNG or JPG, max 2MB
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* PDF Upload */}
                            <div className="space-y-2">
                                <Label>Partner Profile (PDF)</Label>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    {partner.pdfUrl ? (
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 text-sm text-primary">
                                                <Globe className="h-4 w-4" />
                                                <a href={partner.pdfUrl} target="_blank" rel="noopener noreferrer" className="hover:underline line-clamp-1">
                                                    View Uploaded PDF
                                                </a>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-xl flex items-center justify-center p-0 hover:scale-110 transition-transform bg-red-600 hover:bg-red-700 border-2 border-white"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteClick('pdf');
                                                }}
                                                title="Remove PDF"
                                            >
                                                <Trash2 className="h-4 w-4 text-white" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground mb-4 text-center py-2">
                                            No PDF uploaded yet
                                        </div>
                                    )}

                                    <Input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        id="partner-edit-pdf-upload"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;

                                            const formData = new FormData();
                                            formData.append('file', file);

                                            try {
                                                const response = await fetch(`${serverUrl}/partners/${partnerId}/upload-pdf`, {
                                                    method: 'POST',
                                                    headers: {
                                                        'Authorization': `Bearer ${publicAnonKey}`,
                                                    },
                                                    body: formData,
                                                });

                                                if (!response.ok) throw new Error('Upload failed');

                                                const { url } = await response.json();
                                                updateField('pdfUrl', url);
                                                toast.success('PDF uploaded');
                                            } catch (error) {
                                                toast.error('Failed to upload PDF');
                                            }
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => document.getElementById('partner-edit-pdf-upload')?.click()}
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        {partner.pdfUrl ? 'Replace PDF' : 'Upload PDF'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onBack}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={saving || !partner.name?.trim()}
                    className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
                >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    {isNew ? 'Create Partner' : 'Save Changes'}
                </Button>
            </div>

            <DeleteConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onConfirm={handleDeleteConfirm}
                title={`Delete ${deleteTarget === 'logo' ? 'Logo' : 'PDF'}`}
                description={`Are you sure you want to delete the partner ${deleteTarget === 'logo' ? 'logo' : 'profile PDF'}? This action cannot be undone.`}
            />
        </div>
    );
}