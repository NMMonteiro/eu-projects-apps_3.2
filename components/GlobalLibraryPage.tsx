import React, { useState, useEffect } from 'react';
import {
    Book,
    Upload,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    FileText,
    Search,
    ShieldCheck,
    Cpu
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { functionsUrl, publicAnonKey } from '../utils/supabase/info';

export function GlobalLibraryPage() {
    const [knowledge, setKnowledge] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadKnowledge();
    }, []);

    const loadKnowledge = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('global_knowledge')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setKnowledge(data || []);
        } catch (error: any) {
            toast.error('Failed to load library knowledge');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        toast.info('Scanning storage for new guidelines...');

        try {
            // 1. List files in the bucket
            const { data: files, error: listError } = await supabase.storage.from('global-library').list();
            if (listError) throw listError;

            if (!files || files.length === 0) {
                toast.error('No PDF files found in the "global-library" bucket.');
                return;
            }

            toast.info(`Found ${files.length} files. Starting deep analysis with Gemini 2.0...`);

            // 2. Index each file
            let totalChunks = 0;
            for (const file of files) {
                if (file.name === '.emptyFolderPlaceholder') continue;

                toast.loading(`Analyzing ${file.name}...`, { id: 'sync-progress' });

                const response = await fetch(`${functionsUrl}/index-knowledge`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'apikey': publicAnonKey
                    },
                    body: JSON.stringify({
                        fileUrl: file.name,
                        sourceName: file.name.replace('.pdf', '')
                    })
                });

                const result = await response.json();
                if (result.success) {
                    totalChunks += result.count;
                }
            }

            toast.success(`Sync complete! Extracted ${totalChunks} intelligence chunks.`, { id: 'sync-progress' });
            await loadKnowledge();
        } catch (error: any) {
            console.error('Sync failed:', error);
            toast.error(`Sync failed: ${error.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const filteredKnowledge = knowledge.filter(k =>
        k.source_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        k.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Book className="w-8 h-8 text-blue-500" />
                        Global Knowledge Library
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Deep intelligence from EU Guidelines, Best Practices, and Quality Assessments.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={loadKnowledge}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={handleSync}
                        disabled={isSyncing}
                    >
                        {isSyncing ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Cpu className="w-4 h-4 mr-2" />
                        )}
                        Sync Intelligence
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-blue-500/5 border-blue-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                            Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Active</div>
                        <p className="text-xs text-muted-foreground mt-1">RAG Intelligence is currently linked to proposal generation.</p>
                    </CardContent>
                </Card>
                <Card className="bg-purple-500/5 border-purple-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4 text-purple-400" />
                            Knowledge Base
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{knowledge.length} Chunks</div>
                        <p className="text-xs text-muted-foreground mt-1">Extracted from multi-page EU guidelines.</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-500/5 border-green-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            Reliability
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">High</div>
                        <p className="text-xs text-muted-foreground mt-1">Using Gemini 2.0 Flash for deep document analysis.</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Library Content</CardTitle>
                            <CardDescription>Searchable index of expert criteria and best practices.</CardDescription>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search knowledge..."
                                className="pl-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-4">
                            {filteredKnowledge.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <Book className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                                    <p className="text-muted-foreground">No knowledge indexed yet.</p>
                                    <p className="text-xs text-muted-foreground mt-1">Index your Global Library folder to see results here.</p>
                                </div>
                            ) : (
                                filteredKnowledge.map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold text-blue-400 text-sm">
                                                {item.source_name}
                                            </h4>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 uppercase font-bold">
                                                {item.metadata?.type || 'Guideline'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 line-clamp-3">
                                            {item.content}
                                        </p>
                                        {item.metadata?.keywords && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {item.metadata.keywords.map((kw: string, i: number) => (
                                                    <span key={i} className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                                                        #{kw}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
