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
  VerticalAlign,
  ShadingType,
  PageNumber,
} from "docx";
import { saveAs } from "file-saver";
import { FullProposal, WorkPackage } from "../types/proposal";
import { Partner } from "../types/partner";
import { assembleDocument, DisplaySection } from "./proposal-assembly";

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

function getCurrencySymbol(currency: string = "EUR"): string {
  if (currency === "EUR") return "€";
  if (currency === "USD") return "$";
  if (currency === "GBP") return "£";
  return currency;
}

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
 * Robustly splits squashed labels. 
 */
function fixSquashedText(text: string): string {
  // Pattern: [lowercase|digit|bracket|parenthesis] followed by [Uppercase + lowercase + rest of label + colon]
  // We make it more specific to avoid splitting CamelCase company names (e.g., TropicalAstral)
  // We now require the "squashed" part to start with a newline or be at least 3 chars deep into a line.
  return text.replace(/([a-z0-9\]\)])(?=[A-Z][a-z][a-zA-Z\s\-]{3,30}:)/g, "$1\n");
}

function sanitizeTitle(title: string): string {
  if (!title) return "";
  let clean = title.replace(/^undefined\s*/gi, '');
  // If it's just "applicant organisation" or similar, make it professional
  if (/^applicant\s*organisation/i.test(clean) || clean.toLowerCase() === 'applicant') {
    return "Applicant Organisation";
  }
  // Remove numbers at start like "1. " or "2. "
  clean = clean.replace(/^\d+[\.\)\s-]+\s*/, '');
  // Replace underscores with spaces
  clean = clean.replace(/_/g, ' ');
  // Remove " - Null" or similar common empty placeholders
  clean = clean.replace(/\s*-\s*null$/i, '');
  // Title case
  return clean.replace(/\b\w/g, l => l.toUpperCase()).trim();
}

/**
 * Normalizes a partner object to handle both snake_case and camelCase
 */
function normalizePartner(p: any): Partner {
  if (!p) return {} as Partner;
  // Determine if this partner is a coordinator
  const isCoord =
    p.isCoordinator === true ||
    p.is_coordinator === true ||
    (p.role && p.role.toLowerCase().includes('coord')) ||
    (p.contactPersonRole && p.contactPersonRole.toLowerCase().includes('coord'));

  return {
    ...p,
    name: p.name || p.legalShortName || p.acronym || p.legal_name || p.legal_name_national || "Unknown Partner",
    organisationId: p.organisationId || p.organisation_id || p.pic || p.oid || p.picNumber || "",
    vatNumber: p.vatNumber || p.vat_number || p.vat || "",
    businessId: p.businessId || p.business_id || p.registration_id || p.business_registration_id || "",
    organizationType: p.organizationType || p.organization_type || p.type || "",
    legalNameNational: p.legalNameNational || p.legal_name_national || p.legalName || p.name || "",
    legalAddress: p.legalAddress || p.legal_address || p.office_address || p.address || "",
    country: p.country || p.legal_country || p.legalCountry || "",
    city: p.city || p.legal_city || p.legalCity || "",
    postcode: p.postcode || p.post_code || p.legal_postcode || p.zipCode || "",
    website: p.website || p.url || p.org_website || "",
    contactEmail: p.contactEmail || p.contact_email || p.email || "",
    legalRepName: p.legalRepName || p.legal_rep_name || p.rep_name || "",
    legalRepPosition: p.legalRepPosition || p.legal_rep_position || p.rep_position || "",
    legalRepEmail: p.legalRepEmail || p.legal_rep_email || p.rep_email || "",
    legalRepPhone: p.legalRepPhone || p.legal_rep_phone || p.rep_phone || "",
    contactPersonName: p.contactPersonName || p.contact_person_name || p.contact_name || "",
    contactPersonPosition: p.contactPersonPosition || p.contact_person_position || p.contact_position || "",
    contactPersonEmail: p.contactPersonEmail || p.contact_person_email || p.contact_person_email_address || "",
    contactPersonPhone: p.contactPersonPhone || p.contact_person_phone || "",
    contactPersonRole: p.contactPersonRole || p.contact_person_role || "",
    staffSkills: p.staffSkills || p.staff_skills || p.skills || "",
    experience: p.experience || p.expertise || "",
    relevantProjects: p.relevantProjects || p.relevant_projects || p.past_projects || "",
    description: p.description || p.background || p.profile || "",
    isCoordinator: isCoord,
    role: isCoord ? "Coordinator" : (p.role || "Partner")
  };
}

