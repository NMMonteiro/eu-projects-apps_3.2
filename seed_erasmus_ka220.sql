-- Perfect template for Erasmus+ KA220-YOU 2025
-- Run this in your Supabase SQL Editor to add the 100% accurate structure

INSERT INTO public.funding_schemes (name, description, template_json, is_default)
VALUES (
    'Erasmus+ KA220-YOU 2025',
    'Cooperation partnerships in youth (KA220-YOU) - Official 2025 Structure',
    '{
        "schemaVersion": "1.0",
        "sections": [
            {
                "key": "context",
                "label": "Context",
                "order": 1,
                "mandatory": true,
                "type": "structured",
                "description": "Field, Project Title, Project Start Date, Project total Duration, National Agency, Language.",
                "aiPrompt": "Extract project metadata: Title, Start Date, Duration (Months), National Agency, and Language. Format as clear key-value pairs."
            },
            {
                "key": "project_summary",
                "label": "Project Summary",
                "order": 2,
                "mandatory": true,
                "description": "Objectives: What do you want to achieve? Implementation: What activities are you going to implement? Results: What project results? Include context/background, number and profile of participants, methodology, impact, and longer-term benefits.",
                "aiPrompt": "Draft a comprehensive Project Summary. Must address: 1) Context/Background, 2) Objectives, 3) Participants profile, 4) Activities description, 5) Methodology, 6) Expected Results and Impact. Tone: Professional and clear."
            },
            {
                "key": "relevance",
                "label": "Relevance of the project",
                "order": 3,
                "mandatory": true,
                "description": "How does the project address selected priorities? Motivation, objectives, concrete results. Innovation. Complementarity. Synergies. European added value. Needs analysis: Target groups and identification of needs.",
                "aiPrompt": "Draft the Relevance section. Address: 1) Alignment with EU priorities, 2) Motivation and innovation, 3) Synergies with other fields, 4) European added value, 5) Detailed Needs Analysis for target groups."
            },
            {
                "key": "partnership_arrangements",
                "label": "Partnership and cooperation arrangements",
                "order": 4,
                "mandatory": true,
                "description": "How did you form your partnership? How does the mix of organisations complement each other? Task allocation. Mechanism for coordination and communication.",
                "aiPrompt": "Draft the Partnership arrangements section. Explain: 1) Why these partners were chosen, 2) How they complement each other, 3) Detailed task allocation, 4) Communication and coordination protocols."
            },
            {
                "key": "impact",
                "label": "Impact",
                "order": 5,
                "mandatory": true,
                "description": "Assessing project objectives. Sustainability and long-term development. Impact on participating organisations and target groups. Wider impact (local, regional, national, European).",
                "aiPrompt": "Draft the Impact section. Address: 1) Assessment methodology, 2) Sustainability and result integration, 3) Impact on partners/target groups, 4) Systemic impact at regional/European levels."
            },
            {
                "key": "project_design_implementation",
                "label": "Project design and implementation",
                "order": 6,
                "mandatory": true,
                "description": "Monitoring activities (progress, quality). Budget control and time management. Risk handling plans. Accessibility and inclusion. Digital tools. Green practices. Civic engagement.",
                "aiPrompt": "Draft the Project Design section. Address: 1) Monitoring and quality control, 2) Budget and time management, 3) Risk mitigation (delays, conflicts, etc.), 4) Inclusivity, digital practices, and green practices."
            },
            {
                "key": "work_package_1",
                "label": "Work package n°1 Project Management",
                "order": 7,
                "mandatory": true,
                "type": "structured",
                "description": "Progress, quality, monitoring activities. Budget control. Time management.",
                "aiPrompt": "Detail the Project Management work package. Focus on administrative efficiency, reporting cycles, and financial management protocols."
            },
            {
                "key": "work_package_2",
                "label": "Work package n°2 - Development",
                "order": 8,
                "mandatory": true,
                "type": "structured",
                "description": "Development of results, workshop organization, technical design.",
                "aiPrompt": "Detail the second work package focused on core development and technical results."
            },
            {
                "key": "work_package_3",
                "label": "Work package n°3 - Implementation",
                "order": 9,
                "mandatory": true,
                "type": "structured",
                "description": "Piloting, testing, and implementation activities.",
                "aiPrompt": "Detail the third work package focused on piloting and real-world testing."
            },
            {
                "key": "work_package_4",
                "label": "Work package n°4 - Dissemination",
                "order": 10,
                "mandatory": true,
                "type": "structured",
                "description": "Impact assessment, sustainability, and dissemination of results.",
                "aiPrompt": "Detail the fourth work package focused on long-term impact and sharing results."
            },
            {
                "key": "eu_values",
                "label": "EU Values",
                "order": 11,
                "mandatory": true,
                "description": "Respect for human dignity, freedom, democracy, equality, the rule of law and human rights. Article 2 of the TEU and Article 21 of the EU Charter of Fundamental Rights.",
                "aiPrompt": "Draft a statement on how the project adheres to and promotes EU Values (democracy, equality, human rights)."
            }
        ],
        "metadata": {
            "totalCharLimit": 40000,
            "estimatedDuration": "12-36 months"
        }
    },
    false
) ON CONFLICT (name) DO UPDATE SET template_json = EXCLUDED.template_json;
