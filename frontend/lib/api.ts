const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1"

export interface ApiError {
  detail: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  access_expires_in: number
}

export interface User {
  id: string
  email: string
  full_name: string
  role: "owner" | "guest"
  is_verified: boolean
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface DataRoom {
  id: string
  owner_id: string
  name: string
  description: string
  created_at: string
}

export interface Document {
  id: string
  data_room_id: string
  uploaded_by: string
  filename: string
  content_type: string
  size_bytes: number
  sha256_hash?: string
  storage_key: string
  uploaded_at: string
}

export interface Invite {
  id: string
  data_room_id: string
  created_by: string
  allowed_email?: string
  max_uses?: number
  uses_count: number
  expires_at?: string
  revoked: boolean
  created_at: string
}

export interface Share {
  id: string
  data_room_id: string
  user_id: string
  user_full_name?: string
  user_email?: string
  role: "owner" | "guest"
  expires_at?: string
  revoked: boolean
  created_at: string
}

export interface Download {
  id?: string
  data_room_id?: string
  document_id: string
  user_id: string
  full_name?: string
  email?: string

  filename: string
  timestamp: string
}
class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("access_token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 204 || response.status === 205) {
      if (!response.ok) {
        throw new Error(response.statusText || "Request failed")
      }
      return undefined as unknown as T
    }

    if (response.status === 401) {
      this.clearTokens()
      window.location.href = "/login"
      throw new Error("Session expired. Please login again.")
    }

    const text = await response.text()

    if (!response.ok) {
      let message = "An error occurred"
      try {
        const err = text ? (JSON.parse(text) as ApiError) : undefined
        message = err?.detail || message
      } catch {
        message = text || message
      }
      throw new Error(message)
    }

    if (!text) {
      return undefined as unknown as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      // Fallback if server returns non-JSON for successful responses
      return text as unknown as T
    }
  }

  // Auth endpoints
  async register(email: string, password: string, full_name: string, role: "owner" | "guest"): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name, role }),
    })
    const tokens = await this.handleResponse<AuthTokens>(response)
    this.storeTokens(tokens)
    return tokens
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const tokens = await this.handleResponse<AuthTokens>(response)
    this.storeTokens(tokens)
    return tokens
  }

  async refresh(): Promise<AuthTokens> {
    const refreshToken = localStorage.getItem("refresh_token")
    if (!refreshToken) throw new Error("No refresh token available")

    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const tokens = await this.handleResponse<AuthTokens>(response)
    this.storeTokens(tokens)
    return tokens
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem("refresh_token")
    if (refreshToken) {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    }
    this.clearTokens()
  }

  private storeTokens(tokens: AuthTokens): void {
    localStorage.setItem("access_token", tokens.access_token)
    localStorage.setItem("refresh_token", tokens.refresh_token)
  }

  private clearTokens(): void {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("user_id")
    localStorage.removeItem("user_role")
  }

  // Data Rooms endpoints
  async getRooms(): Promise<DataRoom[]> {
    const response = await fetch(`${this.baseUrl}/rooms/`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<DataRoom[]>(response)
  }

  async createRoom(name: string, description: string): Promise<DataRoom> {
    const response = await fetch(`${this.baseUrl}/rooms/`, {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    })
    return this.handleResponse<DataRoom>(response)
  }

  async getRoomShares(roomId: string): Promise<Share[]> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/shares`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<Share[]>(response)
  }

  async revokeAccess(roomId: string, userId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/shares/${userId}/revoke`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    })
    await this.handleResponse<void>(response)
  }

  async deleteRoom(roomId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    })
    await this.handleResponse<void>(response)
  }

  // Documents endpoints
  async getDocuments(roomId: string): Promise<Document[]> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/documents/`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<Document[]>(response)
  }

  async presignUpload(roomId: string): Promise<{ upload_url: string; storage_key: string; expires_in: number }> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/documents/presign`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<{ upload_url: string; storage_key: string; expires_in: number }>(response)
  }

  async confirmUpload(
    roomId: string,
    filename: string,
    content_type: string,
    size_bytes: number,
    storage_key: string,
    sha256_hash?: string,
  ): Promise<Document> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/documents/confirm`, {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content_type, size_bytes, storage_key, sha256_hash }),
    })
    return this.handleResponse<Document>(response)
  }

  async getDownloadUrl(roomId: string, docId: string): Promise<{ download_url: string }> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/documents/${docId}/download`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<{ download_url: string }>(response)
  }

  async deleteDocument(roomId: string, docId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/documents/${docId}`, {
      method: "DELETE",
      headers: this.getAuthHeaders(),
    })
    await this.handleResponse<void>(response)
  }

  // Invites endpoints
  async getRoomInvites(roomId: string): Promise<Invite[]> {
    const response = await fetch(`${this.baseUrl}/invites/room/${roomId}`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<Invite[]>(response)
  }

  async createInvite(
    data_room_id: string,
    allowed_email?: string,
    max_uses?: number,
    expires_hours?: number,
    single_use?: boolean,
  ): Promise<{ invite_id: string; raw_token: string; invite_link_path: string }> {
    const body: any = { data_room_id }

    if (allowed_email) body.allowed_email = allowed_email
    if (expires_hours) body.expires_hours = expires_hours

    // Handle single_use and max_uses logic
    if (single_use) {
      body.single_use = true
    } else if (max_uses !== undefined && max_uses > 0) {
      body.single_use = false
      body.max_uses = max_uses
    }
    // If neither single_use nor max_uses is set, omit both for unlimited uses

    const response = await fetch(`${this.baseUrl}/invites/`, {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return this.handleResponse<{ invite_id: string; raw_token: string; invite_link_path: string }>(response)
  }

  async acceptInvite(token: string): Promise<Share> {
    const response = await fetch(`${this.baseUrl}/invites/accept?token=${token}`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<Share>(response)
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/invites/${inviteId}/revoke`, {
      method: "POST",
      headers: this.getAuthHeaders(),
    })
    await this.handleResponse<void>(response)
  }

  async getRoomDownloads(roomId: string): Promise<Download[]> {
    const response = await fetch(`${this.baseUrl}/rooms/${roomId}/downloads`, {
      headers: this.getAuthHeaders(),
    })
    return this.handleResponse<Download[]>(response)
  }

  async getCurrentUser(): Promise<User> {
    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: this.getAuthHeaders(),
    })
    const user = await this.handleResponse<User>(response)
    localStorage.setItem("user_id", user.id)
    localStorage.setItem("user_role", user.role)
    return user
  }
}

export const api = new ApiClient(API_BASE_URL)
