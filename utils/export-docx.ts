import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  ImageRun,
  Header,
  Footer,
  ExternalHyperlink,
  VerticalAlign,
  ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import { FullProposal } from "../types/proposal";

// ============================================================================
// STYLING CONSTANTS (EU PROFESSIONAL STYLE)
// ============================================================================
const COLOR_PRIMARY = "003399"; // EU Blue
const COLOR_SECONDARY = "444444";
const COLOR_TABLE_HEADER = "F2F2F2";
const FONT = "Arial";
const BODY_SIZE = 22; // 11pt
const H1_SIZE = 32;   // 16pt
const H2_SIZE = 28;   // 14pt

// ============================================================================
// HELPERS
// ============================================================================

function createParagraph(text: string, options: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: text || "",
        bold: options.bold,
        color: options.color,
        size: options.size || BODY_SIZE,
        font: FONT,
        italics: options.italic,
      }),
    ],
    spacing: { before: 120, after: 120 },
  });
}

/**
 * Creates a paragraph with bolding for "Key: Value" patterns.
 */
function createSmartParagraph(text: string, options: { bullet?: number } = {}): Paragraph {
  const colonIndex = text.indexOf(':');
  // Only bold if colon is not at start/end and seems like a label
  if (colonIndex > 0 && colonIndex < 60 && colonIndex < text.length - 1) {
    const key = text.substring(0, colonIndex + 1);
    const value = text.substring(colonIndex + 1);
    return new Paragraph({
      children: [
        new TextRun({ text: key, bold: true, font: FONT, size: BODY_SIZE }),
        new TextRun({ text: value, font: FONT, size: BODY_SIZE }),
      ],
      spacing: { before: 100, after: 100 },
      bullet: options.bullet !== undefined ? { level: options.bullet } : undefined,
    });
  }
  return new Paragraph({
    children: [
      new TextRun({ text, font: FONT, size: BODY_SIZE }),
    ],
    spacing: { before: 120, after: 120 },
    bullet: options.bullet !== undefined ? { level: options.bullet } : undefined,
  });
}

function createSectionHeader(text: string, level: number = 1): Paragraph {
  const size = level === 1 ? H1_SIZE : H2_SIZE;
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size,
        font: FONT,
        color: COLOR_PRIMARY,
      }),
    ],
    spacing: { before: 400, after: 200 },
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    border: level === 1 ? {
      bottom: { color: COLOR_PRIMARY, space: 1, style: BorderStyle.SINGLE, size: 6 }
    } : undefined,
  });
}

function createStyledTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    },
  });
}

function createTableHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, font: FONT })],
      alignment: AlignmentType.CENTER
    })],
    shading: { fill: COLOR_TABLE_HEADER, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
  });
}

function parseSmartParagraphs(text: string): Paragraph[] {
  if (!text) return [];
  // Fix squashed text: e.g. "RPGProject Title:" -> "RPG\nProject Title:"
  // Looks for boundary where a value ends (lower/digit/bracket) and next Key starts (Upper...:)
  const processed = text.replace(/([a-z0-9\]\)])(?=[A-Z][a-zA-Z\s\-\/\(\)]{2,40}:)/g, "$1\n");

  const lines = processed.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => createSmartParagraph(line));
}

function convertToTableStyle(text: string): (Paragraph | Table)[] {
  const processed = text.replace(/([a-z0-9\]\)])(?=[A-Z][a-zA-Z\s\-\/\(\)]{2,40}:)/g, "$1\n");
  const lines = processed.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const rows: TableRow[] = [];

  lines.forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < 45) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: key, bold: true, font: FONT, size: 20 })],
              spacing: { before: 80, after: 80 }
            })],
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: "F9F9F9" }
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: value, font: FONT, size: 20 })],
              spacing: { before: 80, after: 80 }
            })],
            width: { size: 65, type: WidthType.PERCENTAGE }
          })
        ]
      }));
    } else {
      // Header or note row
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: line, bold: true, font: FONT, size: 20, color: COLOR_PRIMARY })],
              spacing: { before: 100, after: 100 }
            })],
            columnSpan: 2,
            shading: { fill: COLOR_TABLE_HEADER }
          })
        ]
      }));
    }
  });

  return [createStyledTable(rows)];
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Image fetch failed:', error);
    return null;
  }
}

