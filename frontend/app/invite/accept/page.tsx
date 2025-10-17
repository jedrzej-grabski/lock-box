"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FolderLock, CheckCircle, XCircle } from "lucide-react"

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [isAccepting, setIsAccepting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token")
    if (!accessToken) {
      const currentUrl = `/invite/accept?token=${token}`
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`)
    }
  }, [router, token])

  const handleAcceptInvite = async () => {
    if (!token) {
      setError("Invalid invite link")
      return
    }

    try {
      setIsAccepting(true)
      await api.acceptInvite(token)
      setSuccess(true)
      setTimeout(() => {
        router.push("/dashboard")
      }, 2000)
    } catch (err) {
      console.error("Accept invite error:", err)
      setError(err instanceof Error ? err.message : "Failed to accept invite")
    } finally {
      setIsAccepting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <FolderLock className="h-12 w-12 text-primary" />
          </div>
          <CardTitle>Data Room Invite</CardTitle>
          <CardDescription>You've been invited to access a secure data room</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-primary mx-auto" />
              <div>
                <h3 className="font-medium mb-1">Access Granted</h3>
                <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <div>
                <h3 className="font-medium mb-1">Error</h3>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button onClick={() => router.push("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Click the button below to accept this invite and gain access to the shared documents.
              </p>
              <Button onClick={handleAcceptInvite} disabled={isAccepting || !token} className="w-full">
                {isAccepting ? "Accepting..." : "Accept Invite"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
