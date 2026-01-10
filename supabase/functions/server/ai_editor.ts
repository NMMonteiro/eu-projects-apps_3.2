export async function aiEditProposal(ai: any, proposal: any, instruction: string) {
    // 1. Determine section
    const detectionPrompt = `Given instruction: "${instruction}". 
    Which ONE field of the proposal JSON should be edited? 
    Options: title, summary, relevance, impact, methods, workPlan, budget, risks, dissemination.
    Return JSON: { "section": "fieldName" }`;

    const detectRes = await ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent({
        contents: [{ role: 'user', parts: [{ text: detectionPrompt }] }]
    });
    const section = JSON.parse((detectRes.text || "").replace(/```json/g, '').replace(/```/g, '')).section;

    // 2. Edit
    const editPrompt = `Current content of ${section}: ${JSON.stringify(proposal[section])}.
    User instruction: ${instruction}.
    Generate the NEW content for this section only. Maintain JSON structure/type (string or array).
    Return JSON: { "content": ... }`;

    const editRes = await ai.getGenerativeModel({ model: 'gemini-1.5-flash' }).generateContent({
        contents: [{ role: 'user', parts: [{ text: editPrompt }] }]
    });
    const newContent = JSON.parse((editRes.text || "").replace(/```json/g, '').replace(/```/g, '')).content;

    proposal[section] = newContent;
    return { proposal, editedSection: section };
}