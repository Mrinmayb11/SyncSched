import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, PlusCircle, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card"

const IntegrationRow = ({ integration, onEdit, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasMappings = integration.mappings && integration.mappings.length > 0;

    return (
        <React.Fragment>
            <TableRow>
                <TableCell>
                    {hasMappings && (
                    <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    )}
                </TableCell>
                <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        <span>{integration.webflow_site_name || integration.source?.site_name || 'Unnamed Site'}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span>{integration.notion_workspace_name || integration.target?.page_name || 'Notion Workspace'}</span>
                    </div>
                    {integration.integration_name && (
                      <p className="text-sm text-muted-foreground">{integration.integration_name}</p>
                    )}
                </TableCell>
                <TableCell>
                    <Badge variant={integration.status === 'active' ? 'secondary' : 'outline'}>
                        {integration.status || 'active'}
                    </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                    {hasMappings ? `${integration.mappings.length} mappings` : 'No mappings'}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                    {integration.created_at ? new Date(integration.created_at).toLocaleDateString() : 'N/A'}
                </TableCell>
                <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => onEdit(integration.id)}>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </TableCell>
            </TableRow>
            {isExpanded && hasMappings && (
                <TableRow>
                    <TableCell colSpan={6}>
                        <div className="p-4 bg-muted/50 rounded-md">
                            <h4 className="font-semibold mb-3">Collection to Database Mappings</h4>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Webflow Collection</TableHead>
                                        <TableHead>Notion Database</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {integration.mappings.map(mapping => (
                                        <TableRow key={mapping.id}>
                                            <TableCell>{mapping.webflow_collection_name}</TableCell>
                                            <TableCell>{mapping.notion_database_name}</TableCell>
                                            <TableCell>
                                                <Badge variant={mapping.is_active ? 'secondary' : 'outline'}>
                                                    {mapping.is_active ? 'Active' : 'Paused'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    );
};


export default function ExistingSyncsTable({ syncs, onAddNew, onEdit }) {

    if (!syncs || syncs.length === 0) {
        return (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold text-gray-800">No Site Integrations Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                You haven't connected any Webflow sites to Notion pages yet.
              </p>
              <Button onClick={onAddNew} className="mt-4">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Integration
              </Button>
            </div>
        )
    }

  return (
    <Card>
        <CardHeader>
            <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Your Site Integrations</CardTitle>
                    <CardDescription>Manage your connections between Webflow sites and Notion pages.</CardDescription>
                </div>
                <Button onClick={onAddNew}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead style={{ width: '40px' }}></TableHead>
                    <TableHead>Integration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Mappings</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                    {syncs.map((integration) => (
                        <IntegrationRow key={integration.id} integration={integration} onEdit={onEdit} />
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>

  );
} 