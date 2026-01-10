import React, { useState, useEffect } from 'react';
import { Building2, Globe, CheckCircle2, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Partner } from '../types/partner';

// Helper to transform wide tables into responsive card lists
export function transformWideTables(html: string): string {
    if (!html || typeof window === 'undefined') return html;
    if (!html.includes('<table')) return html;

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tables = doc.querySelectorAll('table');
        let modified = false;

        tables.forEach(table => {
            const rows = Array.from(table.rows);
            if (rows.length === 0) return;

            let headers: string[] = [];
            const thead = table.querySelector('thead');
            if (thead && thead.rows.length > 0) {
                headers = Array.from(thead.rows[0].cells).map(c => c.textContent?.trim() || "");
            } else {
                headers = Array.from(rows[0].cells).map(c => c.textContent?.trim() || "");
            }

            const colCount = headers.length;
            if (colCount <= 4) return; // Only transform wide tables

            modified = true;
            const container = doc.createElement('div');
            container.className = "space-y-4 my-6 not-prose"; // not-prose to escape typography styles

            const dataRows = Array.from(table.querySelectorAll('tr')).filter(tr =>
                !tr.parentElement || tr.parentElement.tagName !== 'THEAD'
            );

            // Check if headers matched first data row
            if (!thead && dataRows.length > 0 && headers.join('|') === Array.from(dataRows[0].cells).map(c => c.textContent?.trim() || "").join('|')) {
                dataRows.shift();
            }

            dataRows.forEach((tr, idx) => {
                const cells = Array.from(tr.cells);
                const title = cells[0]?.textContent?.trim() || `Item ${idx + 1}`;

                const card = doc.createElement('div');
                card.className = "bg-card/50 border border-border/60 rounded-lg p-4 shadow-sm";

                const headerDiv = doc.createElement('div');
                headerDiv.className = "font-semibold text-base mb-3 text-primary border-b border-border/40 pb-2";
                headerDiv.textContent = title;
                card.appendChild(headerDiv);

                const contentGrid = doc.createElement('div');
                contentGrid.className = "grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

                cells.forEach((cell, cIdx) => {
                    if (cIdx === 0) return;

                    const label = headers[cIdx] || `Column ${cIdx + 1}`;
                    const value = cell.innerHTML.trim();
                    if (!value) return;

                    const fieldDiv = doc.createElement('div');
                    fieldDiv.className = "flex flex-col text-sm";

                    const labelSpan = doc.createElement('span');
                    labelSpan.className = "font-medium text-muted-foreground text-[10px] uppercase tracking-wider mb-1";
                    labelSpan.textContent = label;

                    const valueDiv = doc.createElement('div');
                    valueDiv.className = "text-foreground/90 text-xs break-words";
                    valueDiv.innerHTML = value;

                    fieldDiv.appendChild(labelSpan);
                    fieldDiv.appendChild(valueDiv);
                    contentGrid.appendChild(fieldDiv);
                });
                card.appendChild(contentGrid);
                container.appendChild(card);
            });

            table.replaceWith(container);
        });

        if (modified) return doc.body.innerHTML;
        return html;
    } catch (e) {
        console.error("Error transforming tables", e);
        return html;
    }
}

export const ResponsiveSectionContent = ({ content }: { content: string }) => {
    const [processed, setProcessed] = useState(content);
    useEffect(() => {
        setProcessed(transformWideTables(content));
    }, [content]);
    return <div dangerouslySetInnerHTML={{ __html: processed }} />;
};

