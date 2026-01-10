// Proposal-related type definitions

import type { FundingScheme, DynamicSections } from './funding-scheme';
import type { Partner } from './partner';

export interface Idea {
  title: string;
  description: string;
}

export interface Constraints {
  partners: string;
  budget: string;
  duration: string;
}

export interface AnalysisResult {
  summary: string;
  constraints: Constraints;
  ideas: Idea[];
}

export interface RelevanceAnalysis {
  score: 'Good' | 'Fair' | 'Poor';
  justification: string;
}

// Partner type is now imported from partner.ts

export interface WorkPackage {
  name: string;
  description: string;
  duration?: string;
  activities: {
    name: string;
    description: string;
    leadPartner: string;
    participatingPartners: string[];
    estimatedBudget: number;
  }[];
  deliverables: string[];
}

export interface Milestone {
  milestone: string;
  workPackage: string;
  dueDate: string;
}

export interface Risk {
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
}

export interface BudgetBreakdown {
  subItem: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface BudgetItem {
  item: string;
  cost: number;
  description: string;
  breakdown?: BudgetBreakdown[];
}

export interface TimelinePhase {
  phase: string;
  activities: string[];
  startMonth: number;
  endMonth: number;
}

export interface TechnicalLayer {
  layer: string;
  technologies: string;
  description: string;
}

export interface FullProposal {
  // Core Fields
  id?: string;
  title: string;
  summary: string;

  // NEW: Funding Scheme Support (optional - for backward compatibility)
  fundingSchemeId?: string; // Link to funding scheme template
  fundingScheme?: FundingScheme; // Populated funding scheme object (from join)
  dynamicSections?: DynamicSections; // Dynamic content: { "excellence": "text...", "impact": "text..." }

  // Legacy hardcoded sections (kept for backward compatibility)
  relevance: string;
  methods: string;
  impact: string;
  introduction?: string;
  objectives?: string;
  methodology?: string;
  expectedResults?: string;
  innovation?: string;
  sustainability?: string;
  consortium?: string;
  workPlan?: string;
  riskManagement?: string;
  dissemination?: string;

  // Structured Data
  partners: Partner[];
  workPackages: WorkPackage[];
  milestones: Milestone[];
  risks: Risk[];
  budget: BudgetItem[];
  timeline: TimelinePhase[];
  technicalOverview?: TechnicalLayer[] | string;

  // Metadata
  layoutId?: string;
  layout?: { sequence: string[] };
  projectUrl?: string;
  selectedIdea?: Idea;
  generatedAt?: string;
  savedAt?: string;
  updatedAt?: string;
  settings?: ProposalSettings;
  generationPrompt?: string;
}

export interface ProposalSettings {
  currency: string;
  sourceUrl?: string;
  customParams?: { key: string; value: string }[];
}