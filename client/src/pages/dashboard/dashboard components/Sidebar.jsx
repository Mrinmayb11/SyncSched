import React from 'react';
import { Link, useLocation } from 'react-router-dom';
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Assuming shadcn/ui avatar is available
import { Button } from "@/components/ui/button";
import { Settings, User, Newspaper, Share2 } from 'lucide-react'; // Icons
import { cn } from "@/lib/utils"; // Assuming shadcn/ui utility

// Placeholder user data - replace with actual data later
const placeholderUser = {
  name: "Loading...",
  // Add imageUrl: user.imageUrl || null if you have profile pictures
};

const SidebarLink = ({ to, icon: Icon, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link to={to}>
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className="w-full justify-start"
      >
        <Icon className="mr-2 h-4 w-4" />
        {children}
      </Button>
    </Link>
  );
};

export default function Sidebar({ user = placeholderUser }) {
  return (
    <div className="hidden border-r bg-muted/40 md:block w-64 flex-shrink-0">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          {/* You can add a logo or app name here */}
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="">SyncSched</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {/* User Info Area */}


            {/* Navigation Links */}
            <SidebarLink to="/dashboard/notion-to-blogs" icon={Newspaper}>
              Notion to Blogs
            </SidebarLink>
            <SidebarLink to="/dashboard/notion-to-socials" icon={Share2}>
              Notion to Socials
            </SidebarLink>
            {/* Add more links as needed */}
          </nav>
        </div>
        {/* Footer Links (Settings, etc.) */}
        <div className="mt-auto p-4 border-t">
          <nav className="grid gap-1">
             <SidebarLink to="/dashboard/settings" icon={Settings}>
              Settings
            </SidebarLink>
            {/* Add Logout button/link here if desired */}
          </nav>
        </div>
      </div>
    </div>
  );
} 