function normalizeWorkPackage(wp: any, index: number): WorkPackage {
  let name = wp.name || `Work Package ${index + 1}`;
  // Sanitize name: Remove common AI or template "Null" artifacts
  name = name.replace(/\s*-\s*null$/i, '');

  return {
    ...wp,
    name,
    description: wp.description || "",
    deliverables: Array.isArray(wp.deliverables)
      ? wp.deliverables.filter((d: any) => d && String(d).toLowerCase() !== 'null' && String(d).toLowerCase() !== '')
      : []
  };
}

/**
 * Formatting for currency and symbols.
 */
function formatContentText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\bEUR\b/g, "€")
    .replace(/\bEuro(s)?\b/gi, "€")
    .replace(/\bE U R\b/g, "€");
}

/**
 * Strips HTML tags and replaces BR/P with newlines to preserve structure.
 */
function cleanHtml(html: string | undefined | null): string {
  if (!html) return "";
  // Unescape common entities first
  let decoded = html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Basic tag substitution for line breaks
  return decoded
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "\n• ")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * Creates a paragraph with bolding for "Key: Value" patterns.
 */
function createSmartParagraph(text: string, options: { bullet?: number } = {}): Paragraph {
  const line = formatContentText(text.trim());
  const colonIndex = line.indexOf(':');

  // Only bold if colon is not at start/end and seems like a label (limit length)
  if (colonIndex > 0 && colonIndex < 70 && colonIndex < line.length - 1) {
    const key = line.substring(0, colonIndex + 1);
    const value = line.substring(colonIndex + 1);
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
      new TextRun({ text: line, font: FONT, size: BODY_SIZE }),
    ],
    spacing: { before: 80, after: 80 },
    bullet: options.bullet !== undefined ? { level: options.bullet } : undefined,
  });
}

function createKeyValueTable(lines: string[]): Table {
  const rows: TableRow[] = [];

  lines.forEach(line => {
    const formattedLine = formatContentText(line);
    const colonIndex = formattedLine.indexOf(':');
    if (colonIndex > 0 && colonIndex < 70) {
      const key = formattedLine.substring(0, colonIndex).trim();
      const value = formattedLine.substring(colonIndex + 1).trim();
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: key, bold: true, font: FONT, size: BODY_SIZE })],
              spacing: { before: 80, after: 80 }
            })],
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: "F9F9F9" }
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: value, font: FONT, size: BODY_SIZE })],
              spacing: { before: 80, after: 80 }
            })],
            width: { size: 65, type: WidthType.PERCENTAGE }
          })
        ]
      }));
    } else if (formattedLine.length > 0) {
      // Header row or notes
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: formattedLine, bold: true, font: FONT, size: BODY_SIZE, color: COLOR_PRIMARY })],
              spacing: { before: 100, after: 100 }
            })],
            columnSpan: 2,
            shading: { fill: COLOR_TABLE_HEADER }
          })
        ]
      }));
    }
  });

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

function createWorkPackageTable(wps: WorkPackage[], currency: string = "EUR"): Table {
  const rows: TableRow[] = [];

  // Header
  rows.push(new TableRow({
    children: [
      createTableHeaderCell("No."),
      createTableHeaderCell("Work Package Title"),
      createTableHeaderCell("Budget"),
    ]
  }));

  wps.forEach((wp, idx) => {
    // Calculate WP Budget
    const wpBudget = (wp.activities || []).reduce((sum, act: any) => sum + (act.estimatedBudget || act.cost || 0), 0);

    rows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: (idx + 1).toString(), bold: true, font: FONT, size: BODY_SIZE })], alignment: AlignmentType.CENTER })],
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: "F9F9F9" }
        }),
        new TableCell({
          children: [
            new Paragraph({ children: [new TextRun({ text: wp.name, bold: true, font: FONT, size: BODY_SIZE })] })
          ],
          verticalAlign: VerticalAlign.CENTER
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: `${wpBudget.toLocaleString()} ${currency}`, bold: true, font: FONT, size: 18 })],
            alignment: AlignmentType.RIGHT
          })],
          verticalAlign: VerticalAlign.CENTER,
          shading: { fill: "F9F9F9" }
        })
      ]
    }));
  });

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
    }
  });
}

