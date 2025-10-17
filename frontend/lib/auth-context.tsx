"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { api, type User } from "./api"
import { useRouter } from "next/navigation"

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string, redirectTo?: string) => Promise<void>
  register: (
    email: string,
    password: string,
    full_name: string,
    role: "owner" | "guest",
    redirectTo?: string,
  ) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      api
        .getCurrentUser()
        .then((userData) => {
          setUser(userData)
          localStorage.setItem("user_role", userData.role)
        })
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem("access_token")
          localStorage.removeItem("refresh_token")
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (email: string, password: string, redirectTo?: string) => {
    try {
      await api.login(email, password)
      const userData = await api.getCurrentUser()
      setUser(userData)
      localStorage.setItem("user_role", userData.role)
      router.push(redirectTo || "/dashboard")
    } catch (error) {
      throw error
    }
  }

  const register = async (
    email: string,
    password: string,
    full_name: string,
    role: "owner" | "guest",
    redirectTo?: string,
  ) => {
    try {
      await api.register(email, password, full_name, role)
      const userData = await api.getCurrentUser()
      setUser(userData)
      localStorage.setItem("user_role", userData.role)
      router.push(redirectTo || "/dashboard")
    } catch (error) {
      throw error
    }
  }

  const logout = async () => {
    try {
      await api.logout()
      setUser(null)
      router.push("/login")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