function convertHtmlToParagraphs(html: string | undefined | null, sectionTitle?: string): (Paragraph | Table)[] {
  if (!html) return [createParagraph("")];
  const cleanHtml = html.replace(/\s*\(dd\/mm\/yyyy\)/g, "");

  // Specific handling for Annexes or sections that look like data lists
  if (sectionTitle?.toLowerCase().includes("annexe") || sectionTitle?.toLowerCase().includes("context")) {
    return convertToTableStyle(cleanHtml);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${cleanHtml}</body>`, 'text/html');
    const items: (Paragraph | Table)[] = [];

    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeType === 3) {
        const text = node.textContent?.trim();
        if (text) items.push(...parseSmartParagraphs(text));
      } else if (node.nodeType === 1) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toUpperCase();

        if (['H1', 'H2', 'H3'].includes(tagName)) {
          items.push(createSectionHeader(el.innerText, tagName === 'H1' ? 1 : 2));
        } else if (tagName === 'P') {
          // Check if the paragraph text contains multiple Key:Value patterns squashed
          const text = el.innerText;
          if (text.split(':').length > 2) {
            items.push(...parseSmartParagraphs(text));
          } else {
            items.push(createSmartParagraph(text));
          }
        } else if (tagName === 'UL' || tagName === 'OL') {
          Array.from(el.children).forEach(li => {
            if (li.tagName === 'LI') {
              items.push(createSmartParagraph((li as HTMLElement).innerText, { bullet: 0 }));
            }
          });
        } else {
          const text = el.innerText?.trim();
          if (text) items.push(...parseSmartParagraphs(text));
        }
      }
    });
    return items.length > 0 ? items : parseSmartParagraphs(cleanHtml.replace(/<[^>]*>?/gm, ""));
  } catch (e) {
    return parseSmartParagraphs((cleanHtml || "").replace(/<[^>]*>?/gm, ""));
  }
}

// ============================================================================
// GENERATOR
// ============================================================================

export async function generateDocx(proposal: FullProposal): Promise<{ blob: Blob; fileName: string }> {
  try {
    const docChildren: (Paragraph | Table)[] = [];
    const p = proposal;

    // 1. TITLE PAGE
    docChildren.push(new Paragraph({ spacing: { before: 2000 } }));

    // Logo
    const fScheme = p.fundingScheme || (p as any).funding_scheme;
    if (fScheme?.logo_url) {
      const logo = await fetchImageAsBase64(fScheme.logo_url);
      if (logo) {
        docChildren.push(new Paragraph({
          children: [new ImageRun({
            data: Uint8Array.from(atob(logo), c => c.charCodeAt(0)),
            transformation: { width: 140, height: 140 },
            type: "png"
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 }
        }));
      }
    }

    // Title & Acronym Table
    docChildren.push(
      createStyledTable([
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: "PROJECT PROPOSAL", bold: true, color: COLOR_PRIMARY, size: 28, font: FONT })],
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  children: [new TextRun({ text: p.title || "Untitled Proposal", bold: true, size: 48, font: FONT })],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 400, after: 400 }
                }),
                new Paragraph({
                  children: [new TextRun({ text: fScheme?.name ? `Call for Proposal: ${fScheme.name}` : "H2020 / Horizon Europe Style", italics: true, color: "666666", font: FONT })],
                  alignment: AlignmentType.CENTER,
                })
              ],
              shading: { fill: "F9F9F9" },
              margins: { top: 400, bottom: 400, left: 400, right: 400 }
            })
          ]
        })
      ])
    );

    docChildren.push(new Paragraph({ children: [new PageBreak()] }));

    // 2. EXECUTIVE SUMMARY
    docChildren.push(createSectionHeader("Part B: Technical Narrative", 1));
    docChildren.push(createSectionHeader("0. Executive Summary", 2));
    docChildren.push(...convertHtmlToParagraphs(p.summary, "Executive Summary"));

    // 3. DYNAMIC NARRATIVE SECTIONS
    const dyn = p.dynamicSections || (p as any).dynamic_sections;
    if (dyn && Object.keys(dyn).length > 0) {
      Object.entries(dyn).forEach(([key, content], idx) => {
        const title = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        docChildren.push(createSectionHeader(`${idx + 1}. ${title}`, 2));
        docChildren.push(...convertHtmlToParagraphs(content as string, title));
      });
    } else {
      // Legacy Fallback
      ["relevance", "methods", "impact"].forEach((k, idx) => {
        if ((p as any)[k]) {
          const title = k.toUpperCase();
          docChildren.push(createSectionHeader(`${idx + 1}. ${title}`, 2));
          docChildren.push(...convertHtmlToParagraphs((p as any)[k], title));
        }
      });
    }

    docChildren.push(new Paragraph({ children: [new PageBreak()] }));

    // 4. STRUCTURED DATA: PARTNERS
    if (p.partners && p.partners.length > 0) {
      docChildren.push(createSectionHeader("Part C: Consortium and Resources", 1));
      docChildren.push(createSectionHeader("Consortium Partners", 2));

      const partnerRows = [
        new TableRow({
          children: [
            createTableHeaderCell("No."),
            createTableHeaderCell("Partner Name"),
            createTableHeaderCell("Country"),
            createTableHeaderCell("Role"),
          ]
        }),
        ...p.partners.map((pt, i) => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (i + 1).toString(), font: FONT })], alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pt.name, bold: true, font: FONT })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pt.country || "-", font: FONT })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pt.role || "-", font: FONT })] })] }),
          ]
        }))
      ];
      docChildren.push(createStyledTable(partnerRows));
      docChildren.push(new Paragraph({ text: "" })); // Spacer
    }

    // 5. STRUCTURED DATA: BUDGET
    if (p.budget && p.budget.length > 0) {
      docChildren.push(createSectionHeader("Project Budget Breakdown", 2));
      const currency = p.settings?.currency || "EUR";

      const budgetRows = [
        new TableRow({
          children: [
            createTableHeaderCell("Resource Item"),
            createTableHeaderCell("Description"),
            createTableHeaderCell(`Cost (${currency})`),
          ]
        }),
        ...p.budget.map(item => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.item, bold: true, font: FONT })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.description || "-", font: FONT })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.cost.toLocaleString(), font: FONT })], alignment: AlignmentType.RIGHT })] }),
          ]
        }))
      ];
      docChildren.push(createStyledTable(budgetRows));
    }

    // DOCUMENT ASSEMBLY with Header/Footer and Default Styles
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: FONT,
              size: BODY_SIZE,
            },
          },
        },
      },
      sections: [{
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "PROPOSAL: ", bold: true, color: COLOR_PRIMARY, font: FONT }),
                  new TextRun({ text: p.title || "CONFIDENTIAL", color: COLOR_SECONDARY, font: FONT }),
                ],
                border: { bottom: { color: "DDDDDD", space: 4, style: BorderStyle.SINGLE, size: 1 } }
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Generated by EU Proposal Tool", italics: true, size: 18, font: FONT }),
                  new TextRun({ text: " | Page ", font: FONT }),
                  new TextRun({ children: ["PAGE_NUMBER"], color: COLOR_PRIMARY, bold: true, font: FONT }),
                  new TextRun({ text: " of ", font: FONT }),
                  new TextRun({ children: ["NUM_PAGES"], font: FONT }),
                ],
                alignment: AlignmentType.RIGHT,
                border: { top: { color: "DDDDDD", space: 4, style: BorderStyle.SINGLE, size: 1 } }
              })
            ]
          })
        },
        children: docChildren,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = `${(p.title || "proposal").replace(/[^a-z0-9]/gi, "_")}_EU_Proposal.docx`;
    return { blob, fileName };

  } catch (err) {
    console.error("DOCX ERROR:", err);
    throw err;
  }
}

export async function exportToDocx(proposal: FullProposal): Promise<void> {
  try {
    const { blob, fileName } = await generateDocx(proposal);
    saveAs(blob, fileName);
  } catch (error) {
    console.error("EXPORT FAILED", error);
    alert("Professional Export failed: " + (error as Error).message);
  }
}