function convertHtmlToParagraphs(html: string | undefined | null, sectionTitle?: string, allowedNames?: string[]): (Paragraph | Table)[] {
  // 1. Clean HTML and get structured text
  let text = cleanHtml(html);

  // 2. Remove any leftover date format labels
  text = text.replace(/\s*\(dd\/mm\/yyyy\)/g, "");

  // 3. Fix squashed labels
  text = fixSquashedText(text);

  // 4. Split into lines and join probable split labels
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const lines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    let current = rawLines[i];

    // Skip common AI placeholders for structured sections
    if (current.toLowerCase().includes("details of the") && current.toLowerCase().includes("inserted here")) continue;
    if (current.toLowerCase().includes("placeholder for") && current.toLowerCase().includes("table")) continue;
    if (current.toLowerCase() === "details to be provided.") continue;

    // Look ahead: if current line has no colon, but next line does, join them if short
    // We increase window slightly to catch more AI output quirks
    if (i < rawLines.length - 1 && !current.includes(':') && current.length < 50) {
      const next = rawLines[i + 1];
      const nextColon = next.indexOf(':');
      if (nextColon >= 0 && nextColon < 30) {
        current = current + " " + next;
        i++; // Skip the next line as we've merged it
      }
    }

    // Filtering Logic: If we have allowedNames and this line looks like a partner header
    if (allowedNames && allowedNames.length > 0) {
      const colonIdx = current.indexOf(':');
      if (colonIdx > 0 && colonIdx < 60) {
        const potentialName = current.substring(0, colonIdx).toLowerCase();

        // Remove "Undefined" prefixes or common trash labels
        if (potentialName.includes('undefined') || potentialName.includes('applicant organisation')) {
          console.log(`Filtering out trash header: ${potentialName}`);
          continue;
        }

        // Check if any allowed name is found in the header portion
        const isMatch = allowedNames.some(name => {
          const n = name.toLowerCase();
          return potentialName.includes(n) || n.includes(potentialName);
        });

        // If it looks like a partner entry but doesn't match any of our partners, skip it!
        if (!isMatch && (potentialName.length > 4)) {
          console.log(`Filtering out hallucinated partner: ${potentialName}`);
          continue;
        }
      }
    }

    lines.push(current);
  }

  if (lines.length === 0) return [createParagraph("")];

  // 5. Special table-style for data-heavy sections
  const lowerTitle = (sectionTitle || "").toLowerCase();
  if (lowerTitle.includes("annex") || lowerTitle.includes("context") || lowerTitle.includes("budget items")) {
    return [createKeyValueTable(lines)];
  }

  // 6. Default: List of paragraphs with bold labels
  return lines.map(line => {
    if (line.startsWith("• ")) {
      return createSmartParagraph(line.substring(2), { bullet: 0 });
    }
    return createSmartParagraph(line);
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

function createTableHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: BODY_SIZE, font: FONT })],
      alignment: AlignmentType.CENTER
    })],
    shading: { fill: COLOR_TABLE_HEADER, type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
  });
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

// ============================================================================
// GENERATOR
// ============================================================================

