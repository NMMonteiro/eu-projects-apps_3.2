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
  convertInchesToTwip,
} from "docx";
import { saveAs } from "file-saver";
import { FullProposal } from "../types/proposal";

// ============================================================================
// HELPER FUNCTIONS FOR CONSISTENT STYLING
// ============================================================================

const HEADER_SIZE = 28;
const SUBHEADER_SIZE = 24;
const BODY_SIZE = 22;
const FONT = "Arial";

/**
 * Creates a section header (H1)
 */
function createSectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: HEADER_SIZE,
        font: FONT,
        color: "1F4788",
      }),
    ],
    spacing: { before: 400, after: 200 },
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
  });
}

/**
 * Creates a subsection header (H2)
 */
function createSubHeader(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: SUBHEADER_SIZE,
        font: FONT,
        color: "2E5C8A",
      }),
    ],
    spacing: { before: 300, after: 150 },
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
  });
}

/**
 * Creates a regular paragraph
 */
function createParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: BODY_SIZE,
        font: FONT,
      }),
    ],
    spacing: { before: 100, after: 100 },
  });
}

/**
 * Converts HTML content to paragraphs
 * Strips HTML tags and splits by line breaks
 */
// Helper to recursively parse DOM nodes into TextRuns
function parseNodesToTextRuns(node: Node, formatting: { bold?: boolean; italics?: boolean; color?: string } = {}): TextRun[] {
  const runs: TextRun[] = [];

  if (!node.childNodes || node.childNodes.length === 0) {
    // Text node or empty element
    if (node.nodeType === 3 && node.textContent) { // Node.TEXT_NODE
      runs.push(new TextRun({
        text: node.textContent,
        bold: formatting.bold,
        italics: formatting.italics,
        size: BODY_SIZE,
        font: FONT,
        color: formatting.color
      }));
    }
    return runs;
  }

  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 3) { // Text Node
      if (child.textContent) {
        runs.push(new TextRun({
          text: child.textContent,
          bold: formatting.bold,
          italics: formatting.italics,
          size: BODY_SIZE,
          font: FONT,
          color: formatting.color
        }));
      }
    } else if (child.nodeType === 1) { // Element Node
      const el = child as HTMLElement;
      const tagName = el.tagName.toUpperCase();

      if (tagName === 'BR') {
        runs.push(new TextRun({ break: 1 }));
      } else {
        let newFormatting = { ...formatting };
        if (['B', 'STRONG'].includes(tagName)) newFormatting.bold = true;
        if (['I', 'EM'].includes(tagName)) newFormatting.italics = true;
        // Heuristic: If it looks like a header inside a paragraph?

        runs.push(...parseNodesToTextRuns(child, newFormatting));
      }
    }
  });

  return runs;
}

/**
 * Converts HTML content to paragraphs preserving formatting
 */