export const DynamicWorkPackageSection = ({ workPackages, limitToIndex, currency }: { workPackages: any[], limitToIndex?: number, currency: string }) => {
    if (!workPackages || workPackages.length === 0) {
        return <div className="p-4 text-center text-muted-foreground italic border border-dashed rounded-lg">No work packages defined yet.</div>;
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const displayWPs = limitToIndex !== undefined ? [workPackages[limitToIndex]].filter(Boolean) : workPackages;

    if (displayWPs.length === 0) return null;

    return (
        <div className="space-y-6">
            {displayWPs.map((wp, i) => {
                const actualIndex = limitToIndex !== undefined ? limitToIndex : i;
                const wpBudget = (wp.activities || []).reduce((sum: number, act: any) => sum + (act.estimatedBudget || 0), 0);

                return (
                    <Card key={actualIndex} className="bg-card/30 border-border/40">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <Badge variant="outline" className="mb-2 border-primary/30 text-primary">WP {actualIndex + 1}</Badge>
                                    <CardTitle className="text-lg">{wp.name}</CardTitle>
                                </div>
                                {wpBudget > 0 && (
                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                        {formatCurrency(wpBudget)}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: wp.description }} />
                            {wp.activities && wp.activities.length > 0 && (
                                <div className="mt-6 space-y-4">
                                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-3 flex items-center gap-2">
                                        <Layers className="w-3 h-3" /> Activities & Tasks
                                    </h5>
                                    <div className="grid gap-3">
                                        {wp.activities.map((act: any, aIdx: number) => (
                                            <div key={aIdx} className="bg-slate-50/80 border border-slate-100 rounded-lg p-4 text-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-bold text-slate-800">
                                                        {actualIndex + 1}.{aIdx + 1} {act.name}
                                                    </span>
                                                    {act.estimatedBudget > 0 && (
                                                        <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-500">
                                                            {formatCurrency(act.estimatedBudget)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-slate-600 leading-relaxed text-xs" dangerouslySetInnerHTML={{ __html: act.description }} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {wp.deliverables && wp.deliverables.length > 0 && (
                                <div className="bg-secondary/20 rounded-lg p-4 mt-6">
                                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-3">Expected Deliverables</h5>
                                    <ul className="space-y-2">
                                        {wp.deliverables.map((del: string, dIdx: number) => (
                                            <li key={dIdx} className="flex items-start gap-2 text-xs">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                                <span className="text-slate-600">{del}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};

export const DynamicBudgetSection = ({ budget, currency }: { budget: any[], currency: string }) => {
    if (!budget || budget.length === 0) return null;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const total = budget.reduce((sum, item) => sum + (item.cost || 0), 0);

    return (
        <div className="space-y-4">
            <div className="border rounded-xl overflow-hidden border-border/40 bg-card/20">
                <table className="w-full text-sm border-collapse">
                    <thead className="bg-secondary/40">
                        <tr className="border-b border-border/40">
                            <th className="text-left py-3 px-4 font-semibold text-foreground/70 w-1/2">Item & Description</th>
                            <th className="text-right py-3 px-4 font-semibold text-foreground/70">Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {budget.map((item, i) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                <td className="py-3 px-4">
                                    <div className="font-medium text-foreground/90">{item.item}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-primary/90">
                                    {formatCurrency(item.cost)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-primary/5">
                        <tr className="font-bold border-t border-primary/20">
                            <td className="py-3 px-4 text-foreground/90">Total Estimated Budget</td>
                            <td className="py-3 px-4 text-right font-mono text-primary">
                                {formatCurrency(total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export const DynamicRiskSection = ({ risks }: { risks: any[] }) => {
    if (!risks || risks.length === 0) return null;
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {risks.map((risk, i) => (
                <Card key={i} className="bg-card/30 border-border/40 hover:border-primary/20 transition-all">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-sm font-bold text-foreground/90">{risk.risk}</CardTitle>
                            <Badge variant={risk.impact?.toLowerCase().includes('high') ? 'destructive' : 'secondary'} className="text-[9px] uppercase">
                                {risk.impact} Impact
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Likelihood:</span>
                            <span className="font-medium">{risk.likelihood}</span>
                        </div>
                        <div className="pt-2 border-t border-border/20">
                            <span className="text-[10px] uppercase font-bold text-primary/70 block mb-1">Mitigation Strategy</span>
                            <p className="text-xs text-muted-foreground leading-relaxed italic">"{risk.mitigation}"</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};

export const DynamicPartnerSection = ({ partners }: { partners: Partner[] }) => {
    if (!partners || partners.length === 0) {
        return <div className="p-4 text-center text-muted-foreground italic border border-dashed rounded-lg">No partners added yet. Please add partners in the 'Structured Data' tab to populate this section.</div>;
    }
    return (
        <div className="space-y-6">
            {partners.map((p, i) => (
                <Card key={i} className="bg-card/50 border-border/60">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-primary flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 opacity-70" />
                                {p.name}
                            </div>
                            {p.isCoordinator && <Badge className="bg-primary/20 text-primary border-primary/30">Coordinator</Badge>}
                        </CardTitle>
                        {p.country && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Globe className="h-3 w-3" />
                                {p.country} {p.city ? `(${p.city})` : ''}
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm mt-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-secondary/20 p-4 rounded-xl border border-border/40">
                            {p.organisationId && (
                                <div className="flex flex-col">
                                    <span className="font-bold text-[10px] uppercase text-primary/70 tracking-wider">OID / PIC</span>
                                    <span className="font-mono text-xs">{p.organisationId}</span>
                                </div>
                            )}
                            {p.organizationType && (
                                <div className="flex flex-col">
                                    <span className="font-bold text-[10px] uppercase text-primary/70 tracking-wider">Type</span>
                                    <span className="text-xs">{p.organizationType}</span>
                                </div>
                            )}
                            {p.vatNumber && (
                                <div className="flex flex-col">
                                    <span className="font-bold text-[10px] uppercase text-primary/70 tracking-wider">VAT</span>
                                    <span className="font-mono text-xs">{p.vatNumber}</span>
                                </div>
                            )}
                        </div>

                        {p.description && (
                            <div className="prose prose-invert prose-sm max-w-none text-muted-foreground/90 bg-black/10 p-4 rounded-lg border border-border/20">
                                <p>{p.description}</p>
                            </div>
                        )}

                        {p.experience && (
                            <div>
                                <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2">Relevant Expertise</h5>
                                <div className="text-sm text-muted-foreground/90 bg-secondary/10 p-3 rounded-lg border border-border/20 italic">
                                    {p.experience}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
