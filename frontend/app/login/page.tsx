"use client"

import { LoginForm } from "@/components/auth/login-form"
import Link from "next/link"
import { Lock } from "lucide-react"
import { useEffect } from "react"
import { useSearchParams } from "next/navigation"

export default function LoginPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const redirect = searchParams.get("redirect")
    if (redirect) {
      sessionStorage.setItem("post_auth_redirect", redirect)
    } else {
      // clear any stale redirect if none provided
      sessionStorage.removeItem("post_auth_redirect")
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-semibold">
            <Lock className="h-7 w-7" />
            <span>LockBox</span>
          </Link>
          <p className="text-muted-foreground">Secure document sharing platform</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
