"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { api, type Document, type Invite, type Share, type Download } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ArrowLeft,
  Upload,
  DownloadIcon,
  Trash2,
  File,
  FolderLock,
  Users,
  Plus,
  Copy,
  Mail,
  Clock,
  Ban,
  UserX,
  Eye,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function RoomDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const roomId = params.id as string

  const initialTab = searchParams.get("tab") || "documents"
  const [activeTab, setActiveTab] = useState(initialTab)

  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [invites, setInvites] = useState<Invite[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [downloads, setDownloads] = useState<Download[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingInvites, setIsLoadingInvites] = useState(false)
  const [isLoadingShares, setIsLoadingShares] = useState(false)
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState("")
  const [previewFilename, setPreviewFilename] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [userRole, setUserRole] = useState<"owner" | "guest">("owner")
  const [isRoomOwner, setIsRoomOwner] = useState(false)
  const [roomOwnerId, setRoomOwnerId] = useState<string | null>(null)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("")
  const [singleUse, setSingleUse] = useState(false)
  const [maxUses, setMaxUses] = useState("")
  const [expiresHours, setExpiresHours] = useState("168")
  const [isCreatingInvite, setIsCreatingInvite] = useState(false)
  const [generatedInviteLink, setGeneratedInviteLink] = useState("")

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) {
      router.push("/login")
      return
    }
    const role = (localStorage.getItem("user_role") as "owner" | "guest") || "owner"
    setUserRole(role)
    loadDocuments()
    loadInvites()
    loadShares()
    loadDownloads()
  }, [roomId, router])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set("tab", activeTab)
    window.history.replaceState({}, "", url.toString())
  }, [activeTab])

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredDocuments(documents)
    } else {
      const filtered = documents.filter((doc) => doc.filename.toLowerCase().includes(searchQuery.toLowerCase()))
      setFilteredDocuments(filtered)
    }
  }, [searchQuery, documents])

  const loadDocuments = async () => {
    try {
      setIsLoading(true)
      const data = await api.getRooms()
      const currentRoom = data.find((r) => r.id === roomId)
      if (currentRoom) {
        setRoomOwnerId(currentRoom.owner_id)
        const userId = localStorage.getItem("user_id")
        setIsRoomOwner(currentRoom.owner_id === userId)
      }

      const docs = await api.getDocuments(roomId)
      setDocuments(docs)
      setFilteredDocuments(docs)
    } catch (err) {
      console.error("Failed to load documents:", err)
      toast.error("Failed to load documents")
    } finally {
      setIsLoading(false)
    }
  }

  const loadInvites = async () => {
    try {
      setIsLoadingInvites(true)
      const data = await api.getRoomInvites(roomId)
      setInvites(data)
    } catch (err) {
      console.error("Failed to load invites:", err)
    } finally {
      setIsLoadingInvites(false)
    }
  }

  const loadShares = async () => {
    try {
      setIsLoadingShares(true)
      const data = await api.getRoomShares(roomId)
      setShares(data)
    } catch (err) {
      console.error("Failed to load shares:", err)
    } finally {
      setIsLoadingShares(false)
    }
  }

  const loadDownloads = async () => {
    try {
      setIsLoadingDownloads(true)
      const data = await api.getRoomDownloads(roomId)
      setDownloads(data)
    } catch (err) {
      console.error("Failed to load downloads:", err)
    } finally {
      setIsLoadingDownloads(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const allowedExtensions = [".txt", ".pdf", ".md"]
      const fileExtension = "." + file.name.split(".").pop()?.toLowerCase()

      if (!allowedExtensions.includes(fileExtension)) {
        toast.error("Only .txt, .pdf, and .md files are allowed")
        return
      }

      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setIsUploading(true)

      const { upload_url, storage_key } = await api.presignUpload(roomId)

      const uploadResponse = await fetch(upload_url, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type,
        },
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to storage")
      }

      await api.confirmUpload(roomId, selectedFile.name, selectedFile.type, selectedFile.size, storage_key)

      toast.success("Document uploaded successfully")

      setSelectedFile(null)
      setUploadDialogOpen(false)
      await loadDocuments()
    } catch (err) {
      console.error("Upload error:", err)
      toast.error(err instanceof Error ? err.message : "Failed to upload document")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDownload = async (doc: Document) => {
    try {
      const { download_url } = await api.getDownloadUrl(roomId, doc.id)
      window.open(download_url, "_blank")
      await loadDownloads()
    } catch (err) {
      console.error("Download error:", err)
      toast.error("Failed to download document")
    }
  }

  const handlePreview = async (doc: Document) => {
    try {
      const { download_url } = await api.getDownloadUrl(roomId, doc.id)

      // Fetch the file content
      const response = await fetch(download_url)
      const blob = await response.blob()

      if (doc.content_type === "application/pdf") {
        // For PDFs, open in new tab
        window.open(download_url, "_blank")
      } else {
        // For text files, show in dialog
        const text = await blob.text()
        setPreviewContent(text)
        setPreviewFilename(doc.filename)
        setPreviewDialogOpen(true)
      }
    } catch (err) {
      console.error("Preview error:", err)
      toast.error("Failed to preview document")
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return

    try {
      await api.deleteDocument(roomId, docId)
      toast.success("Document deleted successfully")
      await loadDocuments()
    } catch (err) {
      console.error("Delete error:", err)
      toast.error("Failed to delete document")
    }
  }

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsCreatingInvite(true)

      let maxUsesValue: number | undefined = undefined
      if (singleUse) {
        maxUsesValue = undefined
      } else if (maxUses && Number.parseInt(maxUses) > 0) {
        maxUsesValue = Number.parseInt(maxUses)
      }
      // If neither single_use nor maxUses, both are omitted for unlimited

      const result = await api.createInvite(
        roomId,
        inviteEmail || undefined,
        maxUsesValue,
        Number.parseInt(expiresHours) || undefined,
        singleUse || undefined,
      )

      const fullLink = `${window.location.origin}/invite/accept?token=${result.raw_token}`
      setGeneratedInviteLink(fullLink)

      toast.success("Invite created successfully")

      await loadInvites()
    } catch (err) {
      console.error("Create invite error:", err)
      toast.error(err instanceof Error ? err.message : "Failed to create invite")
    } finally {
      setIsCreatingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) return

    try {
      await api.revokeInvite(inviteId)
      toast.success("Invite revoked successfully")
      await loadInvites()
    } catch (err) {
      console.error("Revoke invite error:", err)
      toast.error("Failed to revoke invite")
    }
  }

  const handleRevokeAccess = async (userId: string) => {
    if (!confirm("Are you sure you want to revoke this user's access?")) return

    try {
      await api.revokeAccess(roomId, userId)
      toast.success("User access revoked successfully")
      await loadShares()
    } catch (err) {
      console.error("Revoke access error:", err)
      toast.error("Failed to revoke access")
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedInviteLink)
    toast.success("Invite link copied to clipboard")
  }

  const handleResetInviteDialog = () => {
    setInviteEmail("")
    setSingleUse(false)
    setMaxUses("")
    setExpiresHours("168")
    setGeneratedInviteLink("")
    setInviteDialogOpen(false)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const isInviteFullyUsed = (invite: Invite) => {
    return invite.max_uses !== undefined && invite.uses_count >= invite.max_uses
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <FolderLock className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Data Room</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {isRoomOwner ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList>
              <TabsTrigger value="documents">
                <File className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="invites">
                <Users className="h-4 w-4 mr-2" />
                Invites
              </TabsTrigger>
              <TabsTrigger value="users">
                <UserX className="h-4 w-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="downloads">
                <DownloadIcon className="h-4 w-4 mr-2" />
                Downloads
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-1">Documents</h2>
                  <p className="text-sm text-muted-foreground">Manage files in this data room</p>
                </div>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Loading documents...</p>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <File className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">
                      {searchQuery ? "No documents found" : "No documents yet"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      {searchQuery
                        ? "Try a different search term"
                        : "Upload your first document to start sharing with guests"}
                    </p>
                    {!searchQuery && (
                      <Button onClick={() => setUploadDialogOpen(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Document
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <File className="h-8 w-8 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium truncate">{doc.filename}</h3>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(doc.size_bytes)} • Uploaded{" "}
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handlePreview(doc)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                            <DownloadIcon className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(doc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="invites" className="space-y-6">
              {/* ... existing invites tab code ... */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-1">Invites</h2>
                  <p className="text-sm text-muted-foreground">Share access to this data room</p>
                </div>
                <Button onClick={() => setInviteDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invite
                </Button>
              </div>

              {isLoadingInvites ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Loading invites...</p>
                </div>
              ) : invites.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No invites yet</h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      Create an invite link to share this data room with guests
                    </p>
                    <Button onClick={() => setInviteDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Invite
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {invites.map((invite) => {
                    const fullyUsed = isInviteFullyUsed(invite)
                    return (
                      <Card key={invite.id} className={invite.revoked || fullyUsed ? "opacity-60" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                {invite.allowed_email ? (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">{invite.allowed_email}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Open invite</span>
                                )}
                                {invite.revoked && (
                                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                                    Revoked
                                  </span>
                                )}
                                {fullyUsed && !invite.revoked && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                                    Fully Used
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  <span>
                                    {invite.uses_count}/{invite.max_uses || "∞"} uses
                                  </span>
                                </div>
                                {invite.expires_at && (
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>Expires {new Date(invite.expires_at).toLocaleDateString()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {!invite.revoked && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRevokeInvite(invite.id)}
                                disabled={fullyUsed}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-1">Users</h2>
                  <p className="text-sm text-muted-foreground">Manage users who have access to this data room</p>
                </div>
              </div>

              {isLoadingShares ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Loading users...</p>
                </div>
              ) : shares.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No users yet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                      Users who accept invites will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {shares.map((share) => (
                    <Card key={share.id} className={share.revoked ? "opacity-60" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{share.user_full_name || "Unknown User"}</span>
                              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded capitalize">
                                {share.role}
                              </span>
                              {share.revoked && (
                                <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                                  Revoked
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{share.user_email || "No email"}</span>
                              <span>•</span>
                              <span>Joined {new Date(share.created_at).toLocaleDateString()}</span>
                              {share.expires_at && (
                                <>
                                  <span>•</span>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>Expires {new Date(share.expires_at).toLocaleDateString()}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          {!share.revoked && share.role === "guest" && (
                            <Button variant="outline" size="sm" onClick={() => handleRevokeAccess(share.user_id)}>
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="downloads" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-1">Downloads</h2>
                  <p className="text-sm text-muted-foreground">Track who downloaded which files</p>
                </div>
              </div>

              {isLoadingDownloads ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Loading downloads...</p>
                </div>
              ) : downloads.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <DownloadIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No downloads yet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                      Download history will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Downloaded At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {downloads.map((download, index) => (
                        <TableRow key={`${download.id}-${index}`}>
                          <TableCell className="font-medium">{download.full_name}</TableCell>
                          <TableCell>{download.email}</TableCell>
                          <TableCell>{download.filename}</TableCell>
                          <TableCell>{new Date(download.timestamp).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-1">Documents</h2>
              <p className="text-sm text-muted-foreground">View and download shared documents</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <File className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {searchQuery ? "No documents found" : "No documents available"}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    {searchQuery ? "Try a different search term" : "The owner hasn't uploaded any documents yet"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <File className="h-8 w-8 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{doc.filename}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(doc.size_bytes)} • Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handlePreview(doc)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                          <DownloadIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Upload Dialog - Owner only */}
      {isRoomOwner && (
        <>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
                <DialogDescription>Select a file to upload to this data room (.txt, .pdf, .md only)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    accept=".txt,.pdf,.md"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    {selectedFile ? (
                      <div>
                        <p className="font-medium">{selectedFile.name}</p>
                        <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium mb-1">Click to select a file</p>
                        <p className="text-sm text-muted-foreground">or drag and drop</p>
                        <p className="text-xs text-muted-foreground mt-2">Allowed: .txt, .pdf, .md</p>
                      </div>
                    )}
                  </label>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={isUploading}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
                    {isUploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={inviteDialogOpen} onOpenChange={(open) => !open && handleResetInviteDialog()}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Invite</DialogTitle>
                <DialogDescription>Generate a secure link to share this data room</DialogDescription>
              </DialogHeader>

              {generatedInviteLink ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-xs text-muted-foreground mb-2 block">Invite Link</Label>
                    <div className="flex items-center gap-2">
                      <Input value={generatedInviteLink} readOnly className="font-mono text-sm" />
                      <Button size="sm" onClick={handleCopyLink}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Share this link with guests to grant them access to this data room.
                  </p>
                  <Button onClick={handleResetInviteDialog} className="w-full">
                    Done
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateInvite} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="guest@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Restrict this invite to a specific email address</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="expires">Expires In (Hours)</Label>
                    <Input
                      id="expires"
                      type="number"
                      placeholder="168"
                      value={expiresHours}
                      onChange={(e) => setExpiresHours(e.target.value)}
                      min="1"
                    />
                    <p className="text-xs text-muted-foreground">Default: 168 hours (7 days)</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="single-use">Single Use</Label>
                      <p className="text-xs text-muted-foreground">Invite can only be used once</p>
                    </div>
                    <Switch id="single-use" checked={singleUse} onCheckedChange={setSingleUse} />
                  </div>

                  {!singleUse && (
                    <div className="space-y-2">
                      <Label htmlFor="max-uses">Max Uses (Optional)</Label>
                      <Input
                        id="max-uses"
                        type="number"
                        placeholder="Leave blank for unlimited"
                        value={maxUses}
                        onChange={(e) => setMaxUses(e.target.value)}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        Specify how many times this invite can be used. Leave blank for unlimited uses.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 justify-end pt-4">
                    <Button type="button" variant="outline" onClick={handleResetInviteDialog}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isCreatingInvite}>
                      {isCreatingInvite ? "Creating..." : "Create Invite"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewFilename}</DialogTitle>
            <DialogDescription>Document preview</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] p-4 bg-muted rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-mono">{previewContent}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