export async function generateDocx(proposal: FullProposal): Promise<{ blob: Blob; fileName: string }> {
  try {
    const p = proposal;
    const fScheme = p.fundingScheme || (p as any).funding_scheme;
    const currency = p.settings?.currency || "EUR";
    const docChildren: any[] = [];

    // 1. TITLE PAGE
    const logoUrl = fScheme?.logo_url;
    if (logoUrl && logoUrl.startsWith('data:image')) {
      const parts = logoUrl.split(',');
      if (parts.length > 1) {
        docChildren.push(new Paragraph({
          children: [new ImageRun({
            data: Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0)),
            transformation: { width: 140, height: 140 },
            type: "png"
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 }
        }));
      }
    }

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
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
        ],
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        }
      })
    );

    docChildren.push(new Paragraph({ children: [new PageBreak()] }));

    // 2. EXECUTIVE SUMMARY (Always first as Part A)
    docChildren.push(createSectionHeader("Part B: Technical Narrative", 1));
    docChildren.push(createSectionHeader("0. Executive Summary", 2));
    docChildren.push(...convertHtmlToParagraphs(p.summary, "Executive Summary"));

    // 3. ASSEMBLED SECTIONS (STRICT ORDER)
    const finalDocument = assembleDocument(p).filter(s => s.id !== 'summary');

    finalDocument.forEach((section: DisplaySection) => {
      const isWP = section.type === 'work_package';
      const isWPList = section.type === 'wp_list';
      const isBudget = section.type === 'budget';
      const isRisk = section.type === 'risk';
      const isPartners = section.type === 'partners';
      const isProfiles = section.type === 'partner_profiles';

      // Skip if completely empty
      if (!section.content && !isWP && !isWPList && !isBudget && !isRisk && !isPartners && !isProfiles) return;

      // Section Header
      docChildren.push(createSectionHeader(section.title, Math.min(section.level + 1, 4)));

      // Section Guidelines
      if (section.description) {
        docChildren.push(new Paragraph({
          children: [
            new TextRun({ text: "GUIDELINES: ", bold: true, size: 16, color: "999999", font: FONT }),
            new TextRun({ text: section.description, italics: true, size: 16, color: "666666", font: FONT }),
          ],
          spacing: { before: 100, after: 100 },
          shading: { fill: "F5F5F5" }
        }));
      }

      // Narrative Content
      if (section.content) {
        docChildren.push(...convertHtmlToParagraphs(section.content, section.title));
      }

      // Structured Data
      if (isPartners && p.partners?.length > 0) {
        docChildren.push(createPartnerListTable(p.partners.map(normalizePartner)));
      } else if (isProfiles && p.partners?.length > 0) {
        p.partners.forEach((pt, i) => {
          const partner = normalizePartner(pt);
          docChildren.push(createSectionHeader(`${i + 1}. ${partner.name}`, 3));
          docChildren.push(createDetailedPartnerProfile(partner));
          docChildren.push(new Paragraph({ text: "" }));
        });
      } else if (isWPList && p.workPackages?.length > 0) {
        // Master Table
        const allWPs = p.workPackages.map((wp, i) => normalizeWorkPackage(wp, i));
        docChildren.push(createWorkPackageTable(allWPs, getCurrencySymbol(p.settings?.currency)));
      } else if (isWP && section.wpIdx !== undefined) {
        // Individual WP Detail: Narrative is already above, add activities/deliverables here
        const wpData = p.workPackages?.[section.wpIdx];
        const wp = normalizeWorkPackage(wpData || {
          name: section.title,
          description: section.content || "",
          activities: [],
          deliverables: []
        }, section.wpIdx);

        // Activities
        if (wp.activities?.length > 0) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Planned Activities:", bold: true, font: FONT, size: 20, color: COLOR_PRIMARY })],
            spacing: { before: 200, after: 100 }
          }));
          wp.activities.forEach(act => {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: `• ${act.name}`, bold: true, font: FONT, size: 18 })],
              spacing: { before: 100 }
            }));
            if (act.description) {
              docChildren.push(new Paragraph({
                children: [new TextRun({ text: `  ${act.description}`, font: FONT, size: 16, color: "444444" })],
                spacing: { after: 100 }
              }));
            }
          });
        }

        // Deliverables
        if (wp.deliverables?.length > 0) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: "Deliverables:", bold: true, font: FONT, size: 20, color: COLOR_PRIMARY })],
            spacing: { before: 200, after: 100 }
          }));
          wp.deliverables.forEach(del => {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: `• ${del}`, font: FONT, size: 18 })],
              spacing: { before: 40, after: 40 }
            }));
          });
        }
      } else if (isBudget && p.budget && p.budget.length > 0) {
        docChildren.push(createBudgetTable(p.budget, currency));
      } else if (isRisk && p.risks && p.risks.length > 0) {
        docChildren.push(createRiskTable(p.risks));
      }

      // Optional: spacing after section
      docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    });

    // 4. GENERATE FINAL DOCUMENT
    const doc = new Document({
      styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
      sections: [{
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({ text: "PROPOSAL: ", bold: true, color: COLOR_PRIMARY, font: FONT, size: 18 }),
                new TextRun({ text: p.title || "CONFIDENTIAL", color: COLOR_SECONDARY, font: FONT, size: 18 }),
              ],
              border: { bottom: { color: "DDDDDD", space: 4, style: BorderStyle.SINGLE, size: 1 } }
            })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({ text: "Generated by EU Proposal Tool", italics: true, size: 18, font: FONT }),
                new TextRun({ text: " | Page ", font: FONT, size: 18 }),
                new TextRun({ children: [PageNumber.CURRENT], color: COLOR_PRIMARY, bold: true, font: FONT, size: 18 }),
                new TextRun({ text: " of ", font: FONT, size: 18 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18 }),
              ],
              alignment: AlignmentType.RIGHT,
              border: { top: { color: "DDDDDD", space: 4, style: BorderStyle.SINGLE, size: 1 } }
            })]
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
    console.log("Starting DOCX export. Partners:", proposal.partners?.length);
    if (proposal.partners && proposal.partners.length > 0) {
      const p1 = proposal.partners[0] as any;
      console.log("Partner 1 data:", { name: p1.name, oid: p1.organisationId || p1.organisation_id, country: p1.country });
    }
    const { blob, fileName } = await generateDocx(proposal);
    saveAs(blob, fileName);
  } catch (error) {
    console.error("EXPORT FAILED", error);
    alert("Export failed: " + (error as Error).message);
  }
}// ============================================================================
// TABLE HELPERS
// ============================================================================

