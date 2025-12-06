import React, { useState } from 'react'
import { supabase } from '../utils/supabase'
import { Upload, Loader2, Sparkles, Check, X, Pencil, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { ParsedTemplate, FundingSchemeSection } from '../types/funding-scheme'

export function FundingSchemeTemplateParser() {
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [parsing, setParsing] = useState(false)
    const [extractedTemplate, setExtractedTemplate] = useState<ParsedTemplate | null>(null)
    const [editingSections, setEditingSections] = useState<FundingSchemeSection[]>([])
    const [fundingSchemeName, setFundingSchemeName] = useState('')
    const [saving, setSaving] = useState(false)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            // Validate file type
            if (!selectedFile.name.match(/\.(pdf|docx?)$/i)) {
                toast.error('Please upload a PDF or DOCX file')
                return
            }

            // Validate file size (10MB max)
            if (selectedFile.size > 10 * 1024 * 1024) {
                toast.error('File size must be less than 10MB')
                return
            }

            setFile(selectedFile)
            setFundingSchemeName(selectedFile.name.replace(/\.(pdf|docx?)$/i, ''))
        }
    }

    const handleUploadAndParse = async () => {
        if (!file) return

        try {
            setUploading(true)
            setParsing(true)

            // 1. Upload file to Supabase Storage
            const fileName = `${Date.now()}_${file.name}`
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('funding-templates')
                .upload(`raw/${fileName}`, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) throw uploadError

            toast.success('File uploaded! AI is analyzing...')
            setUploading(false)

            // 2. Call AI parser Edge Function
            const { data: parseResult, error: parseError } = await supabase.functions.invoke(
                'parse-funding-template',
                {
                    body: {
                        fileUrl: uploadData.path,
                        fundingSchemeName: fundingSchemeName
                    }
                }
            )

            if (parseError) throw parseError
            if (!parseResult.success) throw new Error(parseResult.error)

            setExtractedTemplate(parseResult.template)
            setEditingSections(parseResult.template.sections)
            setFundingSchemeName(parseResult.template.fundingScheme)

            toast.success('Template extracted! Please review and edit.')
            setParsing(false)

        } catch (error: any) {
            console.error('Error:', error)
            toast.error(`Failed to parse template: ${error.message}`)
            setUploading(false)
            setParsing(false)
        }
    }

    const handleSaveTemplate = async () => {
        if (!extractedTemplate) return

        if (!fundingSchemeName.trim()) {
            toast.error('Please provide a funding scheme name')
            return
        }

        if (editingSections.length === 0) {
            toast.error('At least one section is required')
            return
        }

        try {
            setSaving(true)

            const { error } = await supabase
                .from('funding_schemes')
                .insert({
                    name: fundingSchemeName,
                    description: `Imported from ${file?.name || 'uploaded document'}`,
                    template_json: {
                        schemaVersion: '1.0',
                        sections: editingSections,
                        metadata: extractedTemplate.metadata
                    },
                    is_default: false,
                    is_active: true
                })

            if (error) {
                if (error.code === '23505') { // Unique constraint violation
                    throw new Error('A funding scheme with this name already exists')
                }
                throw error
            }

            toast.success('Funding scheme template saved!')

            // Reset form
            setFile(null)
            setExtractedTemplate(null)
            setEditingSections([])
            setFundingSchemeName('')

        } catch (error: any) {
            console.error('Error saving:', error)
            toast.error(`Failed to save template: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    const updateSection = (index: number, updates: Partial<FundingSchemeSection>) => {
        const updated = [...editingSections]
        updated[index] = { ...updated[index], ...updates }
        setEditingSections(updated)
    }

    const removeSection = (index: number) => {
        const updated = editingSections.filter((_, i) => i !== index)
        // Re-number the order
        updated.forEach((section, i) => {
            section.order = i + 1
        })
        setEditingSections(updated)
    }

    const addSection = () => {
        const newSection: FundingSchemeSection = {
            key: `section_${editingSections.length + 1}`,
            label: `New Section ${editingSections.length + 1}`,
            mandatory: false,
            order: editingSections.length + 1,
            charLimit: null,
            wordLimit: null
        }
        setEditingSections([...editingSections, newSection])
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 p-6">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Import Funding Scheme Template
                </h1>
                <p className="text-gray-600 mt-2">
                    Upload PDF/DOCX application guidelines and let AI extract the structure automatically
                </p>
            </div>

            {/* File Upload */}
            {!extractedTemplate && (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors bg-gradient-to-br from-blue-50 to-purple-50">
                    <Upload className="h-16 w-16 mx-auto text-blue-500 mb-4" />
                    <input
                        type="file"
                        accept=".pdf,.docx,.doc"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                        disabled={uploading || parsing}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                        <span className="text-blue-600 font-semibold hover:underline text-lg">
                            Choose a file
                        </span>
                        <span className="text-gray-600"> or drag and drop</span>
                    </label>
                    <p className="text-sm text-gray-500 mt-3">
                        PDF, DOCX, or DOC up to 10MB
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                        Supported: Horizon Europe, Erasmus+, Creative Europe, and other EU funding schemes
                    </p>

                    {file && (
                        <div className="mt-6 p-4 bg-white border border-blue-200 rounded-lg inline-block shadow-sm">
                            <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-600 mt-1">
                                {(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown type'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Funding Scheme Name Input */}
            {file && !extractedTemplate && (
                <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                        Funding Scheme Name
                    </label>
                    <input
                        type="text"
                        value={fundingSchemeName}
                        onChange={(e) => setFundingSchemeName(e.target.value)}
                        placeholder="e.g., Horizon Europe - Research and Innovation Actions (RIA)"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            )}

            {/* Parse Button */}
            {file && !extractedTemplate && (
                <button
                    onClick={handleUploadAndParse}
                    disabled={uploading || parsing || !fundingSchemeName.trim()}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all"
                >
                    {parsing ? (
                        <>
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>AI is analyzing document...</span>
                        </>
                    ) : uploading ? (
                        <>
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span>Uploading...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-6 w-6" />
                            <span>Parse with AI</span>
                        </>
                    )}
                </button>
            )}

            {/* Extracted Template Review */}
            {extractedTemplate && (
                <div className="border border-gray-200 rounded-xl p-8 space-y-6 bg-white shadow-lg">
                    <div className="flex items-center justify-between pb-4 border-b">
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <Check className="h-7 w-7 text-green-600" />
                            <span>Review & Edit Template</span>
                        </h2>
                        <button
                            onClick={() => {
                                setExtractedTemplate(null)
                                setEditingSections([])
                                setFile(null)
                                setFundingSchemeName('')
                            }}
                            className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Scheme Name */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700">
                            Funding Scheme Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={fundingSchemeName}
                            onChange={(e) => setFundingSchemeName(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                            placeholder="e.g., Horizon Europe RIA 2024"
                        />
                    </div>

                    {/* Sections */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-900">
                                Sections ({editingSections.length})
                            </h3>
                            <button
                                onClick={addSection}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition font-medium"
                            >
                                <Plus className="h-4 w-4" />
                                Add Section
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                            {editingSections.map((section, idx) => (
                                <div key={idx} className="border border-gray-200 rounded-lg p-5 space-y-4 bg-gray-50 hover:bg-gray-100 transition">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 space-y-4">
                                            {/* Label and Key */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Label <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={section.label}
                                                        onChange={(e) => updateSection(idx, { label: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                        placeholder="e.g., 1. Objectives"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                                        Key (snake_case) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={section.key}
                                                        onChange={(e) => updateSection(idx, { key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                                                        placeholder="e.g., objectives"
                                                    />
                                                </div>
                                            </div>

                                            {/* Limits and Order */}
                                            <div className="grid grid-cols-4 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Char Limit</label>
                                                    <input
                                                        type="number"
                                                        value={section.charLimit || ''}
                                                        onChange={(e) => updateSection(idx, { charLimit: e.target.value ? parseInt(e.target.value) : null })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                        placeholder="None"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Word Limit</label>
                                                    <input
                                                        type="number"
                                                        value={section.wordLimit || ''}
                                                        onChange={(e) => updateSection(idx, { wordLimit: e.target.value ? parseInt(e.target.value) : null })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                        placeholder="None"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
                                                    <input
                                                        type="number"
                                                        value={section.order}
                                                        onChange={(e) => updateSection(idx, { order: parseInt(e.target.value) })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                        min="1"
                                                    />
                                                </div>
                                                <div className="flex items-end">
                                                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition w-full justify-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={section.mandatory}
                                                            onChange={(e) => updateSection(idx, { mandatory: e.target.checked })}
                                                            className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm font-medium text-gray-700">Required</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                                <textarea
                                                    value={section.description || ''}
                                                    onChange={(e) => updateSection(idx, { description: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                    rows={2}
                                                    placeholder="Helper text for users filling out this section..."
                                                />
                                            </div>
                                        </div>

                                        {/* Remove Button */}
                                        <button
                                            onClick={() => removeSection(idx)}
                                            className="mt-6 text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition"
                                            title="Remove section"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-6 border-t">
                        <button
                            onClick={handleSaveTemplate}
                            disabled={saving || !fundingSchemeName.trim() || editingSections.length === 0}
                            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <Check className="h-6 w-6" />
                                    <span>Save Funding Scheme Template</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
