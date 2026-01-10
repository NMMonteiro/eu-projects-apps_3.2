import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { ProposalGenerator } from './components/ProposalGenerator';
import { FundingSearchPageSimple } from './components/FundingSearchPageSimple';
import { FundingSearchHybrid } from './components/FundingSearchHybrid';
import { PartnersPage } from './components/PartnersPage';
import { SavedProposalsPage } from './components/SavedProposalsPage';
import { SettingsPage } from './components/SettingsPage';
import { ProposalViewerPage } from './components/ProposalViewerPage';
import { ProposalSummaryPage } from './components/ProposalSummaryPage';
import { PartnerEditPage } from './components/PartnerEditPage';
import { FundingSchemeAdminPage } from './components/FundingSchemeAdminPage';
import { TestExportPage } from './components/TestExportPage';

// Wrapper components to handle navigation props
const ProposalGeneratorWrapper = () => {
    const navigate = useNavigate();
    return <ProposalGenerator onViewProposal={(id) => navigate(`/proposals/${id}`)} />;
};

const PartnersPageWrapper = () => {
    const navigate = useNavigate();
    return <PartnersPage onEditPartner={(id) => navigate(`/partners/${id}`)} />;
};

const SavedProposalsPageWrapper = () => {
    const navigate = useNavigate();
    return <SavedProposalsPage onViewProposal={(id) => navigate(`/proposals/${id}`)} />;
};

const PartnerEditPageWrapper = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    return <PartnerEditPage partnerId={id} onBack={() => navigate('/partners')} />;
};

const ProposalViewerPageWrapper = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    return <ProposalViewerPage proposalId={id} onBack={() => navigate('/saved')} />;
};

const ProposalSummaryPageWrapper = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    return <ProposalSummaryPage proposalId={id} onBack={() => navigate(`/proposals/${id}`)} />;
};

function App() {
    return (
        <>
            <div style={{
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '4px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: '10px',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999
            }}>
                BUILD V3.7 - FINAL - HARD REFRESH RECOMMENDED (CTRL+F5)
            </div>
            <BrowserRouter>
                <Toaster position="top-right" theme="dark" />
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<ProposalGeneratorWrapper />} />
                        <Route path="/funding" element={<FundingSearchPageSimple />} />
                        <Route path="/funding-hybrid" element={<FundingSearchHybrid />} />
                        <Route path="/partners" element={<PartnersPageWrapper />} />
                        <Route path="/partners/:id" element={<PartnerEditPageWrapper />} />
                        <Route path="/saved" element={<SavedProposalsPageWrapper />} />
                        <Route path="/proposals/:id" element={<ProposalViewerPageWrapper />} />
                        <Route path="/proposals/:id/summary" element={<ProposalSummaryPageWrapper />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/admin/funding-schemes" element={<FundingSchemeAdminPage />} />
                        <Route path="/test-export" element={<TestExportPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}

export default App;
