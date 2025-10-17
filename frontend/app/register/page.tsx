import { RegisterForm } from "@/components/auth/register-form"
import Link from "next/link"
import { Lock } from "lucide-react"

export default function RegisterPage() {
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
        <RegisterForm />
      </div>
    </div>
  )
}
