"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Cloud, Shield } from "lucide-react"

const awsRegions = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
]

export function AwsConnectionModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handleTrigger = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("[data-aws-modal-trigger]")) {
        setOpen(true)
      }
    }
    document.addEventListener("click", handleTrigger)
    return () => document.removeEventListener("click", handleTrigger)
  }, [])

  const handleConnect = () => {
    window.alert(
      "AWS integration is not yet wired up. Use the Data Sources page to upload a CSV directly.",
    )
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Cloud className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-foreground">AWS Connection</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Connect your AWS account to access data sources
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); handleConnect(); }}>
          <div className="space-y-2">
            <Label htmlFor="region" className="text-foreground">AWS Region</Label>
            <Select defaultValue="us-east-1">
              <SelectTrigger className="border-border bg-secondary/50 text-foreground">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover">
                {awsRegions.map((region) => (
                  <SelectItem
                    key={region.value}
                    value={region.value}
                    className="text-foreground focus:bg-accent focus:text-accent-foreground"
                  >
                    {region.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessKey" className="text-foreground">Access Key ID</Label>
            <Input
              id="accessKey"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              className="border-border bg-secondary/50 font-mono text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secretKey" className="text-foreground">Secret Access Key</Label>
            <Input
              id="secretKey"
              type="password"
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              className="border-border bg-secondary/50 font-mono text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">
              Credentials are encrypted and never stored in plaintext
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Connect
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