function createPartnerListTable(partners: Partner[]): Table {
  // Always sort: Coordinator first, then others
  const sortedPartners = [...partners].sort((a, b) => {
    const na = normalizePartner(a);
    const nb = normalizePartner(b);
    return (na.isCoordinator ? -1 : nb.isCoordinator ? 1 : 0);
  });

  const rows = [
    new TableRow({
      children: [
        createTableHeaderCell("No."),
        createTableHeaderCell("Partner Name"),
        createTableHeaderCell("Country"),
        createTableHeaderCell("Organisation ID (OID/PIC)"),
        createTableHeaderCell("Role"),
        createTableHeaderCell("Type"),
      ]
    }),
    ...sortedPartners.map((pt, i) => {
      const normalized = normalizePartner(pt);
      return new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (i + 1).toString(), font: FONT, size: BODY_SIZE })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: normalized.name, bold: true, font: FONT, size: BODY_SIZE })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: normalized.country || "-", font: FONT, size: BODY_SIZE })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: normalized.organisationId || normalized.pic || "-", font: FONT, size: BODY_SIZE })] })] }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: normalized.isCoordinator ? "Coordinator" : (normalized.role || "Partner"),
                    bold: normalized.isCoordinator,
                    font: FONT,
                    size: 18
                  })
                ]
              })
            ]
          }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: normalized.organizationType || "-", font: FONT, size: 18 })] })] }),
        ]
      })
    })
  ];

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
    }
  });
}

