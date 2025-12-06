import { FundingSchemeTemplateParser } from '../components/FundingSchemeTemplateParser'
import { ArrowLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function FundingSchemeAdminPage() {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
            {/* Header */}
            <div className="bg-white border-b shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition"
                            title="Back to home"
                        >
                            <ArrowLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-3">
                            <Settings className="h-6 w-6 text-blue-600" />
                            <h1 className="text-xl font-bold text-gray-900">Funding Scheme Administration</h1>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="py-8">
                <FundingSchemeTemplateParser />
            </div>
        </div>
    )
}