function convertHtmlToParagraphs(html: string | undefined | null): (Paragraph | Table)[] {
  if (!html) return [createParagraph("")];

  try {
    const parser = new DOMParser();
    // Wrap in body to ensure valid parsing structure
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
    const paragraphs: (Paragraph | Table)[] = [];

    Array.from(doc.body.childNodes).forEach(node => {
      if (node.nodeType === 3) { // Text at root
        const text = node.textContent?.trim();
        if (text) paragraphs.push(createParagraph(text));
      } else if (node.nodeType === 1) { // Element
        const el = node as HTMLElement;
        const tagName = el.tagName.toUpperCase();

        if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
          let level = HeadingLevel.HEADING_3; // Default map for content
          if (tagName === 'H1') level = HeadingLevel.HEADING_2; // Demote H1 to H2 to fit doc structure
          if (tagName === 'H2') level = HeadingLevel.HEADING_3;

          paragraphs.push(new Paragraph({
            text: el.innerText,
            heading: level,
            spacing: { before: 200, after: 100 }
          }));
        } else if (tagName === 'P') {
          // Paragraph with potential inner formatting
          const runs = parseNodesToTextRuns(el);
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({
              children: runs,
              spacing: { before: 100, after: 100 }
            }));
          }
        } else if (tagName === 'UL' || tagName === 'OL') {
          Array.from(el.children).forEach(li => {
            if (li.tagName === 'LI') {
              const listItemText = (li as HTMLElement).innerText; // handling nested? keep simple for now
              // Check for inner HTML in LI?
              const runs = parseNodesToTextRuns(li);
              paragraphs.push(new Paragraph({
                children: runs,
                bullet: { level: 0 }, // Basic bullet
                spacing: { before: 50, after: 50 }
              }));
            }
          });
        } else if (tagName === 'TABLE') {
          const rows: string[][] = [];
          let headers: string[] = [];

          // Extract headers
          const thead = el.querySelector('thead');
          if (thead) {
            const headerRow = thead.querySelector('tr');
            if (headerRow) {
              headers = Array.from(headerRow.querySelectorAll('th, td')).map(c => (c as HTMLElement).innerText?.trim() || "");
            }
          }

          // Extract rows
          const trs = el.querySelectorAll('tr');
          Array.from(trs).forEach(tr => {
            if (tr.parentElement?.tagName === 'THEAD') return;
            const cells = Array.from(tr.querySelectorAll('td, th')).map(c => (c as HTMLElement).innerText?.trim() || "");
            if (cells.length > 0) rows.push(cells);
          });

          // If no specific header found but we have rows, maybe first row is header?
          if (headers.length === 0 && rows.length > 0) {
            headers = rows[0];
            rows.shift(); // Remove header from data
          }

          const colCount = Math.max(headers.length, rows[0]?.length || 0);

          // TRANSFORM LOGIC: If table is too wide (> 4 columns), convert to List format
          if (colCount > 4) {
            rows.forEach((row, rIdx) => {
              // formatting:
              // ### Row Title (First cell)
              // Label: Value
              // Label: Value

              const title = row[0] || `Item ${rIdx + 1}`;
              paragraphs.push(new Paragraph({
                children: [new TextRun({
                  text: title,
                  bold: true,
                  size: SUBHEADER_SIZE,
                  color: "2E5C8A",
                  font: FONT
                })],
                spacing: { before: 240, after: 120 },
                border: { bottom: { color: "CCCCCC", space: 1, value: "single", size: 6 } }
              }));

              row.forEach((cell, cIdx) => {
                if (cIdx === 0) return; // Skip title, already used

                const label = headers[cIdx] || `Column ${cIdx + 1}`;
                // Only show if cell has content
                if (cell) {
                  paragraphs.push(new Paragraph({
                    children: [
                      new TextRun({
                        text: `${label}: `,
                        bold: true,
                        size: 20,
                        font: FONT
                      }),
                      new TextRun({
                        text: cell,
                        size: 20,
                        font: FONT
                      })
                    ],
                    spacing: { after: 60 }, // Tight spacing
                    indent: { left: 360 } // Indent data
                  }));
                }
              });

              // Add specific spacing between items
              paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
            });
          } else {
            // Standard Table Rendering
            if (headers.length > 0) {
              paragraphs.push(createTable(headers, rows));
            }
          }
        } else { // Divs etc. Treat as paragraph
          const text = el.innerText?.trim();
          if (text) {
            const runs = parseNodesToTextRuns(el);
            paragraphs.push(new Paragraph({
              children: runs,
              spacing: { before: 100, after: 100 }
            }));
          }
        }
      }
    });

    return paragraphs;

  } catch (e) {
    console.warn("DOMParser failed, falling back to simple text strip", e);
    // Fallback
    let cleanText = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>?/gm, "")
      .trim();
    return cleanText.split(/\n+/).map(line => createParagraph(line.trim()));
  }
}

/**
 * Creates a page break
 */
function createPageBreak(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()],
  });
}

/**
 * Fetches an image from a URL and converts it to base64
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

/**
 * Creates a table with header row
 */
function createTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    children: headers.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: header,
                  bold: true,
                  size: BODY_SIZE,
                  font: FONT,
                }),
              ],
            }),
          ],
          shading: { fill: "E7E6E6" },
        })
    ),
  });

  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [createParagraph(cell)],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    rows: [headerRow, ...dataRows],
  });
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Generates a DOCX document from proposal data
 */
export async function generateDocx(
  proposal: FullProposal
): Promise<{ blob: Blob; fileName: string }> {
  const docChildren: (Paragraph | Table)[] = [];

  // ============================================================================
  // TITLE PAGE - Vertically centered with prominent logo
  // ============================================================================

  // Add top spacing to center content vertically (approximately 1/4 page)
  docChildren.push(
    new Paragraph({
      children: [new TextRun({ text: "" })],
      spacing: { before: 2000 }, // Large top margin for vertical centering
    })
  );

  if (proposal.funding_scheme?.logo_url) {
    console.log("Attempting to load logo from:", proposal.funding_scheme.logo_url);
    try {
      const logoBase64 = await fetchImageAsBase64(proposal.funding_scheme.logo_url);
      if (logoBase64) {
        console.log("Logo loaded successfully, base64 length:", logoBase64.length);
        docChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: Uint8Array.from(atob(logoBase64), c => c.charCodeAt(0)),
                transformation: {
                  width: 200,  // Increased from 100 to 200
                  height: 200, // Increased from 100 to 200
                },
                type: "png",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 600 }, // More spacing around logo
          })
        );
      } else {
        console.warn("fetchImageAsBase64 returned null/false for logo");
      }
    } catch (error) {
      console.error('Error loading logo:', error);
    }
  } else {
    console.warn("No logo_url found in proposal.funding_scheme", proposal.funding_scheme);
  }

  // Proposal title
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: proposal.title || "Untitled Proposal",
          bold: true,
          size: 36,
          font: FONT,
          color: "1F4788",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    })
  );

  // Generation date
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated on ${new Date().toLocaleDateString()}`,
          size: BODY_SIZE,
          font: FONT,
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Funding scheme name (if available)
  if (proposal.funding_scheme?.name) {
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Funding Scheme: ${proposal.funding_scheme.name}`,
            size: BODY_SIZE,
            font: FONT,
            bold: true,
            color: "2E5C8A",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  // Page break after title page
  docChildren.push(createPageBreak());

  // ============================================================================
  // EXECUTIVE SUMMARY
  // ============================================================================
  if (proposal.summary) {
    docChildren.push(createSectionHeader("Executive Summary"));
    docChildren.push(...convertHtmlToParagraphs(proposal.summary));
    // Page break after executive summary
    docChildren.push(createPageBreak());
  }

  // ============================================================================
  // DYNAMIC SECTIONS (if using funding scheme templates)
  // ============================================================================
  if (proposal.dynamic_sections && Object.keys(proposal.dynamic_sections).length > 0) {
    Object.entries(proposal.dynamic_sections).forEach(([key, content], idx) => {
      const title = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      docChildren.push(createSectionHeader(`${idx + 1}. ${title}`));
      docChildren.push(...convertHtmlToParagraphs(content as string));
    });
  } else {
    // ============================================================================
    // LEGACY SECTIONS (fallback for older proposals)
    // ============================================================================
    const sections = [
      { title: "Introduction", content: proposal.introduction },
      { title: "Relevance", content: proposal.relevance },
      { title: "Objectives", content: proposal.objectives },
      { title: "Methodology", content: proposal.methodology || proposal.methods },
      { title: "Work Plan", content: proposal.workPlan },
      { title: "Expected Results", content: proposal.expectedResults },
      { title: "Impact", content: proposal.impact },
      { title: "Innovation", content: proposal.innovation },
      { title: "Sustainability", content: proposal.sustainability },
      { title: "Consortium", content: proposal.consortium },
      { title: "Risk Management", content: proposal.riskManagement },
      { title: "Dissemination & Communication", content: proposal.dissemination },
    ];

    sections.forEach((section, idx) => {
      if (section.content) {
        docChildren.push(createSectionHeader(`${idx + 1}. ${section.title}`));
        docChildren.push(...convertHtmlToParagraphs(section.content));
      }
    });
  }

  // ============================================================================
  // PARTNERS
  // ============================================================================
  // No page break - let content flow naturally
  if (proposal.partners && proposal.partners.length > 0) {
    docChildren.push(createSectionHeader("Partners"));
    const partnerRows = proposal.partners.map((p) => [
      p.name || "N/A",
      p.role || "N/A",
    ]);
    docChildren.push(createTable(["Partner Name", "Role"], partnerRows));
  }

  // ============================================================================
  // WORK PACKAGES
  // ============================================================================
  if (proposal.workPackages && proposal.workPackages.length > 0) {
    docChildren.push(createSectionHeader("Work Packages"));
    proposal.workPackages.forEach((wp, idx) => {
      // Check if name already starts with "WP" to avoid duplication
      const wpName = wp.name || "Unnamed";
      const wpTitle = wpName.match(/^WP\d+:/i) ? wpName : `WP${idx + 1}: ${wpName}`;
      docChildren.push(createSubHeader(wpTitle));
      docChildren.push(createParagraph(wp.description || "No description"));
      if (wp.deliverables && wp.deliverables.length > 0) {
        docChildren.push(createParagraph("Deliverables:"));
        wp.deliverables.forEach((d) => {
          docChildren.push(createParagraph(`  ΓÇó ${d}`));
        });
      }
    });
  }

  // ============================================================================
  // MILESTONES
  // ============================================================================
  if (proposal.milestones && proposal.milestones.length > 0) {
    docChildren.push(createSectionHeader("Milestones"));
    const milestoneRows = proposal.milestones.map((m) => [
      m.milestone || "N/A",
      m.workPackage || "N/A",
      m.dueDate || "N/A",
    ]);
    docChildren.push(
      createTable(["Milestone", "Work Package", "Due Date"], milestoneRows)
    );
  }

  // ============================================================================
  // RISKS
  // ============================================================================
  if (proposal.risks && proposal.risks.length > 0) {
    docChildren.push(createSectionHeader("Risk Management"));
    const riskRows = proposal.risks.map((r) => [
      r.risk || "N/A",
      r.likelihood || "N/A",
      r.impact || "N/A",
      r.mitigation || "N/A",
    ]);
    docChildren.push(
      createTable(["Risk", "Likelihood", "Impact", "Mitigation"], riskRows)
    );
  }

  // ============================================================================
  // BUDGET (Redesigned with Summary Table + Detailed Breakdown)
  // ============================================================================
  // ============================================================================
  // BUDGET (Redesigned with Summary Table + Detailed Breakdown)
  // ============================================================================
  if (proposal.budget && proposal.budget.length > 0) {
    // Budget section (no page break - let it flow naturally)
    docChildren.push(createSectionHeader("6. Budget Summary"));

    // Calculate totals for each category
    let grandTotal = 0;
    const categoryTotals = proposal.budget.map((item) => {
      let categoryTotal = 0;
      if (item.breakdown && item.breakdown.length > 0) {
        categoryTotal = item.breakdown.reduce(
          (sum, subItem) => sum + ((subItem.quantity || 0) * (subItem.unitCost || 0)),
          0
        );
      } else {
        categoryTotal = item.cost || 0;
      }
      grandTotal += categoryTotal;
      return {
        category: item.item || "Budget Category",
        total: categoryTotal,
        description: item.description,
        breakdown: item.breakdown
      };
    });

    // ============================================================================
    // SUMMARY TABLE - All categories with totals
    // ============================================================================
    const summaryRows = categoryTotals.map((cat) => [
      cat.category,
      `Γé¼${cat.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    ]);

    docChildren.push(
      createTable(
        ["Budget Category", "Total Amount"],
        summaryRows
      )
    );

    // Grand total row (reduced spacing to keep with table)
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `TOTAL PROJECT BUDGET: Γé¼${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            bold: true,
            size: HEADER_SIZE,
            font: FONT,
            color: "1F4788",
          }),
        ],
        spacing: { before: 150, after: 300 },
        alignment: AlignmentType.RIGHT,
        keepNext: true,
      })
    );

    // ============================================================================
    // DETAILED BREAKDOWN - Unified Table
    // ============================================================================
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Detailed Budget Breakdown",
            bold: true,
            size: SUBHEADER_SIZE,
            font: FONT,
            color: "2E5C8A",
          }),
        ],
        spacing: { before: 400, after: 200 },
        keepNext: true
      })
    );

    const unifiedRows: string[][] = [];

    categoryTotals.forEach((cat, idx) => {
      // 1. Category Row with formatting logic (simulated in plain table for now)
      // Visual separation: Category name uppercase/bold logic handled by TextRun if we weren't using helper.
      // Since helper createTable makes everything plain text paragraphs, we use text cues.

      const categoryLine = `${idx + 1}. ${cat.category.toUpperCase()}`;
      unifiedRows.push([
        categoryLine,
        "", // Qty empty
        "", // Cost empty
        `Γé¼${cat.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` // Category Subtotal
      ]);

      // 2. Sub-items
      if (cat.breakdown && cat.breakdown.length > 0) {
        cat.breakdown.forEach((subItem) => {
          const itemTotal = (subItem.quantity || 0) * (subItem.unitCost || 0);
          unifiedRows.push([
            `   - ${subItem.subItem || "Item"}`, // Indented visually
            subItem.quantity?.toString() || "0",
            `Γé¼${(subItem.unitCost || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            `Γé¼${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
          ]);
        });
      }
      // Add empty spacer row? No, keep it compact.
    });

    if (unifiedRows.length > 0) {
      docChildren.push(
        createTable(
          ["Item / Category", "Quantity", "Unit Cost", "Total"],
          unifiedRows
        )
      );
    }
  }

  // ============================================================================
  // TIMELINE
  // ============================================================================
  if (proposal.timeline && proposal.timeline.length > 0) {
    docChildren.push(createSectionHeader("Timeline"));
    proposal.timeline.forEach((phase) => {
      // Check if phase name already contains month information
      const hasMonthInfo = /\(Months?\s+\d+/i.test(phase.phase);
      const phaseTitle = hasMonthInfo
        ? phase.phase
        : `${phase.phase} (Month ${phase.startMonth}-${phase.endMonth})`;

      docChildren.push(createSubHeader(phaseTitle));

      if (phase.activities && phase.activities.length > 0) {
        phase.activities.forEach((activity) => {
          docChildren.push(createParagraph(`  ΓÇó ${activity}`));
        });
      }
    });
  }

  // ============================================================================
  // CREATE DOCUMENT
  // ============================================================================
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  // ============================================================================
  // PACK TO BLOB
  // ============================================================================
  const blob = await Packer.toBlob(doc);

  const fileName = `${proposal.title?.replace(/[^a-z0-9]/gi, "_") || "proposal"}_${Date.now()}.docx`;

  return {
    blob: new Blob([blob], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    fileName,
  };
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Main export function - generates and downloads DOCX
 * Uses file-saver library for reliable cross-browser downloads
 */
export async function exportToDocx(proposal: FullProposal): Promise<void> {
  console.log("=== STARTING DOCX EXPORT ===");
  console.log("Proposal title:", proposal.title);

  try {
    console.log("Generating DOCX document...");
    const { blob, fileName } = await generateDocx(proposal);
    console.log(`DOCX generated: ${fileName}, size: ${blob.size} bytes, type: ${blob.type}`);

    console.log("Calling saveAs to trigger download...");
    saveAs(blob, fileName);
    console.log("saveAs called successfully!");

    // Note: We don't show an alert here because saveAs handles the download UI

  } catch (error) {
    console.error("=== EXPORT FAILED ===");
    console.error("Error details:", error);
    alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
