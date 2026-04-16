"use client";

import { DashboardHeader } from "@/components/dashboard/header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "connected" | "disconnected" | "pending";
  features: string[];
  color: string;
}

const integrations: IntegrationConfig[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    description:
      "Sync customer segments and insights directly to Salesforce CRM for targeted campaigns",
    icon: "☁️",
    status: "disconnected",
    features: [
      "Segment sync to Salesforce accounts",
      "Real-time data updates",
      "Custom field mapping",
      "Campaign orchestration",
    ],
    color: "from-blue-600 to-blue-400",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description:
      "Connect your customer data to HubSpot for seamless marketing automation",
    icon: "🎯",
    status: "disconnected",
    features: [
      "Contact list synchronization",
      "Property mapping",
      "Workflow automation triggers",
      "Report generation",
    ],
    color: "from-orange-600 to-orange-400",
  },
  {
    id: "braze",
    name: "Braze",
    description:
      "Enable personalized customer engagement through Braze's cross-channel messaging",
    icon: "📱",
    status: "disconnected",
    features: [
      "Audience segment creation",
      "User attribute sync",
      "Campaign performance tracking",
      "Multi-channel messaging",
    ],
    color: "from-purple-600 to-purple-400",
  },
];

export default function IntegrationsPage() {
  const handleConnect = (integrationId: string) => {
    console.log(`Connecting to ${integrationId}`);
    // Integration logic will go here
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "disconnected":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="flex flex-col">
      <DashboardHeader />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Integrations
          </h1>
          <p className="text-muted-foreground">
            Connect Data Gravity with your favorite tools to sync customer
            insights and automate campaigns
          </p>
        </div>

        {/* Integration Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card
              key={integration.id}
              className="border-border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-shadow"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{integration.icon}</div>
                    <div>
                      <CardTitle className="text-lg">
                        {integration.name}
                      </CardTitle>
                      <Badge
                        className={`mt-1 ${getStatusColor(integration.status)}`}
                      >
                        {getStatusText(integration.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <CardDescription className="mt-2">
                  {integration.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Features */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Features:
                  </p>
                  <ul className="space-y-1">
                    {integration.features.map((feature, idx) => (
                      <li
                        key={idx}
                        className="text-sm text-muted-foreground flex items-center gap-2"
                      >
                        <span className="text-primary">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleConnect(integration.id)}
                  className="w-full"
                  variant={
                    integration.status === "connected" ? "outline" : "default"
                  }
                >
                  {integration.status === "connected" ? "Manage" : "Connect"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info Section */}
        <Card className="border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Integration Help</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">
                How to Connect
              </h4>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Click the "Connect" button on any integration card</li>
                <li>You'll be redirected to authorize Data Gravity</li>
                <li>Grant the necessary permissions for data sync</li>
                <li>Configure your data mapping preferences</li>
                <li>Start syncing your customer insights</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-2">Need Help?</h4>
              <p className="text-sm text-muted-foreground">
                Check our{" "}
                <a href="#" className="text-primary hover:underline">
                  integration documentation
                </a>{" "}
                or contact support at support@datagravity.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
