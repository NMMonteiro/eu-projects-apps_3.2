import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Search,
    Users,
    FileText,
    Settings,
    Menu,
    ChevronDown,
    ChevronRight,
    Folder,
    Sparkles
} from 'lucide-react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

export function Layout() {
    const location = useLocation();
    const [isMobileOpen, setIsMobileOpen] = React.useState(false);

    // State for expanded folders - default all to true
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
        'Proposal Tools': true,
        'Resources': true,
        'Configuration': true
    });

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folder]: !prev[folder]
        }));
    };

    const navGroups = [
        {
            title: 'Proposal Tools',
            items: [
                { href: '/', label: 'Generator', icon: LayoutDashboard },
                { href: '/saved', label: 'Saved Proposals', icon: FileText },
            ]
        },
        {
            title: 'Resources',
            items: [
                { href: '/funding', label: 'Funding Search', icon: Search },
                { href: '/partners', label: 'Partners', icon: Users },
            ]
        },
        {
            title: 'Configuration',
            items: [
                { href: '/admin/funding-schemes', label: 'Funding Schemes', icon: Sparkles },
                { href: '/settings', label: 'Settings', icon: Settings },
            ]
        }
    ];

    const NavContent = () => (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-white/10">
            <div className="p-6">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    AI Proposal Studio
                </h1>
            </div>

            <nav className="flex-1 px-3 space-y-4 overflow-y-auto hide-scrollbar">
                {navGroups.map((group) => (
                    <div key={group.title} className="space-y-1">
                        <button
                            onClick={() => toggleFolder(group.title)}
                            className="flex items-center w-full px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white transition-colors group"
                        >
                            {expandedFolders[group.title] ? (
                                <ChevronDown className="w-3 h-3 mr-1.5 text-gray-500 group-hover:text-white" />
                            ) : (
                                <ChevronRight className="w-3 h-3 mr-1.5 text-gray-500 group-hover:text-white" />
                            )}
                            <Folder className="w-3 h-3 mr-2 text-gray-500 group-hover:text-white" />
                            {group.title}
                        </button>

                        {expandedFolders[group.title] && (
                            <div className="space-y-1 ml-2 border-l border-white/10 pl-2">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <NavLink
                                            key={item.href}
                                            to={item.href}
                                            onClick={() => setIsMobileOpen(false)}
                                            className={({ isActive }) =>
                                                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 ${isActive
                                                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/20'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                                                }`
                                            }
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{item.label}</span>
                                        </NavLink>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </nav>

            <div className="p-4 border-t border-white/10 bg-[#18181b]">
                <div className="flex items-center gap-3 px-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                        AI
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">User Workspace</p>
                        <p className="text-xs text-gray-500 truncate">Pro Plan</p>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#121212] text-white flex">
            {/* Desktop Sidebar */}
            <div className="hidden md:block w-64 shrink-0">
                <div className="fixed w-64 h-full">
                    <NavContent />
                </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#1e1e1e] border-b border-white/10 flex items-center px-4 z-50">
                <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-white">
                            <Menu className="w-6 h-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-64 border-r border-white/10 bg-[#1e1e1e]">
                        <NavContent />
                    </SheetContent>
                </Sheet>
                <span className="ml-4 font-bold">AI Proposal Studio</span>
            </div>

            {/* Main Content */}
            <main className="flex-1 md:min-h-screen pt-16 md:pt-0 overflow-x-hidden">
                <div className="container mx-auto max-w-7xl animate-in fade-in duration-500">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
