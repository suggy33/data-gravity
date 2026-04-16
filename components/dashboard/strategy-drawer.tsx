"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Sparkles, Send, Mail, MessageSquare, Target } from "lucide-react"
import type { Segment } from "@/app/dashboard/page"

interface StrategyDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  segment: Segment | null
}

const strategyContent: Record<string, { 
  headline: string
  subjectLines: string[]
  emailCopy: string
  smsCopy: string
}> = {
  "High-Value Loyalists": {
    headline: "VIP Appreciation Campaign",
    subjectLines: [
      "You deserve the best. Here is your exclusive offer.",
      "A special thank you for being our top customer",
      "Unlock your VIP-only benefits today",
    ],
    emailCopy: "As one of our most valued customers, we wanted to personally thank you for your continued loyalty. To show our appreciation, we are offering you an exclusive 25% discount on your next purchase, plus early access to our upcoming product launches.",
    smsCopy: "Hi [Name]! As a VIP customer, enjoy 25% off your next order. Use code VIP25 at checkout. Shop now: [link]",
  },
  "At-Risk Champions": {
    headline: "Win-Back Re-engagement",
    subjectLines: [
      "We miss you. Come back for 30% off.",
      "Your account has special rewards waiting",
      "It has been a while. Let us make it up to you.",
    ],
    emailCopy: "We noticed it has been a while since your last visit, and we miss having you as part of our community. We would love to welcome you back with an exclusive 30% discount and free shipping on your next order.",
    smsCopy: "Hey [Name], we miss you! Here is 30% off + free shipping to welcome you back. Expires in 48hrs: [link]",
  },
  "New Potential": {
    headline: "Nurture and Educate",
    subjectLines: [
      "Getting started? Here is everything you need to know.",
      "Welcome! Discover what makes us different.",
      "Your journey with us starts here.",
    ],
    emailCopy: "Welcome to our community! We are thrilled to have you here. To help you get the most out of your experience, we have put together a special guide showcasing our most popular products and features.",
    smsCopy: "Welcome to [Brand]! Reply YES to get personalized product recommendations based on your interests.",
  },
  "Casual Browsers": {
    headline: "Conversion Incentive",
    subjectLines: [
      "Still thinking about it? Here is 15% off.",
      "Your cart misses you.",
      "Ready to take the leap? We will sweeten the deal.",
    ],
    emailCopy: "We noticed you have been exploring our collection. To help you make your first purchase, we are offering an exclusive 15% discount for new customers. Plus, enjoy free returns for 30 days.",
    smsCopy: "Still browsing? Grab 15% off your first order with code FIRST15. Free returns included! Shop: [link]",
  },
  "Dormant Users": {
    headline: "Reactivation Campaign",
    subjectLines: [
      "A lot has changed. Come see what is new.",
      "We have got something special just for you.",
      "Ready for a fresh start? 40% off inside.",
    ],
    emailCopy: "It has been a while! We have made some exciting updates and would love for you to see what is new. As a special welcome-back offer, enjoy 40% off your next purchase. This is our way of saying we would love to reconnect.",
    smsCopy: "Long time no see! We have got a 40% off surprise waiting for you. Valid this week only: [link]",
  },
}

export function StrategyDrawer({ open, onOpenChange, segment }: StrategyDrawerProps) {
  if (!segment) return null

  const strategy = strategyContent[segment.clusterName] || strategyContent["New Potential"]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full border-border bg-card sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-foreground">AI Strategy</SheetTitle>
              <SheetDescription className="text-muted-foreground">
                Generated for {segment.clusterName}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Segment info */}
          <div className="rounded-lg border border-border bg-secondary/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Segment</span>
              <Badge variant="outline" className="border-primary/50 text-primary">
                {segment.customerCount.toLocaleString()} customers
              </Badge>
            </div>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{strategy.headline}</h3>
          </div>

          {/* Subject lines */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-medium text-foreground">Subject Lines</h4>
            </div>
            <div className="space-y-2">
              {strategy.subjectLines.map((line, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border bg-secondary/20 p-3 text-sm text-foreground"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* Email copy */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-medium text-foreground">Email Copy</h4>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm leading-relaxed text-muted-foreground">
              {strategy.emailCopy}
            </div>
          </div>

          {/* SMS copy */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-medium text-foreground">SMS Copy</h4>
            </div>
            <div className="rounded-lg border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
              {strategy.smsCopy}
            </div>
          </div>

          {/* Deploy button */}
          <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Send className="h-4 w-4" />
            Deploy to AWS Pinpoint
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
