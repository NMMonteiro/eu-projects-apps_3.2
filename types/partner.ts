// Partner-related type definitions

export interface Partner {
  id: string;
  name: string;
  legalNameNational?: string;
  acronym?: string;
  organisationId?: string; // OID or PIC
  pic?: string;
  vatNumber?: string;
  businessId?: string;
  organizationType?: string; // SME, University, Research, NGO, Public, etc.
  isPublicBody?: boolean;
  isNonProfit?: boolean;
  country?: string;
  legalAddress?: string;
  city?: string;
  postcode?: string;
  region?: string;
  contactEmail?: string;
  website?: string;
  description?: string;
  department?: string;
  keywords?: string[];
  logoUrl?: string;
  pdfUrl?: string;

  // Legal Representative
  legalRepName?: string;
  legalRepPosition?: string;
  legalRepEmail?: string;
  legalRepPhone?: string;

  // Contact Person
  contactPersonName?: string;
  contactPersonPosition?: string;
  contactPersonEmail?: string;
  contactPersonPhone?: string;
  contactPersonRole?: string;

  // Expertise & Experience
  experience?: string;
  staffSkills?: string;
  relevantProjects?: string;

  // Role specifically for a project/proposal
  role?: string; // e.g. "Coordinator", "Partner"
  isCoordinator?: boolean;

  createdAt: string;
}

export const ORGANIZATION_TYPES = [
  "Accreditation, certification or qualification body",
  "Counselling body",
  "European grouping of territorial cooperation",
  "European or international public body",
  "Foundation",
  "Higher education institution (tertiary level)",
  "Large enterprise",
  "Local Public body",
  "National Public body",
  "National Youth Council",
  "Non-governmental organisation/association",
  "Organisation or association representing (parts of) the sport sector",
  "Public service provider",
  "Regional Public body",
  "Research Institute/Centre",
  "School/Institute/Educational centre – Adult education",
  "School/Institute/Educational centre – General education (pre-primary level)",
  "School/Institute/Educational centre – General education (primary level)",
  "School/Institute/Educational centre – General education (secondary level)",
  "School/Institute/Educational centre – Vocational Training (secondary level)",
  "School/Institute/Educational centre – Vocational Training (tertiary level)",
  "Small and medium sized enterprise",
  "Social enterprise",
  "Social partner or other representative of working life (chambers of commerce, trade union, trade association)",
  "Sport club",
  "Sport federation",
  "Sport league",
  "Youth organisation",
  "Other"
];