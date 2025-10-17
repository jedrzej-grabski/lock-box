"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api, type DataRoom } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, FolderLock, LogOut, User, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function DashboardPage() {
  const router = useRouter()
  const { logout, user } = useAuth()
  const [ownedRooms, setOwnedRooms] = useState<DataRoom[]>([])
  const [sharedRooms, setSharedRooms] = useState<DataRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [newRoomDescription, setNewRoomDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState("")
  const [userRole, setUserRole] = useState<"owner" | "guest">("owner")

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
      return
    }
    const role = (localStorage.getItem("user_role") as "owner" | "guest") || "owner"
    setUserRole(role)
    loadRooms()
  }, [router])

  const loadRooms = async () => {
    try {
      setIsLoading(true)
      const data = await api.getRooms()
      const userId = localStorage.getItem("user_id")
      const owned = data.filter((room) => room.owner_id === userId)
      const shared = data.filter((room) => room.owner_id !== userId)
      setOwnedRooms(owned)
      setSharedRooms(shared)
    } catch (err) {
      console.error("Failed to load rooms:", err)
      setError("Failed to load data rooms")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return

    try {
      setIsCreating(true)
      setError("")
      await api.createRoom(newRoomName, newRoomDescription)
      setNewRoomName("")
      setNewRoomDescription("")
      setIsCreateDialogOpen(false)
      await loadRooms()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room")
    } finally {
      setIsCreating(false)
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this data room? This action cannot be undone.")) return

    try {
      await api.deleteRoom(roomId)
      await loadRooms()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete room")
    }
  }

  const renderRoomGrid = (rooms: DataRoom[], showDelete = false) => {
    if (rooms.length === 0) return null

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => (
          <Card
            key={room.id}
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={() => router.push(`/rooms/${room.id}`)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderLock className="h-5 w-5 text-primary" />
                {room.name}
              </CardTitle>
              <CardDescription className="line-clamp-2">{room.description || "No description"}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Created {new Date(room.created_at).toLocaleDateString()}
                </p>
                {showDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteRoom(room.id, e)}
                    className="h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderLock className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">LockBox</h1>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm">
                  <User className="h-4 w-4 mr-2" />
                  Account
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">{user?.full_name || "User"}</p>
                    <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="text-sm font-medium capitalize">{user?.role || userRole}</p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {userRole === "owner" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-semibold mb-2">My Data Rooms</h2>
                <p className="text-muted-foreground">Manage your secure document repositories</p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Data Room
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Data Room</DialogTitle>
                    <DialogDescription>Set up a new secure space for sharing documents</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Room Name</Label>
                      <Input
                        id="name"
                        placeholder="Q4 Financial Documents"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Quarterly financial reports and supporting documents"
                        value={newRoomDescription}
                        onChange={(e) => setNewRoomDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex gap-3 justify-end">
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? "Creating..." : "Create Room"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading data rooms...</p>
              </div>
            ) : ownedRooms.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderLock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No data rooms yet</h3>
                  <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                    Create your first data room to start securely sharing documents with guests
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Data Room
                  </Button>
                </CardContent>
              </Card>
            ) : (
              renderRoomGrid(ownedRooms, true)
            )}
          </div>
        )}

        {sharedRooms.length > 0 && (
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-semibold mb-2">Shared With Me</h2>
              <p className="text-muted-foreground">Access data rooms shared with you</p>
            </div>

            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading shared rooms...</p>
              </div>
            ) : (
              renderRoomGrid(sharedRooms)
            )}
          </div>
        )}

        {userRole === "guest" && !isLoading && sharedRooms.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderLock className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No shared rooms</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                You don't have access to any data rooms yet. Ask an owner to send you an invite.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