function createBudgetTable(budget: any[], currency: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createTableHeaderCell("Resource Item"),
          createTableHeaderCell("Description"),
          createTableHeaderCell(`Cost (${currency})`),
        ]
      }),
      ...budget.flatMap(item => {
        const rows = [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.item, bold: true, font: FONT, size: BODY_SIZE })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.description || "-", font: FONT, size: BODY_SIZE })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${item.cost.toLocaleString()} ${currency}`, font: FONT, size: BODY_SIZE, bold: true })], alignment: AlignmentType.RIGHT })] }),
            ]
          })
        ];

        // Add sub-items if they exist
        if (item.breakdown && item.breakdown.length > 0) {
          item.breakdown.forEach((sub: any) => {
            rows.push(new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: `  └ ${sub.subItem || sub.item || 'Sub-item'}`, font: FONT, size: 18, color: "666666" })]
                  })],
                  shading: { fill: "FCFCFC" }
                }),
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: `${sub.quantity || 1} x ${sub.unitCost ? sub.unitCost.toLocaleString() : sub.cost?.toLocaleString() || '0'}`, font: FONT, size: 18, color: "666666" })]
                  })],
                  shading: { fill: "FCFCFC" }
                }),
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: `${(sub.total || sub.cost || 0).toLocaleString()} ${currency}`, font: FONT, size: 18, color: "666666" })],
                    alignment: AlignmentType.RIGHT
                  })],
                  shading: { fill: "FCFCFC" }
                }),
              ]
            }));
          });
        }
        return rows;
      })
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    }
  });
}

function createRiskTable(risks: any[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createTableHeaderCell("Risk"),
          createTableHeaderCell("Impact"),
          createTableHeaderCell("Mitigation Measures"),
        ]
      }),
      ...risks.map(r => new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.risk, bold: true, font: FONT, size: BODY_SIZE })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.impact, font: FONT, size: BODY_SIZE })], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.mitigation, font: FONT, size: BODY_SIZE })] })] }),
        ]
      }))
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
    }
  });
}

function createDetailedPartnerProfile(rawPartner: Partner): Table {
  const partner = normalizePartner(rawPartner);
  const isCoord = partner.isCoordinator === true;
  const lines: { label: string; value: string | undefined | null }[] = [
    { label: "Full Legal Name", value: partner.name },
    { label: "Legal Name (National Language)", value: partner.legalNameNational },
    { label: "Acronym", value: partner.acronym },
    { label: "Organisation ID (OID/PIC)", value: partner.organisationId || partner.pic },
    { label: "VAT Number", value: partner.vatNumber },
    { label: "Business Registration ID", value: partner.businessId },
    { label: "Organisation Type", value: partner.organizationType },
    { label: "Country", value: partner.country },
    { label: "Postcode", value: partner.postcode },
    { label: "City", value: partner.city },
    { label: "Legal Address", value: partner.legalAddress },
    { label: "Website", value: partner.website },
    { label: "Contact Person", value: partner.contactPersonName },
    { label: "Contact Email", value: partner.contactPersonEmail || partner.contactEmail },
    { label: "Phone", value: partner.contactPersonPhone },
    { label: "Role in Project", value: isCoord ? "Coordinator" : (partner.role || partner.contactPersonRole || "Partner") },
  ];

  const rows: TableRow[] = lines.map(line => {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: line.label, bold: true, font: FONT, size: 18 })],
            spacing: { before: 40, after: 40 }
          })],
          width: { size: 35, type: WidthType.PERCENTAGE },
          shading: { fill: "F9F9F9" }
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: line.value || "-", font: FONT, size: 18 })],
            spacing: { before: 40, after: 40 }
          })],
          width: { size: 65, type: WidthType.PERCENTAGE }
        })
      ]
    });
  });

  // Add long text sections as full-width rows if they exist
  const longFields = [
    { label: "Organization Description", value: partner.description },
    { label: "Experience & Expertise", value: partner.experience },
    { label: "Key Personnel & Staff Skills", value: partner.staffSkills },
    { label: "Relevant Previous Projects", value: partner.relevantProjects }
  ];

  longFields.forEach(field => {
    if (field.value && field.value.length > 10) {
      rows.push(new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: field.label, bold: true, font: FONT, size: 18, color: COLOR_PRIMARY })],
                spacing: { before: 80, after: 40 }
              }),
              ...convertHtmlToParagraphs(field.value, field.label)
            ],
            columnSpan: 2,
            shading: { fill: "FFFFFF" }
          })
        ]
      }));
    }
  });

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
    }
  });
}
