import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Lock, Shield, Users, FileCheck } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-6 w-6" />
            <span className="text-xl font-semibold">LockBox</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-5xl font-semibold tracking-tight text-balance">
              Secure Document Sharing for Confidential Business
            </h1>
            <p className="text-xl text-muted-foreground text-pretty">
              Share sensitive documents with complete control. Create secure data rooms, manage access with precision,
              and maintain full audit trails for compliance.
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <Link href="/register">
                <Button size="lg" className="text-base">
                  Try It Now!
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="text-base bg-transparent">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">Bank-Grade Security</h3>
              <p className="text-muted-foreground">
                End-to-end encryption, JWT authentication, and comprehensive audit logs ensure your documents stay
                protected.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">Granular Access Control</h3>
              <p className="text-muted-foreground">
                Create time-limited invites, set usage limits, and revoke access instantly when needed.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 space-y-3">
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <FileCheck className="h-6 w-6 text-accent" />
              </div>
              <h3 className="text-lg font-semibold">Complete Audit Trail</h3>
              <p className="text-muted-foreground">
                Track every action with detailed logs. Know exactly who accessed what and when.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 py-16">
          <div className="container mx-auto px-4 text-center space-y-6">
            <h2 className="text-3xl font-semibold">Trusted by businesses handling sensitive data</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From M&A transactions to legal document sharing, LockBox provides the security and control you need for
              confidential business operations.
            </p>
            <Link href="/register">
              <Button size="lg" className="mt-4">
                Create Your First Data Room
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 LockBox Secure Systems. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
