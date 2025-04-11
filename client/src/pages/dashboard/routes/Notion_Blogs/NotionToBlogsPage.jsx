import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SelectOption } from "./componenets/DropdownSelect";  
import GetWebflowCollections from "./componenets/GetCmsItems";


//Platforms 


export default function NotionToBlogsPage() {


  const platforms = [
    { value: '1', label: 'WordPress', href: 'https://example.com/wordpress' },
    { value: '2', label: 'Shopify', href: 'https://example.com/shopify' },
    { value: '3', label: 'Squarespace', href:'http://localhost:3000/auth', icon:'' },
    { value: '4', label: 'Wix', href:'http://localhost:3000/auth', icon:'' },
    { value: '5', label: 'Webflow', href:'https://2467-2401-4900-75a4-f380-217f-50cb-5d56-c491.ngrok-free.app/auth', icon:'' },
  ]



  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Sync Dashboard</h1>
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border p-6 w-full">
        <div className="w-full">
          {/* Header */}
          <div className="bg-gray-50 w-full flex flex-row p-2 rounded-t-lg">
            <div className="w-[16.66%] px-2">Sync Name</div>
            <div className="w-[16.66%] px-2">Platform</div>
            <div className="w-[16.66%] px-2">CMS</div>
            <div className="w-[16.66%] px-2">Database</div>
            <div className="w-[16.66%] px-2">Status</div>
            <div className="w-[16.66%] px-2 text-right">Actions</div>
          </div>

          {/* Rows */}
          <div className="w-full">
            <div className="w-full flex flex-row p-2 hover:bg-gray-50 transition-colors border-t">
              <div className="w-[16.66%] px-2 font-medium">Content Sync</div>
              <div className="w-[16.66%] px-2">
                <SelectOption
                options={platforms}
                CustomText=''
                />
              </div>
              <div className="w-[16.66%] px-2">
              <GetWebflowCollections/>
              </div>
              <div className="w-[16.66%] px-2">PostgreSQL</div>
              <div className="w-[16.66%] px-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
              <div className="w-[16.66%] px-2 text-right">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLineJoin="round" className="lucide lucide-more-horizontal">
                    <circle cx="12" cy="12" r="1"/>
                    <circle cx="19" cy="12" r="1"/>
                    <circle cx="5" cy="12" r="1"/>
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 